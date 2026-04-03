export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'AI 어시스턴트 서비스 API',
    description: '템플릿 추천, 초안 생성, 벡터 인덱싱, RAG 질의응답',
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:8007', description: '로컬 개발' }],
  paths: {
    '/api/ai/recommend-template': {
      post: {
        summary: '템플릿 추천',
        tags: ['AI'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['topic'],
                properties: {
                  topic: { type: 'string', example: 'PCR 증폭 실험' },
                  keywords: { type: 'array', items: { type: 'string' } },
                  limit: { type: 'number', default: 3 },
                },
              },
            },
          },
        },
        responses: { '200': { description: '추천 템플릿 목록' } },
      },
    },
    '/api/ai/draft': {
      post: {
        summary: '초안 생성',
        tags: ['AI'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['templateId', 'topic'],
                properties: {
                  templateId: { type: 'string' },
                  topic: { type: 'string' },
                  context: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: '생성된 초안' } },
      },
    },
    '/api/ai/index': {
      post: { summary: '문서 벡터 인덱싱 요청', tags: ['인덱싱'], responses: { '202': { description: '인덱싱 작업 생성' } } },
    },
    '/api/ai/ask': {
      post: {
        summary: 'RAG 질의응답',
        tags: ['AI'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['question'],
                properties: {
                  question: { type: 'string', example: 'PCR 어닐링 온도는 어떻게 설정하나요?' },
                  context: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: '답변 및 출처' } },
      },
    },
    '/api/ai/index-status': {
      get: { summary: '인덱싱 상태 조회', tags: ['인덱싱'], responses: { '200': { description: '인덱싱 현황' } } },
    },
  },
};
