// تفضيلات تنبيهات تطبيق الديسك لكل مشرف — مخزنة في system_settings
// (مفتاح staff_app.alert_prefs:<userId>) دون أي تغيير في المخطط.
// غياب الصف يعني أن التنبيهين مفعّلان.
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { DEFAULT_STAFF_ALERT_PREFS, type StaffAlertPrefs } from "@shared/staffApp";

export const STAFF_ALERT_PREFS_KEY_PREFIX = "staff_app.alert_prefs:";
export const STAFF_APP_SETTINGS_CATEGORY = "staff_app";

export function staffAlertPrefsKey(userId: string): string {
  return `${STAFF_ALERT_PREFS_KEY_PREFIX}${userId}`;
}

/** يطبع القيمة المخزنة: أي حقل غير منطقي (boolean) يرجع للافتراضي (مفعّل). */
export function normalizeStaffAlertPrefs(value: unknown): StaffAlertPrefs {
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    aiAlerts:
      typeof obj.aiAlerts === "boolean" ? obj.aiAlerts : DEFAULT_STAFF_ALERT_PREFS.aiAlerts,
    adminAlerts:
      typeof obj.adminAlerts === "boolean" ? obj.adminAlerts : DEFAULT_STAFF_ALERT_PREFS.adminAlerts,
  };
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
  if (typeof patch.aiAlerts === "boolean") changes.aiAlerts = patch.aiAlerts;
  if (typeof patch.adminAlerts === "boolean") changes.adminAlerts = patch.adminAlerts;
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
