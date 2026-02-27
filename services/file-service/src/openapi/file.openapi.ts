export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: '파일 서비스 API',
    description: '파일 업로드/다운로드/메타데이터 관리 (MinIO 기반)',
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:8008', description: '로컬 개발' }],
  paths: {
    '/api/files': {
      post: {
        summary: '파일 업로드',
        tags: ['파일'],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                  linkedEntityType: { type: 'string', enum: ['note', 'protocol', 'inventory'] },
                  linkedEntityId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: '업로드 완료',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        fileId: { type: 'string' },
                        filename: { type: 'string' },
                        mimeType: { type: 'string' },
                        size: { type: 'number' },
                        url: { type: 'string' },
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
    '/api/files/{id}': {
      get: { summary: '파일 다운로드', tags: ['파일'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '파일 데이터' } } },
      delete: { summary: '파일 삭제', tags: ['파일'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '삭제 완료' } } },
    },
    '/api/files/{id}/metadata': {
      get: { summary: '파일 메타데이터 조회', tags: ['파일'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: '메타데이터' } } },
    },
  },
};
