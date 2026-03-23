/**
 * 하위 호환 래퍼 — 기존 import 경로를 유지하면서 StorageProvider로 위임
 *
 * 기존: import { uploadObject, BUCKET, ... } from '../lib/minio'
 * 내부: getStorage() 싱글턴으로 위임
 */
import { getStorage, EXPIRY } from './storage';
import type { DownloadResult, ObjectMeta } from './storage';

export { EXPIRY, getStorage };

const storage = () => getStorage();

export const BUCKET = process.env.STORAGE_BUCKET || process.env.MINIO_BUCKET || 'labnote-files';
export const EXPORTS_BUCKET = process.env.STORAGE_EXPORTS_BUCKET || process.env.MINIO_EXPORTS_BUCKET || 'labnote-exports';

export async function ensureBuckets(): Promise<void> {
  return storage().ensureBuckets();
}
export const ensureBucket = ensureBuckets;

export async function ensureExportsBucketLifecycle(): Promise<void> {
  return storage().ensureExportsBucketLifecycle();
}

export async function uploadObject(
  key: string, body: Buffer, contentType: string, metadata?: Record<string, string>,
): Promise<void> {
  return storage().upload(key, body, contentType, metadata);
}

export async function findKeyByPrefix(prefix: string): Promise<string | null> {
  return storage().findKeyByPrefix(prefix);
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  return storage().getPresignedDownloadUrl(key, expiresIn);
}

export async function getPresignedUploadUrl(key: string, contentType: string, expiresIn = 900): Promise<string> {
  return storage().getPresignedUploadUrl(key, contentType, expiresIn);
}

/** AWS SDK 호환 형식 반환 (기존 컨트롤러 코드 변경 없이 사용 가능) */
export async function getObjectStream(key: string) {
  const result = await storage().download(key);
  return {
    Body: result.body,
    ContentType: result.contentType,
    ContentLength: result.contentLength,
    Metadata: result.metadata,
    LastModified: result.lastModified,
  };
}

export async function deleteObject(key: string): Promise<void> {
  return storage().delete(key);
}

/** AWS SDK 호환 형식 반환 */
export async function headObject(key: string) {
  const meta = await storage().head(key);
  return {
    ContentType: meta.contentType,
    ContentLength: meta.contentLength,
    Metadata: meta.metadata,
    LastModified: meta.lastModified,
  };
}

export async function createMultipartUpload(bucket: string, key: string, contentType: string): Promise<string> {
  return storage().createMultipartUpload(bucket, key, contentType);
}

export async function uploadPart(
  bucket: string, key: string, uploadId: string, partNumber: number, body: Buffer,
): Promise<string> {
  return storage().uploadPart(bucket, key, uploadId, partNumber, body);
}

export async function completeMultipartUpload(
  bucket: string, key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[],
): Promise<void> {
  return storage().completeMultipartUpload(bucket, key, uploadId, parts);
}

export async function abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void> {
  return storage().abortMultipartUpload(bucket, key, uploadId);
}

export async function uploadObjectToBucket(
  bucket: string, key: string, body: Buffer, contentType: string, metadata?: Record<string, string>,
): Promise<void> {
  return storage().uploadToBucket(bucket, key, body, contentType, metadata);
}

export async function getPresignedUrlFromBucket(
  bucket: string, key: string, expiresIn: number = EXPIRY.FILE_DOWNLOAD,
): Promise<string> {
  return storage().getPresignedUrlFromBucket(bucket, key, expiresIn);
}

export async function deleteObjectFromBucket(bucket: string, key: string): Promise<void> {
  return storage().deleteFromBucket(bucket, key);
}
