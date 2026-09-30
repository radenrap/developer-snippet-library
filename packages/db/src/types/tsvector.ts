import { customType } from 'drizzle-orm/pg-core';

/**
 * Kolom `tsvector` untuk full-text search.
 *
 * drizzle-orm 0.45 belum menyediakan tipe kolom tsvector bawaan
 * (pg-core hanya sampai varchar/uuid/jsonb/dll), jadi didefinisikan di sini
 * memakai `customType` -- pola yang sama dengan kolom pgvector.
 *
 * Nilainya hanya dibaca (representasi teks seperti `'dev':1 'email':5`);
 * penulisannya dilakukan trigger di sisi database.
 */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});
