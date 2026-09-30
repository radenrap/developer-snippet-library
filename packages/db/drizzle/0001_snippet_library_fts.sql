-- Migrasi diff: model lama (regex-centric) -> Developer Snippet Library + FTS.
-- Ditulis agar aman pada tabel yang SUDAH berisi data: kolom NOT NULL baru
-- ditambahkan sebagai nullable, diisi, lalu di-set NOT NULL.

-- 1) Index lama yang tidak dipakai lagi
DROP INDEX IF EXISTS "snippets_updated_at_idx";--> statement-breakpoint

-- 2) language: diisi dari enum `flavor` lama sebelum kolom itu di-drop
ALTER TABLE "snippets" ADD COLUMN "language" varchar(50);--> statement-breakpoint
UPDATE "snippets" SET "language" = "flavor"::text WHERE "language" IS NULL;--> statement-breakpoint
ALTER TABLE "snippets" ALTER COLUMN "language" SET NOT NULL;--> statement-breakpoint

-- 3) search_vector: diisi oleh trigger pada langkah 8 (nullable agar trigger yang mengatur)
ALTER TABLE "snippets" ADD COLUMN "search_vector" tsvector;--> statement-breakpoint

-- 4) author_id: tabel users belum ada, baris lama memakai UUID placeholder
ALTER TABLE "snippets" ADD COLUMN "author_id" uuid;--> statement-breakpoint
UPDATE "snippets" SET "author_id" = '00000000-0000-4000-8000-000000000001' WHERE "author_id" IS NULL;--> statement-breakpoint
ALTER TABLE "snippets" ALTER COLUMN "author_id" SET NOT NULL;--> statement-breakpoint

-- 5) title: text -> varchar(255)
ALTER TABLE "snippets" ALTER COLUMN "title" SET DATA TYPE varchar(255);--> statement-breakpoint

-- 6) Tabel tags + penghubung many-to-many.
--    Dibuat SEBELUM kolom `tags` jsonb di-drop agar data tag lama bisa dipindahkan.
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snippet_tags" (
	"snippet_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "snippet_tags_snippet_id_tag_id_pk" PRIMARY KEY("snippet_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "snippet_tags" ADD CONSTRAINT "snippet_tags_snippet_id_snippets_id_fk" FOREIGN KEY ("snippet_id") REFERENCES "public"."snippets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snippet_tags" ADD CONSTRAINT "snippet_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_unique_idx" ON "tags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "snippet_tags_tag_id_idx" ON "snippet_tags" USING btree ("tag_id");--> statement-breakpoint

-- 7) Pindahkan tag jsonb lama ke bentuk ternormalisasi (no-op bila tag kosong)
INSERT INTO "tags" ("name")
SELECT DISTINCT btrim(tag_name)
FROM "snippets" AS s
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(s."tags") = 'array' THEN s."tags" ELSE '[]'::jsonb END
) AS tag_name
WHERE btrim(tag_name) <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "snippet_tags" ("snippet_id", "tag_id")
SELECT s."id", t."id"
FROM "snippets" AS s
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(s."tags") = 'array' THEN s."tags" ELSE '[]'::jsonb END
) AS tag_name
JOIN "tags" AS t ON t."name" = btrim(tag_name)
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- 8) Buang kolom model lama (index pada kolom ini ikut terhapus otomatis)
ALTER TABLE "snippets" DROP COLUMN "pattern";--> statement-breakpoint
ALTER TABLE "snippets" DROP COLUMN "flags";--> statement-breakpoint
ALTER TABLE "snippets" DROP COLUMN "flavor";--> statement-breakpoint
ALTER TABLE "snippets" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "snippets" DROP COLUMN "tags";--> statement-breakpoint
ALTER TABLE "snippets" DROP COLUMN "is_favorite";--> statement-breakpoint
ALTER TABLE "snippets" DROP COLUMN "usage_count";--> statement-breakpoint

-- 9) Buang enum yang sudah tidak dirujuk kolom mana pun
DROP TYPE "public"."regex_flavor";--> statement-breakpoint
DROP TYPE "public"."snippet_category";--> statement-breakpoint

-- 10) Index baru pada snippets
CREATE INDEX "snippets_language_idx" ON "snippets" USING btree ("language");--> statement-breakpoint
CREATE INDEX "snippets_author_id_idx" ON "snippets" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "snippets_created_at_idx" ON "snippets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "snippets_search_vector_idx" ON "snippets" USING gin ("search_vector");--> statement-breakpoint

-- 11) Trigger FTS: search_vector = A(title) + B(description) + C(code).
--     Bobot ini dipakai ts_rank_cd, jadi kecocokan di judul dinilai lebih
--     relevan daripada kecocokan di dalam kode.
CREATE OR REPLACE FUNCTION "public"."snippets_search_vector_update"() RETURNS trigger AS $sv$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.code, '')), 'C');
  RETURN NEW;
END;
$sv$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS "snippets_search_vector_trigger" ON "public"."snippets";--> statement-breakpoint
CREATE TRIGGER "snippets_search_vector_trigger"
BEFORE INSERT OR UPDATE OF "title", "description", "code" ON "public"."snippets"
FOR EACH ROW EXECUTE FUNCTION "public"."snippets_search_vector_update"();--> statement-breakpoint

-- 12) Backfill baris lama agar search_vector tidak NULL
UPDATE "public"."snippets" SET "search_vector" =
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
  setweight(to_tsvector('english', coalesce("code", '')), 'C')
WHERE "search_vector" IS NULL;
