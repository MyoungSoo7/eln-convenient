import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AppError, asyncHandler, ErrorCode, createLogger } from '@lab/shared';
import prisma from '../lib/prisma';
import {
  uploadObject, getPresignedUrl, getPresignedUploadUrl,
  getObjectStream, deleteObject, headObject,
  findKeyByPrefix, BUCKET,
} from '../lib/minio';

const logger = createLogger('file-service');

// 허용 MIME 타입 목록 (보안 차단)
const BLOCKED_MIME = new Set([
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sh',
  'text/x-sh',
  'application/x-bat',
]);

/**
 * UUID로 MinIO key 조회 (upload 시 key = {uuid}.{ext})
 * ?key= 파라미터가 있으면 바로 사용, 없으면 prefix 탐색
 */
async function resolveKey(id: string, queryKey?: string): Promise<string | null> {
  if (queryKey) return queryKey;
  return findKeyByPrefix(id);
}

// ─────────────────────────────────────────────
// 업로드
// ─────────────────────────────────────────────

/** POST /api/files — multer 직접 업로드 */
export const uploadFile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    throw new AppError(400, '업로드된 파일이 없습니다.', ErrorCode.FILE_NO_FILE);
  }

  // multer는 originalname을 latin1로 디코딩하므로 UTF-8로 복원
  file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

  // MIME 타입 차단
  if (BLOCKED_MIME.has(file.mimetype)) {
    throw new AppError(400, `허용되지 않는 파일 형식입니다: ${file.mimetype}`, ErrorCode.FILE_BLOCKED_MIME);
  }

  const fileId = uuidv4();
  const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : '';
  const key = `${fileId}${ext ? '.' + ext : ''}`;

  const linkedEntityType = req.body.linkedEntityType || null;
  const linkedEntityId = req.body.linkedEntityId || null;
  const uploadedBy = (req.headers['x-user-id'] as string) || 'anonymous';

  // MinIO Metadata에 원본 파일명 / 업로더 / linkedEntity 저장
  const minioMeta: Record<string, string> = {
    originalname: encodeURIComponent(file.originalname),
    uploadedby: uploadedBy,
    ...(linkedEntityType && { linkedentitytype: linkedEntityType }),
    ...(linkedEntityId && { linkedentityid: linkedEntityId }),
  };

  try {
    await uploadObject(key, file.buffer, file.mimetype, minioMeta);
  } catch (err) {
    logger.error({ err, key }, 'MinIO 업로드 실패');
    throw new AppError(502, 'MinIO 파일 업로드에 실패했습니다.', ErrorCode.FILE_UPLOAD_FAILED);
  }

  // MinIO 업로드 성공 → DB 저장
  let dbFile: { id: string } | null = null;
  try {
    dbFile = await prisma.file.create({
      data: {
        id: fileId,
        bucket: BUCKET,
        objectKey: key,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        uploaderId: uploadedBy,
        refType: linkedEntityType,
        refId: linkedEntityId,
      },
      select: { id: true },
    });
  } catch (dbErr) {
    // DB 실패 → MinIO 롤백
    logger.error({ err: dbErr, key }, 'DB 저장 실패, MinIO 롤백');
    try { await deleteObject(key); } catch {}
    throw new AppError(500, '파일 메타데이터 저장에 실패했습니다.', ErrorCode.FILE_METADATA_FAILED);
  }

  logger.info({ originalName: file.originalname, key, dbId: dbFile.id }, '업로드 완료');
  res.status(201).json({
    ok: true,
    data: {
      id: fileId,
      key,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storagePath: `${BUCKET}/${key}`,
      uploadedBy,
      refType: linkedEntityType,
      refId: linkedEntityId,
      createdAt: new Date().toISOString(),
    },
  });
});

/** GET /api/files/presigned-upload — 클라이언트 직접 업로드용 presigned PUT URL */
export const getPresignedUpload = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { filename, contentType } = req.query;

  const mimeType = contentType as string;
  if (BLOCKED_MIME.has(mimeType)) {
    throw new AppError(400, `허용되지 않는 파일 형식입니다: ${mimeType}`, ErrorCode.FILE_BLOCKED_MIME);
  }

  const fileId = uuidv4();
  const fn = filename as string;
  const ext = fn.includes('.') ? fn.split('.').pop() : '';
  const key = `${fileId}${ext ? '.' + ext : ''}`;

  try {
    const uploadUrl = await getPresignedUploadUrl(key, mimeType, 900);
    const expiresAt = new Date(Date.now() + 900 * 1000).toISOString();
    res.json({ ok: true, data: { fileId, key, uploadUrl, expiresAt } });
  } catch (err) {
    logger.error({ err, key }, 'presigned upload URL 생성 실패');
    throw new AppError(502, 'presigned URL 생성에 실패했습니다.', ErrorCode.FILE_STORAGE_ERROR);
  }
});

// ─────────────────────────────────────────────
// 다운로드
// ─────────────────────────────────────────────

/** GET /api/files/:id — presigned URL로 리디렉트 */
export const downloadFile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const key = await resolveKey(req.params.id, req.query.key as string);
  if (!key) { throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND); }

  try {
    const url = await getPresignedUrl(key);
    res.redirect(url);
  } catch (err) {
    logger.error({ err, key }, 'presigned URL 생성 실패');
    throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND);
  }
});

/** GET /api/files/:id/url — presigned 다운로드 URL 반환 (리디렉트 없이) */
export const getDownloadUrl = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const key = await resolveKey(req.params.id, req.query.key as string);
  if (!key) { throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND); }

  try {
    const expiresIn = Number.parseInt(req.query.expiresIn as string) || 3600;
    const url = await getPresignedUrl(key, Math.min(expiresIn, 86400));
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    res.json({ ok: true, data: { key, url, expiresAt } });
  } catch (err) {
    logger.error({ err, key }, 'URL 생성 실패');
    throw new AppError(502, 'presigned URL 생성에 실패했습니다.', ErrorCode.FILE_STORAGE_ERROR);
  }
});

/** GET /api/files/:id/stream — 파일 스트리밍 */
export const streamFile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const key = await resolveKey(req.params.id, req.query.key as string);
  if (!key) { throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND); }

  try {
    const obj = await getObjectStream(key);
    if (obj.ContentType) res.setHeader('Content-Type', obj.ContentType);
    if (obj.ContentLength) res.setHeader('Content-Length', String(obj.ContentLength));

    // 원본 파일명을 Metadata에서 복원
    const originalName = obj.Metadata?.originalname
      ? decodeURIComponent(obj.Metadata.originalname)
      : key;
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);

    (obj.Body as NodeJS.ReadableStream).pipe(res);
  } catch (err) {
    logger.error({ err, key }, '스트리밍 실패');
    throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND);
  }
});

// ─────────────────────────────────────────────
// 메타 / 삭제
// ─────────────────────────────────────────────

/** GET /api/files/:id/meta — 파일 메타데이터 */
export const getFileMeta = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    // DB에서 먼저 조회
    const file = await prisma.file.findFirst({
      where: { id: req.params.id, isDeleted: false },
    });
    if (file) {
      res.json({
        ok: true,
        data: {
          id: file.id,
          key: file.objectKey,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes ? Number(file.sizeBytes) : null,
          storagePath: `${file.bucket}/${file.objectKey}`,
          uploadedBy: file.uploaderId,
          refType: file.refType,
          refId: file.refId,
          createdAt: file.createdAt.toISOString(),
          lastModified: null,
        },
      });
      return;
    }
    // DB에 없으면 MinIO HeadObject fallback (레거시 파일 지원)
    const key = await resolveKey(req.params.id, req.query.key as string);
    if (!key) { throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND); }
    const head = await headObject(key);
    const originalName = head.Metadata?.originalname
      ? decodeURIComponent(head.Metadata.originalname) : key;
    res.json({
      ok: true,
      data: {
        id: req.params.id,
        key,
        originalName,
        mimeType: head.ContentType,
        sizeBytes: head.ContentLength,
        storagePath: `${BUCKET}/${key}`,
        uploadedBy: head.Metadata?.uploadedby || 'unknown',
        refType: head.Metadata?.linkedentitytype || null,
        refId: head.Metadata?.linkedentityid || null,
        createdAt: null,
        lastModified: head.LastModified?.toISOString() ?? null,
      },
    });
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const errName = (err as { name?: string }).name;
    if (errName === 'NoSuchKey' || errName === 'NotFound') {
      throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND);
    }
    logger.error({ err }, '메타 조회 실패');
    throw new AppError(502, '스토리지 조회에 실패했습니다.', ErrorCode.FILE_STORAGE_ERROR);
  }
});

/** DELETE /api/files/:id — 파일 삭제 */
export const deleteFile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;

  // 소유권 검증
  const file = await prisma.file.findUnique({
    where: { id: req.params.id },
    select: { uploaderId: true, isDeleted: true },
  });
  if (!file || file.isDeleted) {
    throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND);
  }
  if (file.uploaderId !== userId && userRole !== 'admin') {
    throw new AppError(403, '권한이 없습니다.', ErrorCode.FILE_PERMISSION_DENIED);
  }

  // DB에서 파일 soft delete
  const updated = await prisma.file.updateMany({
    where: { id: req.params.id, isDeleted: false },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  if (updated.count > 0) {
    // DB soft delete succeeded — fetch objectKey for async MinIO deletion
    const deleted = await prisma.file.findUnique({
      where: { id: req.params.id },
      select: { objectKey: true },
    });
    if (deleted) {
      deleteObject(deleted.objectKey).catch((err) =>
        logger.error({ err, objectKey: deleted.objectKey }, 'MinIO soft-delete 비동기 삭제 실패')
      );
    }
    res.json({ ok: true, id: req.params.id, message: '파일이 삭제되었습니다.' });
    return;
  }
  // 레거시 MinIO-only 파일 처리
  const key = await resolveKey(req.params.id, req.query.key as string);
  if (!key) { throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND); }
  await deleteObject(key);
  res.json({ ok: true, id: req.params.id, key, message: '파일이 삭제되었습니다.' });
});
