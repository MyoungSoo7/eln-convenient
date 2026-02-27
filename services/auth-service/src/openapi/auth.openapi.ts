export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: '인증 서비스 API',
    description: '사용자 인증, 조직/팀 관리, RBAC 역할 관리',
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:8001', description: '로컬 개발' }],
  paths: {
    '/api/auth/login': {
      post: {
        summary: '로그인',
        tags: ['인증'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'researcher@lab.com' },
                  password: { type: 'string', example: 'password123' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: '로그인 성공',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        token: { type: 'string' },
                        userId: { type: 'string' },
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
    '/api/auth/register': {
      post: {
        summary: '회원가입',
        tags: ['인증'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                  orgId: { type: 'string' },
                  teamId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: '가입 완료' } },
      },
    },
    '/api/auth/me': {
      get: { summary: '현재 사용자 정보', tags: ['인증'], responses: { '200': { description: '사용자 정보' } } },
    },
    '/api/auth/orgs': {
      get: { summary: '조직 목록', tags: ['조직'], responses: { '200': { description: '조직 배열' } } },
      post: { summary: '조직 생성', tags: ['조직'], responses: { '201': { description: '조직 생성 완료' } } },
    },
    '/api/auth/teams': {
      get: { summary: '팀 목록', tags: ['팀'], responses: { '200': { description: '팀 배열' } } },
      post: { summary: '팀 생성', tags: ['팀'], responses: { '201': { description: '팀 생성 완료' } } },
    },
    '/api/auth/users': {
      get: { summary: '사용자 목록', tags: ['사용자'], responses: { '200': { description: '사용자 배열' } } },
    },
    '/api/auth/roles': {
      get: { summary: '역할 목록', tags: ['역할'], responses: { '200': { description: '역할 배열' } } },
      post: { summary: '역할 생성', tags: ['역할'], responses: { '201': { description: '역할 생성 완료' } } },
    },
  },
};
