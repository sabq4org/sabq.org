// ----------------------------------------------------------------------------
// خدمة «مسودات البوتات» — Bot Drafts (ADR-001: كل استعلامات Drizzle هنا)
//
// تُنشئ وتحدّث وتقرأ مسودات عربية لصالح بوت «نشر سبق» ومهندّس (Grok Bot).
// الإنشاء يبقى `draft`. البوت قد يعلّم الجاهزية، أو ينشر فوراً، أو يجدول.
// الإسناد يبقى حساب «صحيفة سبق» ولا يأتي من جسم الطلب.
// المصادقة: توكن Bearer لكل بوت من BOT_DRAFTS_API_TOKENS (name:token,…).
// التوثيق: docs/systems/editorial/BOT_DRAFTS_API.md
// ----------------------------------------------------------------------------

import crypto from "node:crypto";
import { and, eq, gt, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { articleEditLocks, articles, categories, enArticles, users } from "@shared/schema";
import { SABQ_NEWSPAPER_ACCOUNT_ID } from "@shared/sabqNewspaper";
import {
  BOT_DRAFT_BODY_IMAGE_LIMIT,
  BOT_DRAFT_PUBLISHABLE_STATUSES,
  BOT_DRAFT_READY_STATUS,
  BOT_DRAFT_SOURCE,
  BOT_DRAFT_STATUS,
  findDisallowedPublishedContentFields,
  isBotDraftPublishableStatus,
  type BotDraftArchiveInput,
  type BotDraftCreateInput,
  type BotDraftErrorCode,
  type BotDraftResponse,
  type BotDraftUpdateInput,
  type BotDraftVisibilityInput,
} from "@shared/botDrafts";
import { resolveUniqueArticleSlug } from "./articleSlugService";
import { logArticleEvent } from "./articleEventsService";
import { generateEnglishSlug } from "../utils/slugTransliterator";
import { sanitizeArticleHtml } from "../utils/sanitizeArticleHtml";
import { buildEditorialMetadataUpdate } from "../utils/editorialDatesSql";
import { logActivity } from "../rbac";
import { memoryCache } from "../memoryCache";

// ────────────────────────────────────────────────────────────────────
// أخطاء العقد
// ────────────────────────────────────────────────────────────────────

export class BotDraftError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: BotDraftErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "BotDraftError";
  }
}

// ────────────────────────────────────────────────────────────────────
// التوكنات — BOT_DRAFTS_API_TOKENS="nashr-sabq:<secret>,grok-bot:<secret>"
// ────────────────────────────────────────────────────────────────────

export interface BotIdentity {
  /** اسم البوت كما في متغير البيئة — يُسجَّل في sourceMetadata وسجل الأحداث. */
  name: string;
}

interface BotTokenEntry extends BotIdentity {
  tokenHash: Buffer;
}

const BOT_NAME_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const MIN_TOKEN_LENGTH = 32;

let cachedRaw: string | undefined;
let cachedEntries: BotTokenEntry[] = [];

function sha256(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

/**
 * يحلّل BOT_DRAFTS_API_TOKENS إلى قائمة (اسم، تجزئة توكن). المدخلات غير الصالحة
 * تُتجاهل مع تحذير واحد لكل تغيير في قيمة المتغير — لا تُطبع قيم التوكنات أبداً.
 */
export function parseBotDraftTokens(raw: string | undefined = process.env.BOT_DRAFTS_API_TOKENS): BotIdentity[] {
  return loadEntries(raw).map((entry) => ({ name: entry.name }));
}

function loadEntries(raw: string | undefined): BotTokenEntry[] {
  if (raw === cachedRaw) return cachedEntries;
  const entries: BotTokenEntry[] = [];
  const seen = new Set<string>();
  for (const chunk of (raw ?? "").split(",")) {
    const item = chunk.trim();
    if (!item) continue;
    const separator = item.indexOf(":");
    if (separator <= 0) {
      console.warn("[BotDrafts] ignoring BOT_DRAFTS_API_TOKENS entry without name:token form");
      continue;
    }
    const name = item.slice(0, separator).trim().toLowerCase();
    const token = item.slice(separator + 1).trim();
    if (!BOT_NAME_RE.test(name)) {
      console.warn("[BotDrafts] ignoring BOT_DRAFTS_API_TOKENS entry with invalid bot name");
      continue;
    }
    if (token.length < MIN_TOKEN_LENGTH) {
      console.warn(`[BotDrafts] ignoring token for "${name}": shorter than ${MIN_TOKEN_LENGTH} chars`);
      continue;
    }
    if (seen.has(name)) {
      console.warn(`[BotDrafts] duplicate bot name "${name}" in BOT_DRAFTS_API_TOKENS — first entry wins`);
      continue;
    }
    seen.add(name);
    entries.push({ name, tokenHash: sha256(token) });
  }
  cachedRaw = raw;
  cachedEntries = entries;
  return entries;
}

export function isBotDraftsConfigured(): boolean {
  return loadEntries(process.env.BOT_DRAFTS_API_TOKENS).length > 0;
}

/**
 * يتحقق من ترويسة Authorization: Bearer <token> ويعيد هوية البوت أو null.
 * المقارنة ثابتة الزمن على تجزئة SHA-256 (أطوال متساوية دائماً)، وتفحص كل
 * المدخلات دون خروج مبكر حتى لا يكشف التوقيت أي البوتات طابق.
 */
export function authenticateBotToken(authorizationHeader: string | undefined): BotIdentity | null {
  if (!authorizationHeader || typeof authorizationHeader !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;
  const provided = match[1].trim();
  if (provided.length < MIN_TOKEN_LENGTH) return null;
  const providedHash = sha256(provided);
  let matched: BotIdentity | null = null;
  for (const entry of loadEntries(process.env.BOT_DRAFTS_API_TOKENS)) {
    if (crypto.timingSafeEqual(providedHash, entry.tokenHash) && !matched) {
      matched = { name: entry.name };
    }
  }
  return matched;
}

// ────────────────────────────────────────────────────────────────────
// مساعدات نقية (قابلة للاختبار بلا قاعدة)
// ────────────────────────────────────────────────────────────────────

/** نفس منطق `client/src/lib/slug.ts` في لوحة التحكم — يحافظ على العربية. */
export function generateArabicSlug(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/[^؀-ۿa-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 150);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeHtmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;

/**
 * شكل صورة المتن في محرر سبق (عقدة TipTap `image` / `ResizableImage`).
 * المحاذاة وسط والعرض 100% حتى تظهر تحت المتن لا كنص، وتُقرأ في المعاينة
 * والمحرر وصفحة الخبر من `img[src]` + `data-align` + `data-width`.
 */
const BODY_IMAGE_ALT = "صورة";
const BODY_IMAGE_CLASS = "sabq-article-image sabq-image--center";
const BODY_IMAGE_STYLE = "width: 100%; float: none; margin: 1.5rem auto; max-width: 100%; height: auto;";
const MEDIA_SABQ_HOST = "media.sabq.org";

export function canonicalHttpsImageUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://") || trimmed.length > 2000 || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** وسم `<img>` مطابق لما يحفظه المحرر عند إدراج صورة في المتن. */
export function renderBotDraftBodyImage(src: string, alt = BODY_IMAGE_ALT): string {
  const safeAlt = alt.replace(/[\u0000-\u001F]/g, "").trim().slice(0, 200) || BODY_IMAGE_ALT;
  return (
    `<img src="${escapeHtml(src)}" alt="${escapeHtml(safeAlt)}"` +
    ` data-align="center" data-width="100%" class="${BODY_IMAGE_CLASS}" style="${BODY_IMAGE_STYLE}">`
  );
}

function readAttr(tag: string, name: string): string | null {
  const quoted = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  if (quoted) return decodeHtmlAttr(quoted[1] ?? quoted[2] ?? "");
  const bare = tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return bare ? decodeHtmlAttr(bare[1]) : null;
}

type ImgTagEnd = { kind: "closed"; end: number } | { kind: "open"; resumeAt: number };

function findImgTagEnd(html: string, start: number): ImgTagEnd {
  let quote: '"' | "'" | null = null;
  for (let j = start + 4; j < html.length; j++) {
    const ch = html[j];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return { kind: "closed", end: j };
    // وسم `<img` غير مغلق يبتلع المتن التالي داخل المحلّل (المعاينة وTipTap).
    if (ch === "<") return { kind: "open", resumeAt: j };
  }
  return { kind: "open", resumeAt: html.length };
}

/**
 * يمر على وسوم `<img>` فقط. الوسم غير المغلق يُحذف وتُستأنف القراءة عند الوسم
 * التالي حتى لا يختفي متن الخبر.
 */
function transformImgTags(html: string, onTag: (tag: string) => string): string {
  const lower = html.toLowerCase();
  let out = "";
  let i = 0;
  while (i < html.length) {
    const start = lower.indexOf("<img", i);
    if (start < 0) {
      out += html.slice(i);
      break;
    }
    const boundary = html[start + 4];
    if (boundary && /[a-z0-9]/i.test(boundary)) {
      out += html.slice(i, start + 4);
      i = start + 4;
      continue;
    }
    out += html.slice(i, start);
    const closed = findImgTagEnd(html, start);
    if (closed.kind === "open") {
      i = closed.resumeAt;
      continue;
    }
    out += onTag(html.slice(start, closed.end + 1));
    i = closed.end + 1;
  }
  return out;
}

function httpsSrcFromTag(tag: string): string | null {
  return canonicalHttpsImageUrl(readAttr(tag, "src") ?? "");
}

function rewriteImgTag(tag: string): string {
  const src = httpsSrcFromTag(tag);
  if (!src) return "";
  const alt = readAttr(tag, "alt")?.replace(/[\u0000-\u001F]/g, "").trim();
  return renderBotDraftBodyImage(src, alt || BODY_IMAGE_ALT);
}

/** روابط `src` لصور المتن https بالترتيب، بما فيها المكرر إن تكرر في HTML. */
export function extractBodyImageUrls(html: string | null | undefined): string[] {
  if (!html) return [];
  const urls: string[] = [];
  transformImgTags(html, (tag) => {
    const src = httpsSrcFromTag(tag);
    if (src) urls.push(src);
    return tag;
  });
  return urls;
}

/**
 * يلحق صور `imageUrls` أسفل المتن كعقد `img` مستقلة (لا ألبوم).
 * الرابط الموجود أصلاً في المتن لا يُكرَّر. HTML القائم لا يُعاد كتابته.
 */
export function appendBotDraftBodyImages(html: string, imageUrls: string[] | undefined): string {
  if (!imageUrls?.length) return html;
  const seen = new Set(extractBodyImageUrls(html));
  const blocks: string[] = [];
  for (const raw of imageUrls.slice(0, BOT_DRAFT_BODY_IMAGE_LIMIT)) {
    const src = canonicalHttpsImageUrl(raw);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    blocks.push(renderBotDraftBodyImage(src));
  }
  if (!blocks.length) return html;
  const base = html.trimEnd();
  return base ? `${base}\n${blocks.join("\n")}` : blocks.join("\n");
}

/** فقرة نصية هي رابط media.sabq.org وحده — كانت تظهر كنص خام في المعاينة. */
function standaloneMediaImageUrl(paragraph: string): string | null {
  const trimmed = paragraph.trim();
  if (/\s/.test(trimmed)) return null;
  const src = canonicalHttpsImageUrl(trimmed);
  if (!src) return null;
  try {
    if (new URL(src).hostname !== MEDIA_SABQ_HOST) return null;
  } catch {
    return null;
  }
  return src;
}

/**
 * يحوّل النص الخام إلى فقرات `<p>` (فاصل الفقرة سطر فارغ). HTML يمر بتنقية
 * المحرر ثم تُعاد كتابة كل `<img src="https://…">` مغلق إلى شكل عقدة الصورة
 * في TipTap. `imageUrls` تُلحَق أسفل المتن. `format` يفرض التفسير، وإلا
 * يُكتشف تلقائياً من وجود وسوم.
 */
export function normalizeDraftContent(
  content: string,
  format?: "html" | "text",
  imageUrls?: string[],
): string {
  const trimmed = (content ?? "").trim();
  const isHtml = format ? format === "html" : HTML_TAG_RE.test(trimmed);
  if (isHtml) {
    const rewritten = transformImgTags(sanitizeArticleHtml(trimmed), rewriteImgTag);
    return appendBotDraftBodyImages(rewritten, imageUrls);
  }
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const media = standaloneMediaImageUrl(paragraph);
      if (media) return renderBotDraftBodyImage(media);
      return `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`;
    });
  return appendBotDraftBodyImages(paragraphs.join("\n"), imageUrls);
}

function dashboardBaseUrl(): string {
  return (process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || "https://sabq.org").replace(/\/+$/, "");
}

export function botDraftEditUrl(articleId: string): string {
  return `${dashboardBaseUrl()}/dashboard/articles/${articleId}/edit`;
}

export function botDraftPreviewUrl(articleId: string): string {
  return `${dashboardBaseUrl()}/dashboard/articles/${articleId}/preview`;
}

/**
 * الرابط العام الذي يفتحه القارئ. `englishSlug` هو المسار النهائي بعد تحويل
 * الرابط العربي 301 (slugRedirect + IndexNow). إن غاب يُستخدم `slug`.
 */
export function botDraftPublicUrl(
  englishSlug: string | null | undefined,
  slug: string | null | undefined,
): string | null {
  const canonical = (englishSlug || "").trim() || (slug || "").trim();
  if (!canonical) return null;
  return `${dashboardBaseUrl()}/article/${encodeURIComponent(canonical)}`;
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type ArticleRow = typeof articles.$inferSelect;

/**
 * الحالات التي لا يُعدَّل محتواها من البوت.
 * `published` لصف `source=bot` مسموح في `PATCH /:id` ولا يمر من هنا.
 */
export function botDraftContentBlockedMessage(status: string): string {
  if (status === BOT_DRAFT_READY_STATUS) {
    return "المادة جاهزة للنشر ولا يمكن للبوت تعديلها بعد اعتماد المحرر";
  }
  return "المادة لم تعد مسودة ولا يمكن للبوت تعديلها";
}

/** انتقال الجاهزية مسموح من `draft` فقط. */
export function botDraftReadyBlockedMessage(status: string): string {
  if (status === BOT_DRAFT_READY_STATUS) {
    return "المادة جاهزة للنشر بالفعل ولا يمكن للبوت تعديلها";
  }
  return "المادة لم تعد مسودة ولا يمكن تعليمها جاهزة للنشر";
}

/** النشر والجدولة مسموحان من `draft` أو `ready_to_publish` فقط. */
export function botDraftPublishBlockedMessage(status: string): string {
  if (status === "published") return "المادة منشورة بالفعل";
  if (status === "scheduled") return "المادة مجدولة بالفعل";
  if (status === "archived") return "المادة مؤرشفة ولا يمكن نشرها أو جدولتها من البوت";
  return "المادة ليست مسودة أو جاهزة للنشر";
}

/**
 * صف ليس `source=bot` (أو غائب) يُخفى كـ 404. حالة غير قابلة للنشر → 409.
 * القفل يُفحص بعده في الخدمة.
 */
export function botDraftReleaseBlock(
  row: { source?: string | null; status: string } | null,
): { httpStatus: 404 | 409; code: "not_found" | "not_a_draft"; message: string; details?: { status: string } } | null {
  if (!row || row.source !== BOT_DRAFT_SOURCE) {
    return { httpStatus: 404, code: "not_found", message: "المسودة غير موجودة" };
  }
  if (!isBotDraftPublishableStatus(row.status)) {
    return {
      httpStatus: 409,
      code: "not_a_draft",
      message: botDraftPublishBlockedMessage(row.status),
      details: { status: row.status },
    };
  }
  return null;
}

/** نفس أعمدة أول نشر من محرر اللوحة: published + publishedAt + ترتيب الظهور. بلا إسناد. */
export interface BotDraftPublishUpdate {
  status: "published";
  publishType: "instant";
  publishedAt: Date;
  scheduledAt: null;
  updatedAt: Date;
  displayOrder: number;
}

export function buildBotDraftPublishUpdate(
  now: Date,
  existingPublishedAt: Date | string | null | undefined,
): BotDraftPublishUpdate {
  const parsed = existingPublishedAt ? new Date(existingPublishedAt) : now;
  return {
    status: "published",
    publishType: "instant",
    publishedAt: Number.isNaN(parsed.getTime()) ? now : parsed,
    scheduledAt: null,
    updatedAt: now,
    displayOrder: Math.floor(now.getTime() / 1000),
  };
}

/** يدخل صف `status=scheduled` الذي يلتقطه `publishScheduledArticles` بلا فحص صلاحيات لاحق. */
export interface BotDraftScheduleUpdate {
  status: "scheduled";
  publishType: "scheduled";
  scheduledAt: Date;
  updatedAt: Date;
}

export function buildBotDraftScheduleUpdate(publishAt: Date, now: Date): BotDraftScheduleUpdate {
  return {
    status: "scheduled",
    publishType: "scheduled",
    scheduledAt: publishAt,
    updatedAt: now,
  };
}

export type BotDraftLifecycleBlock = {
  httpStatus: 404 | 409;
  code: "not_found" | "not_published" | "not_scheduled";
  message: string;
  details?: { status: string };
};

/** أرشفة الظهور والتحكم بهما لمادة `source=bot` المنشورة فقط. غيرها 404 أو 409. */
export function botDraftPublishedBlock(
  row: { source?: string | null; status: string } | null,
): BotDraftLifecycleBlock | null {
  if (!row || row.source !== BOT_DRAFT_SOURCE) {
    return { httpStatus: 404, code: "not_found", message: "المسودة غير موجودة" };
  }
  if (row.status !== "published") {
    return {
      httpStatus: 409,
      code: "not_published",
      message:
        row.status === "scheduled"
          ? "المادة مجدولة وليست منشورة. لتغيير الموعد PATCH /schedule ولإلغاء الجدولة DELETE /schedule"
          : "هذا الإجراء يعمل على مادة منشورة فقط",
      details: { status: row.status },
    };
  }
  return null;
}

/** تغيير موعد الجدولة أو إلغاؤها لمادة `source=bot` المجدولة فقط. */
export function botDraftScheduledBlock(
  row: { source?: string | null; status: string } | null,
): BotDraftLifecycleBlock | null {
  if (!row || row.source !== BOT_DRAFT_SOURCE) {
    return { httpStatus: 404, code: "not_found", message: "المسودة غير موجودة" };
  }
  if (row.status !== "scheduled") {
    return {
      httpStatus: 409,
      code: "not_scheduled",
      message:
        row.status === "published"
          ? "المادة منشورة وليست مجدولة. الأرشفة عبر POST /archive"
          : "تعديل الموعد أو إلغاء الجدولة يعمل على مادة مجدولة فقط",
      details: { status: row.status },
    };
  }
  return null;
}

/**
 * أرشفة ناعمة مثل `POST /api/admin/articles/:id/archive`:
 * `status=archived` و`reviewStatus=null`. الصف يبقى ويمكن للمحرر استعادته لمسودة.
 */
export function buildBotDraftArchiveUpdate(
  now: Date,
  reason?: string | null,
): { status: "archived"; reviewStatus: null; updatedAt: Date; reviewNotes?: string } {
  const note = typeof reason === "string" ? reason.trim().slice(0, 1000) : "";
  return {
    status: "archived",
    reviewStatus: null,
    updatedAt: now,
    ...(note ? { reviewNotes: note } : {}),
  };
}

/** يبقي `status=scheduled` ويبدّل `scheduledAt` فقط حتى يلتقط الكرون الموعد الجديد. */
export function buildBotDraftRescheduleUpdate(
  publishAt: Date,
  now: Date,
): { status: "scheduled"; publishType: "scheduled"; scheduledAt: Date; updatedAt: Date } {
  return {
    status: "scheduled",
    publishType: "scheduled",
    scheduledAt: publishAt,
    updatedAt: now,
  };
}

/**
 * إلغاء الجدولة: تعود `draft` قابلة للتعديل. لا حذف، و`scheduledAt` يُصفَّر
 * حتى لا يلتقطها `publishScheduledArticles`.
 */
export function buildBotDraftUnscheduleUpdate(now: Date): {
  status: "draft";
  publishType: "instant";
  scheduledAt: null;
  updatedAt: Date;
} {
  return {
    status: "draft",
    publishType: "instant",
    scheduledAt: null,
    updatedAt: now,
  };
}

export type BotDraftContentEditBlock = {
  httpStatus: 404 | 409;
  code: "not_found" | "not_a_draft";
  message: string;
  details?: { status: string };
};

/**
 * من يجوز له تعديل المحتوى عبر `PATCH /:id`.
 * مسودة بوت أو خبر بوت منشور: مسموح.
 * خبر منشور ليس `source=bot`: 409 `not_a_draft` (لا 404، حتى لا يُفهم كغياب الصف).
 * أي صف آخر ليس للبوت: 404 كما في بقية العقد.
 * مؤرشف/محذوف/مجدول/جاهز لصف البوت: 409 `not_a_draft`.
 */
export function botDraftContentEditBlock(
  row: { source?: string | null; status: string } | null,
): BotDraftContentEditBlock | null {
  if (!row) {
    return { httpStatus: 404, code: "not_found", message: "المسودة غير موجودة" };
  }
  if (row.source !== BOT_DRAFT_SOURCE) {
    if (row.status === "published") {
      return {
        httpStatus: 409,
        code: "not_a_draft",
        message: "لا يمكن للبوت تعديل خبر لم ينشئه",
        details: { status: row.status },
      };
    }
    return { httpStatus: 404, code: "not_found", message: "المسودة غير موجودة" };
  }
  if (row.status === BOT_DRAFT_STATUS || row.status === "published") return null;
  return {
    httpStatus: 409,
    code: "not_a_draft",
    message: botDraftContentBlockedMessage(row.status),
    details: { status: row.status },
  };
}

/** `true` لمسودة البوت ولخبره المنشور. الجاهزية والجدولة والأرشفة وصفوف المحرر تبقى `false`. */
export function isBotOwnedContentEditable(row: { status: string; source?: string | null }): boolean {
  return row.source === BOT_DRAFT_SOURCE && (row.status === BOT_DRAFT_STATUS || row.status === "published");
}

/**
 * أعمدة تعديل خبر منشور. لا يكتب `status` ولا `publishedAt` ولا `slug` ولا `englishSlug`
 * ولا الإسناد. `editorialModifiedAt` يُدمج ذرياً في `seo_metadata` عندما يتغير حقل
 * ظاهر للقارئ — نفس مساعد `storage.updateArticle` الذي يغذّي `dateModified`.
 * `excerpt` يزامن `aiSummary` ويمسح نقاط الموجز كما يفعل حفظ المحرر.
 */
/** كتابة عمود أو تعبير SQL (دمج `editorialModifiedAt`) كما يقبلها `db.update().set()`. */
type ArticleColumnWrite = {
  [Key in keyof typeof articles.$inferInsert]?: (typeof articles.$inferInsert)[Key] | SQL;
};

export function buildPublishedBotContentPatch(
  existing: Pick<ArticleRow, "seo">,
  input: BotDraftUpdateInput,
  now: Date,
): ArticleColumnWrite {
  const patch: ArticleColumnWrite = { updatedAt: now };

  if (input.title !== undefined) patch.title = input.title;
  if (input.subtitle !== undefined) patch.subtitle = input.subtitle;
  if (input.content !== undefined) {
    patch.content = normalizeDraftContent(input.content, input.contentFormat);
  }
  if (input.excerpt !== undefined) {
    const nextSummary = typeof input.excerpt === "string" ? input.excerpt.trim() || null : null;
    patch.excerpt = nextSummary;
    patch.aiSummary = nextSummary;
    patch.aiBullets = null;
    patch.aiBulletsGeneratedAt = null;
  }
  if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
  if (input.sourceUrl !== undefined) patch.sourceUrl = input.sourceUrl;
  if (input.keywords !== undefined) {
    patch.seo = { ...(existing.seo ?? {}), keywords: input.keywords };
  }

  const editorialMetadata = buildEditorialMetadataUpdate(patch as Record<string, unknown>, now);
  if (editorialMetadata) patch.seoMetadata = editorialMetadata;

  const guarded = patch as Record<string, unknown>;
  delete guarded.status;
  delete guarded.publishedAt;
  delete guarded.slug;
  delete guarded.englishSlug;
  delete guarded.authorId;
  delete guarded.reporterId;
  delete guarded.scheduledAt;
  delete guarded.categoryId;
  return patch;
}

function publishedChangeLabels(input: BotDraftUpdateInput): string[] {
  const labels: string[] = [];
  if (input.title !== undefined) labels.push("العنوان");
  if (input.subtitle !== undefined) labels.push("العنوان الفرعي");
  if (input.content !== undefined || input.contentFormat !== undefined) labels.push("المحتوى");
  if (input.excerpt !== undefined) labels.push("الملخص");
  if (input.imageUrl !== undefined) labels.push("الصورة");
  if (input.sourceUrl !== undefined) labels.push("المصدر");
  if (input.keywords !== undefined) labels.push("الكلمات المفتاحية");
  return labels;
}

/** يكتب حقول الظهور التي أرسلها البوت فقط، بلا لمس للحالة أو الإسناد. */
export function buildBotDraftVisibilityUpdate(input: BotDraftVisibilityInput, now: Date): {
  updatedAt: Date;
  isFeatured?: boolean;
  newsType?: "breaking" | "regular";
  hideFromHomepage?: boolean;
} {
  return {
    updatedAt: now,
    ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
    ...(input.newsType !== undefined ? { newsType: input.newsType } : {}),
    ...(input.hideFromHomepage !== undefined ? { hideFromHomepage: input.hideFromHomepage } : {}),
  };
}

export function toBotDraftResponse(row: ArticleRow, categorySlug: string | null = null): BotDraftResponse {
  const meta = (row.sourceMetadata ?? {}) as NonNullable<ArticleRow["sourceMetadata"]>;
  return {
    id: row.id,
    status: row.status,
    updatable: isBotOwnedContentEditable(row),
    title: row.title,
    subtitle: row.subtitle ?? null,
    slug: row.slug,
    excerpt: row.excerpt ?? null,
    categoryId: row.categoryId ?? null,
    categorySlug,
    imageUrl: row.imageUrl ?? null,
    bodyImageUrls: extractBodyImageUrls(row.content),
    sourceUrl: row.sourceUrl ?? null,
    keywords: Array.isArray(row.seo?.keywords) ? row.seo!.keywords! : [],
    source: row.source,
    isFeatured: row.isFeatured === true,
    newsType: row.newsType || "regular",
    hideFromHomepage: row.hideFromHomepage === true,
    bot: meta.bot ?? null,
    clientReference: meta.clientReference ?? null,
    notes: meta.notes ?? null,
    editUrl: botDraftEditUrl(row.id),
    previewUrl: botDraftPreviewUrl(row.id),
    publicUrl: botDraftPublicUrl(row.englishSlug, row.slug),
    publishedAt: isoOrNull(row.publishedAt),
    scheduledAt: isoOrNull(row.scheduledAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────
// استعلامات مساعدة
// ────────────────────────────────────────────────────────────────────

/**
 * تصنيفات قابلة للإسناد لمسودة بوت.
 * الإنتاج يستخدم `visible` (GET /api/categories، الموبايل، edge SEO).
 * `active` قيمة تاريخية في الـ enum وليست منشورة للعامة، لكن نقبلها حتى لا
 * تُرفض تصنيفات قديمة إن وُجدت. `inactive` تُرفض.
 */
export function isAssignableBotCategoryStatus(status: string | null | undefined): boolean {
  return status === "visible" || status === "active";
}

async function resolveCategory(input: { categoryId?: string; categorySlug?: string }): Promise<{ id: string; slug: string } | null> {
  if (!input.categoryId && !input.categorySlug) return null;
  const condition = input.categoryId
    ? eq(categories.id, input.categoryId)
    : eq(categories.slug, input.categorySlug!);
  const [row] = await db
    .select({ id: categories.id, slug: categories.slug, status: categories.status })
    .from(categories)
    .where(condition)
    .limit(1);
  if (!row || !isAssignableBotCategoryStatus(row.status)) {
    throw new BotDraftError(422, "category_not_found", "التصنيف غير موجود أو غير نشط", {
      categoryId: input.categoryId ?? null,
      categorySlug: input.categorySlug ?? null,
    });
  }
  return { id: row.id, slug: row.slug };
}

async function categorySlugFor(categoryId: string | null): Promise<string | null> {
  if (!categoryId) return null;
  const [row] = await db.select({ slug: categories.slug }).from(categories).where(eq(categories.id, categoryId)).limit(1);
  return row?.slug ?? null;
}

/**
 * الحساب الذي تُسند إليه مسودات البوت (`authorId` إلزامي، و`reporterId` نفس الحساب).
 * الافتراضي حساب «صحيفة سبق» — نفس إسناد وكلاء البريد/الواتساب. يمكن تبديله عبر
 * BOT_DRAFTS_AUTHOR_USER_ID لحساب خدمة مخصص.
 */
export async function resolveBotAuthorId(): Promise<string> {
  const configured = (process.env.BOT_DRAFTS_AUTHOR_USER_ID || "").trim() || SABQ_NEWSPAPER_ACCOUNT_ID;
  const [row] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, configured)).limit(1);
  if (!row || row.status !== "active") {
    throw new BotDraftError(503, "author_not_configured", "حساب إسناد مسودات البوت غير موجود أو غير نشط");
  }
  return row.id;
}

/** إسناد الخادم فقط: المؤلف والمراسل = نفس حساب «صحيفة سبق». البوت لا يرسلهما. */
export function attributionForBotDraftCreate(authorUserId: string): { authorId: string; reporterId: string } {
  return { authorId: authorUserId, reporterId: authorUserId };
}

/** مراسل المسودة فارغ — يُملأ بحساب الإسناد؛ اختيار المحرر لا يُستبدل. */
export function isMissingBotDraftReporter(existingReporterId: string | null | undefined): boolean {
  return existingReporterId == null || existingReporterId === "";
}

/**
 * عند التحديث: املأ المراسل فقط إن كان فارغاً. لا تستبدل اختيار محرر.
 * يعيد المعرّف المراد كتابته، أو undefined إن بقي الاختيار القائم.
 */
export function reporterIdForBotDraftUpdate(
  existingReporterId: string | null | undefined,
  authorUserId: string,
): string | undefined {
  return isMissingBotDraftReporter(existingReporterId) ? authorUserId : undefined;
}

async function findArticleById(articleId: string): Promise<ArticleRow | null> {
  const [row] = await db.select().from(articles).where(eq(articles.id, articleId)).limit(1);
  return row ?? null;
}

async function findBotArticle(articleId: string): Promise<ArticleRow | null> {
  const [row] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.source, BOT_DRAFT_SOURCE)))
    .limit(1);
  return row ?? null;
}

async function findActiveEditLock(articleId: string): Promise<{ userName: string; expiresAt: Date } | null> {
  const [lock] = await db
    .select({ userName: articleEditLocks.userName, expiresAt: articleEditLocks.expiresAt })
    .from(articleEditLocks)
    .where(and(eq(articleEditLocks.articleId, articleId), gt(articleEditLocks.expiresAt, new Date())))
    .limit(1);
  return lock ?? null;
}

function invalidateAdminListCaches(): void {
  // نفس ما يفعله POST /api/admin/articles للمسودات: قوائم اللوحة فقط،
  // بلا purge للـ CDN لأن المسودة لا تصل للقرّاء.
  memoryCache.invalidatePattern("^articles:");
  memoryCache.invalidatePattern("^article:id:");
  memoryCache.invalidatePattern("^article:detail:");
}

export interface BotRequestContext {
  ip?: string;
  userAgent?: string;
}

// ────────────────────────────────────────────────────────────────────
// العمليات
// ────────────────────────────────────────────────────────────────────

export async function createBotDraft(
  bot: BotIdentity,
  input: BotDraftCreateInput,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  const { authorId, reporterId } = attributionForBotDraftCreate(await resolveBotAuthorId());
  const category = await resolveCategory(input);
  const slug = await resolveUniqueArticleSlug(generateArabicSlug(input.title) || `bot-${Date.now()}`);
  const now = new Date();

  const [row] = await db
    .insert(articles)
    .values({
      title: input.title,
      subtitle: input.subtitle ?? null,
      slug,
      englishSlug: generateEnglishSlug(input.title),
      content: normalizeDraftContent(input.content, input.contentFormat, input.imageUrls),
      excerpt: input.excerpt ?? null,
      imageUrl: input.imageUrl ?? null,
      categoryId: category?.id ?? null,
      authorId,
      reporterId,
      articleType: "news",
      newsType: "regular",
      publishType: "instant",
      status: BOT_DRAFT_STATUS,
      reviewStatus: null,
      scheduledAt: null,
      publishedAt: null,
      source: BOT_DRAFT_SOURCE,
      sourceUrl: input.sourceUrl ?? null,
      sourceMetadata: {
        type: "bot",
        bot: bot.name,
        clientReference: input.clientReference,
        notes: input.notes ?? undefined,
        receivedAt: now.toISOString(),
      },
      seo: input.keywords?.length ? { keywords: input.keywords } : undefined,
      displayOrder: Math.floor(now.getTime() / 1000),
    })
    .returning();

  invalidateAdminListCaches();
  await recordEvent(row.id, authorId, "created", `أنشأ البوت «${bot.name}» مسودة`, bot, input.clientReference, ctx, row);
  console.log(`[BotDrafts] created draft ${row.id} by bot=${bot.name}`);
  return toBotDraftResponse(row, category?.slug ?? null);
}

export async function getBotDraft(articleId: string): Promise<BotDraftResponse | null> {
  const row = await findBotArticle(articleId);
  if (!row) return null;
  return toBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

export async function updateBotDraft(
  bot: BotIdentity,
  articleId: string,
  input: BotDraftUpdateInput,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  const existing = await findArticleById(articleId);
  const block = botDraftContentEditBlock(existing);
  if (block || !existing) {
    throw new BotDraftError(
      block?.httpStatus ?? 404,
      block?.code ?? "not_found",
      block?.message ?? "المسودة غير موجودة",
      block?.details,
    );
  }
  if (existing.status === "published") {
    const disallowed = findDisallowedPublishedContentFields(input);
    if (disallowed.length > 0) {
      throw new BotDraftError(
        422,
        "forbidden_fields",
        "تعديل الخبر المنشور يقبل العنوان والعنوان الفرعي والموجز والمتن والصورة والكلمات والمصدر فقط. التصنيف يبقى للمسودة",
        { fields: disallowed },
      );
    }
  }
  await throwIfEditLocked(articleId);
  if (existing.status === "published") {
    return updatePublishedBotArticle(bot, existing, input, ctx);
  }

  const category = await resolveCategory(input);
  const patch: Partial<typeof articles.$inferInsert> = { updatedAt: new Date() };

  if (input.title !== undefined) patch.title = input.title;
  if (input.subtitle !== undefined) patch.subtitle = input.subtitle;
  if (input.content !== undefined) {
    patch.content = normalizeDraftContent(input.content, input.contentFormat, input.imageUrls);
  } else if (input.imageUrls !== undefined) {
    // إلحاق فقط: لا نعيد كتابة صور ضبطها المحرر (العرض/المحاذاة) داخل المسودة.
    patch.content = appendBotDraftBodyImages(existing.content ?? "", input.imageUrls);
  }
  if (input.excerpt !== undefined) patch.excerpt = input.excerpt;
  if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
  if (input.sourceUrl !== undefined) patch.sourceUrl = input.sourceUrl;
  if (category) patch.categoryId = category.id;
  if (input.keywords !== undefined) {
    patch.seo = { ...(existing.seo ?? {}), keywords: input.keywords };
  }
  if (input.clientReference !== undefined || input.notes !== undefined) {
    patch.sourceMetadata = {
      ...(existing.sourceMetadata ?? { type: "bot" }),
      type: "bot",
      ...(input.clientReference !== undefined ? { clientReference: input.clientReference } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? undefined } : {}),
    };
  }

  // الحالة والإسناد لا يأتيان من الطلب — حتى لو تسرّبا من مكان ما.
  delete (patch as Record<string, unknown>).status;
  delete (patch as Record<string, unknown>).authorId;
  delete (patch as Record<string, unknown>).reporterId;

  if (isMissingBotDraftReporter(existing.reporterId)) {
    patch.reporterId = await resolveBotAuthorId();
  }

  const [row] = await db
    .update(articles)
    .set(patch)
    .where(and(eq(articles.id, articleId), eq(articles.status, BOT_DRAFT_STATUS), eq(articles.source, BOT_DRAFT_SOURCE)))
    .returning();
  if (!row) {
    // سباق: تغيّرت الحالة بين القراءة والكتابة
    throw new BotDraftError(409, "not_a_draft", "تغيّرت حالة المادة أثناء التحديث", { status: "unknown" });
  }

  invalidateAdminListCaches();
  const reference = input.clientReference ?? existing.sourceMetadata?.clientReference;
  await recordEvent(row.id, row.authorId, "updated", `حدّث البوت «${bot.name}» المسودة`, bot, reference, ctx, row, existing);
  console.log(`[BotDrafts] updated draft ${row.id} by bot=${bot.name} fields=${Object.keys(input).join(",")}`);
  return toBotDraftResponse(row, category?.slug ?? (await categorySlugFor(row.categoryId)));
}

/**
 * تعديل محتوى خبر بوت منشور. الحالة وتاريخ النشر والرابط العام لا تتغير.
 * لا إشعار دفع ولا IndexNow ولا إعادة نشر — الإبطال فقط مثل حفظ المحرر.
 */
async function updatePublishedBotArticle(
  bot: BotIdentity,
  existing: ArticleRow,
  input: BotDraftUpdateInput,
  ctx: BotRequestContext,
): Promise<BotDraftResponse> {
  const now = new Date();
  const patch = buildPublishedBotContentPatch(existing, input, now);
  const [row] = await db
    .update(articles)
    .set(patch)
    .where(and(eq(articles.id, existing.id), eq(articles.status, "published"), eq(articles.source, BOT_DRAFT_SOURCE)))
    .returning();
  if (!row) {
    throw new BotDraftError(409, "not_a_draft", "تغيّرت حالة المادة أثناء التحديث", { status: "unknown" });
  }

  const { queueBotDraftPublishedContentEffects } = await import("./botDraftPublishEffects");
  queueBotDraftPublishedContentEffects(row, bot.name);
  await recordEvent(
    row.id,
    row.authorId,
    "updated",
    `حدّث البوت «${bot.name}» الخبر المنشور`,
    bot,
    existing.sourceMetadata?.clientReference,
    ctx,
    row,
    existing,
    undefined,
    { changedFields: publishedChangeLabels(input) },
  );
  console.log(`[BotDrafts] updated published ${row.id} by bot=${bot.name} fields=${Object.keys(input).join(",")}`);
  return toBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

/**
 * تعليم مسودة بوت «جاهزة للنشر». الانتقال الوحيد: draft → ready_to_publish.
 * لا يكتب publishedAt ولا يمر على publishGate. بعد النجاح updatable=false.
 */
export async function markBotDraftReady(
  bot: BotIdentity,
  articleId: string,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  const existing = await findBotArticle(articleId);
  if (!existing) {
    throw new BotDraftError(404, "not_found", "المسودة غير موجودة");
  }
  if (existing.status !== BOT_DRAFT_STATUS) {
    throw new BotDraftError(409, "not_a_draft", botDraftReadyBlockedMessage(existing.status), {
      status: existing.status,
    });
  }
  const lock = await findActiveEditLock(articleId);
  if (lock) {
    throw new BotDraftError(409, "locked_by_editor", "محرر يعمل على المسودة الآن — أعد المحاولة لاحقاً", {
      editor: lock.userName,
      lockExpiresAt: lock.expiresAt.toISOString(),
    });
  }

  const [row] = await db
    .update(articles)
    .set({ status: BOT_DRAFT_READY_STATUS, updatedAt: new Date() })
    .where(and(eq(articles.id, articleId), eq(articles.status, BOT_DRAFT_STATUS), eq(articles.source, BOT_DRAFT_SOURCE)))
    .returning();
  if (!row) {
    throw new BotDraftError(409, "not_a_draft", "تغيّرت حالة المادة أثناء التعليم", { status: "unknown" });
  }

  invalidateAdminListCaches();
  await recordEvent(
    row.id,
    row.authorId,
    "updated",
    `علّم البوت «${bot.name}» المسودة جاهزة للنشر`,
    bot,
    existing.sourceMetadata?.clientReference,
    ctx,
    row,
    existing,
  );
  console.log(`[BotDrafts] marked ready ${row.id} by bot=${bot.name}`);
  return toBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

function throwIfNotReleasable(row: ArticleRow | null): asserts row is ArticleRow {
  const block = botDraftReleaseBlock(row);
  if (block) {
    throw new BotDraftError(block.httpStatus, block.code, block.message, block.details);
  }
}

async function throwIfEditLocked(articleId: string): Promise<void> {
  const lock = await findActiveEditLock(articleId);
  if (!lock) return;
  throw new BotDraftError(409, "locked_by_editor", "محرر يعمل على المسودة الآن — أعد المحاولة لاحقاً", {
    editor: lock.userName,
    lockExpiresAt: lock.expiresAt.toISOString(),
  });
}

/**
 * بوابة الترخيص نفسها التي يمر بها نشر المحرر. حساب «صحيفة سبق» مؤسسي ومُعفى.
 * لا نستدعي `denyPublish`: ذلك الفحص لجلسة Passport وصلاحية `articles.publish`
 * ونافذة الوكالة. تفويض البوت هو توكن Bearer على صف `source=bot` فقط.
 */
async function assertBotDraftBylineMayPublish(row: ArticleRow): Promise<void> {
  const [{ assertMediaLicenseAllowsSubmission }, { resolveContentBylineUserId }] = await Promise.all([
    import("./mediaLicenseService"),
    import("@shared/mediaLicense"),
  ]);
  const bylineUserId = resolveContentBylineUserId({
    articleType: row.articleType,
    authorId: row.authorId,
    reporterId: row.reporterId,
  });
  const gate = await assertMediaLicenseAllowsSubmission(bylineUserId);
  if (!gate.ok) {
    throw new BotDraftError(403, "license_required", gate.message, { licenseCode: gate.code });
  }
}

function releasableWhere(articleId: string) {
  return and(
    eq(articles.id, articleId),
    eq(articles.source, BOT_DRAFT_SOURCE),
    inArray(articles.status, [...BOT_DRAFT_PUBLISHABLE_STATUSES]),
  );
}

/**
 * نشر فوري بنفس أعمدة زر «نشر» في اللوحة، ثم إبطال الكاش وIndexNow والتنبيهات.
 * لا يكتب authorId ولا reporterId.
 */
export async function publishBotDraft(
  bot: BotIdentity,
  articleId: string,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  const existing = await findBotArticle(articleId);
  throwIfNotReleasable(existing);
  await throwIfEditLocked(articleId);
  await assertBotDraftBylineMayPublish(existing);

  const now = new Date();
  const patch: BotDraftPublishUpdate & { englishSlug?: string } = buildBotDraftPublishUpdate(now, existing.publishedAt);
  if (!existing.englishSlug) {
    patch.englishSlug = generateEnglishSlug(existing.title);
  }

  const [row] = await db.update(articles).set(patch).where(releasableWhere(articleId)).returning();
  if (!row) {
    throw new BotDraftError(409, "not_a_draft", "تغيّرت حالة المادة أثناء النشر", { status: "unknown" });
  }

  invalidateAdminListCaches();
  const { queueBotDraftPublishEffects } = await import("./botDraftPublishEffects");
  queueBotDraftPublishEffects(row, bot.name);
  await recordEvent(
    row.id,
    row.authorId,
    "published",
    `نشر البوت «${bot.name}» الخبر`,
    bot,
    existing.sourceMetadata?.clientReference,
    ctx,
    row,
    existing,
  );
  console.log(`[BotDrafts] published ${row.id} by bot=${bot.name}`);
  return toBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

/**
 * جدولة: `status=scheduled` و`scheduledAt` حتى يلتقطها ناشر المواد المجدولة
 * (`publishScheduledArticles`) كما لو جدولها محرر. لا نشر فوري.
 */
export async function scheduleBotDraft(
  bot: BotIdentity,
  articleId: string,
  publishAt: Date,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  if (!(publishAt instanceof Date) || Number.isNaN(publishAt.getTime()) || publishAt.getTime() <= Date.now()) {
    throw new BotDraftError(
      400,
      "validation_error",
      "موعد النشر في الماضي أو اللحظة الحالية. أرسل وقت الرياض بإزاحة +03:00 أو ما يعادله UTC.",
      { publishAt: publishAt instanceof Date && !Number.isNaN(publishAt.getTime()) ? publishAt.toISOString() : null },
    );
  }

  const existing = await findBotArticle(articleId);
  throwIfNotReleasable(existing);
  await throwIfEditLocked(articleId);
  await assertBotDraftBylineMayPublish(existing);

  const now = new Date();
  const patch: BotDraftScheduleUpdate & { englishSlug?: string } = buildBotDraftScheduleUpdate(publishAt, now);
  if (!existing.englishSlug) {
    patch.englishSlug = generateEnglishSlug(existing.title);
  }

  const [row] = await db.update(articles).set(patch).where(releasableWhere(articleId)).returning();
  if (!row) {
    throw new BotDraftError(409, "not_a_draft", "تغيّرت حالة المادة أثناء الجدولة", { status: "unknown" });
  }

  invalidateAdminListCaches();
  const { queueBotDraftScheduleEffects } = await import("./botDraftPublishEffects");
  queueBotDraftScheduleEffects(row, bot.name);
  await recordEvent(
    row.id,
    row.authorId,
    "updated",
    `جدول البوت «${bot.name}» النشر`,
    bot,
    existing.sourceMetadata?.clientReference,
    ctx,
    row,
    existing,
  );
  console.log(`[BotDrafts] scheduled ${row.id} by bot=${bot.name} at=${row.scheduledAt?.toISOString?.() ?? ""}`);
  return toBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

function throwLifecycleBlock(block: BotDraftLifecycleBlock | null): void {
  if (!block) return;
  throw new BotDraftError(block.httpStatus, block.code, block.message, block.details);
}

/**
 * أرشفة مادة بوت منشورة. نفس أعمدة أرشفة اللوحة: تختفي من الرئيسية والخلاصات
 * وخرائط الموقع لأن كلها تشترط `status=published`، والصف يبقى قابلاً للاستعادة.
 */
export async function archiveBotDraft(
  bot: BotIdentity,
  articleId: string,
  input: BotDraftArchiveInput = {},
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  const existing = await findBotArticle(articleId);
  throwLifecycleBlock(botDraftPublishedBlock(existing));
  await throwIfEditLocked(articleId);

  const now = new Date();
  const patch = buildBotDraftArchiveUpdate(now, input.reason);
  const [row] = await db
    .update(articles)
    .set(patch)
    .where(and(eq(articles.id, articleId), eq(articles.source, BOT_DRAFT_SOURCE), eq(articles.status, "published")))
    .returning();
  if (!row) {
    throw new BotDraftError(409, "not_published", "تغيّرت حالة المادة أثناء الأرشفة", { status: "unknown" });
  }

  invalidateAdminListCaches();
  const { queueBotDraftArchiveEffects } = await import("./botDraftPublishEffects");
  queueBotDraftArchiveEffects(row, bot.name, row.reviewNotes ?? null);
  await recordEvent(
    row.id,
    row.authorId,
    "deleted",
    `أرشف البوت «${bot.name}» الخبر`,
    bot,
    existing!.sourceMetadata?.clientReference,
    ctx,
    row,
    existing!,
    "archived",
  );
  console.log(`[BotDrafts] archived ${row.id} by bot=${bot.name}`);
  return toBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

/**
 * تغيير `scheduledAt` لمادة مجدولة. نفس تحقق الوقت المستقبلي. لا يعيد إرسال
 * تنبيه الجدولة لأن الحالة لم تنتقل إلى `scheduled` من جديد.
 */
export async function rescheduleBotDraft(
  bot: BotIdentity,
  articleId: string,
  publishAt: Date,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  if (!(publishAt instanceof Date) || Number.isNaN(publishAt.getTime()) || publishAt.getTime() <= Date.now()) {
    throw new BotDraftError(
      400,
      "validation_error",
      "موعد النشر في الماضي أو اللحظة الحالية. أرسل وقت الرياض بإزاحة +03:00 أو ما يعادله UTC.",
      { publishAt: publishAt instanceof Date && !Number.isNaN(publishAt.getTime()) ? publishAt.toISOString() : null },
    );
  }

  const existing = await findBotArticle(articleId);
  throwLifecycleBlock(botDraftScheduledBlock(existing));
  await throwIfEditLocked(articleId);

  const now = new Date();
  const patch = buildBotDraftRescheduleUpdate(publishAt, now);
  const [row] = await db
    .update(articles)
    .set(patch)
    .where(and(eq(articles.id, articleId), eq(articles.source, BOT_DRAFT_SOURCE), eq(articles.status, "scheduled")))
    .returning();
  if (!row) {
    throw new BotDraftError(409, "not_scheduled", "تغيّرت حالة المادة أثناء تغيير الموعد", { status: "unknown" });
  }

  invalidateAdminListCaches();
  const { queueBotDraftRescheduleEffects } = await import("./botDraftPublishEffects");
  queueBotDraftRescheduleEffects(row, bot.name);
  await recordEvent(
    row.id,
    row.authorId,
    "updated",
    `غيّر البوت «${bot.name}» موعد النشر`,
    bot,
    existing!.sourceMetadata?.clientReference,
    ctx,
    row,
    existing!,
  );
  console.log(`[BotDrafts] rescheduled ${row.id} by bot=${bot.name} at=${row.scheduledAt?.toISOString?.() ?? ""}`);
  return toBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

/**
 * إلغاء الجدولة: `draft` من جديد، بلا حذف. الكرون لا ينشرها لأن الحالة لم تعد `scheduled`.
 */
export async function unscheduleBotDraft(
  bot: BotIdentity,
  articleId: string,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  const existing = await findBotArticle(articleId);
  throwLifecycleBlock(botDraftScheduledBlock(existing));
  await throwIfEditLocked(articleId);

  const now = new Date();
  const patch = buildBotDraftUnscheduleUpdate(now);
  const [row] = await db
    .update(articles)
    .set(patch)
    .where(and(eq(articles.id, articleId), eq(articles.source, BOT_DRAFT_SOURCE), eq(articles.status, "scheduled")))
    .returning();
  if (!row) {
    throw new BotDraftError(409, "not_scheduled", "تغيّرت حالة المادة أثناء إلغاء الجدولة", { status: "unknown" });
  }

  invalidateAdminListCaches();
  const { queueBotDraftUnscheduleEffects } = await import("./botDraftPublishEffects");
  queueBotDraftUnscheduleEffects(row, bot.name);
  await recordEvent(
    row.id,
    row.authorId,
    "unpublished",
    `ألغى البوت «${bot.name}» الجدولة وأعاد الخبر مسودة`,
    bot,
    existing!.sourceMetadata?.clientReference,
    ctx,
    row,
    existing!,
  );
  console.log(`[BotDrafts] unscheduled ${row.id} by bot=${bot.name}`);
  return toBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

/**
 * مميز / عاجل / إخفاء الرئيسية لمادة منشورة. الأعمدة نفسها التي يكتبها المحرر.
 * تعليم العاجل هنا لا يرسل إشعار القرّاء: زر اللوحة `toggle-breaking` لا يرسله أيضاً.
 */
export async function updateBotDraftVisibility(
  bot: BotIdentity,
  articleId: string,
  input: BotDraftVisibilityInput,
  ctx: BotRequestContext = {},
): Promise<BotDraftResponse> {
  const existing = await findBotArticle(articleId);
  throwLifecycleBlock(botDraftPublishedBlock(existing));
  await throwIfEditLocked(articleId);

  const now = new Date();
  const patch = buildBotDraftVisibilityUpdate(input, now);
  const [row] = await db
    .update(articles)
    .set(patch)
    .where(and(eq(articles.id, articleId), eq(articles.source, BOT_DRAFT_SOURCE), eq(articles.status, "published")))
    .returning();
  if (!row) {
    throw new BotDraftError(409, "not_published", "تغيّرت حالة المادة أثناء تحديث الظهور", { status: "unknown" });
  }

  if (input.newsType !== undefined && input.newsType !== existing!.newsType) {
    await syncEnglishNewsType(row.id, input.newsType);
  }

  invalidateAdminListCaches();
  const { queueBotDraftVisibilityEffects } = await import("./botDraftPublishEffects");
  queueBotDraftVisibilityEffects(row, existing!.newsType, bot.name);
  const changed = Object.keys(input).join(",");
  await recordEvent(
    row.id,
    row.authorId,
    "updated",
    `حدّث البوت «${bot.name}» ظهور الخبر (${changed})`,
    bot,
    existing!.sourceMetadata?.clientReference,
    ctx,
    row,
    existing!,
  );
  console.log(`[BotDrafts] visibility ${row.id} by bot=${bot.name} fields=${changed}`);
  return toBotDraftResponse(row, await categorySlugFor(row.categoryId));
}

/** نفس مزامنة زر العاجل في اللوحة: ترجمة EN المرتبطة عبر seoMetadata.sourceArticleId. */
async function syncEnglishNewsType(articleId: string, newsType: string): Promise<void> {
  try {
    await db
      .update(enArticles)
      .set({ newsType, updatedAt: new Date() })
      .where(sql`${enArticles.seoMetadata}->>'sourceArticleId' = ${articleId}`);
  } catch (error) {
    console.warn(`[BotDrafts] EN newsType sync failed for ${articleId}:`, error);
  }
}

async function recordEvent(
  articleId: string,
  actorId: string,
  action: "created" | "updated" | "published" | "deleted" | "unpublished",
  summary: string,
  bot: BotIdentity,
  clientReference: string | undefined,
  ctx: BotRequestContext,
  newValue: ArticleRow,
  oldValue?: ArticleRow,
  activityAction?: string,
  extraMetadata?: Record<string, unknown>,
): Promise<void> {
  const metadata = {
    bot: bot.name,
    clientReference: clientReference ?? null,
    channel: "bot-drafts-api",
    ...extraMetadata,
  };
  await Promise.all([
    logArticleEvent({ articleId, eventType: action, actorId, summary, metadata }).catch((error) =>
      console.error("[BotDrafts] article event log failed:", error),
    ),
    logActivity({
      userId: actorId,
      action: activityAction ?? action,
      entityType: "article",
      entityId: articleId,
      oldValue: oldValue ? { title: oldValue.title, status: oldValue.status } : undefined,
      newValue: { title: newValue.title, status: newValue.status },
      metadata: { ...metadata, ip: ctx.ip, userAgent: ctx.userAgent },
    }).catch((error) => console.error("[BotDrafts] activity log failed:", error)),
  ]);
}
