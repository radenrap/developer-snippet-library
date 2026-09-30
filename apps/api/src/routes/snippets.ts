import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import type { Database, NewSnippet, Snippet } from '@snippets/db';
import { matchesSearch, searchRank, snippets, snippetTags, tags } from '@snippets/db';
import type { PaginationMeta } from '@snippets/shared';
import {
  apiErrorSchema,
  createSnippetSchema,
  deletedResponseSchema,
  listSnippetsQuerySchema,
  snippetIdParamsSchema,
  snippetListResponseSchema,
  snippetResponseSchema,
  updateSnippetSchema,
} from '@snippets/shared/validators';
import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { env } from '../env';
import {
  conflict,
  internalError,
  isUniqueViolation,
  notFound,
  validationError,
} from '../lib/api-error';
import { ok, okList } from '../lib/respond';
import { toRank, toSnippetDto } from '../lib/serialize';

/** Tipe parameter `tx` milik `db.transaction(...)`, agar helper bisa dipakai di dalamnya. */
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Mengganti seluruh tag milik satu snippet.
 * Tag bersifat global dan unik per nama, jadi di-upsert lebih dulu lalu
 * dipetakan ke `snippet_tags`.
 */
async function syncTags(tx: Tx, snippetId: string, names: string[]): Promise<void> {
  const unique = [...new Set(names.map((name) => name.trim()).filter((name) => name.length > 0))];

  await tx.delete(snippetTags).where(eq(snippetTags.snippetId, snippetId));

  if (unique.length === 0) {
    return;
  }

  await tx
    .insert(tags)
    .values(unique.map((name) => ({ name })))
    .onConflictDoNothing({ target: tags.name });

  const existing = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.name, unique));

  if (existing.length > 0) {
    await tx
      .insert(snippetTags)
      .values(existing.map((row) => ({ snippetId, tagId: row.id })))
      .onConflictDoNothing();
  }
}

/** Ambil nama tag untuk banyak snippet dalam satu query (menghindari N+1). */
async function fetchTagNames(db: Database, ids: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();

  if (ids.length === 0) {
    return result;
  }

  const rows = await db
    .select({ snippetId: snippetTags.snippetId, name: tags.name })
    .from(snippetTags)
    .innerJoin(tags, eq(tags.id, snippetTags.tagId))
    .where(inArray(snippetTags.snippetId, ids));

  for (const row of rows) {
    const list = result.get(row.snippetId);

    if (list) {
      list.push(row.name);
    } else {
      result.set(row.snippetId, [row.name]);
    }
  }

  return result;
}

/**
 * Ambil satu snippet beserta nama tag-nya.
 *
 * drizzle-orm 0.45.3 belum bisa menginfer relasi many-to-many implisit:
 * `with: { tags: true }` melempar "There is not enough information to infer
 * relation". Karena itu traversal dilakukan lewat join table
 * (snippetTags -> tag), jalur yang didukung penuh dan sudah teruji.
 */
async function findSnippetWithTags(
  db: Database,
  id: string,
): Promise<{ row: Snippet; tagNames: string[] } | null> {
  const found = await db.query.snippets.findFirst({
    where: eq(snippets.id, id),
    with: { snippetTags: { with: { tag: true } } },
  });

  if (!found) {
    return null;
  }

  return { row: found, tagNames: found.snippetTags.map((link) => link.tag.name) };
}

/** `tags=a,b` -> ['a', 'b'] (unik, tanpa elemen kosong). */
function parseTagList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  const names = raw
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  return [...new Set(names)];
}

const SORTABLE_COLUMNS = {
  title: snippets.title,
  createdAt: snippets.createdAt,
  updatedAt: snippets.updatedAt,
} as const;

export const snippetRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/snippets',
    {
      schema: {
        tags: ['snippets'],
        summary: 'Daftar snippet dengan full-text search',
        description:
          'Param `q` dieksekusi sebagai tsquery terhadap kolom `search_vector` ' +
          '(dukung `"frasa persis"`, `-kata`, dan `or`). Sortir default `relevance` ' +
          'memakai ts_rank_cd dengan bobot A=judul, B=deskripsi, C=kode. ' +
          'Param `tags` menerima daftar nama dipisahkan koma dengan semantik OR.',
        querystring: listSnippetsQuerySchema,
        response: { 200: snippetListResponseSchema, 400: apiErrorSchema },
      },
    },
    async (request) => {
      const { page, pageSize, q, language, tags: tagFilter, authorId, sort, order } = request.query;
      const conditions: SQL[] = [];

      if (q) {
        conditions.push(matchesSearch(q));
      }

      if (language) {
        conditions.push(eq(snippets.language, language));
      }

      if (authorId) {
        conditions.push(eq(snippets.authorId, authorId));
      }

      // Multi-tag dengan semantik OR: snippet cocok bila punya salah satu tag.
      const requestedTags = parseTagList(tagFilter);

      if (requestedTags.length > 0) {
        const matchingSnippetIds = fastify.db
          .select({ id: snippetTags.snippetId })
          .from(snippetTags)
          .innerJoin(tags, eq(tags.id, snippetTags.tagId))
          .where(inArray(tags.name, requestedTags));

        conditions.push(inArray(snippets.id, matchingSnippetIds));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      // `.as('rank')` wajib: tanpa alias, drizzle tidak menamai kolom hasil
      // ekspresi sql mentah sehingga ORDER BY rank gagal.
      const rank = q ? searchRank(q).as('rank') : sql<number>`0`.as('rank');
      const useRelevance = sort === 'relevance' && Boolean(q);
      const direction = order === 'asc' ? asc : desc;
      const orderBy = useRelevance
        ? desc(rank)
        : direction(sort === 'relevance' ? snippets.updatedAt : SORTABLE_COLUMNS[sort]);

      const db = fastify.db;

      const [rows, totals] = await Promise.all([
        db
          .select({
            id: snippets.id,
            title: snippets.title,
            code: snippets.code,
            language: snippets.language,
            description: snippets.description,
            authorId: snippets.authorId,
            embedding: snippets.embedding,
            createdAt: snippets.createdAt,
            updatedAt: snippets.updatedAt,
            rank,
          })
          .from(snippets)
          .where(where)
          .orderBy(orderBy)
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ total: sql<number>`count(*)::int` }).from(snippets).where(where),
      ]);

      const tagNames = await fetchTagNames(
        db,
        rows.map((row) => row.id),
      );

      const meta: PaginationMeta = {
        page,
        limit: pageSize,
        total: totals[0]?.total ?? 0,
        query: q ?? null,
      };

      return okList(
        rows.map((row) =>
          toSnippetDto(row, tagNames.get(row.id) ?? [], q ? toRank(row.rank) : null),
        ),
        meta,
      );
    },
  );

  fastify.get(
    '/snippets/:id',
    {
      schema: {
        tags: ['snippets'],
        summary: 'Ambil satu snippet beserta tag-nya',
        params: snippetIdParamsSchema,
        response: { 200: snippetResponseSchema, 404: apiErrorSchema },
      },
    },
    async (request) => {
      const found = await findSnippetWithTags(fastify.db, request.params.id);

      if (!found) {
        throw notFound('Snippet');
      }

      return ok(toSnippetDto(found.row, found.tagNames));
    },
  );

  fastify.post(
    '/snippets',
    {
      schema: {
        tags: ['snippets'],
        summary: 'Buat snippet baru',
        description:
          '`authorId` opsional; bila kosong dipakai API_DEFAULT_AUTHOR_ID. ' +
          'Judul duplikat ditolak dengan 409 CONFLICT.',
        body: createSnippetSchema,
        response: { 201: snippetResponseSchema, 400: apiErrorSchema, 409: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const input = request.body;
      let createdId: string | null;

      try {
        createdId = await fastify.db.transaction(async (tx) => {
          const inserted = await tx
            .insert(snippets)
            .values({
              title: input.title,
              code: input.code,
              language: input.language,
              description: input.description ?? null,
              authorId: input.authorId ?? env.defaultAuthorId,
            })
            .returning({ id: snippets.id });

          const insertedRow = inserted[0];

          if (!insertedRow) {
            return null;
          }

          await syncTags(tx, insertedRow.id, input.tags);

          return insertedRow.id;
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict(`Snippet dengan judul "${input.title}" sudah ada`);
        }

        throw error;
      }

      if (!createdId) {
        throw internalError('Snippet gagal disimpan');
      }

      const found = await findSnippetWithTags(fastify.db, createdId);

      if (!found) {
        throw internalError('Snippet gagal dibaca kembali');
      }

      reply.code(201);

      return ok(toSnippetDto(found.row, found.tagNames));
    },
  );

  fastify.patch(
    '/snippets/:id',
    {
      schema: {
        tags: ['snippets'],
        summary: 'Perbarui sebagian field snippet',
        description:
          'Field yang tidak dikirim tidak diubah. `tags` bila dikirim berarti ' +
          'mengganti seluruh tag. Judul duplikat ditolak dengan 409 CONFLICT.',
        params: snippetIdParamsSchema,
        body: updateSnippetSchema,
        response: {
          200: snippetResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      // `tags` bukan kolom snippets, jadi dipisah dan ditangani lewat syncTags.
      const { tags: nextTags, ...columns } = request.body;
      const patch = Object.fromEntries(
        Object.entries(columns).filter(([, value]) => value !== undefined),
      ) as Partial<NewSnippet>;

      const hasColumnPatch = Object.keys(patch).length > 0;
      // `tags: []` yang dikirim eksplisit berarti "kosongkan tag" (valid);
      // yang ditolak adalah PATCH tanpa field sama sekali.
      const hasTagPatch = nextTags !== undefined;

      if (!hasColumnPatch && !hasTagPatch) {
        throw validationError([], 'Tidak ada field yang perlu diperbarui');
      }

      try {
        await fastify.db.transaction(async (tx) => {
          if (hasColumnPatch) {
            await tx.update(snippets).set(patch).where(eq(snippets.id, id));
          }

          if (hasTagPatch) {
            await syncTags(tx, id, nextTags);
          }
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict(`Snippet dengan judul "${patch.title}" sudah ada`);
        }

        throw error;
      }

      const found = await findSnippetWithTags(fastify.db, id);

      if (!found) {
        throw notFound('Snippet');
      }

      return ok(toSnippetDto(found.row, found.tagNames));
    },
  );

  fastify.delete(
    '/snippets/:id',
    {
      schema: {
        tags: ['snippets'],
        summary: 'Hapus snippet',
        description: 'Baris `snippet_tags` ikut terhapus lewat ON DELETE CASCADE.',
        params: snippetIdParamsSchema,
        response: { 200: deletedResponseSchema, 404: apiErrorSchema },
      },
    },
    async (request) => {
      const { id } = request.params;

      const deleted = await fastify.db
        .delete(snippets)
        .where(eq(snippets.id, id))
        .returning({ id: snippets.id });

      if (deleted.length === 0) {
        throw notFound('Snippet');
      }

      return ok({ id });
    },
  );
};
