import { buildApp } from './app';
import { createLogger, setupProcessHandlers } from '@lab/shared';
import { summarizeRouting } from './config/routing';

const logger = createLogger('gemma-gateway');

setupProcessHandlers('gemma-gateway', logger);

const PORT = Number(process.env.PORT) || 8010;
const HOST = '0.0.0.0';

async function main(): Promise<void> {
  const app = buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT }, 'gemma-gateway 시작');
    logger.info({ url: `http://localhost:${PORT}/docs` }, 'Swagger UI');
    // 라우팅 테이블 출력 (운영 가시성)
    summarizeRouting()
      .split('\n')
      .forEach((line) => logger.info(line));
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

main();
