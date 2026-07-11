/**
 * خدمة استيراد أخبار SportMonks التحريرية كمسودّات عربية.
 *
 * المزود يوفّر لكل مباراة مونديال مادة تحريرية إنجليزية جاهزة:
 *   - معاينة ما قبل المباراة (pre-match): فقرتان سرديتان (home/away).
 *   - تقرير ما بعد المباراة (post-match): وقائع بالدقائق + اقتباسات (غير مرتّبة).
 *
 * لا نَنشر النص الأجنبي حرفيًا (حقوق + لغة + نبرة)؛ بل نمرّره على محرّر سبق
 * (Claude Sonnet 4.6 ثم GPT-5.1 بديلًا) ليترجمه ويعيد صياغته بالعربية بأسلوب
 * سبق، ثم نحفظه **مسودّة** في جدول المقالات ليراجعه المحرّر وينشره بنقرة.
 *
 * منع التكرار عبر slug حتمي: smwc26-preview-{fixtureId} / smwc26-report-{fixtureId}
 * (نطاق مستقل عن محرّك المونديال wc26-* فلا يتصادمان). الـ slug يُختم في
 * legacySlug أيضًا كي يبقى الفحص صامدًا لو غيّر المحرر الـ slug من العنوان.
 *
 * القاعدة الذهبية (نفس محرّك المونديال): النموذج يترجم ويصوغ فقط — يُمنع اختراع
 * أي معلومة خارج المادة الأصلية.
 *
 * وفق ADR-001: استعلامات Drizzle هنا في طبقة الخدمة (لا في المسار).
 */
import { eq, or, inArray } from "drizzle-orm";
import { db } from "../db";
import { articles, categories } from "@shared/schema";
import { storage } from "../storage";
import { aiManager, type AIModelConfig, type AIResponse } from "../ai-manager";
import { SABQ_PRIMARY_EDITOR_MODEL, SABQ_FALLBACK_EDITOR_MODEL } from "../ai/sabqEditorialPrompt";
import {
  fetchPrematchNews,
  fetchPostmatchNews,
  isSportmonksConfigured,
  type SmNewsItem,
} from "./sportmonksService";

const SABQ_AI_AUTHOR_ID = "bkIhDx7BM8quPu2W1tB6Z"; // "سبق AI" — نفس كاتب أخبار المونديال
const SLUG_PREFIX = "smwc26";
const WC_LEAGUE_ID = 732; // World Cup عند SportMonks

// البطولات المسموح توليد أخبارها آليًا (معرّفات SportMonks) — افتراضيًا المونديال.
// للتوسعة (موسم روشن/كأس الملك/النخبة): SPORTMONKS_NEWS_LEAGUES="732,944,950,1085"
const NEWS_LEAGUE_IDS = new Set(
  (process.env.SPORTMONKS_NEWS_LEAGUES || String(WC_LEAGUE_ID))
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
);

export type SmNewsKind = "prematch" | "postmatch";

// نوافذ الحداثة لتقارير ما بعد المباراة: عرض الـ4 أيام الأخيرة في اللوحة (ليختار
// المحرر بمرونة)، والـ cron يكتفي بآخر 24 ساعة كي لا يولّد لمباريات قديمة.
const POSTMATCH_DASHBOARD_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;
const POSTMATCH_CRON_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_GENERATIONS_PER_CRON = Number(process.env.SPORTMONKS_NEWS_MAX_PER_RUN || 3);

const kindToSlugKind = (kind: SmNewsKind) => (kind === "postmatch" ? "report" : "preview");

// ---------- هوية البطولة في النص والروابط ----------
// البرومبتات كانت مونديالية حصرًا؛ الآن تتفرّع بهوية البطولة: خليجي 27 متى
// ضُبط SM_GULF_LEAGUE_ID (نفس مفتاح تشكيلة الجولة)، والمونديال لما سواه.
const GULF_SM_LEAGUE_ID = Number(process.env.SM_GULF_LEAGUE_ID || 0);

interface SmLeagueBrand {
  tournament: string;
  hubFooter: string;
}

function leagueBrand(leagueId?: number | null): SmLeagueBrand {
  if (GULF_SM_LEAGUE_ID > 0 && leagueId === GULF_SM_LEAGUE_ID) {
    return {
      tournament: "كأس الخليج العربي «خليجي 27»",
      hubFooter:
        '<p>تابع <a href="/gulf-cup">تغطية خليجي 27 لحظة بلحظة — النتائج وجدول المباريات والترتيب</a> على سبق.</p>',
    };
  }
  return {
    tournament: "كأس العالم 2026",
    hubFooter:
      '<p>تابع <a href="/world-cup">تغطية كأس العالم 2026 لحظة بلحظة — النتائج وجدول المباريات وترتيب المجموعات</a> على سبق.</p>',
  };
}

// معرّف المباراة فريد عالميًّا عند SportMonks؛ المونديال يحتفظ بسابقته التاريخية
// (استمرارية منع التكرار)، وخليجي بسابقة خاصة، وبقية البطولات على سابقة عامة
const slugFor = (kind: SmNewsKind, fixtureId: number, leagueId?: number) => {
  const prefix =
    leagueId == null || leagueId === WC_LEAGUE_ID
      ? SLUG_PREFIX
      : GULF_SM_LEAGUE_ID > 0 && leagueId === GULF_SM_LEAGUE_ID
        ? "smgc27"
        : "smfx";
  return `${prefix}-${kindToSlugKind(kind)}-${fixtureId}`;
};

// ---------- تعريب أسماء المنتخبات (إرشاد للنموذج + عرض اللوحة) ----------
// أسماء المنتخبات تصل من SportMonks بالإنجليزية فقط (لا معرّف API-Football)،
// فنحتاج خريطة إنجليزي→عربي بالصيغ المعتمدة في سبق. النموذج يعرّب البقية.
const SM_TEAM_AR: Record<string, string> = {
  "saudi arabia": "السعودية",
  "cape verde": "الرأس الأخضر",
  "cape verde islands": "الرأس الأخضر",
  uruguay: "أوروغواي",
  spain: "إسبانيا",
  japan: "اليابان",
  sweden: "السويد",
  netherlands: "هولندا",
  tunisia: "تونس",
  ecuador: "الإكوادور",
  germany: "ألمانيا",
  curacao: "كوراساو",
  "curaçao": "كوراساو",
  "ivory coast": "ساحل العاج",
  "côte d'ivoire": "ساحل العاج",
  "cote d'ivoire": "ساحل العاج",
  "türkiye": "تركيا",
  turkiye: "تركيا",
  turkey: "تركيا",
  "united states": "الولايات المتحدة",
  "united states of america": "الولايات المتحدة",
  usa: "الولايات المتحدة",
  paraguay: "باراغواي",
  australia: "أستراليا",
  norway: "النرويج",
  france: "فرنسا",
  senegal: "السنغال",
  iraq: "العراق",
  mexico: "المكسيك",
  "south africa": "جنوب أفريقيا",
  "korea republic": "كوريا الجنوبية",
  "south korea": "كوريا الجنوبية",
  "czech republic": "التشيك",
  czechia: "التشيك",
  canada: "كندا",
  "bosnia and herzegovina": "البوسنة والهرسك",
  qatar: "قطر",
  switzerland: "سويسرا",
  brazil: "البرازيل",
  morocco: "المغرب",
  scotland: "اسكتلندا",
  haiti: "هايتي",
  belgium: "بلجيكا",
  egypt: "مصر",
  iran: "إيران",
  "new zealand": "نيوزيلندا",
  argentina: "الأرجنتين",
  algeria: "الجزائر",
  england: "إنجلترا",
  portugal: "البرتغال",
  croatia: "كرواتيا",
  colombia: "كولومبيا",
  panama: "بنما",
  austria: "النمسا",
  ghana: "غانا",
  "dr congo": "الكونغو الديمقراطية",
  jordan: "الأردن",
  uzbekistan: "أوزبكستان",
};

// المنتخبات العربية (بالإنجليزية كما يكتبها SportMonks) — لتمييز/إبراز مباريات العرب
const ARAB_TEAM_EN = new Set([
  "saudi arabia",
  "tunisia",
  "morocco",
  "egypt",
  "algeria",
  "jordan",
  "iraq",
  "qatar",
]);

function splitFixtureName(name: string | undefined): string[] {
  if (!name) return [];
  return name
    .split(/\s+vs\.?\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function localizeMatchName(name: string | undefined): string {
  const parts = splitFixtureName(name);
  if (parts.length === 2) {
    const a = SM_TEAM_AR[parts[0].toLowerCase()] || parts[0];
    const b = SM_TEAM_AR[parts[1].toLowerCase()] || parts[1];
    return `${a} × ${b}`;
  }
  return name || "";
}

function involvesArab(item: SmNewsItem): boolean {
  return splitFixtureName(item.fixture?.name).some((p) => ARAB_TEAM_EN.has(p.toLowerCase()));
}

function involvesSaudi(item: SmNewsItem): boolean {
  return splitFixtureName(item.fixture?.name).some((p) => p.toLowerCase() === "saudi arabia");
}

function teamsGuidance(item: SmNewsItem): string {
  const hints = splitFixtureName(item.fixture?.name)
    .map((p) => {
      const ar = SM_TEAM_AR[p.toLowerCase()];
      return ar ? `${p} = ${ar}` : null;
    })
    .filter(Boolean);
  if (hints.length) {
    return `استخدم الصيغ العربية المعتمدة في سبق لأسماء المنتخبات، ومنها: ${hints.join(
      "، "
    )}. وعرّب أسماء اللاعبين والمدربين تعريبًا صحيحًا.`;
  }
  return "عرّب أسماء المنتخبات واللاعبين والمدربين إلى صيغها العربية المعروفة في سبق.";
}

const fmtKickoffRiyadh = (timestampSec: number): string => {
  if (!timestampSec) return "";
  return new Date(timestampSec * 1000).toLocaleString("ar-SA", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
};

// ---------- تطبيع الأسطر ----------

/** يحذف الأسطر المكرّرة حرفيًا (المزود يكرّر سطر «المباريات القادمة» أحيانًا) */
function dedupeLines(item: SmNewsItem): SmNewsItem["lines"] {
  const seen = new Set<string>();
  return item.lines.filter((l) => {
    const key = l.text.replace(/\s+/g, " ").trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * معاينة: نرتّب home ثم away (السطر التمهيدي بالموعد مضمّن في أحدهما).
 * تقرير: نتركها كما هي بعد حذف التكرار — النموذج يرتّبها زمنيًا (كل سطر يذكر دقيقته).
 */
function orderedLines(item: SmNewsItem): string {
  const lines = dedupeLines(item);
  if (item.type === "prematch") {
    const rank = (t: string) => (t === "home" ? 0 : t === "away" ? 1 : 2);
    return [...lines]
      .sort((a, b) => rank(a.type) - rank(b.type))
      .map((l) => l.text)
      .join("\n\n");
  }
  return lines.map((l, i) => `${i + 1}. ${l.text}`).join("\n");
}

// ---------- استعلامات قاعدة البيانات (طبقة الخدمة وفق ADR-001) ----------

async function articleExists(slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: articles.id })
    .from(articles)
    .where(or(eq(articles.slug, slug), eq(articles.legacySlug, slug)))
    .limit(1);
  return rows.length > 0;
}

/** أي من الـ slugs المعطاة موجود مسبقًا (للتمييز في اللوحة دون استعلام لكل عنصر) */
async function existingSlugs(slugs: string[]): Promise<Set<string>> {
  if (!slugs.length) return new Set();
  const rows = await db
    .select({ slug: articles.slug, legacySlug: articles.legacySlug })
    .from(articles)
    .where(or(inArray(articles.slug, slugs), inArray(articles.legacySlug, slugs)));
  const set = new Set<string>();
  for (const r of rows) {
    if (r.slug) set.add(r.slug);
    if (r.legacySlug) set.add(r.legacySlug);
  }
  return set;
}

let sportsCategoryId: string | null = null;
async function getSportsCategoryId(): Promise<string> {
  if (sportsCategoryId) return sportsCategoryId;
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, "sports"))
    .limit(1);
  if (!rows[0]) throw new Error("[SM News] sports category not found");
  sportsCategoryId = rows[0].id;
  return sportsCategoryId;
}

// ---------- البرومبتات ----------

const EDITORIAL_RULES = `أنت محرر رياضي محترف في صحيفة "سبق" الإلكترونية السعودية.
قواعد صارمة لا يجوز كسرها:
- مهمتك: ترجمة وإعادة صياغة المادة الإنجليزية الواردة أدناه إلى العربية الفصحى الصحفية بأسلوب سبق (الهرم المقلوب: الأهم أولًا).
- يُمنع منعًا باتًا اختراع أي معلومة خارج المادة الأصلية: لا تضف أرقامًا ولا أحداثًا ولا اقتباسات ولا إصابات غير واردة فيها، ولا تحذف الحقائق المهمة (النتيجة، مسجّلو الأهداف ودقائقها، التشكيلات المتوقعة).
- العنوان من 5 إلى 12 كلمة، جذاب دون مبالغة، ويتضمن اسمَي المنتخبين.
- المحتوى HTML فقط بوسوم <p> و<h2> و<ul>/<li>، من 300 إلى 550 كلمة.
- التوقيتات بتوقيت الرياض (مكة المكرمة) إن وُجدت. وجّه المادة للقارئ السعودي والخليجي دون افتعال زاوية غير واردة في البيانات.
- لا تذكر أنك ذكاء اصطناعي، ولا تشر إلى "المادة الأصلية" أو إلى المزوّد.`;

const JSON_CONTRACT = `أعد الناتج بصيغة JSON صالحة فقط دون أي نص خارجها:
{
  "title": "العنوان",
  "content": "<p>...</p>",
  "summary": "ملخص من جملتين إلى ثلاث",
  "metaDescription": "وصف SEO بين 150 و160 حرفًا",
  "seoKeywords": ["..."],
  "suggestedTags": ["..."]
}`;

function buildPrematchPrompt(item: SmNewsItem): string {
  const kickoff = item.fixture?.starting_at_timestamp
    ? `موعد الانطلاق بتوقيت الرياض: ${fmtKickoffRiyadh(item.fixture.starting_at_timestamp)}`
    : "";
  return `${EDITORIAL_RULES}

المطلوب: معاينة صحفية (تقرير ما قبل المباراة) لمباراة في ${leagueBrand(item.league_id).tournament}.

المباراة: ${localizeMatchName(item.fixture?.name)}
${kickoff}
${teamsGuidance(item)}

ابنِ المعاينة على ما ورد في المادة الأصلية حصرًا: أهمية المباراة وسياقها، حالة المنتخبين وأرقامهما، التشكيلات المتوقعة، ثم اختم بالموعد والملعب إن ذُكرا.

المادة الأصلية (المصدر الوحيد المسموح — لا تخترج خارجها):
${orderedLines(item)}

${JSON_CONTRACT}`;
}

function buildPostmatchPrompt(item: SmNewsItem): string {
  const result = item.fixture?.result_info
    ? `النتيجة كما وردت من المزود (لا تخالفها): ${item.fixture.result_info}`
    : "";
  return `${EDITORIAL_RULES}

المطلوب: تقرير صحفي لمباراة انتهت في ${leagueBrand(item.league_id).tournament}.

المباراة: ${localizeMatchName(item.fixture?.name)}
${result}
${teamsGuidance(item)}

⚠️ ملاحظة على المادة: الأسطر أدناه «وقائع غير مرتّبة زمنيًا». رتّبها حسب الدقيقة المذكورة في كل سطر، وادمجها في تقرير متسلسل. حافظ على النتيجة وأسماء مسجّلي الأهداف وصنّاعها ودقائقها كما وردت تمامًا (لا تعكس فائزًا أو خاسرًا). إن وُجدت اقتباسات للاعبين أو مدربين فترجمها وأبرزها داخل التقرير.

ابنِ التقرير على: النتيجة ودلالتها أولًا، ثم سرد الأهداف واللحظات المفصلية بالدقائق، ثم الاقتباسات إن وُجدت.

الوقائع (غير مرتّبة):
${orderedLines(item)}

${JSON_CONTRACT}`;
}

// ---------- التوليد ----------

interface GeneratedArticle {
  title: string;
  content: string;
  summary: string;
  metaDescription: string;
  seoKeywords: string[];
  suggestedTags: string[];
}

function parseGenerated(raw: string): GeneratedArticle {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  const parsed = JSON.parse(jsonStr);
  if (!parsed.title || !parsed.content) {
    throw new Error("[SM News] generated payload missing title/content");
  }
  return {
    title: String(parsed.title),
    content: String(parsed.content),
    summary: String(parsed.summary || ""),
    metaDescription: String(parsed.metaDescription || ""),
    seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords : [],
    suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : [],
  };
}

// نفس سلسلة محرّر سبق: Anthropic Sonnet أولًا ثم gpt-5.1 عند أي فشل/بتر
const MODEL_CHAIN: AIModelConfig[] = [
  { provider: "anthropic", model: SABQ_PRIMARY_EDITOR_MODEL, maxTokens: 8000, temperature: 0.4 },
  { provider: "openai", model: SABQ_FALLBACK_EDITOR_MODEL },
];

async function generateText(prompt: string): Promise<AIResponse> {
  let lastError = "";
  for (const config of MODEL_CHAIN) {
    try {
      const attempt = await aiManager.generate(prompt, config);
      if (attempt.error) throw new Error(attempt.error);
      if (attempt.truncated) throw new Error("response truncated (max tokens)");
      return attempt;
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.warn(`[SM News] ${config.provider}/${config.model} failed: ${lastError}`);
    }
  }
  throw new Error(`[SM News] AI generation failed: ${lastError}`);
}

// تذييل الهَب حسب البطولة — انظر leagueBrand.

/**
 * يولّد مسودّة عربية من خبر SportMonks ويحفظها في جدول المقالات.
 * يُرجِع معرّف المقال، أو null لو كانت المسودّة موجودة مسبقًا (تخطٍّ).
 */
async function generateAndStoreDraft(
  item: SmNewsItem,
  opts: { authorId: string; categoryId: string }
): Promise<{ id: string; slug: string } | null> {
  const slug = slugFor(item.type, item.fixture_id, item.league_id);
  if (await articleExists(slug)) return null;

  const prompt = item.type === "prematch" ? buildPrematchPrompt(item) : buildPostmatchPrompt(item);
  const response = await generateText(prompt);
  const generated = parseGenerated(response.content);
  const now = new Date();

  const created = await storage.createArticle({
    title: generated.title,
    slug,
    legacySlug: slug,
    content: `${generated.content}\n${leagueBrand(item.league_id).hubFooter}`,
    excerpt: (generated.summary || generated.metaDescription).substring(0, 200),
    aiSummary: generated.summary,
    locale: "ar",
    categoryId: opts.categoryId,
    authorId: opts.authorId,
    articleType: "news",
    newsType: "regular",
    publishType: "instant",
    status: "draft", // دائمًا مسودّة — المحرّر يراجع وينشر
    aiGenerated: false,
    displayOrder: 0,
    seo: {
      metaTitle: generated.title,
      metaDescription: generated.metaDescription,
      keywords: generated.seoKeywords,
    },
    seoMetadata: {
      status: "generated",
      generatedAt: now.toISOString(),
      generatedBy: "system",
      provider: response.provider,
      model: response.model,
    },
    sourceMetadata: {
      type: "sportmonks-news",
      sportmonksId: item.id,
      fixtureId: item.fixture_id,
      leagueId: item.league_id,
      kind: item.type,
      lang: "en",
    },
  } as any); // authorId/aiGenerated خارج insertArticleSchema — نفس نمط أخبار المونديال وواس

  return { id: created.id, slug };
}

// ---------- واجهة اللوحة: الحالة + القائمة + الاستيراد ----------

export interface SmNewsStatus {
  configured: boolean;
  connected: boolean;
  prematchCount: number;
  postmatchCount: number;
  error?: string;
}

export async function getSportmonksNewsStatus(): Promise<SmNewsStatus> {
  const configured = isSportmonksConfigured();
  const result: SmNewsStatus = {
    configured,
    connected: false,
    prematchCount: 0,
    postmatchCount: 0,
  };
  if (!configured) return result;
  try {
    const [pre, post] = await Promise.all([fetchPrematchNews(), fetchPostmatchNews()]);
    result.connected = true;
    result.prematchCount = pre.length;
    result.postmatchCount = post.filter(withinDashboardWindow).length;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}

function withinDashboardWindow(item: SmNewsItem): boolean {
  if (item.type === "prematch") return true;
  const ts = item.fixture?.starting_at_timestamp;
  if (!ts) return true;
  return Date.now() - ts * 1000 <= POSTMATCH_DASHBOARD_WINDOW_MS;
}

export interface SmNewsListItem {
  id: number; // معرّف الخبر
  fixtureId: number;
  kind: SmNewsKind;
  title: string; // العنوان الإنجليزي (معاينة سريعة للمحرّر)
  matchName: string; // اسم المباراة الإنجليزي
  matchNameAr: string; // مُعرّب للعرض
  kickoff: string | null; // ISO
  kickoffLabel: string; // عربي بتوقيت الرياض
  leagueName: string;
  resultInfo: string | null;
  isArab: boolean;
  isSaudi: boolean;
  alreadyImported: boolean; // مسودّة لهذه المباراة موجودة مسبقًا
}

function toListItem(item: SmNewsItem, imported: Set<string>): SmNewsListItem {
  const ts = item.fixture?.starting_at_timestamp || 0;
  return {
    id: item.id,
    fixtureId: item.fixture_id,
    kind: item.type,
    title: item.title,
    matchName: item.fixture?.name || "",
    matchNameAr: localizeMatchName(item.fixture?.name),
    kickoff: ts ? new Date(ts * 1000).toISOString() : null,
    kickoffLabel: fmtKickoffRiyadh(ts),
    leagueName: item.league?.name || "",
    resultInfo: item.fixture?.result_info ?? null,
    isArab: involvesArab(item),
    isSaudi: involvesSaudi(item),
    alreadyImported: imported.has(slugFor(item.type, item.fixture_id, item.league_id)),
  };
}

/** قائمة الأخبار المتاحة للاستيراد (المنتخبات العربية أولًا، ثم الأحدث) */
export async function listSportmonksNews(kind: SmNewsKind): Promise<SmNewsListItem[]> {
  const raw = kind === "prematch" ? await fetchPrematchNews() : await fetchPostmatchNews();
  const items = raw.filter(withinDashboardWindow);
  const imported = await existingSlugs(items.map((i) => slugFor(i.type, i.fixture_id, i.league_id)));
  const list = items.map((i) => toListItem(i, imported));
  return list.sort((a, b) => {
    // مباريات السعودية ثم بقية العرب أولًا، ثم الأحدث انطلاقًا
    if (a.isSaudi !== b.isSaudi) return a.isSaudi ? -1 : 1;
    if (a.isArab !== b.isArab) return a.isArab ? -1 : 1;
    return (b.kickoff || "").localeCompare(a.kickoff || "");
  });
}

export interface SmImportInput {
  kind: SmNewsKind;
  ids: number[]; // معرّفات الأخبار المختارة
  userId?: string; // الكاتب (المحرّر) — يُستخدم بدل «سبق AI» عند الاستيراد اليدوي
  categoryId?: string; // وجهة القسم (افتراضيًا الرياضة)
}

export interface SmImportResult {
  imported: number;
  skipped: number;
  failed: number;
  titles: string[];
}

export async function importSportmonksNews(input: SmImportInput): Promise<SmImportResult> {
  const { kind, ids, userId, categoryId } = input;
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("SM_IMPORT_NO_ITEMS");

  const raw = kind === "prematch" ? await fetchPrematchNews() : await fetchPostmatchNews();
  const wanted = new Set(ids);
  const selected = raw.filter((i) => wanted.has(i.id));

  const authorId = userId || SABQ_AI_AUTHOR_ID;
  const targetCategory = categoryId || (await getSportsCategoryId());

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const titles: string[] = [];

  for (const item of selected) {
    try {
      const result = await generateAndStoreDraft(item, { authorId, categoryId: targetCategory });
      if (!result) {
        skipped++;
        continue;
      }
      imported++;
      titles.push(localizeMatchName(item.fixture?.name) || item.title);
    } catch (error) {
      failed++;
      console.error(`[SM News] import failed for news ${item.id} (fixture ${item.fixture_id}):`, error);
    }
  }

  return { imported, skipped, failed, titles };
}

/**
 * توليد مسودّة دون حفظ — لمعاينة جودة الترجمة/الصياغة قبل الربط أو للتشخيص.
 * يختار العنصر بمعرّف المباراة، أو أول مباراة سعودية، أو الأحدث انطلاقًا.
 */
export async function previewSportmonksDraft(
  kind: SmNewsKind,
  opts: { fixtureId?: number; saudiOnly?: boolean } = {}
): Promise<{
  matchName: string;
  kind: SmNewsKind;
  provider: string;
  model: string;
  generated: GeneratedArticle;
} | null> {
  const raw = kind === "prematch" ? await fetchPrematchNews() : await fetchPostmatchNews();
  if (!raw.length) return null;
  let item: SmNewsItem | undefined;
  if (opts.fixtureId) item = raw.find((i) => i.fixture_id === opts.fixtureId);
  if (!item && opts.saudiOnly) item = raw.find(involvesSaudi);
  if (!item) {
    item = [...raw].sort(
      (a, b) => (b.fixture?.starting_at_timestamp || 0) - (a.fixture?.starting_at_timestamp || 0)
    )[0];
  }
  if (!item) return null;

  const prompt = item.type === "prematch" ? buildPrematchPrompt(item) : buildPostmatchPrompt(item);
  const response = await generateText(prompt);
  return {
    matchName: localizeMatchName(item.fixture?.name),
    kind: item.type,
    provider: response.provider,
    model: response.model,
    generated: parseGenerated(response.content),
  };
}

// ---------- دورة الـ cron (مسودّات تلقائية) ----------

export interface SmNewsRunSummary {
  generated: number;
  skipped: number;
  errors: number;
}

/**
 * يجلب المعاينات القادمة + تقارير آخر 24 ساعة، ويولّد مسودّة لكل مباراة لم
 * تُستورد بعد (بسقف لكل دورة). المنتخبات العربية أولًا. مسودّات فقط — لا نشر.
 */
export async function runSportmonksNewsCycle(): Promise<SmNewsRunSummary> {
  const summary: SmNewsRunSummary = { generated: 0, skipped: 0, errors: 0 };
  if (!isSportmonksConfigured()) return summary;

  const [pre, post] = await Promise.all([fetchPrematchNews(), fetchPostmatchNews()]);
  const now = Date.now();
  const candidates = [
    ...pre.filter((i) => NEWS_LEAGUE_IDS.has(i.league_id)),
    ...post.filter(
      (i) =>
        NEWS_LEAGUE_IDS.has(i.league_id) &&
        (i.fixture?.starting_at_timestamp
          ? now - i.fixture.starting_at_timestamp * 1000 <= POSTMATCH_CRON_WINDOW_MS
          : false)
    ),
  ];

  // التقارير أولًا (الأهم بعد الصافرة)، ثم المنتخبات العربية، ثم البقية
  candidates.sort((a, b) => {
    if (a.type !== b.type) return a.type === "postmatch" ? -1 : 1;
    const arabA = involvesArab(a);
    const arabB = involvesArab(b);
    if (arabA !== arabB) return arabA ? -1 : 1;
    return 0;
  });

  const categoryId = await getSportsCategoryId().catch(() => null);
  if (!categoryId) {
    summary.errors++;
    return summary;
  }

  for (const item of candidates) {
    if (summary.generated >= MAX_GENERATIONS_PER_CRON) break;
    const slug = slugFor(item.type, item.fixture_id, item.league_id);
    try {
      if (await articleExists(slug)) {
        summary.skipped++;
        continue;
      }
      const result = await generateAndStoreDraft(item, {
        authorId: SABQ_AI_AUTHOR_ID,
        categoryId,
      });
      if (!result) {
        summary.skipped++;
        continue;
      }
      summary.generated++;
      console.log(
        `[SM News] ✅ مسودّة ${item.type} لمباراة ${item.fixture?.name} (fixture ${item.fixture_id}) → article ${result.id}`
      );
    } catch (error) {
      summary.errors++;
      console.error(`[SM News] ❌ ${item.type} failed for fixture ${item.fixture_id}:`, error);
    }
  }

  return summary;
}
