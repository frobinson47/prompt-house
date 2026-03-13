import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";

// Mock the db module
vi.mock("../db", () => {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
    end: vi.fn(),
  };
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { db: mockDb, pool: mockPool };
});

import { db, pool } from "../db";

const SAMPLE_PROMPT = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  title: "Test Prompt",
  content: "You are a helpful assistant.",
  description: "A test prompt",
  tags: ["test"],
  modelCompatibility: ["GPT-4"],
  status: "active",
  visibility: "private",
  rating: null,
  usageExamples: null,
  version: 1,
  author: "Tester",
  searchVector: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function makeDbChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "from", "where", "orderBy", "limit", "offset", "returning", "values", "set"];
  methods.forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  // Terminal: resolves with rows
  (chain as Record<string, unknown>).__resolve = rows;
  // Make it thenable
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res);
  return chain;
}

describe("GET /health", () => {
  it("returns ok when db is reachable", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("returns 503 when db fails", async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(app).get("/health");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("error");
  });
});

describe("GET /api/prompts", () => {
  beforeEach(() => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockFrom = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockReturnThis();
    const mockOrderBy = vi.fn().mockReturnThis();
    const mockLimit = vi.fn().mockReturnThis();
    const mockOffset = vi.fn().mockResolvedValue([SAMPLE_PROMPT]);
    const mockCount = vi.fn().mockReturnThis();

    vi.mocked(db.select).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([SAMPLE_PROMPT]),
            }),
          }),
        }),
      }),
    }) as any);
  });

  it("returns 200 with paginated data", async () => {
    // Set up two db.select calls: one for rows, one for count
    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue([SAMPLE_PROMPT]),
                }),
              }),
            }),
          }),
        } as any;
      }
      // count query
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      } as any;
    });

    const res = await request(app).get("/api/prompts");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("pagination");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("rejects invalid query params", async () => {
    const res = await request(app).get("/api/prompts?page=abc");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/prompts/:id", () => {
  it("returns a prompt when found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([SAMPLE_PROMPT]),
        }),
      }),
    } as any);

    const res = await request(app).get(`/api/prompts/${SAMPLE_PROMPT.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(SAMPLE_PROMPT.id);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as any);

    const res = await request(app).get("/api/prompts/nonexistent-id");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/prompts", () => {
  it("creates a prompt and returns 201", async () => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([SAMPLE_PROMPT]),
      }),
    } as any);

    const res = await request(app)
      .post("/api/prompts")
      .send({ title: "Test Prompt", content: "You are helpful." });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(SAMPLE_PROMPT.id);
  });

  it("returns 400 on validation failure", async () => {
    const res = await request(app)
      .post("/api/prompts")
      .send({ title: "" }); // missing content
    expect(res.status).toBe(400);
  });

  it("returns 401 when API_KEY set and key missing", async () => {
    process.env.API_KEY = "secret";
    const res = await request(app)
      .post("/api/prompts")
      .send({ title: "T", content: "C" });
    expect(res.status).toBe(401);
    delete process.env.API_KEY;
  });

  it("accepts request when correct API key provided", async () => {
    process.env.API_KEY = "secret";
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([SAMPLE_PROMPT]),
      }),
    } as any);

    const res = await request(app)
      .post("/api/prompts")
      .set("X-Api-Key", "secret")
      .send({ title: "Test", content: "Content" });
    expect(res.status).toBe(201);
    delete process.env.API_KEY;
  });
});

describe("PATCH /api/prompts/:id", () => {
  it("updates a prompt", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([SAMPLE_PROMPT]),
        }),
      }),
    } as any);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...SAMPLE_PROMPT, title: "Updated" }]),
        }),
      }),
    } as any);

    const res = await request(app)
      .patch(`/api/prompts/${SAMPLE_PROMPT.id}`)
      .send({ title: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated");
  });

  it("returns 404 when prompt not found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as any);

    const res = await request(app)
      .patch("/api/prompts/does-not-exist")
      .send({ title: "X" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/prompts/:id", () => {
  it("soft-deletes (archives) a prompt", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([SAMPLE_PROMPT]),
        }),
      }),
    } as any);

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any);

    const res = await request(app).delete(`/api/prompts/${SAMPLE_PROMPT.id}`);
    expect(res.status).toBe(204);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as any);

    const res = await request(app).delete("/api/prompts/nope");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/prompts/:id/duplicate", () => {
  it("duplicates a prompt", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([SAMPLE_PROMPT]),
        }),
      }),
    } as any);

    const dupPrompt = {
      ...SAMPLE_PROMPT,
      id: "bbbbbbbb-0000-0000-0000-000000000002",
      title: "Test Prompt (copy)",
      status: "draft",
    };

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([dupPrompt]),
      }),
    } as any);

    const res = await request(app).post(`/api/prompts/${SAMPLE_PROMPT.id}/duplicate`);
    expect(res.status).toBe(201);
    expect(res.body.title).toContain("copy");
    expect(res.body.status).toBe("draft");
  });
});
