import { Router, Request, Response } from "express";
import { Issuer, Client, generators } from "openid-client";

const router = Router();

let oidcClient: Client | null = null;

async function getClient(): Promise<Client> {
  if (oidcClient) return oidcClient;

  const issuerUrl = process.env.OIDC_ISSUER_URL;
  if (!issuerUrl) throw new Error("OIDC_ISSUER_URL not configured");

  const internalBase = process.env.OIDC_INTERNAL_BASE;

  let issuer: Issuer;
  if (internalBase) {
    // Fetch discovery doc via internal (Docker network) URL so we bypass
    // Cloudflare's edge bot challenge for server-to-server calls.
    // The public issuer URL stays in tokens for normal OIDC validation.
    const publicBase = new URL(issuerUrl);
    const wellKnownPath =
      publicBase.pathname.replace(/\/$/, "") + "/.well-known/openid-configuration";
    const discoveryUrl = internalBase.replace(/\/$/, "") + wellKnownPath;

    const res = await fetch(discoveryUrl);
    if (!res.ok) {
      throw new Error(`Internal OIDC discovery failed: ${res.status}`);
    }
    const metadata: any = await res.json();

    // Authentik builds URLs from the request host, so discovery returns
    // internal URLs (http://authentik-server:9000/...). Backend endpoints
    // (token/userinfo/jwks) stay internal — only this process calls them.
    // Browser-facing endpoints (authorization/end_session) are rewritten
    // to the public URL so the user's browser can reach them. The issuer
    // is left as Authentik returned it so the iss claim in tokens matches.
    const internalOrigin = internalBase.replace(/\/$/, "");
    const toPublic = (u?: string) =>
      u ? u.replace(internalOrigin, publicBase.origin) : u;
    metadata.authorization_endpoint = toPublic(metadata.authorization_endpoint);
    metadata.end_session_endpoint = toPublic(metadata.end_session_endpoint);

    issuer = new Issuer(metadata);
  } else {
    issuer = await Issuer.discover(issuerUrl);
  }

  oidcClient = new issuer.Client({
    client_id: process.env.OIDC_CLIENT_ID!,
    client_secret: process.env.OIDC_CLIENT_SECRET!,
    redirect_uris: [process.env.OIDC_REDIRECT_URI!],
    response_types: ["code"],
  });
  return oidcClient;
}


// GET /api/auth/login — redirect to Authentik
router.get("/login", async (req: Request, res: Response) => {
  try {
    const client = await getClient();
    const nonce = generators.nonce();
    const state = generators.state();

    req.session.oidcNonce = nonce;
    req.session.oidcState = state;
    req.session.returnTo = (req.query.returnTo as string) || "/";

    const authUrl = client.authorizationUrl({
      scope: "openid profile email",
      nonce,
      state,
    });
    return res.redirect(authUrl);
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Failed to initiate login" });
  }
});

// GET /api/auth/callback — handle Authentik redirect
router.get("/callback", async (req: Request, res: Response) => {
  try {
    const client = await getClient();
    const params = client.callbackParams(req);

    const tokenSet = await client.callback(process.env.OIDC_REDIRECT_URI!, params, {
      nonce: req.session.oidcNonce,
      state: req.session.oidcState,
    });

    const userinfo = await client.userinfo(tokenSet.access_token!);

    req.session.user = {
      sub: userinfo.sub,
      name: userinfo.name || userinfo.preferred_username || "User",
      email: userinfo.email || "",
      groups: (userinfo.groups as string[]) || [],
    };

    // Clean up OIDC state
    delete req.session.oidcNonce;
    delete req.session.oidcState;

    const returnTo = req.session.returnTo || "/";
    delete req.session.returnTo;

    return res.redirect(returnTo);
  } catch (err) {
    console.error("OIDC callback error:", err);
    return res.redirect("/?error=auth_failed");
  }
});

// GET /api/auth/me — return current user (or null)
router.get("/me", (req: Request, res: Response) => {
  if (req.session.user) {
    return res.json({ user: req.session.user });
  }
  return res.json({ user: null });
});

// POST /api/auth/logout
router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    res.clearCookie("prompthouse.sid");
    return res.json({ ok: true });
  });
});

export default router;
