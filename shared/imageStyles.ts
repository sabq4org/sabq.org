/**
 * أنماط توليد الصور (Image Generation Styles)
 *
 * سجلّ مركزي واحد لأنماط توليد الصور يستهلكه:
 *  - حوار التوليد في المحرر (بطاقات اختيار النمط)
 *  - مسار التوليد التلقائي (visualAiService / autoImageGenerationService)
 *  - صفحة الإدارة في لوحة التحكم (AutoImageSettings)
 *
 * التخزين: مفتاح JSON واحد في system_settings (بدون تغيير schema) — انظر
 * server/services/imageStyleService.ts. هذا الملف يحوي الشكل (Zod) والمنطق
 * النقي فقط (بلا وصول لقاعدة البيانات) ليكون قابلًا للاختبار ومشتركًا.
 */

import { z } from "zod";

/** مفتاح التخزين في system_settings */
export const IMAGE_STYLE_SETTINGS_KEY = "image_generation_styles";

/**
 * النماذج المعروفة لتوليد الصور (عائلة Nano Banana على Gemini API).
 * defaultModel في الإعدادات يقبل أي معرّف نصي — هذه القائمة للعرض في اللوحة
 * ولتقدير التكلفة فقط، وليست قيدًا.
 */
/**
 * النماذج المعروفة لتوليد الصور ومجالات تخصصها المثلى.
 */
export const KNOWN_IMAGE_MODELS = [
  {
    id: "gemini-3.1-flash-image-preview",
    label: "Nano Banana 2 — Gemini 3.1 Flash Image (سريع ومتوازن)",
    provider: "google",
    specialty: "general_fast",
    recommendedFor: "الأخبار العامة والتوليد التلقائي السريع",
  },
  {
    id: "gemini-3-pro-image-preview",
    label: "Nano Banana Pro — Gemini 3 Pro Image (واقعية وبحث متقدم)",
    provider: "google",
    specialty: "realistic_grounded",
    recommendedFor: "التحقيقات والتقارير الميدانية ذات التحقق الجغرافي",
  },
  {
    id: "recraft-v3",
    label: "Recraft v3 Engine (إنفوجرافيك وفيكتور ورسوم المقالات)",
    provider: "recraft",
    specialty: "infographic_vector",
    recommendedFor: "الإنفوجرافيك والبيانات الإحصائية ورسوم مقالات الرأي",
  },
  {
    id: "flux-1.1-pro",
    label: "FLUX.1.1 Pro (أعلى واقعية فوتوغرافية وإضاءة صحفية)",
    provider: "bfl",
    specialty: "ultra_photorealistic",
    recommendedFor: "الصور الفوتوغرافية الميدانية والبورتريه الصحفي عالي التفاصيل",
  },
  {
    id: "ideogram-2",
    label: "Ideogram 2.0 (تصاميم تيبوغرافية ولافتات)",
    provider: "ideogram",
    specialty: "typography_design",
    recommendedFor: "الملصقات والأغلفة واللافتات التعبيرية",
  },
] as const;

/** نوع المهمة البصرية لتوجيه النموذج الأمثل */
export type ImageTaskIntent = "infographic" | "photo" | "opinion_art" | "breaking_banner" | "custom";

/** النموذج الافتراضي للتوليد (قرار المالك 2026-08-08: Nano Banana 2) */
export const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

/** النموذج القديم المجرَّب — يُستخدم fallback عند فشل نموذج أحدث */
export const LEGACY_IMAGE_MODEL = "gemini-3-pro-image-preview";

export const imageAspectRatios = ["1:1", "16:9", "4:3", "9:16", "21:9", "3:4"] as const;
export const imageSizes = ["1K", "2K", "4K"] as const;

/** إعدادات توليد مبدئية يفرضها النمط (كلها اختيارية) */
export const imageStyleParamsSchema = z.object({
  aspectRatio: z.enum(imageAspectRatios).optional(),
  imageSize: z.enum(imageSizes).optional(),
  /** override لنموذج التوليد لهذا النمط فقط */
  model: z.string().trim().min(1).max(100).optional(),
  enableThinking: z.boolean().optional(),
  enableSearchGrounding: z.boolean().optional(),
});

/**
 * توجيه فرعي داخل النمط حسب سياق الخبر (مثال: الواقعية الغذائية/الطبية).
 * المطابقة عبر تصنيف الخبر الموجود أصلًا — لا مصنّف جديد ولا كلمات مفتاحية هشة.
 */
export const imageStyleContextVariantSchema = z.object({
  slug: z.string().trim().min(1).max(50).regex(/^[a-z0-9-]+$/),
  /** اسم يظهر للمشرف وكشارة صغيرة للمحرر */
  label: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  /**
   * قائمة تصنيفات تُطابَق ضد slug التصنيف أو اسمه (مقارنة مطبَّعة غير حساسة
   * لحالة الأحرف). قابلة للتحرير من اللوحة.
   */
  categories: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
  stylePrompt: z.string().trim().min(1).max(3000),
  negativePrompt: z.string().trim().max(1500).optional(),
});

export const imageStyleSchema = z.object({
  /** معرّف داخلي ثابت لا يتغير بعد الإنشاء */
  slug: z.string().trim().min(1).max(50).regex(/^[a-z0-9-]+$/),
  nameAr: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().max(60).optional(),
  description: z.string().trim().max(200).default(""),
  /** اسم أيقونة lucide (مثل camera / palette / pen-tool) */
  icon: z.string().trim().max(40).optional(),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isDefault: z.boolean().default(false),
  /** تعليمات الأسلوب (بالإنجليزية للنموذج) — «كيف تبدو الصورة» */
  stylePrompt: z.string().trim().min(1).max(3000),
  negativePrompt: z.string().trim().max(1500).optional(),
  params: imageStyleParamsSchema.optional(),
  contextVariants: z.array(imageStyleContextVariantSchema).max(10).default([]),
});

export const imageStyleSettingsSchema = z.object({
  styles: z.array(imageStyleSchema).min(1).max(30),
  /** النموذج الافتراضي لكل التوليد ما لم يحدد النمط أو الطلب غيره */
  defaultModel: z.string().trim().min(1).max(100).default(DEFAULT_IMAGE_MODEL),
});

export type ImageStyleParams = z.infer<typeof imageStyleParamsSchema>;
export type ImageStyleContextVariant = z.infer<typeof imageStyleContextVariantSchema>;
export type ImageStyle = z.infer<typeof imageStyleSchema>;
export type ImageStyleSettings = z.infer<typeof imageStyleSettingsSchema>;

/** ما يراه المحرر في بطاقات الاختيار (بدون نصوص البرومبت) */
export interface EditorImageStyle {
  slug: string;
  nameAr: string;
  nameEn?: string;
  description: string;
  icon?: string;
  isDefault: boolean;
  /** شارات السياق المتاحة (label + التصنيفات) ليعرف المحرر أن توجيهًا متخصصًا سيُطبق */
  contextBadges: Array<{ slug: string; label: string; categories: string[] }>;
}

/**
 * حراس عامة تُلحق بكل برومبت مركّب من نمط — سياسة سبق الثابتة
 * (النص داخل الصورة يُضاف لاحقًا عبر نظام الـoverlay وليس من النموذج).
 */
export const GLOBAL_IMAGE_GUARDS =
  "CRITICAL: absolutely no text, letters, words, numbers, or typography of any kind " +
  "in the image (no Arabic, no English, no watermarks, no logos, no signs with writing). " +
  "High quality, suitable for news publication, culturally appropriate for a Saudi/Arabic " +
  "news audience, professional and credible composition.";

/**
 * الأنماط الافتراضية المزروعة في الكود — الطبقة الأخيرة من سلّم الأمان،
 * وهي أيضًا البذرة الأولى عند أول فتح لصفحة الإدارة.
 *
 * نص «الواقعية» منقول حرفيًا من styleGuide المجرَّب في visualAiService.
 */
export const DEFAULT_IMAGE_STYLES: ImageStyle[] = [
  {
    slug: "realistic",
    nameAr: "واقعية",
    nameEn: "Realistic",
    description: "فوتوغرافيا صحفية طبيعية بعدسة احترافية",
    icon: "camera",
    enabled: true,
    sortOrder: 1,
    isDefault: true,
    stylePrompt:
      "true photorealistic photography, natural lighting, shallow depth of field, " +
      "shot on a professional DSLR camera, documentary photojournalism, high dynamic range, " +
      "real-world textures and skin tones, no CGI, no illustration, no cartoon, no AI-looking artifacts",
    negativePrompt:
      "cartoon, anime, illustration, 3d render, CGI, painting, sketch, low quality, blurry, distorted",
    contextVariants: [
      {
        slug: "food-medical",
        label: "أطعمة وصحة وطب",
        enabled: true,
        categories: ["health", "food", "الصحة", "صحة", "تغذية", "طب", "أغذية"],
        // ملاحظة تحريرية: هذا برومبت مبدئي قابل للتعديل من لوحة التحكم —
        // المعايرة البصرية النهائية تنتظر الصورة المرجعية المعتمدة من المالك.
        stylePrompt:
          "true photorealistic editorial photography for food, health, and medical subjects: " +
          "macro-level detail, soft diffused natural light, shallow depth of field, " +
          "clean uncluttered background, appetizing realistic textures (fresh ingredients, " +
          "steam, droplets) for food; clinically accurate, respectful and non-graphic depiction " +
          "for medical and anatomy subjects; professional studio composition, " +
          "no identifiable faces, no brand labels or packaging",
        negativePrompt:
          "cartoon, illustration, 3d render, CGI, plastic-looking food, oversaturated colors, " +
          "graphic surgical imagery, gore, blood, distorted anatomy, brand logos",
      },
    ],
  },
  {
    slug: "graphic",
    nameAr: "رسومية",
    nameEn: "Graphic",
    description: "تصميم جرافيكي عصري بأشكال وألوان واضحة",
    icon: "shapes",
    enabled: true,
    sortOrder: 2,
    isDefault: false,
    stylePrompt:
      "modern flat graphic design, bold geometric shapes, clean vector-style composition, " +
      "harmonious contemporary color palette, strong visual hierarchy, minimal negative space, " +
      "professional editorial graphic suitable for a news website",
    negativePrompt:
      "photorealistic, photograph, 3d render, cluttered composition, gradients overload, low quality",
    contextVariants: [],
  },
  {
    slug: "illustration",
    nameAr: "توضيحية",
    nameEn: "Illustration",
    description: "رسم رقمي توضيحي نظيف واحترافي",
    icon: "pen-tool",
    enabled: true,
    sortOrder: 3,
    isDefault: false,
    stylePrompt:
      "modern digital editorial illustration, clean and professional, refined line work, " +
      "thoughtful limited color palette, conceptual visual metaphor appropriate for news, " +
      "polished magazine-quality illustration",
    negativePrompt:
      "photorealistic, photograph, childish cartoon, clip-art, low quality, distorted anatomy",
    // النمط المعتمد تحريريًا لصور الأخبار التلقائية. Nano Banana 2 (الافتراضي العام منذ
    // 2026-08-08) أخرج له رسومًا كرتونية بنصوص إنجليزية مشوّهة رغم تعليمات «بلا نص»
    // (خبر الأمطار 2026-08-28، خمس محاولات)؛ Pro يلتزم بالبرومبت ويعطي الطابع
    // التحريري الأنيق نفسه الذي اعتُمد عليه قبل التبديل. الكلفة 0.134$ بدل 0.067$.
    params: {
      model: LEGACY_IMAGE_MODEL,
    },
    contextVariants: [],
  },
  {
    slug: "infographic",
    nameAr: "إنفوجرافيك وبيانات",
    nameEn: "Infographic & Data",
    description: "تصميم بياني وإحصائي متزن ومناسب للأرقام والبيانات",
    icon: "bar-chart-3",
    enabled: true,
    sortOrder: 4,
    isDefault: false,
    stylePrompt:
      "clean professional data infographic, modern flat vector design, statistical charts layout, " +
      "distinct visual data blocks, elegant contemporary color palette, minimalist iconography, " +
      "high contrast, clean light background, no clutter, no distorted pseudo-text",
    negativePrompt:
      "photorealistic, photograph, messy typography, distorted text, 3d clutter, blurry charts, childish drawings",
    params: {
      model: "recraft-v3",
    },
    contextVariants: [],
  },
];

export const DEFAULT_IMAGE_STYLE_SETTINGS: ImageStyleSettings = {
  styles: DEFAULT_IMAGE_STYLES,
  defaultModel: DEFAULT_IMAGE_MODEL,
};

/**
 * خريطة توافق: قيم الأنماط القديمة المخزنة في auto_image_generation_settings
 * (photorealistic / illustration / …) → slugs السجلّ الجديد.
 */
export const LEGACY_STYLE_SLUG_MAP: Record<string, string> = {
  photorealistic: "realistic",
  realistic: "realistic",
  illustration: "illustration",
  abstract: "graphic",
  minimalist: "graphic",
  modern: "graphic",
  graphic: "graphic",
  infographic: "infographic",
};

/**
 * اقتراح النموذج الأمثل تلقائياً بناءً على النية البصرية وتصنيف الخبر
 */
export function suggestOptimalModel(
  intent?: ImageTaskIntent | null,
  styleSlug?: string | null,
  category?: string | null
): { model: string; reasonAr: string; provider: string } {
  const cat = (category || "").toLowerCase();
  
  if (intent === "infographic" || styleSlug === "infographic" || cat.includes("اقتصاد") || cat.includes("أرقام") || cat.includes("إحصاء")) {
    return {
      model: "recraft-v3",
      reasonAr: "موصى به للإنفوجرافيك والرسوم البيانية وتنسيق عناصر البيانات الفيكتور",
      provider: "recraft",
    };
  }

  if (intent === "opinion_art" || styleSlug === "illustration" || cat.includes("رأي") || cat.includes("مقال") || cat.includes("عمود")) {
    return {
      model: "recraft-v3",
      reasonAr: "موصى به للرسوم التوضيحية الفنية والمعاني الرمزية لمقالات الرأي",
      provider: "recraft",
    };
  }

  if (intent === "breaking_banner") {
    return {
      model: "gemini-3.1-flash-image-preview",
      reasonAr: "موصى به لسرعة الاستجابة وتوليد خلفيات الأخبار العاجلة الفورية",
      provider: "google",
    };
  }

  if (intent === "photo" || styleSlug === "realistic") {
    return {
      model: "gemini-3-pro-image-preview",
      reasonAr: "موصى به للواقعية الفوتوغرافية الميدانية والتحقق الجغرافي للخبر",
      provider: "google",
    };
  }

  return {
    model: DEFAULT_IMAGE_MODEL,
    reasonAr: "النموذج الافتراضي المتوازن للسرعة والجودة",
    provider: "google",
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * تطبيع إعدادات محفوظة (وربما فاسدة أو ناقصة) إلى شكل صالح مضمون:
 *  - فشل الـparse كليًا → الافتراضيات المزروعة.
 *  - إزالة slugs المكررة (الأول يفوز).
 *  - ضمان نمط افتراضي واحد بالضبط ومفعّل: أول isDefault مفعّل، وإلا أول مفعّل،
 *    وإلا يُفعَّل النمط الأول قسرًا (لا حالة «كل شيء معطّل» أبدًا).
 */
export function normalizeImageStyleSettings(raw: unknown): ImageStyleSettings {
  const parsed = imageStyleSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return deepClone(DEFAULT_IMAGE_STYLE_SETTINGS);
  }

  const settings = parsed.data;

  const seen = new Set<string>();
  settings.styles = settings.styles.filter((style) => {
    if (seen.has(style.slug)) return false;
    seen.add(style.slug);
    return true;
  });

  settings.styles.sort((a, b) => a.sortOrder - b.sortOrder);

  if (!settings.styles.some((s) => s.enabled)) {
    settings.styles[0].enabled = true;
  }

  const defaultStyle =
    settings.styles.find((s) => s.isDefault && s.enabled) ??
    settings.styles.find((s) => s.enabled)!;
  for (const style of settings.styles) {
    style.isDefault = style.slug === defaultStyle.slug;
  }

  return settings;
}

/**
 * سلّم حسم النمط — لا يُرجع null أبدًا:
 *  المطلوب إن كان مفعّلًا → الافتراضي → أول مفعّل → أول الأنماط المزروعة.
 */
export function resolveImageStyle(
  settings: ImageStyleSettings,
  requestedSlug?: string | null
): ImageStyle {
  const slug = requestedSlug ? LEGACY_STYLE_SLUG_MAP[requestedSlug] ?? requestedSlug : undefined;

  if (slug) {
    const requested = settings.styles.find((s) => s.slug === slug && s.enabled);
    if (requested) return requested;
  }

  const fallback =
    settings.styles.find((s) => s.isDefault && s.enabled) ??
    settings.styles.find((s) => s.enabled);
  return fallback ?? DEFAULT_IMAGE_STYLES[0];
}

function normalizeCategoryToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^ال/, "")
    .replace(/[ً-ْ]/g, ""); // إزالة التشكيل
}

/**
 * هل يطابق تصنيف الخبر (slug أو اسم) أحد تصنيفات القائمة؟
 * مشتركة بين الخادم (matchContextVariant) والواجهة (شارة السياق على البطاقة).
 */
export function matchesCategoryToken(
  categories: string[],
  category?: string | null
): boolean {
  if (!category) return false;
  const token = normalizeCategoryToken(category);
  if (!token) return false;
  return categories.some((c) => normalizeCategoryToken(c) === token);
}

/**
 * مطابقة توجيه سياقي داخل النمط عبر تصنيف الخبر (slug أو اسم).
 * لا مطابقة موثوقة → null (يُستخدم برومبت النمط الأساسي).
 */
export function matchContextVariant(
  style: ImageStyle,
  category?: string | null
): ImageStyleContextVariant | null {
  for (const variant of style.contextVariants) {
    if (!variant.enabled) continue;
    if (matchesCategoryToken(variant.categories, category)) {
      return variant;
    }
  }
  return null;
}

export interface ComposeImagePromptInput {
  style: ImageStyle;
  variant?: ImageStyleContextVariant | null;
  /** مضمون الصورة: «ماذا نصوّر» — وصف المحرر أو سياق الخبر */
  content: string;
  /** تعليمات إضافية اختيارية من المستخدم */
  userInstructions?: string;
  /** إلحاق الحراس العامة (منع النصوص/الشعارات) — الافتراضي نعم */
  includeGuards?: boolean;
}

export interface ComposedImagePrompt {
  prompt: string;
  negativePrompt?: string;
}

/**
 * تركيب البرومبت النهائي بفصل صريح بين المضمون والأسلوب وتعليمات المستخدم.
 * هذه هي نقطة التركيب الوحيدة — لا برومبتات أسلوب تُبنى في المتصفح بعد الآن.
 */
export function composeImagePrompt(input: ComposeImagePromptInput): ComposedImagePrompt {
  const { style, variant, content, userInstructions, includeGuards = true } = input;

  const sections = [
    content.trim(),
    `Visual style:\n${(variant?.stylePrompt ?? style.stylePrompt).trim()}`,
  ];

  if (userInstructions?.trim()) {
    sections.push(`Additional instructions:\n${userInstructions.trim()}`);
  }

  if (includeGuards) {
    sections.push(GLOBAL_IMAGE_GUARDS);
  }

  const negativePrompt = (variant?.negativePrompt ?? style.negativePrompt)?.trim() || undefined;

  return {
    prompt: sections.join("\n\n"),
    negativePrompt,
  };
}

/**
 * حسم نموذج التوليد: طلب صريح → نمط → إعداد عام → الافتراضي المزروع.
 */
export function resolveImageModel(
  settings: ImageStyleSettings,
  style?: ImageStyle | null,
  explicitModel?: string | null
): string {
  return (
    explicitModel?.trim() ||
    style?.params?.model?.trim() ||
    settings.defaultModel?.trim() ||
    DEFAULT_IMAGE_MODEL
  );
}

/** تحويل نمط كامل إلى الشكل المكشوف للمحرر (بدون برومبتات) */
export function toEditorImageStyle(style: ImageStyle): EditorImageStyle {
  return {
    slug: style.slug,
    nameAr: style.nameAr,
    nameEn: style.nameEn,
    description: style.description,
    icon: style.icon,
    isDefault: style.isDefault,
    contextBadges: style.contextVariants
      .filter((v) => v.enabled)
      .map((v) => ({ slug: v.slug, label: v.label, categories: v.categories })),
  };
}
