import { pool } from "./db";
import { getRedisClient } from "./redis";

const LEADER_LOCK_ID = 12345;
const LEASE_KEY = "sabq:leader:lease";
// صلاحية الـlease — أكبر من دورة الانتخاب (60ث في index.ts) بهامش مريح؛ موت
// القائد فجأة = استلام تلقائي خلال ≤ TTL + دورة (~3-4 دقائق كأسوأ حالة).
const LEASE_TTL_MS = 150_000;

// ── لماذا lease عبر Redis بدل القفل الاستشاري؟ ─────────────────────────────
// القفل الاستشاري في Postgres مرتبط بجلسة، واتصالات الإنتاج تمر عبر مجمّع
// Neon: موت الحاوية القديمة (بلا SIGTERM نظيف) لا يحرّر القفل لأن جلسة المجمّع
// الخلفية تبقى حيّة وتخلّده → الـpod الجديد «تابع» للأبد فتموت أعمال الدفع
// (Live Activity/التنبيهات/cron) بينما الـAPI يعمل — فخ إنتاجي موثّق تكرر
// بعد النشرات. الـlease بصلاحية زمنية يتعافى ذاتيًّا مهما حدث: انتهاء TTL
// يعني انتقال القيادة تلقائيًّا. القفل الاستشاري يبقى احتياطًا للتطوير بلا Redis
// — عبر جلسة محجوزة حصريًّا (لا pool.query الذي يضيّع القفل عند تدوير الاتصال).

type LeaderClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
  release: (destroy?: boolean) => void;
  on: (event: string, cb: (...args: any[]) => void) => void;
};

let _client: LeaderClient | null = null;
let _isLeader = false;
let _mode: "lease" | "advisory" | null = null;
const _podId = `${process.pid}-${Date.now()}`;
let _leaderCheckInterval: ReturnType<typeof setInterval> | null = null;
let _onBecomeLeaderCallback: (() => void) | null = null;
let _electionInFlight = false;

export function isLeader(): boolean {
  return _isLeader;
}

export function getPodId(): string {
  return _podId;
}

/** آلية القيادة الفعّالة — للتشخيص في /health. */
export function getLeaderMode(): string | null {
  return _mode;
}

/**
 * Register a callback to be called when this pod becomes the leader
 * This is used to start background workers on failover
 */
export function onBecomeLeader(callback: () => void): void {
  _onBecomeLeaderCallback = callback;
}

/** تنازل عن القيادة وإتلاف جلسة القفل الاستشاري إن وُجدت. */
function demote(): void {
  _isLeader = false;
  if (_client) {
    try {
      _client.release(true); // إتلاف الاتصال — لا نعيد للمسبح اتصالًا بقفل عالق
    } catch {}
    _client = null;
  }
}

export async function tryBecomeLeader(): Promise<boolean> {
  if (_isLeader) return true;

  const redis = getRedisClient();
  if (redis) {
    _mode = "lease";
    try {
      const acquired = await redis.setLock(LEASE_KEY, _podId, LEASE_TTL_MS);
      if (acquired === "OK") {
        _isLeader = true;
        console.log(`[Leader Election] 👑 Pod (${_podId}) acquired leader LEASE - now the LEADER`);
        console.log(`[Leader Election] 📋 Background jobs will run on this pod`);
        return true;
      }
      _isLeader = false;
      return false;
    } catch (error) {
      console.error(`[Leader Election] ❌ Lease acquire failed:`, error);
      _isLeader = false;
      return false;
    }
  }

  // احتياط التطوير (بلا Redis): قفل استشاري على جلسة محجوزة حصريًّا.
  _mode = "advisory";
  try {
    const client = (await (pool as any).connect()) as LeaderClient;
    const result = await client.query("SELECT pg_try_advisory_lock($1) as locked", [LEADER_LOCK_ID]);
    const gotLock = result.rows[0]?.locked === true;

    if (gotLock) {
      _client = client;
      _isLeader = true;
      client.on("error", () => {
        console.warn(`[Leader Election] ⚠️ Leader lock session error — demoting pod (${_podId})`);
        demote();
      });
      client.on("end", () => {
        if (_isLeader) {
          console.warn(`[Leader Election] ⚠️ Leader lock session closed — demoting pod (${_podId})`);
          demote();
        }
      });
      console.log(`[Leader Election] 👑 This pod (${_podId}) acquired leader lock - now the LEADER`);
      console.log(`[Leader Election] 📋 Background jobs will run on this pod`);
      return true;
    }

    client.release();
    _isLeader = false;
    console.log(`[Leader Election] ⏳ Pod (${_podId}) could not acquire leader lock - another pod is the leader`);
    return false;
  } catch (error) {
    console.error(`[Leader Election] ❌ Error trying to become leader:`, error);
    demote();
    return false;
  }
}

/** نبض القائد: يجدّد الـlease (أو يتحقق من حياة جلسة القفل) — أي فشل = تنازل. */
async function verifyLeadership(): Promise<void> {
  if (_mode === "lease") {
    const redis = getRedisClient();
    if (!redis) {
      demote();
      return;
    }
    try {
      const holder = await redis.get(LEASE_KEY);
      if (holder !== _podId) {
        console.warn(`[Leader Election] ⚠️ Lease lost to ${holder ?? "expiry"} — demoting pod (${_podId})`);
        demote();
        return;
      }
      await redis.expire(LEASE_KEY, Math.ceil(LEASE_TTL_MS / 1000));
    } catch {
      console.warn(`[Leader Election] ⚠️ Lease renewal failed — demoting pod (${_podId})`);
      demote();
    }
    return;
  }

  if (!_client) {
    demote();
    return;
  }
  try {
    await _client.query("SELECT 1");
  } catch {
    console.warn(`[Leader Election] ⚠️ Leader heartbeat failed — demoting pod (${_podId})`);
    demote();
  }
}

// Start periodic leader check: heartbeat/renewal while leader, re-election while follower.
export function startLeaderElectionLoop(intervalMs: number = 30000): void {
  if (_leaderCheckInterval) return;

  _leaderCheckInterval = setInterval(async () => {
    if (_electionInFlight) return;

    _electionInFlight = true;
    try {
      if (_isLeader) {
        await verifyLeadership();
        return;
      }
      const becameLeader = await tryBecomeLeader();
      if (becameLeader) {
        console.log(`[Leader Election] Failover: Pod (${_podId}) took over as leader`);
        if (_onBecomeLeaderCallback) {
          console.log(`[Leader Election] Starting background workers after failover...`);
          try {
            _onBecomeLeaderCallback();
            console.log(`[Leader Election] Background workers started successfully after failover`);
          } catch (error) {
            console.error(`[Leader Election] Error starting background workers after failover:`, error);
          }
        }
      }
    } finally {
      _electionInFlight = false;
    }
  }, intervalMs);

  console.log(`[Leader Election] Started leader election loop (every ${intervalMs / 1000}s)`);
}

export async function releaseLeadership(): Promise<void> {
  if (!_isLeader) {
    demote();
    return;
  }
  if (_mode === "lease") {
    try {
      const redis = getRedisClient();
      if (redis && (await redis.get(LEASE_KEY)) === _podId) {
        await redis.del(LEASE_KEY);
        console.log(`[Leader Election] 🔓 Released leader lease`);
      }
    } catch (error) {
      console.error(`[Leader Election] ❌ Failed to release leader lease:`, error);
    }
    demote();
    return;
  }
  try {
    if (_client) {
      await _client.query("SELECT pg_advisory_unlock($1)", [LEADER_LOCK_ID]);
      console.log(`[Leader Election] 🔓 Released leader lock`);
    }
  } catch (error) {
    console.error(`[Leader Election] ❌ Failed to release leader lock:`, error);
  }
  demote();
}

process.on("SIGTERM", async () => {
  await releaseLeadership();
});

process.on("SIGINT", async () => {
  await releaseLeadership();
});
