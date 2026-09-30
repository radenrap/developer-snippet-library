import { defineConfig } from 'drizzle-kit';
import { getDatabaseUrl } from './src/env';

/**
 * Konfigurasi drizzle-kit untuk generate/migrate/push/studio.
 * URL koneksi memakai resolver yang sama dengan runtime aplikasi.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  strict: true,
  verbose: true,
});
