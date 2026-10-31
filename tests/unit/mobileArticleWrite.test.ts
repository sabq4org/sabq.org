import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/newsImageStorageService", () => ({ newsImageStorageService: {} }));
vi.mock("../../server/services/mobileSubmissionService", () => ({ isOwnSubmissionImageUrl: () => false }));
vi.mock("../../server/services/articleHistoryService", () => ({ recordArticleSave: vi.fn() }));
vi.mock("../../server/services/publishFirstService", () => ({
  maybePlanPublishedRevision: vi.fn(),
  recordArticleRevision: vi.fn(),
}));
vi.mock("../../server/services/articleDerivedWrites", () => ({ articleWriteConflict: vi.fn() }));

import {
  isKeepableImageUrl,
  mapWithConcurrency,
  parseExpectedVersion,
  resubmitMobileArticle,
  sameArticleVersion,
  type ResubmitDeps,
} from "../../server/services/mobileArticleWriteService";

const OPENED_AT = new Date("2026-10-31T09:00:00.123Z");

function article(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    title: "عنوان قديم",
    authorId: null,
    reporterId: "rep",
    articleType: "news",
    status: "draft",
    reviewStatus: "needs_changes",
    imageUrl: "https://media.sabq.org/news/hero.webp",
    albumImages: ["https://media.sabq.org/news/a1.webp", "https://media.sabq.org/news/a2.webp"],
    updatedAt: OPENED_AT,
    ...over,
  } as any;
}

/** قاعدة في الذاكرة تطبّق شرط الكتابة النهائي نفسه (الحالة + النسخة). */
function harness(opts: {
  row?: any;
  upload?: (slot: string) => Promise<string | null>;
  license?: { ok: true } | { ok: false; message: string; code: string };
  pipeline?: { ok: true } | { ok: false; status: number; message: string; code: string };
  beforeWrite?: (row: any) => void;
} = {}) {
  let row = opts.row ?? article();
  const writes: any[] = [];
  const uploads: string[] = [];
  const saves: any[] = [];
  const deps: ResubmitDeps = {
    loadArticle: async () => (row ? { ...row } : undefined),
    licenseGate: async () => opts.license ?? { ok: true },
    pipelineGate: async () => opts.pipeline ?? { ok: true },
    uploadImage: async ({ slot }) => {
      uploads.push(slot);
      return opts.upload ? opts.upload(slot) : `https://media.sabq.org/news/up-${slot}.webp`;
    },
    isTrustedUrl: (url) => url.startsWith("https://media.sabq.org/"),
    guardedWrite: async ({ version, updates }) => {
      opts.beforeWrite?.(row);
      if (row.reviewStatus !== "needs_changes" || row.updatedAt.getTime() !== version.getTime()) return undefined;
      row = { ...row, ...updates, updatedAt: new Date(row.updatedAt.getTime() + 1) };
      writes.push(updates);
      return { ...row };
    },
    conflict: async () => ({ code: "ARTICLE_VERSION_CONFLICT", message: "تغير" }),
    recordSave: async (input) => {
      saves.push(input);
    },
  };
  return { deps, writes, uploads, saves, current: () => row };
}

const base = { userId: "rep", articleId: "a1", title: "عنوان جديد", htmlContent: "<p>نص</p>", excerpt: "نص" };

describe("resubmitMobileArticle", () => {
  it("refuses a form opened on an older version without uploading or writing", async () => {
    const h = harness({ row: article({ updatedAt: new Date("2026-10-31T09:05:00.000Z") }) });
    const result = await resubmitMobileArticle(
      { ...base, heroImage: "data:image/jpeg;base64,AAAA", expectedUpdatedAt: OPENED_AT },
      h.deps,
    );
    expect(result).toMatchObject({ ok: false, status: 409, code: "ARTICLE_VERSION_CONFLICT" });
    expect(h.uploads).toEqual([]);
    expect(h.writes).toEqual([]);
    expect(h.current().title).toBe("عنوان قديم");
  });

  it("returns a safe conflict when an editor publishes while photos upload", async () => {
    const h = harness({
      upload: async (slot) => `https://media.sabq.org/news/${slot}.webp`,
      // يصل نشر المحرر بعد بدء الطلب وقبل الكتابة النهائية.
      beforeWrite: (row) => {
        row.status = "published";
        row.reviewStatus = "approved";
        row.updatedAt = new Date("2026-10-31T09:01:00.000Z");
      },
    });
    const result = await resubmitMobileArticle({ ...base, heroImage: "data:image/jpeg;base64,AAAA" }, h.deps);
    expect(result).toMatchObject({ ok: false, status: 409, code: "ARTICLE_VERSION_CONFLICT" });
    expect(h.writes).toEqual([]);
    expect(h.current()).toMatchObject({ title: "عنوان قديم", status: "published", reviewStatus: "approved" });
    expect(h.saves).toEqual([]);
  });

  it("keeps the previous hero and album when every upload fails", async () => {
    const h = harness({ upload: async () => null });
    const result = await resubmitMobileArticle(
      { ...base, heroImage: "data:image/jpeg;base64,AAAA", albumImages: ["data:image/png;base64,BBBB", "data:image/png;base64,CCCC"] },
      h.deps,
    );
    expect(result).toMatchObject({ ok: false, status: 502, code: "IMAGE_UPLOAD_FAILED" });
    expect(h.writes).toEqual([]);
    expect(h.current().imageUrl).toBe("https://media.sabq.org/news/hero.webp");
    expect(h.current().albumImages).toHaveLength(2);
    expect(h.current().reviewStatus).toBe("needs_changes");
  });

  it("does not replace the album with a partial array when one photo fails", async () => {
    const h = harness({ upload: async (slot) => (slot === "album-1" ? null : `https://media.sabq.org/news/${slot}.webp`) });
    const result = await resubmitMobileArticle(
      { ...base, albumImages: ["https://media.sabq.org/news/a1.webp", "data:image/png;base64,BBBB", "data:image/png;base64,CCCC"] },
      h.deps,
    );
    expect(result).toMatchObject({ ok: false, code: "IMAGE_UPLOAD_FAILED" });
    expect(h.current().albumImages).toEqual(["https://media.sabq.org/news/a1.webp", "https://media.sabq.org/news/a2.webp"]);
  });

  it("treats a thrown upload as a failure, not a silent drop", async () => {
    const h = harness({ upload: async () => { throw new Error("r2 down"); } });
    const result = await resubmitMobileArticle({ ...base, albumImages: ["data:image/png;base64,BBBB"] }, h.deps);
    expect(result).toMatchObject({ ok: false, code: "IMAGE_UPLOAD_FAILED" });
    expect(h.writes).toEqual([]);
  });

  it("applies the same license gate as the first submit, before any upload", async () => {
    const h = harness({ license: { ok: false, code: "MEDIA_LICENSE_REQUIRED", message: "رخصة" } });
    const result = await resubmitMobileArticle({ ...base, heroImage: "data:image/jpeg;base64,AAAA" }, h.deps);
    expect(result).toMatchObject({ ok: false, status: 403, code: "MEDIA_LICENSE_REQUIRED" });
    expect(h.uploads).toEqual([]);
  });

  it("applies the opinion pipeline gate", async () => {
    const h = harness({
      row: article({ articleType: "opinion", authorId: "rep", reporterId: null }),
      pipeline: { ok: false, status: 409, code: "OPINION_PIPELINE_BUSY", message: "مشغول" },
    });
    const result = await resubmitMobileArticle(base, h.deps);
    expect(result).toMatchObject({ ok: false, status: 409, code: "OPINION_PIPELINE_BUSY" });
    expect(h.writes).toEqual([]);
  });

  it("refuses foreign image links instead of mirroring them", async () => {
    const h = harness();
    const result = await resubmitMobileArticle({ ...base, albumImages: ["https://evil.test/x.jpg"] }, h.deps);
    expect(result).toMatchObject({ ok: false, status: 400, code: "IMAGE_URL_NOT_ALLOWED" });
  });

  it("saves, keeps album order, flips to pending_review and records the save once", async () => {
    const h = harness();
    const result = await resubmitMobileArticle(
      {
        ...base,
        expectedUpdatedAt: OPENED_AT,
        heroImage: "data:image/jpeg;base64,AAAA",
        albumImages: ["https://media.sabq.org/news/a2.webp", "data:image/png;base64,BBBB", "data:image/png;base64,CCCC"],
      },
      h.deps,
    );
    expect(result.ok).toBe(true);
    expect(h.current()).toMatchObject({
      title: "عنوان جديد",
      reviewStatus: "pending_review",
      imageUrl: "https://media.sabq.org/news/up-hero.webp",
    });
    expect(h.current().albumImages).toEqual([
      "https://media.sabq.org/news/a2.webp",
      "https://media.sabq.org/news/up-album-1.webp",
      "https://media.sabq.org/news/up-album-2.webp",
    ]);
    expect(h.saves).toHaveLength(1);
  });

  it("refuses an article that is not waiting for the writer's changes", async () => {
    const h = harness({ row: article({ reviewStatus: "pending_review" }) });
    const result = await resubmitMobileArticle(base, h.deps);
    expect(result).toMatchObject({ ok: false, status: 409, code: "NOT_NEEDS_CHANGES" });
  });
});

describe("helpers", () => {
  it("parses only valid ISO versions", () => {
    expect(parseExpectedVersion("2026-10-31T09:00:00.123Z")?.toISOString()).toBe("2026-10-31T09:00:00.123Z");
    expect(parseExpectedVersion("not a date")).toBeNull();
    expect(parseExpectedVersion(undefined)).toBeNull();
  });

  it("compares versions at millisecond precision", () => {
    expect(sameArticleVersion(new Date("2026-10-31T09:00:00.123Z"), OPENED_AT)).toBe(true);
    expect(sameArticleVersion(new Date("2026-10-31T09:00:00.124Z"), OPENED_AT)).toBe(false);
    expect(sameArticleVersion(null, OPENED_AT)).toBe(false);
  });

  it("keeps existing article images even when not on a trusted origin", () => {
    const existing = { imageUrl: "https://imagedelivery.net/old/x", albumImages: ["https://legacy.test/a.jpg"] };
    const trusted = () => false;
    expect(isKeepableImageUrl("https://imagedelivery.net/old/x", existing, trusted)).toBe(true);
    expect(isKeepableImageUrl("https://legacy.test/a.jpg", existing, trusted)).toBe(true);
    expect(isKeepableImageUrl("https://other.test/b.jpg", existing, trusted)).toBe(false);
  });

  it("bounds concurrency and preserves order", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency([30, 5, 20, 1, 10], 3, async (ms, i) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, ms));
      active--;
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBeLessThanOrEqual(3);
  });
});
