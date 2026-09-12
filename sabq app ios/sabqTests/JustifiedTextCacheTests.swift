import Testing
import UIKit
@testable import sabq

// تدقيق iOS 27 — F01: كان مفتاح كاش فقرات المقال يحوي طول النص وبصمته وتباعد
// الأسطر فقط، فتغيير حجم الخط/نوعه/لونه من ورقة «Aa» لا يعيد الرسم. هذه
// الاختبارات تثبّت أن كل خاصية عرض تشارك في المفتاح، وأن مقياس Dynamic Type
// يُطبَّق على حجم القارئ.
struct JustifiedTextCacheTests {

    private let runs: [InlineRun] = [
        InlineRun(text: "كشفت دراسة "),
        InlineRun(text: "جديدة", bold: true),
        InlineRun(text: " أن المواد الحافظة مرتبطة بأمراض القلب."),
    ]

    private func style(
        fontSize: CGFloat = 17,
        weight: UIFont.Weight = .regular,
        serif: Bool = false,
        lineSpacing: CGFloat = 9,
        colorKey: String = "0.100,0.100,0.100,0.920",
        category: UIContentSizeCategory = .large
    ) -> JustifiedTextStyle {
        JustifiedTextStyle(
            fontSize: fontSize,
            weight: weight,
            useSerifReader: serif,
            lineSpacing: lineSpacing,
            colorKey: colorKey,
            sizeCategory: category
        )
    }

    // MARK: - المفتاح الغني (مسار HTML)

    @Test func sameInputsProduceEqualKey() {
        let a = JustifiedRunsKey(runs: runs, style: style())
        let b = JustifiedRunsKey(runs: runs, style: style())
        #expect(a == b)
    }

    /// جوهر العيب المُعاد إنتاجه في التقرير: النص نفسه بحجم خط مختلف.
    @Test func fontSizeChangeInvalidatesKey() {
        let before = JustifiedRunsKey(runs: runs, style: style(fontSize: 17))
        let after = JustifiedRunsKey(runs: runs, style: style(fontSize: 24))
        #expect(before != after)
    }

    @Test func serifToggleInvalidatesKey() {
        #expect(JustifiedRunsKey(runs: runs, style: style(serif: false))
                != JustifiedRunsKey(runs: runs, style: style(serif: true)))
    }

    @Test func colorChangeInvalidatesKey() {
        #expect(JustifiedRunsKey(runs: runs, style: style(colorKey: "light"))
                != JustifiedRunsKey(runs: runs, style: style(colorKey: "dark")))
    }

    @Test func systemTextSizeChangeInvalidatesKey() {
        #expect(JustifiedRunsKey(runs: runs, style: style(category: .large))
                != JustifiedRunsKey(runs: runs, style: style(category: .accessibilityMedium)))
    }

    @Test func lineSpacingChangeInvalidatesKey() {
        #expect(JustifiedRunsKey(runs: runs, style: style(lineSpacing: 6))
                != JustifiedRunsKey(runs: runs, style: style(lineSpacing: 12)))
    }

    /// تغيير تنسيق مضمّن (bold) مع ثبات الحروف يجب أن يعيد الرسم أيضًا.
    @Test func inlineBoldChangeInvalidatesKey() {
        var plain = runs
        plain[1] = InlineRun(text: "جديدة", bold: false)
        #expect(JustifiedRunsKey(runs: runs, style: style())
                != JustifiedRunsKey(runs: plain, style: style()))
    }

    // MARK: - المفتاح البسيط (النص الخام)

    @Test func plainKeyTracksFontSize() {
        let text = "فقرة اختبار."
        #expect(JustifiedPlainKey(text: text, style: style(fontSize: 17))
                != JustifiedPlainKey(text: text, style: style(fontSize: 21)))
        #expect(JustifiedPlainKey(text: text, style: style())
                == JustifiedPlainKey(text: text, style: style()))
    }

    // MARK: - مقياس Dynamic Type (F02)

    @Test func defaultCategoryKeepsReaderSize() {
        #expect(JustifiedTextStyle.scaled(17, for: .large) == 17)
    }

    @Test func largerCategoryScalesUpAndSmallerScalesDown() {
        let base = JustifiedTextStyle.scaled(17, for: .large)
        #expect(JustifiedTextStyle.scaled(17, for: .extraExtraExtraLarge) > base)
        #expect(JustifiedTextStyle.scaled(17, for: .accessibilityExtraLarge) > JustifiedTextStyle.scaled(17, for: .extraExtraExtraLarge))
        #expect(JustifiedTextStyle.scaled(17, for: .small) < base)
    }

    @Test func scaledSizeFlowsIntoStyle() {
        let s = style(fontSize: 20, category: .extraExtraLarge)
        #expect(s.scaledFontSize == JustifiedTextStyle.scaled(20, for: .extraExtraLarge))
        #expect(s.scaledFontSize > 20)
    }

    // MARK: - مفتاح اللون

    @Test func colorKeyResolvesDynamicColorsPerAppearance() {
        let light = JustifiedTextStyle.colorKey(.label, darkMode: false)
        let dark = JustifiedTextStyle.colorKey(.label, darkMode: true)
        #expect(light != dark)
        #expect(JustifiedTextStyle.colorKey(.label, darkMode: false) == light)
    }
}
