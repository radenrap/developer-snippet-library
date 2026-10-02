import { Code2 } from 'lucide-react';
import { Link } from 'react-router';

/**
 * Footer global: dirender sekali di kerangka `App`, jadi ikut tampil di semua
 * route (beranda, detail snippet, maupun 404).
 *
 * Konten sengaja statis (brand + tumpukan teknologi + tahun berjalan) supaya
 * tidak menambah request maupun state baru; `flex-col` + `flex-1` pada `main`
 * membuatnya selalu menempel di bawah viewport saat halaman pendek.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Code2 className="size-4 shrink-0 text-primary" />
          <span>
            <Link to="/" className="font-medium text-foreground hover:underline">
              DevFlow
            </Link>{' '}
            — snippet &amp; regex library.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Fastify · React · Drizzle ORM · PostgreSQL (pgvector)</span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <span>© {year} DevFlow</span>
        </div>
      </div>
    </footer>
  );
}
