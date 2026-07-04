import SwiftUI
import UIKit

/// Renders body paragraphs with `NSTextAlignment.justified` so Arabic
/// text fills the column to both edges — SwiftUI's `Text` only supports
/// leading/center/trailing, so we drop down to `UITextView` for this.
///
/// Used inside the article + opinion detail readers; not appropriate
/// for headings (which want leading alignment) or short labels.
///
/// **Performance note:** the body of an article detail view re-renders
/// continuously while the reader scrolls (because the reading-progress
/// bar tracks scroll Y), so SwiftUI calls `updateUIView()` on every
/// paragraph for every scroll tick. Building an `NSAttributedString` +
/// font descriptor every time costs ~0.5ms per paragraph, which
/// multiplied by 20 paragraphs × 60fps is the entire frame budget gone.
/// We cache the last build inside the Coordinator keyed by a cheap
/// fingerprint of the inputs, and no-op when nothing changed.
struct JustifiedText: UIViewRepresentable {
    let text: String
    let fontSize: CGFloat
    let weight: UIFont.Weight
    let useSerifReader: Bool
    let lineSpacing: CGFloat
    let textColor: UIColor

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.isEditable = false
        tv.isSelectable = true
        tv.isScrollEnabled = false
        tv.backgroundColor = .clear
        tv.textContainerInset = .zero
        tv.textContainer.lineFragmentPadding = 0
        tv.adjustsFontForContentSizeCategory = false
        tv.dataDetectorTypes = []
        // Hug strongly along the vertical axis so the view sizes to the
        // text height inside a SwiftUI VStack. On the horizontal axis we
        // keep low hugging + low resistance so SwiftUI's proposed width
        // wins — without that, a long unbreakable word can balloon the
        // intrinsic content size and clip the left edge of the column.
        tv.setContentHuggingPriority(.required, for: .vertical)
        tv.setContentCompressionResistancePriority(.required, for: .vertical)
        tv.setContentHuggingPriority(.defaultLow, for: .horizontal)
        tv.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return tv
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var fingerprint: String = ""
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        // Fingerprint covers every input that affects layout. If unchanged,
        // the UITextView's existing attributedText is still correct and we
        // skip the (expensive) rebuild + assignment.
        let fp = "\(text.count)|\(text.hashValue)|\(fontSize)|\(weight.rawValue)|\(useSerifReader ? 1 : 0)|\(lineSpacing)|\(textColor.hashValue)"
        if fp == context.coordinator.fingerprint && uiView.attributedText.length > 0 {
            return
        }
        context.coordinator.fingerprint = fp
        uiView.attributedText = buildAttributed()
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        // Lock the text container to the width SwiftUI is proposing so
        // lines wrap (and the justified spacing computes) against the
        // actual column — not the intrinsic content width.
        guard let width = proposal.width, width.isFinite, width > 0 else { return nil }
        let fitted = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: ceil(fitted.height))
    }

    private func buildAttributed() -> NSAttributedString {
        let ps = NSMutableParagraphStyle()
        ps.alignment = .justified
        ps.lineSpacing = lineSpacing
        ps.baseWritingDirection = .rightToLeft
        let font: UIFont = {
            let descriptor = useSerifReader
                ? UIFont.systemFont(ofSize: fontSize, weight: weight)
                    .fontDescriptor.withDesign(.serif) ?? UIFont.systemFont(ofSize: fontSize, weight: weight).fontDescriptor
                : UIFont.systemFont(ofSize: fontSize, weight: weight).fontDescriptor
            return UIFont(descriptor: descriptor, size: fontSize)
        }()
        return NSAttributedString(string: text, attributes: [
            .font: font,
            .foregroundColor: textColor,
            .paragraphStyle: ps,
        ])
    }
}

/// Same UITextView wrapper but takes an `NSAttributedString` directly so
/// the rich-HTML pipeline (ArticleContentView) can preserve inline
/// bold/italic/link runs while still justifying the paragraph.
///
/// Performance: same coordinator-memoization trick as `JustifiedText`.
/// The attributed input is identified by length + lineSpacing + a hash
/// of its raw string content — cheap to compute, sufficient to detect a
/// real edit. Without this, every scroll tick paid for a full
/// NSMutableAttributedString copy + paragraph style application on
/// every paragraph in the body.
struct JustifiedAttributedText: UIViewRepresentable {
    let attributed: NSAttributedString
    let lineSpacing: CGFloat
    var onLinkTap: ((URL) -> Void)? = nil

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.isEditable = false
        tv.isSelectable = true
        tv.isScrollEnabled = false
        tv.backgroundColor = .clear
        tv.textContainerInset = .zero
        tv.textContainer.lineFragmentPadding = 0
        tv.dataDetectorTypes = .link
        tv.delegate = context.coordinator
        tv.setContentHuggingPriority(.required, for: .vertical)
        tv.setContentCompressionResistancePriority(.required, for: .vertical)
        tv.setContentHuggingPriority(.defaultLow, for: .horizontal)
        tv.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return tv
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        let fp = "\(attributed.length)|\(attributed.string.hashValue)|\(lineSpacing)"
        if fp == context.coordinator.fingerprint && uiView.attributedText.length > 0 {
            // Still refresh the link handler — cheap and might have changed.
            context.coordinator.onLinkTap = onLinkTap
            return
        }
        context.coordinator.fingerprint = fp

        let m = NSMutableAttributedString(attributedString: attributed)
        // Apply justified paragraph style across the whole string
        // without clobbering the inline font/colour runs.
        let fullRange = NSRange(location: 0, length: m.length)
        let ps = NSMutableParagraphStyle()
        ps.alignment = .justified
        ps.lineSpacing = lineSpacing
        ps.baseWritingDirection = .rightToLeft
        m.addAttribute(.paragraphStyle, value: ps, range: fullRange)
        uiView.attributedText = m
        context.coordinator.onLinkTap = onLinkTap
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width.isFinite, width > 0 else { return nil }
        let fitted = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: ceil(fitted.height))
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, UITextViewDelegate {
        var onLinkTap: ((URL) -> Void)?
        var fingerprint: String = ""
        func textView(_ textView: UITextView, primaryActionFor textItem: UITextItem,
                      defaultAction: UIAction) -> UIAction? {
            if case .link(let url) = textItem.content, let handler = onLinkTap {
                return UIAction { _ in handler(url) }
            }
            return defaultAction
        }
    }
}

/// Helper for the rich-HTML pipeline: collapses an array of `InlineRun`s
/// into an `NSAttributedString` with bold/italic/colour/link/underline
/// attributes preserved. The justified paragraph style is layered on
/// top of this by `JustifiedAttributedText`.
enum InlineRunAttributing {
    static func attributedString(
        runs: [InlineRun],
        baseSize: CGFloat,
        baseWeight: UIFont.Weight,
        useSerifReader: Bool,
        textColor: UIColor
    ) -> NSAttributedString {
        let out = NSMutableAttributedString()
        for run in runs {
            var weight = baseWeight
            if run.bold { weight = .bold }
            var descriptor = useSerifReader
                ? UIFont.systemFont(ofSize: baseSize, weight: weight)
                    .fontDescriptor.withDesign(.serif) ?? UIFont.systemFont(ofSize: baseSize, weight: weight).fontDescriptor
                : UIFont.systemFont(ofSize: baseSize, weight: weight).fontDescriptor
            if run.italic, let italicDesc = descriptor.withSymbolicTraits(.traitItalic) {
                descriptor = italicDesc
            }
            let font = UIFont(descriptor: descriptor, size: baseSize)

            var attrs: [NSAttributedString.Key: Any] = [
                .font: font,
                .foregroundColor: textColor,
            ]
            if run.underline {
                attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue
            }
            if run.strikethrough {
                attrs[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
            }
            if let hex = run.colorHex, let color = UIColor(hex: hex) {
                attrs[.foregroundColor] = color
            }
            if let link = run.link {
                attrs[.link] = link
                attrs[.foregroundColor] = UIColor.systemBlue
                attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue
            }
            out.append(NSAttributedString(string: run.text, attributes: attrs))
        }
        return out
    }
}

private extension UIColor {
    convenience init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let value = UInt32(s, radix: 16) else { return nil }
        self.init(
            red: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: 1
        )
    }
}


#if DEBUG
struct JustifiedTextDebugPreview: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("اختبار المحاذاة من الطرفين")
                    .font(SabqFonts.app(size: 22, weight: .bold))
                Divider()
                JustifiedText(
                    text: "كشفت دراسة فرنسية جديدة أن المواد الحافظة الشائعة في الأطعمة فائقة المعالجة مرتبطة بزيادة خطر الإصابة بأمراض القلب والأوعية الدموية. ووفقاً لصحيفة الديلي ميل، تابعت الدراسة المنشورة في مجلة بريتيش ميديكال جورنال أكثر من 112 ألف شخص لمدة تسع سنوات. وأوضح فريق البحث من جامعة باريس سيتي أن ثمانية من هذه المواد تُستخدم عادة في اللحوم المصنعة والمخبوزات الجاهزة والمشروبات الغازية والوجبات السريعة وتأثيراتها التراكمية على الصحة لم تُدرس بشكل كافٍ حتى الآن.",
                    fontSize: 16,
                    weight: .regular,
                    useSerifReader: false,
                    lineSpacing: 6,
                    textColor: UIColor.label
                )
            }
            .padding(20)
        }
    }
}

#Preview("Justified Arabic body") {
    JustifiedTextDebugPreview()
}
#endif
