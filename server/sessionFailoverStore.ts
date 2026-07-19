import session from "express-session";

type StoreCallback = (err?: any, session?: session.SessionData | null) => void;
type SimpleCallback = (err?: any) => void;

/**
 * مخزن جلسات ثنائي: يفضّل Redis، وعند أي فشل/انقطاع ينتقل فوراً لـ Postgres
 * حتى لا تبقى الطلبات معلّقة (csrf / login / رفع ملفات → 502).
 *
 * لا ينسخ الجلسات بين المخزنين — بعد failover قد تُنشأ جلسة جديدة على PG
 * (المستخدم يعيد الدخول إن لزم). الأولوية: توفر اللوحة لا استمرار الجلسة القديمة.
 */
export class SessionFailoverStore extends session.Store {
  private redisUnhealthyUntil = 0;
  private loggedFailover = false;

  constructor(
    private readonly primary: session.Store,
    private readonly fallback: session.Store,
    private readonly cooldownMs = 30_000,
  ) {
    super();
  }

  private useFallbackOnly(): boolean {
    return Date.now() < this.redisUnhealthyUntil;
  }

  private markRedisUnhealthy(reason: string) {
    this.redisUnhealthyUntil = Date.now() + this.cooldownMs;
    if (!this.loggedFailover) {
      console.warn(`[Session] Redis unhealthy (${reason}) — using PostgreSQL for ~${this.cooldownMs / 1000}s`);
      this.loggedFailover = true;
    }
  }

  private clearFailoverFlag() {
    if (this.loggedFailover && !this.useFallbackOnly()) {
      this.loggedFailover = false;
      console.log("[Session] Redis recovered — primary store active again");
    }
  }

  get(sid: string, callback: StoreCallback): void {
    if (this.useFallbackOnly()) {
      this.fallback.get(sid, callback);
      return;
    }
    this.primary.get(sid, (err, sess) => {
      if (!err) {
        this.clearFailoverFlag();
        callback(null, sess);
        return;
      }
      this.markRedisUnhealthy(err?.message || "get failed");
      this.fallback.get(sid, callback);
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
        callback?.(err);
        return;
      }
      this.markRedisUnhealthy(err?.message || "set failed");
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
      this.markRedisUnhealthy(err?.message || "destroy failed");
      this.fallback.destroy(sid, callback);
    });
  }

  touch(sid: string, sess: session.SessionData, callback?: SimpleCallback): void {
    if (this.useFallbackOnly()) {
      if (typeof (this.fallback as any).touch === "function") {
        (this.fallback as any).touch(sid, sess, callback);
      } else {
        callback?.();
      }
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
        callback?.(err);
        return;
      }
      this.markRedisUnhealthy(err?.message || "touch failed");
      if (typeof (this.fallback as any).touch === "function") {
        (this.fallback as any).touch(sid, sess, callback);
      } else {
        callback?.();
      }
    });
  }
}
