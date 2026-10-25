// سجل قصير لأخبار «عاجل» التي انتهت تلقائياً (تحوّلت إلى regular) ليعرضها
// تطبيق الديسك في /api/v1/staff/alerts. بعد التحويل لا يبقى في المقال ما يدل
// على أنه كان عاجلاً، لذا تكتب وظيفة الانتهاء (على القائد فقط) هذا السجل في
// صف system_settings واحد. يُحتفظ بآخر 24 ساعة وبحد أقصى 30 عنصراً.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import type { ExpiredBreakingResult } from "./breakingNewsService";
import { STAFF_APP_SETTINGS_CATEGORY } from "./staffAlertPrefsService";

export const BREAKING_EXPIRED_LOG_KEY = "staff_app.breaking_expired_recent";
const MAX_ENTRIES = 30;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface BreakingExpiredEntry {
  id: string;
  lang: "ar" | "en" | "ur";
  expiredAt: string;
}

export function normalizeBreakingExpiredLog(value: unknown, now: Date = new Date()): BreakingExpiredEntry[] {
  const list = Array.isArray(value) ? value : [];
  const since = now.getTime() - WINDOW_MS;
  return list
    .filter(
      (e): e is BreakingExpiredEntry =>
        Boolean(e) &&
        typeof e.id === "string" &&
        (e.lang === "ar" || e.lang === "en" || e.lang === "ur") &&
        typeof e.expiredAt === "string" &&
        Date.parse(e.expiredAt) >= since,
    )
    .slice(-MAX_ENTRIES);
}

export async function readBreakingExpiredLog(now: Date = new Date()): Promise<BreakingExpiredEntry[]> {
  const rows = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, BREAKING_EXPIRED_LOG_KEY))
    .limit(1);
  return normalizeBreakingExpiredLog(rows[0]?.value, now);
}

export async function recordExpiredBreakingArticles(
  result: ExpiredBreakingResult,
  now: Date = new Date(),
): Promise<void> {
  const fresh: BreakingExpiredEntry[] = [
    ...result.ar.map((a) => ({ id: a.id, lang: "ar" as const, expiredAt: now.toISOString() })),
    ...result.en.map((a) => ({ id: a.id, lang: "en" as const, expiredAt: now.toISOString() })),
    ...result.ur.map((a) => ({ id: a.id, lang: "ur" as const, expiredAt: now.toISOString() })),
  ];
  if (fresh.length === 0) return;
  const existing = await readBreakingExpiredLog(now);
  const next = normalizeBreakingExpiredLog([...existing, ...fresh], now);
  await db
    .insert(systemSettings)
    .values({
      key: BREAKING_EXPIRED_LOG_KEY,
      value: next,
      category: STAFF_APP_SETTINGS_CATEGORY,
      isPublic: false,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: next, updatedAt: new Date() },
    });
}
