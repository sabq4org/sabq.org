import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decideArticleVisibility } from "../../shared/articleVisibility";

const rows: Record<string, { status: string; authorId: string; reporterId: string | null }> = {
  "ar:published-story": { status: "published", authorId: "writer-1", reporterId: null },
  "ar:frpdjs2": { status: "draft", authorId: "writer-1", reporterId: null },
  "ar:embargoed": { status: "scheduled", authorId: "staff-9", reporterId: "reporter-2" },
  "en:en-draft": { status: "draft", authorId: "staff-9", reporterId: null },
};
const perms: Record<string, string[]> = { reviewer: ["opinion.review"], reader: ["comments.create"] };

vi.mock("../../server/services/articleVisibilityService", () => ({
  getArticleVisibilityRow: async (lang: string, key: string) => rows[`${lang}:${key}`] ?? null,
}));
vi.mock("../../server/rbac", () => ({
  getEffectiveUserPermissions: async (id: string) => perms[id] ?? [],
}));

describe("decideArticleVisibility", () => {
  const draft = { status: "draft", authorId: "a", reporterId: "r", submitterId: "s" };
  it("hides unpublished rows from anonymous visitors only", () => {
    expect(decideArticleVisibility({ ...draft, status: "published" }, null)).toBe("allow");
    for (const status of ["draft", "scheduled", "archived", "pending_review"]) {
      expect(decideArticleVisibility({ ...draft, status }, null)).toBe("deny");
    }
  });
  it("lets owners and editorial roles through, defers others to permissions", () => {
    expect(decideArticleVisibility(draft, { id: "a" })).toBe("allow");
    expect(decideArticleVisibility(draft, { id: "r" })).toBe("allow");
    expect(decideArticleVisibility(draft, { id: "s" })).toBe("allow");
    expect(decideArticleVisibility(draft, { id: "x", role: "Editor-In-Chief" })).toBe("allow");
    expect(decideArticleVisibility(draft, { id: "x", role: "opinion_author" })).toBe("check_permissions");
    expect(decideArticleVisibility(draft, { id: "x", role: "reader" })).toBe("check_permissions");
  });
});

describe("unpublished article guard", () => {
  let server: Server;
  let base = "";
  beforeAll(async () => {
    const { default: guard } = await import("../../server/routes/unpublishedArticleGuard");
    const app = express();
    app.use((req, _res, next) => {
      const id = req.header("x-user");
      if (id) (req as any).user = { id, role: req.header("x-role") || "reader" };
      next();
    });
    app.use(guard);
    // Stand-ins for the routes.ts handlers, which return any row by slug.
    app.get(/.*/, (req, res) => res.json({ reached: req.path }));
    server = await new Promise<Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const get = (path: string, user?: string, role?: string) =>
    fetch(base + path, { headers: { ...(user ? { "x-user": user } : {}), ...(role ? { "x-role": role } : {}) } });

  it("returns 404 to visitors for drafts and scheduled articles on every public path", async () => {
    for (const path of [
      "/api/articles/frpdjs2",
      "/api/opinion/frpdjs2",
      "/api/articles/frpdjs2/ai-bullets",
      "/api/articles/frpdjs2/summary-audio",
      "/api/opinion/frpdjs2/comments",
      "/api/articles/embargoed",
      "/api/en/articles/en-draft",
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect((await get("/api/articles/frpdjs2", "reader")).status).toBe(404);
  });

  it("keeps published articles, unknown keys and allowed viewers working", async () => {
    expect((await get("/api/articles/published-story")).status).toBe(200);
    expect((await get("/api/articles/featured")).status).toBe(200);
    expect((await get("/api/opinion/frpdjs2", "writer-1")).status).toBe(200);
    expect((await get("/api/articles/embargoed", "reporter-2")).status).toBe(200);
    expect((await get("/api/articles/embargoed", "staff-x", "editor")).status).toBe(200);
    const reviewer = await get("/api/opinion/frpdjs2", "reviewer", "opinion_author");
    expect(reviewer.status).toBe(200);
    expect(reviewer.headers.get("cache-control")).toBe("private, no-store");
  });
});
