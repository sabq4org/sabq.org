import SwiftUI

/// The article owns this split, so folding never replaces its navigation
/// stack or scrolling view. An already narrow reader column stays single.
struct DuoArticleLayout {
    let showsContext: Bool
    let articleWidth: CGFloat
    let contextWidth: CGFloat
    let gutter: CGFloat
    let spacing: CGFloat
    let heroHeight: CGFloat?

    init(size: CGSize, isDuoLandscape: Bool, prefersSingleColumn: Bool = false) {
        showsContext = isDuoLandscape && size.width >= 780 && !prefersSingleColumn
        gutter = showsContext ? 16 : 0
        spacing = showsContext ? 24 : 0
        let available = max(0, size.width - gutter * 2 - spacing)
        contextWidth = showsContext ? min(320, max(260, available * 0.33)) : 0
        articleWidth = max(0, available - contextWidth)
        // Full-width focal crop on Duo; tapping still opens the original.
        // The viewport leaves room for the title and byline at first glance.
        heroHeight = isDuoLandscape
            ? min(articleWidth * 0.75, max(0, size.height * 0.52), 360)
            : nil
    }
}
