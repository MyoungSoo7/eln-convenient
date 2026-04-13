import '@lab/shared/dist/tracing';
import { buildApp } from './app';
import { createLogger, setupProcessHandlers } from '@lab/shared';

const logger = createLogger('experiment-tracker-service');

setupProcessHandlers('experiment-tracker-service', logger);

const PORT = Number(process.env.PORT) || 8013;
const HOST = '0.0.0.0';

async function main(): Promise<void> {
  const app = buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    logger.info({ port: PORT }, 'experiment-tracker-service 시작');
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

main();
