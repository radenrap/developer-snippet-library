import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { snippets } from './snippets';
import type { snippetTags, tags } from './tags';

/** Bentuk baris hasil SELECT. */
export type Snippet = InferSelectModel<typeof snippets>;
export type Tag = InferSelectModel<typeof tags>;
export type SnippetTag = InferSelectModel<typeof snippetTags>;

/** Bentuk payload INSERT (kolom ber-default menjadi opsional). */
export type NewSnippet = InferInsertModel<typeof snippets>;
export type NewTag = InferInsertModel<typeof tags>;
export type NewSnippetTag = InferInsertModel<typeof snippetTags>;

/** Snippet dengan tag yang sudah di-join lewat relasi many-to-many. */
export type SnippetWithTags = Snippet & { tags: Tag[] };

/** Snippet plus skor relevansi `ts_rank_cd`, hanya ada saat ada query FTS. */
export type SnippetWithRank = Snippet & { rank: number };
