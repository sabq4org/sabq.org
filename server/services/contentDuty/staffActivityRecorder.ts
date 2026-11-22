// يسجّل دقائق نشاط المناوبين (staff_activity_minutes) من كل طلب موثّق ينتهي بنجاح.
// لا يسجّل إلا أصحاب الورديات، ويجمع الكتابة في دفعة كل 20 ثانية (آمن مع أكثر من نسخة:
// upsert على (user_id, minute)). غياب الجدول قبل تنفيذ SQL يوقف التسجيل بصمت 10 دقائق.
import type { NextFunction, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import type { ActivityKind } from "@shared/contentDuty";
import { listRosteredUserIds } from "./dutyRosterStore";

const FLUSH_MS = 20_000;
const ELIGIBLE_TTL_MS = 2 * 60_000;
const DISABLED_BACKOFF_MS = 10 * 60_000;
const MAX_BUFFER = 5_000;

// مسارات خلفية لا تعني أن الموظف يعمل (نبضات، تتبع، رموز). تُسجّل «متصل» لا «يعمل».
const PASSIVE_WRITE = /(heartbeat|presence|beacon|track|analytics|\/events\b|csrf|\/logout)/i;

const buffer = new Map<string, ActivityKind>();
const lastWritten = new Map<string, { minute: number; kind: ActivityKind }>();
let eligible: Set<string> = new Set();
let eligibleAt = 0;
let eligibleLoading: Promise<void> | null = null;
let disabledUntil = 0;
let timer: NodeJS.Timeout | null = null;

function refreshEligible(): void {
  if (eligibleLoading || Date.now() - eligibleAt < ELIGIBLE_TTL_MS) return;
  eligibleLoading = listRosteredUserIds()
    .then((ids) => {
      eligible = new Set(ids);
      eligibleAt = Date.now();
    })
    .catch(() => {
      eligibleAt = Date.now();
      disabledUntil = Date.now() + DISABLED_BACKOFF_MS;
    })
    .finally(() => {
      eligibleLoading = null;
    });
}

export function activityKindFor(method: string, path: string): ActivityKind | null {
  const m = method.toUpperCase();
  if (m === "OPTIONS") return null;
  if (m === "GET" || m === "HEAD") return "view";
  return PASSIVE_WRITE.test(path) ? "view" : "action";
}

export function recordStaffActivity(userId: string, kind: ActivityKind, at = Date.now()): void {
  if (Date.now() < disabledUntil) return;
  refreshEligible();
  if (!eligible.has(userId)) return;
  const minute = Math.floor(at / 60_000) * 60_000;
  const prev = lastWritten.get(userId);
  if (prev && prev.minute === minute && (prev.kind === "action" || kind === "view")) return;
  const key = `${userId}|${minute}`;
  if (buffer.get(key) === "action") return;
  if (buffer.size >= MAX_BUFFER) return;
  buffer.set(key, kind);
  ensureTimer();
}

function ensureTimer(): void {
  if (timer) return;
  timer = setInterval(() => {
    void flushStaffActivity();
  }, FLUSH_MS);
  timer.unref?.();
}

export async function flushStaffActivity(): Promise<void> {
  if (buffer.size === 0) return;
  const rows = Array.from(buffer.entries()).map(([key, kind]) => {
    const [userId, minute] = key.split("|");
    return { userId, minute: Number(minute), kind };
  });
  buffer.clear();
  try {
    const values = sql.join(
      rows.map((r) => sql`(${r.userId}, ${new Date(r.minute)}, ${r.kind})`),
      sql`, `,
    );
    await db.execute(sql`
      INSERT INTO staff_activity_minutes (user_id, minute, kind)
      VALUES ${values}
      ON CONFLICT (user_id, minute) DO UPDATE SET kind = 'action'
      WHERE excluded.kind = 'action' AND staff_activity_minutes.kind <> 'action'
    `);
    for (const r of rows) {
      const prev = lastWritten.get(r.userId);
      if (!prev || prev.minute < r.minute || (prev.minute === r.minute && r.kind === "action")) {
        lastWritten.set(r.userId, { minute: r.minute, kind: r.kind });
      }
    }
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01" || code === "42501") {
      disabledUntil = Date.now() + DISABLED_BACKOFF_MS;
    } else {
      console.error("[ContentDuty] activity flush failed");
    }
  }
}

/** يُركّب قبل كل المسارات: يقرأ هوية الطلب عند انتهائه (جلسة الويب أو جلسة «مكتب سبق»). */
export function staffActivityHook(req: Request, res: Response, next: NextFunction): void {
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    const r = req as Request & { user?: { id?: string }; staffAuth?: { user?: { id?: string } } };
    const userId = r.user?.id ?? r.staffAuth?.user?.id;
    if (!userId) return;
    const kind = activityKindFor(req.method, req.originalUrl || req.path);
    if (kind) recordStaffActivity(userId, kind);
  });
  next();
}

/** للاختبارات فقط */
export function __setEligibleForTests(ids: string[]): void {
  eligible = new Set(ids);
  eligibleAt = Date.now();
  disabledUntil = 0;
}

export function __bufferForTests(): Map<string, ActivityKind> {
  return buffer;
}
