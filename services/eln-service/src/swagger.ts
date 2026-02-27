export const swaggerDocument = {
  openapi: '3.0.3',
  info: { title: 'ELN Service API', description: '연구노트, 프로토콜, 템플릿 핵심 서비스', version: '1.0.0' },
  servers: [{ url: 'http://localhost:8002', description: '로컬 개발' }],
  paths: {
    '/api/notes': {
      get: { summary: '노트 목록 조회', tags: ['노트'], parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'tag', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: '노트 배열' } } },
      post: { summary: '노트 생성', tags: ['노트'], responses: { '201': { description: '생성된 노트' } } },
    },
    '/api/notes/{id}': {
      get: { summary: '노트 상세', tags: ['노트'], responses: { '200': { description: '노트 객체' } } },
      put: { summary: '노트 수정', tags: ['노트'], responses: { '200': { description: '수정된 노트' } } },
      delete: { summary: '노트 삭제', tags: ['노트'], responses: { '200': { description: '삭제 완료' } } },
    },
    '/api/notes/{id}/revisions': { get: { summary: '리비전 목록', tags: ['리비전'], responses: { '200': { description: '리비전 배열' } } } },
    '/api/notes/{id}/attachments': { post: { summary: '첨부파일 등록', tags: ['첨부'], responses: { '201': { description: '첨부 메타' } } } },
    '/api/notes/{id}/links': {
      get: { summary: '연결 목록', tags: ['링크'], responses: { '200': { description: '링크 배열' } } },
      post: { summary: '링크 생성', tags: ['링크'], responses: { '201': { description: '생성된 링크' } } },
    },
    '/api/templates': {
      get: { summary: '템플릿 목록', tags: ['템플릿'], responses: { '200': { description: '템플릿 배열' } } },
      post: { summary: '템플릿 생성', tags: ['템플릿'], responses: { '201': { description: '생성된 템플릿' } } },
    },
    '/api/templates/{id}': { get: { summary: '템플릿 상세', tags: ['템플릿'], responses: { '200': { description: '템플릿 객체' } } } },
  },
};
