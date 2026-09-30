import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { snippetTags, tags } from '@snippets/db';
import { tagListResponseSchema } from '@snippets/shared/validators';
import { count, desc, eq } from 'drizzle-orm';
import { ok } from '../lib/respond';

export const tagRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/tags',
    {
      schema: {
        tags: ['tags'],
        summary: 'Daftar tag beserta jumlah snippet-nya',
        description:
          'Dipakai UI untuk chips filter tag dan autocomplete saat membuat snippet. ' +
          'Diurutkan dari tag yang paling banyak dipakai.',
        response: { 200: tagListResponseSchema },
      },
    },
    async () => {
      const usageCount = count(snippetTags.snippetId).as('count');

      const rows = await fastify.db
        .select({ id: tags.id, name: tags.name, count: usageCount })
        .from(tags)
        .leftJoin(snippetTags, eq(snippetTags.tagId, tags.id))
        .groupBy(tags.id, tags.name)
        .orderBy(desc(usageCount), tags.name);

      return ok(rows);
    },
  );
};
