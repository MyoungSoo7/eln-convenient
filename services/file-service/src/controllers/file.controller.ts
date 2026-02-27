import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { IFileMeta } from '../interfaces/file.interface';

/** POST /api/files — 파일 업로드 (더미) */
export function uploadFile(req: Request, res: Response): void {
  // TODO: MinIO에 실제 파일 저장
  const file = (req as any).file;
  const meta: IFileMeta = {
    id: uuidv4(),
    originalName: file?.originalname || 'unknown.dat',
    mimeType: file?.mimetype || 'application/octet-stream',
    sizeBytes: file?.size || 0,
    storagePath: `labnote-bucket/${uuidv4()}`,
    uploadedBy: req.headers['x-user-id'] as string || 'dev-user-001',
    createdAt: new Date().toISOString(),
  };
  console.log(`[file-service] 파일 업로드 (더미): ${meta.originalName}`);
  res.status(201).json(meta);
}

/** GET /api/files/:id — 파일 다운로드 (더미) */
export function downloadFile(req: Request, res: Response): void {
  // TODO: MinIO에서 파일 스트리밍
  res.json({
    id: req.params.id,
    message: '파일 다운로드 (구현 TODO — MinIO 연동 필요)',
    downloadUrl: `http://minio:9000/labnote-bucket/${req.params.id}`,
  });
}

/** DELETE /api/files/:id — 파일 삭제 (더미) */
export function deleteFile(req: Request, res: Response): void {
  // TODO: MinIO에서 파일 삭제
  res.json({ id: req.params.id, message: '파일이 삭제되었습니다.' });
}

/** GET /api/files/:id/meta — 파일 메타데이터 */
export function getFileMeta(req: Request, res: Response): void {
  const meta: IFileMeta = {
    id: req.params.id,
    originalName: 'sample-data.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeBytes: 245760,
    storagePath: `labnote-bucket/${req.params.id}`,
    uploadedBy: 'dev-user-001',
    createdAt: '2024-01-15T09:00:00Z',
  };
  res.json(meta);
}
