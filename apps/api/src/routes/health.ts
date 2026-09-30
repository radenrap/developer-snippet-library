import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { getDatabaseName } from '@snippets/db';
import type { HealthDto } from '@snippets/shared';
import { apiErrorSchema, healthResponseSchema } from '@snippets/shared/validators';
import { sql } from 'drizzle-orm';
import { serviceUnavailable } from '../lib/api-error';
import { ok } from '../lib/respond';

export const healthRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Health check API',
        response: { 200: healthResponseSchema },
      },
    },
    async () => {
      const payload: HealthDto = {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };

      return ok(payload);
    },
  );

  fastify.get(
    '/health/db',
    {
      schema: {
        tags: ['health'],
        summary: 'Health check koneksi database',
        response: { 200: healthResponseSchema, 503: apiErrorSchema },
      },
    },
    async (request) => {
      try {
        await fastify.db.execute(sql`select 1`);
      } catch (error) {
        request.log.error({ err: error }, 'Health check database gagal');
        throw serviceUnavailable(`Database ${getDatabaseName()} tidak dapat dihubungi`);
      }

      const payload: HealthDto = { status: 'ok' };

      return ok(payload);
    },
  );
};
