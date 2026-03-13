import { Router, Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import crypto from "crypto";

const router = Router();

// Simple encryption for LLM keys at rest
const ALGO = "aes-256-gcm";
function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET || "prompt-house-dev-secret-change-me";
  return crypto.scryptSync(secret, "prompthouse-salt", 32);
}

function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

function decrypt(data: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, encrypted] = data.split(":");
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Mask a key for display: show first 8 and last 4 chars
function maskKey(key: string): string {
  if (key.length <= 12) return "****";
  return key.slice(0, 8) + "..." + key.slice(-4);
}

// GET /api/settings/llm-keys — list configured LLM providers (masked)
router.get("/llm-keys", requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT id, provider, label, created_at, updated_at
      FROM llm_keys
      ORDER BY provider, created_at
    `);

    // Return keys with masked values
    const keys = await Promise.all(result.rows.map(async (row: any) => {
      let maskedKey = "****";
      try {
        maskedKey = maskKey(decrypt(row.encrypted_key || ""));
      } catch { /* key might be corrupted */ }
      return {
        id: row.id,
        provider: row.provider,
        label: row.label,
        maskedKey,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }));

    return res.json(keys);
  } catch (err) {
    console.error("GET /api/settings/llm-keys error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/settings/llm-keys — add or update an LLM key
router.post("/llm-keys", requireAuth, async (req: Request, res: Response) => {
  try {
    const { provider, apiKey, label } = req.body;
    if (!provider || !apiKey) {
      return res.status(400).json({ error: "provider and apiKey are required" });
    }

    const validProviders = ["anthropic", "openai", "google", "xai", "openrouter", "custom"];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: `Invalid provider. Must be one of: ${validProviders.join(", ")}` });
    }

    const encrypted = encrypt(apiKey);

    const result = await db.execute(sql`
      INSERT INTO llm_keys (provider, label, encrypted_key)
      VALUES (${provider}, ${label || provider}, ${encrypted})
      ON CONFLICT (provider) DO UPDATE SET
        encrypted_key = ${encrypted},
        label = COALESCE(${label || null}, llm_keys.label),
        updated_at = NOW()
      RETURNING id, provider, label, created_at, updated_at
    `);

    const row = result.rows[0] as any;
    return res.json({
      id: row.id,
      provider: row.provider,
      label: row.label,
      maskedKey: maskKey(apiKey),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error("POST /api/settings/llm-keys error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/settings/llm-keys/:provider — remove an LLM key
router.delete("/llm-keys/:provider", requireAuth, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM llm_keys WHERE provider = ${req.params.provider}`);
    return res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/settings/llm-keys error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Internal: get decrypted key for a provider (used by playground)
export async function getLLMKey(provider: string): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT encrypted_key FROM llm_keys WHERE provider = ${provider} LIMIT 1
  `);
  if (!result.rows.length) return null;
  try {
    return decrypt((result.rows[0] as any).encrypted_key);
  } catch {
    return null;
  }
}

export default router;
