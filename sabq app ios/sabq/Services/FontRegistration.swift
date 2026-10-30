import Foundation
import CoreText
import SwiftUI
import UIKit

// Native system typography, matching Sabq Desk. IBM registration and names
// remain available for legacy callers and tests, but app fonts use SF Arabic.
enum SabqFonts {
    /// PostScript names matching the bundled TrueType files in
    /// `Resources/Fonts/IBMPlexSansArabic-*.ttf` (same distribution as SabqSports).
    nonisolated static let regular  = "IBMPlexSansArabic"
    nonisolated static let medium   = "IBMPlexSansArabic-Medm"
    nonisolated static let semibold = "IBMPlexSansArabic-SmBld"
    nonisolated static let bold     = "IBMPlexSansArabic-Bold"

    /// Editorial display font used for article titles and hero headings.
    nonisolated static func headline(size: CGFloat) -> Font {
        editorial(.title, size: size, weight: .bold)
    }

    /// Slightly lighter weight for sub-headings inside articles.
    nonisolated static func subhead(size: CGFloat) -> Font {
        editorial(.title3, size: size, weight: .semibold)
    }

    /// UIKit counterparts for `SabqRTLText` (UILabel).
    nonisolated static func uiHeadline(size: CGFloat) -> UIFont {
        .systemFont(ofSize: size, weight: .bold)
    }

    nonisolated static func uiSubhead(size: CGFloat) -> UIFont {
        .systemFont(ofSize: size, weight: .semibold)
    }

    nonisolated static func uiApp(size: CGFloat, weight: Font.Weight = .regular) -> UIFont {
        .systemFont(ofSize: size, weight: systemWeight(for: weight))
    }

    /// Native system typeface with Dynamic Type scaling and the requested weight.
    nonisolated static func app(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        editorial(textStyle(for: size), size: size, weight: weight)
    }

    /// Shared by news, account, forms and sports without changing their base typography.
    nonisolated private static func textStyle(for size: CGFloat) -> Font.TextStyle {
        switch size {
        case ...11: return .caption2
        case ...13: return .caption
        case ...15: return .subheadline
        case ...17: return .body
        case ...20: return .title3
        case ...24: return .title2
        default: return .title
        }
    }

    /// Native system typeface with an explicit Dynamic Type text style.
    nonisolated static func editorial(_ style: Font.TextStyle, size: CGFloat,
                                       weight: Font.Weight = .regular, boldText: Bool = false) -> Font {
        let nativeWeight: Font.Weight = boldText
            ? (weight == .regular || weight == .medium ? .semibold : .bold)
            : weight
        let native = Font.system(style, design: .default, weight: nativeWeight)
        if #available(iOS 26.0, *) {
            // Scale the semantic native font, so SwiftUI retains ownership of
            // Dynamic Type. The denominator is always the default category.
            let base = UIFont.preferredFont(forTextStyle: uiTextStyle(for: style),
                compatibleWith: UITraitCollection(preferredContentSizeCategory: .large))
            return native.scaled(by: size / base.pointSize)
        }
        // iOS 17–18 use Apple's semantic sizes with full accessibility scaling.
        return native
    }

    /// UIKit counterpart for callers that scale the size themselves.
    nonisolated static func uiSystem(size: CGFloat, weight: UIFont.Weight = .regular) -> UIFont {
        .systemFont(ofSize: size, weight: weight)
    }

    nonisolated private static func systemWeight(for weight: Font.Weight) -> UIFont.Weight {
        switch weight {
        case .ultraLight: .ultraLight
        case .thin: .thin
        case .light: .light
        case .regular: .regular
        case .medium: .medium
        case .semibold: .semibold
        case .bold: .bold
        case .heavy: .heavy
        case .black: .black
        default: .regular
        }
    }

    nonisolated private static func uiTextStyle(for style: Font.TextStyle) -> UIFont.TextStyle {
        switch style {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .callout: .callout
        case .footnote: .footnote
        case .caption: .caption1
        case .caption2: .caption2
        default: .body
        }
    }

    private static var didRegister = false

    static func registerAll() {
        guard !didRegister else { return }
        didRegister = true

        let filenames = [
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
