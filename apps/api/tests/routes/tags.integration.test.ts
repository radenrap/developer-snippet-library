import { tags } from '@snippets/db';
import type { SnippetDto, SnippetResponse, TagListResponse } from '@snippets/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeTestDatabase,
  createDbTestContext,
  type DbTestContext,
  isDatabaseAvailable,
} from '../helpers/db-integration';
import { uniqueToken } from '../helpers/fixtures';

/**
 * Test integrasi `GET /api/tags`: agregasi jumlah pemakaian tag dan urutannya.
 * Sama seperti test snippet, tiap test dibungkus transaksi yang di-rollback.
 */
const databaseUp = await isDatabaseAvailable();
const describeDb = databaseUp ? describe : describe.skip;

describeDb('route tags (integrasi database)', () => {
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

  async function createWithTags(tagNames: string[]): Promise<SnippetDto> {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/snippets',
      payload: {
        title: uniqueToken('judul '),
        code: 'const contoh = true;',
        language: 'javascript',
        tags: tagNames,
      },
    });

    if (response.statusCode !== 201) {
      throw new Error(`createWithTags gagal (${response.statusCode}): ${response.body}`);
    }

    return (response.json() as SnippetResponse).data;
  }

  async function fetchTags(): Promise<TagListResponse> {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/tags' });

    expect(response.statusCode).toBe(200);

    return response.json() as TagListResponse;
  }

  it('menghitung jumlah snippet yang memakai setiap tag', async () => {
    const shared = uniqueToken('tagsama');
    const solo = uniqueToken('tagtunggal');

    await createWithTags([shared, solo]);
    await createWithTags([shared]);
    await createWithTags([shared]);

    const body = await fetchTags();
    const counts = new Map(body.data.map((tag) => [tag.name, tag.count]));

    expect(counts.get(shared)).toBe(3);
    expect(counts.get(solo)).toBe(1);
  });

  it('menyajikan bentuk DTO { id, name, count } tanpa meta paginasi', async () => {
    const tagName = uniqueToken('bentuk');
    await createWithTags([tagName]);

    const response = await ctx.app.inject({ method: 'GET', url: '/api/tags' });
    const body = response.json() as TagListResponse & { meta?: unknown };

    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toBeUndefined();

    const found = body.data.find((tag) => tag.name === tagName);
    expect(Object.keys(found ?? {}).sort()).toEqual(['count', 'id', 'name']);
  });

  it('tetap mendaftarkan tag tanpa snippet dengan count 0', async () => {
    // LEFT JOIN: tag yang belum dipakai harus tetap muncul untuk autocomplete.
    const orphan = uniqueToken('yatim');
    await ctx.tx.insert(tags).values({ name: orphan });

    const body = await fetchTags();
    const found = body.data.find((tag) => tag.name === orphan);

    expect(found).toBeDefined();
    expect(found?.count).toBe(0);
    expect(found?.id).toBeTruthy();
  });

  it('mengurutkan dari tag yang paling banyak dipakai', async () => {
    const heavy = uniqueToken('berat');
    const light = uniqueToken('ringan');

    await createWithTags([heavy]);
    await createWithTags([heavy]);
    await createWithTags([heavy]);
    await createWithTags([light]);

    const body = await fetchTags();
    const positions = new Map(body.data.map((tag, index) => [tag.name, index]));
    const heavyIndex = positions.get(heavy) ?? Number.POSITIVE_INFINITY;
    const lightIndex = positions.get(light) ?? Number.NEGATIVE_INFINITY;

    expect(heavyIndex).toBeLessThan(lightIndex);
  });

  it('memakai nama tag sebagai pemecah seri urutan', async () => {
    // Kedua tag punya count sama, jadi urutannya ditentukan oleh name asc.
    // Nama sengaja hanya huruf kecil agar tidak bergantung collation database.
    const alpha = uniqueToken('aaa');
    const omega = uniqueToken('zzz');

    await createWithTags([alpha]);
    await createWithTags([omega]);

    const body = await fetchTags();
    const positions = new Map(body.data.map((tag, index) => [tag.name, index]));

    expect(positions.get(alpha) ?? -1).toBeLessThan(positions.get(omega) ?? -1);
  });

  it('menjaga invariant urutan menurun pada seluruh daftar', async () => {
    await createWithTags([uniqueToken('invariant')]);

    const body = await fetchTags();
    const items = body.data;

    expect(items.length).toBeGreaterThan(0);

    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1];
      const current = items[index];

      if (previous && current) {
        expect(previous.count).toBeGreaterThanOrEqual(current.count);
      }
    }
  });

  it('memperbarui count saat snippet dihapus', async () => {
    const tagName = uniqueToken('hitung');
    const first = await createWithTags([tagName]);
    await createWithTags([tagName]);

    const countOf = async (name: string) => {
      const body = await fetchTags();

      return body.data.find((tag) => tag.name === name)?.count;
    };

    expect(await countOf(tagName)).toBe(2);

    const deleted = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/snippets/${first.id}`,
    });
    expect(deleted.statusCode).toBe(200);

    expect(await countOf(tagName)).toBe(1);
  });
});

// Lihat penjelasan di snippets.integration.test.ts: tanpa test ini, file yang
// seluruh describe-nya di-skip akan dianggap gagal oleh Vitest.
describe('penjaga file test', () => {
  it('mendeteksi ketersediaan database tanpa pernah gagal', async () => {
    expect(typeof (await isDatabaseAvailable())).toBe('boolean');
  });
});
