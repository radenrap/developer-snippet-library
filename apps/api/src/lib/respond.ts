import type { ApiListBody, ApiSuccessBody, PaginationMeta } from '@snippets/shared';

/** Envelope sukses tanpa meta: `{ success: true, data }`. */
export function ok<TData>(data: TData): ApiSuccessBody<TData> {
  return { success: true, data };
}

/** Envelope sukses untuk list ber-paginasi: `{ success: true, data, meta }`. */
export function okList<TData>(data: TData[], meta: PaginationMeta): ApiListBody<TData> {
  return { success: true, data, meta };
}
