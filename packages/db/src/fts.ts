import { FTS_LANGUAGE } from '@snippets/shared';
import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { snippets } from './schema';

/**
 * Mengubah input bebas pengguna menjadi tsquery lewat `websearch_to_tsquery`.
 * Fungsi ini tidak melempar error untuk sintaks aneh (berbeda dari `to_tsquery`)
 * dan tetap mendukung `"frasa persis"`, `-kata_dikecualikan`, serta `or`.
 */
export function toTsQuery(search: string): SQL {
  return sql`websearch_to_tsquery(${FTS_LANGUAGE}, ${search})`;
}

/** Predikat WHERE untuk full-text search terhadap kolom `search_vector`. */
export function matchesSearch(search: string): SQL {
  return sql`${snippets.searchVector} @@ ${toTsQuery(search)}`;
}

/**
 * Skor relevansi (cover density ranking). `coalesce` menjaga baris yang
 * `search_vector`-nya masih NULL agar tidak menghasilkan NULL.
 */
export function searchRank(search: string): SQL<number> {
  return sql`coalesce(ts_rank_cd(${snippets.searchVector}, ${toTsQuery(search)}), 0)`;
}
