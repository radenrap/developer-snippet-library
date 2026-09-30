/**
 * Kontrak envelope respons API.
 * Setiap endpoint memakai salah satu dari dua bentuk ini, tanpa kecuali:
 *   sukses -> { success: true, data, meta? }
 *   gagal  -> { success: false, error: { code, message, details? } }
 */

/** Kode error machine-readable untuk branching di klien (bukan untuk ditampilkan). */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Rincian per-field saat validasi gagal. */
export interface ApiErrorDetail {
  field: string;
  message: string;
}

/** Bentuk semua respons error. */
export interface ApiErrorBody {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
  };
}

/**
 * Metadata paginasi.
 * Catatan: nama field di respons adalah `limit`, sedangkan query param-nya tetap
 * `pageSize` (nama lama dipertahankan sesuai keputusan, tidak di-rename).
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  /** Query full-text yang dieksekusi; null/absen bila request tanpa pencarian. */
  query?: string | null;
}

/** Bentuk semua respons sukses. `meta` hanya diisi endpoint ber-paginasi. */
export interface ApiSuccessBody<TData, TMeta = undefined> {
  success: true;
  data: TData;
  meta?: TMeta;
}

/** Bentuk respons list: `meta` wajib ada (bukan opsional seperti ApiSuccessBody). */
export interface ApiListBody<TData, TMeta = PaginationMeta> {
  success: true;
  data: TData[];
  meta: TMeta;
}
