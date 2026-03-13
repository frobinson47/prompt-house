import { Router, Request, Response } from "express";
import { db } from "../db";
import { prompts } from "../db/schema";
import { sql, and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  generateEmbedding,
  buildEmbeddingText,
  EMBEDDING_DIM,
} from "../embeddings";
import { requireApiKey } from "../middleware/auth";

const router = Router();

const searchSchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  status: z.string().optional(),
  type: z.string().optional(),
  threshold: z.coerce.number().min(0).max(1).optional().default(0.1),
});

// GET /api/search — semantic search
router.get("/", async (req: Request, res: Response) => {
  try {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid query", details: parsed.error.flatten() });
    }
    const { q, limit, status, type, threshold } = parsed.data;

    const queryEmbedding = await generateEmbedding(q);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    let conditions: any[] = [
      sql`embedding IS NOT NULL`,
    ];
    if (status) conditions.push(eq(prompts.status, status));
    if (type) conditions.push(eq(prompts.promptType, type));

    const whereClause = and(...conditions);

    const results = await db.execute(sql`
      SELECT
        id, title, description, content, tags, model_compatibility,
        status, visibility, rating, usage_examples, version, author,
        is_favorite, prompt_type, created_at, updated_at,
        1 - (embedding <=> ${embeddingStr}::vector) as similarity
      FROM prompts
      WHERE embedding IS NOT NULL
        ${status ? sql`AND status = ${status}` : sql``}
        ${type ? sql`AND prompt_type = ${type}` : sql``}
        AND 1 - (embedding <=> ${embeddingStr}::vector) > ${threshold}
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `);

    return res.json({
      data: results.rows.map((row: any) => ({
        ...row,
        similarity: parseFloat(row.similarity),
        modelCompatibility: row.model_compatibility,
        usageExamples: row.usage_examples,
        isFavorite: row.is_favorite,
        promptType: row.prompt_type,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      query: q,
      count: results.rows.length,
    });
  } catch (err) {
    console.error("GET /api/search error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/search/backfill — generate embeddings for all prompts without one
router.post("/backfill", requireApiKey, async (_req: Request, res: Response) => {
  try {
    const missing = await db.execute(
      sql`SELECT id, title, description, content, tags FROM prompts WHERE embedding IS NULL`
    );

    let processed = 0;
    let failed = 0;
    const total = missing.rows.length;

    for (const row of missing.rows as any[]) {
      try {
        const text = buildEmbeddingText(row);
        const embedding = await generateEmbedding(text);
        const embeddingStr = `[${embedding.join(",")}]`;
        await db.execute(
          sql`UPDATE prompts SET embedding = ${embeddingStr}::vector WHERE id = ${row.id}`
        );
        processed++;
        if (processed % 10 === 0) {
          console.log(`Backfill progress: ${processed}/${total}`);
        }
      } catch (err) {
        console.error(`Failed to embed prompt ${row.id}:`, err);
        failed++;
      }
    }

    console.log(`Backfill complete: ${processed} processed, ${failed} failed out of ${total}`);
    return res.json({ processed, failed, total });
  } catch (err) {
    console.error("POST /api/search/backfill error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/search/status — check embedding coverage
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT
        count(*) as total,
        count(embedding) as embedded,
        count(*) - count(embedding) as missing
      FROM prompts
    `);
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("GET /api/search/status error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
