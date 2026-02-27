export const swaggerDocument = {
  openapi: '3.0.3',
  info: { title: 'File Service API', description: '파일 업로드/다운로드 (MinIO 연동)', version: '1.0.0' },
  servers: [{ url: 'http://localhost:8008', description: '로컬 개발' }],
  paths: {
    '/api/files': { post: { summary: '파일 업로드', tags: ['파일'], requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } }, responses: { '201': { description: '업로드된 파일 메타' } } } },
    '/api/files/{id}': {
      get: { summary: '파일 다운로드', tags: ['파일'], responses: { '200': { description: '파일 스트림' } } },
      delete: { summary: '파일 삭제', tags: ['파일'], responses: { '200': { description: '삭제 완료' } } },
    },
    '/api/files/{id}/meta': { get: { summary: '파일 메타데이터', tags: ['파일'], responses: { '200': { description: '메타데이터 객체' } } } },
  },
};
