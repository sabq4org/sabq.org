/**
 * مولّد مسودة خبر «إنفاق الأسبوع» من حمولة أرقام الأسبوع.
 *
 * المبدأ: النموذج يصوغ ولا يخترع. يتلقّى الحمولة المحسوبة (عناوين + وقائع) ويكتب
 * المتن بأسلوب سبق، ثم يمرّ الناتج بحارس يطابق كل رقم في النص مع الحمولة؛ أي رقم غريب
 * يُسقط المسودة (لا يُنشر خبر مشوّه). المسودة تُحفظ بحالة draft لاعتماد المحرر.
 *
 * التفعيل: ECONOMY_AUTO_DRAFTS=true. الكاتب: «سبق AI» (نفس نمط أخبار الرياضة).
 */
import { aiManager, type AIResponse } from "../../ai-manager";
import { db } from "../../db";
import { categories } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../../storage";
import { SABQ_FALLBACK_EDITOR_MODEL, SABQ_PRIMARY_EDITOR_MODEL } from "../../ai/sabqEditorialPrompt";
import type { WeeklySpendingStory } from "./weeklyStory";
import { attachReportArticle } from "./economyStore";

const SABQ_AI_AUTHOR_ID = "bkIhDx7BM8quPu2W1tB6Z"; // «سبق AI»
const FEATURE = "economy-weekly-news";

export function isEconomyAutoDraftsEnabled(): boolean {
  return process.env.ECONOMY_AUTO_DRAFTS === "true";
}

let economyCategoryId: string | null = null;
async function getEconomyCategoryId(): Promise<string> {
  if (economyCategoryId) return economyCategoryId;
  for (const slug of ["economy", "business"]) {
    const rows = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
    if (rows[0]) { economyCategoryId = rows[0].id; return rows[0].id; }
  }
  throw new Error("[Economy News] economy category not found");
}

/** الأرقام المسموح ظهورها في النص: كل رقم في الحمولة بصيغه الشائعة. */
export function allowedNumberTokens(story: WeeklySpendingStory): Set<string> {
  const set = new Set<string>();
  const add = (n: number) => {
    if (!Number.isFinite(n)) return;
    const abs = Math.abs(n);
    for (const v of [abs, abs / 1e6, abs / 1e9, abs / 1e3]) {
      for (const d of [0, 1, 2]) set.add(Number(v.toFixed(d)).toString());
    }
  };
  const walk = (o: unknown) => {
    if (typeof o === "number") add(o);
    else if (typeof o === "string") for (const m of o.match(/\d[\d,]*\.?\d*/g) ?? []) add(Number(m.replace(/,/g, "")));
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") Object.values(o).forEach(walk);
  };
  walk({ kpis: story.kpis, stories: story.stories, lead: story.lead, week: story.weekLabelAr, totals: story.totals, share: story.citiesShareTop, risers: story.risers, fallers: story.fallers });
  // السنة والتواريخ
  for (const m of `${story.periodStart} ${story.periodEnd}`.match(/\d+/g) ?? []) set.add(String(Number(m)));
  return set;
}

/** يرجع الأرقام الغريبة عن الحمولة (فارغ = النص سليم). */
export function findForeignNumbers(text: string, allowed: Set<string>): string[] {
  const foreign: string[] = [];
  const clean = text.replace(/<[^>]+>/g, " ");
  for (const m of clean.match(/\d[\d,]*\.?\d*/g) ?? []) {
    const n = Number(m.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const candidates = [n, Number(n.toFixed(1)), Number(n.toFixed(0))].map(String);
    if (!candidates.some((c) => allowed.has(c))) foreign.push(m);
  }
  return Array.from(new Set(foreign));
}

interface GeneratedDraft {
  title: string;
  subtitle: string;
  content: string;
  summary: string;
  metaDescription: string;
  keywords: string[];
}

function buildPrompt(story: WeeklySpendingStory): string {
  const facts = story.stories.map((s, i) => `${i + 1}. ${s.headline} — ${s.detailAr}`).join("\n");
  const kpis = story.kpis.map((k) => `- ${k.labelAr}: ${k.key === "total" ? `${story.totals.value.toLocaleString("en-US")} ريال` : k.key === "count" ? `${story.totals.count.toLocaleString("en-US")} عملية` : k.key === "avgTicket" ? `${k.value.toFixed(1)} ريال` : `${k.value.toFixed(1)}%`}${k.changePct !== null ? ` (تغير ${k.changePct.toFixed(1)}%)` : ""}`).join("\n");
  const top = story.sectors.filter((s) => !s.isGroup).sort((a, b) => b.value - a.value).slice(0, 5).map((s) => `${s.ar}: ${s.value.toLocaleString("en-US")} ريال (${s.changePct}%)`).join("؛ ");
  const cities = story.citiesShareTop.map((c) => `${c.ar} ${c.share.toFixed(1)}%`).join("، ");
  return `أنت محرر اقتصادي في صحيفة «سبق» الإلكترونية. اكتب خبرًا صحفيًا عربيًا فصيحًا بأسلوب سبق (جمل قصيرة، معلومة في كل فقرة، بلا حشو ولا رأي) عن تقرير البنك المركزي السعودي لعمليات نقاط البيع للأسبوع ${story.weekLabelAr}.

القاعدة الحاكمة: لا تكتب أي رقم غير موجود في البيانات أدناه، ولا تحسب نسبًا جديدة، ولا تقرّب بطريقة تغيّر الرقم. انسخ الأرقام كما هي. ممنوع الجداول.

العنوان الرئيسي المقترح (يمكنك تحسينه صياغةً دون تغيير أرقامه): ${story.lead.headline}
العنوان الفرعي: ${story.lead.subheadline}
المقدمة الجاهزة: ${story.lead.intro}

المؤشرات:
${kpis}

أرقام الأسبوع (استخدم أقواها في المتن):
${facts}

أكبر القطاعات: ${top}
حصص المدن الكبرى: ${cities}

أخرج JSON فقط بهذه المفاتيح:
{"title": "عنوان رنان ≤ 70 حرفًا فيه رقم", "subtitle": "عنوان فرعي", "content": "المتن بصيغة HTML من 4–6 فقرات <p> تُختم بفقرة: <p>المصدر: البنك المركزي السعودي — تقرير عمليات نقاط البيع الأسبوعي.</p>", "summary": "موجز ≤ 200 حرف", "metaDescription": "≤ 155 حرفًا", "keywords": ["...", "..."]}`;
}

async function generateWithFallback(prompt: string): Promise<AIResponse> {
  const chain = [
    { provider: "anthropic", model: SABQ_PRIMARY_EDITOR_MODEL, maxTokens: 3000, temperature: 0.3, feature: FEATURE },
    { provider: "openai", model: SABQ_FALLBACK_EDITOR_MODEL, maxTokens: 3000, temperature: 0.3, feature: FEATURE },
  ] as const;
  let lastError = "";
  for (const config of chain) {
    try {
      return await aiManager.generate(prompt, { ...config });
    } catch (e) {
      lastError = (e as Error).message;
      console.warn(`[Economy News] ${config.provider}/${config.model} failed: ${lastError}`);
    }
  }
  throw new Error(`[Economy News] AI generation failed: ${lastError}`);
}

function parseDraft(raw: string): GeneratedDraft {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("[Economy News] no JSON in response");
  const j = JSON.parse(m[0]) as Partial<GeneratedDraft>;
  if (!j.title || !j.content) throw new Error("[Economy News] missing title/content");
  return {
    title: j.title.trim(),
    subtitle: (j.subtitle ?? "").trim(),
    content: j.content.trim(),
    summary: (j.summary ?? "").trim(),
    metaDescription: (j.metaDescription ?? j.summary ?? "").trim().slice(0, 155),
    keywords: Array.isArray(j.keywords) ? j.keywords.map(String).slice(0, 8) : ["الاقتصاد السعودي", "نقاط البيع", "البنك المركزي السعودي"],
  };
}

export interface DraftResult {
  articleId: string;
  title: string;
  rejected?: string[];
}

/**
 * يولّد مسودة الخبر ويحفظها. يرجع null إن رفض الحارس الناتج (أرقام غريبة) بعد محاولتين.
 */
export async function createWeeklySpendingDraft(story: WeeklySpendingStory, reportId: string): Promise<DraftResult | null> {
  const allowed = allowedNumberTokens(story);
  const slug = `economy-pos-week-${story.periodEnd}`;
  let rejected: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const ai = await generateWithFallback(buildPrompt(story) + (attempt ? `\n\nملاحظة: محاولتك السابقة احتوت أرقامًا غير موجودة في البيانات (${rejected.join("، ")}). أعد الكتابة دونها.` : ""));
    const draft = parseDraft(ai.content);
    rejected = findForeignNumbers(`${draft.title}\n${draft.subtitle}\n${draft.content}\n${draft.summary}`, allowed);
    if (rejected.length) { console.warn(`[Economy News] guard rejected numbers: ${rejected.join(", ")}`); continue; }

    const now = new Date();
    const created = await storage.createArticle({
      title: draft.title,
      subtitle: draft.subtitle || undefined,
      slug,
      legacySlug: slug,
      content: draft.content,
      excerpt: (draft.summary || draft.metaDescription).slice(0, 200),
      aiSummary: draft.summary,
      locale: "ar",
      categoryId: await getEconomyCategoryId(),
      authorId: SABQ_AI_AUTHOR_ID,
      articleType: "news",
      newsType: "regular",
      publishType: "instant",
      status: "draft",
      aiGenerated: false,
      displayOrder: 0,
      seo: { metaTitle: draft.title, metaDescription: draft.metaDescription, keywords: draft.keywords },
      seoMetadata: { status: "generated", generatedAt: now.toISOString(), generatedBy: "system", provider: ai.provider, model: ai.model },
      sourceMetadata: { type: "manual", note: "economy:pos_weekly", reportId },
    } as never) as { id: string };
    await attachReportArticle(reportId, created.id);
    console.log(`[Economy News] draft ${created.id}: ${draft.title}`);
    return { articleId: created.id, title: draft.title };
  }
  return null;
}
