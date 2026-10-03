// قرارات نقية لبوت النشر على X: التوكن، منع التكرار، الطول، وأهلية الخبر.
// لا قاعدة هنا — العمليات في botSocialService.ts وتعيد استخدام خدمة النشر.
import crypto from "crypto";
import {
  X_MAX_PREMIUM_WEIGHTED_LENGTH,
  X_MAX_WEIGHTED_LENGTH,
  composeXPostText,
  validateXPostText,
} from "@shared/socialPostText";
import { BOT_SOCIAL_MEASUREMENT, type BotSocialImageSource, type BotSocialTextSource } from "@shared/botSocial";

export const BOT_SOCIAL_DEFAULT_NAME = "nashr-x";
const BOT_NAME_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const MIN_TOKEN_LENGTH = 32;

export interface BotSocialIdentity {
  name: string;
}

interface BotTokenEntry extends BotSocialIdentity {
  tokenHash: Buffer;
}

export class BotSocialError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "BotSocialError";
  }
}

export type BotSocialReplay =
  | { action: "reuse" }
  | { action: "replay" }
  | { action: "reject"; httpStatus: number; code: string; message: string };

let cachedMaterial: string | undefined;
let cachedEntries: BotTokenEntry[] = [];

function sha256(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function tokenMaterial(): string {
  return [
    process.env.BOT_SOCIAL_API_TOKENS ?? "",
    process.env.SABQ_BOT_SOCIAL_NAME ?? "",
    process.env.SABQ_BOT_SOCIAL_TOKEN ?? "",
  ].join("\n");
}

function pushEntry(entries: BotTokenEntry[], seen: Set<string>, name: string, token: string, source: string): void {
  if (!BOT_NAME_RE.test(name)) {
    console.warn(`[BotSocial] ignoring ${source} entry with invalid bot name`);
    return;
  }
  if (token.length < MIN_TOKEN_LENGTH) {
    console.warn(`[BotSocial] ignoring token for "${name}": shorter than ${MIN_TOKEN_LENGTH} chars`);
    return;
  }
  if (seen.has(name)) {
    console.warn(`[BotSocial] duplicate bot name "${name}" — first entry wins`);
    return;
  }
  seen.add(name);
  entries.push({ name, tokenHash: sha256(token) });
}

/** يحلّل توكنات البوت. لا يقرأ BOT_DRAFTS_API_TOKENS ولا يطبع الأسرار. */
export function loadBotSocialTokens(
  namedRaw: string | undefined = process.env.BOT_SOCIAL_API_TOKENS,
  singleToken: string | undefined = process.env.SABQ_BOT_SOCIAL_TOKEN,
  singleName: string | undefined = process.env.SABQ_BOT_SOCIAL_NAME,
): BotSocialIdentity[] {
  const material = [namedRaw ?? "", singleName ?? "", singleToken ?? ""].join("\n");
  if (material === cachedMaterial) return cachedEntries.map((entry) => ({ name: entry.name }));

  const entries: BotTokenEntry[] = [];
  const seen = new Set<string>();
  for (const chunk of (namedRaw ?? "").split(",")) {
    const item = chunk.trim();
    if (!item) continue;
    const separator = item.indexOf(":");
    if (separator <= 0) {
      console.warn("[BotSocial] ignoring BOT_SOCIAL_API_TOKENS entry without name:token form");
      continue;
    }
    pushEntry(
      entries,
      seen,
      item.slice(0, separator).trim().toLowerCase(),
      item.slice(separator + 1).trim(),
      "BOT_SOCIAL_API_TOKENS",
    );
  }
  const single = (singleToken ?? "").trim();
  if (single) {
    const name = (singleName ?? BOT_SOCIAL_DEFAULT_NAME).trim().toLowerCase() || BOT_SOCIAL_DEFAULT_NAME;
    pushEntry(entries, seen, name, single, "SABQ_BOT_SOCIAL_TOKEN");
  }
  cachedMaterial = material;
  cachedEntries = entries;
  return entries.map((entry) => ({ name: entry.name }));
}

export function isBotSocialConfigured(): boolean {
  return loadBotSocialTokens().length > 0;
}

const ARTICLE_URL_HOSTS = new Set(["sabq.org", "www.sabq.org"]);

export interface ParsedBotSocialArticleUrl {
  /** مقطع المسار بعد فك الترميز، كما يبحث عنه GET /api/articles/:slug. */
  slug: string;
  lang: "ar";
}

/**
 * يطبّع رابط خبر عربي عام. المضيف sabq.org أو www.sabq.org فقط.
 * يُسقط الاستعلام والهاش والشرطة المائلة الأخيرة، ويفك ترميز المسار مرة واحدة
 * (نفس safeDecode في slugRedirect / edge slug-redirect).
 * /en/article و/ur/article ليسا جدولاً عربياً — 422 unsupported_language.
 */
export function parseBotSocialArticleUrl(raw: string): ParsedBotSocialArticleUrl {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BotSocialError(400, "validation_error", "articleUrl ليس رابطاً صالحاً");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BotSocialError(400, "validation_error", "articleUrl يجب أن يكون رابط http أو https");
  }
  if (!ARTICLE_URL_HOSTS.has(url.hostname.toLowerCase())) {
    throw new BotSocialError(400, "validation_error", "رابط الخبر يجب أن يكون على sabq.org أو www.sabq.org");
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";
  const localized = path.match(/^\/(en|ur)\/article\/([^/]+)$/i);
  if (localized) {
    throw new BotSocialError(
      422,
      "unsupported_language",
      "واجهة البوت تقبل أخبار سبق العربية فقط (/article/)، لا الإنجليزية ولا الأردية",
      { lang: localized[1].toLowerCase() },
    );
  }

  const match = path.match(/^\/article\/([^/]+)$/);
  if (!match) {
    throw new BotSocialError(400, "validation_error", "articleUrl يجب أن يكون رابط خبر عربي /article/...");
  }

  let slug = match[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    throw new BotSocialError(400, "validation_error", "ترميز رابط الخبر غير صالح");
  }
  slug = slug.trim();
  if (!slug) {
    throw new BotSocialError(400, "validation_error", "articleUrl يجب أن يكون رابط خبر عربي /article/...");
  }
  return { slug, lang: "ar" };
}

/**
 * Authorization: Bearer. المقارنة ثابتة الزمن على SHA-256.
 * توكن مسودات البوت لا يُقبل هنا حتى لو طابق شكلاً — المصدر متغير بيئة آخر.
 */
export function authenticateBotSocialToken(authorizationHeader: string | undefined): BotSocialIdentity | null {
  if (!authorizationHeader || typeof authorizationHeader !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;
  const provided = match[1].trim();
  if (provided.length < MIN_TOKEN_LENGTH) return null;
  const providedHash = sha256(provided);
  loadBotSocialTokens();
  let matched: BotSocialIdentity | null = null;
  for (const entry of cachedEntries) {
    if (crypto.timingSafeEqual(providedHash, entry.tokenHash) && !matched) {
      matched = { name: entry.name };
    }
  }
  return matched;
}

export function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** خبر عربي منشور فعلاً فقط. المسودة والمجدول والأرشيف والمؤجل مرفوضة. */
export function assertArticleTweetable(
  status: string,
  publishedAt: Date | null,
  now = Date.now(),
): void {
  if (status !== "published") {
    throw new BotSocialError(422, "article_not_published", "لا يُغرَّد إلا خبر حالته published");
  }
  if (publishedAt && publishedAt.getTime() > now) {
    throw new BotSocialError(422, "article_not_published", "الخبر لم يحن وقت نشره بعد");
  }
}

export function decidePublishAction(status: string): BotSocialReplay {
  switch (status) {
    case "published":
      return { action: "replay" };
    case "processing":
      return {
        action: "reject",
        httpStatus: 409,
        code: "in_progress",
        message: "المنشور قيد النشر — اقرأ الحالة ولا تعد الإرسال حتى تستقر",
      };
    case "canceled":
      return {
        action: "reject",
        httpStatus: 409,
        code: "canceled",
        message: "أُلغي هذا المرجع — استخدم clientReference جديداً لنشر تغريدة أخرى",
      };
    case "draft":
    case "failed":
    case "scheduled":
      return { action: "reuse" };
    default:
      return { action: "reject", httpStatus: 409, code: "conflict", message: `حالة غير متوقعة: ${status}` };
  }
}

export function decideScheduleAction(status: string): BotSocialReplay {
  switch (status) {
    case "published":
      return { action: "replay" };
    case "processing":
      return {
        action: "reject",
        httpStatus: 409,
        code: "in_progress",
        message: "المنشور قيد النشر — لا يمكن جدولة نفس المرجع الآن",
      };
    case "canceled":
      return {
        action: "reject",
        httpStatus: 409,
        code: "canceled",
        message: "أُلغي هذا المرجع — استخدم clientReference جديداً",
      };
    case "draft":
    case "failed":
    case "scheduled":
      return { action: "reuse" };
    default:
      return { action: "reject", httpStatus: 409, code: "conflict", message: `حالة غير متوقعة: ${status}` };
  }
}

export function decideCancelAction(status: string): BotSocialReplay {
  switch (status) {
    case "canceled":
      return { action: "replay" };
    case "scheduled":
      return { action: "reuse" };
    case "processing":
      return {
        action: "reject",
        httpStatus: 409,
        code: "in_progress",
        message: "المنشور قيد النشر — لا يمكن إلغاء الجدولة الآن",
      };
    default:
      return {
        action: "reject",
        httpStatus: 409,
        code: "not_cancelable",
        message: "الإلغاء متاح للمنشور المجدول فقط",
      };
  }
}

export function formatSuggestedText(post: string, hashtags: string[]): string {
  const tags = hashtags
    .map((tag) => `#${tag.replace(/^#/, "").trim().replace(/\s+/g, "_")}`)
    .filter((tag) => tag.length > 1);
  return [post.trim(), tags.join(" ")].filter(Boolean).join("\n");
}

export interface BotSocialComposeInput {
  article: { title: string; url: string; imageUrl: string | null };
  body: {
    text?: string;
    textSource?: BotSocialTextSource;
    includeLink?: boolean;
    imageSource?: BotSocialImageSource;
    imageUrl?: string | null;
  };
  existing?: {
    text: string;
    textSource: string;
    linkUrl: string | null;
    imageSource: string;
    imageUrl: string | null;
  } | null;
}

export interface BotSocialCompose {
  text: string;
  textSource: BotSocialTextSource;
  includeLink: boolean;
  linkUrl: string | null;
  imageSource: BotSocialImageSource;
  imageUrl: string | null;
  composedText: string;
  weightedLength: number;
  remaining: number;
  valid: boolean;
  overStandard: boolean;
  empty: boolean;
}

function asTextSource(value: string | undefined, fallback: BotSocialTextSource): BotSocialTextSource {
  if (value === "title" || value === "title_link" || value === "custom" || value === "ai") return value;
  return fallback;
}

function asImageSource(value: string | undefined, fallback: BotSocialImageSource): BotSocialImageSource {
  if (value === "article" || value === "upload" || value === "library" || value === "none") return value;
  return fallback;
}

/** يركّب النص والرابط والصورة ويفرض حد الطول قبل أي كتابة. */
export function resolveBotSocialCompose(input: BotSocialComposeInput): BotSocialCompose {
  const existing = input.existing ?? null;
  const textSource = asTextSource(input.body.textSource, existing ? asTextSource(existing.textSource, "custom") : "custom");
  const provided = (input.body.text ?? "").trim();
  let text = provided;
  if (!text && existing && input.body.text == null) text = existing.text;
  if (!text && (textSource === "title" || textSource === "title_link")) text = input.article.title.trim();

  const includeLink = input.body.includeLink ?? (existing ? Boolean(existing.linkUrl) : textSource !== "title");
  const linkUrl = includeLink ? input.article.url : null;

  const imageSource = asImageSource(
    input.body.imageSource,
    existing ? asImageSource(existing.imageSource, "article") : "article",
  );
  let imageUrl: string | null;
  if (imageSource === "none") {
    imageUrl = null;
  } else if (imageSource === "article") {
    imageUrl = input.article.imageUrl;
  } else if (input.body.imageUrl != null) {
    imageUrl = input.body.imageUrl.trim() || null;
  } else if (existing && input.body.imageSource == null) {
    imageUrl = existing.imageUrl;
  } else {
    imageUrl = null;
  }
  const resolvedImageSource: BotSocialImageSource = imageUrl ? imageSource : "none";

  if (!text.trim()) {
    throw new BotSocialError(400, "validation_error", "نص المنشور فارغ");
  }
  const validation = validateXPostText(text, linkUrl);
  if (validation.empty) {
    throw new BotSocialError(400, "validation_error", "نص المنشور فارغ");
  }
  if (!validation.valid) {
    throw new BotSocialError(
      400,
      "validation_error",
      `النص يتجاوز الحد الأقصى لمنصة X (${validation.weightedLength}/${X_MAX_PREMIUM_WEIGHTED_LENGTH})`,
    );
  }
  if ((imageSource === "upload" || imageSource === "library") && !imageUrl) {
    throw new BotSocialError(400, "validation_error", "مصدر الصورة محدد بلا رابط صورة");
  }

  return {
    text: text.trim(),
    textSource,
    includeLink,
    linkUrl,
    imageSource: resolvedImageSource,
    imageUrl,
    composedText: composeXPostText(text, linkUrl),
    weightedLength: validation.weightedLength,
    remaining: validation.remaining,
    valid: validation.valid,
    overStandard: validation.overStandard,
    empty: validation.empty,
  };
}

export function previewLimits() {
  return {
    maxWeightedLength: X_MAX_WEIGHTED_LENGTH,
    maxPremiumWeightedLength: X_MAX_PREMIUM_WEIGHTED_LENGTH,
  };
}

/** السقف الصلب لمنشور بلا خبر. 280 يبقى إشارة الطي فقط. */
export const ORIGINAL_X_MAX_WEIGHTED_LENGTH = 2000;
/** معرّف المعاينة داخل utm_content. النشر يستبدله بـ social_posts.id. */
export const ORIGINAL_PREVIEW_CONTENT_ID = "preview";

const CAMPAIGN_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/;
const CONTENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const SITE_HOSTS = new Set(["sabq.org", "www.sabq.org"]);

export function isOriginalBotSocial<T extends { kind?: string }>(
  input: T,
): input is Extract<T, { kind: "original" }> {
  return input.kind === "original";
}

export function originalPreviewLimits() {
  return {
    maxWeightedLength: X_MAX_WEIGHTED_LENGTH,
    hardMaxWeightedLength: ORIGINAL_X_MAX_WEIGHTED_LENGTH,
  };
}

export function normalizeOriginalCampaign(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return BOT_SOCIAL_MEASUREMENT.campaignValue;
  if (!CAMPAIGN_RE.test(value)) {
    throw new BotSocialError(
      400,
      "validation_error",
      "campaign يقبل حروفاً إنجليزية وأرقاماً و _ و - فقط، والخادم يضعه في utm_campaign",
    );
  }
  return value;
}

/**
 * يضع وسوم القياس الأربعة على رابط سبق. أي utm قادم من البوت يُستبدل.
 * يُحفظ معامل page الرقمي فقط إلى جانب الوسوم، وتُسقط بقية الاستعلام
 * حتى لا تدخل بيانات شخصية إلى الرابط.
 */
export function applySabqXMeasurementTags(rawUrl: string, internalId: string, campaign?: string): string {
  if (!CONTENT_ID_RE.test(internalId)) {
    throw new BotSocialError(400, "validation_error", "معرّف القياس الداخلي غير صالح");
  }
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new BotSocialError(400, "validation_error", "linkUrl ليس رابطاً صالحاً");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BotSocialError(400, "validation_error", "linkUrl يجب أن يكون رابط http أو https");
  }
  if (url.username || url.password) {
    throw new BotSocialError(400, "validation_error", "linkUrl لا يقبل بيانات دخول داخل الرابط");
  }
  if (!SITE_HOSTS.has(url.hostname.toLowerCase())) {
    throw new BotSocialError(400, "validation_error", "رابط المنشور يجب أن يكون على sabq.org أو www.sabq.org");
  }
  const page = url.searchParams.get("page");
  const hash = url.hash;
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.username = "";
  url.password = "";
  url.search = "";
  if (page && /^[1-9]\d{0,4}$/.test(page)) url.searchParams.set("page", page);
  url.searchParams.set(BOT_SOCIAL_MEASUREMENT.sourceKey, BOT_SOCIAL_MEASUREMENT.sourceValue);
  url.searchParams.set(BOT_SOCIAL_MEASUREMENT.mediumKey, BOT_SOCIAL_MEASUREMENT.mediumValue);
  url.searchParams.set(BOT_SOCIAL_MEASUREMENT.campaignKey, normalizeOriginalCampaign(campaign));
  url.searchParams.set(BOT_SOCIAL_MEASUREMENT.contentKey, internalId);
  url.hash = hash;
  return url.toString();
}

export interface OriginalPostBody {
  text?: string;
  textSource?: "custom" | "ai";
  linkUrl?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[];
  campaign?: string;
}

export interface OriginalPostExisting {
  text: string;
  textSource: string;
  linkUrl: string | null;
  imageUrls: string[];
}

export interface OriginalPostCompose {
  text: string;
  textSource: "custom" | "ai";
  includeLink: boolean;
  /** الرابط بعد وسم القياس، أو null. */
  linkUrl: string | null;
  /** الرابط كما أُرسل قبل استبدال المعرّف الداخلي، للوزن فقط عند غياب الصف. */
  rawLinkUrl: string | null;
  campaign: string;
  imageSource: "upload" | "none";
  imageUrl: string | null;
  imageUrls: string[];
  composedText: string;
  weightedLength: number;
  remaining: number;
  valid: boolean;
  overStandard: boolean;
  empty: boolean;
}

function originalTextSource(value: string | undefined, fallback: "custom" | "ai"): "custom" | "ai" {
  if (value === "ai" || value === "custom") return value;
  return fallback;
}

/** صورة واحدة عبر imageUrl، أو حتى 4 عبر imageUrls. لا يجتمع الحقلان. */
export function resolveOriginalImageUrls(
  body: Pick<OriginalPostBody, "imageUrl" | "imageUrls">,
  existing: string[] | null,
): string[] {
  const hasList = body.imageUrls !== undefined;
  const hasSingle = body.imageUrl !== undefined;
  if (hasList && hasSingle) {
    throw new BotSocialError(400, "validation_error", "أرسل imageUrl أو imageUrls، لا الاثنين معاً");
  }
  let urls: string[];
  if (hasList) urls = body.imageUrls ?? [];
  else if (body.imageUrl === null) urls = [];
  else if (typeof body.imageUrl === "string" && body.imageUrl.trim()) urls = [body.imageUrl.trim()];
  else if (existing) urls = existing;
  else urls = [];

  const cleaned = urls.map((url) => url.trim()).filter(Boolean);
  if (cleaned.length > 4) {
    throw new BotSocialError(400, "validation_error", "الحد الأقصى 4 صور للمنشور");
  }
  return cleaned;
}

function assertOriginalLength(text: string, linkUrl: string | null) {
  const validation = validateXPostText(text, linkUrl);
  if (validation.empty || !text.trim()) {
    throw new BotSocialError(400, "validation_error", "نص المنشور فارغ");
  }
  if (validation.weightedLength > ORIGINAL_X_MAX_WEIGHTED_LENGTH) {
    throw new BotSocialError(
      400,
      "validation_error",
      `النص يتجاوز حد منشور original (${validation.weightedLength}/${ORIGINAL_X_MAX_WEIGHTED_LENGTH})`,
    );
  }
  return {
    ...validation,
    valid: true,
    overStandard: validation.weightedLength > X_MAX_WEIGHTED_LENGTH,
    remaining: X_MAX_WEIGHTED_LENGTH - validation.weightedLength,
  };
}

/**
 * يركّب منشوراً بلا خبر. contentId يُكتب في utm_content.
 * المعاينة تستخدم ORIGINAL_PREVIEW_CONTENT_ID، والنشر يستخدم social_posts.id.
 */
export function resolveOriginalPost(input: {
  body: OriginalPostBody;
  existing?: OriginalPostExisting | null;
  contentId: string;
}): OriginalPostCompose {
  const existing = input.existing ?? null;
  const textSource = originalTextSource(
    input.body.textSource,
    existing?.textSource === "ai" ? "ai" : "custom",
  );
  const provided = (input.body.text ?? "").trim();
  let text = provided;
  if (!text && existing && input.body.text == null) text = existing.text;
  const imageUrls = resolveOriginalImageUrls(input.body, existing ? existing.imageUrls : null);
  const campaign = input.body.campaign !== undefined
    ? normalizeOriginalCampaign(input.body.campaign)
    : existing?.linkUrl
      ? campaignFromStoredLink(existing.linkUrl)
      : normalizeOriginalCampaign(undefined);

  let rawLink: string | null;
  if (input.body.linkUrl === null || (typeof input.body.linkUrl === "string" && !input.body.linkUrl.trim())) {
    rawLink = null;
  } else if (typeof input.body.linkUrl === "string") {
    rawLink = input.body.linkUrl.trim();
  } else if (existing?.linkUrl) {
    rawLink = existing.linkUrl;
  } else {
    rawLink = null;
  }

  const linkUrl = rawLink ? applySabqXMeasurementTags(rawLink, input.contentId, campaign) : null;
  const length = assertOriginalLength(text, linkUrl);
  return {
    text: text.trim(),
    textSource,
    includeLink: Boolean(linkUrl),
    linkUrl,
    rawLinkUrl: rawLink,
    campaign,
    imageSource: imageUrls.length > 0 ? "upload" : "none",
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    composedText: composeXPostText(text, linkUrl),
    weightedLength: length.weightedLength,
    remaining: length.remaining,
    valid: true,
    overStandard: length.overStandard,
    empty: false,
  };
}

function campaignFromStoredLink(linkUrl: string): string {
  try {
    const value = new URL(linkUrl).searchParams.get(BOT_SOCIAL_MEASUREMENT.campaignKey) ?? "";
    if (CAMPAIGN_RE.test(value)) return value;
  } catch {
    // الرابط المخزّن التالف يُعاد بناؤه بالحملة الافتراضية عند إعادة الإرسال.
  }
  return BOT_SOCIAL_MEASUREMENT.campaignValue;
}
