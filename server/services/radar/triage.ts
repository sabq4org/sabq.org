/**
 * فرز الرادار الحتمي — بلا DB ولا نماذج، قابل للاختبار مباشرة.
 *
 * الفكرة: لا يُسأل النموذج إلا عمّا لا تعرفه القواعد، ولا تُجمع الإشارات في
 * متوسط واحد يسمح لصلة عالية بتغطية دليل ضعيف. لكل مادة تُحفظ محاور منفصلة:
 * - الناشر الفعلي ونوعه، وأصل النقل (وكالة) — أساس عدّ المصادر المستقلة.
 * - أساس الزمن (تاريخ موثوق أم مجهول/مستقبلي) وتلميح «سنة ماضية» في النص.
 * - أساس النص (متن أم عنوان فقط) — العنوان وحده لا يُلخَّص.
 * ثم بوابات: فرز قبل التحليل (بيان صحفي/تاريخ مستحيل)، وبوابة عاجل بشروط
 * مجتمعة ومدة صلاحية، وأولوية مركبة بسقوف لا تتجاوزها.
 */
import { PUBLISHERS, type PublisherEntry, type PublisherType } from "./publisherRegistry";

export type { PublisherType };
export type TextBasis = "body" | "title_only";
export type EventTiming = "new" | "ongoing" | "old" | "unknown";
export type ContentType = "news" | "claim" | "analysis" | "opinion" | "press_release" | "other";
export type RadarLane = "opportunity" | "watch" | "background";

// ---------- إعدادات (تُقرأ عند الاستدعاء لتسهيل الاختبار) ----------

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** أقصى عمر (ساعات) لمادة كي تُعلَّم عاجلة */
export const breakingMaxAgeHours = () => envNumber("RADAR_BREAKING_MAX_AGE_HOURS", 2, 0.25, 12);
/** مدة صلاحية وسم العاجل من زمن الحدث/الرصد */
export const breakingTtlHours = () => envNumber("RADAR_BREAKING_TTL_HOURS", 3, 0.5, 24);
/** أدنى قيمة إخبارية للعاجل */
export const breakingMinValue = () => envNumber("RADAR_BREAKING_MIN_VALUE", 70, 0, 100);

const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
const IMPOSSIBLE_FUTURE_MS = 24 * 60 * 60 * 1000;
const MIN_BODY_CHARS = 80;

// ---------- الناشر ----------

const REDIRECT_HOSTS = ["news.google.com", "google.com", "t.co", "bit.ly"];

function normName(value: string): string {
  return value
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[.\s\-_'"«»()]+/g, " ")
    .trim();
}

export function hostOf(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const host = new URL(link).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

const NAME_INDEX: Map<string, PublisherEntry> = (() => {
  const map = new Map<string, PublisherEntry>();
  for (const entry of PUBLISHERS) {
    for (const name of entry.names) map.set(normName(name), entry);
  }
  return map;
})();

export interface PublisherIdentity {
  /** مفتاح ثابت للناشر — مدخل عدّ المصادر المستقلة */
  key: string;
  type: PublisherType;
  domain: string | null;
}

/**
 * يحدد الناشر الفعلي للمادة: من نطاق الرابط أولًا (إلا روابط التحويل مثل
 * Google News)، ثم من اسم الناشر الذي أعطاه الممر، ثم يسقط لنطاق الرابط
 * أو لهوية المصدر. رصدات إكس = social.
 */
export function resolvePublisher(input: {
  link?: string | null;
  publisher?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  xHandle?: string | null;
}): PublisherIdentity {
  if (input.sourceType === "x") {
    const handle = (input.xHandle || input.publisher || input.sourceId || "unknown").toLowerCase();
    return { key: `x:${handle.replace(/^@/, "")}`, type: "social", domain: null };
  }

  const rawHost = hostOf(input.link);
  const host = rawHost && !REDIRECT_HOSTS.some((h) => domainMatches(rawHost, h)) ? rawHost : null;

  if (host) {
    const byDomain = PUBLISHERS.find((p) => p.domains.some((d) => domainMatches(host, d)));
    if (byDomain) return { key: byDomain.key, type: byDomain.type, domain: host };
  }

  const name = input.publisher?.trim();
  if (name) {
    const byName = NAME_INDEX.get(normName(name));
    if (byName) return { key: byName.key, type: byName.type, domain: host };
  }

  if (host) {
    // الجهات الحكومية السعودية والخليجية: دليل رسمي على ما أعلنته الجهة
    if (/\.gov\.sa$|\.gov\.ae$|\.gov\.qa$|\.gov\.kw$|\.gov\.bh$|\.gov\.om$/.test(host)) {
      return { key: host, type: "official", domain: host };
    }
    return { key: host, type: "unknown", domain: host };
  }
  if (name) return { key: `name:${normName(name)}`, type: "unknown", domain: null };
  return { key: `source:${input.sourceId ?? "unknown"}`, type: "unknown", domain: null };
}

/**
 * أصل النقل: إن كانت المادة منقولة عن وكالة/جهة رسمية (عزو داخل النص)
 * فمفتاح الاستقلال هو تلك الوكالة — عشرة مواقع تنقل رويترز = مصدر مستقل واحد.
 */
export function detectWireOrigin(
  text: string,
  publisher: PublisherIdentity
): string | null {
  if (publisher.type === "wire" || publisher.type === "official") {
    const entry = PUBLISHERS.find((p) => p.key === publisher.key);
    if (entry) return entry.key;
  }
  const hay = text.toLowerCase();
  if (!hay) return null;
  for (const entry of PUBLISHERS) {
    if (entry.type !== "wire" && entry.type !== "official") continue;
    for (const marker of entry.wireMarkers) {
      if (marker && hay.includes(marker.toLowerCase())) return entry.key;
    }
  }
  return null;
}

/** مفتاح الاستقلال: أصل النقل إن وُجد، وإلا الناشر نفسه */
export function independenceKey(item: {
  wireOrigin?: string | null;
  publisherKey?: string | null;
  sourceId: string;
}): string {
  return item.wireOrigin || item.publisherKey || `source:${item.sourceId}`;
}

export function countIndependentSources(
  items: { wireOrigin?: string | null; publisherKey?: string | null; sourceId: string }[]
): number {
  return new Set(items.map(independenceKey)).size;
}

// ---------- النص والزمن ----------

/** متن فعلي أم عنوان فقط (ملخص Google News يُحذف لأنه قائمة روابط) */
export function textBasisOf(title: string, excerpt?: string | null): TextBasis {
  if (!excerpt) return "title_only";
  const t = normName(title);
  let body = normName(excerpt);
  if (t && body.startsWith(t)) body = body.slice(t.length).trim();
  return body.length >= MIN_BODY_CHARS ? "body" : "title_only";
}

/**
 * سنة ماضية مذكورة في النص دون ذكر السنة الحالية أو اللاحقة (مثل «مونديال 2022»).
 * تلميح لا حكم: «أول مرة منذ 2019» خبر جديد، لذلك لا تُسقط المادة بسببه،
 * لكنه يمنع العاجل ما لم يؤكد التحليل أن الحدث جديد.
 */
export function pastYearMentioned(text: string, now: Date = new Date()): number | null {
  const current = now.getUTCFullYear();
  const years = Array.from(text.matchAll(/(?<![\d])(19[5-9]\d|20\d{2})(?![\d])/g)).map((m) =>
    Number(m[1])
  );
  if (!years.length) return null;
  if (years.some((y) => y >= current)) return null;
  return Math.max(...years);
}

export interface TimeCheck {
  /** زمن يُعتمد في الحداثة، أو null إن كان مجهولًا/غير منطقي */
  trustedAt: Date | null;
  flags: string[];
  /** مستقبلي بما لا يُعقل (> 24 ساعة) — يُستبعد قبل التحليل */
  impossible: boolean;
}

export function checkTime(publishedAt: Date | null | undefined, now: Date = new Date()): TimeCheck {
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) {
    return { trustedAt: null, flags: ["missing_date"], impossible: false };
  }
  const ahead = publishedAt.getTime() - now.getTime();
  if (ahead > FUTURE_TOLERANCE_MS) {
    return { trustedAt: null, flags: ["future_date"], impossible: ahead > IMPOSSIBLE_FUTURE_MS };
  }
  return { trustedAt: publishedAt, flags: [], impossible: false };
}

// ---------- الفرز قبل التحليل ----------

export interface IntakeTriage {
  publisherKey: string;
  publisherType: PublisherType;
  wireOrigin: string | null;
  textBasis: TextBasis;
  qualityFlags: string[];
  /** سبب استبعاد آلي قبل أي نداء نموذج، أو null */
  screenReason: string | null;
}

export function triageIntake(
  input: {
    title: string;
    excerpt?: string | null;
    link?: string | null;
    publisher?: string | null;
    publishedAt?: Date | null;
    sourceType?: string | null;
    sourceId?: string | null;
    xHandle?: string | null;
  },
  now: Date = new Date()
): IntakeTriage {
  const identity = resolvePublisher(input);
  const text = `${input.title}\n${input.excerpt ?? ""}`;
  const wireOrigin = detectWireOrigin(text, identity);
  const textBasis = input.sourceType === "x" ? "body" : textBasisOf(input.title, input.excerpt);
  const time = checkTime(input.publishedAt ?? null, now);
  const flags = [...time.flags];
  const year = pastYearMentioned(text, now);
  if (year) flags.push(`past_year:${year}`);
  if (textBasis === "title_only") flags.push("title_only");

  let screenReason: string | null = null;
  if (identity.type === "press_release") screenReason = "بيان صحفي/ترويجي";
  else if (time.impossible) screenReason = "تاريخ نشر مستقبلي غير منطقي";

  return {
    publisherKey: identity.key,
    publisherType: identity.type,
    wireOrigin,
    textBasis,
    qualityFlags: flags,
    screenReason,
  };
}

// ---------- ما بعد التحليل: عاجل + أولوية + مسار ----------

export interface ItemSignals {
  now?: Date;
  publishedAt?: Date | null;
  fetchedAt: Date;
  qualityFlags?: string[] | null;
  publisherType?: string | null;
  textBasis?: string | null;
  independentSources: number;
  newsValue: number;
  eventTiming?: string | null;
  contentType?: string | null;
  /** رأي النموذج أو قاعدة تنبيه — طلب لا قرار */
  breakingRequested: boolean;
}

function trustedTime(signals: ItemSignals): Date | null {
  const flags = signals.qualityFlags ?? [];
  if (flags.includes("future_date") || flags.includes("missing_date")) return null;
  return signals.publishedAt ?? null;
}

function ageHours(signals: ItemSignals): { hours: number; verified: boolean } {
  const now = (signals.now ?? new Date()).getTime();
  const trusted = trustedTime(signals);
  if (trusted) return { hours: Math.max(0, (now - trusted.getTime()) / 3_600_000), verified: true };
  // زمن مجهول: أول رصد حدّ أدنى للعمر، والمادة «غير متحقق زمنها»
  return { hours: Math.max(0, (now - signals.fetchedAt.getTime()) / 3_600_000), verified: false };
}

const STRONG_PUBLISHERS = new Set(["official", "wire", "major"]);

export function hasCorroboration(signals: Pick<ItemSignals, "publisherType" | "independentSources">): boolean {
  return STRONG_PUBLISHERS.has(signals.publisherType ?? "") || signals.independentSources >= 2;
}

export interface BreakingDecision {
  isBreaking: boolean;
  breakingUntil: Date | null;
  /** لماذا رُفض طلب العاجل — للعرض والتدقيق */
  deniedBy: string | null;
}

/**
 * العاجل صفة مؤقتة لا رأي نموذج: تُمنح فقط باجتماع كل الشروط، ولها وقت انتهاء.
 * زمن مجهول + قيمة عالية جدًا + تأييد → عاجل «غير متحقق الزمن» (لا نحجب خطرًا
 * حقيقيًا لنقص تاريخ)، والعلم time_unverified يظهر للمحرر.
 */
export function decideBreaking(signals: ItemSignals): BreakingDecision {
  const deny = (reason: string): BreakingDecision => ({ isBreaking: false, breakingUntil: null, deniedBy: reason });
  if (!signals.breakingRequested) return deny("not_requested");
  if (signals.eventTiming === "old") return deny("old_event");
  const flags = signals.qualityFlags ?? [];
  if (flags.some((f) => f.startsWith("past_year:")) && signals.eventTiming !== "new") {
    return deny("past_year_unconfirmed");
  }
  if (signals.contentType === "press_release" || signals.publisherType === "press_release") {
    return deny("press_release");
  }
  if (signals.newsValue < breakingMinValue()) return deny("low_value");
  const age = ageHours(signals);
  if (age.hours > breakingMaxAgeHours()) return deny("stale");
  if (!age.verified && signals.newsValue < 85) return deny("time_unverified");
  if (!hasCorroboration(signals)) return deny("uncorroborated");

  const anchor = trustedTime(signals) ?? signals.fetchedAt;
  const until = new Date(anchor.getTime() + breakingTtlHours() * 3_600_000);
  if (until.getTime() <= (signals.now ?? new Date()).getTime()) return deny("expired");
  return { isBreaking: true, breakingUntil: until, deniedBy: null };
}

const PUBLISHER_EVIDENCE: Record<string, number> = {
  official: 90,
  wire: 85,
  major: 70,
  unknown: 40,
  aggregator: 35,
  social: 30,
  press_release: 10,
};

export interface ItemScores {
  evidenceScore: number;
  freshnessScore: number;
  priorityScore: number;
  lane: RadarLane;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * ثلاثة محاور منفصلة + أولوية مركبة بسقوف (لا متوسط يغطي ضعف الدليل):
 * - الدليل: نوع الناشر + تأييد مستقل، ناقص إن كان عنوانًا فقط.
 * - الحداثة: عمر الزمن الموثوق؛ حدث قديم = صفر.
 * - الصلة: القيمة الإخبارية من التحليل.
 * المسار: background (قديم/ترويجي/بائت) · watch (ادعاء أو دليل ضعيف يحتاج تحققًا) · opportunity.
 */
export function scoreItem(signals: ItemSignals): ItemScores {
  const base = PUBLISHER_EVIDENCE[signals.publisherType ?? "unknown"] ?? 40;
  let evidence = base + Math.min(30, Math.max(0, signals.independentSources - 1) * 10);
  if (signals.textBasis === "title_only") evidence -= 15;
  const evidenceScore = clamp(evidence);

  const age = ageHours(signals);
  let freshness: number;
  if (signals.eventTiming === "old") freshness = 0;
  else if (age.hours <= 1) freshness = 100;
  else if (age.hours <= 6) freshness = 80;
  else if (age.hours <= 24) freshness = 55;
  else if (age.hours <= 48) freshness = 30;
  else freshness = 10;
  if (!age.verified) freshness = Math.min(freshness, 50);
  const freshnessScore = clamp(freshness);

  const relevance = clamp(signals.newsValue);
  let priority = 0.5 * relevance + 0.25 * evidenceScore + 0.25 * freshnessScore;
  if (signals.eventTiming === "old") priority = Math.min(priority, 25);
  if (signals.contentType === "press_release" || signals.publisherType === "press_release") {
    priority = Math.min(priority, 20);
  }
  // الصلة العالية لا تعوض غياب الدليل: سقف للمادة غير المؤيدة
  if (!hasCorroboration(signals)) priority = Math.min(priority, 70);
  const priorityScore = clamp(priority);

  let lane: RadarLane = "opportunity";
  if (
    signals.eventTiming === "old" ||
    signals.contentType === "press_release" ||
    signals.publisherType === "press_release" ||
    freshnessScore <= 10
  ) {
    lane = "background";
  } else if (
    signals.contentType === "claim" ||
    (relevance >= 50 && evidenceScore < 50)
  ) {
    lane = "watch";
  }
  return { evidenceScore, freshnessScore, priorityScore, lane };
}
