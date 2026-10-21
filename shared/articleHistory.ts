// سجل نسخ المادة: لقطة كاملة بعد كل حفظ من لوحة التحكم، والمقارنة والاسترجاع.
// منطق نقي بلا قاعدة بيانات — يستهلكه الخادم (articleHistoryService) والمحرر.

export const ARTICLE_VERSION_FIELDS = [
  "title",
  "subtitle",
  "excerpt",
  "content",
  "categoryId",
  "imageUrl",
  "imageSource",
  "albumImages",
  "videoUrl",
  "keywords",
  "status",
  "newsType",
] as const;

export type ArticleVersionField = (typeof ARTICLE_VERSION_FIELDS)[number];

/**
 * الحقول التي يعيدها الاسترجاع. الحالة ونوع الخبر لا تُسترجع: النشر قرار مستقل.
 * مصدر الصورة يتبع الصورة نفسها (buildRestorePatch).
 */
export const ARTICLE_RESTORABLE_FIELDS = [
  "title",
  "subtitle",
  "excerpt",
  "content",
  "categoryId",
  "imageUrl",
  "albumImages",
  "videoUrl",
  "keywords",
] as const;

export type ArticleRestorableField = (typeof ARTICLE_RESTORABLE_FIELDS)[number];

export const ARTICLE_VERSION_FIELD_LABELS: Record<ArticleVersionField, string> = {
  title: "العنوان",
  subtitle: "العنوان الفرعي",
  excerpt: "الموجز",
  content: "المتن",
  categoryId: "التصنيف",
  imageUrl: "الصورة الرئيسية",
  imageSource: "مصدر الصورة",
  albumImages: "صور الألبوم",
  videoUrl: "الفيديو",
  keywords: "الكلمات المفتاحية",
  status: "الحالة",
  newsType: "نوع الخبر",
};

export const ARTICLE_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  ready_to_publish: "جاهز للنشر",
  scheduled: "مجدول",
  published: "منشور",
  archived: "مؤرشف",
};

export const ARTICLE_IMAGE_SOURCE_LABELS: Record<string, string> = {
  ai: "مولّدة بالذكاء الاصطناعي",
  upload: "مرفوعة أو من المكتبة",
};

export type ArticleVersionAction =
  | "baseline"
  | "created"
  | "updated"
  | "autosave"
  | "published"
  | "unpublished"
  | "archived"
  | "restored";

export const ARTICLE_VERSION_ACTION_LABELS: Record<ArticleVersionAction, string> = {
  baseline: "أقدم نسخة محفوظة",
  created: "إدخال",
  updated: "تعديل",
  autosave: "حفظ تلقائي",
  published: "نشر",
  unpublished: "إلغاء النشر",
  archived: "أرشفة",
  restored: "استرجاع",
};

export interface ArticleSnapshot {
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  content: string;
  categoryId: string | null;
  imageUrl: string | null;
  /**
   * الحقول التالية أضيفت بعد أول نسخ محفوظة: غيابها (undefined) في لقطة قديمة
   * يعني «غير معروف»، فلا تُعرض تغييرًا ولا يمسّها الاسترجاع.
   */
  imageSource?: "ai" | "upload" | null;
  albumImages?: string[];
  videoUrl?: string | null;
  keywords: string[];
  status: string;
  newsType: string | null;
}

export interface ArticleLikeForSnapshot {
  title?: string | null;
  subtitle?: string | null;
  excerpt?: string | null;
  content?: string | null;
  categoryId?: string | null;
  imageUrl?: string | null;
  isAiGeneratedImage?: boolean | null;
  albumImages?: string[] | null;
  videoUrl?: string | null;
  status?: string | null;
  newsType?: string | null;
  seo?: { keywords?: unknown } | null;
}

export function snapshotFromArticle(article: ArticleLikeForSnapshot): ArticleSnapshot {
  const keywords = Array.isArray(article.seo?.keywords)
    ? (article.seo!.keywords as unknown[]).filter((k): k is string => typeof k === "string")
    : [];
  return {
    title: article.title ?? "",
    subtitle: article.subtitle ?? null,
    excerpt: article.excerpt ?? null,
    content: article.content ?? "",
    categoryId: article.categoryId ?? null,
    imageUrl: article.imageUrl ?? null,
    imageSource: article.imageUrl ? (article.isAiGeneratedImage ? "ai" : "upload") : null,
    albumImages: stringList(article.albumImages),
    videoUrl: article.videoUrl ?? null,
    keywords,
    status: article.status ?? "draft",
    newsType: article.newsType ?? null,
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v !== "") : [];
}

/** لقطة محفوظة في article_versions.snapshot (الكلمات المفتاحية في أعلاها، لا داخل seo). */
export function parseStoredSnapshot(value: Record<string, unknown> | null | undefined): ArticleSnapshot {
  const stored = (value ?? {}) as Record<string, unknown>;
  const base = snapshotFromArticle(stored as ArticleLikeForSnapshot);
  const snapshot: ArticleSnapshot = { ...base, keywords: stringList(stored.keywords) };
  if ("imageSource" in stored) snapshot.imageSource = (stored.imageSource as ArticleSnapshot["imageSource"]) ?? null;
  else delete snapshot.imageSource;
  if (!("albumImages" in stored)) delete snapshot.albumImages;
  if (!("videoUrl" in stored)) delete snapshot.videoUrl;
  return snapshot;
}

function normalized(field: ArticleVersionField, value: unknown): string {
  if (field === "keywords" || field === "albumImages") return JSON.stringify(Array.isArray(value) ? value : []);
  if (value === null || value === undefined) return "";
  return String(value);
}

export function changedSnapshotFields(
  before: Partial<ArticleSnapshot> | null | undefined,
  after: Partial<ArticleSnapshot>,
): ArticleVersionField[] {
  if (!before) return [];
  return ARTICLE_VERSION_FIELDS.filter(
    (field) =>
      before[field] !== undefined &&
      after[field] !== undefined &&
      normalized(field, before[field]) !== normalized(field, after[field]),
  );
}

/** حقول قصيرة تُحفظ قيمتها قبل وبعد داخل حدث السجل؛ المتن يُقارن من النسخ. */
export const ARTICLE_INLINE_CHANGE_FIELDS = [
  "title",
  "subtitle",
  "excerpt",
  "categoryId",
  "imageUrl",
  "imageSource",
  "albumImages",
  "videoUrl",
  "keywords",
  "status",
  "newsType",
] as const satisfies readonly ArticleVersionField[];

export interface ArticleFieldChange {
  field: ArticleVersionField;
  oldValue: unknown;
  newValue: unknown;
}

export function inlineChanges(
  before: ArticleSnapshot,
  after: ArticleSnapshot,
  fields: readonly ArticleVersionField[],
): ArticleFieldChange[] {
  const inline = new Set<string>(ARTICLE_INLINE_CHANGE_FIELDS);
  return fields
    .filter((field) => inline.has(field))
    .map((field) => ({ field, oldValue: before[field], newValue: after[field] }));
}

/** أي حدث يمثّل هذا الحفظ: تغيّر الحالة أولى من التعديل. */
export function versionActionFor(input: {
  before: ArticleSnapshot | null;
  after: ArticleSnapshot;
  autosave?: boolean;
}): ArticleVersionAction {
  if (!input.before) return "created";
  if (input.before.status !== input.after.status) {
    if (input.after.status === "published") return "published";
    if (input.after.status === "archived") return "archived";
    if (input.before.status === "published") return "unpublished";
  }
  return input.autosave ? "autosave" : "updated";
}

/** حقول الاسترجاع المطلوبة بعد التحقق؛ القائمة الفارغة تعني كل الحقول القابلة للاسترجاع. */
export function resolveRestoreFields(requested: unknown): ArticleRestorableField[] | null {
  if (requested === undefined || requested === null) return [...ARTICLE_RESTORABLE_FIELDS];
  if (!Array.isArray(requested)) return null;
  const allowed = new Set<string>(ARTICLE_RESTORABLE_FIELDS);
  const picked = new Set<ArticleRestorableField>();
  for (const value of requested) {
    if (typeof value !== "string" || !allowed.has(value)) return null;
    picked.add(value as ArticleRestorableField);
  }
  return picked.size > 0 ? ARTICLE_RESTORABLE_FIELDS.filter((f) => picked.has(f)) : [...ARTICLE_RESTORABLE_FIELDS];
}

/**
 * الأعمدة التي يكتبها الاسترجاع على صف المقال. الموجز يزامن aiSummary ويبطل
 * النقاط كما يفعل الحفظ العادي، والكلمات المفتاحية تُدمج داخل seo.
 */
export function buildRestorePatch(input: {
  snapshot: ArticleSnapshot;
  fields: readonly ArticleRestorableField[];
  currentSeo: Record<string, unknown> | null | undefined;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of input.fields) {
    if (input.snapshot[field] === undefined) continue;
    if (field === "imageUrl") {
      patch.imageUrl = input.snapshot.imageUrl;
      // مصدر الصورة يتبعها؛ لقطة قديمة بلا مصدر تُترك علامة الذكاء الاصطناعي كما هي
      if (!input.snapshot.imageUrl || input.snapshot.imageSource) {
        patch.isAiGeneratedImage = input.snapshot.imageSource === "ai";
      }
    } else if (field === "keywords") {
      patch.seo = { ...(input.currentSeo ?? {}), keywords: input.snapshot.keywords };
    } else if (field === "excerpt") {
      patch.excerpt = input.snapshot.excerpt;
      patch.aiSummary = input.snapshot.excerpt;
      patch.aiBullets = null;
      patch.aiBulletsGeneratedAt = null;
    } else {
      patch[field] = input.snapshot[field];
    }
  }
  return patch;
}

// ---------- المتن: فقرات وكلمات ----------

const BLOCK_BREAK = /<\/(p|h[1-6]|li|blockquote|div|figure|figcaption|tr|pre)>|<br\s*\/?>/gi;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const MEDIA_PREFIX = "\uE000media:";
const MEDIA_TAG = /<(img|iframe|video|source|embed)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

export type ContentMedia = { kind: "image" | "video"; src: string };

/** كتلة وسائط داخل المتن (صورة أو فيديو مضمّن) كما تُخرجها contentBlocks. */
export function parseMediaBlock(block: string): ContentMedia | null {
  if (!block.startsWith(MEDIA_PREFIX)) return null;
  const rest = block.slice(MEDIA_PREFIX.length);
  const sep = rest.indexOf(":");
  return { kind: rest.slice(0, sep) === "image" ? "image" : "video", src: rest.slice(sep + 1) };
}

/** المتن إلى كتل مقروءة بالترتيب: فقرات نصية (بلا وسوم) وصور وفيديوهات مضمّنة. */
export function contentBlocks(html: string | null | undefined): string[] {
  if (!html) return [];
  const withMedia = html.replace(MEDIA_TAG, (_tag, name: string, src: string) => {
    const kind = name.toLowerCase() === "img" ? "image" : "video";
    return `\n${MEDIA_PREFIX}${kind}:${src.trim()}\n`;
  });
  return decodeEntities(withMedia.replace(BLOCK_BREAK, "\n").replace(/<[^>]+>/g, ""))
    .split(/\n+/)
    .map((line) => (line.startsWith(MEDIA_PREFIX) ? line.trim() : line.replace(/\s+/g, " ").trim()))
    .filter(Boolean);
}

/** فقرات المتن النصية فقط، للعرض والعدّ. */
export function contentParagraphs(html: string | null | undefined): string[] {
  return contentBlocks(html).filter((block) => !block.startsWith(MEDIA_PREFIX));
}

export function contentMedia(html: string | null | undefined): ContentMedia[] {
  return contentBlocks(html).map(parseMediaBlock).filter((m): m is ContentMedia => m !== null);
}

export function contentWordCount(html: string | null | undefined): number {
  return contentParagraphs(html).reduce((sum, p) => sum + p.split(" ").filter(Boolean).length, 0);
}

/**
 * ملخص تغيير المتن للسجل: الكلمات قبل وبعد، والصور والفيديوهات المضافة والمحذوفة،
 * وهل تغيّر النص نفسه (وإلا فالتغيير تنسيق أو وسائط فقط).
 */
export function summarizeContentChange(beforeHtml: string | null | undefined, afterHtml: string | null | undefined) {
  const beforeText = contentParagraphs(beforeHtml);
  const afterText = contentParagraphs(afterHtml);
  const beforeMedia = contentMedia(beforeHtml).map((m) => m.src);
  const afterMedia = contentMedia(afterHtml);
  const beforeSet = new Set(beforeMedia);
  const afterSet = new Set(afterMedia.map((m) => m.src));
  return {
    beforeWords: contentWordCount(beforeHtml),
    afterWords: contentWordCount(afterHtml),
    textChanged: beforeText.join("\n") !== afterText.join("\n"),
    mediaAdded: afterMedia.filter((m) => !beforeSet.has(m.src)),
    mediaRemoved: contentMedia(beforeHtml).filter((m) => !afterSet.has(m.src)),
  };
}

export type DiffOp<T> = { type: "same" | "removed" | "added"; value: T };

/** فرق LCS بين قائمتين. يكفي لمتن خبر (مئات الفقرات أو بضعة آلاف كلمات). */
export function diffSequence<T>(a: readonly T[], b: readonly T[]): DiffOp<T>[] {
  const n = a.length;
  const m = b.length;
  const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const ops: DiffOp<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", value: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ type: "removed", value: a[i++] });
    } else {
      ops.push({ type: "added", value: b[j++] });
    }
  }
  while (i < n) ops.push({ type: "removed", value: a[i++] });
  while (j < m) ops.push({ type: "added", value: b[j++] });
  return ops;
}

export type ParagraphDiff =
  | { type: "same"; text: string }
  | { type: "removed"; text: string }
  | { type: "added"; text: string }
  | { type: "changed"; words: DiffOp<string>[] };

/**
 * فرق المتن بالفقرات: الفقرة المحذوفة التي تليها فقرة مضافة تُعرض تعديلًا
 * داخل الفقرة بالكلمات، والباقي فقرات كاملة محذوفة أو مضافة.
 */
export function diffContent(beforeHtml: string | null | undefined, afterHtml: string | null | undefined): ParagraphDiff[] {
  const ops = diffSequence(contentBlocks(beforeHtml), contentBlocks(afterHtml));
  const out: ParagraphDiff[] = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].type === "same") {
      out.push({ type: "same", text: ops[k].value });
      k++;
      continue;
    }
    // كتلة تغييرات بين فقرتين متطابقتين: تُطابَق المحذوفة بالمضافة بالترتيب
    // متى تشابهتا بما يكفي، وما لا يشبه شيئًا يبقى فقرة كاملة محذوفة أو مضافة.
    const removed: string[] = [];
    const added: string[] = [];
    while (k < ops.length && ops[k].type !== "same") {
      (ops[k].type === "removed" ? removed : added).push(ops[k].value);
      k++;
    }
    let a = 0;
    while (a < added.length || removed.length > 0) {
      const r = removed[0];
      const next = added[a];
      if (r !== undefined && next !== undefined && paragraphsSimilar(r, next)) {
        out.push({ type: "changed", words: diffSequence(r.split(" "), next.split(" ")) });
        removed.shift();
        a++;
      } else if (r !== undefined && (next === undefined || !added.slice(a).some((x) => paragraphsSimilar(r, x)))) {
        out.push({ type: "removed", text: r });
        removed.shift();
      } else if (next !== undefined) {
        out.push({ type: "added", text: next });
        a++;
      } else {
        break;
      }
    }
  }
  return out;
}

function paragraphsSimilar(a: string, b: string): boolean {
  if (a.startsWith(MEDIA_PREFIX) || b.startsWith(MEDIA_PREFIX)) return false;
  const wordsA = new Set(a.split(" "));
  const wordsB = b.split(" ");
  const common = wordsB.filter((w) => wordsA.has(w)).length;
  return common / Math.max(wordsA.size, wordsB.length, 1) >= 0.5;
}

export function summarizeContentDiff(diff: readonly ParagraphDiff[]) {
  let removed = 0;
  let added = 0;
  let changed = 0;
  for (const part of diff) {
    if (part.type === "removed") removed++;
    else if (part.type === "added") added++;
    else if (part.type === "changed") changed++;
  }
  return { removed, added, changed };
}
