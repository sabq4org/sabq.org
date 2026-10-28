#if canImport(UIKit)
import SwiftUI
import UIKit

/// The desk's typeface: the iPhone system font, which draws Arabic in SF Arabic
/// (owner's choice, 2026-10-28). Sizes follow the desk's type scale and grow with
/// Dynamic Type relative to `style`.
public enum DeskFonts {
    public static func app(size: CGFloat, weight: DeskTextRole.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        let base = UIFont.systemFont(ofSize: size, weight: weight.uiWeight)
        return Font(UIFontMetrics(forTextStyle: style.uiTextStyle).scaledFont(for: base))
    }
}

extension DeskTextRole.Weight {
    var uiWeight: UIFont.Weight {
        switch self {
        case .regular: return .regular
        case .medium: return .medium
        case .semibold: return .semibold
        case .bold: return .bold
        }
    }
}

extension Font.TextStyle {
    var uiTextStyle: UIFont.TextStyle {
        switch self {
        case .largeTitle: return .largeTitle
        case .title: return .title1
        case .title2: return .title2
        case .title3: return .title3
        case .headline: return .headline
        case .subheadline: return .subheadline
        case .callout: return .callout
        case .footnote: return .footnote
        case .caption: return .caption1
        case .caption2: return .caption2
        default: return .body
        }
    }
}
#endif
