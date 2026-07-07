import SwiftUI
import CoreText

// تسجيل خط IBM Plex Sans Arabic المُجمَّع (ttf) وقت التشغيل عبر CoreText — نفس نمط
// تطبيق سبق (لا نعتمد UIAppFonts في Info.plist). ثلاثة أوزان تكفي الواجهة.
// ملاحظة: CoreText لا يسجّل صيغة الويب woff2 — نرفق ttf. والأسماء أدناه هي أسماء
// PostScript الفعلية داخل الملفات (Regular بلا لاحقة، وSemiBold باسم SmBld) — أيّ
// خطأ فيها يُسقط الوزن إلى خط النظام بصمت.
enum SportsFonts {
    static let regular  = "IBMPlexSansArabic"
    static let semibold = "IBMPlexSansArabic-SmBld"
    static let bold     = "IBMPlexSansArabic-Bold"

    /// موحّد: يربط أوزان SwiftUI الثلاثة بالخط المُجمَّع.
    static func app(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        if weight == .bold || weight == .heavy || weight == .black {
            return .custom(bold, size: size)
        }
        if weight == .semibold || weight == .medium {
            return .custom(semibold, size: size)
        }
        return .custom(regular, size: size)
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
            "IBMPlexSansArabic-Regular.ttf",
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
