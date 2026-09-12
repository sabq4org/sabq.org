import SwiftUI
import UIKit

private struct SabqRTLModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .environment(\.layoutDirection, .rightToLeft)
            .environment(\.locale, Locale(identifier: "ar"))
            .multilineTextAlignment(.leading)
    }
}

extension View {
    func sabqRTL() -> some View {
        modifier(SabqRTLModifier())
    }
}

extension String {
    /// توافق خلفي — العرض الصحيح للعناوين المختلطة عبر `SabqRTLText`.
    var sabqForcedRTL: String { self }
}

/// عنوان/نص بفقرة RTL حقيقية مثل `dir="rtl"` في الويب.
///
/// `Text` في SwiftUI يعيد ترتيب العناوين التي تبدأ بلاتيني (مثل NHC…)
/// حتى مع علامات Unicode أو `baseWritingDirection`. `UILabel` يحترم
/// اتجاه الفقرة كما يفعل المتصفح.
struct SabqRTLText: View {
    let text: String
    let uiFont: UIFont
    let uiColor: UIColor
    var lineLimit: Int
    var lineSpacing: CGFloat
    var textStyle: UIFont.TextStyle

    init(
        _ text: String,
        uiFont: UIFont,
        color: Color,
        lineLimit: Int = 2,
        lineSpacing: CGFloat = 4,
        textStyle: UIFont.TextStyle = .body
    ) {
        self.text = text
        self.uiFont = uiFont
        self.uiColor = UIColor(color)
        self.lineLimit = lineLimit
        self.lineSpacing = lineSpacing
        self.textStyle = textStyle
    }

    var body: some View {
        SabqRTLLabel(
            text: text,
            font: uiFont,
            textColor: uiColor,
            numberOfLines: lineLimit,
            lineSpacing: lineSpacing,
            textStyle: textStyle
        )
        // الـ UIViewRepresentable يبتلع اللمسة قبل وصولها إلى NavigationLink
        // فيصبح العنوان «ميتاً» للنقر بينما الصورة تستجيب (بلاغ 2026-07-19).
        // النص لا يحتاج تفاعلاً — نعطّل لمسه ونسد الفجوة بطبقة شفافة قابلة
        // للنقر تمرّر اللمسة للرابط الحاوي. مغطى بـ NewsTapNavigationTests.
        .allowsHitTesting(false)
        .frame(maxWidth: .infinity, alignment: .trailing)
        .fixedSize(horizontal: false, vertical: true)
        .background(Color.clear.contentShape(Rectangle()))
    }
}

private struct SabqRTLLabel: UIViewRepresentable {
    let text: String
    let font: UIFont
    let textColor: UIColor
    let numberOfLines: Int
    let lineSpacing: CGFloat
    let textStyle: UIFont.TextStyle

    func makeUIView(context: Context) -> UILabel {
        let label = UILabel()
        label.numberOfLines = numberOfLines
        label.lineBreakMode = .byTruncatingTail
        // UIViewRepresentable لا يرث layoutDirection من SwiftUI — نفرض RTL صراحة.
        label.semanticContentAttribute = .forceRightToLeft
        label.textAlignment = .right
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        label.setContentHuggingPriority(.defaultLow, for: .horizontal)
        label.setContentHuggingPriority(.defaultHigh, for: .vertical)
        return label
    }

    func updateUIView(_ label: UILabel, context: Context) {
        label.numberOfLines = numberOfLines
        label.semanticContentAttribute = .forceRightToLeft
        label.textAlignment = .right
        applyAttributedText(to: label, font: scaledFont(context))
    }

    /// الخط بعد مقياس Dynamic Type للنظام (نسبةً إلى body، كما تتدرّج خطوط
    /// `Font.custom` في بقية البطاقة) — كان العنوان يُمرَّر بحجم ثابت فلا
    /// يستجيب لإعداد تكبير النص (تدقيق iOS 27، F02).
    private func scaledFont(_ context: Context) -> UIFont {
        let category = UIContentSizeCategory(context.environment.sizeCategory)
        let traits = UITraitCollection(preferredContentSizeCategory: category)
        var base = font
        if context.environment.legibilityWeight == .bold,
           let descriptor = font.fontDescriptor.withSymbolicTraits(.traitBold) {
            base = UIFont(descriptor: descriptor, size: font.pointSize)
        }
        return UIFontMetrics(forTextStyle: textStyle).scaledFont(for: base, compatibleWith: traits)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UILabel, context: Context) -> CGSize? {
        let width = proposal.width ?? UIView.layoutFittingExpandedSize.width
        guard width.isFinite, width > 0 else { return nil }
        // بدون preferredMaxLayoutWidth يبقى intrinsic ضيقاً فيبدو العنوان «في الوسط».
        uiView.preferredMaxLayoutWidth = width
        let font = scaledFont(context)
        applyAttributedText(to: uiView, font: font)
        let fitted = uiView.sizeThatFits(
            CGSize(width: width, height: CGFloat.greatestFiniteMagnitude)
        )
        return CGSize(width: width, height: max(ceil(fitted.height), ceil(font.lineHeight + lineSpacing)))
    }

    private func applyAttributedText(to label: UILabel, font: UIFont) {
        let paragraph = NSMutableParagraphStyle()
        paragraph.baseWritingDirection = .rightToLeft
        // .right صريح — .natural داخل UILabel المضمّن يُحلّ كـ LTR فيُحاذى لليسار.
        paragraph.alignment = .right
        paragraph.lineSpacing = lineSpacing
        paragraph.lineBreakMode = numberOfLines == 1 ? .byTruncatingTail : .byWordWrapping

        // Embedding فقط (لا override) حتى لا تنعكس حروف NHC إلى CHN.
        let writingDir = NSNumber(
            value: NSWritingDirection.rightToLeft.rawValue
                | NSWritingDirectionFormatType.embedding.rawValue
        )

        label.attributedText = NSAttributedString(
            string: text,
            attributes: [
                .font: font,
                .foregroundColor: textColor,
                .paragraphStyle: paragraph,
                .writingDirection: [writingDir],
            ]
        )
    }
}
