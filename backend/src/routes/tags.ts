import { Router, Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET /api/tags — all tags with counts
router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT tag, COUNT(*)::int as count
      FROM prompts, UNNEST(tags) as tag
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error("GET /api/tags error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tags/rename — rename a tag across all prompts
router.post("/rename", requireAuth, async (req: Request, res: Response) => {
  try {
    const { oldTag, newTag } = req.body;
    if (!oldTag || !newTag || !oldTag.trim() || !newTag.trim()) {
      return res.status(400).json({ error: "oldTag and newTag are required" });
    }
    const old = oldTag.trim().toLowerCase();
    const replacement = newTag.trim().toLowerCase();

    // Replace oldTag with newTag in all prompts that have it
    const result = await db.execute(sql`
      UPDATE prompts
      SET tags = array_replace(tags, ${old}, ${replacement}),
          updated_at = NOW()
      WHERE ${old} = ANY(tags)
      RETURNING id
    `);
    return res.json({ affected: result.rows.length, oldTag: old, newTag: replacement });
  } catch (err) {
    console.error("POST /api/tags/rename error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tags/merge — merge multiple tags into one
router.post("/merge", requireAuth, async (req: Request, res: Response) => {
  try {
    const { sourceTags, targetTag } = req.body;
    if (!Array.isArray(sourceTags) || sourceTags.length === 0 || !targetTag?.trim()) {
      return res.status(400).json({ error: "sourceTags array and targetTag are required" });
    }
    const target = targetTag.trim().toLowerCase();
    let totalAffected = 0;

    for (const src of sourceTags) {
      const tag = src.trim().toLowerCase();
      if (tag === target) continue;
      const result = await db.execute(sql`
        UPDATE prompts
        SET tags = array_replace(tags, ${tag}, ${target}),
            updated_at = NOW()
        WHERE ${tag} = ANY(tags)
        RETURNING id
      `);
      totalAffected += result.rows.length;
    }

    // Remove duplicate tags that might result from merge
    await db.execute(sql`
      UPDATE prompts
      SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags) ORDER BY 1))
      WHERE ${target} = ANY(tags)
    `);

    return res.json({ affected: totalAffected, targetTag: target });
  } catch (err) {
    console.error("POST /api/tags/merge error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/tags/:tag — remove a tag from all prompts
router.delete("/:tag", requireAuth, async (req: Request, res: Response) => {
  try {
    const tag = decodeURIComponent(req.params.tag).toLowerCase();
    const result = await db.execute(sql`
      UPDATE prompts
      SET tags = array_remove(tags, ${tag}),
          updated_at = NOW()
      WHERE ${tag} = ANY(tags)
      RETURNING id
    `);
    return res.json({ affected: result.rows.length, tag });
  } catch (err) {
    console.error("DELETE /api/tags/:tag error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
