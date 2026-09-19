import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_IOS_NATIONAL_DAY_THEME,
  IOS_NATIONAL_DAY_THEME_SETTING_KEY,
  parseIosNationalDayThemeConfig,
} from "@shared/ios-national-day-theme";

describe("parseIosNationalDayThemeConfig", () => {
  it("يسقط على معطّل عندما لا يوجد صف محفوظ", () => {
    expect(parseIosNationalDayThemeConfig(undefined)).toEqual(
      DEFAULT_IOS_NATIONAL_DAY_THEME,
    );
    expect(parseIosNationalDayThemeConfig(null)).toEqual(
      DEFAULT_IOS_NATIONAL_DAY_THEME,
    );
  });

  it("يقرأ الشكل المعتمد", () => {
    expect(
      parseIosNationalDayThemeConfig({
        enabled: true,
        updatedAt: "2026-09-19T10:00:00.000Z",
      }),
    ).toEqual({ enabled: true, updatedAt: "2026-09-19T10:00:00.000Z" });
  });

  it("يتسامح مع قيمة منطقية مجرّدة من نسخة أقدم", () => {
    expect(parseIosNationalDayThemeConfig(true)).toEqual({
      enabled: true,
      updatedAt: null,
    });
    expect(parseIosNationalDayThemeConfig(false)).toEqual({
      enabled: false,
      updatedAt: null,
    });
  });

  it("لا يفعّل الثيم بقيمة غير منطقية — التفعيل قرار صريح", () => {
    // مهم: "true" نصًا أو 1 رقمًا لا يكفيان. الثيم يلبس التطبيق كاملًا،
    // فلا يُفعَّل إلا بـ boolean صريح.
    expect(parseIosNationalDayThemeConfig({ enabled: "true" }).enabled).toBe(false);
    expect(parseIosNationalDayThemeConfig({ enabled: 1 }).enabled).toBe(false);
    expect(parseIosNationalDayThemeConfig("enabled").enabled).toBe(false);
    expect(parseIosNationalDayThemeConfig({}).enabled).toBe(false);
  });

  it("يتجاهل updatedAt غير النصي", () => {
    expect(
      parseIosNationalDayThemeConfig({ enabled: true, updatedAt: 1758000000 })
        .updatedAt,
    ).toBeNull();
  });
});

describe("عقد المفتاح بين الطبقات", () => {
  const swift = readFileSync(
    resolve("sabq app ios/sabq/Models/NationalDayTheme.swift"),
    "utf8",
  );
  const routes = readFileSync(resolve("server/routes/systemSettings.ts"), "utf8");
  const dashboard = readFileSync(
    resolve("client/src/pages/dashboard/IosNationalDayThemeSettings.tsx"),
    "utf8",
  );

  it("المسار العام الذي يقرأه التطبيق هو نفسه الذي يكتبه الخادم", () => {
    // تطبيق iOS يبني المسار من APIClient: publicAPI + هذا الجزء.
    const client = readFileSync(
      resolve("sabq app ios/sabq/Services/APIClient.swift"),
      "utf8",
    );
    expect(client).toContain('path: "/system/ios-national-day-theme"');
    expect(routes).toContain('router.get("/api/system/ios-national-day-theme"');
    expect(routes).toContain('"/api/system/ios-national-day-theme"');
    expect(dashboard).toContain("/api/system/ios-national-day-theme");
  });

  it("الكتابة محمية بصلاحية إدارة الإعدادات", () => {
    const post = routes.slice(routes.indexOf('router.post(\n  "/api/system/ios-national-day-theme"'));
    expect(post).toContain("requireAuth");
    expect(post).toContain('requirePermission("system.manage_settings")');
  });

  it("مفتاح التخزين ثابت ولم يُعَد تسميته", () => {
    expect(IOS_NATIONAL_DAY_THEME_SETTING_KEY).toBe("ios_national_day_theme");
    expect(routes).toContain("IOS_NATIONAL_DAY_THEME_SETTING_KEY");
  });

  it("التطبيق يقرأ حالته من مفتاح UserDefaults واحد", () => {
    // إن تغيّر هذا الاسم في Swift دون تغيير القراءة في SabqTheme يبقى
    // الثيم مفعّلًا بعد الإطفاء — لذلك نثبّته هنا.
    expect(swift).toContain('activeDefaultsKey = "sabqNationalDayThemeActive"');
    const theme = readFileSync(
      resolve("sabq app ios/sabq/Components/SabqComponents.swift"),
      "utf8",
    );
    expect(theme).toContain("if NationalDayTheme.isActive");
  });

  it("اسم الأيقونة البديلة متطابق في Swift وإعداد البناء وكتالوج الأصول", () => {
    // ثلاثة مواضع لا يربطها المترجم: خطأ مطبعي في أيٍّ منها يعني أن
    // `setAlternateIconName` يفشل صامتًا وتبقى الأيقونة الزرقاء.
    const ICON = "NationalDayAppIcon";
    expect(swift).toContain(`alternateIconName = "${ICON}"`);

    const pbxproj = readFileSync(
      resolve("sabq app ios/sabq.xcodeproj/project.pbxproj"),
      "utf8",
    );
    const alternates = pbxproj.match(
      /ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = [^;]+;/g,
    );
    // لا بد من ضبطه في Debug وRelease معًا، وإلا اختلف بناءٌ عن بناء.
    expect(alternates).toHaveLength(2);
    for (const line of alternates ?? []) expect(line).toContain(ICON);
    expect(
      pbxproj.match(/ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = YES;/g),
    ).toHaveLength(2);

    expect(
      existsSync(
        resolve(`sabq app ios/sabq/Assets.xcassets/${ICON}.appiconset/Contents.json`),
      ),
    ).toBe(true);
  });

  it("مجموعة الأيقونة الخضراء تحمل كل الملفات التي يطلبها Contents.json", () => {
    // ملف ناقص يجعل Xcode يفشل عند الأرشفة لا عند البناء العادي.
    const dir = resolve(
      "sabq app ios/sabq/Assets.xcassets/NationalDayAppIcon.appiconset",
    );
    const contents = JSON.parse(
      readFileSync(resolve(dir, "Contents.json"), "utf8"),
    ) as { images: Array<{ filename?: string }> };
    const wanted = new Set(
      contents.images.map((i) => i.filename).filter(Boolean) as string[],
    );
    expect(wanted.size).toBeGreaterThan(0);
    for (const file of wanted) {
      expect(existsSync(resolve(dir, file))).toBe(true);
    }
  });

  it("تبديل الأيقونة يقارن بالحالة الفعلية لا بالنيّة", () => {
    // من دون هذه المقارنة يعرض النظام تنبيه «تغيّرت الأيقونة» في كل جلب
    // دوري، ولا يتعافى التطبيق من تبديل فشل وهو في الخلفية.
    const store = readFileSync(
      resolve("sabq app ios/sabq/Services/SeasonalThemeStore.swift"),
      "utf8",
    );
    expect(store).toContain("supportsAlternateIcons");
    expect(store).toContain("app.alternateIconName != desired");
    expect(store).toContain("setAlternateIconName(desired)");
  });
});
