import { Router, Request, Response } from "express";
import { db } from "../db";
import { prompts, NewPrompt } from "../db/schema";
import { eq, sql, and, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { requireApiKey } from "../middleware/auth";
import { generateEmbedding, buildEmbeddingText } from "../embeddings";
import { classifyPrompt, analyzeStructure } from "../classifier";
import improveRouter from "./improve";

const router = Router();

const createSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  modelCompatibility: z.array(z.string()).optional(),
  status: z.enum(["draft", "active", "archived", "deprecated"]).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  author: z.string().optional(),
  usageExamples: z.any().optional(),
  promptType: z.enum(["system", "task", "template", "chain", "reference", "snippet"]).optional(),
});

const updateSchema = createSchema.partial();

const listQuerySchema = z.object({
  q: z.string().optional(),
  tags: z.string().optional(), // comma-separated
  status: z.string().optional(),
  model: z.string().optional(),
  type: z.string().optional(),
  folder: z.string().optional(), // folder id, "unfiled" for no folder
  sort: z.enum(["created_at", "updated_at", "title", "rating", "favorites"]).optional().default("created_at"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// GET /api/prompts — list with pagination, filtering, search
router.get("/", async (req: Request, res: Response) => {
  try {
    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({ error: "Invalid query parameters", details: query.error.flatten() });
    }
    const { q, tags, status, model, type, folder, sort, order, page, limit } = query.data;
    const offset = (page - 1) * limit;

    let conditions: ReturnType<typeof and>[] = [];

    if (q) {
      conditions.push(
        sql`${prompts.searchVector} @@ plainto_tsquery('english', ${q})` as any
      );
    }

    if (status) {
      conditions.push(eq(prompts.status, status) as any);
    }

    if (tags) {
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        conditions.push(sql`${prompts.tags} && ${tagList}` as any);
      }
    }

    if (model) {
      conditions.push(sql`${prompts.modelCompatibility} @> ARRAY[${model}]::text[]` as any);
    }

    if (type) {
      conditions.push(eq(prompts.promptType, type) as any);
    }

    if (folder) {
      if (folder === "unfiled") {
        conditions.push(sql`${prompts}.folder_id IS NULL` as any);
      } else {
        conditions.push(sql`folder_id = ${folder}::uuid` as any);
      }
    }

    let orderExpr;
    if (sort === "favorites") {
      // Favorites first, then by created_at desc
      orderExpr = sql`${prompts.isFavorite} desc, ${prompts.createdAt} desc nulls last`;
    } else {
      const sortCol = {
        created_at: prompts.createdAt,
        updated_at: prompts.updatedAt,
        title: prompts.title,
        rating: prompts.rating,
      }[sort];
      orderExpr = order === "asc" ? sql`${sortCol} asc nulls last` : sql`${sortCol} desc nulls last`;
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(prompts).where(whereClause).orderBy(orderExpr).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(prompts).where(whereClause),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return res.json({
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("GET /api/prompts error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/prompts/classify — classify a prompt's type (before /:id routes)
router.post("/classify", async (req: Request, res: Response) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: "title and content are required" });
    }
    const result = classifyPrompt(title, content);
    return res.json(result);
  } catch (err) {
    console.error("POST /api/prompts/classify error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/prompts/analyze — analyze prompt structure
router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }
    const result = analyzeStructure(content);
    return res.json(result);
  } catch (err) {
    console.error("POST /api/prompts/analyze error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/prompts/auto-classify — batch classify all prompts
router.post("/auto-classify", requireApiKey, async (_req: Request, res: Response) => {
  try {
    const rows = await db.select({
      id: prompts.id,
      title: prompts.title,
      content: prompts.content,
      promptType: prompts.promptType,
    }).from(prompts);

    let updated = 0;
    for (const row of rows) {
      const result = classifyPrompt(row.title, row.content);
      if (result.confidence >= 0.3 && result.type !== row.promptType) {
        await db.update(prompts)
          .set({ promptType: result.type } as any)
          .where(eq(prompts.id, row.id));
        updated++;
      }
    }
    return res.json({ total: rows.length, updated });
  } catch (err) {
    console.error("POST /api/prompts/auto-classify error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/prompts/graph — all prompts for graph visualization
router.get("/graph", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT p.id, p.title, p.tags, p.model_compatibility, p.status, p.prompt_type, p.is_favorite,
             p.folder_id, f.name as folder_name
      FROM prompts p
      LEFT JOIN folders f ON f.id = p.folder_id
      ORDER BY p.title
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error("GET /api/prompts/graph error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/prompts/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const row = await db.select().from(prompts).where(eq(prompts.id, req.params.id)).limit(1);
    if (!row.length) return res.status(404).json({ error: "Prompt not found" });
    return res.json(row[0]);
  } catch (err) {
    console.error("GET /api/prompts/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/prompts
router.post("/", requireApiKey, async (req: Request, res: Response) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const data: NewPrompt = {
      ...parsed.data,
      status: parsed.data.status ?? "active",
      visibility: parsed.data.visibility ?? "private",
    };
    const [created] = await db.insert(prompts).values(data).returning();
    // Generate embedding async — don't block response
    generateEmbedding(buildEmbeddingText(created))
      .then((embedding) => {
        const embeddingStr = `[${embedding.join(",")}]`;
        return db.execute(sql`UPDATE prompts SET embedding = ${embeddingStr}::vector WHERE id = ${created.id}`);
      })
      .catch((err) => console.error("Embedding generation failed:", err));
    return res.status(201).json(created);
  } catch (err) {
    console.error("POST /api/prompts error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/prompts/:id
router.patch("/:id", requireApiKey, async (req: Request, res: Response) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const existing = await db.select().from(prompts).where(eq(prompts.id, req.params.id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Prompt not found" });

    const updateData: Partial<NewPrompt> = { ...parsed.data };
    // Auto-increment version if content changed
    if (parsed.data.content && parsed.data.content !== existing[0].content) {
      updateData.version = (existing[0].version ?? 1) + 1;
      // Save old version to history
      {
        const tagsVal = existing[0].tags ? '{' + existing[0].tags.join(',') + '}' : null;
        const modelsVal = existing[0].modelCompatibility ? '{' + existing[0].modelCompatibility.join(',') + '}' : null;
        await db.execute(sql`
          INSERT INTO prompt_versions (prompt_id, version, title, description, content, tags, model_compatibility, status, prompt_type, author)
          VALUES (
            ${existing[0].id},
            ${existing[0].version ?? 1},
            ${existing[0].title},
            ${existing[0].description},
            ${existing[0].content},
            ${tagsVal},
            ${modelsVal},
            ${existing[0].status},
            ${existing[0].promptType},
            ${existing[0].author}
          )
        `);
      };
    }
    updateData.updatedAt = new Date();

    const [updated] = await db.update(prompts).set(updateData).where(eq(prompts.id, req.params.id)).returning();
    // Re-generate embedding if content or title changed
    if (parsed.data.content || parsed.data.title || parsed.data.description) {
      generateEmbedding(buildEmbeddingText(updated))
        .then((embedding) => {
          const embeddingStr = `[${embedding.join(",")}]`;
          return db.execute(sql`UPDATE prompts SET embedding = ${embeddingStr}::vector WHERE id = ${updated.id}`);
        })
        .catch((err) => console.error("Embedding update failed:", err));
    }
    return res.json(updated);
  } catch (err) {
    console.error("PATCH /api/prompts/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/prompts/:id — hard delete
router.delete("/:id", requireApiKey, async (req: Request, res: Response) => {
  try {
    const existing = await db.select().from(prompts).where(eq(prompts.id, req.params.id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Prompt not found" });
    await db.delete(prompts).where(eq(prompts.id, req.params.id));
    return res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/prompts/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/prompts/:id/duplicate
router.post("/:id/duplicate", requireApiKey, async (req: Request, res: Response) => {
  try {
    const existing = await db.select().from(prompts).where(eq(prompts.id, req.params.id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Prompt not found" });

    const { id, createdAt, updatedAt, searchVector, ...rest } = existing[0];
    const duplicate: NewPrompt = {
      ...rest,
      title: `${rest.title} (copy)`,
      status: "draft",
      version: 1,
    };
    const [created] = await db.insert(prompts).values(duplicate).returning();
    return res.status(201).json(created);
  } catch (err) {
    console.error("POST /api/prompts/:id/duplicate error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// GET /api/prompts/:id/analyze — analyze an existing prompt
router.get("/:id/analyze", async (req: Request, res: Response) => {
  try {
    const row = await db.select().from(prompts).where(eq(prompts.id, req.params.id)).limit(1);
    if (!row.length) return res.status(404).json({ error: "Prompt not found" });
    const classification = classifyPrompt(row[0].title, row[0].content);
    const structure = analyzeStructure(row[0].content);
    return res.json({ classification, structure });
  } catch (err) {
    console.error("GET /api/prompts/:id/analyze error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/prompts/:id/versions — version history
router.get("/:id/versions", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT id, prompt_id, version, title, content, tags, status, prompt_type, author, created_at
      FROM prompt_versions
      WHERE prompt_id = ${req.params.id}
      ORDER BY version DESC
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error("GET /api/prompts/:id/versions error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/prompts/:id/versions/:version — get specific version
router.get("/:id/versions/:version", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT * FROM prompt_versions
      WHERE prompt_id = ${req.params.id} AND version = ${Number(req.params.version)}
      LIMIT 1
    `);
    if (!result.rows.length) return res.status(404).json({ error: "Version not found" });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /api/prompts/:id/versions/:version error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/prompts/:id/versions/:version/restore — restore a previous version
router.post("/:id/versions/:version/restore", requireApiKey, async (req: Request, res: Response) => {
  try {
    const versionResult = await db.execute(sql`
      SELECT * FROM prompt_versions
      WHERE prompt_id = ${req.params.id} AND version = ${Number(req.params.version)}
      LIMIT 1
    `);
    if (!versionResult.rows.length) return res.status(404).json({ error: "Version not found" });

    const old = versionResult.rows[0] as any;
    const existing = await db.select().from(prompts).where(eq(prompts.id, req.params.id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Prompt not found" });

    // Save current as a version first
    {
      const tagsVal = existing[0].tags ? '{' + existing[0].tags.join(',') + '}' : null;
      const modelsVal = existing[0].modelCompatibility ? '{' + existing[0].modelCompatibility.join(',') + '}' : null;
      await db.execute(sql`
        INSERT INTO prompt_versions (prompt_id, version, title, description, content, tags, model_compatibility, status, prompt_type, author)
        VALUES (
          ${existing[0].id},
          ${existing[0].version ?? 1},
          ${existing[0].title},
          ${existing[0].description},
          ${existing[0].content},
          ${tagsVal},
          ${modelsVal},
          ${existing[0].status},
          ${existing[0].promptType},
          ${existing[0].author}
        )
      `);
    };

    // Restore the old version's content with incremented version number
    const newVersion = (existing[0].version ?? 1) + 1;
    const [updated] = await db.update(prompts).set({
      title: old.title,
      content: old.content,
      description: old.description,
      tags: old.tags,
      status: old.status,
      promptType: old.prompt_type,
      author: old.author,
      version: newVersion,
      updatedAt: new Date(),
    } as any).where(eq(prompts.id, req.params.id)).returning();

    return res.json(updated);
  } catch (err) {
    console.error("POST /api/prompts/:id/versions/:version/restore error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/prompts/:id/favorite — toggle favorite
router.patch("/:id/favorite", requireApiKey, async (req: Request, res: Response) => {
  try {
    const existing = await db.select().from(prompts).where(eq(prompts.id, req.params.id)).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Prompt not found" });

    const [updated] = await db
      .update(prompts)
      .set({ isFavorite: !existing[0].isFavorite })
      .where(eq(prompts.id, req.params.id))
      .returning();
    return res.json(updated);
  } catch (err) {
    console.error("PATCH /api/prompts/:id/favorite error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/prompts/bulk — bulk operations
router.post("/bulk", requireApiKey, async (req: Request, res: Response) => {
  try {
    const bulkSchema = z.object({
      ids: z.array(z.string().uuid()).min(1).max(100),
      action: z.enum(["delete", "favorite", "unfavorite", "set-status", "set-type", "add-tags"]),
      value: z.string().optional(), // for set-status, set-type, add-tags
    });
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const { ids, action, value } = parsed.data;

    let affected = 0;
    switch (action) {
      case "delete":
        const delResult = await db.delete(prompts).where(sql`${prompts.id} = ANY(${ids})`);
        affected = ids.length;
        break;
      case "favorite":
        await db.update(prompts).set({ isFavorite: true }).where(sql`${prompts.id} = ANY(${ids})`);
        affected = ids.length;
        break;
      case "unfavorite":
        await db.update(prompts).set({ isFavorite: false }).where(sql`${prompts.id} = ANY(${ids})`);
        affected = ids.length;
        break;
      case "set-status":
        if (!value || !["draft", "active", "archived", "deprecated"].includes(value)) {
          return res.status(400).json({ error: "Invalid status value" });
        }
        await db.update(prompts).set({ status: value, updatedAt: new Date() }).where(sql`${prompts.id} = ANY(${ids})`);
        affected = ids.length;
        break;
      case "set-type":
        if (!value || !["system", "task", "template", "chain", "reference", "snippet"].includes(value)) {
          return res.status(400).json({ error: "Invalid type value" });
        }
        await db.update(prompts).set({ promptType: value, updatedAt: new Date() } as any).where(sql`${prompts.id} = ANY(${ids})`);
        affected = ids.length;
        break;
      case "add-tags":
        if (!value) {
          return res.status(400).json({ error: "Tags value required" });
        }
        const newTags = value.split(",").map(t => t.trim()).filter(Boolean);
        // For each prompt, merge new tags with existing
        for (const id of ids) {
          await db.execute(sql`
            UPDATE prompts SET tags = (
              SELECT array_agg(DISTINCT t) FROM unnest(COALESCE(tags, ARRAY[]::text[]) || ${newTags}::text[]) AS t
            ), updated_at = NOW() WHERE id = ${id}
          `);
        }
        affected = ids.length;
        break;
    }

    return res.json({ affected, action });
  } catch (err) {
    console.error("POST /api/prompts/bulk error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/prompts/types/counts — count by prompt type
router.get("/types/counts", async (_req: Request, res: Response) => {
  try {
    const counts = await db.execute(sql`
      SELECT COALESCE(prompt_type, 'task') as type, COUNT(*)::int as count
      FROM prompts GROUP BY prompt_type ORDER BY count DESC
    `);
    return res.json(counts.rows);
  } catch (err) {
    console.error("GET /api/prompts/types/counts error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/prompts/models/available — distinct models from DB + curated defaults
router.get("/models/available", async (_req: Request, res: Response) => {
  try {
    // Get models actually used in prompts
    const dbModels = await db.execute(sql`
      SELECT DISTINCT unnest(model_compatibility) as model
      FROM prompts
      WHERE model_compatibility IS NOT NULL
      ORDER BY model
    `);
    const usedModels = dbModels.rows.map((r: any) => r.model as string);

    // Curated modern defaults grouped by provider
    const defaults = {
      Anthropic: [
        "Claude Opus 4.6",
        "Claude Sonnet 4.6",
        "Claude Haiku 4.5",
      ],
      OpenAI: [
        "GPT-5",
        "GPT-4o",
        "GPT-4o mini",
        "o4-mini",
        "o3",
      ],
      Google: [
        "Gemini 2.5 Pro",
        "Gemini 2.5 Flash",
        "Gemini 2.0 Flash",
      ],
      xAI: [
        "Grok 4",
        "Grok 3",
      ],
      Meta: [
        "Llama 4 Maverick",
        "Llama 4 Scout",
        "Llama 3.3",
      ],
    };

    // Merge: DB models that aren't in defaults get added to "Other"
    const allDefaults = Object.values(defaults).flat();
    const other = usedModels.filter((m: string) => !allDefaults.includes(m));

    return res.json({ defaults, used: usedModels, other });
  } catch (err) {
    console.error("GET /api/prompts/models/available error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Mount improve routes (handles /:id/improve)
router.use("/", improveRouter);

export default router;
