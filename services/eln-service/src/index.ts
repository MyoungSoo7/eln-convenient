import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import noteRoutes from './routes/note.routes';
import { swaggerDocument } from './swagger';

const app = express();
const PORT = process.env.PORT || 8002;

app.use(cors());
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'eln-service', timestamp: new Date().toISOString() });
});

app.use('/api', noteRoutes);

app.listen(PORT, () => {
  console.log(`[eln-service] 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`[eln-service] Swagger: http://localhost:${PORT}/docs`);
});

export default app;
