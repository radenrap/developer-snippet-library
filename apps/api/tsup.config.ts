import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  treeshake: true,
  dts: false,
  /**
   * Package internal (@snippets/*) diekspor sebagai source TypeScript, bukan
   * dist, supaya dev-mode cukup pakai `tsx watch`. Karena itu mereka di-inline
   * ke bundle di sini.
   *
   * Dependency pihak ketiga tetap external dan di-resolve dari
   * apps/api/node_modules saat runtime (pnpm memakai isolated linker), sehingga
   * package yang dipakai @snippets/db -- drizzle-orm & postgres -- juga
   * dideklarasikan di dependencies apps/api.
   */
  noExternal: [/^@snippets\//],
});
