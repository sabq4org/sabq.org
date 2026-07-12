import SwiftUI

// هوية كأس آسيا 2027 — رسمية بعمق، بلا أبيض مسطّح ولا لون طاغي.
//
// تجربة الثيم حسب اللغة (مرحلة أولى — تظهر بوضوح في الشاشة الرئيسية):
//   • العربية  → زمردي (هوية المضيف / الحالية)
//   • الصينية  → أحمر بارد خفيف جدًا (تلميح من العلم، لا نسخة صارخة)
//   • الإنجليزية → أزرق رمادي هادئ (مشتقات الأزرق)
//   • بقية اللغات → العربية حتى تُعرَّف لوحتها
//
// التباين المدروس:
//   • خلفية الشاشة: رمادي ملوّن هادئ (البطاقات تطفو فوقه).
//   • سطح البطاقة: أبيض دافئ خفيف.
//   • لون الهوية: لحظات التمييز (عدّ تنازلي، تبويب نشط، شارة مضيف).
//   • العنبر/القرمزي: دلاليان ثابتان (وقت / خطر) لا يتغيّران مع اللغة.

/// لوحة ألوان لغة واحدة — نفس أدوار الثيم الأخضر بمفاتيح محايدة.
struct AcThemePalette: Sendable {
    typealias RGBA = (CGFloat, CGFloat, CGFloat, CGFloat)

    let accent: Color
    let accentSoft: Color
    let accentDeep: Color
    /// درجات الحبر الديناميكي (نص/أيقونة هوية)
    let accentInkLight: RGBA
    let accentInkDark: RGBA

    let inkTop: (light: RGBA, dark: RGBA)
    let inkMid: (light: RGBA, dark: RGBA)
    let inkBottom: (light: RGBA, dark: RGBA)
    let graphite: (light: RGBA, dark: RGBA)
    let graphiteHi: (light: RGBA, dark: RGBA)
    let cardFill: (light: RGBA, dark: RGBA)
    let cardFillStrong: (light: RGBA, dark: RGBA)
    let chipFill: (light: RGBA, dark: RGBA)
    let outline: (light: RGBA, dark: RGBA)
    let outlineStrong: (light: RGBA, dark: RGBA)
    let onDark: (light: RGBA, dark: RGBA)
    let onDarkStrong: (light: RGBA, dark: RGBA)
    let onDarkDim: (light: RGBA, dark: RGBA)
    let onDarkFaint: (light: RGBA, dark: RGBA)
}

extension AcThemePalette {
    /// عربي — الثيم الحالي (مرجع التجربة).
    static let arabic = AcThemePalette(
        accent: Color(red: 0.039, green: 0.541, blue: 0.310),
        accentSoft: Color(red: 0.071, green: 0.647, blue: 0.376),
        accentDeep: Color(red: 0.027, green: 0.420, blue: 0.239),
        accentInkLight: (0.027, 0.420, 0.239, 1),
        accentInkDark: (0.36, 0.80, 0.53, 1),
        inkTop: ((0.86, 0.91, 0.88, 1), (0.05, 0.08, 0.06, 1)),
        inkMid: ((0.83, 0.89, 0.85, 1), (0.04, 0.07, 0.05, 1)),
        inkBottom: ((0.80, 0.87, 0.83, 1), (0.03, 0.05, 0.04, 1)),
        graphite: ((0.96, 0.97, 0.95, 1), (0.11, 0.14, 0.12, 1)),
        graphiteHi: ((0.985, 0.99, 0.98, 1), (0.14, 0.17, 0.15, 1)),
        cardFill: ((0.985, 0.99, 0.98, 1), (1, 1, 1, 0.07)),
        cardFillStrong: ((0.995, 0.997, 0.99, 1), (1, 1, 1, 0.10)),
        chipFill: ((0.10, 0.28, 0.18, 0.07), (1, 1, 1, 0.08)),
        outline: ((0.12, 0.28, 0.20, 0.14), (1, 1, 1, 0.14)),
        outlineStrong: ((0.12, 0.28, 0.20, 0.26), (1, 1, 1, 0.24)),
        onDark: ((0.10, 0.14, 0.12, 1), (1, 1, 1, 1)),
        onDarkStrong: ((0.06, 0.09, 0.07, 1), (1, 1, 1, 1)),
        onDarkDim: ((0.35, 0.42, 0.38, 1), (1, 1, 1, 0.70)),
        onDarkFaint: ((0.40, 0.46, 0.43, 1), (1, 1, 1, 0.55))
    )

    /// صيني — أحمر بارد خفيف جدًا (تلميح علم، لا أحمر صارخ).
    static let chinese = AcThemePalette(
        accent: Color(red: 0.72, green: 0.18, blue: 0.20),       // #B82E33
        accentSoft: Color(red: 0.82, green: 0.32, blue: 0.34),
        accentDeep: Color(red: 0.55, green: 0.12, blue: 0.14),
        accentInkLight: (0.55, 0.12, 0.14, 1),
        accentInkDark: (0.92, 0.48, 0.50, 1),
        inkTop: ((0.96, 0.91, 0.91, 1), (0.09, 0.05, 0.05, 1)),
        inkMid: ((0.94, 0.88, 0.88, 1), (0.07, 0.04, 0.04, 1)),
        inkBottom: ((0.92, 0.85, 0.85, 1), (0.05, 0.03, 0.03, 1)),
        graphite: ((0.98, 0.96, 0.96, 1), (0.14, 0.11, 0.11, 1)),
        graphiteHi: ((0.99, 0.98, 0.98, 1), (0.17, 0.13, 0.13, 1)),
        cardFill: ((0.995, 0.99, 0.99, 1), (1, 1, 1, 0.07)),
        cardFillStrong: ((0.998, 0.995, 0.995, 1), (1, 1, 1, 0.10)),
        chipFill: ((0.45, 0.12, 0.14, 0.07), (1, 1, 1, 0.08)),
        outline: ((0.45, 0.14, 0.16, 0.14), (1, 1, 1, 0.14)),
        outlineStrong: ((0.45, 0.14, 0.16, 0.26), (1, 1, 1, 0.24)),
        onDark: ((0.14, 0.10, 0.10, 1), (1, 1, 1, 1)),
        onDarkStrong: ((0.09, 0.06, 0.06, 1), (1, 1, 1, 1)),
        onDarkDim: ((0.45, 0.36, 0.36, 1), (1, 1, 1, 0.70)),
        onDarkFaint: ((0.50, 0.42, 0.42, 1), (1, 1, 1, 0.55))
    )

    /// إنجليزي — أزرق رمادي هادئ (مشتقات الأزرق).
    static let english = AcThemePalette(
        accent: Color(red: 0.14, green: 0.35, blue: 0.62),       // #24599E
        accentSoft: Color(red: 0.25, green: 0.48, blue: 0.76),
        accentDeep: Color(red: 0.08, green: 0.24, blue: 0.48),
        accentInkLight: (0.08, 0.24, 0.48, 1),
        accentInkDark: (0.45, 0.68, 0.92, 1),
        inkTop: ((0.88, 0.91, 0.95, 1), (0.04, 0.06, 0.10, 1)),
        inkMid: ((0.85, 0.89, 0.94, 1), (0.03, 0.05, 0.08, 1)),
        inkBottom: ((0.82, 0.86, 0.92, 1), (0.02, 0.04, 0.07, 1)),
        graphite: ((0.95, 0.96, 0.98, 1), (0.10, 0.12, 0.16, 1)),
        graphiteHi: ((0.98, 0.985, 0.995, 1), (0.13, 0.15, 0.19, 1)),
        cardFill: ((0.985, 0.99, 0.995, 1), (1, 1, 1, 0.07)),
        cardFillStrong: ((0.995, 0.997, 1.0, 1), (1, 1, 1, 0.10)),
        chipFill: ((0.12, 0.22, 0.40, 0.07), (1, 1, 1, 0.08)),
        outline: ((0.14, 0.24, 0.40, 0.14), (1, 1, 1, 0.14)),
        outlineStrong: ((0.14, 0.24, 0.40, 0.26), (1, 1, 1, 0.24)),
        onDark: ((0.10, 0.12, 0.16, 1), (1, 1, 1, 1)),
        onDarkStrong: ((0.06, 0.08, 0.11, 1), (1, 1, 1, 1)),
        onDarkDim: ((0.36, 0.40, 0.48, 1), (1, 1, 1, 0.70)),
        onDarkFaint: ((0.42, 0.46, 0.52, 1), (1, 1, 1, 0.55))
    )

    /// يختار اللوحة من رمز اللغة المحفوظ — مطابق لمفتاح `AcLocalization`.
    static func forLanguageCode(_ code: String?) -> AcThemePalette {
        switch code {
        case "zh-Hans": return .chinese
        case "en": return .english
        default: return .arabic
        }
    }
}

nonisolated enum AcTheme {
    static let saudiId = 23
    private static let languageStorageKey = "ac.language.code"

    /// اللوحة النشطة حسب اللغة المختارة (تُحدَّث مع إعادة بناء الجذر عند تبديل اللغة).
    static var palette: AcThemePalette {
        AcThemePalette.forLanguageCode(UserDefaults.standard.string(forKey: languageStorageKey))
    }

    private static func dyn(
        _ light: (CGFloat, CGFloat, CGFloat, CGFloat),
        _ dark: (CGFloat, CGFloat, CGFloat, CGFloat)
    ) -> Color {
        Color(uiColor: UIColor { tc in
            let c = tc.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: c.3)
        })
    }

    // هوية — أسماء emerald* محفوظة لتوافق الاستدعاءات الحالية؛ القيم تتبع لغة المستخدم.
    static var emerald: Color { palette.accent }
    static var emeraldSoft: Color { palette.accentSoft }
    static var emeraldDeep: Color { palette.accentDeep }

    /// قرمزي دلالي ثابت (مباشر / خطر) — لا يتبع لوحة اللغة.
    static let crimson = Color(red: 0.847, green: 0.255, blue: 0.235)

    static var emeraldInk: Color {
        let p = palette
        return dyn(p.accentInkLight, p.accentInkDark)
    }

    // عنبر دافئ — دلالي ثابت: وقت المباراة والصدارة.
    static let amber = Color(red: 0.72, green: 0.52, blue: 0.18)
    static let amberDeep = Color(red: 0.55, green: 0.38, blue: 0.10)

    static var inkTop: Color {
        let p = palette
        return dyn(p.inkTop.light, p.inkTop.dark)
    }

    static var inkBottom: Color {
        let p = palette
        return dyn(p.inkBottom.light, p.inkBottom.dark)
    }

    static var graphite: Color {
        let p = palette
        return dyn(p.graphite.light, p.graphite.dark)
    }

    static var graphiteHi: Color {
        let p = palette
        return dyn(p.graphiteHi.light, p.graphiteHi.dark)
    }

    static var heroTop: Color { graphiteHi }
    static var heroBottom: Color { graphite }

    static var heroAccentBar: LinearGradient {
        LinearGradient(colors: [emerald, emeraldSoft], startPoint: .leading, endPoint: .trailing)
    }

    static var heroGradient: LinearGradient {
        LinearGradient(colors: [heroTop, heroBottom], startPoint: .top, endPoint: .bottom)
    }

    static var sectionGradient: LinearGradient {
        LinearGradient(colors: [graphiteHi, graphite], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    static var titleGradient: LinearGradient {
        LinearGradient(colors: [emeraldSoft, emerald, emeraldDeep], startPoint: .topTrailing, endPoint: .bottomLeading)
    }

    static var screenGradient: LinearGradient {
        let p = palette
        return LinearGradient(
            colors: [
                dyn(p.inkTop.light, p.inkTop.dark),
                dyn(p.inkMid.light, p.inkMid.dark),
                dyn(p.inkBottom.light, p.inkBottom.dark),
            ],
            startPoint: .top, endPoint: .bottom
        )
    }

    static var surface: Color { graphite }
    static var surfaceRaised: Color { graphiteHi }

    static var cardFill: Color {
        let p = palette
        return dyn(p.cardFill.light, p.cardFill.dark)
    }

    static var cardFillStrong: Color {
        let p = palette
        return dyn(p.cardFillStrong.light, p.cardFillStrong.dark)
    }

    static var chipFill: Color {
        let p = palette
        return dyn(p.chipFill.light, p.chipFill.dark)
    }

    static var outline: Color {
        let p = palette
        return dyn(p.outline.light, p.outline.dark)
    }

    static var outlineStrong: Color {
        let p = palette
        return dyn(p.outlineStrong.light, p.outlineStrong.dark)
    }

    static let borderWidth: CGFloat = 1

    static var onDark: Color {
        let p = palette
        return dyn(p.onDark.light, p.onDark.dark)
    }

    static var onDarkStrong: Color {
        let p = palette
        return dyn(p.onDarkStrong.light, p.onDarkStrong.dark)
    }

    static var onDarkDim: Color {
        let p = palette
        return dyn(p.onDarkDim.light, p.onDarkDim.dark)
    }

    static var onDarkFaint: Color {
        let p = palette
        return dyn(p.onDarkFaint.light, p.onDarkFaint.dark)
    }

    static let cardRadius: CGFloat = 16
    static let tileRadius: CGFloat = 14
    static let chipRadius: CGFloat = 8
    static let buttonRadius: CGFloat = 12
}
