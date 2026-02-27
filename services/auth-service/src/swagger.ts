export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Auth Service API',
    description: '인증, 조직, 팀, 사용자, 역할/권한 관리 API',
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:8001', description: '로컬 개발' }],
  paths: {
    '/api/auth/login': {
      post: {
        summary: '로그인',
        tags: ['인증'],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' } }, required: ['email', 'password'] } } },
        },
        responses: { '200': { description: 'JWT 토큰 및 사용자 정보 반환' } },
      },
    },
    '/api/auth/me': { get: { summary: '현재 사용자 정보', tags: ['인증'], responses: { '200': { description: '사용자 정보' } } } },
    '/api/auth/orgs': {
      get: { summary: '조직 목록', tags: ['조직'], responses: { '200': { description: '조직 배열' } } },
      post: { summary: '조직 생성', tags: ['조직'], responses: { '201': { description: '생성된 조직' } } },
    },
    '/api/auth/teams': {
      get: { summary: '팀 목록', tags: ['팀'], responses: { '200': { description: '팀 배열' } } },
      post: { summary: '팀 생성', tags: ['팀'], responses: { '201': { description: '생성된 팀' } } },
    },
    '/api/auth/users': {
      get: { summary: '사용자 목록', tags: ['사용자'], responses: { '200': { description: '사용자 배열' } } },
      post: { summary: '사용자 생성', tags: ['사용자'], responses: { '201': { description: '생성된 사용자' } } },
    },
    '/api/auth/users/{id}': { put: { summary: '사용자 수정', tags: ['사용자'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '수정된 사용자' } } } },
    '/api/auth/roles': {
      get: { summary: '역할 목록', tags: ['역할'], responses: { '200': { description: '역할 배열' } } },
      post: { summary: '역할 생성', tags: ['역할'], responses: { '201': { description: '생성된 역할' } } },
    },
    '/api/auth/roles/{id}/permissions': { put: { summary: '역할 권한 수정', tags: ['역할'], responses: { '200': { description: '수정 완료' } } } },
  },
};
