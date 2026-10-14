import SwiftUI

/// Editorial layout primitives, shared by reader, discovery and account screens.
nonisolated enum SabqLayout {
    static let space4: CGFloat = 4
    static let space8: CGFloat = 8
    static let space12: CGFloat = 12
    static let space16: CGFloat = 16
    static let space24: CGFloat = 24
    static let space32: CGFloat = 32
    static let pageInset: CGFloat = 20
    static let cardInset: CGFloat = 16
    static let controlHeight: CGFloat = 48
    static let touchTarget: CGFloat = 44
    static let readingWidth: CGFloat = 680
}

/// IBM Plex Sans Arabic; semantic Dynamic Type scaling without fixed text frames.
nonisolated enum SabqType {
    static var pageTitle: Font { SabqFonts.editorial(.title, size: 26, weight: .semibold) }
    static var sectionTitle: Font { SabqFonts.editorial(.title3, size: 20, weight: .semibold) }
    static var headline: Font { SabqFonts.editorial(.headline, size: 18, weight: .semibold) }
    static var body: Font { SabqFonts.editorial(.body, size: 17) }
    static var label: Font { SabqFonts.editorial(.subheadline, size: 15, weight: .semibold) }
    static var caption: Font { SabqFonts.editorial(.caption, size: 13) }
}

/// Consistent text-field surface; focus and error remain explicit at the call site.
struct SabqInputSurface: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, SabqLayout.space16)
            .padding(.vertical, SabqLayout.space12)
            .frame(minHeight: SabqLayout.controlHeight)
            .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius))
            .overlay(RoundedRectangle(cornerRadius: SabqTheme.buttonRadius)
                .stroke(SabqTheme.outline, lineWidth: 1))
    }
}
