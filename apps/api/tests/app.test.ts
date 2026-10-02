import type { ApiErrorBody, HealthDto } from '@snippets/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers/app';

/**
 * Test level aplikasi: envelope respons, kontrak error, dan auto-docs.
 *
 * Semua kasus di file ini TIDAK menyentuh database -- validasi Fastify jalan
 * sebelum handler, jadi PostgreSQL boleh mati dan hasilnya tetap deterministik.
 */
let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('mengembalikan envelope sukses berisi status ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);

    const body = response.json() as { success: true; data: HealthDto };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.uptime).toBeTypeOf('number');
    expect(new Date(body.data.timestamp ?? '').toISOString()).toBe(body.data.timestamp);
  });
});

describe('GET /health/db', () => {
  it('tetap mematuhi kontrak: 200 envelope sukses atau 503 SERVICE_UNAVAILABLE', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/db' });

    // Hasilnya bergantung pada apakah PostgreSQL sedang hidup, tapi bentuk
    // responsnya harus konsisten di kedua keadaan.
    expect([200, 503]).toContain(response.statusCode);

    if (response.statusCode === 200) {
      const body = response.json() as { success: true; data: HealthDto };
      expect(body.data.status).toBe('ok');
      return;
    }

    const body = response.json() as ApiErrorBody;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.message).toContain('tidak dapat dihubungi');
  });
});

describe('route tidak dikenal', () => {
  it('mengembalikan 404 NOT_FOUND ber-envelope, bukan HTML bawaan Fastify', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/route-tidak-ada' });

    expect(response.statusCode).toBe(404);

    const body = response.json() as ApiErrorBody;
    expect(body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route GET:/api/route-tidak-ada tidak ditemukan',
      },
    });
    expect(response.headers['content-type']).toContain('application/json');
  });
});

describe('validasi request', () => {
  it('menolak body POST /api/snippets yang tidak lengkap dengan rincian per-field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/snippets',
      payload: { title: '' },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json() as ApiErrorBody;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');

    const fields = body.error.details?.map((detail) => detail.field) ?? [];
    expect(fields).toContain('title');
    expect(fields).toContain('code');
    expect(fields).toContain('language');
  });

  it('menolak id non-UUID pada params dan menunjuk field id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/snippets/bukan-uuid' });

    expect(response.statusCode).toBe(400);

    const body = response.json() as ApiErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.map((detail) => detail.field)).toEqual(['id']);
  });

  it('menolak querystring ber-tipe salah tanpa menyentuh database', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/snippets?page=abc' });

    expect(response.statusCode).toBe(400);
    expect((response.json() as ApiErrorBody).error.code).toBe('VALIDATION_ERROR');
  });

  it('menandai field (body) bila kegagalan validasi terjadi di akar payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/snippets',
      payload: [],
    });

    expect(response.statusCode).toBe(400);

    const body = response.json() as ApiErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.map((detail) => detail.field)).toEqual(['(body)']);
  });

  it('menolak body JSON rusak dengan 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/snippets',
      headers: { 'content-type': 'application/json' },
      payload: '{"title": ',
    });

    expect(response.statusCode).toBe(400);

    const body = response.json() as ApiErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message.length).toBeGreaterThan(0);
  });
});

describe('DELETE tanpa body', () => {
  it('menolak content-type JSON tanpa body -- alasan klien tidak boleh mengirim header itu', async () => {
    // Regresi bug tombol "Hapus" di web: fetch mengirim
    // `content-type: application/json` untuk request tanpa body, sehingga
    // Fastify menolak sebelum handler jalan.
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/snippets/3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as ApiErrorBody).error.message).toContain('Body cannot be empty');
  });
});

describe('auto-docs OpenAPI', () => {
  type OpenApiSpec = {
    openapi: string;
    info: { title: string; version: string };
    components: { schemas: Record<string, unknown> };
    paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
  };

  async function getSpec() {
    const response = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(response.statusCode).toBe(200);

    return response.json() as OpenApiSpec;
  }

  it('menyajikan spesifikasi OpenAPI 3 dari skema zod', async () => {
    const spec = await getSpec();

    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe('Developer Snippet Library API');
  });

  it('mendokumentasikan seluruh route yang terdaftar', async () => {
    const spec = await getSpec();

    expect(Object.keys(spec.paths).sort()).toEqual([
      '/api/regex/test',
      '/api/snippets',
      '/api/snippets/{id}',
      '/api/tags',
      '/health',
      '/health/db',
    ]);
  });

  it('mendokumentasikan skema error ber-envelope pada respons non-2xx', async () => {
    const spec = await getSpec();
    const healthDb = spec.paths['/health/db']?.get?.responses ?? {};

    // jsonSchemaTransform meng-inline skema ke tiap respons (bukan $ref),
    // jadi components.schemas dibiarkan kosong oleh design.
    expect(Object.keys(healthDb).sort()).toEqual(['200', '503']);
    expect(spec.components.schemas).toEqual({});

    const errorSchema = JSON.stringify(healthDb['503']);
    expect(errorSchema).toContain('VALIDATION_ERROR');
    expect(errorSchema).toContain('SERVICE_UNAVAILABLE');
    expect(errorSchema).toContain('"enum":[false]');
  });
});
