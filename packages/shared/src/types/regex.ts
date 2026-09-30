/**
 * Domain regex-tester: endpoint ini tidak menyentuh database, jadi konstantanya
 * dipisahkan dari model snippet. Bentuk DTO-nya didefinisikan sebagai skema zod
 * di `schemas/regex.ts` agar bisa dipakai swagger sekaligus tipe TypeScript.
 */

export const REGEX_FLAGS = ['d', 'g', 'i', 'm', 's', 'u', 'y'] as const;
export type RegexFlag = (typeof REGEX_FLAGS)[number];

export const MAX_PATTERN_LENGTH = 2000;
export const MAX_SUBJECT_LENGTH = 10_000;
