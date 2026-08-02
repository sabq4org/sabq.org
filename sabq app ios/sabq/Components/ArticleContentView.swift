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

    private var design: Font.Design { useReaderFont ? .serif : .default }

    var body: some View {
        // Generous block spacing — Tailwind prose-lg sits around 28pt
        // between paragraphs and the iOS reader was reading cramped at
        // 18. 24pt gives paragraphs room without feeling disconnected
        // (user request 2026-05-14).
        // Lazy: off-screen blocks aren't built until scrolled near. Matters
        // for tweet embeds — each is a WKWebView, and eager VStack built
        // every one at open, a visible hitch on long multi-tweet articles.
        LazyVStack(alignment: .leading, spacing: 24) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                renderBlock(block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
        case .image(let url, let alt, let caption):
            imageBlock(url: url, alt: alt, caption: caption)
        case .imageGallery(let images):
            galleryView(images: images)
        case .twitterEmbed(let url):
            tweetCard(url: url)
        case .videoEmbed(let provider, let embedURL, let sourceURL):
            videoCard(provider: provider, embedURL: embedURL, sourceURL: sourceURL)
        case .whatsappCta(_, let phrase, let url):
            whatsappCtaCard(phrase: phrase, url: url)
        case .divider:
            Divider().foregroundStyle(SabqTheme.outline.opacity(0.5))
        }
    }

    private func whatsappCtaCard(phrase: String, url: URL) -> some View {
        Link(destination: url) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.2))
                        .frame(width: 44, height: 44)
                    Image(systemName: "message.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                }
                Text(phrase)
                    .font(SabqFonts.app(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.85))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                LinearGradient(
                    colors: [Color(red: 0.145, green: 0.827, blue: 0.4), Color(red: 0.071, green: 0.549, blue: 0.494)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: Color(red: 0.071, green: 0.549, blue: 0.494).opacity(0.28), radius: 12, y: 6)
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
                t = t.foregroundColor(SabqTheme.primaryEnd)
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
            case 1: return CGFloat(fontSize + 9)
            case 2: return CGFloat(fontSize + 6)
            case 3: return CGFloat(fontSize + 4)
            case 4: return CGFloat(fontSize + 2)
            default: return CGFloat(fontSize + 1)
            }
        }()
        return renderText(runs: runs, baseSize: size, baseWeight: .heavy)
            .foregroundStyle(SabqTheme.ink)
            .multilineTextAlignment(.leading)
            .lineSpacing(CGFloat(lineSpacing))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 6)
    }

    private func paragraph(_ runs: [InlineRun]) -> some View {
        let attributed = InlineRunAttributing.attributedString(
            runs: runs,
            baseSize: CGFloat(fontSize),
            baseWeight: .regular,
            useSerifReader: useReaderFont,
            textColor: UIColor(SabqTheme.ink.opacity(0.92))
        )
        return JustifiedAttributedText(
            attributed: attributed,
            lineSpacing: CGFloat(lineSpacing) + 3
        )
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func listView(ordered: Bool, items: [[InlineRun]]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(items.enumerated()), id: \.offset) { idx, runs in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(ordered ? "\(idx + 1)." : "•")
                        .font(SabqFonts.app(size: CGFloat(fontSize), weight: .bold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .frame(minWidth: 18, alignment: .trailing)
                    renderText(runs: runs, baseSize: CGFloat(fontSize))
                        .foregroundStyle(SabqTheme.ink.opacity(0.92))
                        .multilineTextAlignment(.leading)
                        .lineSpacing(CGFloat(lineSpacing) + 2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func quoteView(_ runs: [InlineRun], attribution: [InlineRun]?) -> some View {
        HStack(alignment: .top, spacing: 14) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(SabqTheme.primaryEnd)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "quote.opening")
                    .font(SabqFonts.app(size: 18, weight: .light))
                    .foregroundStyle(SabqTheme.primaryEnd.opacity(0.55))

                renderText(runs: runs, baseSize: CGFloat(fontSize + 1), baseWeight: .medium)
                    .italic()
                    .foregroundStyle(SabqTheme.ink.opacity(0.88))
                    .multilineTextAlignment(.leading)
                    .lineSpacing(CGFloat(lineSpacing) + 4)
                    .fixedSize(horizontal: false, vertical: true)

                // القائل في سطر مفرد بخط أصغر
                if let attribution {
                    (Text("— ").font(SabqFonts.app(size: CGFloat(fontSize - 2), weight: .semibold))
                        + renderText(runs: attribution, baseSize: CGFloat(fontSize - 2), baseWeight: .semibold))
                        .foregroundStyle(SabqTheme.ink.opacity(0.6))
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 2)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .fill(SabqTheme.primaryEnd.opacity(0.04))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.primaryEnd.opacity(0.18), lineWidth: 0.5)
        )
    }

    // MARK: - Images

    private func imageBlock(url: URL, alt: String?, caption: String?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // Inline body image — the column is narrower than the hero,
            // so a 1600px decode is more than enough for retina and
            // halves the decode time + memory cost vs. the default 2400.
            CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 1600) {
                placeholder
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 200)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .onTapGesture {
                guard let onImageTap else { return }
                SabqHaptics.light()
                onImageTap(url)
            }
            .accessibilityLabel(alt ?? "صورة من المقال")
            .accessibilityAddTraits(onImageTap != nil ? .isButton : [])

            if let caption, !caption.isEmpty {
                Text(caption)
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(SabqTheme.paleFill)
            .frame(height: 220)
            .overlay(
                Image(systemName: "photo")
                    .font(SabqFonts.app(size: 28, weight: .ultraLight))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            )
    }

    // MARK: - Gallery

    private func galleryView(images: [GalleryImage]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "photo.stack")
                    .font(SabqFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Text("ألبوم صور")
                    .font(SabqFonts.app(size: 12, weight: .heavy))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Spacer(minLength: 0)
                Text("\(images.count) صورة")
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 12) {
                    ForEach(Array(images.enumerated()), id: \.offset) { _, img in
                        VStack(alignment: .leading, spacing: 6) {
                            // 260×260 thumbnail — 1200px decode is plenty
                            // for retina without paying for full 2400px.
                            CachedAsyncImage(url: img.url, contentMode: .fill, maxPixelSize: 1200) {
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(SabqTheme.paleFill)
                            }
                            .frame(width: 260, height: 260)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .onTapGesture {
                                guard let onImageTap else { return }
                                SabqHaptics.light()
                                onImageTap(img.url)
                            }

                            if let caption = img.caption, !caption.isEmpty {
                                Text(caption)
                                    .font(SabqFonts.app(size: 11, weight: .medium))
                                    .foregroundStyle(SabqTheme.tertiaryInk)
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
        let tint: Color = {
            switch provider {
            case .youtube:     return Color(red: 0.93, green: 0.20, blue: 0.20)
            case .dailymotion: return SabqTheme.sky
            case .other:       return SabqTheme.secondaryInk
            }
        }()
        let providerName: String = {
            switch provider {
            case .youtube:     return "يوتيوب"
            case .dailymotion: return "Dailymotion"
            case .other:       return "فيديو"
            }
        }()
        return Link(destination: openURL) {
            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(LinearGradient(
                        colors: [tint.opacity(0.20), tint.opacity(0.05)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing))

                VStack(spacing: 10) {
                    ZStack {
                        Circle().fill(.white).frame(width: 60, height: 60)
                        Image(systemName: "play.fill")
                            .font(SabqFonts.app(size: 22, weight: .heavy))
                            .foregroundStyle(tint)
                            .offset(x: 2)
                    }
                    Text(providerName)
                        .font(SabqFonts.app(size: 12, weight: .heavy))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(tint))
                }
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(16 / 9, contentMode: .fit)
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(tint.opacity(0.25), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }
}
