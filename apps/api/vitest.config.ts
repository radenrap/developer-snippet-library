import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Import eksplisit (describe/it/expect dari 'vitest'), bukan globals,
    // supaya file test tetap bisa di-typecheck tsc tanpa konfigurasi tambahan.
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    // Log pino dimatikan agar output test tetap terbaca.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // Bootstrap proses (top-level await + process.exit) tidak diuji unit.
      exclude: ['src/index.ts'],
    },
  },
});
