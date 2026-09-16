import Redis from "ioredis";

let redisClient: Redis | null = null;
let _redisConnected = false;
let _initAttempted = false;
let sessionAdapter: RedisSessionClient | null = null;
let _redisConfigured = false;

export interface RedisSessionClient {
  get(key: string): Promise<string | null>;
  set(key: string, val: string, opts?: any): Promise<any>;
  del(keys: string | string[]): Promise<number>;
  expire(key: string, ttl: number): Promise<number>;
  scan(...args: any[]): Promise<any>;
  /** قراءة دفعة مفاتيح برحلة واحدة — بديل GET المتسلسل في إبطال الجلسات. */
  mget(keys: string[]): Promise<(string | null)[]>;
  /** الفهرس العكسي usess:<userId> — مجموعة معرّفات جلسات المستخدم. */
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  /** SET NX PX الذرّي — للأقفال/الـleases (انتخاب القائد). يعيد "OK" عند النجاح وإلا null. */
  setLock(key: string, val: string, ttlMs: number): Promise<"OK" | null>;
}

function createSessionAdapter(client: Redis): RedisSessionClient {
  return {
    get: (key: string) => client.get(key),
    set: (key: string, val: string, opts?: any) => {
      if (opts?.expiration) {
        return client.set(key, val, opts.expiration.type, opts.expiration.value);
      }
      return client.set(key, val);
    },
    del: (keys: string | string[]) => {
      const keyArr = Array.isArray(keys) ? keys : [keys];
      return client.del(...keyArr);
    },
    expire: (key: string, ttl: number) => client.expire(key, ttl),
    scan: (...args: any[]) => (client as any).scan(...args),
    mget: (keys: string[]) => (keys.length ? client.mget(...keys) : Promise.resolve([])),
    sadd: (key: string, ...members: string[]) =>
      members.length ? client.sadd(key, ...members) : Promise.resolve(0),
    smembers: (key: string) => client.smembers(key),
    setLock: (key: string, val: string, ttlMs: number) =>
      client.set(key, val, "PX", ttlMs, "NX") as Promise<"OK" | null>,
  };
}

function ensureRedisInit(): void {
  if (_initAttempted) return;
  _initAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;

  _redisConfigured = true;

  try {
    const client = new Redis(redisUrl, {
      // فشل سريع بدل طابور بلا نهاية عند انقطاع Upstash / تغيّر Static IP
      maxRetriesPerRequest: 1,
      commandTimeout: 2500,
      connectTimeout: 3000,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
      enableReadyCheck: false,
    });

    client.on("ready", () => {
      _redisConnected = true;
      console.log("[Redis] Connected and ready");
    });

    client.on("error", (err) => {
      if (_redisConnected) {
        console.error("[Redis] Connection error:", err.message);
      }
      _redisConnected = false;
    });

    client.on("close", () => {
      _redisConnected = false;
    });

    sessionAdapter = createSessionAdapter(client);
    redisClient = client;

    client.connect().then(() => {
      _redisConnected = true;
    }).catch((err) => {
      console.warn(
        "[Redis] Failed to connect — session failover will use PostgreSQL until Redis recovers:",
        err.message,
      );
      _redisConnected = false;
    });
  } catch (err: any) {
    console.error("[Redis] Failed to initialize:", err.message);
    _redisConfigured = false;
    sessionAdapter = null;
  }
}

/**
 * للجلسات: يعيد الـ adapter إن وُجد REDIS_URL (حتى قبل ready).
 * الأوامر تفشل بسرعة بفضل commandTimeout / enableOfflineQueue:false
 * فيحوّلها SessionFailoverStore إلى Postgres.
 */
export function getRedisSessionAdapter(): RedisSessionClient | null {
  ensureRedisInit();
  return _redisConfigured ? sessionAdapter : null;
}

/**
 * لبقية الأنظمة (leader election، alerts…): فقط بعد اتصال ناجح.
 */
export function getRedisClient(): RedisSessionClient | null {
  ensureRedisInit();
  return _redisConnected ? sessionAdapter : null;
}

export function isRedisAvailable(): boolean {
  ensureRedisInit();
  return _redisConnected && sessionAdapter !== null;
}
