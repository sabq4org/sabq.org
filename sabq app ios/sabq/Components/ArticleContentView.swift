import SwiftUI

// Renders an article body parsed by ArticleHtmlParser. Each block type
// gets a native SwiftUI view — there is NO WebView anywhere in the
// reading surface.
//
// Text-bearing blocks compose their Text via Text(+) concatenation so
// every run carries its OWN .font / .italic / .underline / .foregroundColor
// modifier. Per-run modifiers are stable; using AttributedString here
// silently broke bold/italic because the outer .font(...) overrode the
// per-range attribute.
//
// Honours @AppStorage reader controls (fontSize, lineSpacing, useReaderFont)
// so the Aa sheet resizes everything live.
struct ArticleContentView: View {
    let blocks: [ArticleBlock]
    let fontSize: Double
    let lineSpacing: Double
    let useReaderFont: Bool
    /// Called when the user taps an inline image (single body image or
    /// an entry inside the horizontal gallery). The host view opens the
    /// shared `ImageLightbox` viewer so the reader can pinch-zoom +
    /// tap-to-dismiss. Optional — passing nil keeps the existing
    /// non-interactive behaviour.
    var onImageTap: ((URL) -> Void)? = nil

    /// عرض عمود القراءة المقيس — تُنسب إليه صور المحرر ذات العرض الجزئي.
    @State private var columnWidth: CGFloat = 0
    @Environment(\.layoutDirection) private var layoutDirection

    private var design: Font.Design { useReaderFont ? .serif : .default }

    var body: some View {
        // Generous block spacing — Tailwind prose-lg sits around 28pt
        // between paragraphs and the iOS reader was reading cramped at
        // 18. 24pt gives paragraphs room without feeling disconnected
        // (user request 2026-05-14).
        // Lazy: off-screen blocks aren't built until scrolled near. Matters
        // for tweet embeds — each is a WKWebView, and eager VStack built
        // every one at open, a visible hitch on long multi-tweet articles.
        LazyVStack(alignment: .leading, spacing: SabqLayout.space24) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                renderBlock(block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onGeometryChange(for: CGFloat.self) { proxy in
            proxy.size.width
        } action: { width in
            if width > 0 { columnWidth = width }
        }
    }

    @ViewBuilder
    private func renderBlock(_ block: ArticleBlock) -> some View {
        switch block {
        case .heading(let level, let runs):
            heading(level: level, runs: runs)
        case .paragraph(let runs):
            paragraph(runs)
        case .list(let ordered, let items):
            listView(ordered: ordered, items: items)
        case .blockquote(let runs, let attribution):
            quoteView(runs, attribution: attribution)
        case .image(let url, let alt, let caption, let layout):
            imageBlock(url: url, alt: alt, caption: caption, layout: layout)
        case .imageGallery(let images):
            galleryView(images: images)
        case .twitterEmbed(let url):
            tweetCard(url: url)
        case .videoEmbed(let provider, let embedURL, let sourceURL):
            videoCard(provider: provider, embedURL: embedURL, sourceURL: sourceURL)
        case .whatsappCta(_, let phrase, let url):
            whatsappCtaCard(phrase: phrase, url: url)
        case .table(let header, let rows, let cardStyle):
            tableView(header: header, rows: rows, cardStyle: cardStyle)
        case .qa(let question, let answer):
            qaBlock(question: question, answer: answer)
        case .divider:
            SidebarRowDivider()
        }
    }

    private func whatsappCtaCard(phrase: String, url: URL) -> some View {
        Link(destination: url) {
            // بلوك هادئ بلا تدرّج ولا ظل (النموذج المعتمد).
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "message.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                    .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                            .fill(SabqTheme.surface)
                    )
                    .accessibilityHidden(true)
                Text(phrase)
                    .font(SabqType.button.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.left")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, SabqLayout.cardInset)
            .padding(.vertical, SabqLayout.space12)
            .sabqBlockSurface()
        }
        .buttonStyle(.plain)
    }

    // MARK: - Run rendering

    /// Build a Text by concatenating one Text per run, each with its own
    /// font/italic/underline/color modifiers. This is the SwiftUI-recommended
    /// way to mix inline styles — attempting it via AttributedString +
    /// outer .font(...) silently overrides the per-range font.
    private func renderText(
        runs: [InlineRun],
        baseSize: CGFloat,
        baseWeight: Font.Weight = .regular
    ) -> Text {
        guard !runs.isEmpty else { return Text("") }
        return runs.reduce(Text("")) { acc, run in
            let weight: Font.Weight = run.bold ? .bold : baseWeight
            var t = Text(run.text)
                .font(SabqFonts.app(size: baseSize, weight: weight))
            if run.italic { t = t.italic() }
            if run.underline { t = t.underline() }
            if run.strikethrough { t = t.strikethrough() }
            if let hex = run.colorHex, let color = colorFromHex(hex) {
                t = t.foregroundColor(color)
            } else if run.link != nil {
                t = t.foregroundColor(SabqTheme.primary)
            }
            return acc + t
        }
    }

    private func colorFromHex(_ hex: String) -> Color? {
        let cleaned = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        var s = cleaned
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        return Color(
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }

    // MARK: - Text blocks

    private func heading(level: Int, runs: [InlineRun]) -> some View {
        let size: CGFloat = {
            switch level {
            case 1: return CGFloat(fontSize + 8)
            case 2: return CGFloat(fontSize + 5)
            case 3: return CGFloat(fontSize + 3)
            case 4: return CGFloat(fontSize + 2)
            default: return CGFloat(fontSize + 1)
            }
        }()
        return renderText(runs: runs, baseSize: size, baseWeight: .bold)
            .foregroundStyle(SabqTheme.textPrimary)
            .multilineTextAlignment(.leading)
            .lineSpacing(CGFloat(lineSpacing))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, SabqLayout.space8)
    }

    /// «س/ج» كما في الويب على الجوال: دائرة «س» بلون الهوية، السؤال عريضًا بلون
    /// الهوية، ثم فقرات الجواب بلا إزاحة.
    private func qaBlock(question: [InlineRun], answer: [[InlineRun]]) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            if !question.isEmpty {
                HStack(alignment: .top, spacing: SabqLayout.space12) {
                    Text("س")
                        .font(SabqFonts.app(size: 14, weight: .bold))
                        .foregroundStyle(SabqTheme.onAction)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(SabqTheme.actionFill))
                        .padding(.top, 4)
                        .accessibilityLabel("سؤال")
                    JustifiedAttributedText(
                        runs: question,
                        baseSize: CGFloat(fontSize) * 1.05,
                        baseWeight: .bold,
                        useSerifReader: false,
                        textColor: UIColor(SabqTheme.primary),
                        lineSpacing: CGFloat(lineSpacing) + 3
                    )
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            ForEach(Array(answer.enumerated()), id: \.offset) { _, runs in
                paragraph(runs)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func paragraph(_ runs: [InlineRun]) -> some View {
        // البناء الفعلي للنص المنسّق يحدث داخل الجسر عند تغيّر المدخلات فقط —
        // لا هنا في كل إعادة رسم أثناء التمرير (تدقيق iOS 27، F01).
        JustifiedAttributedText(
            runs: runs,
            baseSize: CGFloat(fontSize),
            baseWeight: .regular,
            useSerifReader: useReaderFont,
            textColor: UIColor(SabqTheme.textPrimary),
            lineSpacing: CGFloat(lineSpacing) + 3
        )
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func listView(ordered: Bool, items: [[InlineRun]]) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            ForEach(Array(items.enumerated()), id: \.offset) { idx, runs in
                HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
                    Text(ordered ? "\(idx + 1)." : "•")
                        .font(SabqFonts.app(size: CGFloat(fontSize), weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(SabqTheme.primary)
                        .frame(minWidth: 18, alignment: .trailing)
                    renderText(runs: runs, baseSize: CGFloat(fontSize))
                        .foregroundStyle(SabqTheme.textPrimary)
                        .multilineTextAlignment(.leading)
                        .lineSpacing(CGFloat(lineSpacing) + 2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Table

    /// جدول أصلي: صف رؤوس مظلّل، خطوط شعرية بين الصفوف، وأعمدة متساوية.
    /// إن ضاقت الشاشة عن (عدد الأعمدة × الحد الأدنى) يتحوّل إلى تمرير أفقي
    /// عبر ViewThatFits بدل هرس النص.
    private func tableView(header: [[InlineRun]]?, rows: [[[InlineRun]]], cardStyle: Bool) -> some View {
        let columnCount = max(header?.count ?? 0, rows.map(\.count).max() ?? 0, 1)
        let minColumnWidth: CGFloat = 84
        let grid = VStack(alignment: .leading, spacing: 0) {
            if let header {
                tableRow(header, columnCount: columnCount, minColumnWidth: minColumnWidth,
                         isHeader: true, cardStyle: cardStyle)
                    .background(SabqTheme.surfaceMuted)
            }
            ForEach(Array(rows.enumerated()), id: \.offset) { idx, cells in
                if header != nil || idx > 0 {
                    SidebarRowDivider()
                }
                tableRow(cells, columnCount: columnCount, minColumnWidth: minColumnWidth,
                         isHeader: false, cardStyle: cardStyle)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .stroke(SabqTheme.outline, lineWidth: 1)
        )

        return ViewThatFits(in: .horizontal) {
            grid.frame(maxWidth: .infinity)
            ScrollView(.horizontal, showsIndicators: false) {
                grid.frame(width: minColumnWidth * CGFloat(columnCount) + CGFloat(columnCount - 1))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func tableRow(
        _ cells: [[InlineRun]],
        columnCount: Int,
        minColumnWidth: CGFloat,
        isHeader: Bool,
        cardStyle: Bool
    ) -> some View {
        let cellSize = CGFloat(max(13, fontSize - 2))
        return HStack(alignment: .top, spacing: 0) {
            ForEach(0..<columnCount, id: \.self) { col in
                let runs = col < cells.count ? cells[col] : []
                let emphasised = isHeader || (cardStyle && col == 0)
                renderText(runs: runs, baseSize: cellSize, baseWeight: emphasised ? .semibold : .regular)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, SabqLayout.space8)
                    .padding(.vertical, SabqLayout.space8)
                    // الحشو داخل الحد الأدنى — وإلا صار عرض العمود الفعلي
                    // min+16 فيفشل شرط «يتسع» في ViewThatFits ويُقصّ الطرفان.
                    .frame(minWidth: minColumnWidth, maxWidth: .infinity, alignment: .leading)
                    .background(cardStyle && col == 0 && !isHeader ? SabqTheme.surfaceMuted : Color.clear)
                if col < columnCount - 1 {
                    Rectangle().fill(SabqTheme.separator).frame(width: 1)
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func quoteView(_ runs: [InlineRun], attribution: [InlineRun]?) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            Capsule()
                .fill(SabqTheme.primary)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                Image(systemName: "quote.opening")
                    .font(SabqFonts.app(size: 18, weight: .regular))
                    .foregroundStyle(SabqTheme.primary)
                    .accessibilityHidden(true)

                renderText(runs: runs, baseSize: CGFloat(fontSize + 1), baseWeight: .medium)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(CGFloat(lineSpacing) + 4)
                    .fixedSize(horizontal: false, vertical: true)

                // القائل في سطر مفرد بخط أصغر
                if let attribution {
                    (Text("— ").font(SabqFonts.app(size: CGFloat(fontSize - 2), weight: .semibold))
                        + renderText(runs: attribution, baseSize: CGFloat(fontSize - 2), baseWeight: .semibold))
                        .foregroundStyle(SabqTheme.textSecondary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 2)
                }
            }
        }
        .padding(SabqLayout.cardInset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqBlockSurface()
    }

    // MARK: - Images

    /// محاذاة الصورة داخل العمود. الويب يقصد الجهة البصرية (right = يمين
    /// الشاشة)، بينما leading/trailing في SwiftUI تتبع اتجاه الواجهة — فنقلبها
    /// تحت RTL كي يبقى «يمين» يمينًا.
    private func alignment(for align: ImageAlign) -> Alignment {
        switch align {
        case .center: return .center
        case .right: return layoutDirection == .rightToLeft ? .leading : .trailing
        case .left: return layoutDirection == .rightToLeft ? .trailing : .leading
        }
    }

    private func imageBlock(url: URL, alt: String?, caption: String?, layout: ImageLayout) -> some View {
        // عرض جزئي من المحرر (25/33/50/75٪) → نضيّق الصورة إلى نسبة العمود
        // المقيس ونحاذيها إلى الجهة المطلوبة (نقل تعديل الويب #1512).
        let fraction = layout.widthFraction ?? 1
        let targetWidth: CGFloat? = (fraction < 1 && columnWidth > 0) ? floor(columnWidth * fraction) : nil
        return VStack(alignment: .leading, spacing: SabqLayout.space8) {
            // Inline body image — the column is narrower than the hero,
            // so a 1600px decode is more than enough for retina and
            // halves the decode time + memory cost vs. the default 2400.
            CachedAsyncImage(url: url, contentMode: .fit, maxPixelSize: 1600) {
                placeholder
            }
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            .onTapGesture {
                guard let onImageTap else { return }
                SabqHaptics.light()
                onImageTap(url)
            }
            .accessibilityLabel(alt ?? "صورة من المقال")
            .accessibilityAddTraits(onImageTap != nil ? .isButton : [])

            if let caption, !caption.isEmpty {
                Text(caption)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(width: targetWidth)
        .frame(maxWidth: .infinity, alignment: targetWidth == nil ? .leading : alignment(for: layout.align))
    }

    private var placeholder: some View {
        SabqImagePlaceholder()
            .frame(height: 220)
    }

    // MARK: - Gallery

    private func galleryView(images: [GalleryImage]) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "photo.stack")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.primary)
                    .accessibilityHidden(true)
                Text("ألبوم صور")
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(SabqTheme.primary)
                Spacer(minLength: 0)
                Text("\(images.count) صورة")
                    .font(SabqType.meta.font)
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.textTertiary)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: SabqLayout.space12) {
                    ForEach(Array(images.enumerated()), id: \.offset) { _, img in
                        VStack(alignment: .leading, spacing: SabqLayout.space8) {
                            // 260×260 thumbnail — 1200px decode is plenty
                            // for retina without paying for full 2400px.
                            CachedAsyncImage(url: img.url, contentMode: .fill, maxPixelSize: 1200) {
                                SabqImagePlaceholder()
                            }
                            .frame(width: 260, height: 260)
                            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                            .contentShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                            .onTapGesture {
                                guard let onImageTap else { return }
                                SabqHaptics.light()
                                onImageTap(img.url)
                            }

                            if let caption = img.caption, !caption.isEmpty {
                                Text(caption)
                                    .font(SabqType.meta.font)
                                    .foregroundStyle(SabqTheme.textTertiary)
                                    .lineLimit(2)
                                    .frame(width: 260, alignment: .leading)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Tweet card
    // Loads the real Twitter/X embed via WKWebView + widgets.js so the
    // tweet renders inline exactly as it does on the web (RTL, dark
    // mode, media, attribution). Falls back to a "افتح في X" link if
    // the script fails to load.
    private func tweetCard(url: URL) -> some View {
        TwitterEmbedView(tweetURL: url)
    }

    // MARK: - Video card

    private func videoCard(provider: VideoProvider, embedURL: URL, sourceURL: URL?) -> some View {
        let openURL = sourceURL ?? embedURL
        let providerName: String = {
            switch provider {
            case .youtube:     return "يوتيوب"
            case .dailymotion: return "Dailymotion"
            case .other:       return "فيديو"
            }
        }()
        return Link(destination: openURL) {
            // خانة 16:9 هادئة بزر تشغيل ممتلئ، بلا تدرّج بلون المزوّد.
            ZStack {
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(SabqTheme.surfaceMuted)

                VStack(spacing: SabqLayout.space12) {
                    Image(systemName: "play.fill")
                        .font(SabqFonts.app(size: 22, weight: .semibold))
                        .foregroundStyle(SabqTheme.onAction)
                        .offset(x: 2)
                        .frame(width: 60, height: 60)
                        .background(Circle().fill(SabqTheme.actionFill))
                    Text(providerName)
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                }
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(16 / 9, contentMode: .fit)
        }
        .buttonStyle(.plain)
    }
}
