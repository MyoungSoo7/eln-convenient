export const swaggerDocument = {
  openapi: '3.0.3',
  info: { title: 'AI Assistant Service API', description: '템플릿 추천, 초안 생성, 벡터 인덱싱, RAG 질의', version: '1.0.0' },
  servers: [{ url: 'http://localhost:8007', description: '로컬 개발' }],
  paths: {
    '/api/ai/recommend-template': { post: { summary: '템플릿 추천 (Top 3)', tags: ['AI'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { topic: { type: 'string' }, context: { type: 'string' } }, required: ['topic'] } } } }, responses: { '200': { description: '추천 결과' } } } },
    '/api/ai/draft': { post: { summary: '초안 생성', tags: ['AI'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { templateId: { type: 'string' }, topic: { type: 'string' } }, required: ['templateId', 'topic'] } } } }, responses: { '200': { description: '생성된 초안' } } } },
    '/api/ai/index': { post: { summary: '문서 벡터 인덱싱', tags: ['인덱싱'], responses: { '202': { description: '대기열 추가' } } } },
    '/api/ai/ask': { post: { summary: 'RAG 질의', tags: ['AI'], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] } } } }, responses: { '200': { description: '답변 및 출처' } } } },
    '/api/ai/index/status': { get: { summary: '인덱싱 상태 조회', tags: ['인덱싱'], responses: { '200': { description: '인덱싱 상태' } } } },
  },
};
