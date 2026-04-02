export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: '인벤토리 서비스 API',
    description: '자원, 장비, 자산 관리 CRUD',
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:8004', description: '로컬 개발' }],
  paths: {
    '/api/inventory/items': {
      get: {
        summary: '아이템 목록 조회',
        tags: ['인벤토리'],
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['reagent', 'sample', 'equipment', 'consumable'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['available', 'in_use', 'depleted', 'expired'] } },
        ],
        responses: {
          '200': {
            description: '아이템 배열',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          type: { type: 'string' },
                          status: { type: 'string' },
                          quantity: { type: 'number' },
                          unit: { type: 'string' },
                          location: { type: 'string' },
                          barcode: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: { summary: '아이템 등록', tags: ['인벤토리'], responses: { '201': { description: '등록 완료' } } },
    },
    '/api/inventory/items/{id}': {
      get: { summary: '아이템 상세', tags: ['인벤토리'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '아이템 상세' } } },
      put: { summary: '아이템 수정', tags: ['인벤토리'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '수정 완료' } } },
      delete: { summary: '아이템 삭제', tags: ['인벤토리'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '삭제 완료' } } },
    },
  },
};
