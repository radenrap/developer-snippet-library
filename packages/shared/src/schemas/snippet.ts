import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  EMBEDDING_STATUSES,
  MAX_CODE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_LANGUAGE_LENGTH,
  MAX_PAGE_SIZE,
  MAX_QUERY_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_SNIPPET,
  MAX_TITLE_LENGTH,
  SNIPPET_SORT_FIELDS,
  SORT_ORDERS,
} from '../types/snippet';
import { paginationMetaSchema } from './api';

export const snippetIdSchema = z.uuid();
export const authorIdSchema = z.uuid();

/** Parameter path untuk `/api/snippets/:id`. */
export const snippetIdParamsSchema = z.object({ id: snippetIdSchema });

export type SnippetIdParams = z.output<typeof snippetIdParamsSchema>;

/** Nama tag: di-trim, masing-masing maksimal 100 karakter, maksimal 10 per snippet. */
export const tagNamesSchema = z
  .array(z.string().trim().min(1).max(MAX_TAG_LENGTH))
  .max(MAX_TAGS_PER_SNIPPET);

export const createSnippetSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  code: z.string().min(1).max(MAX_CODE_LENGTH),
  language: z.string().trim().min(1).max(MAX_LANGUAGE_LENGTH),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
  tags: tagNamesSchema.default([]),
  /** Opsional: bila kosong, API memakai `API_DEFAULT_AUTHOR_ID`. */
  authorId: z.uuid().optional(),
});

export type CreateSnippetInput = z.input<typeof createSnippetSchema>;
export type CreateSnippetDto = z.output<typeof createSnippetSchema>;

/**
 * Payload PATCH. Field yang tidak dikirim tidak diubah; `description` boleh
 * `null` untuk menghapusnya, dan `tags` bila dikirim berarti mengganti seluruh tag.
 *
 * Ditulis eksplisit, BUKAN `createSnippetSchema.partial()`: `.partial()` tetap
 * menyuntikkan `.default([])` milik field `tags`, sehingga `PATCH {}` dianggap
 * "ganti tag menjadi kosong" dan menghapus seluruh tag snippet (data loss).
 */
export const updateSnippetSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).optional(),
  code: z.string().min(1).max(MAX_CODE_LENGTH).optional(),
  language: z.string().trim().min(1).max(MAX_LANGUAGE_LENGTH).optional(),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).nullish(),
  tags: tagNamesSchema.optional(),
});

export type UpdateSnippetInput = z.input<typeof updateSnippetSchema>;
export type UpdateSnippetDto = z.output<typeof updateSnippetSchema>;

/**
 * Query string `GET /api/snippets`.
 * `q` dieksekusi sebagai full-text search (websearch_to_tsquery) terhadap
 * kolom `search_vector`; `z.coerce` dipakai karena query selalu datang sebagai string.
 */
export const listSnippetsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  q: z.string().trim().max(MAX_QUERY_LENGTH).optional(),
  language: z.string().trim().min(1).max(MAX_LANGUAGE_LENGTH).optional(),
  /** Daftar nama tag dipisahkan koma (mis. `regex,security`); semantik OR. */
  tags: z.string().trim().max(MAX_QUERY_LENGTH).optional(),
  authorId: z.uuid().optional(),
  sort: z.enum(SNIPPET_SORT_FIELDS).default('relevance'),
  order: z.enum(SORT_ORDERS).default('desc'),
});

export type ListSnippetsQuery = z.output<typeof listSnippetsQuerySchema>;

/** Bentuk snippet yang dikirim API ke klien (tag sudah di-flatten jadi string[]). */
export const snippetSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  code: z.string(),
  language: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  authorId: z.uuid(),
  embeddingStatus: z.enum(EMBEDDING_STATUSES),
  /** Skor `ts_rank_cd`; null bila request tidak memakai query FTS. */
  rank: z.number().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type SnippetDto = z.output<typeof snippetSchema>;

/** Respons `GET /api/snippets/:id`, `POST /api/snippets`, dan `PATCH /api/snippets/:id`. */
export const snippetResponseSchema = z.object({
  success: z.literal(true),
  data: snippetSchema,
});

export type SnippetResponse = z.output<typeof snippetResponseSchema>;

/** Respons `GET /api/snippets` (list ber-paginasi). */
export const snippetListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(snippetSchema),
  meta: paginationMetaSchema,
});

export type SnippetListResponse = z.output<typeof snippetListResponseSchema>;
