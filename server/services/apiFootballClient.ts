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

import { warnThrottled } from "../utils/throttledWarn";

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
/**
 * مهلة النداء الواحد. كانت 15ث، وحادثة 2026-07-24 أثبتت أن ذلك طويل جدًا:
 * حين توقّف المزوّد عن قبول الاتصالات ظلّ كل نداء يشغل دوره 15 ثانية قبل أن
 * يفشل، فامتلأ الطابور وتعلّقت الطلبات الواردة خلفه. النظير في SportMonks
 * ‏3500ms لنفس السبب (راجع docs/systems/sports-tournaments/SYSTEM.md).
 */
const DEFAULT_HTTP_TIMEOUT_MS = 8_000;
/**
 * أقصى انتظار مسموح داخل الطابور قبل رفض النداء فورًا.
 *
 * هذا هو الحاجز الذي كان مفقودًا في حادثة 2026-07-24: مسارات عامة مثل
 * `/api/sports/player/:id` تنتظر `acquireSlot` بلا حدّ، فحين تعطّل المزوّد
 * تراكمت آلاف الطلبات الواردة المعلّقة حتى عجزت العملية عن قبول اتصالات
 * جديدة — فردّ راوتر Railway بـ‏502 `connection dial timeout` على **كل**
 * المسارات، بما فيها ما لا علاقة له بالرياضة. الفشل السريع هنا أرحم: المستدعي
 * يرجع كاشًا بائتًا أو قائمة فارغة بدل أن يحتجز مقبسًا.
 */
const DEFAULT_MAX_QUEUE_WAIT_MS = 6_000;
/** بعد هذا العدد من إخفاقات النقل المتتالية نعتبر المزوّد ساقطًا ونتوقف مؤقتًا. */
const OUTAGE_FAILURE_THRESHOLD = 8;
/** مدة التوقف عن محاولة المزوّد بعد اعتباره ساقطًا. */
const OUTAGE_COOLDOWN_MS = 30_000;
/**
 * حادثة صباح 2026-07-25 (الثالثة بنفس الآلية): العطل الجزئي — نجاح متقطع وسط
 * الإخفاقات — كان يصفّر العداد المتتالي فلا ينفتح القاطع أبدًا، ويظل كل نداء
 * فاشل يحرق دوره ومهلته ويحتجز طلبًا واردًا. لذلك نافذة منزلقة إضافية:
 * بلوغ هذا العدد من إخفاقات النقل خلال OUTAGE_WINDOW_MS يفتح القاطع ولو
 * تخللتها ردود ناجحة.
 */
const OUTAGE_WINDOW_MS = 30_000;
const OUTAGE_WINDOW_THRESHOLD = 12;
/**
 * سقف صريح لعدد المنتظرين المتزامنين في طابور المعدّل. كل منتظر هو غالبًا
 * طلب HTTP وارد يحتجز مقبسًا؛ سقف الانتظار الزمني وحده يسمح بتراكم مئات
 * المنتظرين «القانونيين» في لحظة ازدحام + عطل، وهو ما يخنق قبول الاتصالات
 * الجديدة (\u200F502 dial timeout من راوتر Railway). فوق السقف: رفض فوري.
 */
const DEFAULT_MAX_PENDING_WAITERS = 80;

/** الحدّ الفعلي بالدقيقة كما رصدناه من ترويسات المزوّد (يتكيّف مع الخطة تلقائيًا). */
let observedRpm: number | null = null;
/** لا نداءات جديدة قبل هذا الوقت — يُرفع عندما يصرّح المزوّد بتجاوز الحدّ. */
let cooldownUntil = 0;
/** أزمنة الإرسال المجدولة داخل النافذة (مرتّبة تصاعديًا تقريبًا). */
const scheduled: number[] = [];
/** إخفاقات نقل متتالية (تعذّر الاتصال أو انتهاء المهلة) — تُصفّر عند أول رد. */
let consecutiveTransportFailures = 0;
/** أزمنة إخفاقات النقل داخل النافذة المنزلقة — لا يصفّرها النجاح المتقطع. */
let transportFailureTimes: number[] = [];
/** لا محاولات إطلاقًا قبل هذا الوقت — يُرفع عندما نعتبر المزوّد ساقطًا. */
let outageUntil = 0;
/** عدد المنتظرين حاليًا داخل acquireSlot — حارس استنفاد المقابس. */
let pendingWaiters = 0;

function envMs(name: string, fallback: number): number {
  const value = Number.parseInt((process.env[name] || "").trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function currentRpm(): number {
  const envRpm = Number.parseInt((process.env.APIFOOTBALL_RPM || "").trim(), 10);
  if (Number.isFinite(envRpm) && envRpm > 0) return envRpm;
  if (observedRpm && observedRpm > 0) return Math.max(1, Math.floor(observedRpm * 0.9));
  return DEFAULT_RPM;
}

/**
 * يحجز دورًا في النافذة الحالية وينتظر حتى يحين (فوريّ ما دمنا تحت الحدّ).
 * يرمي فورًا — بلا حجز ولا انتظار — إن تجاوز الدور المتاح سقف الانتظار.
 */
async function acquireSlot(tag: string, path: string): Promise<void> {
  const now = Date.now();
  while (scheduled.length && scheduled[0] <= now - WINDOW_MS) scheduled.shift();
  const rpm = currentRpm();
  let at = Math.max(now, cooldownUntil);
  // لا رشقات لحظية: كل نداء يبعد عن سابقه MIN_GAP_MS على الأقل
  if (scheduled.length) {
    at = Math.max(at, scheduled[scheduled.length - 1] + MIN_GAP_MS);
  }
  if (scheduled.length >= rpm) {
    at = Math.max(at, scheduled[scheduled.length - rpm] + WINDOW_MS);
  }
  const wait = at - now;
  const maxWait = envMs("APIFOOTBALL_MAX_QUEUE_WAIT_MS", DEFAULT_MAX_QUEUE_WAIT_MS);
  if (wait > maxWait) {
    throw new Error(
      `[${tag}] API-Football queue saturated (${wait}ms > ${maxWait}ms) for ${path}`,
    );
  }
  if (wait > 0) {
    // رصد (تشخيص 2026-07-27): انتظار الطابور «القانوني» غير مرئي في السجلات —
    // نعرف الرفض عند التشبّع لكن لا نعرف كم ينتظر الطلب التفاعلي خلف التسخين
    // (warmSquadPlayerCards) أو خلف موجة نداءات. سطر مخنوق لكل tag يكفي
    // لقياس الفرضية دون إغراق السجل أيام المباريات.
    if (wait > 1_000) {
      warnThrottled(
        `afqueue:${tag}`,
        `[APIFootball] queue wait ${wait}ms for ${tag} ${path} (pending=${pendingWaiters}, rpm=${currentRpm()})`,
        10_000,
      );
    }
    const maxPending = envMs("APIFOOTBALL_MAX_PENDING_WAITERS", DEFAULT_MAX_PENDING_WAITERS);
    if (pendingWaiters >= maxPending) {
      throw new Error(
        `[${tag}] API-Football wait room full (${pendingWaiters} pending) for ${path}`,
      );
    }
    scheduled.push(at);
    pendingWaiters += 1;
    try {
      await new Promise((resolve) => setTimeout(resolve, wait));
    } finally {
      pendingWaiters -= 1;
    }
    return;
  }
  scheduled.push(at);
}

function pruneFailureWindow(now: number): void {
  while (transportFailureTimes.length && transportFailureTimes[0] <= now - OUTAGE_WINDOW_MS) {
    transportFailureTimes.shift();
  }
}

function noteTransportFailure(): void {
  const now = Date.now();
  consecutiveTransportFailures += 1;
  transportFailureTimes.push(now);
  pruneFailureWindow(now);
  if (
    consecutiveTransportFailures >= OUTAGE_FAILURE_THRESHOLD ||
    transportFailureTimes.length >= OUTAGE_WINDOW_THRESHOLD
  ) {
    outageUntil = now + OUTAGE_COOLDOWN_MS;
    transportFailureTimes = [];
    console.warn(
      `[API-Football] circuit OPEN — cooling down ${OUTAGE_COOLDOWN_MS}ms (consecutive=${consecutiveTransportFailures})`,
    );
  }
}

function noteTransportSuccess(): void {
  // يصفّر المتتالي فقط — النافذة المنزلقة تبقى، فالنجاح المتقطع أثناء عطل
  // جزئي لا يمنع فتح القاطع (درس حادثة صباح 2026-07-25).
  consecutiveTransportFailures = 0;
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

  if (Date.now() < outageUntil) {
    throw new Error(`[${tag}] API-Football unreachable — cooling down, skipped ${path}`);
  }

  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 0; ; attempt++) {
    await acquireSlot(tag, path);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "x-apisports-key": apiKey,
          // هوية صريحة: المزوّد خلف Cloudflare (v3.football.api-sports.io →
          // 172.66.164.245). طلب بلا User-Agent من عنوان مركز بيانات بمعدّل
          // مرتفع يطابق ملف الحجب الآلي على الحافة، فتُقطع الاتصالات بينما
          // صفحة حالة المزوّد خضراء 100% (لقطة 2026-07-25: 90 يومًا بلا عطل).
          "User-Agent": "sabq.org/1.0 (+https://sabq.org)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(envMs("APIFOOTBALL_HTTP_TIMEOUT_MS", DEFAULT_HTTP_TIMEOUT_MS)),
      });
    } catch (error) {
      // تعذّر الاتصال أو انتهت المهلة — لم يصل الطلب للمزوّد أصلًا.
      //
      // «fetch failed» رسالة undici العامة ولا تقول شيئًا. السبب الحقيقي في
      // error.cause دائمًا: ECONNRESET (الحافة تقطعنا) أو EAI_AGAIN (فشل DNS
      // في الحاوية) أو UND_ERR_CONNECT_TIMEOUT (لا يُفتح TCP أصلًا — استنزاف
      // مقابس عندنا) أو ECONNREFUSED (حجب صريح). كان الكود يقرأ .message فقط
      // ويرمي cause، ولهذا بقي سبب حوادث 2026-07-24/25 مجهولًا وبُنيت
      // الحواجز (#1199، #1201) على فرضية «تعطّل المزوّد» التي تكذّبها لوحة
      // حالته. هذه الحقول تحسم الأمر من أول سطر في السجل.
      noteTransportFailure();
      const err = error as any;
      const cause = err?.cause;
      const detail = cause
        ? [cause.code, cause.errno, cause.syscall, cause.name, cause.message]
            .filter(Boolean)
            .join(" ")
        : "";
      throw new Error(
        `[${tag}] API-Football transport failure for ${path}: ${err?.message ?? error}` +
          (detail ? ` (cause: ${detail})` : " (cause: غير متاح)"),
      );
    }
    noteTransportSuccess();
    noteResponseHeaders(response);

    if (!response.ok) {
      if (response.status === 429 && attempt < 2) {
        reportRateLimited();
        continue;
      }
      throw new Error(`[${tag}] API-Football HTTP ${response.status} for ${path}`);
    }

    const data: any = await response.json();
    const errors = data?.errors;
    if (errors && !Array.isArray(errors) && Object.keys(errors).length > 0) {
      if (errors.rateLimit && attempt < 2) {
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
