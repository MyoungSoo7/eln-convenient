import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = Number.parseInt(process.env.MINIO_PORT || '9000');
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin123';
export const BUCKET = process.env.MINIO_BUCKET || 'labnote-files';

export const s3 = new S3Client({
  endpoint: `http://${MINIO_ENDPOINT}:${MINIO_PORT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY,
  },
  forcePathStyle: true, // MinIO는 path-style 필수
});

/** 버킷이 없으면 자동 생성 */
export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`[file-service] 버킷 생성: ${BUCKET}`);
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

/**
 * UUID prefix로 실제 MinIO key 탐색
 * upload 시 key = {uuid}.{ext} 형태이므로 prefix로 검색
 */
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

/** presigned 업로드 URL 생성 (클라이언트 → MinIO 직접 업로드용) */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900  // 15분
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

/** 파일 스트림 다운로드 */
export async function getObjectStream(key: string) {
  const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return response;
}

/** 파일 삭제 */
export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** 파일 메타 조회 (HeadObject — Metadata 포함) */
export async function headObject(key: string) {
  return s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
}
