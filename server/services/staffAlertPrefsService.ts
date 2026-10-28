// تفضيلات تنبيهات تطبيق الديسك لكل عضو — مخزنة في system_settings
// (مفتاح staff_app.alert_prefs:<userId>) دون أي تغيير في المخطط.
// غياب الصف يعني أن كل التنبيهات مفعّلة وبلا ساعات هادئة.
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import {
  DEFAULT_STAFF_ALERT_PREFS,
  STAFF_QUIET_HOURS,
  type StaffAlertKind,
  type StaffAlertPrefs,
  type StaffQuietHours,
} from "@shared/staffApp";

const STAFF_ALERT_KINDS: StaffAlertKind[] = [
  "aiAlerts",
  "adminAlerts",
  "writerMessages",
  "socialProposals",
  "opinionDrafts",
];

function isQuietHours(value: unknown): value is StaffQuietHours {
  return typeof value === "string" && (STAFF_QUIET_HOURS as readonly string[]).includes(value);
}

export const STAFF_ALERT_PREFS_KEY_PREFIX = "staff_app.alert_prefs:";
export const STAFF_APP_SETTINGS_CATEGORY = "staff_app";

export function staffAlertPrefsKey(userId: string): string {
  return `${STAFF_ALERT_PREFS_KEY_PREFIX}${userId}`;
}

/** يطبع القيمة المخزنة: أي حقل غير صالح يرجع للافتراضي (مفعّل، وبلا ساعات هادئة). */
export function normalizeStaffAlertPrefs(value: unknown): StaffAlertPrefs {
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out: StaffAlertPrefs = { ...DEFAULT_STAFF_ALERT_PREFS };
  for (const kind of STAFF_ALERT_KINDS) {
    if (typeof obj[kind] === "boolean") out[kind] = obj[kind] as boolean;
  }
  if (isQuietHours(obj.quietHours)) out.quietHours = obj.quietHours;
  return out;
}

export async function getStaffAlertPrefs(userId: string): Promise<StaffAlertPrefs> {
  const rows = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, staffAlertPrefsKey(userId)))
    .limit(1);
  return normalizeStaffAlertPrefs(rows[0]?.value);
}

export async function getStaffAlertPrefsForUsers(
  userIds: string[],
): Promise<Map<string, StaffAlertPrefs>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, StaffAlertPrefs>();
  for (const id of unique) out.set(id, { ...DEFAULT_STAFF_ALERT_PREFS });
  if (unique.length === 0) return out;
  const rows = await db
    .select({ key: systemSettings.key, value: systemSettings.value })
    .from(systemSettings)
    .where(inArray(systemSettings.key, unique.map(staffAlertPrefsKey)));
  for (const row of rows) {
    const userId = row.key.slice(STAFF_ALERT_PREFS_KEY_PREFIX.length);
    out.set(userId, normalizeStaffAlertPrefs(row.value));
  }
  return out;
}

/**
 * يدمج الحقول المرسلة فقط في القيمة المخزنة بعملية upsert واحدة ذرية،
 * فلا يعيد طلبان متزامنان يعطّل كل منهما مفتاحاً مختلفاً تفعيلَ الآخر.
 */
export async function updateStaffAlertPrefs(
  userId: string,
  patch: Partial<StaffAlertPrefs>,
): Promise<StaffAlertPrefs> {
  const changes: Partial<StaffAlertPrefs> = {};
  for (const kind of STAFF_ALERT_KINDS) {
    const value = patch[kind];
    if (typeof value === "boolean") changes[kind] = value;
  }
  if (isQuietHours(patch.quietHours)) changes.quietHours = patch.quietHours;
  if (Object.keys(changes).length === 0) return getStaffAlertPrefs(userId);

  const rows = await db
    .insert(systemSettings)
    .values({
      key: staffAlertPrefsKey(userId),
      value: { ...DEFAULT_STAFF_ALERT_PREFS, ...changes },
      category: STAFF_APP_SETTINGS_CATEGORY,
      isPublic: false,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        // صف تالف (غير كائن) يُعامل ككائن فارغ قبل الدمج.
        value: sql`(CASE WHEN jsonb_typeof(${systemSettings.value}) = 'object' THEN ${systemSettings.value} ELSE '{}'::jsonb END) || ${JSON.stringify(changes)}::jsonb`,
        updatedAt: new Date(),
      },
    })
    .returning({ value: systemSettings.value });
  return normalizeStaffAlertPrefs(rows[0]?.value);
}
