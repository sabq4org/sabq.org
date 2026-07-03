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

    // ── لون واحد رسمي: الأخضر + المحايد. لا ذهبي ولا أزرق — لوحة مبسّطة نظيفة. ──
    static let emerald     = Color(red: 0.039, green: 0.541, blue: 0.310) // أخضر الهوية الرسمي #0A8A4F
    static let emeraldSoft = Color(red: 0.071, green: 0.647, blue: 0.376) // أخضر «التأهل» #12A560
    static let teal        = Color(red: 0.039, green: 0.541, blue: 0.310) // = الأخضر الرسمي
    // «الذهبي» و«الأزرق» السابقان أُعيد توجيههما للأخضر/المحايد لتبسيط اللوحة.
    static let azure       = Color(red: 0.039, green: 0.541, blue: 0.310) // كان أزرق → أخضر
    static let gold        = Color(red: 0.039, green: 0.541, blue: 0.310) // كان ذهبي → أخضر
    static let goldDeep    = Color(red: 0.027, green: 0.420, blue: 0.239) // كان ذهبي داكن → أخضر داكن
    static let crimson     = Color(red: 0.847, green: 0.255, blue: 0.235) // أحمر المباشر فقط #D8413C

    /// رمادي محايد دافئ — للتمييز الثانوي (المركز الثالث) بلا إدخال لون جديد.
    static let neutralAccent = Color(red: 0.52, green: 0.57, blue: 0.55)

    /// أخضر داكن جدًا — نصّ/أيقونة داكنة فوق الأسطح الفاتحة.
    static let emeraldDeep = Color(red: 0.027, green: 0.420, blue: 0.239) // #076B3D

    // ── خلفيات فاتحة رسمية بلمسة خضراء خفيفة (داكنة في الوضع الليلي) ──
    static let inkTop      = dyn((0.918, 0.953, 0.933, 1), (0.04, 0.07, 0.055, 1))
    static let inkBottom   = dyn((0.957, 0.969, 0.961, 1), (0.03, 0.055, 0.045, 1))  // + خلفية شريط التبويبات
    static let graphite    = dyn((0.992, 0.996, 0.992, 1), (0.10, 0.14, 0.12, 1))
    static let graphiteHi  = dyn((1.000, 1.000, 1.000, 1), (0.13, 0.17, 0.15, 1))

    // تدرّجات — بطاقة الـHero بيضاء رسمية (الشريط العلوي الأخضر يُضاف في الواجهة).
    static var heroTop: Color { dyn((1.000, 1.000, 1.000, 1), (0.07, 0.11, 0.09, 1)) }
    static var heroBottom: Color { dyn((0.972, 0.984, 0.976, 1), (0.05, 0.08, 0.065, 1)) }

    /// تدرّج الشريط العلوي البطولي لبطاقات الـHero (أخضر → ذهبي).
    static var heroAccentBar: LinearGradient {
        LinearGradient(colors: [emerald, emeraldSoft, gold], startPoint: .leading, endPoint: .trailing)
    }

    static var heroGradient: LinearGradient {
        LinearGradient(colors: [heroTop, heroBottom], startPoint: .top, endPoint: .bottom)
    }

    static var sectionGradient: LinearGradient {
        LinearGradient(
            colors: [graphiteHi, graphite],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    /// تدرّج أخضر لعناوين الأبطال (مثل «2027») — أخضر رسمي بلا ذهبي.
    static var goldTitleGradient: LinearGradient {
        LinearGradient(
            colors: [emeraldSoft, emerald, emeraldDeep],
            startPoint: .topTrailing, endPoint: .bottomLeading
        )
    }

    /// تدرّج خلفية الشاشة كاملةً — رمادي بارد فاتح بعمقٍ خفيف لا يتحوّل للأبيض المسطّح.
    static var screenGradient: LinearGradient {
        LinearGradient(
            colors: [
                inkTop,
                dyn((0.937, 0.961, 0.945, 1), (0.05, 0.085, 0.07, 1)),
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
    static var chipFill: Color { dyn((0.06, 0.34, 0.22, 0.05), (1, 1, 1, 0.07)) }
    // حدود أخفّ وأنعم — تقليل الإحساس بالإطارات الحادة عبر التطبيق.
    static var outline: Color { dyn((0.10, 0.32, 0.22, 0.07), (1, 1, 1, 0.08)) }
    static var outlineStrong: Color { dyn((0.10, 0.32, 0.22, 0.12), (1, 1, 1, 0.13)) }

    // حبر النص — أخضر داكن رسمي على الفاتح، أبيض على الداكن.
    static var onDark: Color { dyn((0.075, 0.125, 0.106, 1), (1, 1, 1, 1)) }
    static var onDarkStrong: Color { dyn((0.040, 0.085, 0.070, 1), (1, 1, 1, 1)) }
    static var onDarkDim: Color { dyn((0.353, 0.420, 0.388, 1), (1, 1, 1, 0.70)) }
    static var onDarkFaint: Color { dyn((0.573, 0.639, 0.604, 1), (1, 1, 1, 0.45)) }

    // نصف قطر (مطابق لـ WCTheme لاتساق الإحساس عبر تطبيقات سبق)
    static let cardRadius: CGFloat = 24
    static let tileRadius: CGFloat = 18
    static let chipRadius: CGFloat = 12
    static let buttonRadius: CGFloat = 16
}
