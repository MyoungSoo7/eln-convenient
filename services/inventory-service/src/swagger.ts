export const swaggerDocument = {
  openapi: '3.0.3',
  info: { title: 'Inventory Service API', description: '시약/샘플/장비/자산 인벤토리 관리', version: '1.0.0' },
  servers: [{ url: 'http://localhost:8004', description: '로컬 개발' }],
  paths: {
    '/api/inventory/items': {
      get: { summary: '아이템 목록', tags: ['인벤토리'], parameters: [{ name: 'type', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: '아이템 배열' } } },
      post: { summary: '아이템 생성', tags: ['인벤토리'], responses: { '201': { description: '생성된 아이템' } } },
    },
    '/api/inventory/items/{id}': {
      get: { summary: '아이템 상세', tags: ['인벤토리'], responses: { '200': { description: '아이템 객체' } } },
      put: { summary: '아이템 수정', tags: ['인벤토리'], responses: { '200': { description: '수정된 아이템' } } },
      delete: { summary: '아이템 삭제', tags: ['인벤토리'], responses: { '200': { description: '삭제 완료' } } },
    },
    '/api/inventory/categories': { get: { summary: '카테고리 목록', tags: ['인벤토리'], responses: { '200': { description: '카테고리 배열' } } } },
  },
};
