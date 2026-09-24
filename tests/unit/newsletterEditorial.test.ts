import { afterEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../server/db", () => ({ db: dbMock }));

import {
  calculateNewsletterEditorialHash,
  renderNewsletterHtml,
  redactSensitive,
  sourceForArticle,
  updateNewsletterEditorialDraft,
  validateNewsletterEditorialSources,
  getVerifiedNewsletterEditorialHtml,
  type NewsletterEditorialEnvelope,
} from "../../server/services/newsletterEditorialService";
import { newsletterDeliveryGuard } from "../../server/services/newsletterDeliveryQueue";

function makeEnvelope(): NewsletterEditorialEnvelope {
  const base = {
    version: 1 as const,
    kind: "newsletter-editorial" as const,
    type: "daily" as const,
    status: "draft" as const,
    title: "عنوان <اختبار>",
    preheader: "مقدمة قصيرة",
    items: [{ articleId: "article-1", title: "عنوان <اختبار>", url: "https://sabq.org/article/test", publishedAt: "2026-09-24T08:00:00.000Z", sourceContentHash: "source-hash", summary: "ملخص أمين" }],
    sourceRefs: [{ articleId: "article-1", title: "عنوان <اختبار>", url: "https://sabq.org/article/test", publishedAt: "2026-09-24T08:00:00.000Z", sourceContentHash: "source-hash" }],
    revision: 1,
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: "2026-09-24T08:00:00.000Z",
    updatedAt: "2026-09-24T08:00:00.000Z",
    approvedBy: null,
    approvedAt: null,
    approvedHash: null,
  };
  const html = renderNewsletterHtml(base);
  return { ...base, html, contentHash: calculateNewsletterEditorialHash(base) };
}

afterEach(() => vi.clearAllMocks());

describe("newsletter editorial contract", () => {
  it("hashes content only, so approval metadata and rendered HTML do not change the revision hash", () => {
    const envelope = makeEnvelope();
    const approved = { ...envelope, status: "approved" as const, approvedBy: "editor-1", approvedAt: "2026-09-24T09:00:00.000Z", approvedHash: envelope.contentHash, html: `${envelope.html}\n` };
    expect(calculateNewsletterEditorialHash(envelope)).toBe(envelope.contentHash);
    expect(calculateNewsletterEditorialHash(approved)).toBe(envelope.contentHash);
  });

  it("escapes source text and carries fixed UTM values without subscriber identifiers", () => {
    const html = renderNewsletterHtml(makeEnvelope());
    expect(html).toContain("عنوان &lt;اختبار&gt;");
    expect(html).toContain("utm_source=mailerlite&amp;utm_medium=email&amp;utm_campaign=sabq_newsletter_daily");
    expect(html).toContain("{$unsubscribe}");
    expect(html).toContain("{$account}");
    expect(html).not.toContain("@");
    expect(html).not.toContain("subscriberId");
  });

  it("builds source references from published article fields", () => {
    const source = sourceForArticle({ id: "a1", title: "<b>خبر</b>", slug: "خبر-1", englishSlug: "news-1", publishedAt: new Date("2026-09-24T08:00:00.000Z") } as any);
    expect(source).toMatchObject({ articleId: "a1", title: "خبر", url: "https://sabq.org/article/news-1", publishedAt: "2026-09-24T08:00:00.000Z" });
    expect(source.sourceContentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("redacts email addresses and phone numbers before AI grounding", () => {
    const redacted = redactSensitive("للتواصل editor@example.com أو 055 123 4567");
    expect(redacted).not.toContain("editor@example.com");
    expect(redacted).not.toContain("055 123 4567");
  });

  it("fails closed for drafts and editorial envelopes in the legacy delivery worker", () => {
    expect(newsletterDeliveryGuard({ status: "draft", customContent: null })).toEqual({ allowed: false, reason: "newsletter_status_draft_is_not_published" });
    expect(newsletterDeliveryGuard({ status: "published", customContent: JSON.stringify({ kind: "newsletter-editorial" }) })).toEqual({ allowed: false, reason: "editorial_newsletters_require_manual_mailerlite_import" });
    expect(newsletterDeliveryGuard({ status: "published", customContent: null })).toEqual({ allowed: true });
  });

  it("uses the old envelope as a compare-and-swap token and rejects a lost update", async () => {
    const envelope = makeEnvelope();
    const row = { id: "newsletter-1", customContent: JSON.stringify(envelope) };
    dbMock.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [row] }) }) });
    dbMock.update.mockReturnValue({ set: () => ({ where: () => ({ returning: async () => [] }) }) });

    await expect(updateNewsletterEditorialDraft("newsletter-1", {
      expectedHash: envelope.contentHash,
      title: envelope.title,
      preheader: envelope.preheader,
      items: envelope.items.map(({ articleId, summary }) => ({ articleId, summary: `${summary} تعديل` })),
    }, "editor-1")).rejects.toThrow("NEWSLETTER_EDITORIAL_CONFLICT");
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("rejects an approved source whose body changes, is unpublished, or is future-dated", async () => {
    const article = {
      id: "article-1", title: "مصدر توضيحي", content: "النص الأصلي", excerpt: "مقتطف",
      slug: "source-test", englishSlug: "source-test", status: "published",
      publishedAt: new Date("2026-09-01T08:00:00Z"),
    };
    const source = sourceForArticle(article as any);
    const editorial = { ...makeEnvelope(), items: [{ ...source, summary: "ملخص" }], sourceRefs: [source] };
    const check = async (current: typeof article) => {
      dbMock.select.mockReturnValue({ from: () => ({ where: async () => [current] }) });
      return validateNewsletterEditorialSources({ editorial });
    };
    expect(await check(article)).toBe(true);
    expect(await check({ ...article, content: "تم تصحيح المتن" })).toBe(false);
    expect(await check({ ...article, status: "draft" })).toBe(false);
    expect(await check({ ...article, publishedAt: new Date(Date.now() + 86400000) })).toBe(false);
  });

  it("re-renders export from verified content and rejects content tampering", () => {
    const editorial = makeEnvelope();
    const tamperedHtml = { ...editorial, html: "<script>alert(1)</script>" };
    expect(getVerifiedNewsletterEditorialHtml(tamperedHtml)).toBe(renderNewsletterHtml(editorial));
    expect(() => getVerifiedNewsletterEditorialHtml({ ...editorial, title: "عنوان غير مراجع" })).toThrow("HASH_MISMATCH");
  });

  it("editing an approved revision clears its approval and returns to draft", async () => {
    const envelope = { ...makeEnvelope(), status: "approved" as const, approvedBy: "editor-1", approvedAt: "2026-09-24T08:00:00Z" };
    envelope.approvedHash = envelope.contentHash;
    dbMock.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ id: "newsletter-1", customContent: JSON.stringify(envelope) }] }) }) });
    const set = vi.fn((values: Record<string, unknown>) => ({ where: () => ({ returning: async () => [{ id: "newsletter-1", ...values }] }) }));
    dbMock.update.mockReturnValue({ set });
    const result = await updateNewsletterEditorialDraft("newsletter-1", {
      expectedHash: envelope.contentHash, title: "عنوان بعد المراجعة", preheader: envelope.preheader,
      items: envelope.items.map(({ articleId, summary }) => ({ articleId, summary })),
    }, "editor-2");
    expect(result?.editorial).toMatchObject({ status: "draft", approvedHash: null, approvedBy: null, approvedAt: null, revision: 2 });
    expect(result?.editorial.contentHash).not.toBe(envelope.contentHash);
  });

});
