import Testing
import UIKit
@testable import sabq

// شريط قطاعات الاقتصاد: الحصص التي يتجاوز مجموعها 100 كانت تفيض عن عرض الشريط.
struct EconomyShareLayoutTests {
    @Test func sharesOverOneHundredNormalizeToTheBar() {
        let fractions = EconomyShareLayout.fractions(shares: [80, 40, 20])
        let sum = fractions.reduce(0, +)
        #expect(fractions.count == 4)
        #expect(abs(sum - 1) < 0.0001)
        #expect(fractions.allSatisfy { $0 >= 0 && $0 <= 1 })
        #expect(fractions[3] == 0)
        #expect(abs(fractions[0] - (80.0 / 140.0)) < 0.0001)
    }

    @Test func remainderFillsWhenSharesAreUnderOneHundred() {
        let fractions = EconomyShareLayout.fractions(shares: [40, 25])
        #expect(abs((fractions.last ?? 0) - 0.35) < 0.0001)
        #expect(abs(fractions.reduce(0, +) - 1) < 0.0001)
    }

    @Test func nonFiniteSharesAreDropped() {
        let fractions = EconomyShareLayout.fractions(shares: [.nan, -4, 50])
        #expect(fractions[0] == 0)
        #expect(fractions[1] == 0)
        #expect(abs(fractions[2] - 0.5) < 0.0001)
        #expect(abs((fractions.last ?? 0) - 0.5) < 0.0001)
    }
}

@MainActor
struct SabqTruncationTests {
    private func attributes(size: CGFloat = 17, spacing: CGFloat = 3) -> [NSAttributedString.Key: Any] {
        let paragraph = NSMutableParagraphStyle()
        paragraph.baseWritingDirection = .rightToLeft
        paragraph.alignment = .right
        paragraph.lineSpacing = spacing
        paragraph.lineBreakMode = .byWordWrapping
        return [
            .font: UIFont.systemFont(ofSize: size),
            .paragraphStyle: paragraph,
        ]
    }

    @Test func shortTitleIsUnchanged() {
        let text = "خبر قصير"
        let shown = SabqTruncatingLabel.displayedText(text, attributes: attributes(), maxLines: 3, width: 280)
        #expect(shown == text)
    }

    @Test func longTitleTruncatesOnAWordBoundary() {
        let text = "أعلنت الهيئة العامة للطيران المدني تعرض مطار الملك خالد الدولي في الرياض لاعتداءين يوم الخميس"
        let shown = SabqTruncatingLabel.displayedText(text, attributes: attributes(), maxLines: 2, width: 140)
        #expect(shown != text)
        #expect(shown.hasSuffix("…"))
        #expect(shown.count < text.count)
        #expect(!shown.hasSuffix(" …"))
    }

    @Test func titleWithoutSpacesFallsBackToTailTruncation() {
        let text = String(repeating: "م", count: 80)
        let shown = SabqTruncatingLabel.displayedText(text, attributes: attributes(), maxLines: 2, width: 80)
        #expect(shown != text)
        #expect(shown.hasSuffix("…"))
        #expect(shown.count < text.count)
        let height = SabqTruncatingLabel.labelHeight(shown, attributes: attributes(), maxLines: 0, width: 80)
        let font = UIFont.systemFont(ofSize: 17)
        let maxHeight = 2 * (font.lineHeight + 3) + 1
        #expect(height <= maxHeight + 1)
    }

    @Test func repeatedMeasurementReturnsTheSameString() {
        let text = "عنوان طويل يتكرر قياسه أثناء التمرير ولا يجب أن يتغير بين النداءين المتتاليين"
        let attrs = attributes()
        // 160.1 و160.2 تقعان في دلو نصف النقطة نفسه، فيُعاد النص المخزَّن بلا قياس جديد.
        let first = SabqTruncatingLabel.displayedText(text, attributes: attrs, maxLines: 3, width: 160.1)
        let second = SabqTruncatingLabel.displayedText(text, attributes: attrs, maxLines: 3, width: 160.2)
        #expect(first == second)
    }

    @Test func widerWidthKeepsAtLeastAsMuchText() {
        let text = "كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة"
        let narrow = SabqTruncatingLabel.displayedText(text, attributes: attributes(), maxLines: 2, width: 90)
        let wide = SabqTruncatingLabel.displayedText(text, attributes: attributes(), maxLines: 2, width: 320)
        #expect(wide.count >= narrow.count)
    }
}
