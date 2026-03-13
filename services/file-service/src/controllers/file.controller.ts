import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { IFileMeta } from '../interfaces/file.interface';
import { uploadObject, getPresignedUrl, getObjectStream, deleteObject, headObject, BUCKET } from '../lib/minio';

/** POST /api/files — 파일 업로드 (MinIO) */
export async function uploadFile(req: Request, res: Response): Promise<void> {
  const file = (req as any).file;
  if (!file) {
    res.status(400).json({ error: '업로드된 파일이 없습니다.' });
    return;
  }

  const fileId = uuidv4();
  const ext = file.originalname.split('.').pop();
  const key = `${fileId}${ext ? '.' + ext : ''}`;

  try {
    await uploadObject(key, file.buffer, file.mimetype);
  } catch (err) {
    console.error('[file-service] MinIO 업로드 실패:', err);
    res.status(502).json({ error: 'MinIO 파일 업로드에 실패했습니다.' });
    return;
  }

  const meta: IFileMeta = {
    id: fileId,
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    storagePath: `${BUCKET}/${key}`,
    uploadedBy: req.headers['x-user-id'] as string || 'anonymous',
    createdAt: new Date().toISOString(),
  };

  console.log(`[file-service] 파일 업로드 완료: ${meta.originalName} → ${key}`);
  res.status(201).json(meta);
}

/** GET /api/files/:id — presigned URL로 리디렉트 */
export async function downloadFile(req: Request, res: Response): Promise<void> {
  const key = (req.query.key as string) || req.params.id;
  try {
    const url = await getPresignedUrl(key);
    res.redirect(url);
  } catch (err) {
    console.error('[file-service] presigned URL 생성 실패:', err);
    res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }
}

/** GET /api/files/:id/stream — 파일 스트리밍 */
export async function streamFile(req: Request, res: Response): Promise<void> {
  const key = (req.query.key as string) || req.params.id;
  try {
    const obj = await getObjectStream(key);
    if (obj.ContentType) res.setHeader('Content-Type', obj.ContentType);
    if (obj.ContentLength) res.setHeader('Content-Length', obj.ContentLength);
    res.setHeader('Content-Disposition', `attachment; filename="${key}"`);
    (obj.Body as any).pipe(res);
  } catch (err) {
    console.error('[file-service] 스트리밍 실패:', err);
    res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }
}

/** DELETE /api/files/:id — 파일 삭제 */
export async function deleteFile(req: Request, res: Response): Promise<void> {
  const key = (req.query.key as string) || req.params.id;
  try {
    await deleteObject(key);
    res.json({ id: req.params.id, message: '파일이 삭제되었습니다.' });
  } catch (err) {
    console.error('[file-service] MinIO 삭제 실패:', err);
    res.status(502).json({ error: '파일 삭제에 실패했습니다.' });
  }
}

/** GET /api/files/:id/meta — 파일 메타데이터 */
export async function getFileMeta(req: Request, res: Response): Promise<void> {
  const key = (req.query.key as string) || req.params.id;
  try {
    const head = await headObject(key);
    res.json({
      id: req.params.id,
      mimeType: head.ContentType,
      sizeBytes: head.ContentLength,
      storagePath: `${BUCKET}/${key}`,
      lastModified: head.LastModified?.toISOString(),
    });
  } catch (err) {
    console.error('[file-service] 메타 조회 실패:', err);
    res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }
}
