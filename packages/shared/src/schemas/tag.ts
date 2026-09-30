import { z } from 'zod';

/**
 * Tag beserta jumlah snippet yang memakainya.
 * `count` dipakai UI untuk menampilkan chips filter yang informatif.
 */
export const tagSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  count: z.number().int().nonnegative(),
});

export type TagDto = z.output<typeof tagSchema>;

export const tagListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(tagSchema),
});

export type TagListResponse = z.output<typeof tagListResponseSchema>;
