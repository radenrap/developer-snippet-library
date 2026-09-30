import { z } from 'zod';
import { MAX_PATTERN_LENGTH, MAX_SUBJECT_LENGTH, REGEX_FLAGS } from '../types/regex';

/** Payload endpoint regex-tester (`POST /api/regex/test`). */
export const testRegexSchema = z.object({
  pattern: z.string().min(1).max(MAX_PATTERN_LENGTH),
  flags: z.array(z.enum(REGEX_FLAGS)).max(REGEX_FLAGS.length).default([]),
  subject: z.string().max(MAX_SUBJECT_LENGTH),
});

export type TestRegexInput = z.input<typeof testRegexSchema>;
export type TestRegexDto = z.output<typeof testRegexSchema>;

/** Satu kecocokan regex yang dikembalikan endpoint regex-tester. */
export const regexMatchSchema = z.object({
  index: z.number().int().nonnegative(),
  value: z.string(),
  groups: z.record(z.string(), z.string()),
});

export type RegexMatchDto = z.output<typeof regexMatchSchema>;

/** Hasil eksekusi pattern terhadap sebuah subject. */
export const regexTestResultSchema = z.object({
  pattern: z.string(),
  flags: z.array(z.string()),
  valid: z.boolean(),
  matchCount: z.number().int().nonnegative(),
  matches: z.array(regexMatchSchema),
  message: z.string().nullable(),
});

export type RegexTestResultDto = z.output<typeof regexTestResultSchema>;

export const regexTestResponseSchema = z.object({
  success: z.literal(true),
  data: regexTestResultSchema,
});
