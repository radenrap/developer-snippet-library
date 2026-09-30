import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import type { RegexMatchDto, RegexTestResultDto } from '@snippets/shared';
import { regexTestResponseSchema, testRegexSchema } from '@snippets/shared/validators';
import { ok } from '../lib/respond';

/** Batas jumlah match yang dikirim supaya payload tidak meledak. */
const MAX_MATCHES = 100;

export const regexRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    '/regex/test',
    {
      schema: {
        tags: ['regex'],
        summary: 'Uji pattern regex terhadap sebuah teks',
        description:
          'Tidak menyentuh database. `valid: false` berarti pattern tidak bisa dikompilasi; ' +
          'pesan errornya ada di `message`.',
        body: testRegexSchema,
        response: { 200: regexTestResponseSchema },
      },
    },
    async (request) => {
      const { pattern, flags, subject } = request.body;
      const flagText = [...flags].join('');

      let regex: RegExp;

      try {
        regex = new RegExp(pattern, flagText);
      } catch (error) {
        const invalid: RegexTestResultDto = {
          pattern,
          flags: [...flags],
          valid: false,
          matchCount: 0,
          matches: [],
          message: error instanceof Error ? error.message : 'Pattern tidak valid',
        };

        return ok(invalid);
      }

      // `matchAll` mewajibkan flag `g`, jadi ditambahkan bila belum ada.
      const globalRegex = regex.global ? regex : new RegExp(pattern, `${regex.flags}g`);
      const matches: RegexMatchDto[] = [];

      for (const match of subject.matchAll(globalRegex)) {
        matches.push({
          index: match.index ?? 0,
          value: match[0] ?? '',
          groups: match.groups ? { ...match.groups } : {},
        });

        if (matches.length >= MAX_MATCHES) {
          break;
        }
      }

      const result: RegexTestResultDto = {
        pattern,
        flags: [...flags],
        valid: true,
        matchCount: matches.length,
        matches,
        message: null,
      };

      return ok(result);
    },
  );
};
