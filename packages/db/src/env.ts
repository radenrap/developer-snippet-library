import { z } from 'zod';

/**
 * Konfigurasi koneksi database.
 * Default-nya sengaja mengikuti docker-compose.yml (dev/dev/snippets_db)
 * supaya `pnpm dev` langsung jalan tanpa file .env.
 */
const dbEnvSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  POSTGRES_HOST: z.string().min(1).default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65_535).default(5432),
  POSTGRES_USER: z.string().min(1).default('dev'),
  POSTGRES_PASSWORD: z.string().default('dev'),
  POSTGRES_DB: z.string().min(1).default('snippets_db'),
  POSTGRES_SSL: z.enum(['true', 'false']).default('false'),
});

const parsed = dbEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join(', ');
  throw new Error(`Konfigurasi database tidak valid -> ${details}`);
}

const dbEnv = parsed.data;

/** URL koneksi final: pakai DATABASE_URL bila ada, kalau tidak rakit dari POSTGRES_*. */
export function getDatabaseUrl(): string {
  if (dbEnv.DATABASE_URL) {
    return dbEnv.DATABASE_URL;
  }

  const password = encodeURIComponent(dbEnv.POSTGRES_PASSWORD);
  const query = dbEnv.POSTGRES_SSL === 'true' ? '?sslmode=require' : '';

  return [
    `postgresql://${dbEnv.POSTGRES_USER}:${password}`,
    `@${dbEnv.POSTGRES_HOST}:${dbEnv.POSTGRES_PORT}/${dbEnv.POSTGRES_DB}`,
    query,
  ].join('');
}

/** Nama database aktif, dipakai untuk health check & logging. */
export function getDatabaseName(): string {
  return dbEnv.POSTGRES_DB;
}
