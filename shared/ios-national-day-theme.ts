/**
 * ثيم اليوم الوطني لتطبيق iOS — مفتاح واحد مشترك بين لوحة التحكم والـAPI
 * وتطبيق iOS. الافتراضي معطّل، ولا علاقة له بثيم الموقع (NationalDay96Theme)
 * ولا بتطبيق أندرويد.
 */

export const IOS_NATIONAL_DAY_THEME_SETTING_KEY = "ios_national_day_theme";

export interface IosNationalDayThemeConfig {
  /** مفعّل؟ الافتراضي false — التطبيق يعود لهويته الأصلية عند الإطفاء. */
  enabled: boolean;
  /** آخر تعديل (ISO) — يظهر في لوحة التحكم فقط. */
  updatedAt: string | null;
}

export const DEFAULT_IOS_NATIONAL_DAY_THEME: IosNationalDayThemeConfig = {
  enabled: false,
  updatedAt: null,
};

/**
 * يقرأ القيمة المخزّنة في `system_settings` بشكل متسامح: الصف قد يكون غائبًا،
 * أو `{ enabled: true }`، أو قيمة منطقية مجرّدة من نسخة أقدم. أي شكل غير
 * معروف يسقط على «معطّل» — وهو الوضع الآمن.
 */
export function parseIosNationalDayThemeConfig(
  value: unknown,
): IosNationalDayThemeConfig {
  if (typeof value === "boolean") {
    return { enabled: value, updatedAt: null };
  }
  if (value && typeof value === "object") {
    const raw = value as Partial<IosNationalDayThemeConfig>;
    return {
      enabled: raw.enabled === true,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    };
  }
  return { ...DEFAULT_IOS_NATIONAL_DAY_THEME };
}
