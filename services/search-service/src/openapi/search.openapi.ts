export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: '검색 서비스 API',
    description: '통합 검색 (노트/템플릿/인벤토리)',
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:8006', description: '로컬 개발' }],
  paths: {
    '/api/search': {
      get: {
        summary: '통합 검색',
        tags: ['검색'],
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: '검색 키워드' },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['note', 'template', 'inventory'] }, description: '결과 타입 필터' },
        ],
        responses: {
          '200': {
            description: '검색 결과',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        notes: { type: 'array', items: { $ref: '#/components/schemas/SearchResult' } },
                        protocols: { type: 'array', items: { $ref: '#/components/schemas/SearchResult' } },
                        inventory: { type: 'array', items: { $ref: '#/components/schemas/SearchResult' } },
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
    '/api/search/suggestions': {
      get: {
        summary: '검색어 자동완성',
        tags: ['검색'],
        parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: '추천 검색어 배열' } },
      },
    },
  },
  components: {
    schemas: {
      SearchResult: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          snippet: { type: 'string' },
          type: { type: 'string' },
          score: { type: 'number' },
        },
      },
    },
  },
};
