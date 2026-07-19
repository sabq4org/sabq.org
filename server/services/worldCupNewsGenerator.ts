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
  getTopScorers,
  getTeamsRanked,
  type WcFixture,
  type WcGroup,
  type WcMatchDetail,
  type WcMatchEvent,
  type WcScorer,
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
    // التبديل: ev.player = الداخل، ev.assist = الخارج (عُرف API-Football، نفس
    // ما يعرضه مركز المباراة: «player بديلًا عن assist»). الصياغة العامة
    // «{ev.label}: {player} (صناعة: {assist})» كانت تسمّي الخارج «صناعة» فيختلط
    // الاتجاه على النموذج فيعكس الاسمين. نُصرّح بالاتجاه هنا فيستحيل العكس.
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

// ---------- بوابة اتساق اتجاه التبديل (داخل/خارج) ----------
// حادثة 2026-06-27: التقرير عكس اسمي تبديل (نسب الدخول للخارج والعكس). الموجز
// صار يصرّح بالاتجاه، وهذه شبكة أمان أخيرة: لو ناقض المتنُ الاتجاهَ القطعي
// (ev.player=الداخل، ev.assist=الخارج) حُجبت المادة كمسودة بدل نشر العكس.
// متحفّظة عمدًا (دقّة عالية): تطابق اسمي اللاعبين مع رابط/فعل اتجاهي صريح فقط.

/** تطبيع عربي خفيف للمطابقة: إزالة الوسوم والتشكيل والتطويل وتوحيد الألف/الياء/التاء. */
function normalizeAr(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

// روابط «بدلًا من» حصرًا: عُرفها ثابت (الداخل يسبق، الخارج يتلو — «دخل س بدلًا
// من ع»)، فظهور الخارج قبله والداخل بعده = عكس صريح. تُستبعد «محله/مكانه» لأن
// عُرفها معاكس (الخارج أولًا) وكثيرًا ما يليها ضميرٌ لا اسمٌ — مصدر إنذار كاذب.
const SUB_REPLACE_CONNECTORS = ["بدلا من", "بديلا عن", "بدلا عن"];
// أفعال الدخول/الخروج لالتقاط العكس حين لا يُستخدم رابط استبدال
const SUB_ENTRY_VERBS = ["دخول", "دخل", "ادخل", "نزل", "اشرك", "اشراك", "اقحم"];
const SUB_EXIT_VERBS = ["خروج", "خرج", "استبدال", "استبدل"];

/**
 * عكس اتجاهي عند فعل: يُنذر فقط إن كان `wrongName` هو الاسم **الأقرب** للفعل
 * (أي فاعله) دون أن يسبقه `rightName`. هذا يميّز «دخل [الخارج]» المعكوس عن
 * «دخل [الداخل] بدلًا من [الخارج]» الصحيح (حيث الداخل أقرب للفعل) فلا يُنذر زورًا.
 */
function verbAttributesTo(
  text: string,
  verbs: string[],
  wrongName: string,
  rightName: string,
  window: number
): boolean {
  for (const verb of verbs) {
    let from = 0;
    for (;;) {
      const vi = text.indexOf(verb, from);
      if (vi < 0) break;
      const seg = text.slice(vi + verb.length, vi + verb.length + window);
      const pWrong = seg.indexOf(wrongName);
      const pRight = seg.indexOf(rightName);
      if (pWrong >= 0 && (pRight < 0 || pWrong < pRight)) return true;
      from = vi + verb.length;
    }
  }
  return false;
}

/** عكس الرابط: الخارج يسبق «بدلًا من» والداخل يتلوه ضمن نافذة قصيرة. */
function reversedConnector(
  text: string,
  inName: string,
  outName: string,
  window: number
): boolean {
  for (const conn of SUB_REPLACE_CONNECTORS) {
    let from = 0;
    for (;;) {
      const ci = text.indexOf(conn, from);
      if (ci < 0) break;
      const before = text.slice(Math.max(0, ci - window), ci);
      const after = text.slice(ci + conn.length, ci + conn.length + window);
      if (before.includes(outName) && after.includes(inName)) return true;
      from = ci + conn.length;
    }
  }
  return false;
}

/**
 * يفحص أن متن التقرير لا يعكس اتجاه أي تبديل. يُعيد سبب الحجب نصًّا عند العكس،
 * أو null إن خلا منه. يتطلّب اسمين متمايزين موجودين في المتن مع إشارة اتجاهية
 * صريحة معكوسة — فالأسوأ مادة صحيحة تُراجَع يدويًا.
 */
function detectSubstitutionReversal(contentHtml: string, events: WcMatchEvent[]): string | null {
  const subs = events.filter(
    (e): e is WcMatchEvent & { assist: string } =>
      e.type === "substitution" &&
      !!e.player &&
      !!e.assist &&
      normalizeAr(e.player) !== normalizeAr(e.assist)
  );
  if (!subs.length) return null;

  const text = normalizeAr(contentHtml);
  // لاعب قد يَدخل في تبديل ويَخرج في آخر — لا نُنذر على فعل اتجاهي مشروع له
  const allIn = new Set(subs.map((s) => normalizeAr(s.player)));
  const allOut = new Set(subs.map((s) => normalizeAr(s.assist)));

  for (const s of subs) {
    const inName = normalizeAr(s.player);
    const outName = normalizeAr(s.assist);
    if (!text.includes(inName) || !text.includes(outName)) continue;

    // (أ) رابط «بدلًا من» معكوس: «الخارج بدلًا من الداخل»
    if (reversedConnector(text, inName, outName, 40)) {
      return `sub_reversed_connector@${s.minute}`;
    }
    // (ب) فعل دخول ينسب الدخول للخارج (والخارج ليس داخلًا في تبديل آخر)
    if (!allIn.has(outName) && verbAttributesTo(text, SUB_ENTRY_VERBS, outName, inName, 40)) {
      return `sub_out_described_entering@${s.minute}`;
    }
    // (ج) فعل خروج ينسب الخروج للداخل (والداخل ليس خارجًا في تبديل آخر)
    if (!allOut.has(inName) && verbAttributesTo(text, SUB_EXIT_VERBS, inName, outName, 40)) {
      return `sub_in_described_leaving@${s.minute}`;
    }
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
- انقل أسماء اللاعبين والمنتخبين حرفيًا كما وردت في الموجز دون أي تغيير أو تصحيح أو تخمين لاسم أول؛ ومن صنع هدفًا أو سجّله أو دخل/خرج في تبديل هو حصرًا من نسبه إليه الموجز — يُمنع منعًا باتًا عكس الفاعل أو تبديل اسمين، خصوصًا اتجاه التبديل (الداخل/الخارج).
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
  { provider: "anthropic", model: SABQ_PRIMARY_EDITOR_MODEL, maxTokens: 8000, temperature: 0.4, feature: "world-cup-news" },
  { provider: "openai", model: SABQ_FALLBACK_EDITOR_MODEL, feature: "world-cup-news" },
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
    // بوابة اتجاه التبديل: عكس الداخل/الخارج في المتن يحجب النشر للمراجعة
    const subReversal = detectSubstitutionReversal(generated.content, detail.events);
    if (subReversal) {
      published = false;
      console.error(
        `[WC News] 🚨 عكس اتجاه تبديل في متن التقرير — حُفظ كمسودة للمراجعة. fixture ${detail.fixture.id} (${detail.fixture.home.name} × ${detail.fixture.away.name})؛ السبب=${subReversal}`
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

// ---------- تقرير حصاد البطولة بالأرقام عند اكتمال كل دور إقصائي ----------
// مادة استقصائية بيانية تراكمية: من المباراة الافتتاحية حتى آخر مباراة في
// الدور المكتمل للتو (ربع النهائي → نصف النهائي → النهائي). كل المجاميع
// (معدلات التهديف، الريمونتادات، أسرع هدف، الانضباط، مقارنة منتخبات الدور)
// تُحسب هنا بالكود من بيانات المزود وتُحقن في البرومبت أرقامًا جاهزة —
// النموذج يصوغ فقط ولا يحسب. النشر بعد WC_STAGE_REPORT_DELAY_MIN (افتراضيًا
// 15 دقيقة) من رصد اكتمال الدور: يستقر المزود، وتسبق تقاريرُ المباريات
// الفردية الحصادَ الشامل تحريريًا.

interface WcStageDef {
  key: string;
  roundEn: string;
  label: string;
  /** ترتيب الدور — لتحديد المباريات التراكمية المشمولة في الحصاد */
  order: number;
}

const KNOCKOUT_REPORT_STAGES: WcStageDef[] = [
  { key: "qf", roundEn: "Quarter-finals", label: "ربع النهائي", order: 3 },
  { key: "sf", roundEn: "Semi-finals", label: "نصف النهائي", order: 4 },
  { key: "final", roundEn: "Final", label: "النهائي", order: 5 },
];

const WC_ROUND_ORDER: Record<string, number> = {
  "Group Stage - 1": 0,
  "Group Stage - 2": 0,
  "Group Stage - 3": 0,
  "Round of 32": 1,
  "Round of 16": 2,
  "Quarter-finals": 3,
  "Semi-finals": 4,
  "3rd Place Final": 5,
  Final: 5,
};

const stageReportSlug = (stageKey: string) => `${SLUG_PREFIX}-stage-data-${stageKey}`;

const STAGE_REPORT_DELAY_MS =
  Number(process.env.WC_STAGE_REPORT_DELAY_MIN || 15) * 60 * 1000;
// دور اكتمل قبل أكثر من يومين = حصاد بائت لا يُنشر (يحمي من توليد تقارير
// أدوار مضت عند تفعيل الميزة/إعادة التشغيل متأخرًا)
const STAGE_REPORT_MAX_AGE_MS = 48 * 60 * 60 * 1000;

// أول لحظة رصدنا فيها اكتمال الدور — منها يُحسب تأخير الربع ساعة. إعادة تشغيل
// الـ pod تصفّر العدّاد فينتظر التقرير ربع ساعة أخرى: تأخير مقبول ولا تكرار
// (منع التكرار الفعلي بالـ slug الحتمي).
const stageCompletionSeenAt = new Map<string, number>();

/**
 * أحداث الأهداف الحقيقية للمباراة: المزود يرسل ركلات الترجيح كأهداف عند
 * الدقيقة 120، فنقصّ الفائض عن النتيجة الرسمية من نهاية القائمة.
 */
function realGoalEvents(f: WcFixture, events: WcMatchEvent[]): WcMatchEvent[] {
  const goals = events
    .filter((e) => e.type === "goal" && e.detail !== "Missed Penalty")
    .sort(
      (a, b) =>
        a.minute + (a.extraMinute ?? 0) / 100 - (b.minute + (b.extraMinute ?? 0) / 100)
    );
  const official = (f.goals.home ?? 0) + (f.goals.away ?? 0);
  while (goals.length > official && goals[goals.length - 1].minute >= 120) goals.pop();
  return goals;
}

/** لمن يُحسب الهدف — نفس منطق creditedWcGoalCounts (الهدف العكسي للخصم) */
function goalCreditsHome(f: WcFixture, e: WcMatchEvent): boolean {
  const scoredByHome = e.teamId === f.home.id;
  const ownGoal = e.detail === "Own Goal" || e.label.includes("عكسي");
  return ownGoal ? !scoredByHome : scoredByHome;
}

const wcMinuteLabel = (e: WcMatchEvent) =>
  e.extraMinute ? `${e.minute}+${e.extraMinute}` : `${e.minute}`;

/**
 * يبني موجز الأرقام المحسوبة للحصاد التراكمي حتى نهاية الدور المكتمل.
 * كل سطر هنا حقيقة جاهزة — البرومبت يمنع النموذج من أي حساب أو استنتاج رقمي.
 */
function buildStageDataBrief(
  stage: WcStageDef,
  cumulative: WcFixture[],
  detailById: Map<number, WcMatchDetail>,
  scorers: WcScorer[],
  fifaRankById: Map<number, number>
): string {
  const L: string[] = [];

  // إجماليات ومعدلات كل مرحلة
  const stageBuckets: { label: string; test: (f: WcFixture) => boolean }[] = [
    { label: "دور المجموعات", test: (f) => /^Group/i.test(f.roundEn) },
    { label: "دور الـ32", test: (f) => f.roundEn === "Round of 32" },
    { label: "دور الـ16", test: (f) => f.roundEn === "Round of 16" },
    { label: "ربع النهائي", test: (f) => f.roundEn === "Quarter-finals" },
    { label: "نصف النهائي", test: (f) => f.roundEn === "Semi-finals" },
    { label: "النهائي والبرونزية", test: (f) => f.roundEn === "Final" || f.roundEn === "3rd Place Final" },
  ];
  const totalGoals = cumulative.reduce(
    (s, f) => s + (f.goals.home ?? 0) + (f.goals.away ?? 0),
    0
  );
  L.push(
    `إجماليات البطولة حتى نهاية ${stage.label}: ${cumulative.length} مباراة، ${totalGoals} هدفًا، بمعدل ${(totalGoals / Math.max(1, cumulative.length)).toFixed(2)} هدف للمباراة.`
  );
  for (const b of stageBuckets) {
    const ms = cumulative.filter(b.test);
    if (!ms.length) continue;
    const g = ms.reduce((s, f) => s + (f.goals.home ?? 0) + (f.goals.away ?? 0), 0);
    L.push(`- ${b.label}: ${ms.length} مباراة، ${g} هدفًا (معدل ${(g / ms.length).toFixed(2)}).`);
  }

  const etMatches = cumulative.filter((f) => f.status.code === "AET" || f.status.code === "PEN");
  const penMatches = cumulative.filter((f) => f.status.code === "PEN");
  L.push(
    `مباريات حُسمت بعد وقت إضافي: ${etMatches.length} (منها ${penMatches.length} بركلات الترجيح).`
  );

  // تفاصيل الأحداث المجمّعة
  let yellow = 0;
  let red = 0;
  let pensScored = 0;
  let ownGoals = 0;
  const periods = { first: 0, second: 0, extra: 0, late: 0 };
  const redLines: string[] = [];
  const teamCards = new Map<number, { y: number; r: number }>();
  let fastest: { f: WcFixture; e: WcMatchEvent } | null = null;
  const comebacks: string[] = [];

  for (const f of cumulative) {
    const d = detailById.get(f.id);
    if (!d) continue;
    const wentToExtra = f.status.code === "AET" || f.status.code === "PEN";
    const goals = realGoalEvents(f, d.events);
    for (const e of goals) {
      if (e.detail === "Penalty") pensScored++;
      if (e.detail === "Own Goal") ownGoals++;
      if (e.minute > 90 && wentToExtra) periods.extra++;
      else if (e.minute <= 45) periods.first++;
      else periods.second++;
      if (e.minute >= 90 && (e.minute === 90 || !wentToExtra)) periods.late++;
      if (!fastest || e.minute < fastest.e.minute) fastest = { f, e };
    }
    for (const e of d.events) {
      const cards = teamCards.get(e.teamId) ?? { y: 0, r: 0 };
      if (e.type === "yellow-card") {
        yellow++;
        cards.y++;
      } else if (e.type === "red-card") {
        red++;
        cards.r++;
        const side = e.teamId === f.home.id ? f.home.name : f.away.name;
        redLines.push(
          `${e.player} (${side}) د${wcMinuteLabel(e)} في ${f.home.name} × ${f.away.name} (${f.round})`
        );
      }
      teamCards.set(e.teamId, cards);
    }
    // ريمونتادا: الفائز كان متأخرًا في لحظة ما من عمر المباراة
    // (describeOutcome يحسم مباريات الترجيح إلى home/away فلا تبقى "draw")
    const outcome = describeOutcome(f);
    if (outcome.kind !== "draw") {
      const winnerIsHome = outcome.kind === "home";
      let h = 0;
      let a = 0;
      let trailed = false;
      for (const e of goals) {
        goalCreditsHome(f, e) ? h++ : a++;
        if (winnerIsHome ? h < a : a < h) trailed = true;
      }
      if (trailed) {
        const winnerName = winnerIsHome ? f.home.name : f.away.name;
        const pens = f.penalties ? ` (ترجيح ${f.penalties.home}-${f.penalties.away})` : "";
        comebacks.push(
          `${winnerName} عاد من التأخر وفاز: ${f.home.name} ${f.goals.home}-${f.goals.away} ${f.away.name}${pens} — ${f.round}`
        );
      }
    }
  }

  L.push(
    `أهداف الجزاء خلال اللعب: ${pensScored}. الأهداف العكسية: ${ownGoals}.`,
    `توزيع الأهداف: الشوط الأول ${periods.first}، الشوط الثاني مع بدل ضائعه ${periods.second}، الأشواط الإضافية ${periods.extra}. أهداف قاتلة من الدقيقة 90 فصاعدًا في الوقت الأصلي: ${periods.late}.`,
    `الانضباط: ${yellow} بطاقة صفراء و${red} حمراء.`
  );
  if (fastest) {
    const scorerTeam =
      fastest.e.teamId === fastest.f.home.id ? fastest.f.home.name : fastest.f.away.name;
    L.push(
      `أسرع هدف: ${fastest.e.player} (${scorerTeam}) في الدقيقة ${wcMinuteLabel(fastest.e)} بمباراة ${fastest.f.home.name} × ${fastest.f.away.name}.`
    );
  }

  const byDiff = [...cumulative].sort(
    (x, y) =>
      Math.abs((y.goals.home ?? 0) - (y.goals.away ?? 0)) -
      Math.abs((x.goals.home ?? 0) - (x.goals.away ?? 0))
  )[0];
  const byTotal = [...cumulative].sort(
    (x, y) =>
      (y.goals.home ?? 0) + (y.goals.away ?? 0) - ((x.goals.home ?? 0) + (x.goals.away ?? 0))
  )[0];
  if (byDiff)
    L.push(`أكبر فوز: ${byDiff.home.name} ${byDiff.goals.home}-${byDiff.goals.away} ${byDiff.away.name} (${byDiff.round}).`);
  if (byTotal)
    L.push(
      `أغزر مباراة تهديفًا: ${byTotal.home.name} ${byTotal.goals.home}-${byTotal.goals.away} ${byTotal.away.name} (${byTotal.round}).`
    );

  if (comebacks.length) L.push(`الريمونتادات (فوز بعد تأخر):\n${comebacks.map((c) => `- ${c}`).join("\n")}`);
  if (redLines.length) L.push(`البطاقات الحمراء:\n${redLines.map((c) => `- ${c}`).join("\n")}`);

  // هجوم ودفاع: الشباك النظيفة وأقل استقبالًا (من نتائج المباريات مباشرة)
  const teamAgg = new Map<
    number,
    { name: string; played: number; scored: number; conceded: number; clean: number }
  >();
  for (const f of cumulative) {
    for (const side of ["home", "away"] as const) {
      const t = f[side];
      const forGoals = (side === "home" ? f.goals.home : f.goals.away) ?? 0;
      const against = (side === "home" ? f.goals.away : f.goals.home) ?? 0;
      const agg = teamAgg.get(t.id) ?? { name: t.name, played: 0, scored: 0, conceded: 0, clean: 0 };
      agg.played++;
      agg.scored += forGoals;
      agg.conceded += against;
      if (against === 0) agg.clean++;
      teamAgg.set(t.id, agg);
    }
  }
  const attack = [...teamAgg.values()].sort((x, y) => y.scored - x.scored).slice(0, 5);
  const defense = [...teamAgg.values()]
    .filter((t) => t.played >= 4)
    .sort((x, y) => x.conceded - y.conceded || y.clean - x.clean)
    .slice(0, 5);
  L.push(
    `أقوى الهجوم: ${attack.map((t) => `${t.name} (${t.scored} في ${t.played} مباريات)`).join("، ")}.`,
    `أقوى الدفاع (4 مباريات فأكثر): ${defense.map((t) => `${t.name} (استقبل ${t.conceded}، شباك نظيفة ${t.clean})`).join("، ")}.`
  );

  // نتائج مباريات الدور المكتمل نفسه
  const stageFixtures = cumulative.filter((f) => f.roundEn === stage.roundEn);
  L.push(
    `نتائج ${stage.label}:\n` +
      stageFixtures
        .map((f) => {
          const pens = f.penalties ? ` (ترجيح ${f.penalties.home}-${f.penalties.away})` : "";
          const note = f.status.code === "AET" ? " بعد وقت إضافي" : "";
          return `- ${f.home.name} ${f.goals.home}-${f.goals.away} ${f.away.name}${pens}${note}`;
        })
        .join("\n")
  );

  // مقارنة منتخبات الدور المكتمل (مجمّعة من إحصائيات كل مبارياتهم في البطولة)
  const stageTeamIds = new Set<number>();
  for (const f of stageFixtures) {
    stageTeamIds.add(f.home.id);
    stageTeamIds.add(f.away.id);
  }
  const statNum = (v: string | undefined) => Number.parseFloat(String(v ?? "").replace("%", "")) || 0;
  const compareLines: string[] = [];
  for (const id of stageTeamIds) {
    const poss: number[] = [];
    const pass: number[] = [];
    let shotsOn = 0;
    let name = "";
    for (const f of cumulative) {
      const side = f.home.id === id ? "home" : f.away.id === id ? "away" : null;
      if (!side) continue;
      name = f[side].name;
      const d = detailById.get(f.id);
      if (!d?.statistics?.length) continue;
      const of = (key: string) => d.statistics.find((s) => s.key === key)?.[side];
      const p = of("Ball Possession");
      const acc = of("Passes %");
      if (p) poss.push(statNum(p));
      if (acc) pass.push(statNum(acc));
      shotsOn += statNum(of("Shots on Goal"));
    }
    const avg = (xs: number[]) =>
      xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : "غير متوفر";
    const agg = teamAgg.get(id);
    const cards = teamCards.get(id) ?? { y: 0, r: 0 };
    const rank = fifaRankById.get(id);
    compareLines.push(
      `- ${name}${rank ? ` (تصنيف FIFA: ${rank})` : ""}: سجّل ${agg?.scored ?? 0} واستقبل ${agg?.conceded ?? 0}، استحواذ متوسط ${avg(poss)}%، دقة تمرير ${avg(pass)}%، ${shotsOn} تسديدة على المرمى، بطاقات ${cards.y} صفراء/${cards.r} حمراء.`
    );
  }
  if (compareLines.length)
    L.push(`مقارنة منتخبات ${stage.label} (أرقامهم التراكمية في البطولة كلها):\n${compareLines.join("\n")}`);

  // الهدّافون
  if (scorers.length) {
    L.push(
      `ترتيب الهدّافين:\n` +
        scorers
          .slice(0, 10)
          .map(
            (s) =>
              `- ${s.name} (${s.team.name}): ${s.goals} أهداف (${s.penalties} من جزاء) و${s.assists} صناعة في ${s.matches} مباريات`
          )
          .join("\n")
    );
  }

  return L.join("\n");
}

function buildStageReportPrompt(stage: WcStageDef, dataBrief: string): string {
  return `${EDITORIAL_RULES}

المطلوب: تقرير استقصائي بيانات شامل — «حصاد كأس العالم 2026 بالأرقام» — يغطي البطولة من المباراة الافتتاحية حتى نهاية ${stage.label} الذي اكتمل للتو.

تجاوز قاعدتي العنوان وعدد الكلمات أعلاه لهذه المادة تحديدًا: العنوان يعبّر عن حصاد البطولة بالأرقام حتى ${stage.label} ويتضمن رقمًا لافتًا (لا يلزم ذكر اسمي منتخبين)، وطول المتن من 800 إلى 1100 كلمة.

قاعدة حاسمة إضافية: كل الأرقام في «موجز البيانات» محسوبة آليًّا ونهائية — انقلها كما هي حرفيًّا، ويُمنع منعًا باتًا جمع أو طرح أو استنتاج أي رقم جديد غير مذكور، ويُمنع المقارنة بنسخ سابقة من البطولة.

موجز البيانات (المصدر الوحيد المسموح):
${dataBrief}

ابنِ التقرير بهذا الترتيب (كل محور بعنوان <h2> جذاب يتضمن رقمًا حيث أمكن):
1. مقدمة سردية (60-80 كلمة) تلخّص حكاية البطولة حتى الآن بأبرز رقمين أو ثلاثة.
2. البطولة بالأرقام: المباريات والأهداف والمعدلات ومقارنة معدل دور المجموعات بالأدوار الإقصائية.
3. رحلة الأهداف: أكبر فوز، أغزر مباراة، أسرع هدف، توزيع الأهداف على الأشواط، الأهداف القاتلة، والريمونتادات الأبرز (اذكر 3-4 أمثلة من القائمة لا كلها).
4. سباق الهدّافين: الصدارة والملاحقون مع تفصيل أهداف الجزاء والصناعة.
5. قراءة في أرقام منتخبات ${stage.label}: قارن بالاستحواذ ودقة التمرير والتسديد، وأبرز أي فجوة بين الأداء والنتيجة.
6. الدفاعات والانضباط: أقوى دفاع وهجوم، والبطاقات.
7. خاتمة تربط الأرقام بما ينتظر الجماهير في الدور التالي (دون توقع نتيجة).

${JSON_CONTRACT}`;
}

/** يولّد وينشر تقرير حصاد الدور — يجمع تفاصيل كل المباريات التراكمية أولًا. */
async function generateStageDataReport(
  stage: WcStageDef,
  fixtures: WcFixture[]
): Promise<{ id: string; published: boolean }> {
  const cumulative = fixtures
    .filter(
      (f) =>
        f.status.finished &&
        (WC_ROUND_ORDER[f.roundEn] ?? Number.POSITIVE_INFINITY) <= stage.order
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  // تفاصيل كل مباراة (أحداث + إحصائيات) — تسلسليًّا خلف بوابة معدّل المزود؛
  // تحدث مرة واحدة لكل دور (منع التكرار بالـ slug قبل الوصول هنا). المباراة
  // التي يتعذّر جلبها تسقط من موجزات الأحداث وتبقى في النتائج والمعدلات.
  const detailById = new Map<number, WcMatchDetail>();
  for (const f of cumulative) {
    const d = await getMatchDetail(f.id).catch(() => null);
    if (d) detailById.set(f.id, d);
  }

  const scorers = await getTopScorers().catch(() => [] as WcScorer[]);
  const fifaRankById = new Map<number, number>();
  try {
    for (const t of await getTeamsRanked()) {
      if (t.fifaRank != null) fifaRankById.set(t.id, t.fifaRank);
    }
  } catch {
    // الترتيب إثراء اختياري — غيابه لا يمنع الحصاد
  }

  const brief = buildStageDataBrief(stage, cumulative, detailById, scorers, fifaRankById);
  const prompt = buildStageReportPrompt(stage, brief);
  const response = await generateWcArticleText(prompt);
  const generated = parseGenerated(response.content);

  return persistArticle(stageReportSlug(stage.key), generated, autoPublish(), response);
}

// ---------- دورة العمل التي يستدعيها الـ cron ----------

export interface WcNewsRunSummary {
  previews: number;
  reports: number;
  arabRoundups: number;
  stageReports: number;
  skipped: number;
  errors: number;
}

export async function runWorldCupNewsCycle(): Promise<WcNewsRunSummary> {
  const summary: WcNewsRunSummary = { previews: 0, reports: 0, arabRoundups: 0, stageReports: 0, skipped: 0, errors: 0 };
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

  // تقرير حصاد البطولة بالأرقام عند اكتمال كل دور إقصائي. البوابات بالترتيب:
  // slug غير موجود → كل مباريات الدور انتهت → الدور ليس بائتًا → مضى تأخير
  // الربع ساعة من رصد الاكتمال → بيانات آخر مباراة نهائية ومستقرة.
  for (const stage of KNOCKOUT_REPORT_STAGES) {
    if (generated >= MAX_GENERATIONS_PER_RUN) break;
    const slug = stageReportSlug(stage.key);
    try {
      if (await articleExists(slug)) continue;

      const stageFixtures = fixtures.filter((f) => f.roundEn === stage.roundEn);
      if (!stageFixtures.length || !stageFixtures.some((f) => f.home.id > 0)) continue;
      if (!stageFixtures.every((f) => f.status.finished)) {
        stageCompletionSeenAt.delete(stage.key); // مباراة أُعيدت للحياة/أُجّلت — صفّر العدّاد
        continue;
      }

      const lastFixture = stageFixtures.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
      if (now - lastFixture.timestamp * 1000 > STAGE_REPORT_MAX_AGE_MS) continue;

      const seenAt = stageCompletionSeenAt.get(stage.key);
      if (seenAt == null) {
        stageCompletionSeenAt.set(stage.key, now);
        console.log(
          `[WC News] ⏳ اكتمل ${stage.label} — حصاد البطولة بالأرقام بعد ${Math.round(STAGE_REPORT_DELAY_MS / 60000)} دقيقة`
        );
        summary.skipped++;
        continue;
      }
      if (now - seenAt < STAGE_REPORT_DELAY_MS) {
        summary.skipped++;
        continue;
      }

      // نفس بوابة استقرار البيانات التي تحمي تقارير المباريات الفردية
      const lastDetail = await getMatchDetail(lastFixture.id, { forceFresh: true }).catch(() => null);
      if (!lastDetail || !isReportDataFinal(lastFixture, lastDetail)) {
        summary.skipped++;
        continue;
      }

      const { id, published } = await generateStageDataReport(stage, fixtures);
      generated++;
      summary.stageReports++;
      console.log(
        `[WC News] ✅ حصاد البطولة بالأرقام (${stage.label}) ${published ? "نُشر" : "مسودة (محجوب للمراجعة)"} → article ${id}`
      );
    } catch (error) {
      summary.errors++;
      console.error(`[WC News] ❌ stage-data ${stage.key} failed:`, error);
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
