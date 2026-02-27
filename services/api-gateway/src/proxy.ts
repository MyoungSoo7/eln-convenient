import { Express } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

// 서비스 라우팅 맵
const SERVICE_MAP: Record<string, string> = {
  '/api/auth':       process.env.AUTH_SERVICE_URL       || 'http://auth-service:8001',
  '/api/notes':      process.env.ELN_SERVICE_URL        || 'http://eln-service:8002',
  '/api/templates':  process.env.ELN_SERVICE_URL        || 'http://eln-service:8002',
  '/api/signatures': process.env.SIGNATURE_SERVICE_URL  || 'http://signature-audit-service:8003',
  '/api/audit':      process.env.SIGNATURE_SERVICE_URL  || 'http://signature-audit-service:8003',
  '/api/export':     process.env.SIGNATURE_SERVICE_URL  || 'http://signature-audit-service:8003',
  '/api/inventory':  process.env.INVENTORY_SERVICE_URL  || 'http://inventory-service:8004',
  '/api/scheduler':  process.env.SCHEDULER_SERVICE_URL  || 'http://scheduler-service:8005',
  '/api/search':     process.env.SEARCH_SERVICE_URL     || 'http://search-service:8006',
  '/api/ai':         process.env.AI_SERVICE_URL         || 'http://ai-assistant-service:8007',
  '/api/files':      process.env.FILE_SERVICE_URL       || 'http://file-service:8008',
};

export function setupProxy(app: Express): void {
  for (const [path, target] of Object.entries(SERVICE_MAP)) {
    app.use(
      path,
      createProxyMiddleware({
        target,
        changeOrigin: true,
        pathRewrite: { [`^${path}`]: path },
        onError: (err, _req, res: any) => {
          console.error(`[프록시 오류] ${path} → ${target}:`, err.message);
          res.status(502).json({ error: `서비스 연결 실패: ${path}` });
        },
      })
    );
  }
  console.log('[api-gateway] 프록시 라우팅 설정 완료:', Object.keys(SERVICE_MAP));
}
