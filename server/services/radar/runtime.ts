/**
 * حالة تشغيل الرادار على مستوى جميع نسخ الخادم.
 *
 * لا توجد ذاكرة مؤقتة هنا عمداً: الإيقاف/التشغيل قرار تشغيلي ويجب أن تراه
 * كل النسخ قبل أي نداء خارجي أو كتابة نشطة. غياب الصف يرجع إلى RADAR_ENABLED؛
 * تعذر قراءة قاعدة البيانات يفشل مغلقاً حفاظاً على التكلفة.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { systemSettings } from "@shared/schema";
import { isRadarForceDisabled } from "./flags";

export const RADAR_RUNTIME_SETTING_KEY = "radar_runtime_enabled";

export type RadarRuntimeSource = "force_disabled" | "database" | "environment" | "unavailable";

export interface RadarRuntimeState {
  enabled: boolean;
  source: RadarRuntimeSource;
  /** سبب تشغيلي ثابت للاستهلاك الآلي والواجهة، أو null عند التفعيل. */
  reason: string | null;
}

/** خطأ متوقع عند إيقاف الرادار؛ تحوله المسارات إلى HTTP 503 منظّم. */
export class RadarDisabledError extends Error {
  readonly code = "RADAR_DISABLED";
  readonly reason: string;

  constructor(reason = "paused") {
    super("RADAR_DISABLED");
    this.name = "RadarDisabledError";
    this.reason = reason;
  }
}

function booleanSetting(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  // قبول الشكل الكائني الذي تستخدمه بعض مفاتيح system_settings القديمة،
  // مع بقاء القيمة المحفوظة لهذا المفتاح boolean صريحة.
  if (value && typeof value === "object" && "enabled" in value) {
    const enabled = (value as { enabled?: unknown }).enabled;
    return typeof enabled === "boolean" ? enabled : null;
  }
  return null;
}

export function isRadarDisabledError(error: unknown): error is RadarDisabledError {
  return error instanceof RadarDisabledError ||
    (Boolean(error) && typeof error === "object" && (error as any).code === "RADAR_DISABLED");
}

/** يقرأ الحالة الفعلية من DB في كل استدعاء، بلا cache بين الـ pods. */
export async function getRadarRuntimeState(): Promise<RadarRuntimeState> {
  if (isRadarForceDisabled()) {
    return { enabled: false, source: "force_disabled", reason: "force_disabled" };
  }

  try {
    const [setting] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, RADAR_RUNTIME_SETTING_KEY))
      .limit(1);

    if (setting) {
      const enabled = booleanSetting(setting.value);
      if (enabled === null) {
        return { enabled: false, source: "database", reason: "invalid_runtime_setting" };
      }
      return { enabled, source: "database", reason: enabled ? null : "paused" };
    }

    const enabled = process.env.RADAR_ENABLED === "true";
    return {
      enabled,
      source: "environment",
      reason: enabled ? null : "disabled_by_environment",
    };
  } catch (error) {
    console.error("[Radar] runtime setting read failed; failing closed", error);
    return { enabled: false, source: "unavailable", reason: "runtime_setting_unavailable" };
  }
}

export async function isRadarEnabled(): Promise<boolean> {
  return (await getRadarRuntimeState()).enabled;
}

export async function assertRadarEnabled(): Promise<void> {
  const state = await getRadarRuntimeState();
  if (!state.enabled) throw new RadarDisabledError(state.reason ?? "paused");
}

/** حفظ boolean ذرّيّاً كي يتغلب على RADAR_ENABLED دون إعادة نشر. */
export async function setRadarEnabled(enabled: boolean): Promise<RadarRuntimeState> {
  await db
    .insert(systemSettings)
    .values({
      key: RADAR_RUNTIME_SETTING_KEY,
      value: enabled,
      category: "radar",
      isPublic: false,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: enabled, category: "radar", isPublic: false, updatedAt: new Date() },
    });

  return getRadarRuntimeState();
}
