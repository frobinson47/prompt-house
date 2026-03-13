CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"tags" text[],
	"model_compatibility" text[],
	"status" varchar(20) DEFAULT 'active',
	"visibility" varchar(20) DEFAULT 'private',
	"rating" numeric(3, 2),
	"usage_examples" jsonb,
	"version" integer DEFAULT 1,
	"author" varchar(255),
	"search_vector" "tsvector",
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "prompts_search_vector_idx" ON "prompts" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "prompts_tags_idx" ON "prompts" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "prompts_status_idx" ON "prompts" USING btree ("status");

-- Trigger: auto-update updated_at on row update
CREATE OR REPLACE FUNCTION prompts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prompts_updated_at
  BEFORE UPDATE ON "prompts"
  FOR EACH ROW
  EXECUTE FUNCTION prompts_set_updated_at();

-- Trigger: auto-update search_vector from title, description, content
CREATE OR REPLACE FUNCTION prompts_update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector =
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prompts_search_vector_update
  BEFORE INSERT OR UPDATE ON "prompts"
  FOR EACH ROW
  EXECUTE FUNCTION prompts_update_search_vector();