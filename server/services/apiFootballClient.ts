/**
 * العميل الموحّد لـ API-Football (v3.football.api-sports.io) — بوّابة معدّل مشتركة.
 *
 * المشكلة: أربع خدمات (دوري روشن/الخليجي/الآسيوي/المونديال) كانت تنادي المزوّد
 * مباشرة بنسخ متطابقة من apiGet، وكلها تتقاسم مفتاح APIFOOTBALL_KEY واحدًا.
 * التقييد الموضعي (pLimit) يحدّ التوازي داخل مسار واحد لكنه لا يحدّ «عدد النداءات
 * في الدقيقة» عبر المسارات كلها: عند الإقلاع البارد أو انتهاء كاش SWR متزامن
 * تتراكم عشرات النداءات في الدقيقة نفسها فيرُدّ المزوّد rateLimit وتفشل كلها معًا
 * (ولا كاش بائت يستر بعد النشر)، فتتكرّر العاصفة مع كل طلب جديد.
 *
 * الحل: جدولة نافذة منزلقة تُبقي مجموع النداءات تحت حدّ الاشتراك بالدقيقة —
 * النداء الزائد «ينتظر دوره» بدل أن يُرسَل محكومًا عليه بالفشل، وأول نجاح يُكاش
 * ساعات فتهدأ العاصفة بعد دورة واحدة. الحدّ:
 *   1. APIFOOTBALL_RPM إن ضُبط (اقسمه على عدد النسخ إن توسّعت Railway أفقيًّا).
 *   2. وإلا الحدّ الفعلي المرصود من ترويسة x-ratelimit-limit بهامش أمان 10%.
 *   3. وإلا 250 افتراضيًا (تحت حدّ خطة Pro = 300/دقيقة).
 * وإن ردّ المزوّد بالحدّ رغم ذلك (اشتراك أصغر/مستهلك خارجي) نهدأ 15 ثانية
 * ونعيد المحاولة مرّة واحدة بعد حجز دورٍ جديد.
 */

import { currentSportsPriority, type SportsRequestPriority } from "./sportsRequestContext";

const API_BASE = "https://v3.football.api-sports.io";
const WINDOW_MS = 60_000;
const DEFAULT_RPM = 250;
/**
 * تباعد إلزامي بين نداءين متتاليين (~12/ثانية كحد أقصى): المزوّد يرفض الرشقات
 * اللحظية حتى تحت حدّ الدقيقة — النشر البارد كان يفتح عشرات النداءات في نفس
 * الميلي ثانية فيرُدّ rateLimit رغم أن مجموع الدقيقة سليم (متحقَّق من سجلات
 * 2026-07-04: 429 والعداد اليومي/الدقيقة بعيد عن السقف).
 */
const MIN_GAP_MS = 80;
/** تهدئة 429: كانت 15ث فتتسلسل الطوابير خلفها إلى دقائق (team/:id بلغ 83ث) */
const RATE_LIMIT_COOLDOWN_MS = 4_000;

/** الحدّ الفعلي بالدقيقة كما رصدناه من ترويسات المزوّد (يتكيّف مع الخطة تلقائيًا). */
let observedRpm: number | null = null;
/** لا نداءات جديدة قبل هذا الوقت — يُرفع عندما يصرّح المزوّد بتجاوز الحدّ. */
let cooldownUntil = 0;
/** أزمنة الإرسال الفعلية داخل النافذة. */
const scheduled: number[] = [];

interface PendingSlot {
  priority: SportsRequestPriority;
  enqueuedAt: number;
  resolve: (queueMs: number) => void;
}

const pendingSlots: PendingSlot[] = [];
let slotPumpRunning = false;

const PRIORITY_RANK: Record<SportsRequestPriority, number> = {
  interactive: 0,
  normal: 1,
  background: 2,
};

function currentRpm(): number {
  const envRpm = Number.parseInt((process.env.APIFOOTBALL_RPM || "").trim(), 10);
  if (Number.isFinite(envRpm) && envRpm > 0) return envRpm;
  if (observedRpm && observedRpm > 0) return Math.max(1, Math.floor(observedRpm * 0.9));
  return DEFAULT_RPM;
}

function nextPendingSlot(): PendingSlot | undefined {
  let bestIndex = -1;
  for (let i = 0; i < pendingSlots.length; i++) {
    if (
      bestIndex < 0 ||
      PRIORITY_RANK[pendingSlots[i].priority] < PRIORITY_RANK[pendingSlots[bestIndex].priority] ||
      (pendingSlots[i].priority === pendingSlots[bestIndex].priority &&
        pendingSlots[i].enqueuedAt < pendingSlots[bestIndex].enqueuedAt)
    ) {
      bestIndex = i;
    }
  }
  return bestIndex >= 0 ? pendingSlots.splice(bestIndex, 1)[0] : undefined;
}

async function pumpSlots(): Promise<void> {
  if (slotPumpRunning) return;
  slotPumpRunning = true;
  try {
    while (pendingSlots.length > 0) {
      let now = Date.now();
      while (scheduled.length && scheduled[0] <= now - WINDOW_MS) scheduled.shift();
      const rpm = currentRpm();
      let at = Math.max(now, cooldownUntil);
      if (scheduled.length) at = Math.max(at, scheduled[scheduled.length - 1] + MIN_GAP_MS);
      if (scheduled.length >= rpm) at = Math.max(at, scheduled[scheduled.length - rpm] + WINDOW_MS);
      const wait = at - now;
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      // نختار بعد الانتظار لا قبله، كي يتمكن طلب تفاعلي وصل أثناء انتظار
      // نافذة المعدّل من تجاوز عناصر التسخين القديمة.
      const item = nextPendingSlot();
      if (!item) continue;
      now = Date.now();
      scheduled.push(now);
      item.resolve(now - item.enqueuedAt);
    }
  } finally {
    slotPumpRunning = false;
    // قد يصل عنصر بين فحص الحلقة وfinally.
    if (pendingSlots.length > 0) void pumpSlots();
  }
}

/** يحجز دورًا، مع تقديم طلبات المستخدم على التسخين والكرون. */
function acquireSlot(priority: SportsRequestPriority): Promise<number> {
  return new Promise((resolve) => {
    pendingSlots.push({ priority, enqueuedAt: Date.now(), resolve });
    void pumpSlots();
  });
}

function noteResponseHeaders(response: Response): void {
  // ترويسات المزوّد: x-ratelimit-limit/remaining = حدّ الدقيقة،
  // x-ratelimit-requests-limit/remaining = حصة اليوم.
  const limit = Number.parseInt(response.headers.get("x-ratelimit-limit") || "", 10);
  if (Number.isFinite(limit) && limit > 0) observedRpm = limit;
  const remaining = Number.parseInt(response.headers.get("x-ratelimit-remaining") || "", 10);
  if (Number.isFinite(remaining) && remaining <= 0) {
    // استُنفدت دقيقة المزوّد (ربما بمشاركة مستهلك آخر للمفتاح) — تريّث قليلًا.
    cooldownUntil = Math.max(cooldownUntil, Date.now() + 1_500);
  }
}

function reportRateLimited(): void {
  cooldownUntil = Math.max(cooldownUntil, Date.now() + RATE_LIMIT_COOLDOWN_MS);
}

export interface ApiFootballGetOptions {
  /**
   * بعض النقاط (teams/statistics مثلًا) تعيد response ككائن واحد لا مصفوفة —
   * نلفّه في مصفوفة حتى يستهلكه المستدعي عبر rows[0] بنفس النمط.
   */
  wrapObjectResponse?: boolean;
  /** يُستنتج من سياق الطلب؛ يمكن للخدمات الخاصة تجاوزه صراحةً. */
  priority?: SportsRequestPriority;
  /** مهلة اتصال المزوّد فقط؛ انتظار الطابور يُقاس منفصلًا. */
  timeoutMs?: number;
}

/**
 * نداء GET موحّد للمزوّد: يمرّ عبر بوّابة المعدّل، يرصد الترويسات، ويعيد
 * المحاولة مرّة واحدة بعد تهدئة إذا ردّ المزوّد بتجاوز الحدّ.
 * `tag` بادئة رسائل الخطأ للخدمة المستدعية (SaudiLeague/GulfCup/...).
 */
export async function apiFootballGet(
  tag: string,
  path: string,
  params: Record<string, string | number>,
  opts: ApiFootballGetOptions = {},
): Promise<any[]> {
  const apiKey = (process.env.APIFOOTBALL_KEY || "").trim();
  if (!apiKey) throw new Error("APIFOOTBALL_KEY is not set");

  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const priority = opts.priority ?? currentSportsPriority();
  const timeoutMs = opts.timeoutMs ?? (priority === "interactive" ? 2_800 : priority === "background" ? 15_000 : 8_000);
  const maxRetries = priority === "interactive" ? 0 : 2;
  const requestStartedAt = Date.now();

  for (let attempt = 0; ; attempt++) {
    const queueMs = await acquireSlot(priority);
    const providerStartedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "x-apisports-key": apiKey },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const providerMs = Date.now() - providerStartedAt;
      console.warn(
        `[Sports Provider] tag=${tag} path=${path} priority=${priority} queueMs=${queueMs} providerMs=${providerMs} totalMs=${Date.now() - requestStartedAt} attempt=${attempt + 1} status=network-error`,
      );
      throw error;
    }
    const providerMs = Date.now() - providerStartedAt;
    noteResponseHeaders(response);

    if (queueMs >= 250 || providerMs >= 1_000 || Date.now() - requestStartedAt >= 2_500) {
      console.warn(
        `[Sports Provider] tag=${tag} path=${path} priority=${priority} queueMs=${queueMs} providerMs=${providerMs} totalMs=${Date.now() - requestStartedAt} attempt=${attempt + 1} status=${response.status}`,
      );
    }

    if (!response.ok) {
      if (response.status === 429 && attempt < maxRetries) {
        reportRateLimited();
        continue;
      }
      throw new Error(`[${tag}] API-Football HTTP ${response.status} for ${path}`);
    }

    const data: any = await response.json();
    const errors = data?.errors;
    if (errors && !Array.isArray(errors) && Object.keys(errors).length > 0) {
      if (errors.rateLimit && attempt < maxRetries) {
        reportRateLimited();
        continue;
      }
      throw new Error(`[${tag}] API-Football error for ${path}: ${JSON.stringify(errors)}`);
    }

    const resp = data?.response;
    if (Array.isArray(resp)) return resp;
    if (opts.wrapObjectResponse && resp && typeof resp === "object") return [resp];
    return [];
  }
}
