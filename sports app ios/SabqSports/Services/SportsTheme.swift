import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// هوية «VARA الرياضي» البصرية — **تكيّفية فاتح/داكن باحترافية**.
//
// الفاتح (الافتراضي): أبيض نظيف + أخضر زمردي مقتصد، خلفية رمادية فاتحة جدًّا،
// بطاقات بيضاء بحدود رمادية خفيفة، نص أسود/رمادي.
// الداكن: سُخامي مزرقّ هادئ على طراز «Dim» (لا أسود كالح) — خلفية #1B2129،
// أسطح مرتفعة #252C36، حدود خفيفة، نص أبيض/رمادي، والأخضر أسطع ليُقرأ.
//
// كل لون يُحلّ ديناميكيًّا حسب مظهر الجهاز عبر `dyn(فاتح:داكن:)` — فتبديل المظهر
// (تلقائي/فاتح/داكن من «حسابي») يسري على كل الشاشات فورًا بلا تغيير أي رمز.
// كل أسماء الرموز محفوظة (470+ استخدامًا)؛ تغيّر تمثيلها إلى لون تكيّفي فقط.
// MARK: - لوحة ألوان النادي (هوية المشجّع)
//
// كل مشجّع يميل للون ناديه. اللون المحوري في التطبيق (الأخضر تاريخيًّا) صار
// يتبع «اللوحة المختارة»، فيُعاد تلوين كل الواجهة عند تبديل النادي. النطاق:
// اللون المحوري فقط (أزرار/أيقونات/حالات نشطة/أشرطة/الترويسة الملوّنة)؛ خلفيات
// المحتوى تبقى محايدة لضمان القراءة.
nonisolated struct SpTeamPalette: Identifiable, Equatable {
    let id: String
    let name: String
    // الأساسي (المحوري) — يحلّ محلّ الأخضر. اخترنا اللون الأوضح للقراءة كنصّ/زرّ.
    let primaryLight: Color
    let primaryDark: Color
    let softLight: Color
    let softDark: Color
    let deepLight: Color
    let deepDark: Color
    // لمسة ثانوية (مثل أصفر النصر) — للشارات واللمسات الصغيرة فقط.
    let secondaryLight: Color
    let secondaryDark: Color

    /// يشتقّ درجة أفتح/أغمق من لون أساس (لاشتقاق soft/deep تلقائيًّا).
    nonisolated static func shade(_ c: Color, _ factor: CGFloat) -> Color {
        #if canImport(UIKit)
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        if UIColor(c).getHue(&h, saturation: &s, brightness: &b, alpha: &a) {
            return Color(hue: Double(h), saturation: Double(min(1, s)),
                         brightness: Double(max(0, min(1, b * factor))), opacity: Double(a))
        }
        #endif
        return c
    }

    /// يبني لوحة من لون أساس (فاتح/داكن) باشتقاق الدرجات.
    nonisolated static func make(_ id: String, _ name: String, _ light: Color, _ dark: Color) -> SpTeamPalette {
        SpTeamPalette(
            id: id, name: name,
            primaryLight: light, primaryDark: dark,
            softLight: shade(light, 1.16), softDark: shade(dark, 1.10),
            deepLight: shade(light, 0.76), deepDark: shade(dark, 0.80),
            secondaryLight: light, secondaryDark: dark
        )
    }

    // ١٠ ألوان مميّزة — كل لون قابل للقراءة كنصّ/زرّ على الأبيض (نسخة فاتحة أغمق)
    // وعلى الداكن (نسخة داكنة أفتح). الأخضر هو الافتراضي.
    // الزمردي = «الأخضر الملعبي» #0A4431 من دليل الهوية (VARA Brand Identity v1.0)؛
    // make() يشتق منه تلقائيًّا الثانوي #0D513B (soft) والعميق (deep).
    static let emerald  = make("emerald",  "أخضر",   Color(red: 0.039, green: 0.267, blue: 0.192), Color(red: 0.24, green: 0.68, blue: 0.50))
    static let blue     = make("blue",     "أزرق",   Color(red: 0.12, green: 0.36, blue: 0.78), Color(red: 0.40, green: 0.60, blue: 0.98))
    static let teal     = make("teal",     "سماوي",  Color(red: 0.06, green: 0.49, blue: 0.55), Color(red: 0.30, green: 0.74, blue: 0.82))
    static let indigo   = make("indigo",   "نيلي",   Color(red: 0.26, green: 0.30, blue: 0.66), Color(red: 0.52, green: 0.56, blue: 0.96))
    static let purple   = make("purple",   "بنفسجي", Color(red: 0.42, green: 0.27, blue: 0.74), Color(red: 0.64, green: 0.52, blue: 0.96))
    static let pink     = make("pink",     "وردي",   Color(red: 0.78, green: 0.22, blue: 0.48), Color(red: 0.96, green: 0.46, blue: 0.67))
    static let red      = make("red",      "أحمر",   Color(red: 0.80, green: 0.20, blue: 0.22), Color(red: 0.97, green: 0.43, blue: 0.43))
    static let orange   = make("orange",   "برتقالي", Color(red: 0.80, green: 0.42, blue: 0.10), Color(red: 0.98, green: 0.61, blue: 0.27))
    static let amber    = make("amber",    "كهرماني", Color(red: 0.70, green: 0.52, blue: 0.06), Color(red: 0.93, green: 0.73, blue: 0.22))
    static let graphite = make("graphite", "رمادي",  Color(red: 0.30, green: 0.34, blue: 0.40), Color(red: 0.62, green: 0.67, blue: 0.74))

    static let all: [SpTeamPalette] = [
        .emerald, .blue, .teal, .indigo, .purple, .pink, .red, .orange, .amber, .graphite
    ]
    static func by(id: String) -> SpTeamPalette { all.first { $0.id == id } ?? .emerald }
}

/// اللوحة الفعّالة — حامل غير معزول كي يقرأه `SpTheme` (nonisolated) مباشرةً.
/// يُحدَّث من `SpAccentTheme` (MainActor) عند تبديل النادي.
nonisolated(unsafe) var spActivePalette: SpTeamPalette = .emerald

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
    // اللون المحوري (الأخضر سابقًا) يتبع لوحة النادي المختارة عبر `spActivePalette`.
    static var ink: Color       { dyn(spActivePalette.deepLight, spActivePalette.primaryDark) }
    static var greenDeep: Color { dyn(spActivePalette.deepLight, spActivePalette.deepDark) }
    static var green: Color     { dyn(spActivePalette.primaryLight, spActivePalette.primaryDark) }
    static var greenSoft: Color { dyn(spActivePalette.softLight, spActivePalette.softDark) }
    static let teal      = dyn(Color(red: 0.12, green: 0.55, blue: 0.52), Color(red: 0.28, green: 0.74, blue: 0.70))
    // الذهبي #D19E29 = «خط الحكم» في دليل الهوية — بالقطّارة: عنصر واحد في الشاشة.
    static let gold      = dyn(Color(red: 0.82, green: 0.62, blue: 0.16), Color(red: 0.96, green: 0.79, blue: 0.36))
    static let goldDeep  = dyn(Color(red: 0.651, green: 0.482, blue: 0.082), Color(red: 0.86, green: 0.69, blue: 0.28))
    static let goldSoft  = dyn(Color(red: 0.93, green: 0.80, blue: 0.42), Color(red: 0.98, green: 0.86, blue: 0.56))
    // لون الخطأ/المباشر #C64840 من ألوان الحالة في دليل الهوية.
    static let crimson   = dyn(Color(red: 0.776, green: 0.282, blue: 0.251), Color(red: 0.98, green: 0.40, blue: 0.45))
    // ألوان دلالية مركزية — لا تثبّت قيمها في الشاشات: الكرت الأصفر وميداليتا الفضة/البرونز (الذهب = gold أعلاه).
    static let yellowCard  = dyn(Color(red: 0.95, green: 0.76, blue: 0.22), Color(red: 0.98, green: 0.83, blue: 0.34))
    static let medalSilver = dyn(Color(red: 0.74, green: 0.76, blue: 0.80), Color(red: 0.80, green: 0.82, blue: 0.86))
    static let medalBronze = dyn(Color(red: 0.80, green: 0.55, blue: 0.35), Color(red: 0.88, green: 0.64, blue: 0.44))
    static var leaf: Color { dyn(spActivePalette.softLight, spActivePalette.softDark) }

    /// اللون المحوري للإبراز/الأيقونات (يتبع لوحة النادي).
    static var emeraldDeep: Color { dyn(spActivePalette.primaryLight, spActivePalette.primaryDark) }
    /// لمسة لون النادي الثانوية (مثل أصفر النصر) — للشارات واللمسات الصغيرة.
    static var teamSecondary: Color { dyn(spActivePalette.secondaryLight, spActivePalette.secondaryDark) }

    // ── الترويسات الخضراء (شرائط علوية بنص أبيض — تبقى خضراء في المظهرين) ──
    static var heroTop: Color { dyn(spActivePalette.primaryLight, spActivePalette.deepDark) }
    static var heroBottom: Color { dyn(spActivePalette.deepLight, spActivePalette.deepDark) }
    static var stadiumTop: Color { dyn(spActivePalette.primaryLight, spActivePalette.deepDark) }
    static var stadiumBottom: Color { dyn(spActivePalette.deepLight, spActivePalette.deepDark) }

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

    /// خلفية الشاشة — «ضبابي نعناعي» #F4F8F6 من دليل الهوية (فاتح) /
    /// سُخامي مزرقّ هادئ (داكن، لا أسود كالح).
    static var screenGradient: LinearGradient {
        LinearGradient(
            colors: [
                dyn(Color(red: 0.957, green: 0.973, blue: 0.965), Color(red: 0.106, green: 0.128, blue: 0.160)),
                dyn(Color(red: 0.947, green: 0.965, blue: 0.955), Color(red: 0.090, green: 0.110, blue: 0.140)),
            ],
            startPoint: .top, endPoint: .bottom
        )
    }

    // ── أسطح: بيضاء (فاتح) / سُخامية مزرقّة مرتفعة (داكن) ──
    static var surface: Color { dyn(.white, Color(red: 0.145, green: 0.172, blue: 0.212)) }
    static var surfaceRaised: Color { dyn(.white, Color(red: 0.172, green: 0.203, blue: 0.247)) }

    /// سطح البطاقة.
    static var card: Color { dyn(.white, Color(red: 0.145, green: 0.172, blue: 0.212)) }

    /// تدرّج البطاقة — شبه مسطّح.
    static var cardGradient: LinearGradient {
        LinearGradient(
            colors: [
                dyn(.white, Color(red: 0.157, green: 0.186, blue: 0.227)),
                dyn(Color(red: 0.992, green: 0.994, blue: 0.996), Color(red: 0.137, green: 0.163, blue: 0.203)),
            ],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    // بلا إطارات للبطاقات — نعتمد التباعد والتدرّج اللوني (tonal elevation) للفصل
    // بدل الحدّ الصريح الذي كان يجعل كل قسم صندوقًا، خصوصًا في الوضع الداكن.
    // دليل الهوية: «البنية تصنعها حدود شعرية 1px بلون #E4ECE7» في الفاتح؛
    // الداكن يبقى بلا إطارات (فصل بالتدرّج اللوني tonal elevation).
    static var cardStroke: Color { dyn(Color(red: 0.894, green: 0.925, blue: 0.906), .clear) }
    static var cardFill: Color { dyn(.white, Color(red: 0.145, green: 0.172, blue: 0.212)) }
    static var chipFill: Color { dyn(Color(red: 0.929, green: 0.949, blue: 0.937), Color(red: 0.196, green: 0.230, blue: 0.278)) }  // شريحة #EDF2EF
    /// حبّة شريط الأيام — أغمق قليلًا من الخلفية في الداكن كي تذوب معها (أبيض في الفاتح).
    static var railChipFill: Color { dyn(.white, Color(red: 0.082, green: 0.100, blue: 0.128)) }
    /// فاصل داخليّ خافت جدًّا — خطوط شعرية بدل حدود ثقيلة.
    static var outline: Color { dyn(Color(red: 0.894, green: 0.925, blue: 0.906), Color(red: 0.216, green: 0.250, blue: 0.298)) }

    /// لا ظلّ للبطاقات — تصميم مسطّح يعتمد الحدّ الحادّ الخفيف للفصل.
    static var cardShadow: Color { .clear }

    // ── حبر النص (دليل الهوية): حبر أخضر #10231B + رمادي مخضرّ #5A6E64 (فاتح)
    //    / أبيض/رمادي (داكن) — الأسماء محفوظة ──
    static var onDark: Color { dyn(Color(red: 0.063, green: 0.137, blue: 0.106), Color(red: 0.93, green: 0.95, blue: 0.97)) }     // أساسي
    static var onDarkStrong: Color { dyn(Color(red: 0.039, green: 0.090, blue: 0.067), .white) }                                  // أقوى
    static var onDarkDim: Color { dyn(Color(red: 0.353, green: 0.431, blue: 0.392), Color(red: 0.64, green: 0.68, blue: 0.73)) }  // ثانوي
    static var onDarkFaint: Color { dyn(Color(red: 0.616, green: 0.706, blue: 0.659), Color(red: 0.46, green: 0.50, blue: 0.55)) } // باهت #9DB4A8

    // سُلّم الزوايا من دليل الهوية: حقول 10 · أزرار 14 · بطاقات 18.
    static let cardRadius: CGFloat = 18
    static let tileRadius: CGFloat = 14
    static let chipRadius: CGFloat = 10
    static let buttonRadius: CGFloat = 14
}

// MARK: - علامة VARA اللاتينية
//
// دليل الهوية: «VARA» بأحرف متباعدة والراء ذهبية دائمًا، مع الشعار النصي
// «دقّة الرياضة». تُستخدم في ترويسة الرئيسية وذيل «حسابي» وأي موضع علامة.
struct SpWordmark: View {
    var size: CGFloat = 19
    var color: Color = SpTheme.onDark

    var body: some View {
        (Text("VA").foregroundStyle(color)
         + Text("R").foregroundStyle(SpTheme.gold)
         + Text("A").foregroundStyle(color))
        .font(SportsFonts.app(size: size, weight: .heavy))
        .tracking(size * 0.12)
        .environment(\.layoutDirection, .leftToRight)
    }
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

// MARK: - لون النادي (هوية المشجّع)
//
// يُحقن في البيئة ويُطبَّق في `SabqSportsApp`. تبديل النادي يحدّث `spActivePalette`
// (الذي يقرأه SpTheme) ويُعيد بناء الواجهة لتلتقط الألوان الجديدة. الاختيار محفوظ.
@MainActor
@Observable
final class SpAccentTheme {
    static let shared = SpAccentTheme()

    private let key = "sabqsports.accent.team"

    var paletteId: String {
        didSet {
            UserDefaults.standard.set(paletteId, forKey: key)
            spActivePalette = SpTeamPalette.by(id: paletteId)
            // إعادة بناء الواجهة (عبر .id) تعود لتبويب المباريات؛ ولأن حالة إخفاء
            // الشريط السفلي عامة ومشتركة وقد تكون مفعّلة من تمرير «حسابي»، نُعيد
            // إظهار الشريط صراحةً كي لا يبقى مختفيًا بعد تبديل اللون.
            SpTabBarVisibility.shared.hidden = false
        }
    }

    var palette: SpTeamPalette { SpTeamPalette.by(id: paletteId) }

    private init() {
        let saved = UserDefaults.standard.string(forKey: key) ?? SpTeamPalette.emerald.id
        paletteId = saved
        spActivePalette = SpTeamPalette.by(id: saved)
    }
}
