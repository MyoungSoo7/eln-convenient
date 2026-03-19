import { buildApp } from './app';

// ── 프로세스 레벨 에러 핸들러 ───────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[scheduler-service] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[scheduler-service] Uncaught Exception:', err);
  process.exit(1);
});

const PORT = Number(process.env.PORT) || 8005;
const HOST = '0.0.0.0';

async function main(): Promise<void> {
  const app = buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`[scheduler-service] 서버 실행 중 → http://localhost:${PORT}`);
    console.log(`[scheduler-service] Swagger  → http://localhost:${PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
