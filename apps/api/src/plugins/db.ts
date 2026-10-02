import type { Database } from '@snippets/db';
import { closeDb, getDb } from '@snippets/db';
import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyTypeProvider,
  FastifyTypeProviderDefault,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerBase,
  RawServerDefault,
} from 'fastify';
import fp from 'fastify-plugin';

/**
 * Augmentasi tipe FastifyInstance.
 *
 * Daftar type parameter harus ditulis ulang persis seperti deklarasi aslinya
 * (TS2428: semua deklarasi interface harus punya type parameter identik).
 * Setelah plugin ini terdaftar, `fastify.db` dikenal TypeScript di seluruh route
 * tanpa perlu casting.
 */
declare module 'fastify' {
  interface FastifyInstance<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends
      RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    Logger extends FastifyBaseLogger = FastifyBaseLogger,
    TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
  > {
    db: Database;
  }
}

/**
 * Plugin penyuntik instance Drizzle.
 *
 * Dibungkus `fastify-plugin` supaya decorator-nya tidak ter-enkapsulasi: tanpa
 * itu `fastify.db` hanya terlihat di dalam scope plugin ini dan tidak sampai ke
 * route yang didaftarkan sebagai sibling.
 *
 * Sesuai keputusan: memakai singleton lazy dari @snippets/db (`getDb()`), tanpa
 * scoping transaksi per-request. Siklus hidup koneksi dimiliki plugin ini lewat
 * hook `onClose`, sehingga `app.close()` otomatis menutup pool.
 */
export type DbPluginOptions = {
  /**
   * Instance Drizzle yang dipakai sebagai `fastify.db`.
   *
   * Bila kosong, plugin membuat singleton `getDb()` dan menutup pool-nya saat
   * app ditutup. Bila diisi -- test integrasi menyuntik transaksi yang akan
   * di-rollback -- kepemilikan koneksi tetap di pemanggil, jadi `app.close()`
   * tidak boleh menutup pool global.
   */
  db?: Database;
};

export const dbPlugin = fp(
  async (fastify: FastifyInstance, options: DbPluginOptions) => {
    const injected = options.db;

    fastify.decorate('db', injected ?? getDb());

    if (!injected) {
      fastify.addHook('onClose', async () => {
        await closeDb();
      });
    }
  },
  { name: 'db', fastify: '5.x' },
);
