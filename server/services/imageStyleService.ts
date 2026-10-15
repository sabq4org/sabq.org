/**
 * Image Style Service — سجلّ أنماط توليد الصور
 *
 * يقرأ/يكتب مفتاح image_generation_styles في system_settings ويقدّم
 * حسم النمط والتوجيه السياقي والنموذج لمساري التوليد (اليدوي والتلقائي).
 * المنطق النقي كله في shared/imageStyles.ts — هنا طبقة التخزين والكاش فقط.
 */

import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  IMAGE_STYLE_SETTINGS_KEY,
  DEFAULT_IMAGE_STYLE_SETTINGS,
  normalizeImageStyleSettings,
  resolveImageStyle,
  matchContextVariant,
  resolveImageModel,
  toEditorImageStyle,
  imageStyleSettingsSchema,
  type ImageStyle,
  type ImageStyleContextVariant,
  type ImageStyleSettings,
  type EditorImageStyle,
} from "@shared/imageStyles";

// كاش ذاكرة قصير: الحوار يُفتح كثيرًا والإعدادات تتغير نادرًا.
// (متعمد عدم استخدام memoryCache العام — قيمة واحدة صغيرة بعمر ثابت)
const CACHE_TTL_MS = 60_000;
let cached: { value: ImageStyleSettings; expiresAt: number } | null = null;

function invalidateCache(): void {
  cached = null;
}

/**
 * جلب الإعدادات المطبَّعة — لا ترمي أبدًا: أي فشل (قراءة أو parse) يعيد
 * الافتراضيات المزروعة حتى لا يتعطل التوليد بسبب إعدادات فاسدة.
 */
export async function getImageStyleSettings(): Promise<ImageStyleSettings> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, IMAGE_STYLE_SETTINGS_KEY));

    const value = row?.value
      ? normalizeImageStyleSettings(row.value)
      : normalizeImageStyleSettings(DEFAULT_IMAGE_STYLE_SETTINGS);

    cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch (error) {
    console.error("[Image Styles] Error loading settings, using defaults:", error);
    return normalizeImageStyleSettings(DEFAULT_IMAGE_STYLE_SETTINGS);
  }
}

/**
 * حفظ الإعدادات (تُطبَّع وتُتحقق قبل الكتابة). يرمي ZodError عند شكل غير صالح —
 * المسار يحوّلها إلى 400.
 */
export async function saveImageStyleSettings(raw: unknown): Promise<ImageStyleSettings> {
  const parsed = imageStyleSettingsSchema.parse(raw);
  const normalized = normalizeImageStyleSettings(parsed);

  const [existing] = await db
    .select({ id: systemSettings.id })
    .from(systemSettings)
    .where(eq(systemSettings.key, IMAGE_STYLE_SETTINGS_KEY));

  if (existing) {
    await db
      .update(systemSettings)
      .set({ value: normalized as any, updatedAt: new Date() })
      .where(eq(systemSettings.key, IMAGE_STYLE_SETTINGS_KEY));
  } else {
    await db.insert(systemSettings).values({
      key: IMAGE_STYLE_SETTINGS_KEY,
      value: normalized as any,
      category: "ai",
      isPublic: false,
    });
  }

  invalidateCache();
  return normalized;
}

/** قائمة المحرر: الأنماط المفعّلة فقط، مرتبة، بدون نصوص البرومبت */
export async function listEditorImageStyles(): Promise<{
  styles: EditorImageStyle[];
  defaultSlug: string;
}> {
  const settings = await getImageStyleSettings();
  const enabled = settings.styles.filter((s) => s.enabled);
  const defaultStyle = resolveImageStyle(settings);
  return {
    styles: enabled.map(toEditorImageStyle),
    defaultSlug: defaultStyle.slug,
  };
}

export interface ResolvedGenerationStyle {
  style: ImageStyle;
  variant: ImageStyleContextVariant | null;
  model: string;
}

/**
 * حسم كامل لطلب توليد: النمط (بسلّم الأمان) + التوجيه السياقي + النموذج.
 */
export async function resolveGenerationStyle(
  requestedSlug?: string | null,
  category?: string | null,
  explicitModel?: string | null
): Promise<ResolvedGenerationStyle> {
  const settings = await getImageStyleSettings();
  const style = resolveImageStyle(settings, requestedSlug);
  const variant = matchContextVariant(style, category);
  const model = resolveImageModel(settings, style, explicitModel);
  return { style, variant, model };
}

export default {
  getImageStyleSettings,
  saveImageStyleSettings,
  listEditorImageStyles,
  resolveGenerationStyle,
};
