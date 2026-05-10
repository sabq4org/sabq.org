import Redis from "ioredis";

let redisClient: Redis | null = null;
let _redisConnected = false;
let _initAttempted = false;

export interface RedisSessionClient {
  get(key: string): Promise<string | null>;
  set(key: string, val: string, opts?: any): Promise<any>;
  del(keys: string | string[]): Promise<number>;
  expire(key: string, ttl: number): Promise<number>;
  scan(...args: any[]): Promise<any>;
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
  };
}

let sessionAdapter: RedisSessionClient | null = null;

export function getRedisClient(): RedisSessionClient | null {
  if (_initAttempted) return _redisConnected ? sessionAdapter : null;
  _initAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
      enableReadyCheck: false,
      connectTimeout: 5000,
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
      console.warn("[Redis] Failed to connect, falling back to PostgreSQL sessions:", err.message);
      _redisConnected = false;
      sessionAdapter = null;
      try { client.disconnect(); } catch {}
    });

    return sessionAdapter;
  } catch (err: any) {
    console.error("[Redis] Failed to initialize:", err.message);
    return null;
  }
}

export function isRedisAvailable(): boolean {
  return _redisConnected && sessionAdapter !== null;
}
