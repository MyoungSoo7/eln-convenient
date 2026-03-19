import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import fileRoutes from './routes/file.routes';
import exportRoutes from './routes/export.routes';
import { swaggerDocument } from './swagger';
import { ensureBucket } from './lib/minio';
import { startWorker, startExpiryCleanup, registerProcessor } from './lib/jobWorker';
import { processPdfJob } from './processors/pdfProcessor';
import { processZipJob } from './processors/zipProcessor';
import prisma from './lib/prisma';
import { globalErrorHandler, setupProcessHandlers } from '@lab/shared';

setupProcessHandlers('file-service');

const app = express();
const PORT = process.env.PORT || 8008;

app.use(cors());
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', async (_req, res) => {
  let dbOk = false;
  let minioOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  try {
    const { s3, BUCKET } = await import('./lib/minio');
    const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    minioOk = true;
  } catch {}
  const healthy = dbOk && minioOk;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    service: 'file-service',
    timestamp: new Date().toISOString(),
    db: dbOk ? 'ok' : 'error',
    minio: minioOk ? 'ok' : 'error',
  });
});

app.use('/api/files', fileRoutes);
app.use('/api/exports', exportRoutes);

app.use(globalErrorHandler('file-service'));

app.listen(PORT, async () => {
  console.log(`[file-service] 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`[file-service] Swagger: http://localhost:${PORT}/docs`);

  // export job processors 등록
  registerProcessor('pdf', processPdfJob);
  registerProcessor('zip', processZipJob);

  // job worker 시작 (2s 폴링)
  startWorker();
  startExpiryCleanup();

  try {
    await ensureBucket();
    console.log('[file-service] MinIO 버킷 준비 완료');
  } catch (err) {
    console.error('[file-service] MinIO 버킷 초기화 실패 (나중에 재시도):', err);
  }
});

export default app;
