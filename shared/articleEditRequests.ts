// «طلب تعديل» على خبر منشور أو مسودة: المراسل يقترح، والمحرر يعتمد أو يرفض.
// منطق خالص بلا قاعدة بيانات: التحقق من المدخلات، والتطبيق على المتن، والملصقات.

export const EDIT_REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type EditRequestStatus = (typeof EDIT_REQUEST_STATUSES)[number];

/** الحقول التي يمكن أن يطبّقها المحرر من الطلب على المادة. */
export const EDIT_REQUEST_FIELDS = ["title", "subtitle", "content", "imageUrl", "albumImages"] as const;
export type EditRequestField = (typeof EDIT_REQUEST_FIELDS)[number];

export const EDIT_REQUEST_FIELD_LABELS: Record<EditRequestField, string> = {
  title: "العنوان",
  subtitle: "العنوان الفرعي",
  content: "النص",
  imageUrl: "الصورة البارزة",
  albumImages: "صور الألبوم",
};

/** حالات المادة التي يقبل فيها طلب التعديل (لا المؤرشف). */
export const EDIT_REQUEST_ARTICLE_STATUSES = ["draft", "ready_to_publish", "scheduled", "published"] as const;

export const EDIT_REQUEST_LIMITS = {
  note: 2000,
  title: 300,
  subtitle: 300,
  paragraph: 5000,
  contentEdits: 40,
  album: 10,
  url: 2048,
  imageAlt: 300,
  rejectReason: 1000,
  updateLine: 300,
} as const;

export interface EditRequestContentEdit {
  /** نص الفقرة كما كان عند الطلب (نص صافٍ). */
  before: string;
  /** النص المقترح؛ الفارغ يعني حذف الفقرة. */
  after: string;
}

export interface EditRequestProposal {
  title?: string;
  subtitle?: string;
  contentEdits?: EditRequestContentEdit[];
  appendParagraph?: string;
  imageUrl?: string;
  imageAlt?: string;
  albumAdd?: string[];
}

export interface EditRequestInput {
  articleId: string;
  urgent: boolean;
  note: string;
  proposed: EditRequestProposal;
}

type Ok<T> = { ok: true; value: T };
type Fail = { ok: false; message: string };

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").trim();
  if (!text) return undefined;
  return text.slice(0, max);
}

function cleanUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  if (!url || url.length > EDIT_REQUEST_LIMITS.url) return undefined;
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) return undefined;
  return url;
}

/** يحوّل نص الفقرة إلى شكل المقارنة الموحد (مسافات مفردة). */
export function normalizeParagraph(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** يتحقق من جسم طلب الإنشاء ويعيد قيمة نظيفة أو رسالة خطأ عربية. */
export function parseEditRequestInput(body: unknown): Ok<EditRequestInput> | Fail {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const articleId = typeof raw.articleId === "string" ? raw.articleId.trim() : "";
  if (!articleId || articleId.length > 64) return { ok: false, message: "الخبر غير محدد" };
  const note = cleanText(raw.note, EDIT_REQUEST_LIMITS.note) ?? "";
  const p = (raw.proposed && typeof raw.proposed === "object" ? raw.proposed : {}) as Record<string, unknown>;

  const proposed: EditRequestProposal = {};
  const title = cleanText(p.title, EDIT_REQUEST_LIMITS.title);
  if (title) proposed.title = title.replace(/\n+/g, " ");
  const subtitle = cleanText(p.subtitle, EDIT_REQUEST_LIMITS.subtitle);
  if (subtitle) proposed.subtitle = subtitle.replace(/\n+/g, " ");

  if (Array.isArray(p.contentEdits)) {
    const edits: EditRequestContentEdit[] = [];
    for (const item of p.contentEdits.slice(0, EDIT_REQUEST_LIMITS.contentEdits)) {
      if (!item || typeof item !== "object") continue;
      const before = cleanText((item as any).before, EDIT_REQUEST_LIMITS.paragraph);
      if (!before) continue;
      const afterRaw = (item as any).after;
      const after = typeof afterRaw === "string" ? normalizeParagraph(afterRaw).slice(0, EDIT_REQUEST_LIMITS.paragraph) : "";
      if (normalizeParagraph(before) === after) continue;
      edits.push({ before: normalizeParagraph(before), after });
    }
    if (edits.length) proposed.contentEdits = edits;
  }
  const append = cleanText(p.appendParagraph, EDIT_REQUEST_LIMITS.paragraph);
  if (append) proposed.appendParagraph = normalizeParagraph(append);

  if (p.imageUrl !== undefined && p.imageUrl !== null && p.imageUrl !== "") {
    const imageUrl = cleanUrl(p.imageUrl);
    if (!imageUrl) return { ok: false, message: "رابط الصورة البارزة غير صالح" };
    proposed.imageUrl = imageUrl;
    const alt = cleanText(p.imageAlt, EDIT_REQUEST_LIMITS.imageAlt);
    if (alt) proposed.imageAlt = alt.replace(/\n+/g, " ");
  }
  if (Array.isArray(p.albumAdd)) {
    const urls: string[] = [];
    for (const value of p.albumAdd) {
      const url = cleanUrl(value);
      if (!url) return { ok: false, message: "رابط إحدى الصور غير صالح" };
      if (!urls.includes(url)) urls.push(url);
    }
    if (urls.length > EDIT_REQUEST_LIMITS.album) return { ok: false, message: `الحد الأقصى ${EDIT_REQUEST_LIMITS.album} صور` };
    if (urls.length) proposed.albumAdd = urls;
  }

  if (!note && proposalFields(proposed).length === 0) {
    return { ok: false, message: "اكتب ملاحظتك أو اقترح تعديلًا واحدًا على الأقل" };
  }
  return { ok: true, value: { articleId, urgent: raw.urgent === true, note, proposed } };
}

/** الحقول التي يحملها الطلب فعلًا، بترتيب العرض. */
export function proposalFields(proposed: EditRequestProposal | null | undefined): EditRequestField[] {
  if (!proposed) return [];
  const fields: EditRequestField[] = [];
  if (proposed.title) fields.push("title");
  if (proposed.subtitle) fields.push("subtitle");
  if (proposed.contentEdits?.length || proposed.appendParagraph) fields.push("content");
  if (proposed.imageUrl) fields.push("imageUrl");
  if (proposed.albumAdd?.length) fields.push("albumImages");
  return fields;
}

/** نص الليبل القصير على صف الخبر: «العنوان والنص» أو «+3 صور» أو «ملاحظة». */
export function editRequestShortLabel(proposed: EditRequestProposal | null | undefined): string {
  const fields = proposalFields(proposed);
  if (fields.length === 0) return "ملاحظة";
  const parts: string[] = [];
  if (fields.includes("title") || fields.includes("subtitle")) parts.push("العنوان");
  if (fields.includes("content")) parts.push("النص");
  if (fields.includes("imageUrl")) parts.push("الصورة البارزة");
  if (fields.includes("albumImages")) parts.push(`+${proposed!.albumAdd!.length} صور`);
  if (parts.length <= 2) return parts.join(" و");
  return `${parts.length} تغييرات`;
}

/** يحدد الحقول المطلوب تطبيقها من جسم الاعتماد، ضمن ما يحمله الطلب. */
export function resolveApplyFields(requested: unknown, proposed: EditRequestProposal): EditRequestField[] | null {
  const available = proposalFields(proposed);
  if (requested === undefined || requested === null) return available;
  if (!Array.isArray(requested)) return null;
  const picked = new Set<EditRequestField>();
  for (const value of requested) {
    if (typeof value !== "string" || !(EDIT_REQUEST_FIELDS as readonly string[]).includes(value)) return null;
    if (available.includes(value as EditRequestField)) picked.add(value as EditRequestField);
  }
  return available.filter((field) => picked.has(field));
}

// ---------- تطبيق تعديلات الفقرات على المتن ----------

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function plainOf(fragmentHtml: string): string {
  return normalizeParagraph(decodeEntities(fragmentHtml.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")));
}

const PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;

/** فقرات المتن النصية القابلة للتعديل من المراسل (وسوم <p> بنص، بلا وسائط). */
export function editableParagraphs(html: string | null | undefined): string[] {
  if (!html) return [];
  const out: string[] = [];
  if (/<p\b/i.test(html)) {
    for (const match of html.matchAll(PARAGRAPH)) {
      if (/<(img|iframe|video|embed|figure|table)\b/i.test(match[1])) continue;
      const text = plainOf(match[1]);
      if (text) out.push(text);
    }
    return out;
  }
  // متن قديم بلا <p>: أسطر نصية
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .split(/\n+/)
    .map(normalizeParagraph)
    .filter(Boolean);
}

export interface ContentApplyResult {
  html: string;
  applied: number;
  /** فقرات لم يُعثر عليها لأنها تغيّرت بعد إرسال الطلب. */
  missing: string[];
}

/**
 * يطبّق تعديلات الفقرات على HTML المتن: تُستبدل الفقرة التي يطابق نصها الصافي
 * `before` بفقرة جديدة نصها `after` (مُهرّب)، أو تُحذف إن كان `after` فارغًا.
 * باقي المتن (الصور، التنسيق، الفقرات الأخرى) يبقى كما هو حرفيًا.
 */
export function applyContentEdits(
  html: string | null | undefined,
  edits: readonly EditRequestContentEdit[] | undefined,
  appendParagraph?: string,
): ContentApplyResult {
  let out = html ?? "";
  let applied = 0;
  const missing: string[] = [];
  for (const edit of edits ?? []) {
    const target = normalizeParagraph(edit.before);
    const replacement = edit.after ? `<p>${escapeHtmlText(edit.after)}</p>` : "";
    let done = false;
    if (/<p\b/i.test(out)) {
      out = out.replace(PARAGRAPH, (whole, inner: string) => {
        if (done || plainOf(inner) !== target) return whole;
        done = true;
        return replacement;
      });
    } else {
      // متن بلا <p>: استبدال نصي إن ظهر السطر مرة واحدة بالضبط
      const escaped = escapeHtmlText(target);
      const first = out.indexOf(escaped);
      if (first !== -1 && out.indexOf(escaped, first + escaped.length) === -1) {
        out = out.slice(0, first) + (edit.after ? escapeHtmlText(edit.after) : "") + out.slice(first + escaped.length);
        done = true;
      }
    }
    if (done) applied++;
    else missing.push(target);
  }
  if (appendParagraph) {
    out = `${out}${out && !/\n$/.test(out) ? "\n" : ""}<p>${escapeHtmlText(appendParagraph)}</p>`;
    applied++;
  }
  return { html: out, applied, missing };
}

/** القيم الحالية للحقول التي يمسّها الطلب، تُحفظ مع الطلب ليُعرض الفرق كما رآه المراسل. */
export function baseSnapshotFor(article: {
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  albumImages?: string[] | null;
}) {
  return {
    title: article.title ?? null,
    subtitle: article.subtitle ?? null,
    imageUrl: article.imageUrl ?? null,
    albumImages: Array.isArray(article.albumImages) ? article.albumImages : [],
  };
}

export interface ApplyPatchResult {
  patch: Record<string, unknown>;
  appliedFields: EditRequestField[];
  missingParagraphs: string[];
}

/** الأعمدة التي يكتبها الاعتماد على صف المادة. */
export function buildEditRequestPatch(input: {
  article: {
    content?: string | null;
    albumImages?: string[] | null;
    seo?: Record<string, unknown> | null;
  };
  proposed: EditRequestProposal;
  fields: readonly EditRequestField[];
}): ApplyPatchResult {
  const { proposed, article } = input;
  const patch: Record<string, unknown> = {};
  const appliedFields: EditRequestField[] = [];
  let missingParagraphs: string[] = [];
  for (const field of input.fields) {
    if (field === "title" && proposed.title) {
      patch.title = proposed.title;
      appliedFields.push(field);
    } else if (field === "subtitle" && proposed.subtitle) {
      patch.subtitle = proposed.subtitle;
      appliedFields.push(field);
    } else if (field === "content" && (proposed.contentEdits?.length || proposed.appendParagraph)) {
      const result = applyContentEdits(article.content, proposed.contentEdits, proposed.appendParagraph);
      missingParagraphs = result.missing;
      if (result.applied > 0 && result.html !== (article.content ?? "")) {
        patch.content = result.html;
        appliedFields.push(field);
      }
    } else if (field === "imageUrl" && proposed.imageUrl) {
      patch.imageUrl = proposed.imageUrl;
      patch.isAiGeneratedImage = false;
      if (proposed.imageAlt) patch.seo = { ...(article.seo ?? {}), imageAltText: proposed.imageAlt };
      appliedFields.push(field);
    } else if (field === "albumImages" && proposed.albumAdd?.length) {
      const current = Array.isArray(article.albumImages) ? article.albumImages : [];
      const next = [...current];
      for (const url of proposed.albumAdd) if (!next.includes(url)) next.push(url);
      if (next.length !== current.length) {
        patch.albumImages = next;
        appliedFields.push(field);
      }
    }
  }
  return { patch, appliedFields, missingParagraphs };
}

/** صاحب المادة الذي يحق له طلب تعديلها: الكاتب أو المراسل أو المُرسِل. */
export function isEditRequestOwner(
  article: { authorId?: string | null; reporterId?: string | null; submitterId?: string | null },
  userId: string,
): boolean {
  return [article.authorId, article.reporterId, article.submitterId].some((id) => Boolean(id) && id === userId);
}

export function articleAcceptsEditRequests(status: string | null | undefined): boolean {
  return (EDIT_REQUEST_ARTICLE_STATUSES as readonly string[]).includes(status ?? "");
}
