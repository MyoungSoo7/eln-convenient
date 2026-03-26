import './tracing';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, createServer } from 'http';
import { verify } from 'jsonwebtoken';
import Redis from 'ioredis';

const PORT = parseInt(process.env.PORT || '8009');
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다. 서버를 시작할 수 없습니다.');
}
const JWT_SECRET = process.env.JWT_SECRET;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// ── 프로세스 레벨 에러 핸들러 ───────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[collab-service] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[collab-service] Uncaught Exception:', err);
  process.exit(1);
});

// 색상 팔레트 크기 (프론트엔드 COLLAB_COLORS 배열과 인덱스 동기화)
const COLOR_COUNT = 8;

interface CollabUser {
  id: string;
  name: string;
  colorIdx: number;
  ws: WebSocket;
  noteId: string;
}

// rooms: noteId → userId → CollabUser
const rooms = new Map<string, Map<string, CollabUser>>();

function getRoom(noteId: string): Map<string, CollabUser> {
  if (!rooms.has(noteId)) rooms.set(noteId, new Map());
  return rooms.get(noteId)!;
}

function assignColorIdx(room: Map<string, CollabUser>): number {
  const used = new Set([...room.values()].map((u) => u.colorIdx));
  for (let i = 0; i < COLOR_COUNT; i++) {
    if (!used.has(i)) return i;
  }
  return room.size % COLOR_COUNT;
}

function broadcast(noteId: string, message: object, excludeUserId?: string) {
  const room = getRoom(noteId);
  const data = JSON.stringify(message);
  for (const [userId, user] of room) {
    if (userId !== excludeUserId && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(data);
    }
  }
}

// ── Redis pub/sub (멀티 인스턴스 지원, 연결 실패 시 graceful 무시) ──
let pubClient: Redis | null = null;
let subClient: Redis | null = null;
try {
  pubClient = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  subClient = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  pubClient.on('error', (err) => { console.error('[collab] Redis pub error:', err.message); });
  subClient.on('error', (err) => { console.error('[collab] Redis sub error:', err.message); });

  subClient.subscribe('labnote:collab', (err) => {
    if (err) {
      console.error('[collab] Redis subscribe failed:', err.message);
      subClient = null; pubClient = null;
    }
  });

  subClient.on('message', (_channel, data) => {
    try {
      const { noteId, payload, sourceUserId } = JSON.parse(data);
      if (noteId) broadcast(noteId, payload, sourceUserId);
    } catch (err) {
      console.error('[collab] Redis message parse error:', err);
    }
  });
} catch {
  pubClient = null;
  subClient = null;
}

function publishToRedis(noteId: string, payload: object, sourceUserId: string) {
  if (!pubClient) return;
  try {
    pubClient.publish('labnote:collab', JSON.stringify({ noteId, payload, sourceUserId }));
  } catch (err) {
    console.error('[collab] Redis publish error:', err);
  }
}

// ── HTTP 서버 (healthcheck + WebSocket upgrade) ──
const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req: IncomingMessage, socket, head) => {
  const url = new URL(req.url ?? '/', `http://localhost`);
  const token = url.searchParams.get('token') ?? '';
  const noteIdMatch = url.pathname.match(/^\/collab\/notes\/([^/]+)$/);

  if (!noteIdMatch) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  const noteId = noteIdMatch[1];

  let jwtPayload: Record<string, unknown>;
  try {
    jwtPayload = verify(token, JWT_SECRET) as Record<string, unknown>;
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, noteId, jwtPayload);
  });
});

// ── WebSocket 연결 처리 ──
wss.on('connection', (
  ws: WebSocket,
  _req: IncomingMessage,
  noteId: string,
  payload: Record<string, unknown>,
) => {
  const userId = String(payload.sub ?? payload.id ?? '');
  const userName = String((payload as any).name ?? payload.email ?? userId);
  const room = getRoom(noteId);
  const colorIdx = assignColorIdx(room);

  const user: CollabUser = { id: userId, name: userName, colorIdx, ws, noteId };
  room.set(userId, user);

  // 신규 사용자에게 현재 참여자 목록 전송
  ws.send(JSON.stringify({
    type: 'joined',
    users: [...room.values()]
      .filter((u) => u.id !== userId)
      .map((u) => ({ id: u.id, name: u.name, colorIdx: u.colorIdx })),
  }));

  // 다른 참여자들에게 입장 알림
  const joinMsg = { type: 'user-joined', userId, userName, colorIdx };
  broadcast(noteId, joinMsg, userId);
  publishToRedis(noteId, joinMsg, userId);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));

      if (msg.type === 'content-update') {
        const outgoing = { type: 'content-update', userId, userName, colorIdx, content: msg.content };
        broadcast(noteId, outgoing, userId);
        publishToRedis(noteId, outgoing, userId);

      } else if (msg.type === 'awareness') {
        const outgoing = { type: 'awareness', userId, userName, colorIdx, cursorLine: msg.cursorLine };
        broadcast(noteId, outgoing, userId);
        publishToRedis(noteId, outgoing, userId);
      }
    } catch (err) {
      console.error('[collab] Message parse error:', err);
    }
  });

  ws.on('close', () => {
    room.delete(userId);
    if (room.size === 0) rooms.delete(noteId);
    const leaveMsg = { type: 'user-left', userId, userName };
    broadcast(noteId, leaveMsg);
    publishToRedis(noteId, leaveMsg, userId);
    console.log(`[collab] ${userName} left note ${noteId} (room size: ${room.size})`);
  });

  ws.on('error', (err) => {
    console.error(`[collab] WebSocket error for ${userName}:`, err.message);
  });

  console.log(`[collab] ${userName} joined note ${noteId} (room size: ${room.size})`);
});

server.listen(PORT, () => {
  console.log(`[collab-service] WebSocket 서버 시작 :${PORT}`);
  console.log(`[collab-service] Redis: ${pubClient ? '연결됨' : '미연결 (단일 인스턴스 모드)'}`);
});
