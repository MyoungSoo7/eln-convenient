import { FastifyPluginAsync } from 'fastify';

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/health',
    { schema: { tags: ['health'] } },
    async () => ({
      status: 'ok',
      service: 'model-registry-service',
      timestamp: new Date().toISOString(),
    }),
  );
};

export default healthRoute;
