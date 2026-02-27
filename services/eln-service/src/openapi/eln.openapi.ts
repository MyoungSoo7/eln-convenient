export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'ELN 서비스 API',
    description: '연구노트 CRUD, 리비전 관리, 템플릿, 첨부파일, 링크',
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:8002', description: '로컬 개발' }],
  paths: {
    '/api/notes': {
      get: {
        summary: '노트 목록 조회',
        tags: ['노트'],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'in_review', 'signed', 'locked'] } },
          { name: 'tag', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: '노트 배열' } },
      },
      post: {
        summary: '노트 생성',
        tags: ['노트'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string' },
                  templateId: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: { '201': { description: '노트 생성 완료' } },
      },
    },
    '/api/notes/{id}': {
      get: { summary: '노트 상세 조회', tags: ['노트'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '노트 상세' } } },
      put: { summary: '노트 수정', tags: ['노트'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '수정 완료' } } },
      delete: { summary: '노트 삭제', tags: ['노트'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '삭제 완료' } } },
    },
    '/api/notes/{id}/revisions': {
      get: { summary: '리비전 목록', tags: ['리비전'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '리비전 배열' } } },
    },
    '/api/notes/{id}/attachments': {
      post: { summary: '첨부파일 추가', tags: ['첨부'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: '첨부 완료' } } },
    },
    '/api/notes/{id}/links': {
      get: { summary: '링크 목록', tags: ['링크'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '링크 배열' } } },
      post: { summary: '링크 추가', tags: ['링크'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: '링크 추가 완료' } } },
    },
    '/api/templates': {
      get: { summary: '템플릿 목록', tags: ['템플릿'], responses: { '200': { description: '템플릿 배열' } } },
      post: { summary: '템플릿 생성', tags: ['템플릿'], responses: { '201': { description: '생성 완료' } } },
    },
    '/api/templates/{id}': {
      get: { summary: '템플릿 상세', tags: ['템플릿'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '템플릿 상세' } } },
    },
    '/api/templates/recommend': {
      post: { summary: '템플릿 추천', tags: ['템플릿'], responses: { '200': { description: '추천 결과' } } },
    },
  },
};
