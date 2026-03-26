import type { Readable } from 'stream';

export type StorageType = 'minio' | 's3' | 'local';

export interface StorageConfig {
  type: StorageType;
  // S3/MinIO
  endpoint?: string;
  region?: string;
  accessKey?: string;
  secretKey?: string;
  bucket: string;
  exportsBucket: string;
  publicUrl?: string;
  forcePathStyle?: boolean;
  // Local
  basePath?: string;
  baseUrl?: string;
}

export interface ObjectMeta {
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
  lastModified?: Date;
}

export interface DownloadResult extends ObjectMeta {
  body: Readable;
}

export interface StorageProvider {
  readonly type: StorageType;
  readonly bucket: string;
  readonly exportsBucket: string;

  ensureBuckets(): Promise<void>;
  ensureExportsBucketLifecycle(): Promise<void>;

  // 기본 버킷 작업
  upload(key: string, body: Buffer, contentType: string, metadata?: Record<string, string>): Promise<void>;
  download(key: string): Promise<DownloadResult>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<ObjectMeta>;
  findKeyByPrefix(prefix: string): Promise<string | null>;
  getPresignedDownloadUrl(key: string, expiresIn: number): Promise<string>;
  getPresignedUploadUrl(key: string, contentType: string, expiresIn: number): Promise<string>;

  // 임의 버킷 작업 (exports 등)
  uploadToBucket(bucket: string, key: string, body: Buffer, contentType: string, metadata?: Record<string, string>): Promise<void>;
  getPresignedUrlFromBucket(bucket: string, key: string, expiresIn: number): Promise<string>;
  deleteFromBucket(bucket: string, key: string): Promise<void>;

  // Multipart (대용량 파일)
  createMultipartUpload(bucket: string, key: string, contentType: string): Promise<string>;
  uploadPart(bucket: string, key: string, uploadId: string, partNumber: number, body: Buffer): Promise<string>;
  completeMultipartUpload(bucket: string, key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]): Promise<void>;
  abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void>;
}

export const EXPIRY = {
  EXPORT_DOWNLOAD: 24 * 3600,
  FILE_DOWNLOAD: 3600,
  FILE_UPLOAD: 900,
} as const;
