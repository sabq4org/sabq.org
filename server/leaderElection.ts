import { pool } from "./db";

const LEADER_LOCK_ID = 12345;

let _isLeader = false;
let _podId = `${process.pid}-${Date.now()}`;
let _leaderCheckInterval: ReturnType<typeof setInterval> | null = null;
let _onBecomeLeaderCallback: (() => void) | null = null;

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

export async function tryBecomeLeader(): Promise<boolean> {
  try {
    // Try to acquire PostgreSQL advisory lock (non-blocking)
    const result = await pool.query('SELECT pg_try_advisory_lock($1) as locked', [LEADER_LOCK_ID]);
    const gotLock = result.rows[0]?.locked === true;
    
    if (gotLock) {
      _isLeader = true;
      console.log(`[Leader Election] 👑 This pod (${_podId}) acquired leader lock - now the LEADER`);
      console.log(`[Leader Election] 📋 Background jobs will run on this pod`);
      return true;
    } else {
      _isLeader = false;
      console.log(`[Leader Election] ⏳ Pod (${_podId}) could not acquire leader lock - another pod is the leader`);
      return false;
    }
  } catch (error) {
    console.error(`[Leader Election] ❌ Error trying to become leader:`, error);
    _isLeader = false;
    return false;
  }
}

// Start periodic leader check for failover (if current leader dies, try to take over)
let _electionInFlight = false;

export function startLeaderElectionLoop(intervalMs: number = 30000): void {
  if (_leaderCheckInterval) return;
  
  _leaderCheckInterval = setInterval(async () => {
    if (_isLeader || _electionInFlight) return;
    
    _electionInFlight = true;
    try {
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
  
  console.log(`[Leader Election] Started leader election loop (every ${intervalMs/1000}s)`);
}

export async function releaseLeadership(): Promise<void> {
  if (!_isLeader) return;
  
  try {
    await pool.query('SELECT pg_advisory_unlock($1)', [LEADER_LOCK_ID]);
    console.log(`[Leader Election] 🔓 Released leader lock`);
    _isLeader = false;
  } catch (error) {
    console.error(`[Leader Election] ❌ Failed to release leader lock:`, error);
  }
}

process.on("SIGTERM", async () => {
  await releaseLeadership();
});

process.on("SIGINT", async () => {
  await releaseLeadership();
});
