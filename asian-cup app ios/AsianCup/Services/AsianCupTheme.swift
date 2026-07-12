import SwiftUI

// هوية كأس آسيا 2027 — رسمية بعمق، بلا أبيض مسطّح ولا أخضر طاغي.
//
// التباين المدروس:
//   • خلفية الشاشة: أخضر-رمادي هادئ (يعطي عمقًا؛ البطاقات تطفو فوقه).
//   • سطح البطاقة: أبيض دافئ خفيف — جزيرة محتوى لا شاشة بيضاء كاملة.
//   • الأخضر: لحظات الهوية (عدّ تنازلي، تبويب نشط، شارة مضيف، تأهّل).
//   • العنبر: وقت المباراة والتمييز الثانوي.
//   • الحبر: نص قوي للتراءة.
//
nonisolated enum AcTheme {
    static let saudiId = 23

    private static func dyn(
        _ light: (CGFloat, CGFloat, CGFloat, CGFloat),
        _ dark: (CGFloat, CGFloat, CGFloat, CGFloat)
    ) -> Color {
        Color(uiColor: UIColor { tc in
            let c = tc.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: c.3)
        })
    }

    // هوية
    static let emerald     = Color(red: 0.039, green: 0.541, blue: 0.310) // #0A8A4F
    static let emeraldSoft = Color(red: 0.071, green: 0.647, blue: 0.376)
    static let emeraldDeep = Color(red: 0.027, green: 0.420, blue: 0.239)
    static let crimson     = Color(red: 0.847, green: 0.255, blue: 0.235)

    // زمردي «نصّي» ديناميكي: عميق على الفاتح، مُشرق على الداكن —
    // يُستعمل للنصوص والأيقونات، بينما يبقى emeraldDeep الثابت للتدرّجات والتعبئات.
    static var emeraldInk: Color {
        dyn((0.027, 0.420, 0.239, 1), (0.36, 0.80, 0.53, 1))
    }

    // عنبر دافئ — دوره محصور: وقت المباراة، الصدارة (أول 3)، التعادل، والمركز الثالث.
    static let amber       = Color(red: 0.72, green: 0.52, blue: 0.18)
    static let amberDeep   = Color(red: 0.55, green: 0.38, blue: 0.10)

    // خلفية الشاشة — عمق ملون هادئ (ليست رمادي أبيض)
    static let inkTop      = dyn((0.86, 0.91, 0.88, 1), (0.05, 0.08, 0.06, 1))
    static let inkBottom   = dyn((0.80, 0.87, 0.83, 1), (0.03, 0.05, 0.04, 1))
    static let graphite    = dyn((0.96, 0.97, 0.95, 1), (0.11, 0.14, 0.12, 1))
    static let graphiteHi  = dyn((0.985, 0.99, 0.98, 1), (0.14, 0.17, 0.15, 1))

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
        LinearGradient(
            colors: [
                inkTop,
                dyn((0.83, 0.89, 0.85, 1), (0.04, 0.07, 0.05, 1)),
                inkBottom,
            ],
            startPoint: .top, endPoint: .bottom
        )
    }

    static var surface: Color { graphite }
    static var surfaceRaised: Color { graphiteHi }
    static var cardFill: Color { dyn((0.985, 0.99, 0.98, 1), (1, 1, 1, 0.07)) }
    static var cardFillStrong: Color { dyn((0.995, 0.997, 0.99, 1), (1, 1, 1, 0.10)) }
    static var chipFill: Color { dyn((0.10, 0.28, 0.18, 0.07), (1, 1, 1, 0.08)) }

    static var outline: Color { dyn((0.12, 0.28, 0.20, 0.14), (1, 1, 1, 0.14)) }
    static var outlineStrong: Color { dyn((0.12, 0.28, 0.20, 0.26), (1, 1, 1, 0.24)) }
    static let borderWidth: CGFloat = 1

    static var onDark: Color { dyn((0.10, 0.14, 0.12, 1), (1, 1, 1, 1)) }
    static var onDarkStrong: Color { dyn((0.06, 0.09, 0.07, 1), (1, 1, 1, 1)) }
    static var onDarkDim: Color { dyn((0.35, 0.42, 0.38, 1), (1, 1, 1, 0.70)) }
    // تباين ≥ 4.5:1 على سطح البطاقة — يُستعمل لنصوص صغيرة فلا يجوز أفتح من هذا.
    static var onDarkFaint: Color { dyn((0.40, 0.46, 0.43, 1), (1, 1, 1, 0.55)) }

    static let cardRadius: CGFloat = 16
    static let tileRadius: CGFloat = 14
    static let chipRadius: CGFloat = 8
    static let buttonRadius: CGFloat = 12
}
