import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
  index,
  boolean,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const vector384 = customType<{ data: number[] }>({
  dataType() {
    return "vector(384)";
  },
});

export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    content: text("content").notNull(),
    tags: text("tags").array(),
    modelCompatibility: text("model_compatibility").array(),
    status: varchar("status", { length: 20 }).default("active"),
    visibility: varchar("visibility", { length: 20 }).default("private"),
    rating: numeric("rating", { precision: 3, scale: 2 }),
    usageExamples: jsonb("usage_examples"),
    version: integer("version").default(1),
    author: varchar("author", { length: 255 }),
    isFavorite: boolean("is_favorite").default(false).notNull(),
    promptType: varchar("prompt_type", { length: 20 }).default("task"),
    embedding: vector384("embedding"),
    searchVector: tsvector("search_vector"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("prompts_search_vector_idx").using("gin", table.searchVector),
    index("prompts_tags_idx").using("gin", table.tags),
    index("prompts_status_idx").on(table.status),
  ]
);

export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
