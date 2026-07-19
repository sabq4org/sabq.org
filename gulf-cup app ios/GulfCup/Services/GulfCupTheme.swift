import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// هوية «خليجي 27» — ملعب ليلي تركوازي + سكاي (نفس العائلة اللونية).
//
// المبادئ:
//   • الهيرو تركواز ليلي بارد (مو أخضر غابة دافئ) ليتناغم مع السكاي.
//   • السكاي للفعل الأساسي؛ التركواز/الزمردي البارد للدعم.
//   • بلا ذهب.
//   • خلفية فاتحة محايدة مائلة للسيان الخفيف.
enum GcTheme {
    static let saudiId = 23

    /// لون تكيّفي يتبدّل مع مظهر النظام — (r,g,b,a) لكل وضع.
    static func dyn(
        _ light: (CGFloat, CGFloat, CGFloat, CGFloat),
        _ dark: (CGFloat, CGFloat, CGFloat, CGFloat)
    ) -> Color {
        #if canImport(UIKit)
        return Color(uiColor: UIColor { tc in
            let c = tc.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: c.3)
        })
        #else
        return Color(red: light.0, green: light.1, blue: light.2, opacity: light.3)
        #endif
    }

    // ── هوية باردة: تركواز → سكاي (نفس العائلة) ──
    static let emerald     = dyn((0.055, 0.455, 0.420, 1), (0.220, 0.720, 0.660, 1))   // #0E746B
    static let emeraldSoft = dyn((0.090, 0.530, 0.490, 1), (0.300, 0.780, 0.720, 1))
    static let emeraldLite = dyn((0.180, 0.700, 0.660, 1), (0.400, 0.840, 0.790, 1))
    static let emeraldDeep = dyn((0.035, 0.340, 0.320, 1), (0.280, 0.760, 0.700, 1))
    static let forest      = dyn((0.020, 0.120, 0.130, 1), (0.015, 0.100, 0.110, 1))   // ليلي تركوازي
    static let teal        = dyn((0.050, 0.520, 0.560, 1), (0.320, 0.760, 0.780, 1))
    static let leaf        = dyn((0.300, 0.760, 0.700, 1), (0.420, 0.820, 0.760, 1))

    /// الفعل الأساسي — سكاي روشن
    static let sky         = Color(red: 0.220, green: 0.741, blue: 0.973)   // sky-400
    static let skyLite     = Color(red: 0.490, green: 0.827, blue: 0.988)   // sky-300
    static let skyDeep     = Color(red: 0.008, green: 0.310, blue: 0.424)   // sky-950

    /// أسماء قديمة مُعاد توجيهها للسكاي — لا ذهب في الهوية.
    static var gold: Color     { sky }
    static var goldDeep: Color { skyDeep }
    static var goldLite: Color { skyLite }
    static var amber: Color    { sky }
    static let crimson     = dyn((0.79, 0.19, 0.22, 1), (0.97, 0.44, 0.44, 1))
    static let liveRed     = dyn((0.87, 0.17, 0.24, 1), (0.99, 0.42, 0.46, 1))

    // ── خلفية محايدة مائلة للسيان (بلا صبغة غابة) ──
    static var appBg: Color    { dyn((0.933, 0.945, 0.949, 1), (0.035, 0.055, 0.060, 1)) }      // #EEF1F2
    static var appBgMid: Color { dyn((0.918, 0.933, 0.941, 1), (0.045, 0.070, 0.078, 1)) }

    static var screenGradient: LinearGradient {
        LinearGradient(colors: [appBg, appBgMid, appBg], startPoint: .top, endPoint: .bottom)
    }

    // ── هيرو ليلي تركوازي بارد — ينسجم مع السكاي ──
    static let heroTop    = Color(red: 0.016, green: 0.110, blue: 0.133)   // #04221F-ish cool
    static let heroMid    = Color(red: 0.020, green: 0.145, blue: 0.165)   // #05352A → cooler #05352A
    static let heroDeep   = Color(red: 0.030, green: 0.200, blue: 0.220)   // #084D38 → cooler teal

    static var heroGradient: LinearGradient {
        LinearGradient(colors: [heroTop, heroMid, heroDeep], startPoint: .topTrailing, endPoint: .bottomLeading)
    }
    static var pitchGradient: LinearGradient { heroGradient }

    static var goldTitleGradient: LinearGradient { skyFill }
    static var emeraldGradient: LinearGradient {
        LinearGradient(colors: [emeraldSoft, emerald], startPoint: .topTrailing, endPoint: .bottomLeading)
    }
    static var goldFill: LinearGradient { skyFill }
    static var skyFill: LinearGradient {
        LinearGradient(colors: [skyLite, sky], startPoint: .top, endPoint: .bottom)
    }

    // ── الأسطح ──
    static var cardBg: Color       { dyn((1, 1, 1, 1), (0.075, 0.105, 0.112, 1)) }
    static var cardBgSubtle: Color { dyn((0.980, 0.984, 0.986, 1), (0.065, 0.095, 0.102, 1)) }
    static var pressedBg: Color    { dyn((0.910, 0.935, 0.940, 1), (1, 1, 1, 0.10)) }
    static var chipFill: Color     { dyn((0.890, 0.910, 0.920, 1), (0.110, 0.150, 0.160, 1)) }

    static var line: Color { dyn((0.820, 0.850, 0.860, 1), (1, 1, 1, 0.10)) }
    static var outline: Color { dyn((0.800, 0.835, 0.845, 1), (0.120, 0.165, 0.175, 1)) }
    static var outlineStrong: Color { dyn((0.720, 0.770, 0.785, 1), (1, 1, 1, 0.14)) }
    static var lineSoft: Color { line }

    // ── النص — حبر بارد (مو أخضر غابة) ──
    static var ink: Color      { dyn((0.055, 0.110, 0.125, 1), (0.930, 0.955, 0.960, 1)) }
    static var inkDim: Color   { dyn((0.340, 0.410, 0.430, 1), (0.620, 0.700, 0.720, 1)) }
    static var inkFaint: Color { dyn((0.500, 0.560, 0.580, 1), (0.430, 0.500, 0.520, 1)) }
    static var onDark: Color        { ink }
    static var onDarkStrong: Color  { dyn((0.04, 0.05, 0.055, 1), (1, 1, 1, 1)) }
    static var onDarkDim: Color     { inkDim }
    static var onDarkFaint: Color   { inkFaint }

    static let onHero      = Color.white
    static let onHeroDim   = Color(red: 0.700, green: 0.880, blue: 0.900)   // سيان فاتح
    static let onHeroFaint = Color(red: 0.560, green: 0.760, blue: 0.790)

    static var formWin: Color    { emerald }
    static let formDraw          = dyn((0.52, 0.56, 0.50, 1), (0.70, 0.74, 0.62, 1))
    static var formLose: Color   { crimson }
    static var qualifyBar: Color { emerald }

    static var cardShadow: Color   { Color.clear }
    static var raisedShadow: Color { Color.clear }
    static var heroShadow: Color   { dyn((0.020, 0.120, 0.140, 0.28), (0, 0, 0, 0.40)) }

    static let cardRadius: CGFloat = 18
    static let tileRadius: CGFloat = 16
    static let chipRadius: CGFloat = 12
    static let buttonRadius: CGFloat = 14
    static let heroRadius: CGFloat = 26
    static let floatRadius: CGFloat = 22

    static let logoSm: CGFloat = 24
    static let logoMd: CGFloat = 32
    static let logoLg: CGFloat = 52
}

// MARK: - بطاقة موحّدة

extension View {
    func gcCard(radius: CGFloat = GcTheme.cardRadius,
                fill: Color = GcTheme.cardBg,
                stroke: Color = GcTheme.line,
                shadow: Color = Color.clear) -> some View {
        self
            .background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(stroke, lineWidth: 1)
            )
    }
}

// MARK: - أسلوب ضغط

struct GcPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
