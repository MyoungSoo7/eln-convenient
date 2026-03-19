// services/file-service/src/lib/elnClient.ts
import http from 'http';

const ELN_SERVICE_URL = process.env.ELN_SERVICE_URL || 'http://eln-service:8002';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
const TIMEOUT_MS = 8000;

export interface NoteExportData {
  id: string;
  title: string;
  content: string;         // Markdown or HTML
  sections: unknown[];
  status: string;
  authorId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteListItem {
  id: string;
  title: string;
  status: string;
  authorId: string;
}

function request<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, ELN_SERVICE_URL);
    const options = {
      hostname: url.hostname,
      port: parseInt(url.port || '8002'),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'x-internal-secret': INTERNAL_SECRET,
        'Accept': 'application/json; charset=utf-8',
      },
      timeout: TIMEOUT_MS,
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        // 404 check before JSON parse (proxy may return plain text 404)
        if (res.statusCode === 404) {
          reject(new Error(`노트를 찾을 수 없습니다: ${path}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok) {
            reject(new Error(parsed.error || 'eln-service 오류'));
            return;
          }
          resolve(parsed.data as T);
        } catch {
          reject(new Error('eln-service 응답 파싱 실패'));
        }
      });
    });
    // Node.js의 timeout 이벤트는 소켓을 자동으로 닫지 않는다. req.destroy()를 명시적으로 호출해야 커넥션이 정리된다.
    req.on('timeout', () => { req.destroy(); reject(new Error('eln-service 응답 시간 초과')); });
    req.on('error', (err) => reject(new Error(`eln-service 연결 실패: ${err.message}`)));
    req.end();
  });
}

/** 단일 노트 데이터 조회 (export용) */
export async function getNoteForExport(noteId: string): Promise<NoteExportData> {
  return request<NoteExportData>(`/api/notes/${noteId}`);
}

/** 전체 노트 목록 (ZIP 전체 내보내기용, 서명된 노트만) */
export async function getSignedNotes(): Promise<NoteListItem[]> {
  return request<NoteListItem[]>(`/api/notes?status=signed&limit=1000`);
}

/** 프로젝트(태그) 기준 노트 목록 */
export async function getNotesByTag(tag: string): Promise<NoteListItem[]> {
  return request<NoteListItem[]>(`/api/notes?tag=${encodeURIComponent(tag)}&status=signed&limit=1000`);
}
