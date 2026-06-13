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
import { aiManager } from "../ai-manager";
import {
  getFixtures,
  getMatchDetail,
  getStandings,
  type WcFixture,
  type WcGroup,
  type WcMatchDetail,
} from "./worldCupService";

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

const autoPublish = () => process.env.WC_NEWS_AUTOPUBLISH !== "false";

export type WcArticleKind = "preview" | "report";

const slugFor = (kind: WcArticleKind, fixtureId: number) =>
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

function buildReportPrompt(detail: WcMatchDetail): string {
  const f = detail.fixture;
  const score = `${f.goals.home ?? 0} - ${f.goals.away ?? 0}`;
  const pens = f.penalties
    ? `\n- ركلات الترجيح: ${f.home.name} ${f.penalties.home ?? 0} × ${f.penalties.away ?? 0} ${f.away.name}`
    : "";
  const motm = detail.manOfTheMatch
    ? `\n- أفضل لاعب في المباراة (وفق تقييم المزود): ${detail.manOfTheMatch.name} بتقييم ${detail.manOfTheMatch.rating}`
    : "";
  return `${EDITORIAL_RULES}

المطلوب: تقرير صحفي لنتيجة مباراة انتهت في كأس العالم 2026.

موجز البيانات (المصدر الوحيد المسموح):
- المباراة: ${f.home.name} × ${f.away.name}
- النتيجة النهائية: ${f.home.name} ${score} ${f.away.name}${pens}
- الدور: ${f.round}
- الملعب: ${f.venue.name}${f.venue.city ? ` — ${f.venue.city}` : ""}${motm}
${eventsBrief(detail)}
${statsBrief(detail)}

ابنِ التقرير على: النتيجة ودلالتها في سياق الدور أولًا، ثم سرد الأهداف واللحظات المفصلية بالدقائق من الوقائع، ثم قراءة الإحصائيات (الاستحواذ والتسديد)، وأفضل لاعب إن وُجد.

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

async function generateAndStore(kind: WcArticleKind, detail: WcMatchDetail): Promise<string> {
  const prompt = kind === "preview" ? buildPreviewPrompt(detail, await safeStandings()) : buildReportPrompt(detail);

  const response = await aiManager.generate(prompt, { provider: "openai", model: "gpt-5.1" });
  if (response.error) throw new Error(`[WC News] AI generation failed: ${response.error}`);
  const generated = parseGenerated(response.content);

  // رابط داخلي ثابت نحو هب المونديال — للقارئ وللزاحف معًا (يصل قوقل عبر
  // semanticHtml للمقال في edgeMeta، ويبني إشارة الكلمة المفتاحية للهب)
  const hubFooter =
    '<p>تابع <a href="/world-cup">تغطية كأس العالم 2026 لحظة بلحظة — النتائج وجدول المباريات وترتيب المجموعات</a> على سبق.</p>';

  const now = new Date();
  const published = autoPublish();
  const created = await storage.createArticle({
    title: generated.title,
    slug: slugFor(kind, detail.fixture.id),
    // مفتاح منع التكرار المحصّن — يبقى ثابتًا حتى لو أعاد المحرر توليد الـ slug
    legacySlug: slugFor(kind, detail.fixture.id),
    content: `${generated.content}\n${hubFooter}`,
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
      provider: "openai",
      model: "gpt-5.1",
    },
    sourceMetadata: { type: "manual" },
  } as any); // authorId/aiGenerated خارج insertArticleSchema — نفس نمط iFox

  return created.id;
}

async function safeStandings(): Promise<WcGroup[]> {
  try {
    return await getStandings();
  } catch {
    return []; // الترتيب رفاهية في المعاينة — لا يُفشل التوليد
  }
}

// ---------- دورة العمل التي يستدعيها الـ cron ----------

export interface WcNewsRunSummary {
  previews: number;
  reports: number;
  skipped: number;
  errors: number;
}

export async function runWorldCupNewsCycle(): Promise<WcNewsRunSummary> {
  const summary: WcNewsRunSummary = { previews: 0, reports: 0, skipped: 0, errors: 0 };
  const fixtures = await getFixtures();
  const now = Date.now();

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
      const detail = await getMatchDetail(fixture.id);
      if (!detail) {
        summary.skipped++;
        continue;
      }
      const articleId = await generateAndStore(kind, detail);
      generated++;
      if (kind === "preview") summary.previews++;
      else summary.reports++;
      console.log(
        `[WC News] ✅ ${kind} for fixture ${fixture.id} (${fixture.home.name} × ${fixture.away.name}) → article ${articleId}`
      );
    } catch (error) {
      summary.errors++;
      console.error(`[WC News] ❌ ${kind} failed for fixture ${fixture.id}:`, error);
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
      publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
      kind: (match?.[1] as WcArticleKind | undefined) ?? "news",
      fixtureId,
      home: fixture ? { name: fixture.home.name, logo: fixture.home.logo } : null,
      away: fixture ? { name: fixture.away.name, logo: fixture.away.logo } : null,
    };
  });
}
