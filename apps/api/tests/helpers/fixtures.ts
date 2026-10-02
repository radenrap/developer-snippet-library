import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

function randomLetters(length: number): string {
  const bytes = randomBytes(length);
  let out = '';

  for (const byte of bytes) {
    out += ALPHABET[byte % ALPHABET.length] ?? '';
  }

  return out;
}

/**
 * Token unik untuk data fixture.
 *
 * Hanya huruf, tanpa angka: parser text-search PostgreSQL memperlakukan token
 * alfanumerik berbeda dari `asciiword`, sedangkan `websearch_to_tsquery` harus
 * menghasilkan leksim yang persis sama dengan isi `search_vector` agar cocok.
 *
 * Unik per pemanggilan supaya tidak bentrok dengan data seed yang sudah
 * ter-commit, dengan transaksi test lain yang berjalan paralel, maupun dengan
 * unique index pada `snippets.title` dan `tags.name`.
 */
export function uniqueToken(prefix: string): string {
  return `${prefix}${randomLetters(10)}`;
}
