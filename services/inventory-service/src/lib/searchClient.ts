import http from 'http';
import https from 'https';

const SEARCH_SERVICE_URL = process.env.SEARCH_SERVICE_URL || 'http://localhost:8006';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'dev-internal-secret';

interface IndexPayload {
  id: string;
  doc: Record<string, unknown>;
}

function postJSON(url: string, body: unknown): Promise<void> {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'x-internal-secret': INTERNAL_SECRET,
        },
      },
      (res) => {
        res.resume();
        resolve();
      },
    );
    req.on('error', (err) => {
      console.warn('[searchClient] 색인 실패 (무시):', err.message);
      resolve();
    });
    req.write(data);
    req.end();
  });
}

function deleteDoc(id: string): Promise<void> {
  return new Promise((resolve) => {
    const parsed = new URL(`${SEARCH_SERVICE_URL}/api/search/index/${id}`);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname,
        method: 'DELETE',
        headers: { 'x-internal-secret': INTERNAL_SECRET },
      },
      (res) => { res.resume(); resolve(); },
    );
    req.on('error', (err) => {
      console.warn('[searchClient] 삭제 실패 (무시):', err.message);
      resolve();
    });
    req.end();
  });
}

export const searchClient = {
  index(payload: IndexPayload): void {
    postJSON(`${SEARCH_SERVICE_URL}/api/search/index`, payload)
      .catch((err) => console.warn('[searchClient] index 실패:', err));
  },
  delete(id: string): void {
    deleteDoc(id)
      .catch((err) => console.warn('[searchClient] delete 실패:', err));
  },
};
