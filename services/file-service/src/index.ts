import '@lab/shared/dist/tracing';
import { buildApp } from './app';
import { setupProcessHandlers, createLogger } from '@lab/shared';
import { ensureBucket, ensureExportsBucketLifecycle } from './lib/minio';
import { startWorker, startExpiryCleanup, startSoftDeleteCleanup, registerProcessor } from './lib/jobWorker';
import { processPdfJob } from './processors/pdfProcessor';
import { processZipJob } from './processors/zipProcessor';

const logger = createLogger('file-service');

setupProcessHandlers('file-service', logger);

const PORT = Number(process.env.PORT) || 8008;
const HOST = '0.0.0.0';

async function main(): Promise<void> {
  const app = buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT }, '서버 시작');
    logger.info({ url: `http://localhost:${PORT}/docs` }, 'Swagger UI');
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }

  // export job processors 등록
  registerProcessor('pdf', processPdfJob);
  registerProcessor('zip', processZipJob);

  // job worker 시작 (2s 폴링)
  startWorker();
  startExpiryCleanup();
  startSoftDeleteCleanup();

  try {
    await ensureBucket();
    await ensureExportsBucketLifecycle();
    logger.info('스토리지 버킷 및 lifecycle 정책 준비 완료');
  } catch (err) {
    logger.error({ err }, '스토리지 버킷 초기화 실패 (나중에 재시도)');
  }
}

main();
