import type { ApiErrorBody, RegexTestResultDto } from '@snippets/shared';
import { MAX_PATTERN_LENGTH, MAX_SUBJECT_LENGTH } from '@snippets/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers/app';

type RegexResponse = { success: true; data: RegexTestResultDto };

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

/**
 * `payload` harus bertipe object (bukan `unknown`): bila tipe argumen tidak
 * cocok dengan `InjectOptions`, resolusi overload `app.inject()` jatuh ke varian
 * callback yang mengembalikan `void`.
 */
async function testRegex(payload: Record<string, unknown>) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/regex/test',
    payload,
  });

  return response;
}

describe('POST /api/regex/test - pattern valid', () => {
  it('menemukan semua kecocokan beserta index-nya', async () => {
    const response = await testRegex({ pattern: '\\d+', subject: 'a1b22c333' });

    expect(response.statusCode).toBe(200);

    const { data } = response.json() as RegexResponse;
    expect(data.valid).toBe(true);
    expect(data.message).toBeNull();
    expect(data.matchCount).toBe(3);
    expect(data.matches).toEqual([
      { index: 1, value: '1', groups: {} },
      { index: 3, value: '22', groups: {} },
      { index: 6, value: '333', groups: {} },
    ]);
  });

  it('menambahkan flag g secara otomatis agar matchAll bisa dipakai', async () => {
    const response = await testRegex({ pattern: 'a', flags: [], subject: 'aaa' });
    const { data } = response.json() as RegexResponse;

    expect(data.flags).toEqual([]);
    expect(data.matchCount).toBe(3);
  });

  it('menghormati flag i dari request', async () => {
    const response = await testRegex({ pattern: 'hello', flags: ['i'], subject: 'HELLO world' });
    const { data } = response.json() as RegexResponse;

    expect(data.flags).toEqual(['i']);
    expect(data.matches).toEqual([{ index: 0, value: 'HELLO', groups: {} }]);
  });

  it('mengembalikan named capture groups', async () => {
    const response = await testRegex({
      pattern: '(?<year>\\d{4})-(?<month>\\d{2})',
      subject: '2026-09 lalu 2025-12',
    });
    const { data } = response.json() as RegexResponse;

    expect(data.matchCount).toBe(2);
    expect(data.matches[0]?.groups).toEqual({ year: '2026', month: '09' });
    expect(data.matches[1]?.groups).toEqual({ year: '2025', month: '12' });
  });

  it('menghasilkan nol kecocokan tanpa error bila pattern tidak ketemu', async () => {
    const response = await testRegex({ pattern: 'zzz', subject: 'abc' });
    const { data } = response.json() as RegexResponse;

    expect(data.valid).toBe(true);
    expect(data.matchCount).toBe(0);
    expect(data.matches).toEqual([]);
  });

  it('membatasi jumlah match pada 100 agar payload tidak meledak', async () => {
    const response = await testRegex({ pattern: 'a', subject: 'a'.repeat(150) });
    const { data } = response.json() as RegexResponse;

    expect(data.matchCount).toBe(100);
    expect(data.matches).toHaveLength(100);
  });

  it('menerima subject kosong', async () => {
    const response = await testRegex({ pattern: 'a', subject: '' });
    const { data } = response.json() as RegexResponse;

    expect(data.valid).toBe(true);
    expect(data.matchCount).toBe(0);
  });
});

describe('POST /api/regex/test - named group yang tidak ikut match', () => {
  it('tetap 200 dan hanya menyertakan group yang punya nilai', async () => {
    // Pada alternation, named group di cabang yang tidak cocok bernilai
    // `undefined`. Skema respons menuntut Record<string, string>, jadi nilai
    // undefined harus dibuang sebelum serialisasi; kalau tidak, serializer
    // gagal dan route membalas 500 untuk input yang sebenarnya valid.
    const response = await testRegex({
      pattern: '(?<angka>\\d)|(?<huruf>[a-z])',
      subject: '1a',
    });

    expect(response.statusCode).toBe(200);

    const { data } = response.json() as RegexResponse;
    expect(data.valid).toBe(true);
    expect(data.matchCount).toBe(2);
    expect(data.matches[0]?.groups).toEqual({ angka: '1' });
    expect(data.matches[1]?.groups).toEqual({ huruf: 'a' });
  });
});

describe('POST /api/regex/test - pattern invalid', () => {
  it('mengembalikan 200 dengan valid:false beserta pesan error, bukan 500', async () => {
    const response = await testRegex({ pattern: '([', subject: 'abc' });

    expect(response.statusCode).toBe(200);

    const { data } = response.json() as RegexResponse;
    expect(data.valid).toBe(false);
    expect(data.matchCount).toBe(0);
    expect(data.matches).toEqual([]);
    expect(data.message).toBeTruthy();
  });

  it('menolak quantifier tanpa target', async () => {
    const response = await testRegex({ pattern: '*', subject: 'abc' });
    const { data } = response.json() as RegexResponse;

    expect(data.valid).toBe(false);
  });
});

describe('POST /api/regex/test - validasi payload', () => {
  it('menolak pattern kosong', async () => {
    const response = await testRegex({ pattern: '', subject: 'abc' });

    expect(response.statusCode).toBe(400);
    expect((response.json() as ApiErrorBody).error.code).toBe('VALIDATION_ERROR');
  });

  it('menolak pattern melebihi batas panjang', async () => {
    const response = await testRegex({
      pattern: 'a'.repeat(MAX_PATTERN_LENGTH + 1),
      subject: 'abc',
    });

    expect(response.statusCode).toBe(400);
  });

  it('menolak subject melebihi batas panjang', async () => {
    const response = await testRegex({ pattern: 'a', subject: 'a'.repeat(MAX_SUBJECT_LENGTH + 1) });

    expect(response.statusCode).toBe(400);
  });

  it('menolak flag di luar daftar yang didukung', async () => {
    const response = await testRegex({ pattern: 'a', flags: ['x'], subject: 'abc' });

    expect(response.statusCode).toBe(400);
    expect((response.json() as ApiErrorBody).error.code).toBe('VALIDATION_ERROR');
  });

  it('menolak flag duplikat karena jumlah maksimum adalah panjang REGEX_FLAGS', async () => {
    const response = await testRegex({
      pattern: 'a',
      flags: ['g', 'g', 'g', 'g', 'g', 'g', 'g', 'g'],
      subject: 'abc',
    });

    expect(response.statusCode).toBe(400);
  });

  it('menolak payload tanpa field subject', async () => {
    const response = await testRegex({ pattern: 'a' });

    expect(response.statusCode).toBe(400);

    const body = response.json() as ApiErrorBody;
    expect(body.error.details?.map((detail) => detail.field)).toEqual(['subject']);
  });
});
