import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Boleh berisi beberapa origin dipisahkan koma. */
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  /**
   * Dipakai bila payload create tidak menyertakan `authorId`.
   * Autentikasi belum ada, jadi ini placeholder sampai tabel users dibuat.
   */
  API_DEFAULT_AUTHOR_ID: z.uuid().default('00000000-0000-4000-8000-000000000001'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join(', ');

  throw new Error(`Konfigurasi API tidak valid -> ${details}`);
}

const raw = parsed.data;

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  apiHost: raw.API_HOST,
  apiPort: raw.API_PORT,
  logLevel: raw.LOG_LEVEL,
  defaultAuthorId: raw.API_DEFAULT_AUTHOR_ID,
  corsOrigins: raw.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
};
