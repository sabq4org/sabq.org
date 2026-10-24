#if canImport(UIKit)
import CoreText
import Foundation
import SwiftUI

/// IBM Plex Sans Arabic, bundled in this package and registered at launch
/// (same files and PostScript names as the reader app).
public enum DeskFonts {
    public static let regular = "IBMPlexSansArabic"
    public static let medium = "IBMPlexSansArabic-Medm"
    public static let semibold = "IBMPlexSansArabic-SmBld"
    public static let bold = "IBMPlexSansArabic-Bold"

    private static let files = [
        "IBMPlexSansArabic-Regular",
        "IBMPlexSansArabic-Medium",
        "IBMPlexSansArabic-SemiBold",
        "IBMPlexSansArabic-Bold",
    ]

    private static let registration: Void = {
        for name in files {
            guard let url = Bundle.module.url(forResource: name, withExtension: "ttf", subdirectory: "Fonts") else {
                #if DEBUG
                print("[DeskFonts] missing bundled font \(name)")
                #endif
                continue
            }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }()

    public static func registerAll() {
        _ = registration
    }

    public static func app(size: CGFloat, weight: DeskTextRole.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        let name: String
        switch weight {
        case .regular: name = regular
        case .medium: name = medium
        case .semibold: name = semibold
        case .bold: name = bold
        }
        return .custom(name, size: size, relativeTo: style)
    }
}
#endif
