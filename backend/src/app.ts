import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import session from "express-session";
import swaggerUi from "swagger-ui-express";
import { pool } from "./db";
import promptsRouter from "./routes/prompts";
import searchRouter from "./routes/search";
import authRouter from "./routes/auth";
import settingsRouter from "./routes/settings";
import playgroundRouter from "./routes/playground";
import foldersRouter from "./routes/folders";
import tagsRouter from "./routes/tags";
import { openApiSpec } from "./openapi";

const app = express();

// Trust reverse proxy (Caddy) for secure cookies
app.set("trust proxy", 1);

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}));
app.use(express.json());

// Session middleware
app.use(session({
  name: "prompthouse.sid",
  secret: process.env.SESSION_SECRET || "prompt-house-dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: "lax",
  },
}) as any);

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/prompts", promptsRouter);
app.use("/api/search", searchRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/playground", playgroundRouter);
app.use("/api/folders", foldersRouter);
app.use("/api/tags", tagsRouter);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use("/api-docs", ...(swaggerUi.serve as any), swaggerUi.setup(openApiSpec) as any);

// Serve frontend static files in production
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));
// SPA fallback: serve index.html for any non-API route
app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

export default app;
