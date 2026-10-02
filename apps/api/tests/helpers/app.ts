import { buildApp } from '../../src/app';

/**
 * Instance Fastify siap uji.
 *
 * `app.inject()` (light-my-request) menjalankan request langsung di dalam
 * proses: tanpa membuka port dan tanpa jaringan, jadi test cepat dan tidak
 * bentrok dengan dev server di :3000.
 *
 * Membangun app TIDAK membuka koneksi database -- postgres-js baru connect
 * saat query pertama dieksekusi. Karena itu test non-DB tetap jalan walau
 * PostgreSQL sedang mati.
 */
export async function createTestApp() {
  const app = await buildApp();
  await app.ready();

  return app;
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
