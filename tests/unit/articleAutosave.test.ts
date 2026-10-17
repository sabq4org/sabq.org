import { describe, expect, it } from "vitest";
import {
  AUTOSAVE_INTERVAL_MS,
  SERVER_AUTOSAVE_FORBIDDEN_KEYS,
  autosavePayloadSignature,
  browserDraftIsNewerThanServer,
  buildDraftAutosavePatch,
  buildNewDraftCreateBody,
  canServerAutosaveExistingDraft,
  draftIsStillRestorable,
  hasMeaningfulDraftContent,
  legacyLocalDraftKey,
  readMigratedLocalDraft,
  stableLocalDraftKey,
} from "../../client/src/lib/articleAutosave";

function memoryStore(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    data,
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

const fields = {
  title: "عنوان المسودة",
  content: "<p>هذا نص كافٍ للحفظ التلقائي على الخادم.</p>",
  excerpt: "نبذة",
  slug: "draft-title",
  categoryId: "cat-1",
  articleType: "opinion",
  expectedUpdatedAt: "2026-10-15T08:00:00.000Z",
  keywords: ["رأي"],
};

describe("article draft autosave", () => {
  it("uses a stable local key per article and keeps new drafts on -new", () => {
    expect(stableLocalDraftKey("user-1", "art-9")).toBe("article-draft-v2-user-1-art-9");
    expect(stableLocalDraftKey("user-1", null)).toBe("article-draft-v2-user-1-new");
    expect(stableLocalDraftKey("user-1", "art-9")).not.toContain("localDraft");
    expect(legacyLocalDraftKey("user-1", "art-9", "uuid-1")).toBe(
      "article-draft-v2-user-1-art-9-uuid-1",
    );
  });

  it("copies a legacy URL draft once and does not overwrite a stable draft", () => {
    const legacy = legacyLocalDraftKey("user-1", null, "uuid-1");
    const stable = stableLocalDraftKey("user-1", null);
    const store = memoryStore({ [legacy]: "{\"title\":\"قديم\"}" });
    const migrated = readMigratedLocalDraft(store, {
      userId: "user-1",
      articleId: null,
      legacyDraftId: "uuid-1",
    });
    expect(migrated.migrated).toBe(true);
    expect(migrated.raw).toContain("قديم");
    expect(store.data[stable]).toContain("قديم");

    store.setItem(stable, "{\"title\":\"أحدث\"}");
    const kept = readMigratedLocalDraft(store, {
      userId: "user-1",
      articleId: null,
      legacyDraftId: "uuid-1",
    });
    expect(kept.migrated).toBe(false);
    expect(kept.raw).toContain("أحدث");
  });

  it("offers the browser copy only when it is newer than the server version", () => {
    const server = "2026-10-17T12:03:23.000Z";
    expect(browserDraftIsNewerThanServer("2026-10-17T12:03:20.000Z", server)).toBe(false);
    expect(browserDraftIsNewerThanServer(server, server)).toBe(false);
    expect(browserDraftIsNewerThanServer("2026-10-17T12:04:00.000Z", server)).toBe(true);
    expect(browserDraftIsNewerThanServer("2026-10-17T12:03:20.000Z", null)).toBe(true);
    expect(browserDraftIsNewerThanServer(undefined, server)).toBe(true);
  });

  it("treats a day-old draft as still restorable", () => {
    const yesterday = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    expect(draftIsStillRestorable(yesterday)).toBe(true);
    expect(draftIsStillRestorable("not-a-date")).toBe(false);
    expect(hasMeaningfulDraftContent("أب", "<p>قصير</p>")).toBe(false);
    expect(hasMeaningfulDraftContent("عنوان", "<p>محتوى كافٍ هنا تماماً</p>")).toBe(true);
  });

  it("patches an existing draft without status or schedule fields", () => {
    const patch = buildDraftAutosavePatch(fields);
    expect(patch).toMatchObject({
      title: "عنوان المسودة",
      expectedUpdatedAt: "2026-10-15T08:00:00.000Z",
      articleType: "opinion",
    });
    for (const key of SERVER_AUTOSAVE_FORBIDDEN_KEYS) {
      expect(patch).not.toHaveProperty(key);
    }
    expect(buildDraftAutosavePatch({ ...fields, status: "published" } as never)).not.toHaveProperty("status");
    expect(canServerAutosaveExistingDraft({ status: "draft", reviewStatus: null })).toBe(true);
    expect(canServerAutosaveExistingDraft({ status: "draft", reviewStatus: "needs_changes" })).toBe(true);
    expect(canServerAutosaveExistingDraft({ status: "draft", reviewStatus: "pending_review" })).toBe(false);
    expect(canServerAutosaveExistingDraft({ status: "scheduled", reviewStatus: null })).toBe(false);
    expect(canServerAutosaveExistingDraft({ status: "published", reviewStatus: "approved" })).toBe(false);
    const again = buildDraftAutosavePatch({ ...fields, expectedUpdatedAt: "2026-10-15T09:00:00.000Z" });
    expect(autosavePayloadSignature(patch!)).toBe(autosavePayloadSignature(again!));
  });

  it("creates a server draft as instant draft without scheduling or review submission", () => {
    const body = buildNewDraftCreateBody(fields);
    expect(body).toMatchObject({
      status: "draft",
      publishType: "instant",
      articleType: "opinion",
      slug: "draft-title",
    });
    expect(body).not.toHaveProperty("scheduledAt");
    expect(body).not.toHaveProperty("publishedAt");
    expect(body).not.toHaveProperty("submitForReview");
    expect(body).not.toHaveProperty("reviewStatus");
    expect(body).not.toHaveProperty("reviewNotes");
    expect(buildNewDraftCreateBody({ ...fields, title: "أ", content: "x" })).toBeNull();
    expect(AUTOSAVE_INTERVAL_MS).toBeGreaterThanOrEqual(30_000);
    expect(AUTOSAVE_INTERVAL_MS).toBeLessThanOrEqual(60_000);
  });
  it("keeps the visible byline when a new draft is created on the server", () => {
    const news = buildNewDraftCreateBody({
      ...fields,
      articleType: "news",
      reporterId: "RnP7eDOAl5T5rGpib9_8d",
      opinionAuthorId: "writer-1",
    });
    expect(news).toMatchObject({ reporterId: "RnP7eDOAl5T5rGpib9_8d", autosave: true });
    expect(news).not.toHaveProperty("opinionAuthorId");

    const opinion = buildNewDraftCreateBody({ ...fields, reporterId: "rep-1", opinionAuthorId: "writer-1" });
    expect(opinion).toMatchObject({ opinionAuthorId: "writer-1" });
    expect(opinion).not.toHaveProperty("reporterId");

    const unset = buildNewDraftCreateBody({ ...fields, articleType: "news", reporterId: null });
    expect(unset).not.toHaveProperty("reporterId");
  });
});
