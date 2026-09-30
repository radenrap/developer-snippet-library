import { DEFAULT_EMBEDDING_DIMENSIONS } from '@snippets/shared';
import { customType } from 'drizzle-orm/pg-core';

interface VectorConfig {
  dimensions: number;
}

/**
 * Kolom `vector(n)` milik extension pgvector.
 *
 * - Di aplikasi nilainya `number[]`.
 * - Di driver PostgreSQL nilainya string berformat `[1,2,3]` (JSON array valid).
 *
 * Extension-nya harus aktif di database sebelum migrasi dijalankan:
 * `CREATE EXTENSION IF NOT EXISTS vector;`
 */
export const vector = customType<{
  data: number[];
  driverData: string;
  config: VectorConfig;
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS})`;
  },
  fromDriver(value): number[] {
    return JSON.parse(value) as number[];
  },
  toDriver(value): string {
    return `[${value.join(',')}]`;
  },
});
