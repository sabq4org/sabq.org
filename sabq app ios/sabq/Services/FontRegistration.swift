import Foundation
import CoreText
import SwiftUI

// Registers the bundled IBM Plex Sans Arabic weights at app launch so
// `.font(.custom("IBMPlexSansArabic-…", size:))` works everywhere. We
// use runtime registration (CTFontManagerRegisterFontsForURL) instead of
// Info.plist `UIAppFonts` so the project layout stays purely
// synchronized-folders friendly — no pbxproj edit required.
enum SabqFonts {
    /// PostScript names. Verified against the IBM Plex Sans Arabic
    /// distribution shipped via @fontsource/ibm-plex-sans-arabic.
    nonisolated static let regular  = "IBMPlexSansArabic-Regular"
    nonisolated static let semibold = "IBMPlexSansArabic-SemiBold"
    nonisolated static let bold     = "IBMPlexSansArabic-Bold"

    /// Editorial display font used for article titles, hero headings,
    /// and Smart Summary card title.
    nonisolated static func headline(size: CGFloat) -> Font {
        .custom(bold, size: size)
    }

    /// Slightly lighter weight for sub-headings inside articles.
    nonisolated static func subhead(size: CGFloat) -> Font {
        .custom(semibold, size: size)
    }

    /// الخط الموحّد للتطبيق كله — يُرجع متغيّر IBM Plex Sans Arabic المناسب
    /// لوزن SwiftUI المطلوب.
    ///
    /// سياسة التخفيف (2026-07):
    /// - العبارات الصغيرة (≤13pt: وقت، تاريخ، chips، meta) تبقى هوائية —
    ///   لا Bold أبداً، و`.medium`/`.semibold` يسقطان على Regular.
    /// - النصوص الأكبر تُخفَّف درجة واحدة: Bold→SemiBold، و`.medium`→Regular
    ///   (سابقاً كان `.medium` يُرسم SemiBold فيبدو كل شيء ثقيلاً).
    /// - `headline()` يبقى Bold للعناوين التحريرية الكبيرة فقط.
    nonisolated static func app(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        let isCaption = size <= 13

        switch weight {
        case .ultraLight, .thin, .light, .regular:
            return .custom(regular, size: size)
        case .medium:
            // Medium must stay Regular — mapping it to SemiBold made every
            // clock/date/meta label look bold across the app.
            return .custom(regular, size: size)
        case .semibold:
            return .custom(isCaption ? regular : semibold, size: size)
        case .bold:
            // Soften one step: captions → Regular, body/titles → SemiBold.
            return .custom(isCaption ? regular : semibold, size: size)
        case .heavy, .black:
            // Captions stay airy; only large display type keeps true Bold.
            return .custom(isCaption ? regular : bold, size: size)
        default:
            return .custom(regular, size: size)
        }
    }

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
            print("[SabqFonts] missing bundled file: \(filename)")
            #endif
            return
        }
        var error: Unmanaged<CFError>?
        let ok = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
        if !ok {
            #if DEBUG
            print("[SabqFonts] failed to register \(filename): \(error?.takeUnretainedValue().localizedDescription ?? "unknown")")
            #endif
        }
    }
}
