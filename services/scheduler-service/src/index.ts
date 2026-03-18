import { buildApp } from './app';

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
