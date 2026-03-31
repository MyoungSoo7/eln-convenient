import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { AppError, ErrorCode, createLogger, getOrgId } from '@lab/shared';
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

const BLOCKED_EXTENSIONS = new Set([
  'exe', 'sh', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif',
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

/** POST /api/files — @fastify/multipart 직접 업로드 */
export async function uploadFile(request: FastifyRequest, reply: FastifyReply) {
  const data = await request.file();
  if (!data) {
    throw new AppError(400, '업로드된 파일이 없습니다.', ErrorCode.FILE_NO_FILE);
  }

  const buffer = await data.toBuffer();
  const originalName = data.filename;
  const mimetype = data.mimetype;
  const fileSize = buffer.length;

  // MIME 타입 차단
  if (BLOCKED_MIME.has(mimetype)) {
    throw new AppError(400, `허용되지 않는 파일 형식입니다: ${mimetype}`, ErrorCode.FILE_BLOCKED_MIME);
  }

  // 확장자 차단
  const uploadExt = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : '';
  if (BLOCKED_EXTENSIONS.has(uploadExt)) {
    throw new AppError(400, `허용되지 않는 파일 확장자입니다: .${uploadExt}`, ErrorCode.FILE_BLOCKED_MIME);
  }

  const checksum = createHash('sha256').update(buffer).digest('hex');

  const fileId = uuidv4();
  const ext = originalName.includes('.') ? originalName.split('.').pop() : '';
  const key = `${fileId}${ext ? '.' + ext : ''}`;

  // multipart fields에서 body 값 추출
  const fields = data.fields;
  const linkedEntityType = (fields?.linkedEntityType as any)?.value || null;
  const linkedEntityId = (fields?.linkedEntityId as any)?.value || null;
  const uploadedBy = (request.headers['x-user-id'] as string) || 'anonymous';

  // MinIO Metadata에 원본 파일명 / 업로더 / linkedEntity 저장
  const minioMeta: Record<string, string> = {
    originalname: encodeURIComponent(originalName),
    uploadedby: uploadedBy,
    ...(linkedEntityType && { linkedentitytype: linkedEntityType }),
    ...(linkedEntityId && { linkedentityid: linkedEntityId }),
  };

  try {
    await uploadObject(key, buffer, mimetype, minioMeta);
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
        originalName,
        mimeType: mimetype,
        sizeBytes: BigInt(fileSize),
        checksumSha256: checksum,
        uploaderId: uploadedBy,
        orgId: getOrgId(request.headers),
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

  logger.info({ originalName, key, dbId: dbFile.id }, '업로드 완료');
  reply.code(201);
  return {
    ok: true,
    data: {
      id: fileId,
      key,
      originalName,
      mimeType: mimetype,
      sizeBytes: fileSize,
      checksumSha256: checksum,
      storagePath: `${BUCKET}/${key}`,
      uploadedBy,
      refType: linkedEntityType,
      refId: linkedEntityId,
      createdAt: new Date().toISOString(),
    },
  };
}

/** GET /api/files/presigned-upload — 클라이언트 직접 업로드용 presigned PUT URL */
export async function getPresignedUpload(request: FastifyRequest, reply: FastifyReply) {
  const { filename, contentType } = request.query as Record<string, string>;

  const mimeType = contentType as string;
  if (BLOCKED_MIME.has(mimeType)) {
    throw new AppError(400, `허용되지 않는 파일 형식입니다: ${mimeType}`, ErrorCode.FILE_BLOCKED_MIME);
  }

  const fn = filename as string;
  const presignedExt = fn.includes('.') ? fn.split('.').pop()!.toLowerCase() : '';
  if (BLOCKED_EXTENSIONS.has(presignedExt)) {
    throw new AppError(400, `허용되지 않는 파일 확장자입니다: .${presignedExt}`, ErrorCode.FILE_BLOCKED_MIME);
  }

  const fileId = uuidv4();
  const fn = filename as string;
  const ext = fn.includes('.') ? fn.split('.').pop() : '';
  const key = `${fileId}${ext ? '.' + ext : ''}`;

  try {
    const uploadUrl = await getPresignedUploadUrl(key, mimeType, 900);
    const expiresAt = new Date(Date.now() + 900 * 1000).toISOString();
    return { ok: true, data: { fileId, key, uploadUrl, expiresAt } };
  } catch (err) {
    logger.error({ err, key }, 'presigned upload URL 생성 실패');
    throw new AppError(502, 'presigned URL 생성에 실패했습니다.', ErrorCode.FILE_STORAGE_ERROR);
  }
}

// ─────────────────────────────────────────────
// 다운로드
// ─────────────────────────────────────────────

/** GET /api/files/:id — presigned URL로 리디렉트 */
export async function downloadFile(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const query = request.query as Record<string, string>;
  const key = await resolveKey(id, query.key);
  if (!key) { throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND); }

  // Org verification for DB-tracked files (legacy files without DB record are allowed)
  const dbFile = await prisma.file.findFirst({ where: { objectKey: key, isDeleted: false } });
  if (dbFile && dbFile.orgId && dbFile.orgId !== getOrgId(request.headers)) {
    throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND);
  }

  try {
    const url = await getPresignedUrl(key);
    return reply.redirect(url);
  } catch (err) {
    logger.error({ err, key }, 'presigned URL 생성 실패');
    throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND);
  }
}

/** GET /api/files/:id/url — presigned 다운로드 URL 반환 (리디렉트 없이) */
export async function getDownloadUrl(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const query = request.query as Record<string, string>;
  const key = await resolveKey(id, query.key);
  if (!key) { throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND); }

  // Org verification for DB-tracked files (legacy files without DB record are allowed)
  const dbFile = await prisma.file.findFirst({ where: { objectKey: key, isDeleted: false } });
  if (dbFile && dbFile.orgId && dbFile.orgId !== getOrgId(request.headers)) {
    throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND);
  }

  try {
    const expiresIn = Number.parseInt(query.expiresIn as string) || 3600;
    const url = await getPresignedUrl(key, Math.min(expiresIn, 86400));
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return { ok: true, data: { key, url, expiresAt } };
  } catch (err) {
    logger.error({ err, key }, 'URL 생성 실패');
    throw new AppError(502, 'presigned URL 생성에 실패했습니다.', ErrorCode.FILE_STORAGE_ERROR);
  }
}

/** GET /api/files/:id/stream — 파일 스트리밍 */
export async function streamFile(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const query = request.query as Record<string, string>;
  const key = await resolveKey(id, query.key);
  if (!key) { throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND); }

  // Org verification for DB-tracked files (legacy files without DB record are allowed)
  const dbFile = await prisma.file.findFirst({ where: { objectKey: key, isDeleted: false } });
  if (dbFile && dbFile.orgId && dbFile.orgId !== getOrgId(request.headers)) {
    throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND);
  }

  try {
    const obj = await getObjectStream(key);

    // 원본 파일명을 Metadata에서 복원
    const originalName = obj.Metadata?.originalname
      ? decodeURIComponent(obj.Metadata.originalname)
      : key;

    if (obj.ContentType) reply.header('Content-Type', obj.ContentType);
    if (obj.ContentLength) reply.header('Content-Length', String(obj.ContentLength));
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);

    return reply.send(obj.Body as NodeJS.ReadableStream);
  } catch (err) {
    logger.error({ err, key }, '스트리밍 실패');
    throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND);
  }
}

// ─────────────────────────────────────────────
// 메타 / 삭제
// ─────────────────────────────────────────────

/** GET /api/files/:id/meta — 파일 메타데이터 */
export async function getFileMeta(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const query = request.query as Record<string, string>;

  try {
    // DB에서 먼저 조회
    const file = await prisma.file.findFirst({
      where: { id, isDeleted: false, orgId: getOrgId(request.headers) },
    });
    if (file) {
      return {
        ok: true,
        data: {
          id: file.id,
          key: file.objectKey,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes ? Number(file.sizeBytes) : null,
          checksumSha256: file.checksumSha256 ?? null,
          storagePath: `${file.bucket}/${file.objectKey}`,
          uploadedBy: file.uploaderId,
          refType: file.refType,
          refId: file.refId,
          createdAt: file.createdAt.toISOString(),
          lastModified: null,
        },
      };
    }
    // DB에 없으면 MinIO HeadObject fallback (레거시 파일 지원)
    const key = await resolveKey(id, query.key);
    if (!key) { throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND); }
    const head = await headObject(key);
    const originalName = head.Metadata?.originalname
      ? decodeURIComponent(head.Metadata.originalname) : key;
    return {
      ok: true,
      data: {
        id,
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
    };
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    const errName = (err as { name?: string }).name;
    if (errName === 'NoSuchKey' || errName === 'NotFound') {
      throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND);
    }
    logger.error({ err }, '메타 조회 실패');
    throw new AppError(502, '스토리지 조회에 실패했습니다.', ErrorCode.FILE_STORAGE_ERROR);
  }
}

/** DELETE /api/files/:id — 파일 삭제 */
export async function deleteFile(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const query = request.query as Record<string, string>;

  // DB에서 파일 soft delete
  const updated = await prisma.file.updateMany({
    where: { id, isDeleted: false },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  if (updated.count > 0) {
    // DB soft delete succeeded — fetch objectKey for async MinIO deletion
    const deleted = await prisma.file.findUnique({
      where: { id },
      select: { objectKey: true },
    });
    if (deleted) {
      deleteObject(deleted.objectKey).catch((err) =>
        logger.error({ err, objectKey: deleted.objectKey }, 'MinIO soft-delete 비동기 삭제 실패')
      );
    }
    return { ok: true, id, message: '파일이 삭제되었습니다.' };
  }
  // 레거시 MinIO-only 파일 처리
  const key = await resolveKey(id, query.key);
  if (!key) { throw new AppError(404, '파일을 찾을 수 없습니다.', ErrorCode.FILE_NOT_FOUND); }
  await deleteObject(key);
  return { ok: true, id, key, message: '파일이 삭제되었습니다.' };
}
