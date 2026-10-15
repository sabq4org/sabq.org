/**
 * مكتبة الشعارات (جدول logos — مستورد من salogos إلى media.sabq.org/logos/).
 *
 * - searchLogos: بحث بالاسم أو الوسوم للتبويب «الشعارات» في منتقي الوسائط.
 * - suggestLogosForArticle: يطابق أسماء الجهات المذكورة في نص الخبر مع أسماء الشعارات.
 * - registerLogoAsMedia: يسجّل نسخة PNG في media_files فيستلم المحرر سجل وسائط عاديًا.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { logos, mediaFiles, type MediaFile } from "@shared/schema";
import { normalizeArabicForSearch } from "@shared/logoSearch";
import { saveExistingMedia } from "./mediaLibraryService";

export interface LogoResult {
  id: string;
  displayId: number;
  title: string;
  name: string;
  url: string;
  svgUrl: string | null;
  pngUrl: string | null;
  downloadCount: number;
  relevanceScore?: number;
}

// ---------- استخراج اسم الجهة من عنوان الشعار ----------

const FORMAT_WORDS = /\b(svg|png|logo|pdf|eps|ai|vector)\b/gi;
const TITLE_NOISE = [
  /^\s*شعار\s+/,
  /بدقة\s+عالية|بدقه\s+عاليه|بجودة\s+عالية|بجوده\s+عاليه|عالي(?:ة|ه)?\s+الدقة/g,
  // \b لا يعمل مع الحروف العربية في JS — الحدود بالمسافات.
  /(^|\s)الجديد(?:ة|ه)?(?=\s|$)/g,
];

/** «شعار فلك القابضة بدقة عالية SVG - PNG» → «فلك القابضة» */
export function logoDisplayName(title: string): string {
  const segments = title.split(/\s+[-–|]\s+|\s*[-–|]\s*(?=[A-Za-z])/).map((s) => s.trim()).filter(Boolean);
  const clean = (s: string) => {
    let out = s;
    for (const re of TITLE_NOISE) out = out.replace(re, " ");
    return out.replace(FORMAT_WORDS, " ").replace(/\s+/g, " ").trim();
  };
  const cleaned = segments.map(clean).filter(Boolean);
  return cleaned.find((s) => /[؀-ۿ]/.test(s)) ?? cleaned[0] ?? title;
}

// ---------- تقطيع النص العربي للمطابقة ----------

/** كلمات الشكل القانوني لا تميّز الجهة. */
const LEGAL_FORM = stemSet(["شركه", "مجموعه", "مؤسسه", "قابضه", "محدوده", "تجاريه", "ذ.م.م", "من", "في", "و", "عن", "على"]);
/** ذِكر المنصب يدل على الجهة: «وزير التعليم» → وزاره التعليم. */
const ROLE_TO_ENTITY: Record<string, string> = { وزير: "وزاره", وزيره: "وزاره", امين: "امانه", امينه: "امانه" };
/** أسماء شعارات من كلمة واحدة هي كلمات عامة في الأخبار؛ لا تُقترح من النص (تبقى في البحث). */
const COMMON_WORD_NAMES = stemSet([
  "يوم", "دواء", "وقت", "منهل", "شرق", "جزيره", "حياه", "عربيه", "نقل", "ثقه", "صله", "جاهز", "سير", "بك",
  "قريه", "مسافر", "فرسان", "نادي", "تبادل", "تمكين", "وصل", "سمه", "مكنون", "مدي", "هنا", "درايه", "اجيال",
  "سكني", "ماكس", "ارتقاء", "منشات", "مدرستي", "عقال", "شعار", "زاده", "طازج", "موهبه", "رومانسيه", "كنترول",
  "عالميه", "بدائل", "متقدمه", "برستيج", "ثمانيه", "صحتك", "مدن", "نما", "عيشها", "ممتثل", "تانيا", "سلة", "سله",
]);

function stem(token: string): string {
  let t = token;
  // واو العطف فقط قبل «ال» أو مكررة — وإلا تُقطع «وزارة» و«وطني».
  if (t.startsWith("وال") || t.startsWith("وو")) t = t.slice(1);
  if (t.length > 4 && t.startsWith("لل")) t = t.slice(2);
  else if (t.length > 4 && /^[بلك]ال/.test(t)) t = t.slice(3);
  else if (t.length > 3 && t.startsWith("ال")) t = t.slice(2);
  // النسبة المؤنثة = المذكرة: «السعودية» = «السعودي»، «الوطنية» = «الوطني».
  if (t.length > 4 && t.endsWith("يه")) t = t.slice(0, -1);
  return t;
}

/** القوائم الثابتة تمر بنفس الجذع حتى تطابق كلمات النص. */
function stemSet(words: string[]): Set<string> {
  return new Set(words.map((w) => stem(normalizeArabicForSearch(w))));
}

function tokenize(text: string): string[] {
  return normalizeArabicForSearch(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map(stem);
}

/** كلمة نوع الجهة في أول الاسم يجب أن ترد ضمن العبارة: «جامعة فهد بن سلطان» لا تُقترح من «الأمير فهد بن سلطان». */
const ENTITY_HEADS = stemSet([
  "جامعه", "وزاره", "هيئه", "منصه", "مركز", "جمعيه", "مستشفي", "كليه", "برنامج", "صندوق", "بنك", "مجلس",
  "اماره", "امانه", "نادي", "جائزه", "مهرجان", "موسم", "غرفه", "اتحاد", "وكاله", "مديريه", "معهد", "مدينه",
]);

// ---------- فهرس الشعارات في الذاكرة (879 سجلًا) ----------

type IndexedLogo = LogoResult & { tokens: string[]; phrase: string; legalTokens: string[] };
export type LogoIndex = { logos: IndexedLogo[]; idf: Map<string, number> };
let cache: (LogoIndex & { at: number }) | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

function toResult(row: typeof logos.$inferSelect): LogoResult {
  return {
    id: row.id,
    displayId: row.displayId,
    title: row.title,
    name: logoDisplayName(row.title),
    url: row.pngUrl ?? row.primaryUrl ?? "",
    svgUrl: row.svgUrl,
    pngUrl: row.pngUrl,
    downloadCount: row.downloadCount,
  };
}

export function buildLogoIndex(rows: Array<typeof logos.$inferSelect>): LogoIndex {
  const indexed: IndexedLogo[] = rows.map((row) => {
    const base = toResult(row);
    const all = tokenize(base.name);
    const tokens = Array.from(new Set(all.filter((t) => !LEGAL_FORM.has(t))));
    const legalTokens = all.filter((t) => LEGAL_FORM.has(t) && t.length > 2);
    return { ...base, tokens, phrase: tokens.join(" "), legalTokens };
  });
  const df = new Map<string, number>();
  for (const l of indexed) for (const t of l.tokens) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = new Map<string, number>();
  for (const [t, n] of df) idf.set(t, Math.log((indexed.length + 1) / n));
  return { logos: indexed, idf };
}

async function getIndex(): Promise<LogoIndex> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  const rows = await db.select().from(logos).where(sql`${logos.primaryUrl} IS NOT NULL`);
  cache = { ...buildLogoIndex(rows), at: Date.now() };
  return cache;
}

// ---------- البحث ----------

export async function searchLogos(query: string, limit: number, offset: number): Promise<{ logos: LogoResult[]; hasMore: boolean }> {
  const q = normalizeArabicForSearch(query).replace(/^شعار\s+/, "").trim();
  const words = q.split(" ").filter(Boolean).slice(0, 6);
  const where = words.length
    ? and(...words.map((w) => sql`(${logos.searchText} ILIKE ${"%" + w + "%"} OR ${w} = ANY(${logos.tags}))`), sql`${logos.primaryUrl} IS NOT NULL`)
    : sql`${logos.primaryUrl} IS NOT NULL`;
  const rows = await db
    .select()
    .from(logos)
    .where(where)
    .orderBy(
      ...(words.length ? [desc(sql`similarity(${logos.searchText}, ${q})`)] : []),
      desc(logos.downloadCount),
      logos.displayId,
    )
    .limit(limit + 1)
    .offset(offset);
  return { logos: rows.slice(0, limit).map(toResult), hasMore: rows.length > limit };
}

// ---------- الاقتراح من نص الخبر ----------

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
}

/**
 * يرشّح الشعارات التي يرد اسم جهتها في الخبر.
 * الشرط: الاسم يرد متصلًا في النص ويغطي ≥ 70٪ من وزنه (الوزن = ندرة الكلمة بين أسماء الشعارات)،
 * أو — لاسم من كلمة واحدة — يرد في العنوان أو مرتين في المتن. الورود في العنوان يرفع الترتيب.
 */
export async function suggestLogosForArticle(title: string, content: string | null, limit: number): Promise<LogoResult[]> {
  return rankLogosForArticle(await getIndex(), title, content, limit);
}

/** المطابقة نفسها بلا قاعدة بيانات (تُختبر في tests/unit/logoLibrary.test.ts). */
export function rankLogosForArticle(index: LogoIndex, title: string, content: string | null, limit: number): LogoResult[] {
  const { logos: all, idf } = index;
  const titleTokens = tokenize(title);
  const bodyTokens = tokenize(stripHtml(content ?? "").slice(0, 20_000));
  // كل كلمة في الخبر احتمالان: كما هي، وبلا حرف ملتصق (و/ب/ل/ف/ك) — «وصندوق» تطابق «صندوق»
  // دون قطع أول «وزارة». ثم ذِكر المنصب يدل على الجهة.
  const variants = (t: string): string[] => {
    const out = [t];
    if (t.length > 3 && /^[وبلفك]/.test(t)) out.push(stem(t.slice(1)));
    return out.map((v) => ROLE_TO_ENTITY[v] ?? v);
  };
  const titleSeq = titleTokens.map(variants);
  const bodySeq = bodyTokens.map(variants);
  const titleSet = new Set(titleSeq.flat());
  const allSet = new Set([...titleSet, ...bodySeq.flat()]);

  const seq = [...titleSeq, ["|"], ...bodySeq]; // الفاصل يمنع عبور العبارة من العنوان إلى المتن

  /** أطول تتابع متصل من كلمات الاسم داخل النص (بالترتيب)، موزونًا بندرة الكلمة. */
  const bestRun = (tokens: string[], weights: number[], hay: string[][]) => {
    let best = 0;
    const lastStart = ENTITY_HEADS.has(tokens[0]) ? 1 : tokens.length;
    for (let i = 0; i < hay.length; i++) {
      for (let j = 0; j < lastStart; j++) {
        if (!hay[i].includes(tokens[j])) continue;
        let w = 0;
        let k = 0;
        while (i + k < hay.length && j + k < tokens.length && hay[i + k].includes(tokens[j + k])) {
          w += weights[j + k];
          k++;
        }
        if (k >= Math.min(2, tokens.length) && w > best) best = w;
      }
    }
    return best;
  };

  const scored: IndexedLogo[] = [];
  for (const logo of all) {
    if (logo.tokens.length === 0) continue;
    const weights = logo.tokens.map((t) => idf.get(t) ?? 0);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const keyToken = logo.tokens[weights.indexOf(Math.max(...weights))];
    if (!allSet.has(keyToken)) continue;

    let coverage: number;
    let inTitle: boolean;
    if (logo.tokens.length === 1) {
      // اسم من كلمة واحدة: في العنوان، أو مرتين في المتن — وليس كلمة عامة.
      if (COMMON_WORD_NAMES.has(keyToken)) continue;
      inTitle = titleSet.has(keyToken);
      if (!inTitle && bodySeq.filter((v) => v.includes(keyToken)).length < 2) continue;
      coverage = 1;
    } else {
      // اسم من عدة كلمات: يجب أن يرد متصلًا يغطي ≥ 70٪ من وزنه، والكلمة الأكثر تمييزًا ضمنه.
      coverage = bestRun(logo.tokens, weights, seq) / total;
      if (coverage < 0.7) continue;
      inTitle = bestRun(logo.tokens, weights, titleSeq) / total >= 0.7;
    }

    let score = 60 + 30 * coverage;
    if (inTitle) score += 8;
    // «شركة تطوير التعليم القابضة» حين يرد «تطوير التعليم» وصفًا لا اسمًا: أدنى من «وزارة التعليم».
    if (logo.legalTokens.length > 0 && !logo.legalTokens.some((t) => allSet.has(t))) score -= 10;
    score += Math.min(2, Math.log10(1 + logo.downloadCount) / 2);
    scored.push({ ...logo, relevanceScore: Math.min(99, Math.round(score)) });
  }

  return scored
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0) || b.downloadCount - a.downloadCount)
    .slice(0, limit)
    .map(({ tokens: _t, phrase: _p, legalTokens: _l, ...rest }): LogoResult => rest);
}

// ---------- الاستخدام في الخبر ----------

/** يسجّل نسخة PNG في مكتبة الوسائط (أو يعيد السجل الموجود) مع نص بديل «شعار …». */
export async function registerLogoAsMedia(logoId: string, userId: string): Promise<MediaFile | null> {
  const [row] = await db.select().from(logos).where(eq(logos.id, logoId)).limit(1);
  if (!row) return null;
  const url = row.pngUrl ?? row.primaryUrl;
  if (!url) return null;
  const name = logoDisplayName(row.title);
  const ext = url.split(".").pop() || "png";
  const media = await saveExistingMedia({
    url,
    fileName: `logo-${row.displayId}.${ext}`,
    title: `شعار ${name}`,
    category: "شعارات",
    userId,
  });
  await db
    .update(mediaFiles)
    .set({ altText: `شعار ${name}` })
    .where(and(eq(mediaFiles.id, media.id), isNull(mediaFiles.altText)));
  const [full] = await db.select().from(mediaFiles).where(eq(mediaFiles.id, media.id)).limit(1);
  return full ?? null;
}
