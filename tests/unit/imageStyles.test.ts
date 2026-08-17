import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_IMAGE_STYLES,
  DEFAULT_IMAGE_STYLE_SETTINGS,
  GLOBAL_IMAGE_GUARDS,
  LEGACY_STYLE_SLUG_MAP,
  composeImagePrompt,
  matchContextVariant,
  normalizeImageStyleSettings,
  resolveImageModel,
  resolveImageStyle,
  toEditorImageStyle,
  type ImageStyle,
  type ImageStyleSettings,
} from "../../shared/imageStyles";

function makeStyle(overrides: Partial<ImageStyle> = {}): ImageStyle {
  return {
    slug: "test-style",
    nameAr: "نمط تجريبي",
    description: "",
    enabled: true,
    sortOrder: 0,
    isDefault: false,
    stylePrompt: "test style prompt",
    contextVariants: [],
    ...overrides,
  };
}

function makeSettings(styles: ImageStyle[], defaultModel = DEFAULT_IMAGE_MODEL): ImageStyleSettings {
  return { styles, defaultModel };
}

describe("normalizeImageStyleSettings — تطبيع الإعدادات المحفوظة", () => {
  it("يعيد الافتراضيات المزروعة عند إدخال فاسد كليًا", () => {
    for (const raw of [null, undefined, "corrupt", 42, { styles: [] }, { styles: "x" }]) {
      const normalized = normalizeImageStyleSettings(raw);
      expect(normalized.styles.length).toBe(DEFAULT_IMAGE_STYLES.length);
      expect(normalized.styles[0].slug).toBe("realistic");
      expect(normalized.defaultModel).toBe(DEFAULT_IMAGE_MODEL);
    }
  });

  it("الافتراضيات المزروعة نفسها صالحة وتمر من التطبيع كما هي", () => {
    const normalized = normalizeImageStyleSettings(DEFAULT_IMAGE_STYLE_SETTINGS);
    expect(normalized.styles.map((s) => s.slug)).toEqual(["realistic", "graphic", "illustration", "infographic"]);
    expect(normalized.styles.filter((s) => s.isDefault).length).toBe(1);
  });

  it("يزيل slugs المكررة (الأول يفوز) ويرتب حسب sortOrder", () => {
    const normalized = normalizeImageStyleSettings(
      makeSettings([
        makeStyle({ slug: "b", sortOrder: 2 }),
        makeStyle({ slug: "a", sortOrder: 1 }),
        makeStyle({ slug: "b", sortOrder: 3, nameAr: "مكرر" }),
      ])
    );
    expect(normalized.styles.map((s) => s.slug)).toEqual(["a", "b"]);
  });

  it("كل الأنماط معطّلة → يفعّل الأول قسرًا ويجعله الافتراضي", () => {
    const normalized = normalizeImageStyleSettings(
      makeSettings([
        makeStyle({ slug: "a", enabled: false, sortOrder: 1 }),
        makeStyle({ slug: "b", enabled: false, sortOrder: 2 }),
      ])
    );
    expect(normalized.styles[0].enabled).toBe(true);
    expect(normalized.styles[0].isDefault).toBe(true);
  });

  it("الافتراضي المعطّل يفقد الوسم وينتقل لأول مفعّل — افتراضي واحد بالضبط دائمًا", () => {
    const normalized = normalizeImageStyleSettings(
      makeSettings([
        makeStyle({ slug: "a", enabled: false, isDefault: true, sortOrder: 1 }),
        makeStyle({ slug: "b", sortOrder: 2 }),
        makeStyle({ slug: "c", isDefault: true, sortOrder: 3 }),
      ])
    );
    const defaults = normalized.styles.filter((s) => s.isDefault);
    expect(defaults.length).toBe(1);
    expect(defaults[0].slug).toBe("c"); // أول isDefault مفعّل
  });
});

describe("resolveImageStyle — سلّم حسم النمط", () => {
  const settings = normalizeImageStyleSettings(
    makeSettings([
      makeStyle({ slug: "a", sortOrder: 1 }),
      makeStyle({ slug: "b", isDefault: true, sortOrder: 2 }),
      makeStyle({ slug: "c", enabled: false, sortOrder: 3 }),
    ])
  );

  it("يعيد النمط المطلوب إن كان مفعّلًا", () => {
    expect(resolveImageStyle(settings, "a").slug).toBe("a");
  });

  it("نمط مطلوب معطّل → الافتراضي", () => {
    expect(resolveImageStyle(settings, "c").slug).toBe("b");
  });

  it("نمط غير موجود أو بلا طلب → الافتراضي", () => {
    expect(resolveImageStyle(settings, "does-not-exist").slug).toBe("b");
    expect(resolveImageStyle(settings).slug).toBe("b");
    expect(resolveImageStyle(settings, null).slug).toBe("b");
  });

  it("يترجم slugs الأنماط القديمة (photorealistic → realistic)", () => {
    const defaults = normalizeImageStyleSettings(DEFAULT_IMAGE_STYLE_SETTINGS);
    expect(resolveImageStyle(defaults, "photorealistic").slug).toBe("realistic");
    expect(resolveImageStyle(defaults, "abstract").slug).toBe("graphic");
    expect(LEGACY_STYLE_SLUG_MAP.minimalist).toBe("graphic");
  });

  it("لا يعيد null أبدًا حتى بلا أي نمط مفعّل في الإدخال الخام", () => {
    // normalize يضمن مفعّلًا واحدًا؛ وحتى لو مُررت إعدادات يدوية كلها معطلة
    const broken = makeSettings([makeStyle({ slug: "x", enabled: false })]);
    expect(resolveImageStyle(broken).slug).toBe(DEFAULT_IMAGE_STYLES[0].slug);
  });
});

describe("matchContextVariant — التوجيه السياقي (أطعمة/طب)", () => {
  const realistic = normalizeImageStyleSettings(DEFAULT_IMAGE_STYLE_SETTINGS).styles.find(
    (s) => s.slug === "realistic"
  )!;

  it("يطابق slug التصنيف الإنجليزي", () => {
    expect(matchContextVariant(realistic, "health")?.slug).toBe("food-medical");
    expect(matchContextVariant(realistic, "Food")?.slug).toBe("food-medical");
  });

  it("يطابق الاسم العربي مع تجاهل «ال» التعريف", () => {
    expect(matchContextVariant(realistic, "الصحة")?.slug).toBe("food-medical");
    expect(matchContextVariant(realistic, "صحة")?.slug).toBe("food-medical");
  });

  it("تصنيف غير مطابق أو غائب → null (البرومبت الأساسي)", () => {
    expect(matchContextVariant(realistic, "رياضة")).toBeNull();
    expect(matchContextVariant(realistic, "")).toBeNull();
    expect(matchContextVariant(realistic, undefined)).toBeNull();
  });

  it("لا يطابق variant معطّلًا", () => {
    const style = makeStyle({
      contextVariants: [
        {
          slug: "v1",
          label: "معطل",
          enabled: false,
          categories: ["health"],
          stylePrompt: "x",
        },
      ],
    });
    expect(matchContextVariant(style, "health")).toBeNull();
  });
});

describe("composeImagePrompt — تركيب البرومبت", () => {
  const style = makeStyle({
    stylePrompt: "BASE STYLE",
    negativePrompt: "BASE NEGATIVE",
    contextVariants: [
      {
        slug: "special",
        label: "خاص",
        enabled: true,
        categories: ["health"],
        stylePrompt: "VARIANT STYLE",
        negativePrompt: "VARIANT NEGATIVE",
      },
    ],
  });

  it("يفصل المضمون عن الأسلوب ويلحق الحراس العامة افتراضيًا", () => {
    const { prompt, negativePrompt } = composeImagePrompt({
      style,
      content: "صورة لاجتماع وزاري",
    });
    expect(prompt).toContain("صورة لاجتماع وزاري");
    expect(prompt).toContain("Visual style:\nBASE STYLE");
    expect(prompt).toContain(GLOBAL_IMAGE_GUARDS);
    expect(negativePrompt).toBe("BASE NEGATIVE");
  });

  it("الـvariant يتقدم على النمط في الأسلوب والـnegative", () => {
    const variant = style.contextVariants[0];
    const { prompt, negativePrompt } = composeImagePrompt({
      style,
      variant,
      content: "طبق سلطة",
    });
    expect(prompt).toContain("VARIANT STYLE");
    expect(prompt).not.toContain("BASE STYLE");
    expect(negativePrompt).toBe("VARIANT NEGATIVE");
  });

  it("يضيف تعليمات المستخدم عند وجودها ويتجاهل الفارغة", () => {
    const withInstructions = composeImagePrompt({
      style,
      content: "مشهد",
      userInstructions: "زاوية علوية",
    });
    expect(withInstructions.prompt).toContain("Additional instructions:\nزاوية علوية");

    const withoutInstructions = composeImagePrompt({
      style,
      content: "مشهد",
      userInstructions: "   ",
    });
    expect(withoutInstructions.prompt).not.toContain("Additional instructions");
  });

  it("includeGuards=false يسقط الحراس (لمسارات القوالب الخاصة)", () => {
    const { prompt } = composeImagePrompt({ style, content: "مشهد", includeGuards: false });
    expect(prompt).not.toContain(GLOBAL_IMAGE_GUARDS);
  });
});

describe("resolveImageModel — حسم النموذج", () => {
  const settings = makeSettings([makeStyle()], "settings-model");

  it("الطلب الصريح يتقدم على الجميع", () => {
    const style = makeStyle({ params: { model: "style-model" } });
    expect(resolveImageModel(settings, style, "explicit-model")).toBe("explicit-model");
  });

  it("ثم نموذج النمط، ثم إعداد النظام، ثم الافتراضي المزروع", () => {
    const style = makeStyle({ params: { model: "style-model" } });
    expect(resolveImageModel(settings, style)).toBe("style-model");
    expect(resolveImageModel(settings, makeStyle())).toBe("settings-model");
    expect(resolveImageModel(makeSettings([makeStyle()], ""), makeStyle())).toBe(
      DEFAULT_IMAGE_MODEL
    );
  });
});

describe("toEditorImageStyle — الشكل المكشوف للمحرر", () => {
  it("لا يسرّب نصوص البرومبت ويكشف شارات السياق المفعّلة فقط", () => {
    const style = normalizeImageStyleSettings(DEFAULT_IMAGE_STYLE_SETTINGS).styles[0];
    const editorStyle = toEditorImageStyle(style) as any;
    expect(editorStyle.stylePrompt).toBeUndefined();
    expect(editorStyle.negativePrompt).toBeUndefined();
    expect(editorStyle.contextBadges[0].slug).toBe("food-medical");
  });
});
