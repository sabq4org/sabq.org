import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { articles, audioNewsletterArticles, audioNewsletters, type Article, type AudioNewsletter } from "@shared/schema";
import { db } from "../db";
import { aiGateway } from "../ai/gateway";
import { SABQ_FALLBACK_EDITOR_MODEL, SABQ_PRIMARY_EDITOR_MODEL } from "../ai/sabqEditorialPrompt";

export const NEWSLETTER_EDITORIAL_VERSION = 1 as const;
export const NEWSLETTER_EDITORIAL_KIND = "newsletter-editorial" as const;
export type NewsletterEditorialStatus = "draft" | "approved";
export type NewsletterEditorialType = "daily" | "weekly";

export type NewsletterEditorialSource = {
  articleId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  sourceContentHash: string;
};

export type NewsletterEditorialItem = NewsletterEditorialSource & {
  summary: string;
};

export type NewsletterEditorialEnvelope = {
  version: typeof NEWSLETTER_EDITORIAL_VERSION;
  kind: typeof NEWSLETTER_EDITORIAL_KIND;
  type: NewsletterEditorialType;
  status: NewsletterEditorialStatus;
  title: string;
  preheader: string;
  items: NewsletterEditorialItem[];
  sourceRefs: NewsletterEditorialSource[];
  html: string;
  revision: number;
  contentHash: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  approvedHash: string | null;
};

const generatedSchema = z.object({
  title: z.string().trim().min(1).max(180),
  preheader: z.string().trim().min(1).max(240),
  summaries: z.array(z.object({
    articleId: z.string().min(1),
    summary: z.string().trim().min(1).max(700),
  })).min(1),
});

export const newsletterEditorialEditSchema = z.object({
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string().trim().min(1).max(180),
  preheader: z.string().trim().min(1).max(240),
  items: z.array(z.object({
    articleId: z.string().min(1),
    summary: z.string().trim().min(1).max(700),
  })).min(1).max(20),
});

const newsletterEditorialApproveSchema = z.object({
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export type NewsletterEditorialEdit = z.infer<typeof newsletterEditorialEditSchema>;

function stripMarkup(value: string | null | undefined): string {
  return (value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function redactSensitive(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[محذوف]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[محذوف]");
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function articleUrl(article: Article): string {
  const origin = (process.env.FRONTEND_URL || "https://sabq.org").replace(/\/$/, "");
  return `${origin}/article/${encodeURIComponent(article.englishSlug || article.slug)}`;
}

export function sourceForArticle(article: Article): NewsletterEditorialSource {
  const sourceContentHash = createHash("sha256").update(JSON.stringify({
    title: stripMarkup(article.title),
    excerpt: stripMarkup(article.excerpt || ""),
    content: stripMarkup(article.content),
    slug: article.slug,
    englishSlug: article.englishSlug || null,
    publishedAt: article.publishedAt?.toISOString() ?? null,
  })).digest("hex");
  return {
    articleId: article.id,
    title: redactSensitive(stripMarkup(article.title)),
    url: articleUrl(article),
    publishedAt: article.publishedAt?.toISOString() ?? null,
    sourceContentHash,
  };
}

function fallbackSummary(article: Article): string {
  const source = stripMarkup(article.excerpt || article.content || "");
  if (source.length <= 420) return source || "تفاصيل الخبر متاحة عبر المصدر.";
  return `${source.slice(0, 417).trimEnd()}…`;
}

function canonicalForHash(envelope: Pick<NewsletterEditorialEnvelope, "version" | "kind" | "type" | "title" | "preheader" | "items" | "sourceRefs">): string {
  return JSON.stringify({
    version: envelope.version,
    kind: envelope.kind,
    type: envelope.type,
    title: envelope.title,
    preheader: envelope.preheader,
    items: envelope.items,
    sourceRefs: envelope.sourceRefs,
  });
}

export function calculateNewsletterEditorialHash(envelope: Pick<NewsletterEditorialEnvelope, "version" | "kind" | "type" | "title" | "preheader" | "items" | "sourceRefs">): string {
  return createHash("sha256").update(canonicalForHash(envelope)).digest("hex");
}

function withUtm(url: string, type: NewsletterEditorialType): string {
  return `${url}${url.includes("?") ? "&" : "?"}utm_source=mailerlite&utm_medium=email&utm_campaign=sabq_newsletter_${type}`;
}

export function renderNewsletterHtml(input: {
  type: NewsletterEditorialType;
  title: string;
  preheader: string;
  items: NewsletterEditorialItem[];
}): string {
  const cards = input.items.map((item) => `
    <article style="margin:0 0 24px;padding:0 0 20px;border-bottom:1px solid #e3ebf2">
      <h2 style="margin:0 0 8px;font:700 20px/1.6 Arial,sans-serif;color:#0e2233">${escapeHtml(item.title)}</h2>
      <p style="margin:0 0 10px;font:400 16px/1.9 Arial,sans-serif;color:#334a5b">${escapeHtml(item.summary)}</p>
      <a href="${escapeHtml(withUtm(item.url, input.type))}" style="font:600 14px/1.5 Arial,sans-serif;color:#0e76b8;text-decoration:none">اقرأ الخبر كاملًا ←</a>
    </article>`).join("");
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;background:#f6f9fb"><div style="max-width:680px;margin:0 auto;padding:28px 18px;background:#fff">
  <header style="padding:0 0 22px;margin:0 0 24px;border-bottom:3px solid #4cbffd"><div style="font:700 14px/1.5 Arial,sans-serif;color:#0e76b8">سبق</div><h1 style="margin:8px 0 5px;font:700 28px/1.45 Arial,sans-serif;color:#0e2233">${escapeHtml(input.title)}</h1><p style="margin:0;font:400 15px/1.7 Arial,sans-serif;color:#5a6b79">${escapeHtml(input.preheader)}</p></header>
  ${cards}
  <footer style="padding-top:8px;font:400 12px/1.7 Arial,sans-serif;color:#7a8994"><p>تصلك هذه النشرة لأنك اشتركت في تحديثات سبق.</p><p><a href="{$unsubscribe}" style="color:#0e76b8">إلغاء الاشتراك</a></p><p>{$account}</p></footer>
</div></body></html>`;
}

function parseEnvelope(newsletter: AudioNewsletter): NewsletterEditorialEnvelope | null {
  if (!newsletter.customContent) return null;
  try {
    const parsed = JSON.parse(newsletter.customContent) as NewsletterEditorialEnvelope;
    if (parsed?.version !== NEWSLETTER_EDITORIAL_VERSION || parsed.kind !== NEWSLETTER_EDITORIAL_KIND) return null;
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.sourceRefs) || !parsed.contentHash || parsed.items.length === 0) return null;
    if (parsed.sourceRefs.length !== parsed.items.length) return null;
    if (parsed.items.some((item, index) => !item || item.articleId !== parsed.sourceRefs[index]?.articleId)) return null;
    if (new Set(parsed.items.map((item) => item.articleId)).size !== parsed.items.length) return null;
    if (calculateNewsletterEditorialHash(parsed) !== parsed.contentHash) return null;
    if (renderNewsletterHtml(parsed) !== parsed.html) return null;
    return parsed;
  } catch {
    return null;
  }
}

function serializeEnvelope(input: Omit<NewsletterEditorialEnvelope, "contentHash" | "html">): NewsletterEditorialEnvelope {
  const html = renderNewsletterHtml(input);
  const withHtml = { ...input, html } as Omit<NewsletterEditorialEnvelope, "contentHash">;
  return { ...withHtml, contentHash: calculateNewsletterEditorialHash(withHtml) };
}

async function generateSummaries(
  type: NewsletterEditorialType,
  selected: Article[],
  userId: string,
): Promise<{ title: string; preheader: string; summaries: Map<string, string> }> {
  const sourceMaterial = selected.map((article) => [
    `ARTICLE_ID: ${article.id}`,
    `TITLE: ${redactSensitive(stripMarkup(article.title))}`,
    `PUBLISHED_AT: ${article.publishedAt?.toISOString() || "unknown"}`,
    `EXCERPT: ${redactSensitive(stripMarkup(article.excerpt || ""))}`,
    `BODY: ${redactSensitive(stripMarkup(article.content)).slice(0, 5000)}`,
  ].join("\n")).join("\n\n---\n\n");
  const instruction = `أنشئ مسودة نشرة بريدية عربية ${type === "weekly" ? "أسبوعية" : "يومية"} اعتمادًا على المواد المصدرية أدناه فقط. لا تضف معلومة غير موجودة. أعد JSON فقط بالشكل: {"title":"...","preheader":"...","summaries":[{"articleId":"...","summary":"..."}]}. يجب أن تتضمن summaries كل ARTICLE_ID مرة واحدة، وكل ملخص بين 35 و500 حرف، دون HTML أو روابط أو عناوين بريدية.`;
  try {
    let raw: string;
    try {
      raw = (await aiGateway.complete({
        feature: "newsletter-editorial",
        userId,
        model: { provider: SABQ_PRIMARY_EDITOR_MODEL.startsWith("claude") ? "anthropic" : "openai", modelId: SABQ_PRIMARY_EDITOR_MODEL },
        messages: [{ role: "system", content: instruction }, { role: "user", content: sourceMaterial }],
        options: { maxTokens: 3000, temperature: 0.2, jsonMode: true },
      })).content;
    } catch {
      raw = (await aiGateway.complete({
        feature: "newsletter-editorial",
        userId,
        model: { provider: SABQ_FALLBACK_EDITOR_MODEL.startsWith("claude") ? "anthropic" : "openai", modelId: SABQ_FALLBACK_EDITOR_MODEL },
        messages: [{ role: "system", content: instruction }, { role: "user", content: sourceMaterial }],
        options: { maxTokens: 3000, temperature: 0.2, jsonMode: true },
      })).content;
    }
    const parsed = generatedSchema.parse(JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")));
    const allowedIds = new Set(selected.map((article) => article.id));
    const summaries = new Map<string, string>();
    for (const item of parsed.summaries) {
      if (allowedIds.has(item.articleId)) summaries.set(item.articleId, stripMarkup(item.summary));
    }
    if (summaries.size !== selected.length) throw new Error("AI omitted a source article");
    return { title: stripMarkup(parsed.title), preheader: stripMarkup(parsed.preheader), summaries };
  } catch (error) {
    console.warn(`[NewsletterEditorial] AI draft fallback: ${error instanceof Error ? error.message : "unknown error"}`);
    return {
      title: type === "weekly" ? "النشرة الأسبوعية من سبق" : "أبرز أخبار سبق اليوم",
      preheader: "ملخص أمين لأبرز الأخبار المنشورة في سبق.",
      summaries: new Map(selected.map((article) => [article.id, fallbackSummary(article)])),
    };
  }
}

export async function selectPublishedNewsletterArticles(type: NewsletterEditorialType, articleIds?: string[]): Promise<Article[]> {
  const limit = 5;
  if (articleIds?.length) {
    if (articleIds.length > limit || new Set(articleIds).size !== articleIds.length) throw new Error("قائمة المقالات تحتوي على تكرار أو حجم غير صالح");
    const rows = await db.select().from(articles).where(and(inArray(articles.id, articleIds), eq(articles.status, "published")));
    const byId = new Map(rows.map((row) => [row.id, row]));
    if (rows.length !== articleIds.length || articleIds.some((id) => !byId.has(id))) throw new Error("كل المصادر يجب أن تكون مقالات منشورة");
    return articleIds.map((id) => byId.get(id) as Article);
  }
  const windowHours = type === "weekly" ? 168 : 24;
  return db.select().from(articles)
    .where(and(eq(articles.status, "published"), isNotNull(articles.content), gte(articles.publishedAt, new Date(Date.now() - windowHours * 60 * 60 * 1000))))
    .orderBy(desc(articles.publishedAt), desc(articles.createdAt)).limit(limit);
}

export async function createNewsletterEditorialDraft(input: {
  type: NewsletterEditorialType;
  userId: string;
  articleIds?: string[];
  title?: string;
  description?: string;
}): Promise<AudioNewsletter> {
  const selected = await selectPublishedNewsletterArticles(input.type, input.articleIds);
  if (selected.length === 0) throw new Error("لا توجد مقالات منشورة مناسبة لهذه النشرة");
  const generated = await generateSummaries(input.type, selected, input.userId);
  const now = new Date().toISOString();
  const items = selected.map((article) => ({ ...sourceForArticle(article), summary: generated.summaries.get(article.id) || fallbackSummary(article) }));
  const base = {
    version: NEWSLETTER_EDITORIAL_VERSION,
    kind: NEWSLETTER_EDITORIAL_KIND,
    type: input.type,
    status: "draft" as const,
    title: stripMarkup(input.title || generated.title),
    preheader: generated.preheader,
    items,
    sourceRefs: items.map(({ summary: _summary, ...source }) => source),
    revision: 1,
    createdBy: input.userId,
    updatedBy: input.userId,
    createdAt: now,
    updatedAt: now,
    approvedBy: null,
    approvedAt: null,
    approvedHash: null,
  } satisfies Omit<NewsletterEditorialEnvelope, "contentHash" | "html">;
  const envelope = serializeEnvelope(base);
  const slug = `newsletter-editorial-${input.type}-${Date.now()}`;
  const [newsletter] = await db.insert(audioNewsletters).values({
    title: envelope.title,
    description: input.description || envelope.preheader,
    customContent: JSON.stringify(envelope),
    slug,
    generatedBy: input.userId,
    generationStatus: "completed",
    status: "draft",
    template: input.type === "weekly" ? "weekly_roundup" : "morning_brief",
  }).returning();
  await db.insert(audioNewsletterArticles).values(selected.map((article, order) => ({ newsletterId: newsletter.id, articleId: article.id, order })));
  return newsletter;
}

export async function listNewsletterEditorialDrafts(limit = 20): Promise<Array<AudioNewsletter & { editorial: NewsletterEditorialEnvelope | null }>> {
  const rows = await db.select().from(audioNewsletters).where(isNotNull(audioNewsletters.customContent)).orderBy(desc(audioNewsletters.updatedAt)).limit(Math.min(limit, 100));
  return rows.map((newsletter) => ({ ...newsletter, editorial: parseEnvelope(newsletter) })).filter((row) => row.editorial !== null) as Array<AudioNewsletter & { editorial: NewsletterEditorialEnvelope }>;
}

export async function getNewsletterEditorialDraft(id: string): Promise<{ newsletter: AudioNewsletter; editorial: NewsletterEditorialEnvelope } | null> {
  const [newsletter] = await db.select().from(audioNewsletters).where(eq(audioNewsletters.id, id)).limit(1);
  if (!newsletter) return null;
  const editorial = parseEnvelope(newsletter);
  return editorial ? { newsletter, editorial } : null;
}

export async function updateNewsletterEditorialDraft(id: string, input: NewsletterEditorialEdit, userId: string): Promise<{ newsletter: AudioNewsletter; editorial: NewsletterEditorialEnvelope } | null> {
  const current = await getNewsletterEditorialDraft(id);
  if (!current) return null;
  if (current.editorial.contentHash !== input.expectedHash) throw new Error("NEWSLETTER_EDITORIAL_CONFLICT");
  const currentIds = current.editorial.items.map((item) => item.articleId);
  const inputIds = input.items.map((item) => item.articleId);
  if (inputIds.length !== currentIds.length || inputIds.some((articleId, index) => articleId !== currentIds[index]) || new Set(inputIds).size !== inputIds.length) {
    throw new Error("لا يمكن تغيير ترتيب أو مصادر المسودة");
  }
  const byId = new Map(current.editorial.items.map((item) => [item.articleId, item]));
  const items = input.items.map((item) => {
    const source = byId.get(item.articleId);
    if (!source) throw new Error("لا يمكن إضافة مصدر غير موجود في المسودة");
    return { ...source, summary: stripMarkup(item.summary) };
  });
  const base = {
    ...current.editorial,
    status: "draft" as const,
    title: stripMarkup(input.title),
    preheader: stripMarkup(input.preheader),
    items,
    sourceRefs: items.map(({ summary: _summary, ...source }) => source),
    revision: current.editorial.revision + 1,
    updatedBy: userId,
    updatedAt: new Date().toISOString(),
    approvedBy: null,
    approvedAt: null,
    approvedHash: null,
  };
  const envelope = serializeEnvelope(base);
  const [updated] = await db.update(audioNewsletters).set({
    title: envelope.title,
    description: envelope.preheader,
    customContent: JSON.stringify(envelope),
    status: "draft",
    updatedAt: new Date(),
  }).where(and(eq(audioNewsletters.id, id), eq(audioNewsletters.customContent, JSON.stringify(current.editorial)))).returning();
  if (!updated) throw new Error("NEWSLETTER_EDITORIAL_CONFLICT");
  return { newsletter: updated, editorial: envelope };
}

export async function approveNewsletterEditorialDraft(id: string, expectedHash: string, userId: string): Promise<{ newsletter: AudioNewsletter; editorial: NewsletterEditorialEnvelope } | null> {
  const current = await getNewsletterEditorialDraft(id);
  if (!current) return null;
  if (current.editorial.contentHash !== expectedHash) throw new Error("NEWSLETTER_EDITORIAL_CONFLICT");
  if (!(await validateNewsletterEditorialSources(current))) throw new Error("NEWSLETTER_EDITORIAL_SOURCES_CHANGED");
  if (current.editorial.status === "approved" && current.editorial.approvedHash === expectedHash) return current;
  const now = new Date().toISOString();
  const base = { ...current.editorial, status: "approved" as const, approvedBy: userId, approvedAt: now, approvedHash: expectedHash, updatedBy: userId, updatedAt: now };
  const envelope = serializeEnvelope(base);
  // approvedHash records the reviewed content revision; approval metadata stays
  // outside the content hash so a reviewed revision remains stable.
  const [updated] = await db.update(audioNewsletters).set({
    status: "approved",
    customContent: JSON.stringify(envelope),
    updatedAt: new Date(),
  }).where(and(eq(audioNewsletters.id, id), eq(audioNewsletters.customContent, JSON.stringify(current.editorial)))).returning();
  if (!updated) throw new Error("NEWSLETTER_EDITORIAL_CONFLICT");
  return { newsletter: updated, editorial: envelope };
}

export async function validateNewsletterEditorialSources(record: { editorial: NewsletterEditorialEnvelope }): Promise<boolean> {
  const ids = record.editorial.items.map((item) => item.articleId);
  if (ids.length === 0 || new Set(ids).size !== ids.length) return false;
  const rows = await db.select().from(articles).where(inArray(articles.id, ids));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const now = Date.now();
  return record.editorial.items.every((item, index) => {
    const source = record.editorial.sourceRefs[index];
    const article = byId.get(item.articleId);
    if (!source || !article || article.status !== "published" || !article.publishedAt || !Number.isFinite(article.publishedAt.getTime()) || article.publishedAt.getTime() > now) return false;
    const currentSource = sourceForArticle(article);
    return source.articleId === currentSource.articleId
      && source.title === currentSource.title
      && source.url === currentSource.url
      && source.publishedAt === currentSource.publishedAt
      && source.sourceContentHash === currentSource.sourceContentHash
      && item.title === currentSource.title
      && item.url === currentSource.url;
  });
}

export function getVerifiedNewsletterEditorialHtml(editorial: NewsletterEditorialEnvelope): string {
  if (calculateNewsletterEditorialHash(editorial) !== editorial.contentHash) throw new Error("NEWSLETTER_EDITORIAL_HASH_MISMATCH");
  return renderNewsletterHtml(editorial);
}

export function getNewsletterEditorialManifest(record: { newsletter: AudioNewsletter; editorial: NewsletterEditorialEnvelope }) {
  return {
    version: record.editorial.version,
    kind: record.editorial.kind,
    newsletterId: record.newsletter.id,
    subject: record.editorial.title,
    preheader: record.editorial.preheader,
    status: record.editorial.status,
    contentHash: record.editorial.contentHash,
    approvedHash: record.editorial.approvedHash,
    approvedAt: record.editorial.approvedAt,
    sourceReferences: record.editorial.sourceRefs,
    mailerLite: { mode: "manual-html-import", campaignCreated: false, footerRequired: true },
  };
}

export function getNewsletterEditorialApproveInput(raw: unknown) {
  return newsletterEditorialApproveSchema.parse(raw);
}
