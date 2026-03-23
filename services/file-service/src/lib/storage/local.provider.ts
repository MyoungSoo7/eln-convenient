import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import * as crypto from 'crypto';
import type { StorageProvider, StorageType, ObjectMeta, DownloadResult } from './types';

export class LocalStorageProvider implements StorageProvider {
  readonly type: StorageType = 'local';
  readonly bucket: string;
  readonly exportsBucket: string;
  private readonly basePath: string;
  private readonly baseUrl: string;

  constructor(config: { bucket: string; exportsBucket: string; basePath: string; baseUrl: string }) {
    this.bucket = config.bucket;
    this.exportsBucket = config.exportsBucket;
    this.basePath = config.basePath;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
  }

  private filePath(bucket: string, key: string): string {
    return path.join(this.basePath, bucket, key);
  }

  private metaPath(bucket: string, key: string): string {
    return path.join(this.basePath, bucket, `.meta_${key}.json`);
  }

  private async writeMeta(bucket: string, key: string, meta: Record<string, unknown>): Promise<void> {
    const p = this.metaPath(bucket, key);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, JSON.stringify(meta));
  }

  private async readMeta(bucket: string, key: string): Promise<Record<string, unknown>> {
    try {
      const data = await fs.promises.readFile(this.metaPath(bucket, key), 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  async ensureBuckets(): Promise<void> {
    for (const bucket of [this.bucket, this.exportsBucket]) {
      const dir = path.join(this.basePath, bucket);
      await fs.promises.mkdir(dir, { recursive: true });
      console.log(`[storage:local] 디렉토리 확인: ${dir}`);
    }
  }

  async ensureExportsBucketLifecycle(): Promise<void> {
    console.log('[storage:local] 로컬 스토리지는 lifecycle 정책 미지원 — 수동 정리 필요');
  }

  async upload(key: string, body: Buffer, contentType: string, metadata?: Record<string, string>): Promise<void> {
    const fp = this.filePath(this.bucket, key);
    await fs.promises.mkdir(path.dirname(fp), { recursive: true });
    await fs.promises.writeFile(fp, body);
    await this.writeMeta(this.bucket, key, { contentType, size: body.length, metadata, createdAt: new Date().toISOString() });
  }

  async download(key: string): Promise<DownloadResult> {
    const fp = this.filePath(this.bucket, key);
    const stat = await fs.promises.stat(fp);
    const meta = await this.readMeta(this.bucket, key);
    return {
      body: fs.createReadStream(fp),
      contentType: meta.contentType as string | undefined,
      contentLength: stat.size,
      metadata: meta.metadata as Record<string, string> | undefined,
      lastModified: stat.mtime,
    };
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.promises.unlink(this.filePath(this.bucket, key));
      await fs.promises.unlink(this.metaPath(this.bucket, key)).catch(() => {});
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async head(key: string): Promise<ObjectMeta> {
    const fp = this.filePath(this.bucket, key);
    const stat = await fs.promises.stat(fp);
    const meta = await this.readMeta(this.bucket, key);
    return {
      contentType: meta.contentType as string | undefined,
      contentLength: stat.size,
      metadata: meta.metadata as Record<string, string> | undefined,
      lastModified: stat.mtime,
    };
  }

  async findKeyByPrefix(prefix: string): Promise<string | null> {
    const dir = path.join(this.basePath, this.bucket);
    try {
      const files = await fs.promises.readdir(dir);
      const match = files.find(f => f.startsWith(prefix) && !f.startsWith('.meta_'));
      return match ?? null;
    } catch {
      return null;
    }
  }

  async getPresignedDownloadUrl(key: string, _expiresIn: number): Promise<string> {
    // 로컬 스토리지는 presigned URL 대신 서버 스트리밍 경로 반환
    // file-service의 /api/files/:id/stream 엔드포인트로 대체
    return `${this.baseUrl}/api/files/${key.split('.')[0]}/stream?key=${encodeURIComponent(key)}`;
  }

  async getPresignedUploadUrl(key: string, _contentType: string, _expiresIn: number): Promise<string> {
    // 로컬은 presigned upload 미지원 — 서버 직접 업로드만 가능
    // 토큰 기반 임시 URL 생성
    const token = crypto.randomBytes(16).toString('hex');
    return `${this.baseUrl}/api/files/upload?key=${encodeURIComponent(key)}&token=${token}`;
  }

  async uploadToBucket(bucket: string, key: string, body: Buffer, contentType: string, metadata?: Record<string, string>): Promise<void> {
    const fp = this.filePath(bucket, key);
    await fs.promises.mkdir(path.dirname(fp), { recursive: true });
    await fs.promises.writeFile(fp, body);
    await this.writeMeta(bucket, key, { contentType, size: body.length, metadata, createdAt: new Date().toISOString() });
  }

  async getPresignedUrlFromBucket(bucket: string, key: string, _expiresIn: number): Promise<string> {
    const id = key.split('/').pop()?.split('.')[0] ?? key;
    return `${this.baseUrl}/api/exports/${id}/download`;
  }

  async deleteFromBucket(bucket: string, key: string): Promise<void> {
    try {
      await fs.promises.unlink(this.filePath(bucket, key));
      await fs.promises.unlink(this.metaPath(bucket, key)).catch(() => {});
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[storage:local] deleteFromBucket 실패 (무시):', err);
      }
    }
  }

  async createMultipartUpload(_bucket: string, key: string, contentType: string): Promise<string> {
    // 로컬은 multipart 불필요 — 임시 ID 반환, uploadPart에서 append
    const uploadId = crypto.randomUUID();
    const tmpDir = path.join(this.basePath, '.tmp', uploadId);
    await fs.promises.mkdir(tmpDir, { recursive: true });
    await fs.promises.writeFile(path.join(tmpDir, '_meta.json'), JSON.stringify({ key, contentType }));
    return uploadId;
  }

  async uploadPart(bucket: string, _key: string, uploadId: string, partNumber: number, body: Buffer): Promise<string> {
    const tmpDir = path.join(this.basePath, '.tmp', uploadId);
    const partPath = path.join(tmpDir, `part_${String(partNumber).padStart(5, '0')}`);
    await fs.promises.writeFile(partPath, body);
    const hash = crypto.createHash('md5').update(body).digest('hex');
    return `"${hash}"`;
  }

  async completeMultipartUpload(bucket: string, _key: string, uploadId: string, _parts: { PartNumber: number; ETag: string }[]): Promise<void> {
    const tmpDir = path.join(this.basePath, '.tmp', uploadId);
    const metaRaw = await fs.promises.readFile(path.join(tmpDir, '_meta.json'), 'utf-8');
    const meta = JSON.parse(metaRaw);
    const fp = this.filePath(bucket, meta.key);
    await fs.promises.mkdir(path.dirname(fp), { recursive: true });

    const parts = (await fs.promises.readdir(tmpDir)).filter(f => f.startsWith('part_')).sort();
    const writeStream = fs.createWriteStream(fp);
    for (const part of parts) {
      const data = await fs.promises.readFile(path.join(tmpDir, part));
      writeStream.write(data);
    }
    writeStream.end();
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    await this.writeMeta(bucket, meta.key, { contentType: meta.contentType, createdAt: new Date().toISOString() });
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }

  async abortMultipartUpload(_bucket: string, _key: string, uploadId: string): Promise<void> {
    const tmpDir = path.join(this.basePath, '.tmp', uploadId);
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
