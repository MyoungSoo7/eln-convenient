export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'ELN 서비스 API',
    description: '연구노트 CRUD, 상태 관리, 리비전, 템플릿, 첨부파일, 링크',
    version: '1.1.0',
  },
  servers: [{ url: 'http://localhost:8002', description: '로컬 개발' }],
  paths: {
    '/api/notes': {
      get: {
        summary: '노트 목록 조회',
        tags: ['노트'],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'in_progress', 'signed', 'locked'] }, description: '노트 상태 필터' },
          { name: 'tag', in: 'query', schema: { type: 'string' }, description: '태그 필터' },
        ],
        responses: { '200': { description: '노트 배열 반환' } },
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
                  title: { type: 'string', description: '노트 제목' },
                  templateId: { type: 'string', description: '사용할 템플릿 ID' },
                  tags: { type: 'array', items: { type: 'string' }, description: '태그 목록' },
                },
              },
            },
          },
        },
        responses: { '201': { description: '노트 생성 완료 (초안 상태)' } },
      },
    },
    '/api/notes/{id}': {
      get: { summary: '노트 상세 조회', tags: ['노트'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '노트 상세' } } },
      put: {
        summary: '노트 수정',
        description: '잠긴 상태(locked)의 노트는 수정할 수 없습니다 (403 반환).',
        tags: ['노트'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: '수정 완료' },
          '403': { description: '잠긴 노트 수정 불가' },
        },
      },
      delete: {
        summary: '노트 삭제 (소프트 삭제)',
        description: '`deletedAt` 타임스탬프를 설정합니다 (물리 삭제 아님). draft/in_progress 상태만 삭제 가능. locked·signed 상태는 403 반환.',
        tags: ['노트'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: '소프트 삭제 완료 (deletedAt 설정)' },
          '403': { description: 'locked 또는 signed 노트 삭제 불가 / 권한 없음' },
        },
      },
    },
    '/api/notes/{id}/status': {
      patch: {
        summary: '노트 상태 변경',
        description: [
          '허용 전환 (일반 사용자): draft↔in_progress, in_progress→locked.',
          '허용 전환 (서명 서비스 내부): in_progress→signed.',
          '잠긴(locked)/서명된(signed) 노트는 이 엔드포인트로 상태 변경 불가.',
        ].join(' '),
        tags: ['노트', '상태관리'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'string',
                    enum: ['draft', 'in_progress', 'signed', 'locked'],
                    description: '변경할 상태. signed는 서명 서비스 전용.',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '상태 변경 완료' },
          '400': { description: '허용되지 않은 상태 전환' },
          '404': { description: '노트를 찾을 수 없음' },
        },
      },
    },
    '/api/notes/{id}/admin-unlock': {
      post: {
        summary: '관리자 잠금 해제',
        description: '관리자 권한으로 잠긴 노트를 초안 상태로 해제합니다. 감사로그에 기록됩니다.',
        tags: ['노트', '상태관리', '관리자'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['adminPassword'],
                properties: {
                  adminPassword: { type: 'string', description: '관리자 비밀번호' },
                  reason: { type: 'string', description: '해제 사유 (선택)' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '잠금 해제 완료 — 감사로그 기록됨' },
          '400': { description: '잠긴 상태가 아님 / 비밀번호 미입력' },
          '403': { description: '관리자 권한 없음' },
          '404': { description: '노트를 찾을 수 없음' },
        },
      },
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
