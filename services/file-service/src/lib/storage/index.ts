import type { StorageProvider, StorageConfig, StorageType } from './types';
import { S3StorageProvider } from './s3.provider';
import { LocalStorageProvider } from './local.provider';

export type { StorageProvider, StorageConfig, StorageType, ObjectMeta, DownloadResult } from './types';
export { EXPIRY } from './types';

function buildConfigFromEnv(): StorageConfig {
  const type = (process.env.STORAGE_TYPE || 'minio') as StorageType;
  const bucket = process.env.STORAGE_BUCKET || process.env.MINIO_BUCKET || 'labnote-files';
  const exportsBucket = process.env.STORAGE_EXPORTS_BUCKET || process.env.MINIO_EXPORTS_BUCKET || 'labnote-exports';

  if (type === 'local') {
    return {
      type,
      bucket,
      exportsBucket,
      basePath: process.env.STORAGE_LOCAL_PATH || '/data/labnote-storage',
      baseUrl: process.env.STORAGE_LOCAL_URL || 'http://localhost:8008',
    };
  }

  // minio 또는 s3
  const accessKey = process.env.STORAGE_ACCESS_KEY || process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.STORAGE_SECRET_KEY || process.env.MINIO_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error('STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY (또는 MINIO_ACCESS_KEY, MINIO_SECRET_KEY) 환경변수를 설정하세요.');
  }

  if (type === 's3') {
    return {
      type,
      bucket,
      exportsBucket,
      region: process.env.STORAGE_REGION || process.env.AWS_REGION || 'ap-northeast-2',
      accessKey,
      secretKey,
      publicUrl: process.env.STORAGE_PUBLIC_URL,
      forcePathStyle: false,
    };
  }

  // minio (기본)
  const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
  const port = process.env.MINIO_PORT || '9000';
  return {
    type,
    bucket,
    exportsBucket,
    endpoint: `http://${endpoint}:${port}`,
    region: 'us-east-1',
    accessKey,
    secretKey,
    publicUrl: process.env.MINIO_PUBLIC_URL || process.env.STORAGE_PUBLIC_URL,
    forcePathStyle: true,
  };
}

export function createStorageProvider(config?: StorageConfig): StorageProvider {
  const cfg = config ?? buildConfigFromEnv();

  if (cfg.type === 'local') {
    return new LocalStorageProvider({
      bucket: cfg.bucket,
      exportsBucket: cfg.exportsBucket,
      basePath: cfg.basePath!,
      baseUrl: cfg.baseUrl!,
    });
  }

  return new S3StorageProvider(cfg);
}

// 싱글턴 — 기존 코드와의 호환을 위해 즉시 생성
let _instance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!_instance) {
    _instance = createStorageProvider();
    console.log(`[storage] provider: ${_instance.type}, bucket: ${_instance.bucket}, exports: ${_instance.exportsBucket}`);
  }
  return _instance;
}
