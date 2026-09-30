import { DEFAULT_EMBEDDING_DIMENSIONS } from '@snippets/shared';
import { index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { vector } from '../types/pgvector';
import { tsvector } from '../types/tsvector';

export const snippets = pgTable(
  'snippets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    code: text('code').notNull(),
    language: varchar('language', { length: 50 }).notNull(),
    description: text('description'),
    /**
     * Kolom FTS. Diisi otomatis oleh trigger `snippets_search_vector_update`
     * dengan setweight A=title, B=description, C=code (lihat file migrasi).
     * Jangan pernah di-set dari aplikasi.
     */
    searchVector: tsvector('search_vector'),
    /**
     * Belum ada tabel users, jadi kolom ini sengaja tanpa foreign key.
     * Tambahkan `.references(() => users.id)` begitu tabel users dibuat.
     */
    authorId: uuid('author_id').notNull(),
    /** Dicadangkan untuk pencarian semantik; NULL sampai embedding diisi. */
    embedding: vector('embedding', { dimensions: DEFAULT_EMBEDDING_DIMENSIONS }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // GIN wajib untuk operator `@@` dan fungsi ranking pada tsvector.
    index('snippets_search_vector_idx').using('gin', table.searchVector),
    index('snippets_language_idx').on(table.language),
    index('snippets_author_id_idx').on(table.authorId),
    index('snippets_created_at_idx').on(table.createdAt),
    // Judul unik: menjadi sumber kebenaran untuk respons 409 CONFLICT di API.
    uniqueIndex('snippets_title_unique_idx').on(table.title),
  ],
);
