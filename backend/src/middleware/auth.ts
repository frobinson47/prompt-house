import { Request, Response, NextFunction } from "express";

/**
 * Requires authentication via either:
 * 1. Authentik OIDC session (preferred)
 * 2. Legacy X-Api-Key header (fallback for API/MCP usage)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Check session first (Authentik OIDC)
  if (req.session?.user) {
    return next();
  }

  // Fallback: legacy API key
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    const provided = req.headers["x-api-key"];
    if (provided && provided === apiKey) {
      return next();
    }
  }

  // No API_KEY configured and no session = auth disabled (dev mode)
  if (!process.env.API_KEY && !process.env.OIDC_CLIENT_ID) {
    return next();
  }

  return res.status(401).json({ error: "Unauthorized" });
}

/** @deprecated Use requireAuth instead */
export const requireApiKey = requireAuth;
