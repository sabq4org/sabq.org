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

    func makeUIView(context: Context) -> SabqTruncatingLabel {
        let label = SabqTruncatingLabel()
        // UIViewRepresentable لا يرث layoutDirection من SwiftUI — نفرض RTL صراحة.
        label.semanticContentAttribute = .forceRightToLeft
        label.textAlignment = .right
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        label.setContentHuggingPriority(.defaultLow, for: .horizontal)
        label.setContentHuggingPriority(.defaultHigh, for: .vertical)
        return label
    }

    func updateUIView(_ label: SabqTruncatingLabel, context: Context) {
        label.semanticContentAttribute = .forceRightToLeft
        label.textAlignment = .right
        label.configure(
            text: text,
            attributes: Self.attributes(font: scaledFont(context), color: textColor, lineSpacing: lineSpacing, numberOfLines: numberOfLines),
            maxLines: numberOfLines
        )
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

    /// القياس لا يلمس الملصق: SwiftUI يقيس بعروض متعددة، وكان تعديل النص أثناء
    /// القياس يترك في الملصق نصًا مقصوصًا لعرض غير العرض النهائي.
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: SabqTruncatingLabel, context: Context) -> CGSize? {
        let width = proposal.width ?? UIView.layoutFittingExpandedSize.width
        guard width.isFinite, width > 0 else { return nil }
        let font = scaledFont(context)
        let attrs = Self.attributes(font: font, color: textColor, lineSpacing: lineSpacing, numberOfLines: numberOfLines)
        let shown = SabqTruncatingLabel.displayedText(text, attributes: attrs, maxLines: numberOfLines, width: width)
        let height = SabqTruncatingLabel.labelHeight(shown, attributes: attrs, maxLines: numberOfLines, width: width)
        // +1: SwiftUI يقرّب الإطار إلى شبكة البكسل (80 → 79.67) فيرى UILabel أن
        // السطر الأخير لا يتسع فيرسم سطرًا أقل في منتصف الصندوق.
        return CGSize(width: width, height: max(ceil(height) + 1, ceil(font.lineHeight + lineSpacing)))
    }

    static func attributes(font: UIFont, color: UIColor, lineSpacing: CGFloat, numberOfLines: Int) -> [NSAttributedString.Key: Any] {
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
        return [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: paragraph,
            .writingDirection: [writingDir],
        ]
    }
}

/// ملصق يقصّ عنوانه بنفسه عند آخر كلمة تتسع في الأسطر المسموحة مع «…»،
/// محسوبًا على عرضه الفعلي عند كل تخطيط. نمط الفقرة `.byWordWrapping` يلغي
/// قصّ UILabel فكان العنوان يُبتر بلا «…»، وتفعيل قصّ الذيل على النص المنسّق
/// جعل UILabel يرسم بعض العناوين سطرًا واحدًا.
final class SabqTruncatingLabel: UILabel {
    private var fullText = ""
    private var textAttributes: [NSAttributedString.Key: Any] = [:]
    private var maxLines = 0
    private var renderedWidth: CGFloat = -1

    func configure(text: String, attributes: [NSAttributedString.Key: Any], maxLines: Int) {
        fullText = text
        textAttributes = attributes
        self.maxLines = maxLines
        numberOfLines = maxLines == 1 ? 1 : 0
        lineBreakMode = maxLines == 1 ? .byTruncatingTail : .byWordWrapping
        renderedWidth = -1
        render(for: bounds.width)
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.width != renderedWidth { render(for: bounds.width) }
    }

    private func render(for width: CGFloat) {
        let shown = width > 0
            ? Self.displayedText(fullText, attributes: textAttributes, maxLines: maxLines, width: width)
            : fullText
        renderedWidth = width
        attributedText = NSAttributedString(string: shown, attributes: textAttributes)
    }

    /// ملصق قياس بإعدادات ملصق العرض نفسها: `boundingRect` لا يحسب التباعد
    /// بعد السطر الأخير كما يحسبه UILabel، فكان الصندوق يقصر بنقاط عن ثلاثة
    /// أسطر فيرسم UILabel سطرين في المنتصف.
    private static let sizingLabel: UILabel = {
        let label = UILabel()
        label.semanticContentAttribute = .forceRightToLeft
        label.textAlignment = .right
        return label
    }()

    static func labelHeight(_ text: String, attributes: [NSAttributedString.Key: Any], maxLines: Int, width: CGFloat) -> CGFloat {
        let label = sizingLabel
        label.numberOfLines = maxLines == 1 ? 1 : 0
        label.attributedText = NSAttributedString(string: text, attributes: attributes)
        label.lineBreakMode = maxLines == 1 ? .byTruncatingTail : .byWordWrapping
        return label.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height
    }

    static func displayedText(_ text: String, attributes: [NSAttributedString.Key: Any], maxLines: Int, width: CGFloat) -> String {
        guard maxLines > 1, width > 0, let font = attributes[.font] as? UIFont else { return text }
        let spacing = (attributes[.paragraphStyle] as? NSParagraphStyle)?.lineSpacing ?? 0
        // ارتفاع n أسطر، مع تسامح لإضافة تباعد بعد السطر الأخير أو عدمها.
        let maxHeight = CGFloat(maxLines) * (font.lineHeight + spacing) + 1
        func fits(_ candidate: String) -> Bool {
            labelHeight(candidate, attributes: attributes, maxLines: 0, width: width) <= maxHeight
        }
        if fits(text) { return text }

        let words = text.split(separator: " ")
        var low = 0
        var high = words.count - 1
        while low < high {
            let mid = (low + high + 1) / 2
            if fits(words[..<mid].joined(separator: " ") + "…") {
                low = mid
            } else {
                high = mid - 1
            }
        }
        return low > 0 ? words[..<low].joined(separator: " ") + "…" : text
    }
}
