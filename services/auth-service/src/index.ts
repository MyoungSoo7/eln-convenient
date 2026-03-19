import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './routes/auth.routes';
import { swaggerDocument } from './swagger';
import { globalErrorHandler, setupProcessHandlers, createHttpLogger } from '@lab/shared';

const { logger, httpLogger } = createHttpLogger('auth-service');

setupProcessHandlers('auth-service', logger);

const app = express();
const PORT = process.env.PORT || 8001;

app.use(cors());
app.use(express.json());
app.use(httpLogger);

// Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// 헬스체크
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
});

// 라우트
app.use('/api/auth', authRoutes);

app.use(globalErrorHandler('auth-service', logger));

app.listen(PORT, () => {
  logger.info({ port: PORT }, '서버 시작');
  logger.info({ url: `http://localhost:${PORT}/docs` }, 'Swagger UI');
});

export default app;
