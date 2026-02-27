export const swaggerDocument = {
  openapi: '3.0.3',
  info: { title: 'Scheduler Service API', description: '장비/회의실 예약 관리', version: '1.0.0' },
  servers: [{ url: 'http://localhost:8005', description: '로컬 개발' }],
  paths: {
    '/api/scheduler/resources': { get: { summary: '자원 목록', tags: ['자원'], responses: { '200': { description: '자원 배열' } } } },
    '/api/scheduler/bookings': {
      get: { summary: '예약 목록', tags: ['예약'], responses: { '200': { description: '예약 배열' } } },
      post: { summary: '예약 생성', tags: ['예약'], responses: { '201': { description: '생성된 예약' } } },
    },
    '/api/scheduler/bookings/{id}': {
      put: { summary: '예약 수정', tags: ['예약'], responses: { '200': { description: '수정된 예약' } } },
      delete: { summary: '예약 취소', tags: ['예약'], responses: { '200': { description: '취소 완료' } } },
    },
    '/api/scheduler/bookings/{id}/approve': { put: { summary: '예약 승인', tags: ['예약'], responses: { '200': { description: '승인 완료' } } } },
    '/api/scheduler/bookings/{id}/reject': { put: { summary: '예약 거절', tags: ['예약'], responses: { '200': { description: '거절 완료' } } } },
  },
};
