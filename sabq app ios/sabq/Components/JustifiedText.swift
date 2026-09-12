import SwiftUI
import UIKit

// MARK: - مفاتيح الكاش (قابلة للاختبار)
//
// جسور UIKit في القارئ تعيد الرسم فقط عندما يتغيّر «مفتاح العرض». قبل تدقيق
// iOS 27 (F01) كان مفتاح الفقرات الغنية يحوي طول النص وبصمته وتباعد الأسطر
// فقط، فتغيير حجم الخط/نوعه/لونه مع ثبات النص كان يُرجع الدالة قبل تحديث
// attributedText — ولا يتغيّر جسم المقال من ورقة «Aa». المفاتيح هنا تضم كل
// ما يؤثر في الرسم، وهي Equatable صريحة كي تغطيها اختبارات الوحدة.

/// كل خصائص العرض التي تؤثر في رسم فقرة داخل UITextView.
nonisolated struct JustifiedTextStyle: Equatable {
    var fontSize: CGFloat
    var weight: UIFont.Weight
    var useSerifReader: Bool
    var lineSpacing: CGFloat
    /// اللون بعد حلّه للمظهر الحالي (فاتح/داكن) بصيغة RGBA ثابتة — لا نعتمد
    /// على `UIColor.hashValue` لأن الألوان الديناميكية تُنشأ من جديد كل رسم.
    var colorKey: String
    /// فئة حجم النص في النظام (Dynamic Type) — تغييرها من الإعدادات يجب أن
    /// يعيد بناء الفقرة بحجم مقيس.
    var sizeCategory: UIContentSizeCategory

    /// الحجم النهائي بعد تطبيق مقياس النظام على حجم القارئ. نستخدم مقياس
    /// `.body` تحديدًا لأن `Font.custom(_:size:)` في بقية الشاشة يتدرّج
    /// نسبةً إلى body، فيبقى جسم المقال والعناوين على المقياس نفسه (F02).
    var scaledFontSize: CGFloat {
        JustifiedTextStyle.scaled(fontSize, for: sizeCategory)
    }

    nonisolated static func scaled(_ size: CGFloat, for category: UIContentSizeCategory) -> CGFloat {
        let traits = UITraitCollection(preferredContentSizeCategory: category)
        return UIFontMetrics(forTextStyle: .body).scaledValue(for: size, compatibleWith: traits)
    }

    /// مفتاح لون مستقر: يحلّ الألوان الديناميكية للمظهر المطلوب ثم يُخرج
    /// المكوّنات الأربعة بدقة ثلاث منازل.
    nonisolated static func colorKey(_ color: UIColor, darkMode: Bool) -> String {
        let traits = UITraitCollection(userInterfaceStyle: darkMode ? .dark : .light)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.resolvedColor(with: traits).getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "%.3f,%.3f,%.3f,%.3f", r, g, b, a)
    }
}

/// مفتاح الفقرة النصية البسيطة (المسار القديم لمقالات النص الخام).
nonisolated struct JustifiedPlainKey: Equatable {
    var text: String
    var style: JustifiedTextStyle
}

/// مفتاح الفقرة الغنية (مسار HTML عبر ArticleHtmlParser).
nonisolated struct JustifiedRunsKey: Equatable {
    var runs: [InlineRun]
    var style: JustifiedTextStyle
}

// MARK: - مساعدات مشتركة

private extension EnvironmentValues {
    var justifiedSizeCategory: UIContentSizeCategory {
        UIContentSizeCategory(sizeCategory)
    }
}

private func makeReaderTextView() -> UITextView {
    let tv = UITextView()
    tv.isEditable = false
    tv.isSelectable = true
    tv.isScrollEnabled = false
    tv.backgroundColor = .clear
    tv.textContainerInset = .zero
    tv.textContainer.lineFragmentPadding = 0
    // نقيس الخط بأنفسنا عبر UIFontMetrics (انظر JustifiedTextStyle) — لو
    // فعّلنا هذا المفتاح أيضًا لتضاعف التكبير.
    tv.adjustsFontForContentSizeCategory = false
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

private func justifiedParagraphStyle(lineSpacing: CGFloat) -> NSParagraphStyle {
    let ps = NSMutableParagraphStyle()
    ps.alignment = .justified
    ps.lineSpacing = lineSpacing
    ps.baseWritingDirection = .rightToLeft
    return ps
}

private func readerFont(size: CGFloat, weight: UIFont.Weight, serif: Bool) -> UIFont {
    let base = UIFont.systemFont(ofSize: size, weight: weight).fontDescriptor
    let descriptor = serif ? (base.withDesign(.serif) ?? base) : base
    return UIFont(descriptor: descriptor, size: size)
}

// MARK: - فقرة نصية بسيطة

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
/// We keep the last render key inside the Coordinator and no-op when
/// nothing changed.
struct JustifiedText: UIViewRepresentable {
    let text: String
    let fontSize: CGFloat
    let weight: UIFont.Weight
    let useSerifReader: Bool
    let lineSpacing: CGFloat
    let textColor: UIColor

    func makeUIView(context: Context) -> UITextView {
        let tv = makeReaderTextView()
        tv.dataDetectorTypes = []
        return tv
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var lastKey: JustifiedPlainKey?
    }

    private func renderKey(_ context: Context) -> JustifiedPlainKey {
        JustifiedPlainKey(
            text: text,
            style: JustifiedTextStyle(
                fontSize: fontSize,
                weight: weight,
                useSerifReader: useSerifReader,
                lineSpacing: lineSpacing,
                colorKey: JustifiedTextStyle.colorKey(textColor, darkMode: context.environment.colorScheme == .dark),
                sizeCategory: context.environment.justifiedSizeCategory
            )
        )
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        let key = renderKey(context)
        if key == context.coordinator.lastKey && uiView.attributedText.length > 0 {
            return
        }
        context.coordinator.lastKey = key
        let size = key.style.scaledFontSize
        uiView.attributedText = NSAttributedString(string: text, attributes: [
            .font: readerFont(size: size, weight: weight, serif: useSerifReader),
            .foregroundColor: textColor,
            .paragraphStyle: justifiedParagraphStyle(lineSpacing: lineSpacing),
        ])
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        // Lock the text container to the width SwiftUI is proposing so
        // lines wrap (and the justified spacing computes) against the
        // actual column — not the intrinsic content width.
        guard let width = proposal.width, width.isFinite, width > 0 else { return nil }
        let fitted = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: ceil(fitted.height))
    }
}

// MARK: - فقرة غنية (bold/italic/روابط)

/// Same UITextView wrapper for the rich-HTML pipeline (ArticleContentView):
/// takes the parsed `InlineRun`s plus the reader style and builds the
/// attributed string itself, so inline bold/italic/link runs survive and
/// the paragraph is still justified.
///
/// Performance: the attributed string is built **only** when the runs or
/// any style input changes (font size, serif toggle, colour, Dynamic Type
/// category, line spacing). Previously the caller rebuilt the attributed
/// string on every scroll tick and this view compared only text + line
/// spacing — which is exactly why the «Aa» sheet did not resize the body.
struct JustifiedAttributedText: UIViewRepresentable {
    let runs: [InlineRun]
    let baseSize: CGFloat
    let baseWeight: UIFont.Weight
    let useSerifReader: Bool
    let textColor: UIColor
    let lineSpacing: CGFloat
    var onLinkTap: ((URL) -> Void)? = nil

    func makeUIView(context: Context) -> UITextView {
        let tv = makeReaderTextView()
        tv.dataDetectorTypes = .link
        tv.delegate = context.coordinator
        return tv
    }

    private func renderKey(_ context: Context) -> JustifiedRunsKey {
        JustifiedRunsKey(
            runs: runs,
            style: JustifiedTextStyle(
                fontSize: baseSize,
                weight: baseWeight,
                useSerifReader: useSerifReader,
                lineSpacing: lineSpacing,
                colorKey: JustifiedTextStyle.colorKey(textColor, darkMode: context.environment.colorScheme == .dark),
                sizeCategory: context.environment.justifiedSizeCategory
            )
        )
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        // Still refresh the link handler — cheap and might have changed.
        context.coordinator.onLinkTap = onLinkTap

        let key = renderKey(context)
        if key == context.coordinator.lastKey && uiView.attributedText.length > 0 {
            return
        }
        context.coordinator.lastKey = key

        let m = NSMutableAttributedString(attributedString: InlineRunAttributing.attributedString(
            runs: runs,
            baseSize: key.style.scaledFontSize,
            baseWeight: baseWeight,
            useSerifReader: useSerifReader,
            textColor: textColor
        ))
        // Apply justified paragraph style across the whole string
        // without clobbering the inline font/colour runs.
        let fullRange = NSRange(location: 0, length: m.length)
        m.addAttribute(.paragraphStyle, value: justifiedParagraphStyle(lineSpacing: lineSpacing), range: fullRange)
        uiView.attributedText = m
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width.isFinite, width > 0 else { return nil }
        let fitted = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: ceil(fitted.height))
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, UITextViewDelegate {
        var onLinkTap: ((URL) -> Void)?
        var lastKey: JustifiedRunsKey?
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
            var descriptor = readerFont(size: baseSize, weight: weight, serif: useSerifReader).fontDescriptor
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
