import { pool } from "./db";

const LEADER_LOCK_ID = 12345;

// ── لماذا جلسة مخصّصة للقفل؟ ─────────────────────────────────────────────────
// القفل الاستشاري في Postgres مرتبط بجلسة (اتصال) واحدة. أخذُه سابقًا عبر
// pool.query كان يضعه على اتصالٍ عشوائي من المسبح: إن أُعيد تدوير ذلك الاتصال
// ضاع القفل بصمت، وunlock قد يذهب لاتصالٍ آخر فلا يفكّ شيئًا. وبعد النشر قد
// يعلق القفل مع جلسة الحاوية القديمة فيبقى الـpod الجديد «تابعًا» للأبد —
// فتموت أعمال الدفع (Live Activity/التنبيهات) بينما الـAPI يعمل (فخ موثّق).
// الآن: اتصال محجوز حصريًّا للقفل + نبضٌ دوري يتحقق أن الجلسة حيّة؛ أي فشل =
// تنازلٌ فوري وإعادة انتخاب في الدورة التالية — تعافٍ ذاتي بلا تدخّل يدوي.

type LeaderClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
  release: (destroy?: boolean) => void;
  on: (event: string, cb: (...args: any[]) => void) => void;
};

let _client: LeaderClient | null = null;
let _isLeader = false;
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

/**
 * Register a callback to be called when this pod becomes the leader
 * This is used to start background workers on failover
 */
export function onBecomeLeader(callback: () => void): void {
  _onBecomeLeaderCallback = callback;
}

/** تنازل عن القيادة وإتلاف جلسة القفل — الانتخاب الدوري سيعيد المحاولة. */
function demote(): void {
  _isLeader = false;
  if (_client) {
    try {
      _client.release(true); // true = إتلاف الاتصال (لا إعادته للمسبح بقفلٍ عالق)
    } catch {}
    _client = null;
  }
}

export async function tryBecomeLeader(): Promise<boolean> {
  if (_isLeader && _client) return true;
  try {
    const client = (await (pool as any).connect()) as LeaderClient;
    const result = await client.query("SELECT pg_try_advisory_lock($1) as locked", [LEADER_LOCK_ID]);
    const gotLock = result.rows[0]?.locked === true;

    if (gotLock) {
      _client = client;
      _isLeader = true;
      // انقطاع جلسة القفل لأي سبب = لم نعد قائدًا — تنازل فوري.
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

/** نبض القائد: الجلسة الحاملة للقفل حيّة؟ (القفل يعيش ويموت معها). */
async function verifyLeadership(): Promise<void> {
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

// Start periodic leader check: heartbeat while leader, re-election while follower.
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
  if (!_isLeader || !_client) {
    demote();
    return;
  }
  try {
    await _client.query("SELECT pg_advisory_unlock($1)", [LEADER_LOCK_ID]);
    console.log(`[Leader Election] 🔓 Released leader lock`);
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
