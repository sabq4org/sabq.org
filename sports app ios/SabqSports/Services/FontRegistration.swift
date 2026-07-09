import SwiftUI
import CoreText

// تسجيل خط IBM Plex Sans Arabic المُجمَّع (ttf) وقت التشغيل عبر CoreText — نفس نمط
// تطبيق سبق (لا نعتمد UIAppFonts في Info.plist).
//
// تخفيف 2026-07-09: الواجهة كانت تستدعي .bold/.semibold في كل مكان فتبدو كلها ثقيلة.
// نُعيد ربط الأوزان هنا دفعة واحدة بدل لمس مئات الاستدعاءات:
//   regular → Text (جسم أوضح)
//   medium  → Medium
//   semibold → Medium (كان يُعامل كشبه-بولد في كل الشروح)
//   bold    → SemiBold (عناوين الصفوف)
//   heavy/black → Bold (تأكيد نادر فقط)
enum SportsFonts {
    static let text     = "IBMPlexSansArabic-Text"
    static let regular  = "IBMPlexSansArabic"
    static let medium   = "IBMPlexSansArabic-Medm"
    static let semibold = "IBMPlexSansArabic-SmBld"
    static let bold     = "IBMPlexSansArabic-Bold"

    /// موحّد: يربط أوزان SwiftUI بالخط المُجمَّع بتدرّج أخفّ من الاستدعاءات القديمة.
    static func app(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        switch weight {
        case .heavy, .black:
            return .custom(bold, size: size)
        case .bold:
            return .custom(semibold, size: size)
        case .semibold, .medium:
            return .custom(medium, size: size)
        case .light, .thin, .ultraLight:
            return .custom(regular, size: size)
        default:
            return .custom(text, size: size)
        }
    }

    static func headline(size: CGFloat) -> Font { app(size: size, weight: .bold) }
    static func subhead(size: CGFloat) -> Font { app(size: size, weight: .medium) }
    static func body(size: CGFloat) -> Font { app(size: size, weight: .regular) }
}

enum FontRegistration {
    private static var didRegister = false

    static func registerAll() {
        guard !didRegister else { return }
        didRegister = true

        let filenames = [
            "IBMPlexSansArabic-Text.ttf",
            "IBMPlexSansArabic-Regular.ttf",
            "IBMPlexSansArabic-Medium.ttf",
            "IBMPlexSansArabic-SemiBold.ttf",
            "IBMPlexSansArabic-Bold.ttf",
        ]
        for filename in filenames {
            registerFont(named: filename)
        }
    }

    private static func registerFont(named filename: String) {
        let base = (filename as NSString).deletingPathExtension
        let ext = (filename as NSString).pathExtension
        guard let url = Bundle.main.url(forResource: base, withExtension: ext) else {
            #if DEBUG
            print("[SportsFonts] missing bundled file: \(filename)")
            #endif
            return
        }
        var error: Unmanaged<CFError>?
        let ok = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
        if !ok {
            #if DEBUG
            print("[SportsFonts] failed to register \(filename): \(error?.takeRetainedValue().localizedDescription ?? "unknown")")
            #endif
        }
    }
}
