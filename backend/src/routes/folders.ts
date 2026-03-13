import { Router, Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET /api/folders — full tree
router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT f.id, f.name, f.parent_id, f.position, f.created_at, f.updated_at,
             COUNT(p.id)::int as prompt_count
      FROM folders f
      LEFT JOIN prompts p ON p.folder_id = f.id
      GROUP BY f.id
      ORDER BY f.position, f.name
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error("GET /api/folders error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/folders — create folder
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, parentId } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    // Validate parent exists if provided
    if (parentId) {
      const parent = await db.execute(sql`SELECT id FROM folders WHERE id = ${parentId}`);
      if (!parent.rows.length) {
        return res.status(400).json({ error: "Parent folder not found" });
      }
      // Check max depth (3 levels)
      const depth = await db.execute(sql`
        WITH RECURSIVE ancestors AS (
          SELECT id, parent_id, 1 as depth FROM folders WHERE id = ${parentId}
          UNION ALL
          SELECT f.id, f.parent_id, a.depth + 1 FROM folders f JOIN ancestors a ON f.id = a.parent_id
        )
        SELECT MAX(depth) as max_depth FROM ancestors
      `);
      if ((depth.rows[0] as any)?.max_depth >= 3) {
        return res.status(400).json({ error: "Maximum folder depth is 3 levels" });
      }
    }

    // Get next position
    const posResult = await db.execute(sql`
      SELECT COALESCE(MAX(position), -1) + 1 as next_pos
      FROM folders WHERE parent_id ${parentId ? sql`= ${parentId}` : sql`IS NULL`}
    `);
    const position = (posResult.rows[0] as any)?.next_pos ?? 0;

    const result = await db.execute(sql`
      INSERT INTO folders (name, parent_id, position)
      VALUES (${name.trim()}, ${parentId || null}, ${position})
      RETURNING *
    `);
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/folders error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/folders/:id — rename or move folder
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, parentId, position } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      updates.push("name");
      values.push(name.trim());
    }
    if (parentId !== undefined) {
      // Prevent moving a folder into itself or its children
      if (parentId === req.params.id) {
        return res.status(400).json({ error: "Cannot move folder into itself" });
      }
      updates.push("parent_id");
      values.push(parentId || null);
    }
    if (position !== undefined) {
      updates.push("position");
      values.push(position);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    const setClauses = updates.map((col) => `${col} = $${updates.indexOf(col) + 2}`).join(", ");

    const result = await db.execute(sql`
      UPDATE folders SET name = COALESCE(${name?.trim() || null}, name),
        parent_id = ${parentId !== undefined ? (parentId || null) : sql`parent_id`},
        position = COALESCE(${position ?? null}, position),
        updated_at = NOW()
      WHERE id = ${req.params.id}
      RETURNING *
    `);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Folder not found" });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /api/folders/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/folders/:id — delete folder (prompts get unfoldered, subfolders cascade)
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    // Unfolder all prompts in this folder (and subfolders)
    await db.execute(sql`
      WITH RECURSIVE descendants AS (
        SELECT id FROM folders WHERE id = ${req.params.id}
        UNION ALL
        SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
      )
      UPDATE prompts SET folder_id = NULL WHERE folder_id IN (SELECT id FROM descendants)
    `);

    await db.execute(sql`DELETE FROM folders WHERE id = ${req.params.id}`);
    return res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/folders/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/folders/:id/move-prompts — move prompts to a folder
router.patch("/:id/move-prompts", requireAuth, async (req: Request, res: Response) => {
  try {
    const { promptIds } = req.body;
    if (!Array.isArray(promptIds) || promptIds.length === 0) {
      return res.status(400).json({ error: "promptIds array required" });
    }

    // Verify folder exists (unless id is "unfolder")
    if (req.params.id !== "unfolder") {
      const folder = await db.execute(sql`SELECT id FROM folders WHERE id = ${req.params.id}`);
      if (!folder.rows.length) {
        return res.status(404).json({ error: "Folder not found" });
      }
    }

    const folderId = req.params.id === "unfolder" ? null : req.params.id;
    await db.execute(sql`
      UPDATE prompts SET folder_id = ${folderId}, updated_at = NOW()
      WHERE id = ANY(${promptIds}::uuid[])
    `);

    return res.json({ affected: promptIds.length });
  } catch (err) {
    console.error("PATCH /api/folders/:id/move-prompts error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
