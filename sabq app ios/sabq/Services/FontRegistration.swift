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
    static let regular  = "IBMPlexSansArabic-Regular"
    static let semibold = "IBMPlexSansArabic-SemiBold"
    static let bold     = "IBMPlexSansArabic-Bold"

    /// Editorial display font used for article titles, hero headings,
    /// and Smart Summary card title.
    static func headline(size: CGFloat) -> Font {
        .custom(bold, size: size)
    }

    /// Slightly lighter weight for sub-headings inside articles.
    static func subhead(size: CGFloat) -> Font {
        .custom(semibold, size: size)
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
