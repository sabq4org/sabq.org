// ملخص الصباح لتطبيق «مكتب سبق» (2026-11-09): إشعار واحد يوميًا (08:00 الرياض)
// لكل عضو لديه جهاز ديسك مسجّل، بما ينتظر قراره. الأعداد من خدمة /staff/counts
// نفسها (بالصلاحيات الحية)، فلا يُخبَر أحد بما لا يراه. يحترم مفتاح
// `morningDigest` والساعات الهادئة. لا تغيير في المخطط: آخر يوم إرسال لكل عضو
// في system_settings (مفتاح staff_app.morning_digest_last:<userId>) ويُحجز
// ذريًا قبل الإرسال، فلا يتكرر عند إعادة التشغيل أو تبدّل القائد.

import { and, eq, inArray, sql } from "drizzle-orm";
import { pushDevices, systemSettings, users } from "@shared/schema";
import { STAFF_APP_BUNDLE_ID } from "@shared/staffApp";
import {
  STAFF_MORNING_DIGEST_DEEPLINK,
  STAFF_MORNING_DIGEST_PUSH_TYPE,
  buildStaffMorningDigestText,
  isMorningDigestSentToday,
  riyadhDayKey,
  type StaffMorningDigestCounts,
} from "@shared/staffMorningDigest";
import { db } from "../db";
import { STAFF_APP_SETTINGS_CATEGORY } from "./staffAlertPrefsService";
import { applyStaffDeskPrefs, loadStaffDeskPrefs } from "./staffAppPushService";
import { resolveStaffCapabilitiesAndRoles } from "./staffAppService";
import { getStaffDeskCounts } from "./staffDeskCountsService";
import { sendPushToUserApp } from "./userAppPushService";

const LOG_PREFIX = "[StaffMorningDigest]";
export const STAFF_MORNING_DIGEST_LAST_KEY_PREFIX = "staff_app.morning_digest_last:";

export function staffMorningDigestLastKey(userId: string): string {
  return `${STAFF_MORNING_DIGEST_LAST_KEY_PREFIX}${userId}`;
}

/** مفتاح الإيقاف: STAFF_MORNING_DIGEST=off (الافتراضي مفعّل). */
export function isStaffMorningDigestEnabled(): boolean {
  return (process.env.STAFF_MORNING_DIGEST || "").trim().toLowerCase() !== "off";
}

export interface StaffMorningDigestRunResult {
  day: string;
  candidates: number;
  sent: number;
  /** أُرسل اليوم مسبقًا، أو أطفأ العضو الملخص، أو لا شيء ينتظره. */
  skipped: number;
  failed: number;
}

/** الأعضاء النشطون الذين لديهم جهاز «مكتب سبق» مفعّل. */
async function listDeskDeviceMembers(): Promise<{ id: string; role: string | null }[]> {
  const deskDeviceUserIds = db
    .select({ userId: pushDevices.userId })
    .from(pushDevices)
    .where(and(eq(pushDevices.bundleId, STAFF_APP_BUNDLE_ID), eq(pushDevices.isActive, true)));
  return db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.status, "active"), inArray(users.id, deskDeviceUserIds)));
}

async function loadLastSent(userIds: string[]): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  if (userIds.length === 0) return out;
  const rows = await db
    .select({ key: systemSettings.key, value: systemSettings.value })
    .from(systemSettings)
    .where(inArray(systemSettings.key, userIds.map(staffMorningDigestLastKey)));
  for (const row of rows) out.set(row.key.slice(STAFF_MORNING_DIGEST_LAST_KEY_PREFIX.length), row.value);
  return out;
}

/**
 * يحجز إرسال اليوم لهذا العضو ذريًا؛ true إن حجزته هذه النسخة (فتُرسل هي).
 * نسخة ثانية أو تشغيل ثانٍ في اليوم نفسه يرجع false.
 */
async function claimDigestDay(userId: string, day: string, now: Date): Promise<boolean> {
  const value = { day, at: now.toISOString() };
  const rows = await db
    .insert(systemSettings)
    .values({ key: staffMorningDigestLastKey(userId), value, category: STAFF_APP_SETTINGS_CATEGORY, isPublic: false })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: now },
      setWhere: sql`coalesce(${systemSettings.value}->>'day', '') <> ${day}`,
    })
    .returning({ id: systemSettings.id });
  return rows.length > 0;
}

type MemberOutcome = "sent" | "skipped" | "failed";

async function sendDigestToMember(
  member: { id: string; role: string | null },
  day: string,
  now: Date,
): Promise<MemberOutcome> {
  const { capabilities } = await resolveStaffCapabilitiesAndRoles(member.id, member.role);
  const counts = await getStaffDeskCounts({ userId: member.id, capabilities, includeAlerts: false, now });
  const digest: StaffMorningDigestCounts = {
    tweets: counts.inbox.social,
    opinion: counts.opinionPending,
    messages: counts.inbox.tickets,
    news: counts.news.reporters + counts.news.email,
    editRequests: counts.news.editRequests,
  };
  const text = buildStaffMorningDigestText(digest);
  if (!text) return "skipped";

  const prefs = await loadStaffDeskPrefs([member.id]);
  const message = applyStaffDeskPrefs(
    prefs.get(member.id),
    "morningDigest",
    {
      title: text.title,
      body: text.body,
      type: STAFF_MORNING_DIGEST_PUSH_TYPE,
      deeplink: STAFF_MORNING_DIGEST_DEEPLINK,
      data: {
        day,
        tweets: String(digest.tweets),
        opinion: String(digest.opinion),
        messages: String(digest.messages),
        news: String(digest.news),
        editRequests: String(digest.editRequests),
      },
      collapseId: `desk-morning-digest-${day}`,
      badge: counts.badge,
    },
    now,
  );
  if (!message) return "skipped";

  // الحجز قبل الإرسال: «مرة على الأكثر» — فشل الإرسال لا يُعاد في اليوم نفسه.
  if (!(await claimDigestDay(member.id, day, now))) return "skipped";
  const result = await sendPushToUserApp(member.id, STAFF_APP_BUNDLE_ID, message);
  return result.sent > 0 ? "sent" : "failed";
}

let running = false;

/**
 * يرسل ملخص الصباح لكل عضو لم يصله اليوم (بتوقيت الرياض). تسلسلي (عضو بعد
 * عضو) حتى لا يزاحم مجمع الاتصالات؛ فشل عضو لا يوقف البقية. لا يرمي.
 */
export async function runMorningDigest(now: Date = new Date()): Promise<StaffMorningDigestRunResult> {
  const day = riyadhDayKey(now);
  const result: StaffMorningDigestRunResult = { day, candidates: 0, sent: 0, skipped: 0, failed: 0 };
  if (running) return result;
  running = true;
  try {
    const members = await listDeskDeviceMembers();
    result.candidates = members.length;
    if (members.length === 0) return result;

    const ids = members.map((m) => m.id);
    const [lastSent, prefs] = await Promise.all([loadLastSent(ids), loadStaffDeskPrefs(ids)]);

    for (const member of members) {
      if (isMorningDigestSentToday(lastSent.get(member.id), now) || prefs.get(member.id)?.morningDigest === false) {
        result.skipped += 1;
        continue;
      }
      try {
        result[await sendDigestToMember(member, day, now)] += 1;
      } catch (error) {
        result.failed += 1;
        console.error(`${LOG_PREFIX} member failed:`, error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} run failed:`, error instanceof Error ? error.message : error);
  } finally {
    running = false;
    console.log(
      `${LOG_PREFIX} ${day}: candidates=${result.candidates} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
    );
  }
  return result;
}
