/**
 * عقد الحفظ التلقائي للمسودات: مفتاح محلي ثابت + جسم الطلب الذي يُرسل للخادم.
 * بلا React حتى تُختبر الحدود (لا حالة، لا جدولة، لا مراجعة) بمعزل.
 */
import { generateSlug } from "@/lib/slug";

export const AUTOSAVE_INTERVAL_MS = 45_000;

export const SERVER_AUTOSAVE_FORBIDDEN_KEYS = [
  "status",
  "publishType",
  "scheduledAt",
  "publishedAt",
  "reviewStatus",
  "reviewNotes",
  "submitForReview",
] as const;

export type DraftStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type DraftAutosaveFields = {
  title: string;
  content: string;
  excerpt?: string;
  slug?: string;
  categoryId?: string | null;
  articleType?: string;
  imageUrl?: string;
  subtitle?: string;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  /** الإسناد الظاهر: يُرسل عند إنشاء المسودة حتى لا يضيع «صحيفة سبق» أو المراسل المختار بعد الانتقال لصفحة التعديل. */
  reporterId?: string | null;
  opinionAuthorId?: string | null;
  expectedUpdatedAt?: string | null;
};

export function stableLocalDraftKey(userId: string, articleId?: string | null): string {
  const scope = articleId && articleId !== "new" ? articleId : "new";
  return `article-draft-v2-${userId}-${scope}`;
}

export function legacyLocalDraftKey(
  userId: string,
  articleId: string | null | undefined,
  localDraftId: string,
): string {
  const scope = articleId && articleId !== "new" ? articleId : "new";
  return `article-draft-v2-${userId}-${scope}-${localDraftId}`;
}

export function stripHtmlToPlain(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasMeaningfulDraftContent(title: string, content: string): boolean {
  return title.trim().length >= 3 && stripHtmlToPlain(content).length >= 10;
}

export function canServerAutosaveExistingDraft(input: {
  status?: string | null;
  reviewStatus?: string | null;
}): boolean {
  if (input.status !== "draft") return false;
  const review = input.reviewStatus ?? null;
  return review === null || review === "needs_changes";
}

function seoBlock(fields: DraftAutosaveFields, title: string): {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
} {
  return {
    metaTitle: (fields.metaTitle || title).slice(0, 70),
    metaDescription: (fields.metaDescription || fields.excerpt || "").slice(0, 160),
    keywords: fields.keywords || [],
  };
}

function usableImageUrl(value: string | undefined): string | null {
  const image = (value || "").trim();
  if (!image) return null;
  if (/^https?:\/\//.test(image) || image.startsWith("/")) return image;
  return null;
}

export function autosavePayloadSignature(payload: Record<string, unknown>): string {
  const { expectedUpdatedAt: _version, ...rest } = payload;
  return JSON.stringify(rest);
}

export function buildDraftAutosavePatch(fields: DraftAutosaveFields): Record<string, unknown> | null {
  if (!hasMeaningfulDraftContent(fields.title, fields.content)) return null;
  const title = fields.title.trim();
  const patch: Record<string, unknown> = {
    title,
    content: fields.content,
    seo: seoBlock(fields, title),
  };
  if (fields.excerpt != null) patch.excerpt = fields.excerpt;
  const slug = (fields.slug || "").trim();
  if (slug.length >= 3) patch.slug = slug.slice(0, 150);
  if (fields.categoryId) patch.categoryId = fields.categoryId;
  if (fields.articleType) patch.articleType = fields.articleType;
  const imageUrl = usableImageUrl(fields.imageUrl);
  if (imageUrl) patch.imageUrl = imageUrl;
  if (fields.subtitle != null && fields.articleType !== "opinion") {
    patch.subtitle = fields.subtitle.slice(0, 120);
  }
  if (fields.expectedUpdatedAt) patch.expectedUpdatedAt = fields.expectedUpdatedAt;
  for (const key of SERVER_AUTOSAVE_FORBIDDEN_KEYS) delete patch[key];
  return patch;
}

export function buildNewDraftCreateBody(
  fields: DraftAutosaveFields & { articleType?: string },
): Record<string, unknown> | null {
  if (!hasMeaningfulDraftContent(fields.title, fields.content)) return null;
  const title = fields.title.trim();
  const fromTitle = generateSlug(fields.slug?.trim() || title);
  const slug = (fromTitle.length >= 3 ? fromTitle : "draft-autosave").slice(0, 150);
  const body: Record<string, unknown> = {
    title,
    slug,
    content: fields.content,
    excerpt: fields.excerpt || "",
    articleType: fields.articleType || "news",
    status: "draft",
    publishType: "instant",
    seo: seoBlock(fields, title),
  };
  if (fields.categoryId) body.categoryId = fields.categoryId;
  const imageUrl = usableImageUrl(fields.imageUrl);
  if (imageUrl) body.imageUrl = imageUrl;
  // المحرر يعيد تحميل الحقول من الخادم بعد الإنشاء؛ بلا الإسناد يُفرَّغ المراسل
  // ويقع النشر على ترخيص المستخدم نفسه.
  if (body.articleType === "opinion") {
    if (fields.opinionAuthorId) body.opinionAuthorId = fields.opinionAuthorId;
  } else if (fields.reporterId) {
    body.reporterId = fields.reporterId;
  }
  return body;
}

/** Age no longer discards a browser draft; only an unreadable timestamp does. */
export function draftIsStillRestorable(savedAt: unknown): boolean {
  if (savedAt == null || savedAt === "") return true;
  const time = new Date(String(savedAt)).getTime();
  return Number.isFinite(time);
}

export function readMigratedLocalDraft(
  store: DraftStore,
  input: { userId: string; articleId?: string | null; legacyDraftId?: string | null },
): { key: string; raw: string | null; migrated: boolean } {
  const key = stableLocalDraftKey(input.userId, input.articleId);
  const current = store.getItem(key);
  if (current) return { key, raw: current, migrated: false };
  const legacyId = input.legacyDraftId?.trim();
  if (!legacyId) return { key, raw: null, migrated: false };
  const legacy = store.getItem(legacyLocalDraftKey(input.userId, input.articleId, legacyId));
  if (!legacy) return { key, raw: null, migrated: false };
  store.setItem(key, legacy);
  return { key, raw: legacy, migrated: true };
}
