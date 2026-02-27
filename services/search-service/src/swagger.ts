export const swaggerDocument = {
  openapi: '3.0.3',
  info: { title: 'Search Service API', description: '통합검색 (노트/프로토콜/인벤토리)', version: '1.0.0' },
  servers: [{ url: 'http://localhost:8006', description: '로컬 개발' }],
  paths: {
    '/api/search': { get: { summary: '통합검색', tags: ['검색'], parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }, { name: 'type', in: 'query', schema: { type: 'string', description: 'note,protocol,inventory (콤마 구분)' } }, { name: 'page', in: 'query', schema: { type: 'integer' } }, { name: 'size', in: 'query', schema: { type: 'integer' } }], responses: { '200': { description: '검색 결과' } } } },
    '/api/search/suggest': { get: { summary: '자동완성 제안', tags: ['검색'], parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: '제안 목록' } } } },
  },
};
