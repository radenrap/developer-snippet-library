import { index, pgTable, primaryKey, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { snippets } from './snippets';

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
  },
  (table) => [uniqueIndex('tags_name_unique_idx').on(table.name)],
);

/**
 * Tabel penghubung many-to-many snippets <-> tags.
 * Composite primary key (snippet_id, tag_id) sekaligus mencegah duplikat pasangan.
 */
export const snippetTags = pgTable(
  'snippet_tags',
  {
    snippetId: uuid('snippet_id')
      .notNull()
      .references(() => snippets.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.snippetId, table.tagId] }),
    // Dipakai saat mencari semua snippet milik sebuah tag.
    index('snippet_tags_tag_id_idx').on(table.tagId),
  ],
);
