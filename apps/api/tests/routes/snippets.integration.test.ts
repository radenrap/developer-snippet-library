import { randomUUID } from 'node:crypto';
import { snippets, snippetTags, tags } from '@snippets/db';
import type {
  ApiErrorBody,
  SnippetDto,
  SnippetListResponse,
  SnippetResponse,
} from '@snippets/shared';
import { DEFAULT_PAGE_SIZE } from '@snippets/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/env';
import {
  closeTestDatabase,
  createDbTestContext,
  type DbTestContext,
  isDatabaseAvailable,
} from '../helpers/db-integration';
import { uniqueToken } from '../helpers/fixtures';

/**
 * Test integrasi route snippet terhadap PostgreSQL sungguhan.
 *
 * Setiap test berjalan di dalam satu transaksi yang di-rollback di akhir, jadi
 * query yang diuji adalah SQL asli (trigger tsvector, savepoint, ON DELETE
 * CASCADE, unique index) tanpa mengotori database developer.
 *
 * Tanpa PostgreSQL, seluruh blok di-skip -- bukan gagal.
 */
const databaseUp = await isDatabaseAvailable();
const describeDb = databaseUp ? describe : describe.skip;

describeDb('route snippets (integrasi database)', () => {
  let ctx: DbTestContext;

  beforeEach(async () => {
    ctx = await createDbTestContext();
  });

  afterEach(async () => {
    await ctx.release();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  type CreateInput = {
    title?: string;
    code?: string;
    language?: string;
    description?: string;
    tags?: string[];
    authorId?: string;
  };

  /** Buat snippet lewat HTTP supaya jalur produksi (trigger + syncTags) ikut teruji. */
  async function createSnippet(input: CreateInput = {}): Promise<SnippetDto> {
    const payload: Record<string, unknown> = {
      title: input.title ?? uniqueToken('judul '),
      code: input.code ?? 'const contoh = true;',
      language: input.language ?? 'javascript',
    };

    if (input.description !== undefined) {
      payload.description = input.description;
    }
    if (input.tags !== undefined) {
      payload.tags = input.tags;
    }
    if (input.authorId !== undefined) {
      payload.authorId = input.authorId;
    }

    const response = await ctx.app.inject({ method: 'POST', url: '/api/snippets', payload });

    if (response.statusCode !== 201) {
      throw new Error(`createSnippet gagal (${response.statusCode}): ${response.body}`);
    }

    return (response.json() as SnippetResponse).data;
  }

  function sorted(values: string[]): string[] {
    return [...values].sort();
  }

  describe('POST /api/snippets', () => {
    it('menyimpan snippet beserta tag dan mengisi search_vector lewat trigger', async () => {
      const token = uniqueToken('qux');
      const tagName = uniqueToken('tagbuat');
      const created = await createSnippet({
        title: `Judul ${token}`,
        code: `const token = '${token}';`,
        description: 'deskripsi uji',
        tags: [tagName],
      });

      expect(created.title).toBe(`Judul ${token}`);
      expect(created.description).toBe('deskripsi uji');
      expect(created.tags).toEqual([tagName]);
      expect(created.authorId).toBe(env.defaultAuthorId);
      expect(created.embeddingStatus).toBe('pending');
      expect(created.rank).toBeNull();
      expect(Date.parse(created.createdAt)).not.toBeNaN();

      const rows = await ctx.tx.select().from(snippets).where(eq(snippets.id, created.id));
      expect(rows).toHaveLength(1);

      // Trigger BEFORE INSERT mengisi tsvector dengan bobot A untuk judul.
      const searchVector = rows[0]?.searchVector ?? '';
      expect(searchVector).toContain(token.toLowerCase());
      expect(searchVector).toMatch(new RegExp(`'${token.toLowerCase()}':\\d+A`));
    });

    it('memakai authorId dari payload bila dikirim', async () => {
      const authorId = randomUUID();
      const created = await createSnippet({ authorId });

      expect(created.authorId).toBe(authorId);
    });

    it('menormalkan tag duplikat dan ber-spasi menjadi satu baris snippet_tags', async () => {
      const tagName = uniqueToken('norm');
      const created = await createSnippet({ tags: [tagName, tagName, `  ${tagName}  `] });

      expect(created.tags).toEqual([tagName]);

      const links = await ctx.tx
        .select()
        .from(snippetTags)
        .where(eq(snippetTags.snippetId, created.id));
      expect(links).toHaveLength(1);
    });

    it('menolak judul duplikat dengan 409 CONFLICT', async () => {
      const title = uniqueToken('duplikat ');
      const first = await createSnippet({ title });

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/api/snippets',
        payload: { title, code: 'const duplikat = true;', language: 'javascript' },
      });

      expect(response.statusCode).toBe(409);

      const body = response.json() as ApiErrorBody;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toContain(title);

      // Savepoint: unique violation di dalam nested transaction tidak boleh
      // membatalkan transaksi luar. Bila itu terjadi, query berikut error
      // "current transaction is aborted".
      const rows = await ctx.tx
        .select({ id: snippets.id })
        .from(snippets)
        .where(eq(snippets.title, title));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(first.id);
    });
  });

  describe('GET /api/snippets', () => {
    it('mengembalikan envelope list dengan meta default dan rank null', async () => {
      const response = await ctx.app.inject({ method: 'GET', url: '/api/snippets' });

      expect(response.statusCode).toBe(200);

      const body = response.json() as SnippetListResponse;
      expect(body.success).toBe(true);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(DEFAULT_PAGE_SIZE);
      expect(body.meta.query).toBeNull();
      expect(body.meta.total).toBeGreaterThanOrEqual(body.data.length);
      expect(body.data.length).toBeLessThanOrEqual(DEFAULT_PAGE_SIZE);
      expect(body.data.every((item) => item.rank === null)).toBe(true);
    });

    it('memeringkat kecocokan judul (bobot A) di atas kecocokan kode (bobot C)', async () => {
      const token = uniqueToken('parsing');
      const titleHit = await createSnippet({
        title: `Panduan ${token}`,
        code: 'const a = 1;',
      });
      const codeHit = await createSnippet({
        title: uniqueToken('judul '),
        code: `// ${token}\nconst b = 2;`,
      });

      const response = await ctx.app.inject({
        method: 'GET',
        url: `/api/snippets?q=${token}`,
      });

      expect(response.statusCode).toBe(200);

      const body = response.json() as SnippetListResponse;
      expect(body.meta.query).toBe(token);
      expect(body.meta.total).toBe(2);

      const ids = body.data.map((item) => item.id);
      expect(ids).toEqual([titleHit.id, codeHit.id]);

      const titleRank = body.data[0]?.rank ?? 0;
      const codeRank = body.data[1]?.rank ?? 0;
      expect(titleRank).toBeGreaterThan(codeRank);
      expect(codeRank).toBeGreaterThan(0);
    });

    it('memfilter beberapa tag dengan semantik OR', async () => {
      const tagA = uniqueToken('ora');
      const tagB = uniqueToken('orb');
      const tagC = uniqueToken('orc');
      const snippetA = await createSnippet({ tags: [tagA] });
      const snippetB = await createSnippet({ tags: [tagB] });
      const snippetC = await createSnippet({ tags: [tagC] });

      const response = await ctx.app.inject({
        method: 'GET',
        url: `/api/snippets?tags=${tagA},${tagB}`,
      });

      const body = response.json() as SnippetListResponse;
      expect(body.meta.total).toBe(2);
      expect(sorted(body.data.map((item) => item.id))).toEqual(sorted([snippetA.id, snippetB.id]));
      expect(body.data.map((item) => item.id)).not.toContain(snippetC.id);
    });

    it('memfilter berdasarkan language', async () => {
      const language = uniqueToken('bahasa');
      await createSnippet({ language });
      await createSnippet({ language });
      await createSnippet({ language: 'python' });

      const response = await ctx.app.inject({
        method: 'GET',
        url: `/api/snippets?language=${language}`,
      });

      const body = response.json() as SnippetListResponse;
      expect(body.meta.total).toBe(2);
      expect(body.data.every((item) => item.language === language)).toBe(true);
    });

    it('membagi hasil ke beberapa halaman tanpa tumpang tindih', async () => {
      const tagName = uniqueToken('paging');
      const created = [
        await createSnippet({ tags: [tagName] }),
        await createSnippet({ tags: [tagName] }),
        await createSnippet({ tags: [tagName] }),
      ];

      const first = await ctx.app.inject({
        method: 'GET',
        url: `/api/snippets?tags=${tagName}&pageSize=2&page=1`,
      });
      const second = await ctx.app.inject({
        method: 'GET',
        url: `/api/snippets?tags=${tagName}&pageSize=2&page=2`,
      });

      const pageOne = first.json() as SnippetListResponse;
      const pageTwo = second.json() as SnippetListResponse;

      expect(pageOne.data).toHaveLength(2);
      expect(pageOne.meta).toMatchObject({ page: 1, limit: 2, total: 3 });
      expect(pageTwo.data).toHaveLength(1);
      expect(pageTwo.meta).toMatchObject({ page: 2, limit: 2, total: 3 });

      const collected = [...pageOne.data, ...pageTwo.data].map((item) => item.id);
      expect(sorted(collected)).toEqual(sorted(created.map((item) => item.id)));
      expect(new Set(collected).size).toBe(3);
    });

    it('mengurutkan berdasarkan title asc bila diminta', async () => {
      const tagName = uniqueToken('sorting');
      const base = uniqueToken('urut');
      await createSnippet({ title: `${base} charlie`, tags: [tagName] });
      await createSnippet({ title: `${base} alpha`, tags: [tagName] });
      await createSnippet({ title: `${base} bravo`, tags: [tagName] });

      const response = await ctx.app.inject({
        method: 'GET',
        url: `/api/snippets?tags=${tagName}&sort=title&order=asc`,
      });

      const body = response.json() as SnippetListResponse;
      expect(body.data.map((item) => item.title)).toEqual([
        `${base} alpha`,
        `${base} bravo`,
        `${base} charlie`,
      ]);
    });

    it('menolak pageSize di atas batas maksimum', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/api/snippets?pageSize=1000',
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ApiErrorBody).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/snippets/:id', () => {
    it('mengembalikan snippet beserta tag-nya', async () => {
      const tagName = uniqueToken('tagdetail');
      const created = await createSnippet({ tags: [tagName], description: 'isi' });

      const response = await ctx.app.inject({
        method: 'GET',
        url: `/api/snippets/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as SnippetResponse).data).toEqual(created);
    });

    it('membalas 404 untuk id yang tidak ada', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: `/api/snippets/${randomUUID()}`,
      });

      expect(response.statusCode).toBe(404);

      const body = response.json() as ApiErrorBody;
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Snippet tidak ditemukan');
    });
  });

  describe('PATCH /api/snippets/:id', () => {
    it('memperbarui kolom yang dikirim tanpa menyentuh tag', async () => {
      const tagA = uniqueToken('patcha');
      const tagB = uniqueToken('patchb');
      const created = await createSnippet({ tags: [tagA, tagB], description: 'lama' });
      const newTitle = uniqueToken('judul baru ');

      const response = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/snippets/${created.id}`,
        payload: { title: newTitle, description: null },
      });

      expect(response.statusCode).toBe(200);

      const data = (response.json() as SnippetResponse).data;
      expect(data.title).toBe(newTitle);
      expect(data.description).toBeNull();
      expect(data.code).toBe(created.code);
      expect(sorted(data.tags)).toEqual(sorted([tagA, tagB]));
      expect(Date.parse(data.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));
    });

    it('menolak PATCH kosong dan membiarkan tag tetap utuh', async () => {
      // Regresi bug data loss: `createSnippetSchema.partial()` dulu menyuntikkan
      // `.default([])` pada `tags`, sehingga PATCH {} menghapus semua tag.
      const tagName = uniqueToken('kosong');
      const created = await createSnippet({ tags: [tagName] });

      const response = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/snippets/${created.id}`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ApiErrorBody).error.message).toContain(
        'Tidak ada field yang perlu diperbarui',
      );

      const after = await ctx.app.inject({
        method: 'GET',
        url: `/api/snippets/${created.id}`,
      });
      const data = (after.json() as SnippetResponse).data;
      expect(data.tags).toEqual([tagName]);
      expect(data.title).toBe(created.title);
    });

    it('mengosongkan tag hanya bila tags: [] dikirim eksplisit', async () => {
      const tagA = uniqueToken('cleara');
      const tagB = uniqueToken('clearb');
      const created = await createSnippet({ tags: [tagA, tagB] });

      const response = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/snippets/${created.id}`,
        payload: { tags: [] },
      });

      expect(response.statusCode).toBe(200);

      const data = (response.json() as SnippetResponse).data;
      expect(data.tags).toEqual([]);
      expect(data.title).toBe(created.title);
      expect(data.code).toBe(created.code);

      const links = await ctx.tx
        .select()
        .from(snippetTags)
        .where(eq(snippetTags.snippetId, created.id));
      expect(links).toHaveLength(0);

      // Tag bersifat global: tidak ikut dihapus saat lepas dari snippet.
      const remaining = await ctx.tx
        .select()
        .from(tags)
        .where(inArray(tags.name, [tagA, tagB]));
      expect(remaining).toHaveLength(2);
    });

    it('mengganti seluruh tag sekaligus', async () => {
      const oldTag = uniqueToken('lama');
      const newTag = uniqueToken('baru');
      const created = await createSnippet({ tags: [oldTag] });

      const response = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/snippets/${created.id}`,
        payload: { tags: [newTag] },
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as SnippetResponse).data.tags).toEqual([newTag]);
    });

    it('menolak judul yang sudah dipakai snippet lain dengan 409', async () => {
      const taken = uniqueToken('sudah dipakai ');
      await createSnippet({ title: taken });
      const other = await createSnippet();

      const response = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/snippets/${other.id}`,
        payload: { title: taken },
      });

      expect(response.statusCode).toBe(409);
      expect((response.json() as ApiErrorBody).error.code).toBe('CONFLICT');

      const after = await ctx.app.inject({
        method: 'GET',
        url: `/api/snippets/${other.id}`,
      });
      expect((after.json() as SnippetResponse).data.title).toBe(other.title);
    });

    it('membalas 404 bila id tidak dikenal', async () => {
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/snippets/${randomUUID()}`,
        payload: { title: 'tidak akan tersimpan' },
      });

      expect(response.statusCode).toBe(404);
      expect((response.json() as ApiErrorBody).error.code).toBe('NOT_FOUND');
    });

    it('memperbarui search_vector saat judul berubah', async () => {
      const token = uniqueToken('triggerupdate');
      const created = await createSnippet();

      const before = await ctx.app.inject({ method: 'GET', url: `/api/snippets?q=${token}` });
      expect((before.json() as SnippetListResponse).data.map((item) => item.id)).not.toContain(
        created.id,
      );

      const patched = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/snippets/${created.id}`,
        payload: { title: `Judul ${token}` },
      });
      expect(patched.statusCode).toBe(200);

      const after = await ctx.app.inject({ method: 'GET', url: `/api/snippets?q=${token}` });
      const body = after.json() as SnippetListResponse;
      expect(body.data.map((item) => item.id)).toContain(created.id);

      const rows = await ctx.tx.select().from(snippets).where(eq(snippets.id, created.id));
      expect(rows[0]?.searchVector ?? '').toMatch(new RegExp(`'${token}':\\d+A`));
    });
  });

  describe('DELETE /api/snippets/:id', () => {
    it('menghapus snippet beserta baris snippet_tags lewat cascade', async () => {
      const tagName = uniqueToken('taghapus');
      const created = await createSnippet({ tags: [tagName] });

      const response = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/snippets/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, data: { id: created.id } });

      const rows = await ctx.tx.select().from(snippets).where(eq(snippets.id, created.id));
      expect(rows).toHaveLength(0);

      const links = await ctx.tx
        .select()
        .from(snippetTags)
        .where(eq(snippetTags.snippetId, created.id));
      expect(links).toHaveLength(0);

      const remainingTag = await ctx.tx.select().from(tags).where(eq(tags.name, tagName));
      expect(remainingTag).toHaveLength(1);
    });

    it('berhasil tanpa header content-type', async () => {
      // Sisi lain dari regresi tombol "Hapus": request tanpa body tidak boleh
      // membawa content-type application/json.
      const created = await createSnippet();

      const response = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/snippets/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
    });

    it('membalas 404 untuk id yang tidak ada', async () => {
      const response = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/snippets/${randomUUID()}`,
      });

      expect(response.statusCode).toBe(404);
      expect((response.json() as ApiErrorBody).error.code).toBe('NOT_FOUND');
    });
  });

  describe('error tak terduga dari driver', () => {
    it('menyamarkan error database menjadi 500 INTERNAL_ERROR', async () => {
      // Paksa transaksi masuk keadaan aborted: query berikutnya akan gagal
      // dengan "current transaction is aborted", setara dengan error driver
      // tak terduga di produksi.
      await expect(ctx.tx.execute(sql`select 1/0`)).rejects.toThrow();

      const response = await ctx.app.inject({ method: 'GET', url: '/api/snippets' });

      expect(response.statusCode).toBe(500);

      const body = response.json() as ApiErrorBody;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Terjadi kesalahan internal pada server');
      // Detail internal tidak boleh bocor ke klien.
      expect(response.body).not.toContain('division');
      expect(response.body).not.toContain('22012');
      expect(response.body).not.toContain('select');
    });
  });
});

// Vitest memperlakukan file tanpa satu pun test sebagai kegagalan ("No test
// suite found in file"). Bila PostgreSQL mati, seluruh `describeDb` di atas
// di-skip, jadi test penjaga ini membuat file tetap berisi sesuatu dan
// `pnpm test` tetap hijau tanpa Docker.
describe('penjaga file test', () => {
  it('mendeteksi ketersediaan database tanpa pernah gagal', async () => {
    expect(typeof (await isDatabaseAvailable())).toBe('boolean');
  });
});
