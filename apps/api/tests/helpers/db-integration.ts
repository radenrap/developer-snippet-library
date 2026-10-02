import type { Database } from '@snippets/db';
import { closeDb, getDb } from '@snippets/db';
import { sql } from 'drizzle-orm';
import { buildApp } from '../../src/app';

/** Tipe parameter `tx` milik `db.transaction(...)`. */
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type App = Awaited<ReturnType<typeof buildApp>>;

/**
 * Penanda internal untuk memaksa rollback.
 *
 * Dilempar (bukan memanggil `tx.rollback()`) supaya jalur pembatalannya seragam:
 * drizzle menangkap error, menjalankan ROLLBACK, lalu melemparnya kembali, dan
 * `settled` di bawah menelan penanda ini agar `release()` tidak pernah reject.
 */
const ROLLBACK = Symbol('rollback');

let availability: boolean | undefined;

/**
 * Cek sekali apakah PostgreSQL bisa dipakai.
 *
 * Hasilnya menentukan `describe` vs `describe.skip`: tanpa database, test
 * integrasi di-SKIP (bukan gagal), jadi `pnpm test` tetap hijau di mesin atau CI
 * yang tidak menjalankan Docker.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  if (availability !== undefined) {
    return availability;
  }

  try {
    await getDb().execute(sql`select 1`);
    availability = true;
  } catch {
    availability = false;
  }

  return availability;
}

export type DbTestContext = {
  /** App Fastify yang `fastify.db`-nya adalah `tx`. */
  app: App;
  /** Transaksi uji: dipakai menyiapkan fixture dan memeriksa keadaan DB. */
  tx: Tx;
  /** Rollback transaksi lalu tutup app. Wajib dipanggil di `afterEach`. */
  release: () => Promise<void>;
};

/**
 * Membangun app yang seluruh query-nya berjalan di dalam satu transaksi.
 *
 * Konsekuensinya: apa pun yang ditulis test (lewat HTTP maupun langsung ke `tx`)
 * hilang saat `release()`, jadi database developer tidak pernah kotor dan test
 * tidak perlu cleanup manual.
 *
 * Catatan perilaku: route POST/PATCH memanggil `fastify.db.transaction()` sendiri.
 * Karena `fastify.db` sudah berupa transaksi, drizzle memetakannya menjadi
 * SAVEPOINT -- sehingga error unique violation di dalamnya tidak membatalkan
 * transaksi luar, dan test berikutnya tetap bisa query.
 */
export async function createDbTestContext(): Promise<DbTestContext> {
  let resolveContext!: (context: { app: App; tx: Tx }) => void;
  let rejectContext!: (error: unknown) => void;

  const contextReady = new Promise<{ app: App; tx: Tx }>((resolve, reject) => {
    resolveContext = resolve;
    rejectContext = reject;
  });

  let openGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });

  const settled = getDb()
    .transaction(async (tx) => {
      const app = await buildApp({ db: tx });

      await app.ready();
      resolveContext({ app, tx });

      // Tahan transaksi terbuka sampai test selesai.
      await gate;

      throw ROLLBACK;
    })
    .then(undefined, (error: unknown) => {
      if (error !== ROLLBACK) {
        rejectContext(error);
      }
    });

  const { app, tx } = await contextReady;

  return {
    app,
    tx,
    release: async () => {
      openGate();
      await settled;
      await app.close();
    },
  };
}

/** Tutup pool global di akhir file test agar worker bisa berhenti bersih. */
export async function closeTestDatabase(): Promise<void> {
  availability = undefined;

  await closeDb();
}
