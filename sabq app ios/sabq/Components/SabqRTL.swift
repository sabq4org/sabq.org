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

    init(
        _ text: String,
        uiFont: UIFont,
        color: Color,
        lineLimit: Int = 2,
        lineSpacing: CGFloat = 4
    ) {
        self.text = text
        self.uiFont = uiFont
        self.uiColor = UIColor(color)
        self.lineLimit = lineLimit
        self.lineSpacing = lineSpacing
    }

    var body: some View {
        SabqRTLLabel(
            text: text,
            font: uiFont,
            textColor: uiColor,
            numberOfLines: lineLimit,
            lineSpacing: lineSpacing
        )
        .frame(maxWidth: .infinity, alignment: .trailing)
        .fixedSize(horizontal: false, vertical: true)
    }
}

private struct SabqRTLLabel: UIViewRepresentable {
    let text: String
    let font: UIFont
    let textColor: UIColor
    let numberOfLines: Int
    let lineSpacing: CGFloat

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
        applyAttributedText(to: label)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UILabel, context: Context) -> CGSize? {
        let width = proposal.width ?? UIView.layoutFittingExpandedSize.width
        guard width.isFinite, width > 0 else { return nil }
        // بدون preferredMaxLayoutWidth يبقى intrinsic ضيقاً فيبدو العنوان «في الوسط».
        uiView.preferredMaxLayoutWidth = width
        applyAttributedText(to: uiView)
        let fitted = uiView.sizeThatFits(
            CGSize(width: width, height: CGFloat.greatestFiniteMagnitude)
        )
        return CGSize(width: width, height: max(ceil(fitted.height), uiFontLineHeight()))
    }

    private func uiFontLineHeight() -> CGFloat {
        ceil(font.lineHeight + lineSpacing)
    }

    private func applyAttributedText(to label: UILabel) {
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
