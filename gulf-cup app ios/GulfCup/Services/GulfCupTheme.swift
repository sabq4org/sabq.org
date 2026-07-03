import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// هوية «خليجي 27» v3 — «ليالي الخليج»: هوية بطولة فاخرة خاصة بالتطبيق، لا نسخة
// من تطبيقات سبق الأخرى.
//
// المبادئ:
//   • عمق ناعم: بطاقات بيضاء بظلّ منتشر خفيف جدًّا (6%) وزوايا 20pt متّصلة —
//     تُقرأ كطبقات فوق خلفية دافئة، لا أسطح مسطّحة باهتة.
//   • ترويسات غامرة: كل تبويب يفتتح بلوحة زمردية ليلية عميقة بزخرفة هندسية
//     خفيفة (أقواس متّحدة المركز + توهّج ذهبي) تحتها المحتوى يتراكب.
//   • الذهبي للوجاهة فقط: التتويج، الجائزة، المضيف، لحظات البطولة.
//   • الأحمر للمباشر بلا منازع، والزمردي لكل فعل أساسي.
nonisolated enum GcTheme {
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

    // ── الهوية: زمردي محوري + ذهبي وجاهة ──
    static let emerald     = dyn((0.05, 0.44, 0.32, 1), (0.26, 0.72, 0.53, 1))
    static let emeraldSoft = dyn((0.09, 0.58, 0.42, 1), (0.36, 0.80, 0.60, 1))
    static let emeraldLite = dyn((0.30, 0.70, 0.52, 1), (0.48, 0.86, 0.66, 1))
    static let emeraldDeep = dyn((0.02, 0.27, 0.19, 1), (0.04, 0.30, 0.21, 1))
    static let forest      = dyn((0.012, 0.135, 0.09, 1), (0.010, 0.115, 0.078, 1))
    static let teal        = dyn((0.04, 0.47, 0.51, 1), (0.32, 0.75, 0.72, 1))
    static let gold        = dyn((0.72, 0.53, 0.08, 1), (0.94, 0.75, 0.26, 1))
    static let goldDeep    = dyn((0.60, 0.44, 0.08, 1), (0.88, 0.70, 0.30, 1))
    static let goldLite    = dyn((0.96, 0.83, 0.42, 1), (0.99, 0.88, 0.55, 1))
    static let amber       = dyn((0.82, 0.44, 0.10, 1), (0.98, 0.63, 0.28, 1))
    static let crimson     = dyn((0.79, 0.19, 0.22, 1), (0.97, 0.44, 0.44, 1))
    static let liveRed     = dyn((0.87, 0.17, 0.24, 1), (0.99, 0.42, 0.46, 1))

    // ── الخلفية: رمادي دافئ بلمسة خضراء (فاتح) / فحمي أخضر عميق (داكن) ──
    static var appBg: Color    { dyn((0.952, 0.958, 0.952, 1), (0.043, 0.058, 0.052, 1)) }
    static var appBgMid: Color { dyn((0.938, 0.946, 0.940, 1), (0.030, 0.042, 0.038, 1)) }

    static var screenGradient: LinearGradient {
        LinearGradient(colors: [appBg, appBgMid], startPoint: .top, endPoint: .bottom)
    }

    // ── لوحة «ليل الخليج» — ترويسات غامرة ثابتة (داكنة في الوضعين) ──
    static let heroTop    = Color(red: 0.018, green: 0.185, blue: 0.128)
    static let heroMid    = Color(red: 0.024, green: 0.255, blue: 0.170)
    static let heroDeep   = Color(red: 0.008, green: 0.105, blue: 0.072)

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
    static var cardBg: Color       { dyn((1, 1, 1, 1), (0.096, 0.122, 0.112, 1)) }
    static var cardBgSubtle: Color { dyn((0.985, 0.990, 0.986, 1), (0.085, 0.108, 0.100, 1)) }
    static var pressedBg: Color    { dyn((0.92, 0.935, 0.926, 1), (1, 1, 1, 0.10)) }
    static var chipFill: Color     { dyn((0.930, 0.940, 0.932, 1), (0.150, 0.182, 0.168, 1)) }

    /// إطار البطاقات الافتراضي — شعري خفيف جدًّا يحدّ البطاقة في الوضع الفاتح
    /// ويُبرزها في الداكن (الظلّ يغيب هناك).
    static var line: Color { dyn((0.0, 0.0, 0.0, 0.045), (1, 1, 1, 0.065)) }
    static var outline: Color { dyn((0.902, 0.912, 0.905, 1), (0.170, 0.198, 0.185, 1)) }
    static var outlineStrong: Color { outline }
    static var lineSoft: Color { line }

    // ── النص ──
    static var ink: Color      { dyn((0.07, 0.09, 0.08, 1), (0.94, 0.965, 0.95, 1)) }
    static var inkDim: Color   { dyn((0.41, 0.45, 0.43, 1), (0.65, 0.70, 0.67, 1)) }
    static var inkFaint: Color { dyn((0.60, 0.635, 0.62, 1), (0.45, 0.50, 0.48, 1)) }
    static var onDark: Color        { ink }
    static var onDarkStrong: Color  { dyn((0.04, 0.05, 0.046, 1), (1, 1, 1, 1)) }
    static var onDarkDim: Color     { inkDim }
    static var onDarkFaint: Color   { inkFaint }

    // نص فوق لوحة الليل الزمردية (ثابتة في الوضعين).
    static let onHero      = Color.white
    static let onHeroDim   = Color(red: 0.78, green: 0.90, blue: 0.83)
    static let onHeroFaint = Color(red: 0.56, green: 0.74, blue: 0.64)

    // ألوان وظيفية
    static var formWin: Color    { emerald }
    static let formDraw          = dyn((0.56, 0.58, 0.42, 1), (0.73, 0.75, 0.52, 1))
    static var formLose: Color   { crimson }
    static var qualifyBar: Color { emerald }

    // ── الظلّ: منتشر ناعم في الفاتح، غائب في الداكن (الرفع تونالي هناك) ──
    static var cardShadow: Color   { dyn((0, 0, 0, 0.06), (0, 0, 0, 0)) }
    static var raisedShadow: Color { dyn((0, 0, 0, 0.10), (0, 0, 0, 0)) }
    static var heroShadow: Color   { dyn((0.008, 0.105, 0.072, 0.30), (0, 0, 0, 0.45)) }

    static let cardRadius: CGFloat = 20
    static let tileRadius: CGFloat = 16
    static let chipRadius: CGFloat = 12
    static let buttonRadius: CGFloat = 15
    static let heroRadius: CGFloat = 26

    static let logoSm: CGFloat = 24
    static let logoMd: CGFloat = 32
    static let logoLg: CGFloat = 52
}

// MARK: - بطاقة موحّدة (سطح مرفوع بظلّ ناعم + شعري خفيف)

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

// MARK: - أسلوب ضغط موحّد (تصغير خفيف عند اللمس)

struct GcPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.975 : 1)
            .opacity(configuration.isPressed ? 0.92 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.8), value: configuration.isPressed)
    }
}
