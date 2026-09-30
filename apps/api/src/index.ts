import { buildApp } from './app';
import { env } from './env';

const app = await buildApp();

const SIGNALS = ['SIGINT', 'SIGTERM'] as const;

let shuttingDown = false;

async function shutdown(signal: (typeof SIGNALS)[number]): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  app.log.info({ signal }, 'Shutdown dimulai');

  try {
    // Menutup server sekaligus memicu hook onClose milik dbPlugin,
    // yang menutup pool koneksi PostgreSQL.
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'Shutdown gagal');
    process.exit(1);
  }
}

for (const signal of SIGNALS) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

try {
  await app.listen({ port: env.apiPort, host: env.apiHost });
  app.log.info(`API aktif: http://${env.apiHost}:${env.apiPort} (health: /health)`);
} catch (error) {
  app.log.error({ err: error }, 'Gagal memulai server');
  process.exit(1);
}
