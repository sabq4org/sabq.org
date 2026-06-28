import SwiftUI

// هوية كأس آسيا 2027 — نسخة «فاتحة باردة محايدة».
//
// القرار التصميمي: تطبيق محايد لكل المنتخبات الآسيوية، لا يوحي بانحياز للمستضيف.
// لذلك الخلفية رمادية-باردة فاتحة، الأسطح بيضاء، والنص داكن. الأخضر لم يعد لون
// الواجهة بل اقتصر على دلالة «التأهل» في الجداول فقط (emeraldSoft). الذهبي يبقى
// للهوية البطولية (الشعار، 2027، المستضيف)، والأزرق/الفيروزي البارد لونٌ أساسي
// محايد للأقسام والروابط، والأحمر للبث المباشر.
//
// البنية تكيّفية (dyn) فتعمل في الوضعين الفاتح والداكن تلقائيًا، مع ضبط الوضع
// الفاتح ليكون الإحساس الافتراضي «البارد الفاتح» المطلوب.
nonisolated enum AcTheme {
    static let saudiId = 23

    /// لون يتبدّل تلقائيًا مع نمط النظام — (r,g,b,a) لكل وضع.
    private static func dyn(
        _ light: (CGFloat, CGFloat, CGFloat, CGFloat),
        _ dark: (CGFloat, CGFloat, CGFloat, CGFloat)
    ) -> Color {
        Color(uiColor: UIColor { tc in
            let c = tc.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: c.3)
        })
    }

    // ── ألوان الإبراز (ثابتة، تقرأ جيّدًا على الفاتح والداكن) ──
    static let emerald     = Color(red: 0.10, green: 0.52, blue: 0.38)   // أخضر (احتياطي)
    static let emeraldSoft = Color(red: 0.13, green: 0.62, blue: 0.45)   // أخضر «التأهل» (دلالة فقط)
    static let teal        = Color(red: 0.09, green: 0.52, blue: 0.62)   // فيروزي بارد (أساسي)
    static let azure       = Color(red: 0.17, green: 0.47, blue: 0.82)   // أزرق بارد محايد (أساسي)
    static let gold        = Color(red: 0.92, green: 0.70, blue: 0.20)   // ذهبي (الهوية)
    static let goldDeep    = Color(red: 0.68, green: 0.50, blue: 0.07)   // ذهبي داكن (نص ذهبي على فاتح)
    static let crimson     = Color(red: 0.86, green: 0.22, blue: 0.27)   // أحمر المباشر

    /// «بترولي بارد داكن» — يُستعمل كنصّ/أيقونة داكنة فوق الذهبي والأسطح الفاتحة.
    /// (الاسم تاريخي؛ لم يعد أخضر بعد التحول لهوية باردة.)
    static let emeraldDeep = Color(red: 0.06, green: 0.27, blue: 0.36)

    // ── خلفيات باردة فاتحة (داكنة باردة في الوضع الليلي) ──
    static let inkTop      = dyn((0.945, 0.957, 0.976, 1), (0.04, 0.06, 0.09, 1))
    static let inkBottom   = dyn((0.902, 0.925, 0.957, 1), (0.03, 0.05, 0.08, 1))   // + خلفية شريط التبويبات
    static let graphite    = dyn((0.985, 0.990, 1.000, 1), (0.10, 0.13, 0.17, 1))
    static let graphiteHi  = dyn((1.000, 1.000, 1.000, 1), (0.13, 0.16, 0.21, 1))

    // تدرّجات
    static var heroTop: Color { dyn((0.957, 0.967, 0.986, 1), (0.06, 0.09, 0.13, 1)) }
    static var heroBottom: Color { dyn((0.902, 0.928, 0.965, 1), (0.04, 0.06, 0.10, 1)) }

    static var heroGradient: LinearGradient {
        LinearGradient(colors: [heroTop, heroBottom], startPoint: .top, endPoint: .bottom)
    }

    static var sectionGradient: LinearGradient {
        LinearGradient(
            colors: [graphiteHi, graphite],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    /// تدرّج ذهبي لعناوين الأبطال (مثل «2027») — ذهبي خالص بلا أخضر.
    static var goldTitleGradient: LinearGradient {
        LinearGradient(
            colors: [gold, Color(red: 0.99, green: 0.87, blue: 0.50), goldDeep],
            startPoint: .topTrailing, endPoint: .bottomLeading
        )
    }

    /// تدرّج خلفية الشاشة كاملةً — رمادي بارد فاتح بعمقٍ خفيف لا يتحوّل للأبيض المسطّح.
    static var screenGradient: LinearGradient {
        LinearGradient(
            colors: [
                inkTop,
                dyn((0.918, 0.940, 0.967, 1), (0.045, 0.075, 0.110, 1)),
                inkBottom,
            ],
            startPoint: .top, endPoint: .bottom
        )
    }

    // ── أسطح/نصوص تكيّفية ──
    static var surface: Color { graphite }
    static var surfaceRaised: Color { graphiteHi }
    static var cardFill: Color { dyn((1, 1, 1, 0.80), (1, 1, 1, 0.05)) }
    static var cardFillStrong: Color { dyn((1, 1, 1, 1.0), (1, 1, 1, 0.085)) }
    static var chipFill: Color { dyn((0.16, 0.27, 0.42, 0.07), (1, 1, 1, 0.08)) }
    static var outline: Color { dyn((0.16, 0.27, 0.42, 0.13), (1, 1, 1, 0.11)) }
    static var outlineStrong: Color { dyn((0.16, 0.27, 0.42, 0.22), (1, 1, 1, 0.18)) }

    // حبر النص — داكن بارد على الفاتح، أبيض على الداكن.
    static var onDark: Color { dyn((0.10, 0.15, 0.22, 1), (1, 1, 1, 1)) }
    static var onDarkStrong: Color { dyn((0.05, 0.09, 0.15, 1), (1, 1, 1, 1)) }
    static var onDarkDim: Color { dyn((0.34, 0.42, 0.52, 1), (1, 1, 1, 0.70)) }
    static var onDarkFaint: Color { dyn((0.52, 0.59, 0.68, 1), (1, 1, 1, 0.45)) }

    // نصف قطر (مطابق لـ WCTheme لاتساق الإحساس عبر تطبيقات سبق)
    static let cardRadius: CGFloat = 24
    static let tileRadius: CGFloat = 18
    static let chipRadius: CGFloat = 12
    static let buttonRadius: CGFloat = 16
}
