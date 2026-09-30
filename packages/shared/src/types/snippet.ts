/**
 * Konstanta domain + tipe turunannya untuk Developer Snippet Library.
 * Sumber kebenaran bersama untuk skema DB (packages/db), validasi API, dan UI.
 */

/**
 * Bahasa yang dikenal UI sebagai saran autocomplete.
 * Kolom DB-nya `varchar(50)` bebas, jadi daftar ini bukan enum ketat.
 */
export const KNOWN_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'regex',
  'sql',
  'go',
  'rust',
  'bash',
  'css',
  'html',
  'json',
  'other',
] as const;
export type KnownLanguage = (typeof KNOWN_LANGUAGES)[number];

/** `relevance` hanya berlaku bila ada query full-text search. */
export const SNIPPET_SORT_FIELDS = ['relevance', 'createdAt', 'updatedAt', 'title'] as const;
export type SnippetSortField = (typeof SNIPPET_SORT_FIELDS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const EMBEDDING_STATUSES = ['pending', 'ready'] as const;
export type EmbeddingStatus = (typeof EMBEDDING_STATUSES)[number];

/** Konfigurasi text search PostgreSQL. */
export const FTS_LANGUAGE = 'english';
/** Bobot setweight untuk trigger: title > description > code. */
export const FTS_WEIGHTS = { title: 'A', description: 'B', code: 'C' } as const;

export const MAX_TITLE_LENGTH = 255;
export const MAX_LANGUAGE_LENGTH = 50;
export const MAX_TAG_LENGTH = 100;
export const MAX_CODE_LENGTH = 50_000;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_TAGS_PER_SNIPPET = 10;
export const MAX_QUERY_LENGTH = 200;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Dimensi default kolom pgvector (untuk fitur AI embedding berikutnya). */
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
