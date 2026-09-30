import type { Snippet } from '@snippets/db';
import type { SnippetDto } from '@snippets/shared';

/**
 * Bagian baris snippet yang dibutuhkan untuk membangun DTO.
 * `searchVector` sengaja di-omit: isi tsvector tidak perlu dikirim ke klien,
 * dan query daftar memang tidak memilih kolom tersebut.
 */
export type SnippetDtoSource = Omit<Snippet, 'searchVector'>;

/**
 * Mapping row database -> DTO.
 * `Date` menjadi string ISO, kolom embedding diringkas jadi status, dan tag
 * (relasi many-to-many) di-flatten menjadi string[].
 */
export function toSnippetDto(
  row: SnippetDtoSource,
  tagNames: string[],
  rank: number | null = null,
): SnippetDto {
  return {
    id: row.id,
    title: row.title,
    code: row.code,
    language: row.language,
    description: row.description,
    tags: tagNames,
    authorId: row.authorId,
    embeddingStatus: row.embedding === null ? 'pending' : 'ready',
    rank,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** `ts_rank_cd` bisa datang sebagai string dari driver; normalkan ke number. */
export function toRank(value: unknown): number {
  const rank = Number(value);

  return Number.isFinite(rank) ? rank : 0;
}
