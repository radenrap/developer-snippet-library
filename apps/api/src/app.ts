import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from '@fastify/type-provider-zod';
import type { FastifyError } from 'fastify';
import Fastify from 'fastify';
import { env } from './env';
import { ApiError, codeForStatus, internalError, validationError } from './lib/api-error';
import { dbPlugin } from './plugins/db';
import { healthRoutes } from './routes/health';
import { regexRoutes } from './routes/regex';
import { snippetRoutes } from './routes/snippets';
import { tagRoutes } from './routes/tags';

/**
 * Membangun instance Fastify tanpa memanggil `listen()`,
 * supaya bisa dipakai ulang di integration test.
 */
export async function buildApp() {
  const app = Fastify({
    logger: { level: env.logLevel },
    trustProxy: env.isProduction,
  }).withTypeProvider<ZodTypeProvider>();

  // Type provider zod: skema dari @snippets/shared dipakai sekaligus untuk
  // validasi request, serialisasi respons, dan pembuatan OpenAPI.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: env.corsOrigins,
    credentials: true,
  });

  // Menyuntik `fastify.db` (Drizzle) ke seluruh route + menutup pool saat close.
  await app.register(dbPlugin);

  // Auto-docs: OpenAPI 3 dibangun dari skema zod tiap route.
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Developer Snippet Library API',
        description:
          'REST API koleksi snippet developer. Pencarian memakai PostgreSQL full-text search (tsvector + GIN) dengan bobot A=judul, B=deskripsi, C=kode.',
        version: '0.0.0',
      },
      servers: [{ url: `http://localhost:${env.apiPort}` }],
      tags: [
        { name: 'snippets', description: 'CRUD snippet + pencarian full-text' },
        { name: 'tags', description: 'Daftar tag untuk filter dan autocomplete' },
        { name: 'regex', description: 'Regex tester (tidak menyentuh database)' },
        { name: 'health', description: 'Health check API dan database' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      displayRequestDuration: true,
    },
  });

  /**
   * Satu-satunya tempat yang membentuk body error, sehingga formatnya konsisten:
   * `{ success: false, error: { code, message, details? } }`.
   * Handler cukup melempar `ApiError`; tidak perlu memanggil reply.send sendiri.
   */
  app.setErrorHandler((error, request, reply) => {
    // 1) ApiError yang dilempar handler.
    if (error instanceof ApiError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error }, 'Request gagal diproses');
      } else {
        request.log.warn({ err: error }, 'Request ditolak');
      }

      reply.code(error.statusCode).send(error.toJSON());
      return;
    }

    // 2) Validasi skema zod gagal (query/params/body) -> 400 + rincian per-field.
    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((issue) => ({
        field: issue.instancePath.replace(/^\/+/, '') || '(body)',
        message: issue.message ?? 'Nilai tidak valid',
      }));

      request.log.warn({ err: error }, 'Validasi request gagal');
      reply.code(400).send(validationError(details).toJSON());
      return;
    }

    // 3) Respons tidak cocok dengan skema serializer -> bug di sisi server.
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, 'Serialisasi respons gagal');
      reply.code(500).send(internalError('Respons server tidak sesuai kontrak').toJSON());
      return;
    }

    // 4) Error lain (body JSON rusak, error driver DB, dsb).
    // `error` sudah melebar jadi unknown setelah tiga type guard di atas,
    // jadi dibaca lewat FastifyError secara eksplisit.
    const fallback = error as FastifyError;
    const statusCode = typeof fallback.statusCode === 'number' ? fallback.statusCode : 500;

    if (statusCode >= 500) {
      request.log.error({ err: fallback }, 'Request gagal diproses');
      reply.code(500).send(internalError().toJSON());
      return;
    }

    request.log.warn({ err: fallback }, 'Request ditolak');
    reply
      .code(statusCode)
      .send(new ApiError(statusCode, codeForStatus(statusCode), fallback.message).toJSON());
  });

  app.setNotFoundHandler((request, reply) => {
    reply
      .code(404)
      .send(
        new ApiError(
          404,
          'NOT_FOUND',
          `Route ${request.method}:${request.url} tidak ditemukan`,
        ).toJSON(),
      );
  });

  await app.register(healthRoutes);
  await app.register(regexRoutes, { prefix: '/api' });
  await app.register(snippetRoutes, { prefix: '/api' });
  await app.register(tagRoutes, { prefix: '/api' });

  return app;
}
