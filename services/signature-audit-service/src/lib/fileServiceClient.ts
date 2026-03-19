/**
 * file-service 내부 API 클라이언트
 * MinIO 직접 접근 대신 file-service를 통해 파일을 저장/조회한다.
 */

const FILE_SERVICE_URL = process.env.FILE_SERVICE_URL || 'http://file-service:8008';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

/**
 * 내보내기 결과 파일을 file-service에 업로드
 * POST /api/exports/internal/upload (multipart/form-data)
 */
export async function uploadExportFile(params: {
  jobId: string;
  format: string;
  buffer: Buffer;
  contentType: string;
  filename: string;
  requestedBy: string;
}): Promise<{ fileId: string; downloadUrl: string }> {
  const { jobId, format, buffer, contentType, filename, requestedBy } = params;

  // Node.js 내장 FormData (18+) 또는 폴리필
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(buffer)], { type: contentType }), filename);
  formData.append('jobId', jobId);
  formData.append('format', format);
  formData.append('source', 'signature-audit-service');

  const res = await fetch(`${FILE_SERVICE_URL}/api/exports/internal/upload`, {
    method: 'POST',
    headers: {
      'x-internal-secret': INTERNAL_SECRET,
      'x-user-id': requestedBy,
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`file-service upload 실패 (${res.status}): ${body}`);
  }

  const json = await res.json() as { ok: boolean; data: { fileId: string; downloadUrl: string } };
  if (!json.ok) throw new Error('file-service upload 응답 오류');
  return json.data;
}

/**
 * file-service에서 presigned URL 재발급
 * GET /api/exports/internal/presigned/:fileId
 */
export async function getExportPresignedUrl(fileId: string): Promise<string> {
  const res = await fetch(`${FILE_SERVICE_URL}/api/exports/internal/presigned/${fileId}`, {
    headers: { 'x-internal-secret': INTERNAL_SECRET },
  });

  if (!res.ok) {
    throw new Error(`file-service presigned 조회 실패 (${res.status})`);
  }

  const json = await res.json() as { ok: boolean; data: { url: string } };
  if (!json.ok) throw new Error('file-service presigned 응답 오류');
  return json.data.url;
}
