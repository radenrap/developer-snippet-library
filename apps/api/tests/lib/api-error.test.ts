import type { ApiErrorCode } from '@snippets/shared';
import { describe, expect, it } from 'vitest';
import {
  ApiError,
  codeForStatus,
  conflict,
  internalError,
  isUniqueViolation,
  notFound,
  serviceUnavailable,
  validationError,
} from '../../src/lib/api-error';

describe('ApiError.toJSON', () => {
  it('membentuk envelope { success:false, error:{ code, message } }', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Payload tidak valid');

    expect(error.toJSON()).toEqual({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Payload tidak valid' },
    });
  });

  it('menyertakan details bila ada', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Payload tidak valid', [
      { field: 'title', message: 'wajib diisi' },
    ]);

    expect(error.toJSON().error.details).toEqual([{ field: 'title', message: 'wajib diisi' }]);
  });

  it('tidak menulis key details bila array kosong', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'x', []);
    const body = error.toJSON();

    expect(body.error).not.toHaveProperty('details');
    expect(body).toEqual({ success: false, error: { code: 'VALIDATION_ERROR', message: 'x' } });
  });

  it('adalah Error sungguhan agar bisa di-throw dan tertangkap error handler', () => {
    const error = notFound('Snippet');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.name).toBe('ApiError');
    expect(error.message).toBe('Snippet tidak ditemukan');
    expect(error.stack).toContain('ApiError');
  });
});

describe('factory error', () => {
  it('validationError -> 400 VALIDATION_ERROR dengan details', () => {
    const error = validationError([{ field: 'code', message: 'Too small' }], 'Payload tidak valid');

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toHaveLength(1);
  });

  it('notFound -> 404 NOT_FOUND dengan nama resource di pesan', () => {
    const error = notFound('Tag');

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Tag tidak ditemukan');
  });

  it('conflict -> 409 CONFLICT', () => {
    const error = conflict('Judul sudah ada');

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });

  it('internalError -> 500 dengan pesan generik agar detail internal tidak bocor', () => {
    const error = internalError();

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).toBe('Terjadi kesalahan internal pada server');
  });

  it('serviceUnavailable -> 503 SERVICE_UNAVAILABLE', () => {
    const error = serviceUnavailable('Database tidak dapat dihubungi');

    expect(error.statusCode).toBe(503);
    expect(error.code).toBe('SERVICE_UNAVAILABLE');
  });
});

describe('codeForStatus', () => {
  const cases: [number, ApiErrorCode][] = [
    [400, 'VALIDATION_ERROR'],
    [401, 'VALIDATION_ERROR'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [415, 'VALIDATION_ERROR'],
    [422, 'VALIDATION_ERROR'],
    [500, 'INTERNAL_ERROR'],
    [502, 'INTERNAL_ERROR'],
    [503, 'SERVICE_UNAVAILABLE'],
  ];

  it.each(cases)('memetakan HTTP %i -> %s', (status, expected) => {
    expect(codeForStatus(status)).toBe(expected);
  });
});

describe('isUniqueViolation', () => {
  it('mengenali SQLSTATE 23505 yang menempel langsung pada error', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('mengenali 23505 yang dibungkus drizzle di dalam .cause', () => {
    // drizzle membungkus error driver menjadi DrizzleQueryError dengan penyebab di .cause
    const wrapped = new Error('Failed query: insert into "snippets" ...', {
      cause: { code: '23505', constraint_name: 'snippets_title_unique_idx' },
    });

    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it('menolak SQLSTATE lain', () => {
    expect(isUniqueViolation({ code: '42703' })).toBe(false);
    expect(isUniqueViolation(new Error('x', { cause: { code: '23503' } }))).toBe(false);
  });

  it('tidak melempar untuk nilai non-object', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
    expect(isUniqueViolation(23505)).toBe(false);
    expect(isUniqueViolation(new Error('tanpa kode'))).toBe(false);
    expect(isUniqueViolation({ cause: null })).toBe(false);
  });
});
