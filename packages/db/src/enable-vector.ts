/**
 * Bootstrap extension pgvector SEBELUM migrasi.
 *
 * Migrasi `0000` membuat kolom `embedding vector(1536)` tetapi tidak menjalankan
 * `CREATE EXTENSION`. Tanpa extension `vector`, `drizzle-kit migrate` gagal dengan
 * `type "vector" does not exist`. Skrip ini idempoten (`IF NOT EXISTS`) sehingga
 * aman dijalankan berulang.
 *
 * Dipakai oleh `db:deploy` (enable-vector + migrate) di CI/CD maupun produksi:
 *
 *   pnpm --filter @snippets/db db:enable-vector
 *   pnpm --filter @snippets/db db:deploy
 *
 * Koneksi dibaca dari DATABASE_URL / POSTGRES_* lewat resolver yang sama dengan
 * runtime aplikasi (lihat ./env), jadi cukup set DATABASE_URL untuk Neon.
 */
import { sql } from 'drizzle-orm';
import { closeDb, getDb } from './client';

async function main(): Promise<void> {
  await getDb().execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  console.log('Extension "vector" siap (idempoten).');
}

try {
  await main();
} catch (error) {
  console.error('Gagal mengaktifkan extension vector:', error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
