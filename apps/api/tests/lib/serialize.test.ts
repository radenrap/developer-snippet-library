import type { Snippet } from '@snippets/db';
import { describe, expect, it } from 'vitest';
import { toRank, toSnippetDto } from '../../src/lib/serialize';

const AUTHOR_ID = '00000000-0000-4000-8000-000000000001';
const SNIPPET_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

/** `searchVector` sengaja tidak dipakai DTO, jadi di-omit dari sumbernya. */
type RowSource = Omit<Snippet, 'searchVector'>;

function makeRow(overrides: Partial<RowSource> = {}): RowSource {
  return {
    id: SNIPPET_ID,
    title: 'Judul snippet',
    code: 'const a = 1;',
    language: 'javascript',
    description: null,
    authorId: AUTHOR_ID,
    embedding: null,
    createdAt: new Date('2026-09-30T01:02:03.000Z'),
    updatedAt: new Date('2026-09-30T04:05:06.000Z'),
    ...overrides,
  };
}

const tagNames = ['hooks', 'react'];

describe('toSnippetDto', () => {
  it('memetakan baris DB ke DTO dan mengubah Date menjadi string ISO', () => {
    const dto = toSnippetDto(makeRow(), tagNames);

    expect(dto).toEqual({
      id: SNIPPET_ID,
      title: 'Judul snippet',
      code: 'const a = 1;',
      language: 'javascript',
      description: null,
      tags: ['hooks', 'react'],
      authorId: AUTHOR_ID,
      embeddingStatus: 'pending',
      rank: null,
      createdAt: '2026-09-30T01:02:03.000Z',
      updatedAt: '2026-09-30T04:05:06.000Z',
    });
  });

  it('memindahkan nama tag apa adanya dan mempertahankan urutan input', () => {
    const dto = toSnippetDto(makeRow(), ['zebra', 'alpha']);
    expect(dto.tags).toEqual(['zebra', 'alpha']);
  });

  it('menghasilkan array kosong bila snippet tidak punya tag', () => {
    expect(toSnippetDto(makeRow(), []).tags).toEqual([]);
  });

  it('menandai embeddingStatus ready hanya bila kolom embedding terisi', () => {
    expect(toSnippetDto(makeRow({ embedding: null }), []).embeddingStatus).toBe('pending');
    expect(toSnippetDto(makeRow({ embedding: [0.1, 0.2] }), []).embeddingStatus).toBe('ready');
  });

  it('mengikuti nilai rank yang diberikan (relevansi FTS)', () => {
    expect(toSnippetDto(makeRow(), tagNames, 0.62).rank).toBe(0.62);
  });

  it('rank default null saat tidak ada pencarian', () => {
    expect(toSnippetDto(makeRow(), tagNames).rank).toBeNull();
  });

  it('DTO pasti serializable ke JSON (tidak ada objek Date tersisa)', () => {
    const dto = toSnippetDto(makeRow(), tagNames);
    const roundTripped = JSON.parse(JSON.stringify(dto));

    expect(roundTripped).toEqual(dto);
    expect(JSON.stringify(dto)).not.toContain('"createdAt":{}');
  });
});

describe('toRank', () => {
  it('mengembalikan angka apa adanya', () => {
    expect(toRank(0.5)).toBe(0.5);
    expect(toRank(0)).toBe(0);
    expect(toRank(1)).toBe(1);
  });

  it('mengonversi string hasil ts_rank_cd menjadi angka', () => {
    expect(toRank('0.4')).toBe(0.4);
    expect(toRank('1.00000001')).toBeCloseTo(1.00000001);
  });

  it('mengembalikan 0 untuk nilai kosong atau bukan angka', () => {
    expect(toRank(undefined)).toBe(0);
    expect(toRank(null)).toBe(0);
    expect(toRank('bukan-angka')).toBe(0);
    expect(toRank({})).toBe(0);
    expect(toRank([])).toBe(0);
  });
});
