CREATE TYPE "public"."regex_flavor" AS ENUM('javascript', 'python', 'go', 'rust', 'pcre', 'posix');--> statement-breakpoint
CREATE TYPE "public"."snippet_category" AS ENUM('validation', 'parsing', 'extraction', 'formatting', 'security', 'testing');--> statement-breakpoint
CREATE TABLE "snippets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"code" text NOT NULL,
	"pattern" text NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flavor" "regex_flavor" DEFAULT 'javascript' NOT NULL,
	"category" "snippet_category" DEFAULT 'parsing' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "snippets_category_idx" ON "snippets" USING btree ("category");--> statement-breakpoint
CREATE INDEX "snippets_flavor_idx" ON "snippets" USING btree ("flavor");--> statement-breakpoint
CREATE INDEX "snippets_updated_at_idx" ON "snippets" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "snippets_tags_idx" ON "snippets" USING gin ("tags");