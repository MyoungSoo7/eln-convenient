export const swaggerDocument = {
  openapi: '3.0.3',
  info: { title: 'Signature & Audit Service API', description: '전자서명, 감사로그, 시점인증, PDF/ZIP 내보내기', version: '1.0.0' },
  servers: [{ url: 'http://localhost:8003', description: '로컬 개발' }],
  paths: {
    '/api/signatures/sign/{noteId}': { post: { summary: '전자서명 요청', tags: ['서명'], responses: { '201': { description: '서명 완료' } } } },
    '/api/signatures/verify/{noteId}': { get: { summary: '서명 검증', tags: ['서명'], responses: { '200': { description: '검증 결과' } } } },
    '/api/audit': { get: { summary: '감사로그 조회', tags: ['감사로그'], parameters: [{ name: 'entityId', in: 'query', schema: { type: 'string' } }, { name: 'type', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: '로그 배열' } } } },
    '/api/export/pdf/{noteId}': { post: { summary: 'PDF 내보내기 요청', tags: ['내보내기'], responses: { '202': { description: '작업 생성' } } } },
    '/api/export/status/{jobId}': { get: { summary: '내보내기 상태 조회', tags: ['내보내기'], responses: { '200': { description: '작업 상태' } } } },
    '/api/export/zip': { post: { summary: 'ZIP 다건 내보내기', tags: ['내보내기'], responses: { '202': { description: '작업 생성' } } } },
  },
};
