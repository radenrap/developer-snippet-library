-- Judul duplikat harus dibereskan lebih dulu, jika tidak CREATE UNIQUE INDEX gagal.
-- Strategi: baris lama di-RENAME (bukan dihapus) supaya tidak ada data yang hilang.
-- Judul terbaru dipertahankan apa adanya; yang lebih lama diberi sufiks " (2)", " (3)", dst.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "title" ORDER BY "created_at" DESC, "id" DESC
  ) AS rn
  FROM "snippets"
)
UPDATE "snippets" AS s
SET "title" = left(rtrim(s."title") || ' (' || r.rn || ')', 255),
    "updated_at" = now()
FROM ranked AS r
WHERE s."id" = r."id" AND r.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "snippets_title_unique_idx" ON "snippets" USING btree ("title");
