import SwiftUI

// هوية «خليجي 27» — أخضر خليجي عميق + ذهبي (مطابق لهيرو الويب GcHero).
// تطبيق مستضيف خليجي: فخامة، عمق، وتوهّج ذهبي — بعكس الهوية الباردة المحايدة لكأس آسيا.
enum GcTheme {
    static let saudiId = 23

    // ── ألوان الهوية (ثابتة) ──
    static let emerald     = Color(red: 0.06, green: 0.55, blue: 0.38)
    static let emeraldSoft = Color(red: 0.16, green: 0.72, blue: 0.52)
    static let emeraldDeep = Color(red: 0.02, green: 0.22, blue: 0.15)
    static let forest      = Color(red: 0.01, green: 0.14, blue: 0.09)
    static let teal        = Color(red: 0.08, green: 0.58, blue: 0.55)
    static let gold        = Color(red: 0.95, green: 0.76, blue: 0.22)
    static let goldDeep    = Color(red: 0.72, green: 0.52, blue: 0.08)
    static let amber       = Color(red: 0.98, green: 0.82, blue: 0.35)
    static let crimson     = Color(red: 0.90, green: 0.24, blue: 0.28)

    // ── خلفيات ──
    static let inkTop      = Color(red: 0.01, green: 0.09, blue: 0.06)
    static let inkBottom   = Color(red: 0.02, green: 0.12, blue: 0.08)
    static let graphite    = Color(red: 0.97, green: 0.99, blue: 0.98)
    static let graphiteHi  = Color.white

    static var heroTop: Color { Color(red: 0.01, green: 0.09, blue: 0.06) }
    static var heroBottom: Color { Color(red: 0.02, green: 0.22, blue: 0.16) }

    static var heroGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color(red: 0.01, green: 0.09, blue: 0.06),
                Color(red: 0.02, green: 0.22, blue: 0.16),
                Color(red: 0.01, green: 0.10, blue: 0.07),
            ],
            startPoint: .bottomLeading,
            endPoint: .topTrailing
        )
    }

    static var sectionGradient: LinearGradient {
        LinearGradient(
            colors: [graphiteHi, graphite],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    static var goldTitleGradient: LinearGradient {
        LinearGradient(
            colors: [amber, gold, goldDeep],
            startPoint: .topTrailing,
            endPoint: .bottomLeading
        )
    }

    static var screenGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color(red: 0.96, green: 0.99, blue: 0.97),
                Color(red: 0.92, green: 0.98, blue: 0.94),
                Color(red: 0.88, green: 0.96, blue: 0.91),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    // ── أسطح ──
    static var surface: Color { graphite }
    static var surfaceRaised: Color { graphiteHi }
    static var cardFill: Color { Color.white.opacity(0.88) }
    static var cardFillStrong: Color { Color.white }
    static var chipFill: Color { Color(red: 0.04, green: 0.28, blue: 0.18, opacity: 0.07) }
    static var outline: Color { Color(red: 0.04, green: 0.28, blue: 0.18, opacity: 0.14) }
    static var outlineStrong: Color { Color(red: 0.04, green: 0.28, blue: 0.18, opacity: 0.24) }

    // نص على الهيرو الداكن / نص عام على الفاتح
    static var onDark: Color { Color(red: 0.08, green: 0.12, blue: 0.10) }
    static var onDarkStrong: Color { Color(red: 0.02, green: 0.08, blue: 0.05) }
    static var onDarkDim: Color { Color(red: 0.32, green: 0.42, blue: 0.36) }
    static var onDarkFaint: Color { Color(red: 0.50, green: 0.58, blue: 0.52) }

    // نص فوق الهيرو الداكن
    static var onHero: Color { Color.white }
    static var onHeroDim: Color { Color(red: 0.75, green: 0.92, blue: 0.82) }
    static var onHeroFaint: Color { Color(red: 0.55, green: 0.78, blue: 0.65) }

    static let cardRadius: CGFloat = 24
    static let tileRadius: CGFloat = 18
    static let chipRadius: CGFloat = 12
    static let buttonRadius: CGFloat = 16
}
