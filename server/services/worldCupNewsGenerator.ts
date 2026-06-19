/**
 * مولّد أخبار كأس العالم 2026 — يحوّل بيانات API-Football الحقيقية إلى مواد
 * صحفية عربية جاهزة للنشر (معاينة قبل المباراة + تقرير بعد المباراة).
 *
 * القاعدة الذهبية: النموذج لا يُسمح له باختراع أي معلومة — كل الحقائق
 * (نتائج، أحداث، إحصائيات، مواجهات سابقة) تُحقن في البرومبت من المزود،
 * ودوره الصياغة الصحفية فقط. لا اقتباسات ولا إصابات ولا أخبار غير واردة
 * في البيانات.
 *
 * منع التكرار عبر الـ slug الحتمي: wc26-preview-{fixtureId} /
 * wc26-report-{fixtureId} — لا حاجة لجدول تتبّع جديد، ووجود الـ slug
 * يعني أن المادة أُنتجت.
 *
 * المفتاح يُختم أيضًا في legacySlug لأن محرر اللوحة قد يعيد توليد الـ slug
 * من العنوان بعد إعادة الصياغة (حادثة كندا × البوسنة 2026-06-12: تعديل
 * العنوان بدّل الـ slug فولّد المحرك التقرير مرة ثانية بعد 34 ثانية).
 * legacySlug لا يلمسه المحرر، ففحص الوجود يبحث في العمودين معًا.
 */
import { eq, like, ilike, notIlike, and, or, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, categories, tags, articleTags } from "@shared/schema";
import { storage } from "../storage";
import { aiManager, type AIModelConfig, type AIResponse } from "../ai-manager";
import { SABQ_PRIMARY_EDITOR_MODEL, SABQ_FALLBACK_EDITOR_MODEL } from "../ai/sabqEditorialPrompt";
import {
  getFixtures,
  getMatchDetail,
  getStandings,
  type WcFixture,
  type WcGroup,
  type WcMatchDetail,
} from "./worldCupService";
import { isArabTeam } from "./worldCupNames";

const SABQ_AI_AUTHOR_ID = "bkIhDx7BM8quPu2W1tB6Z"; // "سبق AI" (sabqai@sabq.org)
const SLUG_PREFIX = "wc26";

// صيغ التقاط أخبار المونديال التحريرية (تطابق جزئي غير حساس لحالة الأحرف —
// «كأس العالم» تشمل «كأس العالم 2026» تلقائيًا). تُفحص في العنوان والكلمات
// المفتاحية (SEO) والوسوم فقط، لا في المتن، تجنّبًا للالتقاط العَرَضي.
const WORLD_CUP_NEWS_TERMS = ["مونديال", "كأس العالم"] as const;

// نوافذ العمل — قابلة للضبط بمتغيرات بيئة عند الحاجة
const PREVIEW_WINDOW_MS = 26 * 60 * 60 * 1000; // معاينة لكل مباراة تنطلق خلال 26 ساعة
const REPORT_WINDOW_MS = 12 * 60 * 60 * 1000; // تقرير لكل مباراة انتهت خلال آخر 12 ساعة
const MAX_GENERATIONS_PER_RUN = Number(process.env.WC_NEWS_MAX_PER_RUN || 4);

// أرقام جولات دور المجموعات (المرحلة الأولى من البطولة). تقرير المنتخبات
// العربية يُنتَج لكل جولة منها على حدة بعد اكتمال مباريات العرب فيها.
const GROUP_STAGE_ROUNDS = [1, 2, 3] as const;
const groupStageRoundEn = (n: number) => `Group Stage - ${n}`;

// زمن نضج البيانات بعد آخر انطلاقة في الجولة: مباراة دور المجموعات ٩٠ دقيقة +
// استراحة + بدل ضائع ≈ ساعتان حتى صافرة النهاية، نضيف هامش أمان ليستقر
// المزود (نتائج/أحداث) قبل التجميع. أي ~٤٥ دقيقة بعد صافرة آخر مباراة عربية.
const ARAB_ROUNDUP_MIN_AGE_MS =
  Number(process.env.WC_ARAB_ROUNDUP_MIN_AGE_MIN || 150) * 60 * 1000;

const autoPublish = () => process.env.WC_NEWS_AUTOPUBLISH !== "false";

export type WcArticleKind = "preview" | "report";

const slugFor = (kind: WcArticleKind, fixtureId: number) =>
  `${SLUG_PREFIX}-${kind}-${fixtureId}`;

// slug حتمي لتقرير الجولة (gs1/gs2/gs3) — وجوده يعني أن التقرير أُنتِج
const arabRoundupSlug = (roundNum: number) => `${SLUG_PREFIX}-arab-roundup-gs${roundNum}`;

// ---------- استعلامات قاعدة البيانات (طبقة الخدمة وفق ADR-001) ----------

async function articleExists(slug: string): Promise<boolean> {
  const rows = await db
    .select({ id: articles.id })
    .from(articles)
    .where(or(eq(articles.slug, slug), eq(articles.legacySlug, slug)))
    .limit(1);
  return rows.length > 0;
}

let sportsCategoryId: string | null = null;
async function getSportsCategoryId(): Promise<string> {
  if (sportsCategoryId) return sportsCategoryId;
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, "sports"))
    .limit(1);
  if (!rows[0]) throw new Error("[WC News] sports category not found");
  sportsCategoryId = rows[0].id;
  return sportsCategoryId;
}

// ---------- تجهيز موجز البيانات الحقيقية للبرومبت ----------

const fmtKickoffRiyadh = (iso: string): string =>
  new Date(iso).toLocaleString("ar-SA", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });

function standingsBrief(groups: WcGroup[], fixture: WcFixture): string {
  const lines: string[] = [];
  let groupName = "";
  let allUnplayed = true;
  for (const teamId of [fixture.home.id, fixture.away.id]) {
    const group = groups.find((g) => g.rows.some((r) => r.team.id === teamId));
    const row = group?.rows.find((r) => r.team.id === teamId);
    if (!group || !row) continue;
    groupName = groupName || group.group;
    if (row.played > 0) {
      allUnplayed = false;
      lines.push(
        `- ${row.team.name}: المركز ${row.rank} في ${group.group} برصيد ${row.points} نقطة (لعب ${row.played}، فوز ${row.win}، تعادل ${row.draw}، خسارة ${row.lose}، سجّل ${row.goalsFor} واستقبل ${row.goalsAgainst})`
      );
    }
  }
  // قبل الجولة الأولى الجدول كله أصفار — جملة تأطير واحدة أفضل من حشو
  // "0 نقطة و0 مباريات" المكرر الذي يلوّث المعاينة
  if (allUnplayed) {
    return groupName
      ? `كلا المنتخبين يلعبان في ${groupName}، وهذه أول مباراة لكل منهما في البطولة (لا تذكر أرقام نقاط أو ترتيب — لم تُلعب أي جولة بعد).`
      : "";
  }
  return lines.length ? `ترتيب المجموعات الحالي:\n${lines.join("\n")}` : "";
}

function h2hBrief(detail: WcMatchDetail): string {
  const meetings = detail.headToHead.slice(0, 5);
  if (!meetings.length) return "لا توجد مواجهات سابقة مسجلة بين المنتخبين.";
  const lines = meetings.map((m) => {
    const day = (m.date ?? "").slice(0, 10);
    return `- ${day}: ${m.home.name} ${m.goals.home ?? "-"} × ${m.goals.away ?? "-"} ${m.away.name}`;
  });
  return `آخر المواجهات المباشرة:\n${lines.join("\n")}`;
}

function predictionBrief(detail: WcMatchDetail): string {
  const p = detail.prediction;
  if (!p) return "";
  return `توقعات النموذج الإحصائي للمزود: فوز ${detail.fixture.home.name} ${p.home}%، التعادل ${p.draw}%، فوز ${detail.fixture.away.name} ${p.away}%.`;
}

function eventsBrief(detail: WcMatchDetail): string {
  if (!detail.events.length) return "لا أحداث مسجلة.";
  const lines = detail.events.map((ev) => {
    const minute = ev.extraMinute ? `${ev.minute}+${ev.extraMinute}` : `${ev.minute}`;
    const team =
      ev.teamId === detail.fixture.home.id ? detail.fixture.home.name : detail.fixture.away.name;
    const assist = ev.assist ? ` (صناعة: ${ev.assist})` : "";
    return `- د${minute} [${team}] ${ev.label}: ${ev.player}${assist}`;
  });
  return `وقائع المباراة بالدقائق:\n${lines.join("\n")}`;
}

function statsBrief(detail: WcMatchDetail): string {
  if (!detail.statistics.length) return "";
  const lines = detail.statistics.map(
    (s) => `- ${s.label}: ${detail.fixture.home.name} ${s.home} مقابل ${s.away} ${detail.fixture.away.name}`
  );
  return `إحصائيات المباراة:\n${lines.join("\n")}`;
}

// ---------- حسم النتيجة حتميًا (لا يُترك للنموذج أن يستنتجها) ----------
// حادثة 2026-06-14: نُشر تقرير «سويسرا تهزم قطر بهدف إمبولو» بينما انتهت
// المباراة بالتعادل. الدرس: النتيجة (فوز/تعادل/من الفائز) تُحسب من الأرقام
// هنا، وتُحقن في البرومبت كحقيقة قطعية، ويُفحص العنوان بعد التوليد قبل النشر.

interface WcOutcome {
  kind: "draw" | "home" | "away";
  winnerName: string | null; // null عند التعادل
  loserName: string | null;
  viaPenalties: boolean;
  /** جملة عربية قاطعة تُحقن في البرومبت */
  line: string;
}

function describeOutcome(f: WcFixture): WcOutcome {
  const h = f.goals.home ?? 0;
  const a = f.goals.away ?? 0;
  const ph = f.penalties?.home ?? null;
  const pa = f.penalties?.away ?? null;
  const hasPens = ph != null && pa != null && ph !== pa;

  let kind: "draw" | "home" | "away";
  let viaPenalties = false;
  if (h > a) kind = "home";
  else if (a > h) kind = "away";
  else if (hasPens) {
    kind = (ph as number) > (pa as number) ? "home" : "away";
    viaPenalties = true;
  } else kind = "draw";

  const winnerName = kind === "home" ? f.home.name : kind === "away" ? f.away.name : null;
  const loserName = kind === "home" ? f.away.name : kind === "away" ? f.home.name : null;

  let line: string;
  if (kind === "draw") {
    line = `انتهت المباراة بالتعادل ${h} - ${a} بين ${f.home.name} و${f.away.name}. لا يوجد فائز ولا خاسر — يُمنع منعًا باتًا وصف أي منتخب بأنه «فاز» أو «هزم» أو «تغلّب على» الآخر.`;
  } else if (viaPenalties) {
    const pensFor = kind === "home" ? `${ph} - ${pa}` : `${pa} - ${ph}`;
    line = `انتهى الوقتان الأصلي والإضافي بالتعادل ${h} - ${a}، وحُسمت المباراة بركلات الترجيح لصالح ${winnerName} (${pensFor}). الفائز المتأهل هو ${winnerName} حصرًا، والخاسر ${loserName}.`;
  } else {
    line = `الفائز هو ${winnerName} بنتيجة ${Math.max(h, a)} - ${Math.min(h, a)} على ${loserName}. يُمنع عكس الفائز والخاسر.`;
  }
  return { kind, winnerName, loserName, viaPenalties, line };
}

// ألفاظ الفوز/الهزيمة والتعادل لفحص اتساق العنوان مع النتيجة الحتمية
const WIN_TOKENS = [
  "يفوز", "فوز", "فاز", "تفوز", "يهزم", "هزم", "تهزم", "ينتصر", "انتصار",
  "تنتصر", "يتغلب", "تغلب", "تتغلب", "يكتسح", "اكتسح", "كاسح", "يتخطى",
  "تخطى", "يقهر", "قهر", "يطيح", "ثلاثية", "رباعية",
];
const DRAW_TOKENS = ["تعادل", "التعادل", "يتعادل", "تتعادل", "يتعادلان", "بالتعادل", "تعادلا"];

const containsAny = (text: string, tokens: string[]): boolean =>
  tokens.some((t) => text.includes(t));

/**
 * يفحص أن العنوان (والملخّص) لا يناقض النتيجة الحتمية. يُعيد سبب الحجب نصًّا
 * عند التناقض، أو null إذا كان متّسقًا. متحفّظ عمدًا (دقّة عالية، إنذارات
 * كاذبة قليلة): الحجب يحوّل المادة لمسودة لا يحذفها، فالأسوأ مادة صحيحة
 * تُراجَع يدويًا — أهون من نشر نتيجة مغلوطة.
 */
function detectOutcomeContradiction(
  title: string,
  summary: string,
  outcome: WcOutcome
): string | null {
  const text = `${title} ${summary || ""}`;
  const winClaimed = containsAny(text, WIN_TOKENS);
  const drawClaimed = containsAny(text, DRAW_TOKENS);

  if (outcome.kind === "draw") {
    // الحالة الحرجة (نفس الحادثة): تعادلٌ صُوِّر كفوز
    if (winClaimed && !drawClaimed) return "drew_but_title_claims_a_win";
    return null;
  }
  // مباراة محسومة لكن العنوان يصفها تعادلًا (وليست مُحسومة بالترجيح حيث يَرِد
  // ذكر التعادل مشروعًا)
  if (drawClaimed && !winClaimed && !outcome.viaPenalties) {
    return "decisive_but_title_says_draw";
  }
  return null;
}

/**
 * بوابة «النتيجة نهائية ومستقرة» قبل توليد التقرير. تمنع نشر لقطة غير
 * نهائية: المُشغِّل (جدول getFixtures) ومصدر التقرير (getMatchDetail الطازج)
 * يجب أن يتفقا على النتيجة، وكلاهما «انتهت»، والأهداف غير فارغة.
 */
function isReportDataFinal(trigger: WcFixture, detail: WcMatchDetail): boolean {
  const d = detail.fixture;
  if (!trigger.status.finished || !d.status.finished) return false;
  if (d.goals.home == null || d.goals.away == null) return false;
  if (trigger.goals.home == null || trigger.goals.away == null) return false;
  // الجدول والتفاصيل مصدران بكاشين منفصلين — لو اختلفا فالنتيجة لم تستقر بعد
  if (trigger.goals.home !== d.goals.home || trigger.goals.away !== d.goals.away) return false;
  // مباراة خروج المغلوب لا تنتهي بتعادل: تعادلٌ بلا ركلات ترجيح يعني أن
  // الحالة في طور الانتقال (ستذهب لوقت إضافي/ترجيح) — نؤجّل
  if (d.goals.home === d.goals.away && !/^group/i.test(d.roundEn)) {
    if (d.penalties?.home == null || d.penalties?.away == null) return false;
  }
  return true;
}

// ---------- البرومبتات ----------

const EDITORIAL_RULES = `أنت محرر رياضي محترف في صحيفة "سبق" الإلكترونية السعودية.
قواعد صارمة لا يجوز كسرها:
- استخدم حصريًا الحقائق الواردة في "موجز البيانات" أدناه. يُمنع منعًا باتًا اختراع أي معلومة: لا تصريحات، لا اقتباسات، لا إصابات، لا أخبار انتقالات، لا أرقام غير مذكورة.
- اكتب بالعربية الفصحى الصحفية بأسلوب الهرم المقلوب (الأهم أولًا).
- العنوان من 5 إلى 12 كلمة، جذاب دون مبالغة، ويتضمن اسمي المنتخبين.
- المحتوى HTML فقط بوسوم <p> و<h2> و<ul>/<li>، من 350 إلى 550 كلمة.
- وجّه المادة للقارئ السعودي والخليجي، والتوقيتات بتوقيت الرياض (مكة المكرمة)، لكن لا تفتعل أي زاوية سعودية أو خليجية غير واردة في البيانات.
- لا تذكر أنك ذكاء اصطناعي ولا تشر إلى "موجز البيانات".`;

const JSON_CONTRACT = `أعد الناتج بصيغة JSON صالحة فقط دون أي نص خارجها:
{
  "title": "العنوان",
  "content": "<p>...</p>",
  "summary": "ملخص من جملتين إلى ثلاث",
  "metaDescription": "وصف SEO بين 150 و160 حرفًا",
  "seoKeywords": ["..."],
  "suggestedTags": ["..."]
}`;

function buildPreviewPrompt(detail: WcMatchDetail, groups: WcGroup[]): string {
  const f = detail.fixture;
  return `${EDITORIAL_RULES}

المطلوب: معاينة صحفية (تقرير ما قبل المباراة) لمباراة في كأس العالم 2026.

موجز البيانات (المصدر الوحيد المسموح):
- المباراة: ${f.home.name} × ${f.away.name}
- الدور: ${f.round}
- الملعب: ${f.venue.name}${f.venue.city ? ` — ${f.venue.city}` : ""}
- موعد الانطلاق بتوقيت الرياض: ${fmtKickoffRiyadh(f.date)}
${standingsBrief(groups, f)}
${h2hBrief(detail)}
${predictionBrief(detail)}

ابنِ المعاينة على: أهمية المباراة في سياق الدور والمجموعة، قراءة أرقام المنتخبين من الترتيب، التاريخ المشترك بينهما، ثم توقعات النموذج الإحصائي (انسبها صراحة إلى "النموذج الإحصائي" لا إلى الصحيفة)، واختم بموعد المباراة وملعبها.

${JSON_CONTRACT}`;
}

function buildReportPrompt(detail: WcMatchDetail, outcome: WcOutcome): string {
  const f = detail.fixture;
  const score = `${f.goals.home ?? 0} - ${f.goals.away ?? 0}`;
  const pens = f.penalties
    ? `\n- ركلات الترجيح: ${f.home.name} ${f.penalties.home ?? 0} × ${f.penalties.away ?? 0} ${f.away.name}`
    : "";
  const motm = detail.manOfTheMatch
    ? `\n- أفضل لاعب في المباراة (وفق تقييم المزود): ${detail.manOfTheMatch.name} بتقييم ${detail.manOfTheMatch.rating}`
    : "";
  const titleRule =
    outcome.kind === "draw"
      ? `هذه مباراة انتهت بالتعادل: يجب أن يعكس العنوان والمتن التعادل صراحةً، ويُمنع منعًا باتًا قول إن أيًّا من المنتخبين «فاز» أو «هزم» أو «تغلّب على» الآخر.`
      : `الفائز هو ${outcome.winnerName} والخاسر ${outcome.loserName}؛ يجب أن يطابق العنوان والمتن هذا الاتجاه، ويُمنع عكس الفائز والخاسر.`;
  return `${EDITORIAL_RULES}

المطلوب: تقرير صحفي لنتيجة مباراة انتهت في كأس العالم 2026.

⚠️ نتيجة المباراة القطعية (لا تُخالَف بأي حال): ${outcome.line}

موجز البيانات (المصدر الوحيد المسموح):
- المباراة: ${f.home.name} × ${f.away.name}
- النتيجة النهائية: ${f.home.name} ${score} ${f.away.name}${pens}
- الدور: ${f.round}
- الملعب: ${f.venue.name}${f.venue.city ? ` — ${f.venue.city}` : ""}${motm}
${eventsBrief(detail)}
${statsBrief(detail)}

ابنِ التقرير على: النتيجة ودلالتها في سياق الدور أولًا، ثم سرد الأهداف واللحظات المفصلية بالدقائق من الوقائع، ثم قراءة الإحصائيات (الاستحواذ والتسديد)، وأفضل لاعب إن وُجد.
قاعدة العنوان الحاسمة: ${titleRule}

${JSON_CONTRACT}`;
}

// ---------- التوليد والتخزين ----------

interface GeneratedWcArticle {
  title: string;
  content: string;
  summary: string;
  metaDescription: string;
  seoKeywords: string[];
  suggestedTags: string[];
}

function parseGenerated(raw: string): GeneratedWcArticle {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  const parsed = JSON.parse(jsonStr);
  if (!parsed.title || !parsed.content) {
    throw new Error("[WC News] generated payload missing title/content");
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

// سلسلة محرّر سبق: Anthropic Sonnet أولاً ثم gpt-5.1 عند أي فشل/بتر — نفس
// نمط aiArticleGenerator (iFox). كان كل توليد هنا يضرب gpt-5.1 مباشرةً، ومع
// مادتين لكل مباراة طوال البطولة كان ذلك أثقل بنود استهلاك OpenAI؛ تفضيل
// Anthropic يخفضه بشدة مع إبقاء البديل جاهزًا عند تعثّره.
const WC_MODEL_CHAIN: AIModelConfig[] = [
  { provider: "anthropic", model: SABQ_PRIMARY_EDITOR_MODEL, maxTokens: 8000, temperature: 0.4 },
  { provider: "openai", model: SABQ_FALLBACK_EDITOR_MODEL },
];

async function generateWcArticleText(prompt: string): Promise<AIResponse> {
  let lastError = "";
  for (const config of WC_MODEL_CHAIN) {
    try {
      const attempt = await aiManager.generate(prompt, config);
      if (attempt.error) throw new Error(attempt.error);
      // ارفض المخرجات المبتورة — مادة ناقصة لا تُنشر، انتقل للبديل
      if (attempt.truncated) throw new Error("response truncated (max tokens)");
      return attempt;
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.warn(`[WC News] ${config.provider}/${config.model} failed: ${lastError}`);
    }
  }
  throw new Error(`[WC News] AI generation failed: ${lastError}`);
}

async function generateAndStore(
  kind: WcArticleKind,
  detail: WcMatchDetail
): Promise<{ id: string; published: boolean }> {
  const outcome = kind === "report" ? describeOutcome(detail.fixture) : null;
  const prompt =
    kind === "preview"
      ? buildPreviewPrompt(detail, await safeStandings())
      : buildReportPrompt(detail, outcome!);

  const response = await generateWcArticleText(prompt);
  const generated = parseGenerated(response.content);

  // شبكة الأمان الأخيرة: لو ناقض العنوان النتيجة الحتمية (تعادلٌ صُوِّر فوزًا
  // مثلًا) لا نَنشر — نحفظها مسودة للمراجعة بدل تكرار الإحراج. البيانات هنا
  // نهائية ومتّسقة (مرّت بـ isReportDataFinal)، فالخطأ في الصياغة لا في الرقم.
  let published = autoPublish();
  if (kind === "report" && outcome) {
    const contradiction = detectOutcomeContradiction(generated.title, generated.summary, outcome);
    if (contradiction) {
      published = false;
      console.error(
        `[WC News] 🚨 تناقض النتيجة مع العنوان — حُفظ كمسودة للمراجعة. fixture ${detail.fixture.id} (${detail.fixture.home.name} × ${detail.fixture.away.name})؛ السبب=${contradiction}؛ العنوان="${generated.title}"؛ النتيجة الفعلية: ${outcome.line}`
      );
    }
  }

  return persistArticle(slugFor(kind, detail.fixture.id), generated, published, response);
}

// رابط داخلي ثابت نحو هب المونديال — للقارئ وللزاحف معًا (يصل قوقل عبر
// semanticHtml للمقال في edgeMeta، ويبني إشارة الكلمة المفتاحية للهب)
const HUB_FOOTER =
  '<p>تابع <a href="/world-cup">تغطية كأس العالم 2026 لحظة بلحظة — النتائج وجدول المباريات وترتيب المجموعات</a> على سبق.</p>';

/**
 * حفظ مادة مولّدة في جدول المقالات بنفس إعدادات أخبار المونديال (تصنيف
 * الرياضة، الكاتب «سبق AI»، displayOrder للحداثة). الـ slug يُختَم أيضًا في
 * legacySlug لتثبيت منع التكرار حتى لو غيّر المحرر الـ slug من العنوان.
 */
async function persistArticle(
  slug: string,
  generated: GeneratedWcArticle,
  published: boolean,
  ai: Pick<AIResponse, "provider" | "model">
): Promise<{ id: string; published: boolean }> {
  const now = new Date();
  const created = await storage.createArticle({
    title: generated.title,
    slug,
    legacySlug: slug,
    content: `${generated.content}\n${HUB_FOOTER}`,
    excerpt: (generated.summary || generated.metaDescription).substring(0, 200),
    aiSummary: generated.summary,
    locale: "ar",
    categoryId: await getSportsCategoryId(),
    authorId: SABQ_AI_AUTHOR_ID,
    articleType: "news",
    newsType: "regular",
    publishType: "instant",
    status: published ? "published" : "draft",
    publishedAt: published ? now : undefined,
    // أخبار المونديال تُعرض كخبر رياضي عادي في كل الواجهات (القسم الرياضي،
    // الرئيسية، قسم المونديال). علم aiGenerated=true يستبعدها من كل القوائم
    // العامة (الكروسيل، آخر الأخبار، اختيارات المحرر، التحليلات) إلا بتمييز
    // محرر، فكانت تظهر ساعات في حزام المونديال المحدود ثم تُدفَن. الإفصاح عن
    // أنها مولّدة يبقى عبر الكاتب «سبق AI» وseoMetadata.generatedBy أدناه.
    aiGenerated: false,
    // صفحة القسم (getArticles) واختيارات المحرر ترتّب بـ displayOrder تنازليًا
    // أولًا، فالخبر غير المختوم (displayOrder=0) يغرق تحت آلاف المقالات
    // المميّزة قديمًا ولا يصل قائمة الـ50. نختمه بثوانٍ يونكس للنشر — نفس
    // مقياس المختومين تحريريًا — ليتداخل معهم بالحداثة (نمط GREATEST نفسه).
    displayOrder: published ? Math.floor(now.getTime() / 1000) : 0,
    seo: {
      metaTitle: generated.title,
      metaDescription: generated.metaDescription,
      keywords: generated.seoKeywords,
    },
    seoMetadata: {
      status: "generated",
      generatedAt: now.toISOString(),
      generatedBy: "system",
      provider: ai.provider,
      model: ai.model,
    },
    sourceMetadata: { type: "manual" },
  } as any); // authorId/aiGenerated خارج insertArticleSchema — نفس نمط iFox

  return { id: created.id, published };
}

async function safeStandings(): Promise<WcGroup[]> {
  try {
    return await getStandings();
  } catch {
    return []; // الترتيب رفاهية في المعاينة — لا يُفشل التوليد
  }
}

// ---------- تقرير المنتخبات العربية بعد كل جولة ----------
// يجمع نتائج كل المنتخبات العربية في جولة دور مجموعات واحدة في مادة تحليلية
// واحدة، تُنشر بعد اكتمال آخر مباراة عربية في الجولة واستقرار البيانات.

interface ArabMatchSummary {
  fixture: WcFixture;
  detail: WcMatchDetail | null;
}

/** الأهداف فقط من وقائع المباراة — موجز مختصر يكفي تقرير الجولة */
function goalsBrief(detail: WcMatchDetail): string {
  const goals = detail.events.filter((ev) => ev.type === "goal");
  if (!goals.length) return "";
  const lines = goals.map((ev) => {
    const minute = ev.extraMinute ? `${ev.minute}+${ev.extraMinute}` : `${ev.minute}`;
    const team =
      ev.teamId === detail.fixture.home.id ? detail.fixture.home.name : detail.fixture.away.name;
    return `د${minute} ${ev.player} (${team})`;
  });
  return `الأهداف: ${lines.join("، ")}`;
}

/** موقع المنتخبات العربية في مجموعاتها بعد الجولة (من جدول الترتيب الرسمي) */
function arabStandingsBrief(arabTeamIds: Set<number>, groups: WcGroup[]): string {
  const lines: string[] = [];
  for (const group of groups) {
    for (const row of group.rows) {
      if (!arabTeamIds.has(row.team.id)) continue;
      const diff = `${row.goalsDiff >= 0 ? "+" : ""}${row.goalsDiff}`;
      lines.push(
        `- ${row.team.name}: المركز ${row.rank} في ${group.group} برصيد ${row.points} نقطة (لعب ${row.played}، فوز ${row.win}، تعادل ${row.draw}، خسارة ${row.lose}، فارق الأهداف ${diff})`
      );
    }
  }
  return lines.length
    ? `ترتيب المنتخبات العربية في مجموعاتها بعد هذه الجولة:\n${lines.join("\n")}`
    : "";
}

function buildArabRoundupPrompt(
  roundLabel: string,
  matches: ArabMatchSummary[],
  groups: WcGroup[]
): string {
  const arabIds = new Set<number>();
  for (const { fixture } of matches) {
    if (isArabTeam(fixture.home.id)) arabIds.add(fixture.home.id);
    if (isArabTeam(fixture.away.id)) arabIds.add(fixture.away.id);
  }

  const blocks = matches
    .map(({ fixture, detail }) => {
      const outcome = describeOutcome(fixture);
      const goals = detail ? goalsBrief(detail) : "";
      const motm = detail?.manOfTheMatch
        ? `أفضل لاعب: ${detail.manOfTheMatch.name} (تقييم ${detail.manOfTheMatch.rating})`
        : "";
      return [
        `• ${fixture.home.name} ${fixture.goals.home ?? 0} - ${fixture.goals.away ?? 0} ${fixture.away.name}`,
        `  ${outcome.line}`,
        goals && `  ${goals}`,
        motm && `  ${motm}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return `${EDITORIAL_RULES}

المطلوب: تقرير فني تحليلي شامل لأداء المنتخبات العربية في ${roundLabel} من كأس العالم 2026، يجمع نتائج كل المنتخبات العربية في هذه الجولة في مادة واحدة.

تجاوز قاعدتي العنوان وعدد الكلمات أعلاه لهذه المادة تحديدًا: العنوان يعبّر عن حصاد المنتخبات العربية في الجولة (لا يلزم ذكر اسمي منتخبين)، وطول المتن من 600 إلى 900 كلمة لاتساع التغطية.

موجز البيانات (المصدر الوحيد المسموح):
نتائج مباريات المنتخبات العربية في ${roundLabel}:
${blocks}

${arabStandingsBrief(arabIds, groups)}

ابنِ التقرير على هذا الترتيب: مقدمة تلخّص حصاد المنتخبات العربية في الجولة (عدد المنتخبات، كم فاز/تعادل/خسر، وأبرز مفاجأة أو إنجاز)، ثم فقرة مستقلة (<h2>) لكل منتخب عربي تسرد مباراته ونتيجتها وأبرز لحظاتها وموقعه في مجموعته، ثم خاتمة تستشرف حظوظ التأهل اعتمادًا على الأرقام فقط.
قواعد حاسمة: التزم بالنتائج القطعية أعلاه حرفيًا (لا تعكس فائزًا أو خاسرًا، ولا تصف تعادلًا كفوز ولا فوزًا كتعادل). لا تقارن بأرقام جولات لم تَرِد في الموجز.

${JSON_CONTRACT}`;
}

async function generateArabRoundup(
  roundNum: number,
  roundLabel: string,
  arabFixtures: WcFixture[]
): Promise<{ id: string; published: boolean }> {
  // تفاصيل كل مباراة عربية (خلف كاش SWR) لإثراء الأهداف وأفضل لاعب — تتدهور
  // بأمان إلى الموجز المبني على النتيجة وحدها إن تعذّر جلب التفاصيل
  const matches: ArabMatchSummary[] = [];
  for (const fixture of arabFixtures) {
    const detail = await getMatchDetail(fixture.id).catch(() => null);
    matches.push({ fixture, detail });
  }

  const prompt = buildArabRoundupPrompt(roundLabel, matches, await safeStandings());
  const response = await generateWcArticleText(prompt);
  const generated = parseGenerated(response.content);

  return persistArticle(arabRoundupSlug(roundNum), generated, autoPublish(), response);
}

// ---------- دورة العمل التي يستدعيها الـ cron ----------

export interface WcNewsRunSummary {
  previews: number;
  reports: number;
  arabRoundups: number;
  skipped: number;
  errors: number;
}

export async function runWorldCupNewsCycle(): Promise<WcNewsRunSummary> {
  const summary: WcNewsRunSummary = { previews: 0, reports: 0, arabRoundups: 0, skipped: 0, errors: 0 };
  // إن قاربت مباراةٌ النهاية (وربما انتهت لتوّها والكاش لم يُحدَّث بعد)، أعد
  // جلب الجداول طازجةً (تجاوز كاش 30ث) لالتقاط لحظة FT فورًا بدل انتظار انتهاء
  // الكاش — يقلّص تأخّر تقرير ما بعد المباراة دون المساس ببوّابة نهائية النتيجة.
  let fixtures = await getFixtures();
  const now = Date.now();
  if (fixtures.some((f) => f.status.live && (f.status.elapsed ?? 0) >= 85)) {
    fixtures = await getFixtures({ forceFresh: true });
  }

  const candidates: { kind: WcArticleKind; fixture: WcFixture }[] = [];

  for (const f of fixtures) {
    const kickoff = f.timestamp * 1000;
    if (!f.status.finished && !f.status.live && kickoff > now && kickoff - now <= PREVIEW_WINDOW_MS) {
      candidates.push({ kind: "preview", fixture: f });
    }
    if (f.status.finished && now - kickoff <= REPORT_WINDOW_MS + 3 * 60 * 60 * 1000) {
      candidates.push({ kind: "report", fixture: f });
    }
  }

  // التقارير أولًا — الخبر الأهم تحريريًا بعد صافرة النهاية
  candidates.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "report" ? -1 : 1));

  let generated = 0;
  for (const { kind, fixture } of candidates) {
    if (generated >= MAX_GENERATIONS_PER_RUN) break;
    const slug = slugFor(kind, fixture.id);
    try {
      if (await articleExists(slug)) {
        summary.skipped++;
        continue;
      }
      // التقرير يتجاوز كاش SWR (forceFresh) كي لا يُبنى على لقطة حيّة قديمة
      // سُجّلت قبل هدف التعادل الأخير — جذر حادثة نشر مباراة متعادلة كأنها فوز.
      const detail = await getMatchDetail(fixture.id, { forceFresh: kind === "report" });
      if (!detail) {
        summary.skipped++;
        continue;
      }
      // بوابة «النتيجة نهائية ومستقرة»: لو لم يتفق الجدول مع التفاصيل الطازجة،
      // أو لم تكتمل النتيجة بعد، نؤجّل للدقيقة القادمة بدل نشر نتيجة غير نهائية.
      if (kind === "report" && !isReportDataFinal(fixture, detail)) {
        console.warn(
          `[WC News] ⏸️ تأجيل تقرير fixture ${fixture.id} — النتيجة لم تستقر/تتطابق بعد (الجدول ${fixture.goals.home}-${fixture.goals.away}/${fixture.status.code}، التفاصيل ${detail.fixture.goals.home}-${detail.fixture.goals.away}/${detail.fixture.status.code})`
        );
        summary.skipped++;
        continue;
      }
      const { id: articleId, published } = await generateAndStore(kind, detail);
      generated++;
      if (kind === "preview") summary.previews++;
      else summary.reports++;
      console.log(
        `[WC News] ✅ ${kind} ${published ? "نُشر" : "مسودة (محجوب للمراجعة)"} for fixture ${fixture.id} (${fixture.home.name} × ${fixture.away.name}) → article ${articleId}`
      );
    } catch (error) {
      summary.errors++;
      console.error(`[WC News] ❌ ${kind} failed for fixture ${fixture.id}:`, error);
    }
  }

  // تقرير المنتخبات العربية لكل جولة دور مجموعات اكتملت مبارياتها العربية.
  // البوابة: كل مباريات العرب في الجولة «انتهت» + مضى زمن نضج البيانات على
  // آخر انطلاقة (≈٤٥ دقيقة بعد صافرة آخر مباراة عربية). منع التكرار بالـ slug.
  for (const roundNum of GROUP_STAGE_ROUNDS) {
    if (generated >= MAX_GENERATIONS_PER_RUN) break;
    const slug = arabRoundupSlug(roundNum);
    try {
      if (await articleExists(slug)) {
        summary.skipped++;
        continue;
      }
      const roundEn = groupStageRoundEn(roundNum);
      const arabFixtures = fixtures.filter(
        (f) => f.roundEn === roundEn && (isArabTeam(f.home.id) || isArabTeam(f.away.id))
      );
      if (!arabFixtures.length) continue; // لا منتخبات عربية في هذه الجولة أو لم تُجدوَل بعد

      const allFinished = arabFixtures.every((f) => f.status.finished);
      const latestKickoff = Math.max(...arabFixtures.map((f) => f.timestamp * 1000));
      if (!allFinished || now - latestKickoff < ARAB_ROUNDUP_MIN_AGE_MS) {
        summary.skipped++;
        continue;
      }

      const { id, published } = await generateArabRoundup(roundNum, arabFixtures[0].round, arabFixtures);
      generated++;
      summary.arabRoundups++;
      console.log(
        `[WC News] ✅ تقرير المنتخبات العربية (${arabFixtures[0].round}) ${published ? "نُشر" : "مسودة (محجوب للمراجعة)"} → article ${id} (${arabFixtures.length} مباراة)`
      );
    } catch (error) {
      summary.errors++;
      console.error(`[WC News] ❌ arab-roundup gs${roundNum} failed:`, error);
    }
  }

  return summary;
}

// ---------- قراءة الأخبار المولّدة لواجهة البلوك ----------

export interface WcNewsItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  imageUrl: string | null;
  /** نقطة تركيز الصورة (نسبة 0-100) ليطبّقها العرض كـ object-position */
  imageFocalPoint: { x: number; y: number } | null;
  publishedAt: string | null;
  /** preview/report = مولّدة من بيانات مباراة؛ news = مادة تحريرية عادية عن المونديال */
  kind: WcArticleKind | "news";
  fixtureId: number | null;
  home: { name: string; logo: string } | null;
  away: { name: string; logo: string } | null;
}

const SLUG_RE = new RegExp(`^${SLUG_PREFIX}-(preview|report)-(\\d+)$`);

// خبر تحريري يُعدّ «مونديالياً» إذا ظهرت أي صيغة من WORLD_CUP_NEWS_TERMS في
// العنوان، أو ضمن الكلمات المفتاحية (seo.keywords)، أو في أحد وسومه المرتبطة
// (الاسم العربي/الإنجليزي/الـ slug). التطابق جزئي وغير حساس لحالة الأحرف.
function worldCupKeywordPredicate() {
  return or(
    ...WORLD_CUP_NEWS_TERMS.map((term) => {
      const pat = `%${term}%`;
      return or(
        ilike(articles.title, pat),
        sql`(${articles.seo} -> 'keywords')::text ILIKE ${pat}`,
        sql`EXISTS (
          SELECT 1 FROM ${articleTags} AS atg
          JOIN ${tags} AS tg ON tg.id = atg.tag_id
          WHERE atg.article_id = ${articles.id}
            AND (tg.name_ar ILIKE ${pat} OR tg.name_en ILIKE ${pat} OR tg.slug ILIKE ${pat})
        )`
      );
    })
  );
}

export async function getWorldCupNews(limit: number): Promise<WcNewsItem[]> {
  const capped = Math.min(Math.max(limit, 1), 12);

  // مواد غرفة الأخبار اليدوية عن المونديال تُلتقط من قسم الرياضة عبر صيغ
  // الكلمات في العنوان أو الكلمات المفتاحية (SEO) أو الوسوم المرتبطة —
  // لا اعتماد على فهرسة search_vector (عمود إنتاج يدوي خارج drizzle)
  const sportsId = await getSportsCategoryId().catch(() => null);
  const manualWorldCupNews = sportsId
    ? and(
        eq(articles.categoryId, sportsId),
        worldCupKeywordPredicate(),
        notIlike(articles.title, "%للأندية%") // كأس العالم للأندية بطولة أخرى
      )
    : undefined;

  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      legacySlug: articles.legacySlug,
      excerpt: articles.excerpt,
      imageUrl: articles.imageUrl,
      imageFocalPoint: articles.imageFocalPoint,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .where(
      and(
        eq(articles.status, "published"),
        or(
          like(articles.slug, `${SLUG_PREFIX}-%`),
          like(articles.legacySlug, `${SLUG_PREFIX}-%`),
          manualWorldCupNews
        )
      )
    )
    .orderBy(desc(articles.publishedAt))
    .limit(capped);

  // إثراء بشعارات المنتخبين من كاش المباريات — بلا أي نداء إضافي للمزود
  let fixtures: WcFixture[] = [];
  try {
    fixtures = await getFixtures();
  } catch {
    // الشعارات تحسين اختياري — الأخبار تُعرض بدونها
  }
  const byId = new Map(fixtures.map((f) => [f.id, f]));

  return rows.map((row) => {
    // الـ slug قد يتغير تحريريًا بعد النشر — legacySlug يحفظ النمط الحتمي
    const match = SLUG_RE.exec(row.slug) ?? (row.legacySlug ? SLUG_RE.exec(row.legacySlug) : null);
    const fixtureId = match ? Number(match[2]) : null;
    const fixture = fixtureId != null ? byId.get(fixtureId) : undefined;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt ?? null,
      imageUrl: row.imageUrl ?? null,
      imageFocalPoint:
        row.imageFocalPoint && typeof row.imageFocalPoint.x === "number" && typeof row.imageFocalPoint.y === "number"
          ? { x: row.imageFocalPoint.x, y: row.imageFocalPoint.y }
          : null,
      publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
      kind: (match?.[1] as WcArticleKind | undefined) ?? "news",
      fixtureId,
      home: fixture ? { name: fixture.home.name, logo: fixture.home.logo } : null,
      away: fixture ? { name: fixture.away.name, logo: fixture.away.logo } : null,
    };
  });
}
