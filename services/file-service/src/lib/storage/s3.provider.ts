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
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';
import type { StorageProvider, StorageConfig, StorageType, ObjectMeta, DownloadResult } from './types';

export class S3StorageProvider implements StorageProvider {
  readonly type: StorageType;
  readonly bucket: string;
  readonly exportsBucket: string;
  private readonly s3: S3Client;
  private readonly s3Public: S3Client;

  constructor(config: StorageConfig) {
    this.type = config.type;
    this.bucket = config.bucket;
    this.exportsBucket = config.exportsBucket;

    const s3Config: ConstructorParameters<typeof S3Client>[0] = {
      region: config.region || 'us-east-1',
      credentials: {
        accessKeyId: config.accessKey!,
        secretAccessKey: config.secretKey!,
      },
      forcePathStyle: config.forcePathStyle ?? (config.type === 'minio'),
    };

    if (config.endpoint) {
      s3Config.endpoint = config.endpoint;
    }

    this.s3 = new S3Client(s3Config);

    if (config.publicUrl) {
      this.s3Public = new S3Client({
        ...s3Config,
        endpoint: config.publicUrl,
      });
    } else {
      this.s3Public = this.s3;
    }
  }

  async ensureBuckets(): Promise<void> {
    for (const bucket of [this.bucket, this.exportsBucket]) {
      try {
        await this.s3.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (err: unknown) {
        const errName = (err as { name?: string }).name;
        if (errName !== 'NotFound' && errName !== 'NoSuchBucket') throw err;
        await this.s3.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`[storage:${this.type}] 버킷 생성: ${bucket}`);
      }
    }
  }

  async ensureExportsBucketLifecycle(): Promise<void> {
    try {
      await this.s3.send(new PutBucketLifecycleConfigurationCommand({
        Bucket: this.exportsBucket,
        LifecycleConfiguration: {
          Rules: [{
            ID: 'auto-expire-exports-7d',
            Status: 'Enabled',
            Filter: { Prefix: '' },
            Expiration: { Days: 7 },
          }],
        },
      }));
      console.log(`[storage:${this.type}] ${this.exportsBucket} 버킷 7일 자동 만료 정책 설정 완료`);
    } catch (err) {
      console.error(`[storage:${this.type}] 버킷 lifecycle 설정 실패 (무시):`, err);
    }
  }

  async upload(key: string, body: Buffer, contentType: string, metadata?: Record<string, string>): Promise<void> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: body,
      ContentType: contentType, Metadata: metadata,
    }));
  }

  async download(key: string): Promise<DownloadResult> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return {
      body: res.Body as Readable,
      contentType: res.ContentType,
      contentLength: res.ContentLength,
      metadata: res.Metadata,
      lastModified: res.LastModified,
    };
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async head(key: string): Promise<ObjectMeta> {
    const res = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return {
      contentType: res.ContentType,
      contentLength: res.ContentLength,
      metadata: res.Metadata,
      lastModified: res.LastModified,
    };
  }

  async findKeyByPrefix(prefix: string): Promise<string | null> {
    const result = await this.s3.send(new ListObjectsV2Command({
      Bucket: this.bucket, Prefix: prefix, MaxKeys: 1,
    }));
    return result.Contents?.[0]?.Key ?? null;
  }

  async getPresignedDownloadUrl(key: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3Public, command, { expiresIn });
  }

  async getPresignedUploadUrl(key: string, contentType: string, expiresIn: number): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.s3Public, command, { expiresIn });
  }

  async uploadToBucket(bucket: string, key: string, body: Buffer, contentType: string, metadata?: Record<string, string>): Promise<void> {
    await this.s3.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: body,
      ContentType: contentType, Metadata: metadata,
    }));
  }

  async getPresignedUrlFromBucket(bucket: string, key: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.s3Public, command, { expiresIn });
  }

  async deleteFromBucket(bucket: string, key: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
      console.error(`[storage:${this.type}] deleteFromBucket 실패 (무시):`, err);
    }
  }

  async createMultipartUpload(bucket: string, key: string, contentType: string): Promise<string> {
    const res = await this.s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }));
    if (!res.UploadId) throw new Error('[storage] CreateMultipartUpload: UploadId missing');
    return res.UploadId;
  }

  async uploadPart(bucket: string, key: string, uploadId: string, partNumber: number, body: Buffer): Promise<string> {
    const res = await this.s3.send(new UploadPartCommand({
      Bucket: bucket, Key: key, UploadId: uploadId,
      PartNumber: partNumber, Body: body,
    }));
    if (!res.ETag) throw new Error('[storage] UploadPart: ETag missing');
    return res.ETag;
  }

  async completeMultipartUpload(bucket: string, key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]): Promise<void> {
    await this.s3.send(new CompleteMultipartUploadCommand({
      Bucket: bucket, Key: key, UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }));
  }

  async abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void> {
    try {
      await this.s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
    } catch (err) {
      console.error(`[storage:${this.type}] abortMultipartUpload 실패 (무시):`, err);
    }
  }
}
