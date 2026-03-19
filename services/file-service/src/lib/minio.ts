import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3';
import type { GetObjectCommandOutput, HeadObjectCommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = Number.parseInt(process.env.MINIO_PORT || '9000');
if (!process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) {
  throw new Error('MINIO_ACCESS_KEY, MINIO_SECRET_KEY 환경변수를 설정하세요.');
}
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
export const BUCKET = process.env.MINIO_BUCKET || 'labnote-files';
export const EXPORTS_BUCKET = process.env.MINIO_EXPORTS_BUCKET || 'labnote-exports';

/** 통일된 presigned URL 만료 시간 (초) */
export const EXPIRY = {
  EXPORT_DOWNLOAD: 24 * 3600,   // 24시간 — 내보내기 다운로드
  FILE_DOWNLOAD: 3600,           // 1시간 — 일반 파일 다운로드
  FILE_UPLOAD: 900,              // 15분 — presigned 업로드
} as const;

export const s3 = new S3Client({
  endpoint: `http://${MINIO_ENDPOINT}:${MINIO_PORT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

/** 두 버킷 모두 존재 확인 / 생성 */
export async function ensureBuckets(): Promise<void> {
  for (const bucket of [BUCKET, EXPORTS_BUCKET]) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (err: unknown) {
      const errName = (err as { name?: string }).name;
      if (errName !== 'NotFound' && errName !== 'NoSuchBucket') throw err;
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`[file-service] 버킷 생성: ${bucket}`);
    }
  }
}

// 하위 호환 alias
export const ensureBucket = ensureBuckets;

/** labnote-exports 버킷에 7일 자동 만료 lifecycle 정책 설정 */
export async function ensureExportsBucketLifecycle(): Promise<void> {
  try {
    await s3.send(new PutBucketLifecycleConfigurationCommand({
      Bucket: EXPORTS_BUCKET,
      LifecycleConfiguration: {
        Rules: [{
          ID: 'auto-expire-exports-7d',
          Status: 'Enabled',
          Filter: { Prefix: '' },
          Expiration: { Days: 7 },
        }],
      },
    }));
    console.log(`[file-service] ${EXPORTS_BUCKET} 버킷 7일 자동 만료 정책 설정 완료`);
  } catch (err) {
    console.error('[file-service] 버킷 lifecycle 설정 실패 (무시):', err);
  }
}

/** 파일 업로드 (originalName을 Metadata로 저장) */
export async function uploadObject(
  key: string,
  body: Buffer,
  contentType: string,
  metadata?: Record<string, string>
): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  }));
}

/** UUID prefix로 실제 MinIO key 탐색 */
export async function findKeyByPrefix(prefix: string): Promise<string | null> {
  const result = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix,
    MaxKeys: 1,
  }));
  return result.Contents?.[0]?.Key ?? null;
}

/** presigned 다운로드 URL 생성 */
export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

/** presigned 업로드 URL 생성 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

/** 파일 스트림 다운로드 */
export async function getObjectStream(key: string): Promise<GetObjectCommandOutput> {
  const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return response;
}

/** 파일 삭제 */
export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** 파일 메타 조회 */
export async function headObject(key: string): Promise<HeadObjectCommandOutput> {
  return s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Multipart Upload 시작 */
export async function createMultipartUpload(bucket: string, key: string, contentType: string): Promise<string> {
  const res = await s3.send(new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  }));
  if (!res.UploadId) throw new Error('[minio] CreateMultipartUpload: UploadId missing in response');
  return res.UploadId;
}

/** Multipart 파트 업로드 */
export async function uploadPart(
  bucket: string, key: string, uploadId: string,
  partNumber: number, body: Buffer
): Promise<string> {
  const res = await s3.send(new UploadPartCommand({
    Bucket: bucket, Key: key, UploadId: uploadId,
    PartNumber: partNumber, Body: body,
  }));
  if (!res.ETag) throw new Error('[minio] UploadPart: ETag missing in response');
  return res.ETag;
}

/** Multipart Upload 완료 */
export async function completeMultipartUpload(
  bucket: string, key: string, uploadId: string,
  parts: { PartNumber: number; ETag: string }[]
): Promise<void> {
  await s3.send(new CompleteMultipartUploadCommand({
    Bucket: bucket, Key: key, UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  }));
}

/** Multipart Upload 중단 (실패 시 cleanup) */
export async function abortMultipartUpload(
  bucket: string, key: string, uploadId: string
): Promise<void> {
  try {
    await s3.send(new AbortMultipartUploadCommand({
      Bucket: bucket, Key: key, UploadId: uploadId,
    }));
  } catch (err) {
    console.error('[minio] abortMultipartUpload 실패 (무시):', err);
  }
}

/** 임의 버킷에 오브젝트 업로드 */
export async function uploadObjectToBucket(
  bucket: string, key: string, body: Buffer, contentType: string,
  metadata?: Record<string, string>
): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: body,
    ContentType: contentType, Metadata: metadata,
  }));
}

/** 임의 버킷 presigned URL */
export async function getPresignedUrlFromBucket(
  bucket: string, key: string, expiresIn = EXPIRY.FILE_DOWNLOAD
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

/** 임의 버킷 오브젝트 삭제 */
export async function deleteObjectFromBucket(bucket: string, key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    console.error('[minio] deleteObjectFromBucket 실패 (무시):', err);
  }
}
