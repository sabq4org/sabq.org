/**
 * مولّد أخبار «كأس خادم الحرمين الشريفين» — يحوّل بيانات API-Football الحقيقية
 * (league 504 عبر kingsCupService) إلى مواد صحفية عربية: معاينة قبل المباراة
 * وتقرير بعدها. البطولة إقصائية بالكامل (لا دور مجموعات ولا تقرير جولة عربية).
 *
 * القاعدة الذهبية نفسها كأخبار المونديال: النموذج لا يخترع أي معلومة — كل
 * الحقائق (نتائج، أحداث، إحصائيات، ترجيحات) تُحقن في البرومبت من المزوّد،
 * ودوره الصياغة الصحفية فقط.
 *
 * منع التكرار عبر slug حتمي: kc-preview-{fixtureId} / kc-report-{fixtureId}
 * (يُختم أيضًا في legacySlug تحسّبًا لتغيير المحرر للـ slug من العنوان).
 */
import { eq, or } from "drizzle-orm";
import { db } from "../db";
import { articles, categories } from "@shared/schema";
import { storage } from "../storage";
import { aiManager, type AIModelConfig, type AIResponse } from "../ai-manager";
import { SABQ_PRIMARY_EDITOR_MODEL, SABQ_FALLBACK_EDITOR_MODEL } from "../ai/sabqEditorialPrompt";
import {
  getKcFixtures,
  getKcMatchDetail,
  getKcFixturePrediction,
} from "./kingsCupService";
import type { SplFixture, SplMatchDetail } from "./saudiLeagueService";

const SABQ_AI_AUTHOR_ID = "bkIhDx7BM8quPu2W1tB6Z"; // "سبق AI" (sabqai@sabq.org)
const SLUG_PREFIX = "kc";

const PREVIEW_WINDOW_MS = 26 * 60 * 60 * 1000; // معاينة لكل مباراة تنطلق خلال 26 ساعة
const REPORT_WINDOW_MS = 12 * 60 * 60 * 1000; // تقرير لكل مباراة انتهت خلال آخر 12 ساعة
const MAX_GENERATIONS_PER_RUN = Number(process.env.KC_NEWS_MAX_PER_RUN || 3);
const autoPublish = () => process.env.KC_NEWS_AUTOPUBLISH !== "false";

export type KcArticleKind = "preview" | "report";

const slugFor = (kind: KcArticleKind, fixtureId: number) =>
  `${SLUG_PREFIX}-${kind}-${fixtureId}`;

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
  if (!rows[0]) throw new Error("[KC News] sports category not found");
  sportsCategoryId = rows[0].id;
  return sportsCategoryId;
}

// ---------- موجزات البيانات الحقيقية للبرومبت ----------

const fmtKickoffRiyadh = (iso: string): string =>
  new Date(iso).toLocaleString("ar-SA", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });

async function predictionBrief(fixtureId: number, f: SplFixture): Promise<string> {
  const p = await getKcFixturePrediction(fixtureId).catch(() => null);
  if (!p) return "";
  const parts = [
    `توقعات النموذج الإحصائي للمزود: فوز ${f.home.name} ${p.homePct}%، التعادل ${p.drawPct}%، فوز ${f.away.name} ${p.awayPct}%.`,
  ];
  if (p.advice) parts.push(`توصية المزوّد: ${p.advice}`);
  return parts.join(" ");
}

function eventsBrief(detail: SplMatchDetail): string {
  if (!detail.events.length) return "لا أحداث مسجلة.";
  const lines = detail.events.map((ev) => {
    const minute = ev.extra ? `${ev.minute}+${ev.extra}` : `${ev.minute}`;
    const team = ev.teamId === detail.fixture.home.id ? detail.fixture.home.name : detail.fixture.away.name;
    if (ev.type === "substitution") {
      const inName = ev.player || "—";
      const outPart = ev.assist ? ` بدلًا من ${ev.assist} (خروج ${ev.assist}، دخول ${inName})` : "";
      return `- د${minute} [${team}] تبديل: دخول ${inName}${outPart}`;
    }
    const assist = ev.assist ? ` (صناعة: ${ev.assist})` : "";
    return `- د${minute} [${team}] ${ev.label}: ${ev.player}${assist}`;
  });
  return `وقائع المباراة بالدقائق:\n${lines.join("\n")}`;
}

function statsBrief(detail: SplMatchDetail): string {
  if (!detail.statistics || !detail.statistics.rows.length) return "";
  const lines = detail.statistics.rows.map(
    (s) => `- ${s.label}: ${detail.fixture.home.name} ${s.home ?? 0} مقابل ${s.away ?? 0} ${detail.fixture.away.name}`,
  );
  return `إحصائيات المباراة:\n${lines.join("\n")}`;
}

// ---------- حسم النتيجة حتميًا ----------

interface KcOutcome {
  kind: "draw" | "home" | "away";
  winnerName: string | null;
  loserName: string | null;
  viaPenalties: boolean;
  line: string;
}

function describeOutcome(f: SplFixture): KcOutcome {
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
    line = `انتهت المباراة بالتعادل ${h} - ${a} بين ${f.home.name} و${f.away.name}. لا يوجد فائز ولا خاسر — يُمنع منعًا باتًا وصف أي فريق بأنه «فاز» أو «هزم» أو «تغلّب على» الآخر.`;
  } else if (viaPenalties) {
    const pensFor = kind === "home" ? `${ph} - ${pa}` : `${pa} - ${ph}`;
    line = `انتهى الوقتان الأصلي والإضافي بالتعادل ${h} - ${a}، وحُسمت المباراة بركلات الترجيح لصالح ${winnerName} (${pensFor}). الفائز المتأهل هو ${winnerName} حصرًا، والخاسر ${loserName}.`;
  } else {
    line = `الفائز هو ${winnerName} بنتيجة ${Math.max(h, a)} - ${Math.min(h, a)} على ${loserName}. يُمنع عكس الفائز والخاسر.`;
  }
  return { kind, winnerName, loserName, viaPenalties, line };
}

const WIN_TOKENS = [
  "يفوز", "فوز", "فاز", "تفوز", "يهزم", "هزم", "تهزم", "ينتصر", "انتصار",
  "تنتصر", "يتغلب", "تغلب", "تتغلب", "يكتسح", "اكتسح", "كاسح", "يتخطى",
  "تخطى", "يقهر", "قهر", "يطيح", "ثلاثية", "رباعية",
];
const DRAW_TOKENS = ["تعادل", "التعادل", "يتعادل", "تتعادل", "يتعادلان", "بالتعادل", "تعادلا"];
const containsAny = (text: string, tokens: string[]): boolean => tokens.some((t) => text.includes(t));

function detectOutcomeContradiction(title: string, summary: string, outcome: KcOutcome): string | null {
  const text = `${title} ${summary || ""}`;
  const winClaimed = containsAny(text, WIN_TOKENS);
  const drawClaimed = containsAny(text, DRAW_TOKENS);
  if (outcome.kind === "draw") {
    if (winClaimed && !drawClaimed) return "drew_but_title_claims_a_win";
    return null;
  }
  if (drawClaimed && !winClaimed && !outcome.viaPenalties) return "decisive_but_title_says_draw";
  return null;
}

/** النتيجة نهائية ومستقرة قبل توليد التقرير. */
function isReportDataFinal(trigger: SplFixture, detail: SplMatchDetail): boolean {
  const d = detail.fixture;
  if (!trigger.status.finished || !d.status.finished) return false;
  if (d.goals.home == null || d.goals.away == null) return false;
  if (trigger.goals.home == null || trigger.goals.away == null) return false;
  if (trigger.goals.home !== d.goals.home || trigger.goals.away !== d.goals.away) return false;
  // مباراة خروج المغلوب لا تنتهي بتعادل بلا ترجيح — الحالة في طور الانتقال
  if (d.goals.home === d.goals.away) {
    if (d.penalties?.home == null || d.penalties?.away == null) return false;
  }
  return true;
}

// ---------- البرومبتات ----------

const EDITORIAL_RULES = `أنت محرر رياضي محترف في صحيفة "سبق" الإلكترونية السعودية.
قواعد صارمة لا يجوز كسرها:
- استخدم حصريًا الحقائق الواردة في "موجز البيانات" أدناه. يُمنع منعًا باتًا اختراع أي معلومة: لا تصريحات، لا اقتباسات، لا إصابات، لا أخبار انتقالات، لا أرقام غير مذكورة.
- اكتب بالعربية الفصحى الصحفية بأسلوب الهرم المقلوب (الأهم أولًا).
- العنوان من 5 إلى 12 كلمة، جذاب دون مبالغة، ويتضمن اسمي الفريقين.
- المحتوى HTML فقط بوسوم <p> و<h2> و<ul>/<li>، من 350 إلى 550 كلمة.
- وجّه المادة للقارئ السعودي، والتوقيتات بتوقيت الرياض، والبطولة هي كأس خادم الحرمين الشريفين (كأس الملك).
- انقل أسماء اللاعبين والفرق حرفيًا كما وردت في الموجز دون أي تغيير أو تصحيح؛ ومن سجّل هدفًا أو دخل/خرج في تبديل هو حصرًا من نسبه إليه الموجز — يُمنع عكس الفاعل أو اتجاه التبديل (الداخل/الخارج).
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

async function buildPreviewPrompt(detail: SplMatchDetail): Promise<string> {
  const f = detail.fixture;
  const prediction = await predictionBrief(f.id, f);
  return `${EDITORIAL_RULES}

المطلوب: معاينة صحفية (تقرير ما قبل المباراة) لمباراة في كأس خادم الحرمين الشريفين.

موجز البيانات (المصدر الوحيد المسموح):
- المباراة: ${f.home.name} × ${f.away.name}
- الدور: ${f.round}
- الملعب: ${f.venue.name}${f.venue.city ? ` — ${f.venue.city}` : ""}
- موعد الانطلاق بتوقيت الرياض: ${fmtKickoffRiyadh(f.date)}
${prediction}

ابنِ المعاينة على: أهمية المباراة في سياق الدور الإقصائي، ثم توقعات النموذج الإحصائي (انسبها صراحة إلى "النموذج الإحصائي" لا إلى الصحيفة)، واختم بموعد المباراة وملعبها. لا تخترع مواجهات سابقة أو أرقامًا غير واردة.

${JSON_CONTRACT}`;
}

function buildReportPrompt(detail: SplMatchDetail, outcome: KcOutcome): string {
  const f = detail.fixture;
  const score = `${f.goals.home ?? 0} - ${f.goals.away ?? 0}`;
  const pens = f.penalties && f.penalties.home != null && f.penalties.away != null
    ? `\n- ركلات الترجيح: ${f.home.name} ${f.penalties.home} × ${f.penalties.away} ${f.away.name}`
    : "";
  const titleRule =
    outcome.kind === "draw"
      ? `هذه مباراة انتهت بالتعادل: يجب أن يعكس العنوان والمتن التعادل صراحةً، ويُمنع منعًا باتًا قول إن أيًّا من الفريقين «فاز» أو «هزم» الآخر.`
      : `الفائز هو ${outcome.winnerName} والخاسر ${outcome.loserName}؛ يجب أن يطابق العنوان والمتن هذا الاتجاه، ويُمنع عكس الفائز والخاسر.`;
  return `${EDITORIAL_RULES}

المطلوب: تقرير صحفي لنتيجة مباراة انتهت في كأس خادم الحرمين الشريفين.

⚠️ نتيجة المباراة القطعية (لا تُخالَف بأي حال): ${outcome.line}

موجز البيانات (المصدر الوحيد المسموح):
- المباراة: ${f.home.name} × ${f.away.name}
- النتيجة النهائية: ${f.home.name} ${score} ${f.away.name}${pens}
- الدور: ${f.round}
- الملعب: ${f.venue.name}${f.venue.city ? ` — ${f.venue.city}` : ""}
${eventsBrief(detail)}
${statsBrief(detail)}

ابنِ التقرير على: النتيجة ودلالتها في سياق الدور الإقصائي أولًا، ثم سرد الأهداف واللحظات المفصلية بالدقائق من الوقائع، ثم قراءة الإحصائيات.
قاعدة العنوان الحاسمة: ${titleRule}

${JSON_CONTRACT}`;
}

// ---------- التوليد والتخزين ----------

interface GeneratedKcArticle {
  title: string;
  content: string;
  summary: string;
  metaDescription: string;
  seoKeywords: string[];
  suggestedTags: string[];
}

function parseGenerated(raw: string): GeneratedKcArticle {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  const parsed = JSON.parse(jsonStr);
  if (!parsed.title || !parsed.content) {
    throw new Error("[KC News] generated payload missing title/content");
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

const KC_MODEL_CHAIN: AIModelConfig[] = [
  { provider: "anthropic", model: SABQ_PRIMARY_EDITOR_MODEL, maxTokens: 8000, temperature: 0.4 },
  { provider: "openai", model: SABQ_FALLBACK_EDITOR_MODEL },
];

async function generateArticleText(prompt: string): Promise<AIResponse> {
  let lastError = "";
  for (const config of KC_MODEL_CHAIN) {
    try {
      const attempt = await aiManager.generate(prompt, config);
      if (attempt.error) throw new Error(attempt.error);
      if (attempt.truncated) throw new Error("response truncated (max tokens)");
      return attempt;
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.warn(`[KC News] ${config.provider}/${config.model} failed: ${lastError}`);
    }
  }
  throw new Error(`[KC News] AI generation failed: ${lastError}`);
}

const HUB_FOOTER =
  '<p>تابع <a href="/kings-cup">تغطية كأس خادم الحرمين الشريفين لحظة بلحظة — النتائج وجدول المباريات والأدوار الإقصائية</a> على سبق.</p>';

async function persistArticle(
  slug: string,
  generated: GeneratedKcArticle,
  published: boolean,
  ai: Pick<AIResponse, "provider" | "model">,
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
    aiGenerated: false,
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
  } as any);

  return { id: created.id, published };
}

async function generateAndStore(
  kind: KcArticleKind,
  detail: SplMatchDetail,
): Promise<{ id: string; published: boolean }> {
  const outcome = kind === "report" ? describeOutcome(detail.fixture) : null;
  const prompt = kind === "preview" ? await buildPreviewPrompt(detail) : buildReportPrompt(detail, outcome!);

  const response = await generateArticleText(prompt);
  const generated = parseGenerated(response.content);

  let published = autoPublish();
  if (kind === "report" && outcome) {
    const contradiction = detectOutcomeContradiction(generated.title, generated.summary, outcome);
    if (contradiction) {
      published = false;
      console.error(
        `[KC News] 🚨 تناقض النتيجة مع العنوان — حُفظ كمسودة. fixture ${detail.fixture.id}؛ السبب=${contradiction}؛ العنوان="${generated.title}"؛ النتيجة: ${outcome.line}`,
      );
    }
  }

  return persistArticle(slugFor(kind, detail.fixture.id), generated, published, response);
}

// ---------- دورة العمل التي يستدعيها الـ cron ----------

export interface KcNewsRunSummary {
  previews: number;
  reports: number;
  skipped: number;
  errors: number;
}

export async function runKingsCupNewsCycle(): Promise<KcNewsRunSummary> {
  const summary: KcNewsRunSummary = { previews: 0, reports: 0, skipped: 0, errors: 0 };
  const fixtures = await getKcFixtures();
  const now = Date.now();

  const candidates: { kind: KcArticleKind; fixture: SplFixture }[] = [];
  for (const f of fixtures) {
    const kickoff = f.timestamp * 1000;
    if (!f.status.finished && !f.status.live && kickoff > now && kickoff - now <= PREVIEW_WINDOW_MS) {
      candidates.push({ kind: "preview", fixture: f });
    }
    if (f.status.finished && now - f.timestamp * 1000 <= REPORT_WINDOW_MS + 3 * 60 * 60 * 1000) {
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
      const detail = await getKcMatchDetail(fixture.id);
      if (!detail) {
        summary.skipped++;
        continue;
      }
      if (kind === "report" && !isReportDataFinal(fixture, detail)) {
        summary.skipped++;
        continue;
      }
      const { id, published } = await generateAndStore(kind, detail);
      generated++;
      if (kind === "preview") summary.previews++;
      else summary.reports++;
      console.log(
        `[KC News] ✅ ${kind} ${published ? "نُشر" : "مسودة"} for fixture ${fixture.id} (${fixture.home.name} × ${fixture.away.name}) → article ${id}`,
      );
    } catch (error) {
      summary.errors++;
      console.error(`[KC News] ❌ ${kind} failed for fixture ${fixture.id}:`, error);
    }
  }

  return summary;
}
