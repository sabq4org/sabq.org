import SwiftUI
import CoreText

// تسجيل خط IBM Plex Sans Arabic المُجمَّع (woff2) وقت التشغيل عبر CoreText — نفس
// نمط تطبيق سبق (لا نعتمد UIAppFonts في Info.plist). ثلاث أوزان تكفي الواجهة.
enum AsianCupFonts {
    static let regular  = "IBMPlexSansArabic-Regular"
    static let semibold = "IBMPlexSansArabic-SemiBold"
    static let bold     = "IBMPlexSansArabic-Bold"

    /// موحّد: يربط أوزان SwiftUI الثلاثة بالخط المُجمَّع، مع دعم Dynamic Type —
    /// كل مقاس يرتبط بدور نصي نظامي فيتمدّد مع إعداد حجم الخط عند المستخدم.
    static func app(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        let name: String
        if weight == .bold || weight == .heavy || weight == .black {
            name = bold
        } else if weight == .semibold || weight == .medium {
            name = semibold
        } else {
            name = regular
        }
        return .custom(name, size: size, relativeTo: textStyle(for: size))
    }

    /// سلّم الأدوار: 11 تسمية دقيقة · 12 ثانوي · 13-14 متن · 15-16 عنوان بطاقة ·
    /// 17-19 عنوان بارز · 20-25 عنوان قسم · 26-31 عنوان شاشة · 32+ أرقام العرض.
    private static func textStyle(for size: CGFloat) -> Font.TextStyle {
        switch size {
        case ..<12: return .caption2
        case ..<13: return .caption
        case ..<15: return .subheadline
        case ..<17: return .body
        case ..<20: return .headline
        case ..<26: return .title3
        case ..<32: return .title
        default: return .largeTitle
        }
    }

    static func headline(size: CGFloat) -> Font { app(size: size, weight: .bold) }
    static func subhead(size: CGFloat) -> Font { app(size: size, weight: .semibold) }
}

enum FontRegistration {
    private static var didRegister = false

    static func registerAll() {
        guard !didRegister else { return }
        didRegister = true

        let filenames = [
            "IBMPlexSansArabic-Regular.woff2",
            "IBMPlexSansArabic-SemiBold.woff2",
            "IBMPlexSansArabic-Bold.woff2",
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
            print("[AsianCupFonts] missing bundled file: \(filename)")
            #endif
            return
        }
        var error: Unmanaged<CFError>?
        let ok = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
        if !ok {
            #if DEBUG
            print("[AsianCupFonts] failed to register \(filename): \(error?.takeRetainedValue().localizedDescription ?? "unknown")")
            #endif
        }
    }
}
