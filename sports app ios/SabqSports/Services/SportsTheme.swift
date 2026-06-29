import SwiftUI

// هوية «VARA الرياضي» البصرية — **تكيّفية فاتح/داكن باحترافية**.
//
// الفاتح (الافتراضي): أبيض نظيف + أخضر زمردي مقتصد، خلفية رمادية فاتحة جدًّا،
// بطاقات بيضاء بحدود رمادية خفيفة، نص أسود/رمادي.
// الداكن: فحميّ عميق نظيف (لا أسود صرف، لا زجاج موحل)، أسطح مرتفعة #1C2129،
// حدود خفيفة، نص أبيض/رمادي، والأخضر الزمردي أكثر سطوعًا ليُقرأ على الداكن.
//
// كل لون يُحلّ ديناميكيًّا حسب مظهر الجهاز عبر `dyn(فاتح:داكن:)` — فتبديل المظهر
// (تلقائي/فاتح/داكن من «حسابي») يسري على كل الشاشات فورًا بلا تغيير أي رمز.
// كل أسماء الرموز محفوظة (470+ استخدامًا)؛ تغيّر تمثيلها إلى لون تكيّفي فقط.
nonisolated enum SpTheme {
    /// مُعرّف المنتخب السعودي (api-sports) — للإبراز السعودي.
    static let saudiId = 23

    /// لون تكيّفي: يُحلّ للنسخة الفاتحة أو الداكنة حسب مظهر الجهاز عند العرض.
    static func dyn(_ light: Color, _ dark: Color) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }

    // ── ألوان العلامة: الأخضر الزمردي (أسطع قليلًا في الداكن)، الذهبي للميداليات ──
    static let ink       = dyn(Color(red: 0.08, green: 0.24, blue: 0.18), Color(red: 0.22, green: 0.58, blue: 0.44))
    static let greenDeep = dyn(Color(red: 0.06, green: 0.30, blue: 0.22), Color(red: 0.10, green: 0.40, blue: 0.30))
    static let green     = dyn(Color(red: 0.09, green: 0.43, blue: 0.32), Color(red: 0.24, green: 0.68, blue: 0.50))
    static let greenSoft = dyn(Color(red: 0.16, green: 0.56, blue: 0.42), Color(red: 0.32, green: 0.76, blue: 0.56))
    static let teal      = dyn(Color(red: 0.12, green: 0.55, blue: 0.52), Color(red: 0.28, green: 0.74, blue: 0.70))
    static let gold      = dyn(Color(red: 0.82, green: 0.62, blue: 0.16), Color(red: 0.96, green: 0.79, blue: 0.36))
    static let goldDeep  = dyn(Color(red: 0.70, green: 0.52, blue: 0.12), Color(red: 0.86, green: 0.69, blue: 0.28))
    static let goldSoft  = dyn(Color(red: 0.93, green: 0.80, blue: 0.42), Color(red: 0.98, green: 0.86, blue: 0.56))
    static let crimson   = dyn(Color(red: 0.86, green: 0.18, blue: 0.24), Color(red: 0.98, green: 0.40, blue: 0.45))
    static let leaf      = dyn(Color(red: 0.16, green: 0.62, blue: 0.38), Color(red: 0.30, green: 0.78, blue: 0.52))

    /// أخضر العلامة للإبراز/الأيقونات.
    static let emeraldDeep = dyn(Color(red: 0.09, green: 0.43, blue: 0.32), Color(red: 0.24, green: 0.68, blue: 0.50))

    // ── الترويسات الخضراء (شرائط علوية بنص أبيض — تبقى خضراء في المظهرين) ──
    static var heroTop: Color { dyn(Color(red: 0.10, green: 0.44, blue: 0.33), Color(red: 0.10, green: 0.42, blue: 0.31)) }
    static var heroBottom: Color { dyn(Color(red: 0.07, green: 0.34, blue: 0.25), Color(red: 0.05, green: 0.26, blue: 0.20)) }
    static var stadiumTop: Color { dyn(Color(red: 0.08, green: 0.37, blue: 0.28), Color(red: 0.08, green: 0.34, blue: 0.26)) }
    static var stadiumBottom: Color { dyn(Color(red: 0.06, green: 0.28, blue: 0.21), Color(red: 0.04, green: 0.22, blue: 0.17)) }

    /// تدرّج الترويسة الخضراء (نص أبيض دائمًا).
    static var heroGradient: LinearGradient {
        LinearGradient(colors: [heroTop, heroBottom], startPoint: .top, endPoint: .bottom)
    }

    /// تدرّج الكتلة الخضراء السعودية البارزة (نص أبيض).
    static var saudiBlockGradient: LinearGradient {
        LinearGradient(colors: [green, greenDeep],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// تدرّج ذهبي↔أخضر لعناوين الأبطال (نادر — للتتويج فقط).
    static var goldTitleGradient: LinearGradient {
        LinearGradient(colors: [gold, goldSoft, greenSoft],
                       startPoint: .topTrailing, endPoint: .bottomLeading)
    }

    /// خلفية الشاشة — رمادي فاتح جدًّا (فاتح) / فحميّ عميق نظيف (داكن).
    static var screenGradient: LinearGradient {
        LinearGradient(
            colors: [
                dyn(Color(red: 0.965, green: 0.970, blue: 0.975), Color(red: 0.055, green: 0.066, blue: 0.078)),
                dyn(Color(red: 0.952, green: 0.958, blue: 0.964), Color(red: 0.035, green: 0.043, blue: 0.052)),
            ],
            startPoint: .top, endPoint: .bottom
        )
    }

    // ── أسطح: بيضاء (فاتح) / فحميّة مرتفعة (داكن) ──
    static var surface: Color { dyn(.white, Color(red: 0.110, green: 0.130, blue: 0.160)) }
    static var surfaceRaised: Color { dyn(.white, Color(red: 0.135, green: 0.158, blue: 0.190)) }

    /// سطح البطاقة.
    static var card: Color { dyn(.white, Color(red: 0.110, green: 0.130, blue: 0.160)) }

    /// تدرّج البطاقة — شبه مسطّح.
    static var cardGradient: LinearGradient {
        LinearGradient(
            colors: [
                dyn(.white, Color(red: 0.120, green: 0.142, blue: 0.172)),
                dyn(Color(red: 0.992, green: 0.994, blue: 0.996), Color(red: 0.100, green: 0.120, blue: 0.148)),
            ],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    static var cardStroke: Color { dyn(Color(red: 0.835, green: 0.851, blue: 0.875), Color(red: 0.205, green: 0.235, blue: 0.280)) } // حدّ حادّ خفيف
    static var cardFill: Color { dyn(.white, Color(red: 0.110, green: 0.130, blue: 0.160)) }
    static var chipFill: Color { dyn(Color(red: 0.945, green: 0.955, blue: 0.965), Color(red: 0.160, green: 0.190, blue: 0.230)) }  // شريحة
    static var outline: Color { dyn(Color(red: 0.89, green: 0.905, blue: 0.920), Color(red: 0.225, green: 0.255, blue: 0.300)) }     // فاصل داخليّ

    /// لا ظلّ للبطاقات — تصميم مسطّح يعتمد الحدّ الحادّ الخفيف للفصل.
    static var cardShadow: Color { .clear }

    // ── حبر النص: أسود/رمادي (فاتح) / أبيض/رمادي (داكن) — الأسماء محفوظة ──
    static var onDark: Color { dyn(Color(red: 0.11, green: 0.13, blue: 0.16), Color(red: 0.93, green: 0.95, blue: 0.97)) }        // أساسي
    static var onDarkStrong: Color { dyn(Color(red: 0.06, green: 0.07, blue: 0.09), .white) }                                     // أقوى
    static var onDarkDim: Color { dyn(Color(red: 0.43, green: 0.46, blue: 0.50), Color(red: 0.64, green: 0.68, blue: 0.73)) }     // ثانوي
    static var onDarkFaint: Color { dyn(Color(red: 0.62, green: 0.65, blue: 0.69), Color(red: 0.46, green: 0.50, blue: 0.55)) }   // باهت

    // نصف قطر (مطابق لبقية تطبيقات سبق لاتساق الإحساس)
    static let cardRadius: CGFloat = 24
    static let tileRadius: CGFloat = 18
    static let chipRadius: CGFloat = 12
    static let buttonRadius: CGFloat = 16
}

// MARK: - مظهر التطبيق (تلقائي / فاتح / داكن)
//
// يُحقن في البيئة ويُطبَّق عبر `.preferredColorScheme` في `SabqSportsApp`. يُحفظ
// الاختيار في UserDefaults فيبقى بين الجلسات. الافتراضي «تلقائي» (يتبع الجهاز).
@MainActor
@Observable
final class SpThemeMode {
    static let shared = SpThemeMode()

    nonisolated enum Mode: String, CaseIterable, Identifiable {
        case system, light, dark
        var id: String { rawValue }
        var label: String {
            switch self {
            case .system: return "تلقائي"
            case .light:  return "فاتح"
            case .dark:   return "داكن"
            }
        }
        var icon: String {
            switch self {
            case .system: return "circle.lefthalf.filled"
            case .light:  return "sun.max.fill"
            case .dark:   return "moon.fill"
            }
        }
    }

    private let key = "sabqsports.theme.mode"

    var mode: Mode {
        didSet { UserDefaults.standard.set(mode.rawValue, forKey: key) }
    }

    private init() {
        mode = Mode(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? .system
    }

    /// قيمة `preferredColorScheme` — nil يعني اتباع الجهاز.
    var colorScheme: ColorScheme? {
        switch mode {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }
}
