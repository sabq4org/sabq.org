import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// هوية «VARA الرياضي» البصرية — **تكيّفية فاتح/داكن باحترافية**.
//
// الفاتح (الافتراضي): iOS grouped هادئ — خلفية رمادية محايدة فاتحة،
// بطاقات/بلوكات بيضاء كبيرة بزوايا ناعمة، نص أسود/رمادي، ولون مظهر قابل للتغيير.
// الداكن: سُخامي مزرقّ هادئ على طراز «Dim» (لا أسود كالح) — خلفية #1B2129،
// أسطح مرتفعة #252C36، حدود خفيفة، نص أبيض/رمادي، والأخضر أسطع ليُقرأ.
//
// كل لون يُحلّ ديناميكيًّا حسب مظهر الجهاز عبر `dyn(فاتح:داكن:)` — فتبديل المظهر
// (تلقائي/فاتح/داكن من «حسابي») يسري على كل الشاشات فورًا بلا تغيير أي رمز.
// كل أسماء الرموز محفوظة (470+ استخدامًا)؛ تغيّر تمثيلها إلى لون تكيّفي فقط.
// MARK: - لوحة لون التطبيق (اختيار المستخدم)
//
// اللون المحوري في التطبيق يتبع «اللوحة المختارة» من الإعدادات. النطاق متعمّد:
// أزرار/أيقونات/حالات نشطة/أشرطة فقط؛ خلفيات المحتوى تبقى محايدة لضمان القراءة.
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

    // ١٠ ألوان هادئة — كل لون قابل للقراءة كنص/زر على الأبيض والداكن.
    // الأحمر هو الافتراضي، لكن اختيار المستخدم من «لون التطبيق» يبقى هو الحاكم.
    static let emerald  = make("emerald",  "أخضر",    Color(red: 0.059, green: 0.463, blue: 0.431), Color(red: 0.302, green: 0.729, blue: 0.650))
    static let blue     = make("blue",     "أزرق",    Color(red: 0.145, green: 0.388, blue: 0.620), Color(red: 0.424, green: 0.639, blue: 0.910))
    static let teal     = make("teal",     "سماوي",   Color(red: 0.055, green: 0.463, blue: 0.522), Color(red: 0.333, green: 0.741, blue: 0.808))
    static let indigo   = make("indigo",   "نيلي",    Color(red: 0.294, green: 0.337, blue: 0.588), Color(red: 0.565, green: 0.612, blue: 0.886))
    static let purple   = make("purple",   "بنفسجي",  Color(red: 0.431, green: 0.329, blue: 0.620), Color(red: 0.682, green: 0.584, blue: 0.871))
    static let pink     = make("pink",     "وردي",    Color(red: 0.635, green: 0.290, blue: 0.467), Color(red: 0.878, green: 0.549, blue: 0.690))
    static let red      = make("red",      "أحمر VARA", Color(red: 0.733, green: 0.216, blue: 0.204), Color(red: 0.918, green: 0.408, blue: 0.388))
    static let orange   = make("orange",   "نحاسي",   Color(red: 0.678, green: 0.392, blue: 0.149), Color(red: 0.918, green: 0.620, blue: 0.369))
    static let amber    = make("amber",    "ذهبي",    Color(red: 0.651, green: 0.482, blue: 0.082), Color(red: 0.878, green: 0.714, blue: 0.278))
    static let graphite = make("graphite", "رصاصي",   Color(red: 0.275, green: 0.314, blue: 0.365), Color(red: 0.612, green: 0.659, blue: 0.729))

    static let all: [SpTeamPalette] = [
        .red, .emerald, .blue, .teal, .indigo, .purple, .pink, .orange, .amber, .graphite
    ]
    static func by(id: String) -> SpTeamPalette { all.first { $0.id == id } ?? .red }
}

/// اللوحة الفعّالة — حامل غير معزول كي يقرأه `SpTheme` (nonisolated) مباشرةً.
/// يُحدَّث من `SpAccentTheme` (MainActor) عند تبديل النادي.
nonisolated(unsafe) var spActivePalette: SpTeamPalette = .red

/// نمط الألوان الفعّال: false = هوية موحّدة للواجهة، والبطولات لا تعيد صبغ التطبيق.
/// يبقى المتغير لأجل توافق الشاشات القديمة التي تقرأه.
nonisolated(unsafe) var spVaraColorStyle: Bool = false

nonisolated enum SpTheme {
    /// مُعرّف المنتخب السعودي (api-sports) — للإبراز السعودي.
    static let saudiId = 23

    /// لون تكيّفي: يُحلّ للنسخة الفاتحة أو الداكنة حسب مظهر الجهاز عند العرض.
    static func dyn(_ light: Color, _ dark: Color) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }

    // ── ألوان العلامة: تتبع «لون التطبيق» المختار، والذهبي للميداليات ──
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

    // ── نمط موحّد: لون المستخدم هو المحور، والبطولات تبقى ضمن قالب هادئ ──
    /// هل النمط المتعدد فعّال؟ القيمة الافتراضية false بعد اعتماد الهوية الموحدة.
    static var isVaraStyle: Bool { spVaraColorStyle }

    /// لون «التميّز» — الهدّاف/المتصدّر/الأرقام البارزة: ذهبي محدود، لا يغيّر
    /// هوية الشاشة ولا يرتبط بلون البطولة.
    static var excellence: Color { gold }

    /// صبغة البطولة داخل الواجهة. بعد التجربة، ألوان البطولات لا تصبغ التطبيق؛
    /// نعيد لون التطبيق المختار كي تبقى الهوية متناسقة في كل الشاشات.
    static func compAccent(_ slug: String?) -> Color {
        green
    }
    // ألوان دلالية مركزية — لا تثبّت قيمها في الشاشات: الكرت الأصفر وميداليتا الفضة/البرونز (الذهب = gold أعلاه).
    static let yellowCard  = dyn(Color(red: 0.95, green: 0.76, blue: 0.22), Color(red: 0.98, green: 0.83, blue: 0.34))
    static let medalSilver = dyn(Color(red: 0.74, green: 0.76, blue: 0.80), Color(red: 0.80, green: 0.82, blue: 0.86))
    static let medalBronze = dyn(Color(red: 0.80, green: 0.55, blue: 0.35), Color(red: 0.88, green: 0.64, blue: 0.44))
    static var leaf: Color { dyn(spActivePalette.softLight, spActivePalette.softDark) }

    /// اللون المحوري للإبراز/الأيقونات.
    static var emeraldDeep: Color { dyn(spActivePalette.primaryLight, spActivePalette.primaryDark) }
    /// لمسة ثانوية من لون التطبيق — للشارات واللمسات الصغيرة فقط.
    static var teamSecondary: Color { dyn(spActivePalette.secondaryLight, spActivePalette.secondaryDark) }

    // ── الترويسات الملونة (شرائط علوية بنص أبيض — تتبع لون التطبيق) ──
    static var heroTop: Color { dyn(spActivePalette.primaryLight, spActivePalette.deepDark) }
    static var heroBottom: Color { dyn(spActivePalette.deepLight, spActivePalette.deepDark) }
    static var stadiumTop: Color { dyn(spActivePalette.primaryLight, spActivePalette.deepDark) }
    static var stadiumBottom: Color { dyn(spActivePalette.deepLight, spActivePalette.deepDark) }

    /// تدرّج الترويسة الملونة (نص أبيض دائمًا).
    static var heroGradient: LinearGradient {
        LinearGradient(colors: [heroTop, heroBottom], startPoint: .top, endPoint: .bottom)
    }

    /// تدرّج ترويسة البطولة يتبع لون التطبيق، لا لون البطولة.
    static func compHeroGradient(_ slug: String?) -> LinearGradient {
        heroGradient
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

    /// خلفية الشاشة — رمادي iOS محايد قريب من المراجع (#F4F4F7 → #F1F2F5) /
    /// سُخامي مزرقّ هادئ (داكن، لا أسود كالح).
    static var screenGradient: LinearGradient {
        LinearGradient(
            colors: [
                dyn(Color(red: 0.957, green: 0.957, blue: 0.973), Color(red: 0.106, green: 0.128, blue: 0.160)),
                dyn(Color(red: 0.945, green: 0.949, blue: 0.965), Color(red: 0.090, green: 0.110, blue: 0.140)),
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
                dyn(.white, Color(red: 0.137, green: 0.163, blue: 0.203)),
            ],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    // بلا إطارات للبطاقات — نعتمد التباعد والتدرّج اللوني (tonal elevation) للفصل
    // بدل الحدّ الصريح الذي كان يجعل كل قسم صندوقًا، خصوصًا في الوضع الداكن.
    // دليل الهوية الجديد: البنية تصنعها كتل بيضاء فوق رمادي محايد؛ الحدّ
    // خافت جداً حتى لا تصبح البطاقات صناديق ثقيلة.
    static var cardStroke: Color { dyn(Color(red: 0.910, green: 0.914, blue: 0.925), .clear) }
    static var cardFill: Color { dyn(.white, Color(red: 0.145, green: 0.172, blue: 0.212)) }
    static var chipFill: Color { dyn(Color(red: 0.941, green: 0.943, blue: 0.949), Color(red: 0.196, green: 0.230, blue: 0.278)) }  // شريحة #F0F0F2
    /// حبّة شريط الأيام — أغمق قليلًا من الخلفية في الداكن كي تذوب معها (أبيض في الفاتح).
    static var railChipFill: Color { dyn(.white, Color(red: 0.082, green: 0.100, blue: 0.128)) }
    /// فاصل داخليّ خافت جدًّا — خطوط شعرية بدل حدود ثقيلة.
    static var outline: Color { dyn(Color(red: 0.890, green: 0.894, blue: 0.906), Color(red: 0.216, green: 0.250, blue: 0.298)) }

    /// لا ظلّ للبطاقات — تصميم مسطّح يعتمد الحدّ الحادّ الخفيف للفصل.
    static var cardShadow: Color { .clear }

    // ── حبر النص: أسود/رمادي محايد في الفاتح، أبيض/رمادي في الداكن.
    // الأسماء محفوظة لتوافق مئات الاستخدامات القديمة.
    static var onDark: Color { dyn(Color(red: 0.055, green: 0.057, blue: 0.062), Color(red: 0.93, green: 0.95, blue: 0.97)) }       // أساسي
    static var onDarkStrong: Color { dyn(.black, .white) }                                                                         // أقوى
    static var onDarkDim: Color { dyn(Color(red: 0.455, green: 0.459, blue: 0.475), Color(red: 0.64, green: 0.68, blue: 0.73)) }   // ثانوي
    static var onDarkFaint: Color { dyn(Color(red: 0.675, green: 0.682, blue: 0.706), Color(red: 0.46, green: 0.50, blue: 0.55)) } // باهت

    // سُلّم الزوايا بنمط iOS grouped: بطاقات كبيرة 28 · بلاطات 16 · شرائح 12.
    static let cardRadius: CGFloat = 28
    static let tileRadius: CGFloat = 16
    static let chipRadius: CGFloat = 12
    static let buttonRadius: CGFloat = 16
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

// MARK: - لون التطبيق
//
// يُحقن في البيئة ويُطبَّق في `SabqSportsApp`. تبديل اللون يحدّث `spActivePalette`
// (الذي يقرأه SpTheme) ويُعيد بناء الواجهة لتلتقط الألوان الجديدة. الاختيار محفوظ.
@MainActor
@Observable
final class SpAccentTheme {
    static let shared = SpAccentTheme()

    private let key = "sabqsports.accent.team"
    private let styleKey = "sabqsports.accent.style"
    private let defaultMigrationKey = "sabqsports.accent.default.red.20260706"

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

    /// محفوظ للتوافق مع إصدارات تجربة ألوان البطولات. الواجهة الحالية موحّدة دائمًا.
    var styleId: String {
        didSet {
            UserDefaults.standard.set("unified", forKey: styleKey)
            spVaraColorStyle = false
            SpTabBarVisibility.shared.hidden = false
        }
    }

    var palette: SpTeamPalette { SpTeamPalette.by(id: paletteId) }

    private init() {
        let stored = UserDefaults.standard.string(forKey: key)
        let migrated = UserDefaults.standard.bool(forKey: defaultMigrationKey)
        let saved: String
        if stored == nil {
            saved = SpTeamPalette.red.id
        } else if stored == SpTeamPalette.emerald.id, !migrated {
            saved = SpTeamPalette.red.id
            UserDefaults.standard.set(saved, forKey: key)
            UserDefaults.standard.set(true, forKey: defaultMigrationKey)
        } else {
            saved = stored ?? SpTeamPalette.red.id
            if !migrated { UserDefaults.standard.set(true, forKey: defaultMigrationKey) }
        }
        paletteId = saved
        spActivePalette = SpTeamPalette.by(id: saved)
        styleId = "unified"
        UserDefaults.standard.set("unified", forKey: styleKey)
        spVaraColorStyle = false
    }
}
