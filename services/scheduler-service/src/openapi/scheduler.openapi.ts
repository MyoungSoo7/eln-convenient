export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: '스케줄러 서비스 API',
    description: '장비/회의실 예약, 승인 흐름 관리',
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:8005', description: '로컬 개발' }],
  paths: {
    '/api/scheduler/resources': {
      get: { summary: '자원 목록 조회', tags: ['자원'], responses: { '200': { description: '자원 배열' } } },
    },
    '/api/scheduler/bookings': {
      get: {
        summary: '예약 목록 조회',
        tags: ['예약'],
        parameters: [{ name: 'resourceId', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: '예약 배열' } },
      },
      post: { summary: '예약 생성', tags: ['예약'], responses: { '201': { description: '예약 생성 완료' } } },
    },
    '/api/scheduler/bookings/{id}': {
      put: { summary: '예약 수정', tags: ['예약'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '수정 완료' } } },
      delete: { summary: '예약 취소', tags: ['예약'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '취소 완료' } } },
    },
    '/api/scheduler/bookings/{id}/approve': {
      post: { summary: '예약 승인', tags: ['승인'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '승인 완료' } } },
    },
    '/api/scheduler/bookings/{id}/reject': {
      post: { summary: '예약 거절', tags: ['승인'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '거절 완료' } } },
    },
  },
};
