import { relations } from 'drizzle-orm';
import { snippets } from './snippets';
import { snippetTags, tags } from './tags';

/**
 * Relasi many-to-many snippets <-> tags lewat tabel `snippet_tags`.
 *
 * CATATAN drizzle-orm 0.45.3: relasi m2m implisit (`tags` / `snippets` di bawah)
 * belum bisa dipakai pada `db.query.*({ with: { tags: true } })` -- melempar
 * "There is not enough information to infer relation". Jalur yang berfungsi
 * adalah lewat join table:
 *
 *   db.query.snippets.findFirst({ with: { snippetTags: { with: { tag: true } } } })
 *
 * Deklarasi m2m tetap dipertahankan (standar drizzle, dipakai drizzle-kit dan
 * relasi satu-ke-banyak `snippetTags`), dan langsung usable begitu drizzle
 * memperbaiki inferensi m2m-nya.
 */
export const snippetsRelations = relations(snippets, ({ many }) => ({
  snippetTags: many(snippetTags),
  tags: many(tags, { relationName: 'snippetTags' }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  snippetTags: many(snippetTags),
  snippets: many(snippets, { relationName: 'snippetTags' }),
}));

export const snippetTagsRelations = relations(snippetTags, ({ one }) => ({
  snippet: one(snippets, {
    fields: [snippetTags.snippetId],
    references: [snippets.id],
  }),
  tag: one(tags, {
    fields: [snippetTags.tagId],
    references: [tags.id],
  }),
}));
