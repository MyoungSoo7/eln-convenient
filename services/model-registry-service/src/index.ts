import '@lab/shared/dist/tracing';
import { buildApp } from './app';

process.on('unhandledRejection', (reason) => {
  console.error('[model-registry-service] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[model-registry-service] Uncaught Exception:', err);
  process.exit(1);
});

const PORT = Number(process.env.PORT) || 8012;
const HOST = '0.0.0.0';

async function main(): Promise<void> {
  const app = buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`[model-registry-service] 서버 실행 중 → http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
