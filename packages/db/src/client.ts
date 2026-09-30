import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDatabaseUrl } from './env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

type PostgresClient = ReturnType<typeof postgres>;

interface DatabaseHandle {
  db: Database;
  client: PostgresClient;
}

let handle: DatabaseHandle | undefined;

/**
 * Membuat koneksi + instance Drizzle baru.
 * Dipakai `getDb()` dan bisa dipanggil langsung untuk test/worker terpisah.
 */
export function createDatabase(databaseUrl = getDatabaseUrl()): DatabaseHandle {
  const client = postgres(databaseUrl, {
    max: 10,
    connect_timeout: 10,
    idle_timeout: 20,
  });

  return { client, db: drizzle(client, { schema }) };
}

/** Instance singleton untuk seluruh proses aplikasi. */
export function getDb(): Database {
  handle ??= createDatabase();

  return handle.db;
}

/** Menutup pool koneksi; dipanggil saat graceful shutdown. */
export async function closeDb(): Promise<void> {
  if (!handle) {
    return;
  }

  const { client } = handle;
  handle = undefined;

  await client.end({ timeout: 5 });
}
