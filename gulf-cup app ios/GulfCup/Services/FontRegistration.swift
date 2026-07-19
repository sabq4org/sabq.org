import SwiftUI
import CoreText
#if canImport(UIKit)
import UIKit
#endif

// تسجيل خط IBM Plex Sans Arabic المُجمَّع (woff2) وقت التشغيل عبر CoreText — نفس
// نمط تطبيق سبق (لا نعتمد UIAppFonts في Info.plist). ثلاث أوزان تكفي الواجهة.
enum GulfCupFonts {
    // الأسماء هنا هي أسماء PostScript الداخلية للملفات المُجمَّعة — وليست أسماء
    // الملفات. Regular اسمه الداخلي بلا لاحقة، وSemiBold لاحقته «SmBld».
    // استخدام اسم خاطئ لا يُظهر خطأً: يسقط SwiftUI بصمت إلى خط النظام.
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
            "IBMPlexSansArabic-Regular.woff2",
            "IBMPlexSansArabic-SemiBold.woff2",
            "IBMPlexSansArabic-Bold.woff2",
        ]
        for filename in filenames {
            registerFont(named: filename)
        }
        applyChromeAppearance()
    }

    /// توحيد خط عناصر النظام (شريط التبويب، شريط التنقل، أزرار الرجوع) مع خط
    /// المحتوى — بدونها تظهر تسمياتها بخط النظام فيبدو التطبيق بخطّين.
    private static func applyChromeAppearance() {
        #if canImport(UIKit)
        if let tabFont = UIFont(name: GulfCupFonts.semibold, size: 10) {
            UITabBarItem.appearance().setTitleTextAttributes([.font: tabFont], for: .normal)
            UITabBarItem.appearance().setTitleTextAttributes([.font: tabFont], for: .selected)
        }
        if let navFont = UIFont(name: GulfCupFonts.bold, size: 17),
           let largeFont = UIFont(name: GulfCupFonts.bold, size: 30) {
            UINavigationBar.appearance().titleTextAttributes = [.font: navFont]
            UINavigationBar.appearance().largeTitleTextAttributes = [.font: largeFont]
        }
        if let barButtonFont = UIFont(name: GulfCupFonts.semibold, size: 15) {
            UIBarButtonItem.appearance().setTitleTextAttributes([.font: barButtonFont], for: .normal)
        }
        #endif
    }

    private static func registerFont(named filename: String) {
        let base = (filename as NSString).deletingPathExtension
        let ext = (filename as NSString).pathExtension
        guard let url = Bundle.main.url(forResource: base, withExtension: ext) else {
            #if DEBUG
            print("[GulfCupFonts] missing bundled file: \(filename)")
            #endif
            return
        }
        var error: Unmanaged<CFError>?
        let ok = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
        if !ok {
            #if DEBUG
            print("[GulfCupFonts] failed to register \(filename): \(error?.takeRetainedValue().localizedDescription ?? "unknown")")
            #endif
        }
    }
}
