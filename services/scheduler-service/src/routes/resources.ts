import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { requireAuth, requireRole, requirePermission } from '../plugins/auth';
import { Permission, RoleName, AppError, ErrorCode, getOrgId } from '@lab/shared';

// ─── JSON Schema ─────────────────────────────────────────────

const resourceBody = {
  type: 'object',
  required: ['name', 'type'],
  properties: {
    name:        { type: 'string', minLength: 1, maxLength: 100 },
    type:        { type: 'string', enum: ['EQUIPMENT', 'ROOM'] },
    location:    { type: 'string', maxLength: 200 },
    description: { type: 'string', maxLength: 1000 },
    capacity:    { type: 'integer', minimum: 1 },
    ownerId:     { type: 'string' },
  },
};

const idParam = {
  type: 'object',
  properties: { id: { type: 'string' } },
};

// ─── Route Plugin ─────────────────────────────────────────────

const resourcesRoute: FastifyPluginAsync = async (fastify) => {

  // ── GET /resources ────────────────────────────────────────
  fastify.get('/resources', {
    preHandler: [requireAuth, requirePermission(Permission.SCHEDULER_READ)],
    schema: {
      tags: ['resources'],
      querystring: {
        type: 'object',
        properties: {
          type:     { type: 'string', enum: ['EQUIPMENT', 'ROOM'] },
          isActive: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
  }, async (request) => {
    const orgId = getOrgId(request.headers);
    const { type, isActive } = request.query as { type?: string; isActive?: string };

    const data = await fastify.prisma.resource.findMany({
      where: {
        orgId,
        ...(type ? { type: type as 'EQUIPMENT' | 'ROOM' } : {}),
        isActive: isActive !== undefined ? isActive === 'true' : true,
      },
      orderBy: { name: 'asc' },
    });

    return { ok: true, data, total: data.length };
  });

  // ── GET /resources/:id ────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/resources/:id', {
    preHandler: [requireAuth, requirePermission(Permission.SCHEDULER_READ)],
    schema: { tags: ['resources'], params: idParam },
  }, async (request, reply) => {
    const orgId = getOrgId(request.headers);
    const resource = await fastify.prisma.resource.findFirst({
      where: { id: request.params.id, orgId },
      include: { _count: { select: { bookings: true } } },
    });
    if (!resource) {
      return reply.code(404).send({ ok: false, error: '자원을 찾을 수 없습니다.' });
    }
    return { ok: true, data: resource };
  });

  // ── POST /resources ───────────────────────────────────────
  fastify.post('/resources', {
    preHandler: [requireAuth, requireRole(RoleName.ADMIN)],
    schema: { tags: ['resources'], body: resourceBody },
  }, async (request, reply) => {
    const orgId = getOrgId(request.headers);
    const body = request.body as {
      name: string; type: 'EQUIPMENT' | 'ROOM';
      location?: string; description?: string; capacity?: number; ownerId?: string;
    };

    const resource = await fastify.prisma.resource.create({
      data: {
        name:        body.name.trim(),
        orgId,
        type:        body.type,
        location:    body.location ?? null,
        description: body.description ?? null,
        capacity:    body.capacity ?? null,
        ownerId:     body.ownerId ?? null,
      },
    });

    return reply.code(201).send({ ok: true, data: resource });
  });

  // ── PUT /resources/:id ────────────────────────────────────
  fastify.put<{ Params: { id: string } }>('/resources/:id', {
    preHandler: [requireAuth, requireRole(RoleName.ADMIN)],
    schema: { tags: ['resources'], params: idParam },
  }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    if (body.name        !== undefined) update.name        = (body.name as string).trim();
    if (body.type        !== undefined) update.type        = body.type;
    if (body.location    !== undefined) update.location    = body.location    ?? null;
    if (body.description !== undefined) update.description = body.description ?? null;
    if (body.capacity    !== undefined) update.capacity    = body.capacity;
    if (body.isActive    !== undefined) update.isActive    = Boolean(body.isActive);
    if (body.ownerId     !== undefined) update.ownerId     = body.ownerId     ?? null;

    const orgId = getOrgId(request.headers);
    const existing = await fastify.prisma.resource.findFirst({
      where: { id: request.params.id, orgId },
    });
    if (!existing) {
      return reply.code(404).send({ ok: false, error: '자원을 찾을 수 없습니다.' });
    }

    const resource = await fastify.prisma.resource.update({
      where: { id: request.params.id },
      data: update,
    });
    return { ok: true, data: resource };
  });

  // ── DELETE /resources/:id (soft delete) ──────────────────
  fastify.delete<{ Params: { id: string } }>('/resources/:id', {
    preHandler: [requireAuth, requireRole(RoleName.ADMIN)],
    schema: { tags: ['resources'], params: idParam },
  }, async (request, reply) => {
    const orgId = getOrgId(request.headers);
    const { id } = request.params;

    const resource = await fastify.prisma.resource.findFirst({ where: { id, orgId } });
    if (!resource) {
      return reply.code(404).send({ ok: false, error: '자원을 찾을 수 없습니다.' });
    }

    const activeCount = await fastify.prisma.booking.count({
      where: { resourceId: id, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (activeCount > 0) {
      return reply.code(409).send({
        ok: false,
        error: `진행 중인 예약이 ${activeCount}건 있어 비활성화할 수 없습니다.`,
      });
    }

    await fastify.prisma.resource.update({ where: { id }, data: { isActive: false } });
    return { ok: true, id, message: '자원이 비활성화되었습니다.' };
  });
};

export default resourcesRoute;
