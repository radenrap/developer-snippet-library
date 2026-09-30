import type { ApiErrorBody, ApiErrorCode, ApiErrorDetail } from '@snippets/shared';

/**
 * Error aplikasi yang membawa status HTTP + kode machine-readable.
 *
 * Semua handler melempar `ApiError`; pembentukan body respons dilakukan di satu
 * tempat (`app.setErrorHandler`). Dengan begitu tidak ada lagi dua jalur respons
 * error yang bisa berbeda format.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: ApiErrorDetail[];

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  /** Body respons final: `{ success: false, error: { code, message, details? } }`. */
  toJSON(): ApiErrorBody {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && this.details.length > 0 ? { details: this.details } : {}),
      },
    };
  }
}

/** 400 -- payload/query tidak lolos validasi zod, disertai rincian per-field. */
export function validationError(
  details: ApiErrorDetail[],
  message = 'Payload tidak valid',
): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', message, details);
}

/** 404 -- resource tidak ada. */
export function notFound(resource: string): ApiError {
  return new ApiError(404, 'NOT_FOUND', `${resource} tidak ditemukan`);
}

/** 409 -- bentrok dengan data yang sudah ada (mis. judul snippet duplikat). */
export function conflict(message: string): ApiError {
  return new ApiError(409, 'CONFLICT', message);
}

/** 500 -- kesalahan server; pesan internal tidak boleh bocor ke klien. */
export function internalError(message = 'Terjadi kesalahan internal pada server'): ApiError {
  return new ApiError(500, 'INTERNAL_ERROR', message);
}

/** 503 -- dependensi (mis. database) tidak tersedia. */
export function serviceUnavailable(message: string): ApiError {
  return new ApiError(503, 'SERVICE_UNAVAILABLE', message);
}

/** Pemetaan status HTTP -> kode error untuk error yang bukan ApiError. */
export function codeForStatus(statusCode: number): ApiErrorCode {
  if (statusCode === 404) {
    return 'NOT_FOUND';
  }

  if (statusCode === 409) {
    return 'CONFLICT';
  }

  if (statusCode === 503) {
    return 'SERVICE_UNAVAILABLE';
  }

  if (statusCode >= 400 && statusCode < 500) {
    return 'VALIDATION_ERROR';
  }

  return 'INTERNAL_ERROR';
}

function readCode(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('code' in value)) {
    return undefined;
  }

  return (value as { code?: unknown }).code;
}

/**
 * Mendeteksi unique_violation PostgreSQL (SQLSTATE 23505).
 *
 * drizzle membungkus error driver menjadi `DrizzleQueryError` dengan penyebab di
 * `.cause`, jadi keduanya diperiksa.
 */
export function isUniqueViolation(error: unknown): boolean {
  const UNIQUE_VIOLATION = '23505';
  const cause =
    typeof error === 'object' && error !== null && 'cause' in error
      ? (error as { cause?: unknown }).cause
      : undefined;

  return readCode(error) === UNIQUE_VIOLATION || readCode(cause) === UNIQUE_VIOLATION;
}
