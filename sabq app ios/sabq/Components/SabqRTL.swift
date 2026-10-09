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

/// مفتاح قياس القصّ: النص والعرض (بنصف نقطة) والخط وعدد الأسطر والتباعد.
/// القياس يتكرر لكل عنوان أثناء التمرير؛ النتيجة تُحفظ حتى لا يُعاد بحث
/// الكلمات و`sizeThatFits` على الخيط الرئيسي عند ثبات المدخلات.
private struct SabqTruncationKey: Hashable {
    let text: String
    let widthHalfPoints: Int
    let fontName: String
    let fontMilli: Int
    let traits: UInt32
    let maxLines: Int
    let spacingMilli: Int
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
    private var renderSignature: RenderSignature?

    private struct RenderSignature: Equatable {
        var text: String
        var maxLines: Int
        var fontName: String
        var fontMilli: Int
        var traits: UInt32
        var spacingMilli: Int
        var color: UInt32
    }

    func configure(text: String, attributes: [NSAttributedString.Key: Any], maxLines: Int) {
        fullText = text
        textAttributes = attributes
        self.maxLines = maxLines
        numberOfLines = maxLines == 1 ? 1 : 0
        lineBreakMode = maxLines == 1 ? .byTruncatingTail : .byWordWrapping
        let signature = Self.renderSignature(text: text, attributes: attributes, maxLines: maxLines, traits: traitCollection)
        if signature == renderSignature, abs(bounds.width - renderedWidth) < 0.5, attributedText != nil {
            return
        }
        renderSignature = signature
        render(for: bounds.width)
        if bounds.width <= 0 { setNeedsLayout() }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.width > 0, abs(bounds.width - renderedWidth) >= 0.5 else { return }
        render(for: bounds.width)
    }

    private func render(for width: CGFloat) {
        let shown = width > 0
            ? Self.displayedText(fullText, attributes: textAttributes, maxLines: maxLines, width: width)
            : fullText
        renderedWidth = width
        attributedText = NSAttributedString(string: shown, attributes: textAttributes)
    }

    private static func renderSignature(
        text: String,
        attributes: [NSAttributedString.Key: Any],
        maxLines: Int,
        traits: UITraitCollection
    ) -> RenderSignature {
        let font = attributes[.font] as? UIFont
        let spacing = (attributes[.paragraphStyle] as? NSParagraphStyle)?.lineSpacing ?? 0
        return RenderSignature(
            text: text,
            maxLines: maxLines,
            fontName: font?.fontName ?? "",
            fontMilli: Int(((font?.pointSize ?? 0) * 100).rounded()),
            traits: font?.fontDescriptor.symbolicTraits.rawValue ?? 0,
            spacingMilli: Int((spacing * 100).rounded()),
            color: colorKey(attributes[.foregroundColor] as? UIColor, traits: traits)
        )
    }

    /// لون محلوم حسب السمات حتى يُعاد الرسم عند تبديل الفاتح/الداكن، لا عند
    /// كل `updateUIView` واللون نفسه.
    private static func colorKey(_ color: UIColor?, traits: UITraitCollection) -> UInt32 {
        guard let color else { return 0 }
        let resolved = color.resolvedColor(with: traits)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard resolved.getRed(&r, green: &g, blue: &b, alpha: &a) else { return 0 }
        func channel(_ value: CGFloat) -> UInt32 {
            UInt32(Int((min(max(value, 0), 1) * 255).rounded()))
        }
        return (channel(r) << 24) | (channel(g) << 16) | (channel(b) << 8) | channel(a)
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

    private static var textCache: [SabqTruncationKey: String] = [:]
    private static var heightCache: [SabqTruncationKey: CGFloat] = [:]
    private static let cacheLimit = 320

    private static func cacheKey(text: String, font: UIFont, spacing: CGFloat, maxLines: Int, width: CGFloat) -> SabqTruncationKey {
        SabqTruncationKey(
            text: text,
            widthHalfPoints: Int((width * 2).rounded()),
            fontName: font.fontName,
            fontMilli: Int((font.pointSize * 100).rounded()),
            traits: font.fontDescriptor.symbolicTraits.rawValue,
            maxLines: maxLines,
            spacingMilli: Int((spacing * 100).rounded())
        )
    }

    private static func remember<T>(_ cache: inout [SabqTruncationKey: T], _ key: SabqTruncationKey, _ value: T) {
        if cache.count >= cacheLimit { cache.removeAll(keepingCapacity: true) }
        cache[key] = value
    }

    static func labelHeight(_ text: String, attributes: [NSAttributedString.Key: Any], maxLines: Int, width: CGFloat) -> CGFloat {
        let spacing = (attributes[.paragraphStyle] as? NSParagraphStyle)?.lineSpacing ?? 0
        if width > 0, let font = attributes[.font] as? UIFont {
            let key = cacheKey(text: text, font: font, spacing: spacing, maxLines: maxLines, width: width)
            if let cached = heightCache[key] { return cached }
            let height = measureHeight(text, attributes: attributes, maxLines: maxLines, width: width)
            remember(&heightCache, key, height)
            return height
        }
        return measureHeight(text, attributes: attributes, maxLines: maxLines, width: width)
    }

    private static func measureHeight(_ text: String, attributes: [NSAttributedString.Key: Any], maxLines: Int, width: CGFloat) -> CGFloat {
        let label = sizingLabel
        label.numberOfLines = maxLines == 1 ? 1 : 0
        label.attributedText = NSAttributedString(string: text, attributes: attributes)
        label.lineBreakMode = maxLines == 1 ? .byTruncatingTail : .byWordWrapping
        return label.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude)).height
    }

    static func displayedText(_ text: String, attributes: [NSAttributedString.Key: Any], maxLines: Int, width: CGFloat) -> String {
        guard maxLines > 1, width > 0, let font = attributes[.font] as? UIFont else { return text }
        let spacing = (attributes[.paragraphStyle] as? NSParagraphStyle)?.lineSpacing ?? 0
        let key = cacheKey(text: text, font: font, spacing: spacing, maxLines: maxLines, width: width)
        if let cached = textCache[key] { return cached }
        let shown = computeDisplayedText(
            text,
            attributes: attributes,
            maxLines: maxLines,
            width: CGFloat(key.widthHalfPoints) / 2,
            font: font,
            spacing: spacing
        )
        remember(&textCache, key, shown)
        return shown
    }

    /// قصّ عند حدّ كلمة. إن لم تتسع ولا كلمة (عنوان بلا مسافات، أو كلمة أطول
    /// من العرض) نرجع إلى قصّ الذيل حرفًا حرفًا مع «…» بدل إرجاع النص كاملًا
    /// فيفيض عن البطاقة.
    private static func computeDisplayedText(
        _ text: String,
        attributes: [NSAttributedString.Key: Any],
        maxLines: Int,
        width: CGFloat,
        font: UIFont,
        spacing: CGFloat
    ) -> String {
        // ارتفاع n أسطر، مع تسامح لإضافة تباعد بعد السطر الأخير أو عدمها.
        let maxHeight = CGFloat(maxLines) * (font.lineHeight + spacing) + 1
        func fits(_ candidate: String) -> Bool {
            labelHeight(candidate, attributes: attributes, maxLines: 0, width: width) <= maxHeight
        }
        if fits(text) { return text }

        let words = text.split(separator: " ", omittingEmptySubsequences: true)
        if words.count > 1 {
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
            if low > 0 {
                return words[..<low].joined(separator: " ") + "…"
            }
        }
        return truncatedByCharacter(text, fits: fits)
    }

    private static func truncatedByCharacter(_ text: String, fits: (String) -> Bool) -> String {
        let chars = Array(text)
        var low = 0
        var high = chars.count
        while low < high {
            let mid = (low + high + 1) / 2
            if fits(String(chars.prefix(mid)) + "…") {
                low = mid
            } else {
                high = mid - 1
            }
        }
        guard low > 0 else { return "…" }
        return String(chars.prefix(low)) + "…"
    }
}
