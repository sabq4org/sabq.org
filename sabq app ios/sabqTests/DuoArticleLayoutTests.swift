import Testing
import SwiftUI
@testable import sabq

struct DuoArticleLayoutTests {
    @Test func unfoldedReaderKeepsBothColumnsInsideAvailableSpace() {
        for width: CGFloat in [780, 867, 1000] {
            let layout = DuoArticleLayout(size: CGSize(width: width, height: 669), isDuoLandscape: true)
            #expect(layout.showsContext)
            #expect(layout.articleWidth >= 460)
            #expect(layout.contextWidth >= 260)
            #expect(abs(layout.articleWidth + layout.contextWidth + layout.spacing + layout.gutter * 2 - width) < 0.01)
            #expect((layout.heroHeight ?? 0) > 300)
            #expect((layout.heroHeight ?? 1000) <= 669 * 0.52)
        }
    }

    @Test func foldAndExistingNarrowReaderDoNotNestAnotherSplit() {
        for width: CGFloat in [382, 466, 594, 669, 779] {
            let layout = DuoArticleLayout(size: CGSize(width: width, height: 669), isDuoLandscape: true)
            #expect(!layout.showsContext)
            #expect(layout.articleWidth == width)
            #expect(layout.contextWidth == 0)
        }
    }

    @Test func ordinaryPhoneAndPortraitKeepNaturalImage() {
        for size in [CGSize(width: 402, height: 874), CGSize(width: 669, height: 900), CGSize(width: 900, height: 669)] {
            let layout = DuoArticleLayout(size: size, isDuoLandscape: false)
            #expect(!layout.showsContext)
            #expect(layout.heroHeight == nil)
            #expect(layout.articleWidth == size.width)
        }
    }

    @Test func focusAndAccessibilityRetainTheFullReadingWidth() {
        let layout = DuoArticleLayout(size: CGSize(width: 867, height: 669), isDuoLandscape: true, prefersSingleColumn: true)
        #expect(!layout.showsContext)
        #expect(layout.articleWidth == 867)
    }
}
