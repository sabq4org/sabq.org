import session from "express-session";
import { getRedisSessionAdapter } from "./redis";

/**
 * عمر مفتاح الفهرس العكسي. يُجدَّد مع كل كتابة جلسة، فيبقى حيًّا ما دام
 * المستخدم نشطًا ويختفي تلقائيًا بعده. أطول قليلًا من عمر الجلسة احتياطًا.
 */
const USER_SESSION_INDEX_TTL_S = 8 * 24 * 60 * 60;

/**
 * فهرس عكسي usess:<userId> → مجموعة معرّفات جلسات المستخدم.
 *
 * سببه: invalidateAllUserSessions كانت تمشّط مفاتيح Redis كلها (SCAN sess:*)
 * مع GET متسلسل لكل مفتاح للعثور على جلسات مستخدم واحد. وRedis أحادي الخيط،
 * فكل أمر آخر — بما فيه قراءة الجلسة التي يفعلها express-session في **كل**
 * طلب وارد — يقف في الطابور خلف التمشيط. النتيجة تجمّد عام: طلبات غير
 * مترابطة تنتهي جميعها في نفس المللي ثانية، ونقاطٌ مكاشة في الذاكرة تستغرق
 * ثانية ونصفًا لأن الطلب لم يصل إلى معالجها أصلًا (سجلات 2026-07-24/25).
 *
 * بهذا الفهرس يصبح الإبطال SMEMBERS واحدًا ثم DEL واحدًا — بعدد جلسات
 * المستخدم لا بعدد جلسات الموقع كله.
 *
 * أفضل جهد ولا يُنتظر: فشله يعيدنا إلى التمشيط المحدود بميزانية، لا أكثر.
 */
function indexUserSession(sid: string, sess: session.SessionData): void {
  const userId = (sess as any)?.passport?.user;
  if (typeof userId !== "string" || userId.length === 0) return;
  const redis = getRedisSessionAdapter();
  if (!redis) return;
  const key = `usess:${userId}`;
  void redis
    .sadd(key, sid)
    .then(() => redis.expire(key, USER_SESSION_INDEX_TTL_S))
    .catch(() => {
      /* الفهرس تحسين لا ضمانة — الإبطال يسقط إلى التمشيط عند غيابه */
    });
}

type StoreCallback = (err?: any, session?: session.SessionData | null) => void;
type SimpleCallback = (err?: any) => void;

/**
 * ترويسة تقول للواجهة: «هذا 401 ليس انتهاء جلسة، بل تعذّرت قراءتها الآن».
 *
 * بدونها يبدو الردّان متطابقين تمامًا عند العميل، فيعرض «انتهت صلاحية
 * جلستك» ويحوّل المحرّر إلى صفحة الدخول أثناء عطل عابر في Redis — وقد يفقد
 * مسودّة غير محفوظة. مع الترويسة يعيد العميل المحاولة بصمت.
 *
 * ملاحظة CORS: يجب إدراجها في `exposedHeaders` وإلا لم يستطع المتصفح
 * قراءتها من أصل مختلف (تطبيقا كاباسيتور يخاطبان api.sabq.org مباشرة).
 */
export const SESSION_DEGRADED_HEADER = "X-Session-Degraded";

/**
 * استخراج معرّف الجلسة من كوكي `connect.sid` الموقّع (`s:<sid>.<توقيع>`).
 *
 * لماذا لا نقرأ `req.sessionID` بعد الوسيط؟ لأن express-session حين تعود
 * القراءة فارغة يولّد **معرّفًا جديدًا** فورًا، فلا يعود ما بيدنا هو المعرّف
 * الذي فشلت قراءته. التوقيع لا يُتحقَّق منه هنا — هذا شأن express-session،
 * وأسوأ ما يحدث عند عدم التطابق ألا تُرسَل الترويسة.
 */
export function sessionIdFromCookieHeader(cookieHeader: unknown): string | null {
  if (typeof cookieHeader !== "string") return null;
  const match = /(?:^|;\s*)connect\.sid=([^;]+)/.exec(cookieHeader);
  if (!match) return null;
  let raw: string;
  try {
    raw = decodeURIComponent(match[1]);
  } catch {
    raw = match[1];
  }
  const withoutPrefix = raw.startsWith("s:") ? raw.slice(2) : raw;
  const sid = withoutPrefix.split(".")[0];
  return sid.length > 0 ? sid : null;
}

/**
 * أخطاء «بنية تحتية» في مخزن الجلسات الاحتياطي: نفاد وصلات المسبح، انقطاع
 * الاتصال، تجاوز مهلة الاستعلام. تميّزها عن خطأ بيانات حقيقي مهم — الأول
 * عابر ويجوز التدهور معه إلى «بلا جلسة»، والثاني خلل يجب أن يظهر.
 *
 * الرسائل هنا مأخوذة حرفيًا من أحداث production:
 *   NODE-EXPRESS-B «timeout exceeded when trying to connect» (1108 حدثًا)
 *   NODE-EXPRESS-C «Connection terminated due to connection timeout» (55)
 *   NODE-EXPRESS-9 «Query read timeout» (13)
 */
const INFRASTRUCTURE_ERROR = /timeout exceeded when trying to connect|connection terminated|query read timeout|connection timeout|ECONNRESET|ETIMEDOUT|ECONNREFUSED|too many clients/i;

interface StoreErrorShape {
  message?: unknown;
  code?: unknown;
}

export function isInfrastructureStoreError(err: unknown): boolean {
  if (!err) return false;
  const { message, code } =
    typeof err === "object" ? (err as StoreErrorShape) : { message: err, code: undefined };
  if (typeof code === "string" && /^(ECONNRESET|ETIMEDOUT|ECONNREFUSED|53300|57P03)$/.test(code)) {
    return true;
  }
  return typeof message === "string" && INFRASTRUCTURE_ERROR.test(message);
}

/**
 * مخزن جلسات ثنائي: يفضّل Redis، وعند فشل متكرر ينتقل لـ Postgres حتى لا
 * تبقى الطلبات معلّقة (csrf / login / رفع ملفات → 502).
 *
 * لا ينسخ الجلسات بين المخزنين — بعد failover قد تُنشأ جلسة جديدة على PG
 * (المستخدم يعيد الدخول إن لزم). الأولوية: توفر اللوحة لا استمرار الجلسة القديمة.
 *
 * ── درس نوبة 2026-07-25 (NODE-EXPRESS-B/C/9، 1176 حدثًا) ──
 * كان **فشل واحد** عابر من Redis (مهلة أمر 2500ms في redis.ts) يحوّل 100%
 * من حركة الجلسات إلى مسبح PG المعزول لثلاثين ثانية كاملة. وذلك المسبح
 * مقصود الصِّغَر (max=4، مهلة اتصال 2s في dbPoolConfig.ts) لأنه حاجز حماية
 * لا مسار خدمة أساسي: أربع وصلات لا تحمل حركة الموقع، فيقف كل طلب في
 * الطابور ثم يموت بـ«timeout exceeded when trying to connect» → 500 للزائر.
 * الحاجز الذي بُني ليحمي المحتوى صار هو نفسه سبب العطل.
 *
 * علاجان مترافقان:
 *   1. عتبة فشل (failureThreshold) داخل نافذة زمنية قبل التحويل: نبضة واحدة
 *      من Redis لم تعد تكفي لإسقاط كل الحركة على أربع وصلات.
 *   2. تدهور رشيق عند فشل الاحتياطي أيضًا: قراءة الجلسة تعود «بلا جلسة»
 *      بدل رمي خطأ يتحول إلى 500. وtouch — وهو مجرد تجديد لعمر الجلسة —
 *      لا يُفشل طلبًا أبدًا.
 */
export class SessionFailoverStore extends session.Store {
  private redisUnhealthyUntil = 0;
  private loggedFailover = false;
  private recentFailures: number[] = [];
  private loggedDegradedRead = 0;
  /** معرّفات جلسات تعذّرت قراءتها للتوّ — تُستهلَك مرّة واحدة في نفس الطلب. */
  private degradedSids = new Map<string, number>();

  constructor(
    private readonly primary: session.Store,
    private readonly fallback: session.Store,
    private readonly cooldownMs = 30_000,
    /** عدد إخفاقات Redis داخل failureWindowMs قبل التحويل الكامل. */
    private readonly failureThreshold = 3,
    private readonly failureWindowMs = 10_000,
    /** عمر علامة «تعذّرت القراءة» — يكفي لعبور نفس الطلب فقط. */
    private readonly degradedMarkerTtlMs = 15_000,
  ) {
    super();
  }

  /**
   * هل تعذّرت قراءة هذه الجلسة للتوّ؟ تُستهلَك العلامة عند أول سؤال حتى لا
   * تُوسَم بها طلبات لاحقة نجحت قراءتها.
   */
  consumeDegradedRead(sid: string | null | undefined): boolean {
    if (!sid) return false;
    const at = this.degradedSids.get(sid);
    if (at === undefined) return false;
    this.degradedSids.delete(sid);
    return Date.now() - at <= this.degradedMarkerTtlMs;
  }

  private markDegradedRead(sid: string): void {
    const now = Date.now();
    // تشذيب كسول: العطل قد يمسّ آلاف الجلسات، ولا يجوز أن تنمو الخريطة بلا حد
    if (this.degradedSids.size > 5_000) {
      for (const [key, at] of this.degradedSids) {
        if (now - at > this.degradedMarkerTtlMs) this.degradedSids.delete(key);
      }
    }
    this.degradedSids.set(sid, now);
  }

  private useFallbackOnly(): boolean {
    return Date.now() < this.redisUnhealthyUntil;
  }

  /**
   * تسجيل إخفاق من Redis. لا يُحوَّل المخزن إلا إذا تجاوزت الإخفاقات العتبة
   * داخل النافذة — فالنبضة العابرة تُخدَم من الاحتياطي لهذا الطلب وحده،
   * وتبقى بقية الحركة على Redis.
   */
  private recordRedisFailure(reason: string) {
    const now = Date.now();
    this.recentFailures = this.recentFailures.filter((t) => now - t < this.failureWindowMs);
    this.recentFailures.push(now);
    if (this.recentFailures.length < this.failureThreshold) return;
    this.markRedisUnhealthy(reason);
  }

  private markRedisUnhealthy(reason: string) {
    this.redisUnhealthyUntil = Date.now() + this.cooldownMs;
    this.recentFailures = [];
    if (!this.loggedFailover) {
      console.warn(`[Session] Redis unhealthy (${reason}) — using PostgreSQL for ~${this.cooldownMs / 1000}s`);
      this.loggedFailover = true;
    }
  }

  /**
   * فشل المخزنان معًا على **قراءة**. الخيار بين أمرين: رمي الخطأ فيتحول إلى
   * صفحة 500 للزائر، أو اعتبار الطلب بلا جلسة. الثاني أقل ضررًا بفارق كبير:
   * أغلب الطلبات الحاملة لكوكي جلسة هي تصفّح عام (مقال، تصنيفات، شريط
   * عاجل) لا يقرأ req.user أصلًا. الطلبات المحمية تصير 401 بدل 500 — وهي
   * حالة يعرف العميل التعامل معها.
   *
   * مقصور على أخطاء البنية التحتية: خطأ بيانات حقيقي من PG يظل يُرمى.
   *
   * ولئلا يُفهم التدهور خطأً على أنه «انتهت جلستك»، تُسجَّل الجلسة هنا
   * ليضع الوسيط ترويسة SESSION_DEGRADED_HEADER على الرد؛ فيعيد العميل
   * المحاولة بدل طرد المستخدم إلى صفحة الدخول.
   */
  private degradeRead(sid: string, err: unknown, callback: StoreCallback): boolean {
    if (!isInfrastructureStoreError(err)) return false;
    this.markDegradedRead(sid);
    const now = Date.now();
    if (now - this.loggedDegradedRead > 10_000) {
      this.loggedDegradedRead = now;
      const reason = (err as StoreErrorShape)?.message ?? err;
      console.warn(
        `[Session] كلا المخزنين فشل على قراءة الجلسة (${String(reason)}) — يُعامل الطلب كزائر بلا جلسة`,
      );
    }
    callback(null, null);
    return true;
  }

  private clearFailoverFlag() {
    if (this.loggedFailover && !this.useFallbackOnly()) {
      this.loggedFailover = false;
      console.log("[Session] Redis recovered — primary store active again");
    }
  }

  get(sid: string, callback: StoreCallback): void {
    const fromFallback: StoreCallback = (err, sess) => {
      if (err && this.degradeRead(sid, err, callback)) return;
      callback(err, sess);
    };
    if (this.useFallbackOnly()) {
      this.fallback.get(sid, fromFallback);
      return;
    }
    this.primary.get(sid, (err, sess) => {
      if (!err) {
        this.clearFailoverFlag();
        callback(null, sess);
        return;
      }
      this.recordRedisFailure(err?.message || "get failed");
      this.fallback.get(sid, fromFallback);
    });
  }

  set(sid: string, sess: session.SessionData, callback?: SimpleCallback): void {
    if (this.useFallbackOnly()) {
      this.fallback.set(sid, sess, callback);
      return;
    }
    this.primary.set(sid, sess, (err) => {
      if (!err) {
        this.clearFailoverFlag();
        indexUserSession(sid, sess);
        callback?.(err);
        return;
      }
      this.recordRedisFailure(err?.message || "set failed");
      this.fallback.set(sid, sess, callback);
    });
  }

  /**
   * Passport/express-session تستدعي destroy عند regenerate أثناء login.
   * لا نُفشل العملية بخطأ Redis إذا نجح Postgres — وإلا يظهر «خطأ في إنشاء الجلسة»
   * رغم أن المصادقة نجحت (LocalStrategy Success).
   */
  destroy(sid: string, callback?: SimpleCallback): void {
    if (this.useFallbackOnly()) {
      this.fallback.destroy(sid, callback);
      return;
    }
    this.primary.destroy(sid, (err) => {
      if (!err) {
        this.clearFailoverFlag();
        // تنظيف أفضل جهد على PG؛ لا نُفشل الدخول إن فشل
        this.fallback.destroy(sid, () => callback?.());
        return;
      }
      this.recordRedisFailure(err?.message || "destroy failed");
      this.fallback.destroy(sid, callback);
    });
  }

  /**
   * touch تجديدٌ لعمر الجلسة لا أكثر، وتُستدعى في كل طلب ذي جلسة نشطة.
   * فشلها لا يفقد المستخدم جلسته — يبقى TTL السابق ساريًا حتى الطلب التالي.
   * لذلك **لا تُمرَّر أخطاؤها إلى express-session أبدًا**: كانت هذه أوسع
   * قنوات تحول نفاد مسبح PG إلى صفحات 500 أثناء نوبة 2026-07-25.
   */
  touch(sid: string, sess: session.SessionData, callback?: SimpleCallback): void {
    const fallbackTouch = (this.fallback as any).touch;
    const touchFallback = () => {
      if (typeof fallbackTouch !== "function") {
        callback?.();
        return;
      }
      fallbackTouch.call(this.fallback, sid, sess, () => callback?.());
    };

    if (this.useFallbackOnly()) {
      touchFallback();
      return;
    }
    const primaryTouch = (this.primary as any).touch;
    if (typeof primaryTouch !== "function") {
      callback?.();
      return;
    }
    primaryTouch.call(this.primary, sid, sess, (err: any) => {
      if (!err) {
        this.clearFailoverFlag();
        callback?.();
        return;
      }
      this.recordRedisFailure(err?.message || "touch failed");
      touchFallback();
    });
  }
}
