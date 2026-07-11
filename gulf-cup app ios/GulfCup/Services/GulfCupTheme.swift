import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// هوية «خليجي 27» v4 — هوية مونديال سبق بصياغة خليجية + نعومة VARA.
//
// المبادئ:
//   • غسلة خضراء فاتحة كخلفية، بطاقات بيضاء مسطّحة بحدود شعرية — بلا ظلال؛
//     الرفع في الوضع الداكن تونالي (بطاقة أفتح من الخلفية). الظلّ الوحيد
//     المسموح تحت البطاقة العائمة في الهيرو (raisedShadow).
//   • تدرج الهيرو الزمردي: ‎#14905C → #0F8054 → #08573B‎ قطريًّا مع توهّج
//     ورقي (leaf) ناعم — تدرج المونديال نفسه.
//   • الذهبي للوجاهة فقط: التتويج، الجائزة، المضيف، التوقعات.
//   • الأحمر للمباشر بلا منازع، والزمردي لكل فعل أساسي.
//   • الحركة: منحنيات ease قصيرة (0.15–0.55s) — لا springs.
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

    // ── الهوية: زمردي المونديال + ذهبي وجاهة ──
    static let emerald     = dyn((0.059, 0.502, 0.329, 1), (0.208, 0.714, 0.514, 1))   // #0F8054
    static let emeraldSoft = dyn((0.078, 0.565, 0.361, 1), (0.302, 0.784, 0.580, 1))   // #14905C
    static let emeraldLite = dyn((0.161, 0.737, 0.478, 1), (0.420, 0.843, 0.643, 1))   // #29BC7A
    static let emeraldDeep = dyn((0.039, 0.420, 0.278, 1), (0.298, 0.796, 0.588, 1))   // #0A6B47 — نص/أيقونات
    static let forest      = dyn((0.020, 0.210, 0.140, 1), (0.014, 0.160, 0.108, 1))
    static let teal        = dyn((0.04, 0.47, 0.51, 1), (0.32, 0.75, 0.72, 1))
    static let leaf        = dyn((0.451, 0.780, 0.302, 1), (0.502, 0.820, 0.361, 1))   // #73C74D — توهّج
    static let gold        = dyn((0.72, 0.53, 0.08, 1), (0.94, 0.75, 0.26, 1))
    static let goldDeep    = dyn((0.60, 0.44, 0.08, 1), (0.88, 0.70, 0.30, 1))
    static let goldLite    = dyn((0.96, 0.83, 0.42, 1), (0.99, 0.88, 0.55, 1))
    static let amber       = dyn((0.82, 0.44, 0.10, 1), (0.98, 0.63, 0.28, 1))
    static let crimson     = dyn((0.79, 0.19, 0.22, 1), (0.97, 0.44, 0.44, 1))
    static let liveRed     = dyn((0.87, 0.17, 0.24, 1), (0.99, 0.42, 0.46, 1))

    // ── الخلفية: غسلة خضراء فاتحة (فاتح) / فحمي أخضر عميق (داكن) ──
    static var appBg: Color    { dyn((0.937, 0.965, 0.945, 1), (0.043, 0.071, 0.055, 1)) }
    static var appBgMid: Color { dyn((0.957, 0.976, 0.961, 1), (0.055, 0.090, 0.071, 1)) }

    static var screenGradient: LinearGradient {
        LinearGradient(colors: [appBg, appBgMid, appBg], startPoint: .top, endPoint: .bottom)
    }

    // ── لوحة الهيرو الزمردية — تدرج المونديال (ثابتة في الوضعين) ──
    static let heroTop    = Color(red: 0.059, green: 0.502, blue: 0.329)   // #0F8054
    static let heroMid    = Color(red: 0.078, green: 0.565, blue: 0.361)   // #14905C
    static let heroDeep   = Color(red: 0.031, green: 0.341, blue: 0.231)   // #08573B

    static var heroGradient: LinearGradient {
        LinearGradient(colors: [heroMid, heroTop, heroDeep], startPoint: .topTrailing, endPoint: .bottomLeading)
    }
    static var pitchGradient: LinearGradient { heroGradient }

    static var goldTitleGradient: LinearGradient {
        LinearGradient(colors: [goldLite, gold, goldDeep], startPoint: .topTrailing, endPoint: .bottomLeading)
    }
    static var emeraldGradient: LinearGradient {
        LinearGradient(colors: [emeraldSoft, emerald], startPoint: .topTrailing, endPoint: .bottomLeading)
    }
    static var goldFill: LinearGradient {
        LinearGradient(colors: [goldLite, gold], startPoint: .top, endPoint: .bottom)
    }

    // ── الأسطح ──
    static var cardBg: Color       { dyn((1, 1, 1, 1), (0.086, 0.125, 0.102, 1)) }
    static var cardBgSubtle: Color { dyn((0.973, 0.984, 0.976, 1), (0.075, 0.110, 0.090, 1)) }
    static var pressedBg: Color    { dyn((0.910, 0.937, 0.918, 1), (1, 1, 1, 0.10)) }
    static var chipFill: Color     { dyn((0.922, 0.949, 0.925, 1), (0.118, 0.165, 0.133, 1)) }

    /// فصل البطاقات: حدّ شعري بدل الظلّ — أخضر باهت في الفاتح، أبيض خافت في الداكن.
    static var line: Color { dyn((0.890, 0.925, 0.898, 1), (1, 1, 1, 0.07)) }
    static var outline: Color { dyn((0.878, 0.918, 0.888, 1), (0.129, 0.176, 0.145, 1)) }
    static var outlineStrong: Color { outline }
    static var lineSoft: Color { line }

    // ── النص ──
    static var ink: Color      { dyn((0.063, 0.133, 0.102, 1), (0.929, 0.957, 0.937, 1)) }
    static var inkDim: Color   { dyn((0.380, 0.467, 0.424, 1), (0.616, 0.698, 0.651, 1)) }
    static var inkFaint: Color { dyn((0.576, 0.651, 0.608, 1), (0.424, 0.502, 0.455, 1)) }
    static var onDark: Color        { ink }
    static var onDarkStrong: Color  { dyn((0.04, 0.05, 0.046, 1), (1, 1, 1, 1)) }
    static var onDarkDim: Color     { inkDim }
    static var onDarkFaint: Color   { inkFaint }

    // نص فوق لوحة الهيرو الزمردية (ثابتة في الوضعين).
    static let onHero      = Color.white
    static let onHeroDim   = Color(red: 0.737, green: 0.890, blue: 0.800)
    static let onHeroFaint = Color(red: 0.620, green: 0.800, blue: 0.700)

    // ألوان وظيفية
    static var formWin: Color    { emerald }
    static let formDraw          = dyn((0.56, 0.58, 0.42, 1), (0.73, 0.75, 0.52, 1))
    static var formLose: Color   { crimson }
    static var qualifyBar: Color { emerald }

    // ── الظلّ: البطاقات مسطّحة بلا ظلال — الظلّ للبطاقة العائمة والهيرو فقط ──
    static var cardShadow: Color   { dyn((0, 0, 0, 0), (0, 0, 0, 0)) }
    static var raisedShadow: Color { dyn((0.031, 0.235, 0.149, 0.16), (0, 0, 0, 0.35)) }
    static var heroShadow: Color   { dyn((0.031, 0.341, 0.231, 0.20), (0, 0, 0, 0.40)) }

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

// MARK: - بطاقة موحّدة (سطح مسطّح بحدّ شعري — بلا ظلّ)

extension View {
    func gcCard(radius: CGFloat = GcTheme.cardRadius,
                fill: Color = GcTheme.cardBg,
                stroke: Color = GcTheme.line,
                shadow: Color = GcTheme.cardShadow) -> some View {
        self
            .background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(stroke, lineWidth: 1))
            .shadow(color: shadow, radius: 14, x: 0, y: 6)
    }
}

// MARK: - أسلوب ضغط موحّد (نعومة VARA: تصغير 0.97 بـ easeOut قصير)

struct GcPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
