import pino from 'pino';
import pinoHttp from 'pino-http';

const isDev = process.env.NODE_ENV !== 'production';

export function createLogger(serviceName: string) {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    ...(isDev && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    }),
  });
}

export function createHttpLogger(serviceName: string) {
  const logger = createLogger(serviceName);

  const httpLogger = pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
    customSuccessMessage: (req, res) =>
      `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req, _res, err) =>
      `${req.method} ${req.url} failed: ${err.message}`,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  });

  return { logger, httpLogger };
}

export type Logger = pino.Logger;
