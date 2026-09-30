import { z } from 'zod';
import { API_ERROR_CODES } from '../types/api';

/** Rincian per-field kegagalan validasi. */
export const apiErrorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
});

/** Bentuk respons error yang seragam di semua endpoint. */
export const apiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    details: z.array(apiErrorDetailSchema).optional(),
  }),
});

export type ApiErrorDto = z.output<typeof apiErrorSchema>;

/** Metadata paginasi pada respons list. */
export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  query: z.string().nullable().optional(),
});

export type PaginationMetaDto = z.output<typeof paginationMetaSchema>;

/** Respons DELETE: konfirmasi id yang dihapus. */
export const deletedResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ id: z.uuid() }),
});

export const healthSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  uptime: z.number().optional(),
  timestamp: z.string().optional(),
  message: z.string().nullable().optional(),
});

export type HealthDto = z.output<typeof healthSchema>;

export const healthResponseSchema = z.object({
  success: z.literal(true),
  data: healthSchema,
});
