import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import noteRoutes from './routes/note.routes';
import templateRoutes from './routes/template.routes';
import { swaggerDocument } from './swagger';
import { globalErrorHandler, setupProcessHandlers, createHttpLogger } from '@lab/shared';

const { logger, httpLogger } = createHttpLogger('eln-service');

setupProcessHandlers('eln-service', logger);

const app = express();
const PORT = process.env.PORT || 8002;

app.use(cors());
app.use(express.json());
app.use(httpLogger);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'eln-service', timestamp: new Date().toISOString() });
});

app.use('/api', noteRoutes);
app.use('/api/templates', templateRoutes);

app.use(globalErrorHandler('eln-service', logger));

app.listen(PORT, () => {
  logger.info({ port: PORT }, '서버 시작');
  logger.info({ url: `http://localhost:${PORT}/docs` }, 'Swagger UI');
});

export default app;
