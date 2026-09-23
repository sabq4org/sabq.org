import Foundation
import SwiftUI

// Converts TipTap-generated HTML from /api/articles/:slug into an ordered
// list of ArticleBlocks. Targets the exact patterns sabq.org publishes:
//
//   - Standard block elements: <p>, <h1–h6>, <ul>, <ol>, <li>,
//     <blockquote>, <img>, <hr>
//   - Custom data-driven divs:
//       <div data-twitter-embed>  ← detected via class .twitter-tweet OR data attr
//       <div data-image-gallery data-images='[{"src":"…","caption":"…"}]'>
//       <div data-video-embed data-embed-url="https://youtube.com/embed/…">
//   - Inline marks inside text: <strong>/<b>, <em>/<i>, <u>, <s>,
//     <a href>, <span style="color:#…">
//
// All attribute values are HTML-entity-decoded before use — the production
// payload double-encodes data-images as `[{&quot;src&quot;:…}]`.
// nonisolated: يُستدعى من Task.detached لتحليل المقال خارج الـMainActor
// (المشروع يعزل كل شيء على MainActor افتراضيًا عبر
// SWIFT_DEFAULT_ACTOR_ISOLATION) — المحلل نقي بلا حالة مشتركة.
nonisolated enum ArticleHtmlParser {

    static func parse(_ html: String) -> [ArticleBlock] {
        let normalized = normaliseWhitespace(html)
        var blocks: [ArticleBlock] = []
        var scanner = HTMLScanner(input: normalized)

        while !scanner.isAtEnd {
            scanner.skipWhitespace()
            if scanner.isAtEnd { break }

            let before = scanner.index
            if let block = parseNextBlock(scanner: &scanner) {
                if case .paragraph(let runs) = block, runsAreEmpty(runs) { continue }
                blocks.append(block)
            } else if scanner.index == before {
                // التقدّم القسري فقط عندما لا يتحرك الماسح (وقاية من حلقة
                // لا نهائية على مدخل مشوّه). كان يتقدّم بعد كل nil حتى لو
                // استُهلك الوسم كاملًا (فقرة فارغة/<br>) فيأكل '<' الوسم
                // التالي ويحوّل "p>نص" إلى فقرة نصية مشوّهة.
                scanner.advance(1)
            }
        }
        return blocks
    }

    // MARK: - Block dispatch

    private static func parseNextBlock(scanner: inout HTMLScanner) -> ArticleBlock? {
        guard let lt = scanner.peek(), lt == "<" else {
            let chunk = scanner.consume(until: "<")
            let runs = parseInlineRuns(chunk)
            return runsAreEmpty(runs) ? nil : .paragraph(runs: runs)
        }

        guard let tag = scanner.peekTag() else {
            scanner.advance(1)
            return nil
        }

        // Self-closing / void
        if tag.name == "hr" { scanner.consumeTag(); return .divider }
        if tag.name == "br" { scanner.consumeTag(); return nil }
        if tag.name == "img" {
            scanner.consumeTag()
            if let src = tag.attr("src"), let url = URL(string: src) {
                return .image(
                    url: url,
                    alt: tag.attr("alt"),
                    caption: tag.attr("data-caption").flatMap { $0.isEmpty ? nil : $0 },
                    layout: ImageLayout.parse(width: tag.attr("data-width"), align: tag.attr("data-align"))
                )
            }
            return nil
        }

        // Custom div blocks switch on data attributes BEFORE generic tags.
        if tag.name == "div" {
            let isGallery = tag.attr("data-image-gallery") != nil || tag.classes.contains("photo-album")
            let isVideo = tag.attr("data-video-embed") != nil || tag.classes.contains("video-embed") || tag.classes.contains("youtube-embed")
            let isTweet = tag.attr("data-twitter-embed") != nil || tag.classes.contains("tweet-embed") || (tag.classes.contains("social-embed") && tag.attr("data-embed-type") == "twitter")
            let isWhatsApp = tag.attr("data-whatsapp-cta") != nil || tag.classes.contains("whatsapp-cta-card")

            if isGallery {
                return parseImageGallery(scanner: &scanner, tag: tag)
            }
            if isVideo {
                return parseVideoEmbed(scanner: &scanner, tag: tag)
            }
            if isTweet {
                return parseTwitterEmbed(scanner: &scanner, tag: tag)
            }
            if isWhatsApp {
                return parseWhatsAppCta(scanner: &scanner, tag: tag)
            }
            // Generic div: render children as paragraph.
            let inner = scanner.consumeContainer()
            let cleaned = stripTags(inner).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleaned.isEmpty else { return nil }
            return .paragraph(runs: parseInlineRuns(inner))
        }

        // <blockquote class="twitter-tweet"> is a tweet, not a quote.
        if tag.name == "blockquote" {
            if tag.classes.contains("twitter-tweet") {
                return parseTwitterEmbedFromBlockquote(scanner: &scanner)
            }
            let inner = scanner.consumeContainer()
            let runs = parseInlineRuns(inner)
            if runsAreEmpty(runs) { return nil }
            let split = splitQuoteAttribution(runs)
            return .blockquote(runs: split.quote, attribution: split.attribution)
        }

        if let level = headingLevel(tag.name) {
            let inner = scanner.consumeContainer()
            let runs = parseInlineRuns(inner)
            return runsAreEmpty(runs) ? nil : .heading(level: level, runs: runs)
        }

        if tag.name == "ul" || tag.name == "ol" {
            return parseList(scanner: &scanner, ordered: tag.name == "ol")
        }

        if tag.name == "table" {
            return parseTable(scanner: &scanner, tag: tag)
        }

        if tag.name == "p" {
            let inner = scanner.consumeContainer()
            if let img = tryExtractInlineImage(inner) { return img }
            let runs = parseInlineRuns(inner)
            return runsAreEmpty(runs) ? nil : .paragraph(runs: runs)
        }

        scanner.consumeTag()
        return nil
    }

    // MARK: - Block parsers

    private static func parseList(scanner: inout HTMLScanner, ordered: Bool) -> ArticleBlock {
        let inner = scanner.consumeContainer()
        var items: [[InlineRun]] = []
        var s = HTMLScanner(input: inner)
        while !s.isAtEnd {
            s.skipWhitespace()
            guard let tag = s.peekTag(), tag.name == "li" else {
                s.advance(1); continue
            }
            let itemHTML = s.consumeContainer()
            let runs = parseInlineRuns(itemHTML)
            if !runsAreEmpty(runs) { items.append(runs) }
        }
        return .list(ordered: ordered, items: items)
    }

    /// `<table class="sabq-table"><tbody><tr><th>…</th></tr><tr><td>…</td></tr>…`
    /// كان الجدول يسقط إلى «وسم مجهول» فتتناثر خلاياه كفقرات مستقلة.
    /// الصف الأول يُعدّ رأسًا إذا كانت كل خلاياه <th>. colgroup/thead/tbody تُتجاوز.
    private static func parseTable(scanner: inout HTMLScanner, tag: HTMLTag) -> ArticleBlock? {
        let inner = scanner.consumeContainer()
        let cardStyle = tag.classes.contains("sabq-table--card")
        var header: [[InlineRun]]? = nil
        var rows: [[[InlineRun]]] = []
        var s = HTMLScanner(input: inner)
        while !s.isAtEnd {
            s.skipWhitespace()
            guard let t = s.peekTag() else { s.advance(1); continue }
            guard t.name == "tr", !t.isClosing else { s.consumeTag(); continue }
            let rowHTML = s.consumeContainer()
            var cells: [[InlineRun]] = []
            var allHeader = true
            var c = HTMLScanner(input: rowHTML)
            while !c.isAtEnd {
                c.skipWhitespace()
                guard let ct = c.peekTag() else { c.advance(1); continue }
                guard (ct.name == "td" || ct.name == "th"), !ct.isClosing else { c.consumeTag(); continue }
                if ct.name == "td" { allHeader = false }
                // فقرات متعددة داخل الخلية → أسطر
                let cellHTML = c.consumeContainer().replacingOccurrences(of: "</p><p", with: "<br><p")
                cells.append(parseInlineRuns(cellHTML))
            }
            guard !cells.isEmpty else { continue }
            if allHeader, header == nil, rows.isEmpty {
                header = cells
            } else {
                rows.append(cells)
            }
        }
        guard header != nil || !rows.isEmpty else { return nil }
        return .table(header: header, rows: rows, cardStyle: cardStyle)
    }

    private static func parseImageGallery(scanner: inout HTMLScanner, tag: HTMLTag) -> ArticleBlock {
        let inner = scanner.consumeContainer()
        var images: [GalleryImage] = []

        // Preferred path: data-images='[{...}]'. The attribute value comes
        // back HTML-entity-encoded (`&quot;`), so decode before JSON parse.
        if let rawAttr = tag.attr("data-images") {
            let decoded = decodeEntities(rawAttr)
            if let data = decoded.data(using: .utf8),
               let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                for entry in parsed {
                    if let src = entry["src"] as? String, let url = URL(string: src) {
                        let cap = (entry["caption"] as? String).flatMap {
                            $0.isEmpty ? nil : $0
                        }
                        images.append(GalleryImage(url: url, caption: cap))
                    }
                }
            }
        }

        // Fallback: scrape <img> children if JSON path failed.
        if images.isEmpty {
            let imgPattern = try? NSRegularExpression(
                pattern: "<img[^>]*src=\"([^\"]+)\"[^>]*>", options: .caseInsensitive
            )
            imgPattern?.matches(
                in: inner, range: NSRange(inner.startIndex..., in: inner)
            ).forEach { match in
                guard let r = Range(match.range(at: 1), in: inner) else { return }
                if let url = URL(string: String(inner[r])) {
                    images.append(GalleryImage(url: url, caption: nil))
                }
            }
        }

        return .imageGallery(images: images)
    }

    private static func parseVideoEmbed(scanner: inout HTMLScanner, tag: HTMLTag) -> ArticleBlock {
        let inner = scanner.consumeContainer()
        var embedURL = tag.attr("data-embed-url") ?? tag.attr("src") ?? ""
        let srcURL = tag.attr("data-url")
        
        if embedURL.isEmpty {
            let pattern = "<iframe[^>]*src=\"([^\"]+)\"[^>]*>"
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
               let match = regex.firstMatch(in: inner, range: NSRange(inner.startIndex..., in: inner)),
               let r = Range(match.range(at: 1), in: inner) {
                embedURL = String(inner[r])
            }
        }
        
        if let url = URL(string: embedURL) {
            return .videoEmbed(
                provider: detectVideoProvider(url: url),
                embedURL: url,
                sourceURL: srcURL.flatMap(URL.init(string:))
            )
        }
        return .divider
    }

    private static func parseTwitterEmbed(scanner: inout HTMLScanner, tag: HTMLTag) -> ArticleBlock {
        let inner = scanner.consumeContainer()
        if let url = extractTweetURL(from: inner) {
            return .twitterEmbed(tweetURL: url)
        }
        // المسار الاحتياطي يجب أن يتحقق من المضيف مثل regex المسار الأساسي:
        // بدونه data-embed-url مدسوس في جسم مقال يُصيَّر «كتغريدة» تفتح
        // موقع تصيّد من داخل WKWebView.
        if let raw = tag.attr("data-embed-url") ?? tag.attr("href"),
           let url = URL(string: raw), isTrustedTweetHost(url) {
            return .twitterEmbed(tweetURL: url)
        }
        return .divider
    }

    private static func isTrustedTweetHost(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = url.host?.lowercased() else { return false }
        return host == "twitter.com" || host.hasSuffix(".twitter.com")
            || host == "x.com" || host.hasSuffix(".x.com")
    }

    private static func parseTwitterEmbedFromBlockquote(scanner: inout HTMLScanner) -> ArticleBlock {
        let inner = scanner.consumeContainer()
        if let url = extractTweetURL(from: inner) { return .twitterEmbed(tweetURL: url) }
        let split = splitQuoteAttribution(parseInlineRuns(inner))
        return .blockquote(runs: split.quote, attribution: split.attribution)
    }

    private static func parseWhatsAppCta(scanner: inout HTMLScanner, tag: HTMLTag) -> ArticleBlock {
        let inner = scanner.consumeContainer()
        let phone = (tag.attr("data-phone") ?? "").filter(\.isNumber)
        let phraseAttr = tag.attr("data-phrase")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let phraseFromText = stripTags(inner).trimmingCharacters(in: .whitespacesAndNewlines)
        let phrase = !phraseAttr.isEmpty
            ? phraseAttr
            : (!phraseFromText.isEmpty ? phraseFromText : "تواصل عبر واتساب")

        var href: URL?
        let pattern = "href=\"(https?://wa\\.me/[^\"]+)\""
        if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
           let match = regex.firstMatch(in: inner, range: NSRange(inner.startIndex..., in: inner)),
           let range = Range(match.range(at: 1), in: inner) {
            href = URL(string: String(inner[range]))
        }
        if href == nil, !phone.isEmpty {
            href = URL(string: "https://wa.me/\(phone)")
        }
        guard let url = href else { return .divider }
        return .whatsappCta(phone: phone, phrase: phrase, url: url)
    }

    private static func extractTweetURL(from html: String) -> URL? {
        let pattern = "href=\"(https?://(?:twitter\\.com|x\\.com)/[^\"]+/status/[0-9]+[^\"]*)\""
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
              let match = regex.firstMatch(in: html, range: NSRange(html.startIndex..., in: html)),
              let range = Range(match.range(at: 1), in: html) else { return nil }
        return URL(string: String(html[range]))
    }

    private static func detectVideoProvider(url: URL) -> VideoProvider {
        let host = url.host ?? ""
        if host.contains("youtube") || host.contains("youtu.be") { return .youtube }
        if host.contains("dailymotion") || host.contains("dai.ly") { return .dailymotion }
        return .other
    }

    /// قيمة سمة داخل وسم خام (`<img … data-width="50%">`) — للمسار الذي لا يملك HTMLTag.
    private static func inlineAttr(_ name: String, in raw: String) -> String? {
        for q in ["\"", "'"] {
            let pattern = "\\b\(name)\\s*=\\s*\(q)([^\(q)]*)\(q)"
            if let regex = HTMLRegexCache.regex(pattern, options: .caseInsensitive),
               let m = regex.firstMatch(in: raw, range: NSRange(raw.startIndex..., in: raw)),
               let r = Range(m.range(at: 1), in: raw) {
                return String(raw[r])
            }
        }
        return nil
    }

    private static func tryExtractInlineImage(_ inner: String) -> ArticleBlock? {
        let trimmed = inner.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.lowercased().hasPrefix("<img") else { return nil }
        let pattern = "<img[^>]*src=\"([^\"]+)\"[^>]*(?:alt=\"([^\"]*)\")?"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
              let match = regex.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)),
              let srcRange = Range(match.range(at: 1), in: trimmed),
              let url = URL(string: String(trimmed[srcRange])) else { return nil }
        let alt: String? = match.numberOfRanges > 2
            ? Range(match.range(at: 2), in: trimmed).map { String(trimmed[$0]) }
            : nil
        return .image(
            url: url,
            alt: alt,
            caption: inlineAttr("data-caption", in: trimmed).flatMap { $0.isEmpty ? nil : $0 },
            layout: ImageLayout.parse(width: inlineAttr("data-width", in: trimmed), align: inlineAttr("data-align", in: trimmed))
        )
    }

    // MARK: - Inline runs

    /// Parses inline HTML into a sequence of InlineRun records. The returned
    /// runs cover every character of the source text in order; each run
    /// captures the marks active at the time (bold/italic/underline/strike,
    /// link, colour hex).
    static func parseInlineRuns(_ html: String) -> [InlineRun] {
        var runs: [InlineRun] = []
        var s = HTMLScanner(input: html)

        // Stack of active marks. Each entry is a partial InlineRun template
        // we can merge into a new run.
        struct MarkFrame {
            var bold = false
            var italic = false
            var underline = false
            var strikethrough = false
            var colorHex: String? = nil
            var link: URL? = nil
            var pushedBy: String  // tag name — used to know what closes us
        }
        var stack: [MarkFrame] = []

        func currentRunTemplate(text: String) -> InlineRun {
            var run = InlineRun(text: text)
            for frame in stack {
                if frame.bold { run.bold = true }
                if frame.italic { run.italic = true }
                if frame.underline { run.underline = true }
                if frame.strikethrough { run.strikethrough = true }
                if frame.colorHex != nil { run.colorHex = frame.colorHex }
                if frame.link != nil { run.link = frame.link }
            }
            return run
        }

        while !s.isAtEnd {
            if s.peek() == "<" {
                guard let tag = s.peekTag() else {
                    s.advance(1); continue
                }
                if tag.isClosing {
                    s.consumeTag()
                    if let idx = stack.lastIndex(where: { $0.pushedBy == tag.name }) {
                        stack.remove(at: idx)
                    }
                } else {
                    s.consumeTag()
                    // Determine which mark this opens (if any).
                    var frame = MarkFrame(pushedBy: tag.name)
                    switch tag.name {
                    case "strong", "b":   frame.bold = true
                    case "em", "i":       frame.italic = true
                    case "u":             frame.underline = true
                    case "s", "strike", "del": frame.strikethrough = true
                    case "a":
                        if let href = tag.attr("href"), let url = URL(string: href) {
                            frame.link = url
                        }
                    case "span":
                        if let style = tag.attr("style"),
                           let hex = colorHexFromStyle(style) {
                            frame.colorHex = hex
                        }
                    case "br":
                        // Inline line break — emit a newline run.
                        runs.append(currentRunTemplate(text: "\n"))
                        continue
                    default:
                        break
                    }
                    // Push even no-op frames so closing tags pop correctly.
                    stack.append(frame)
                }
            } else {
                let chunk = s.consume(until: "<")
                if chunk.isEmpty { continue }
                let decoded = decodeEntities(chunk)
                runs.append(currentRunTemplate(text: decoded))
            }
        }

        return mergeAdjacentRuns(runs)
    }

    /// Coalesce runs that share the same style flags so the renderer doesn't
    /// emit needless separate Text views.
    private static func mergeAdjacentRuns(_ runs: [InlineRun]) -> [InlineRun] {
        var out: [InlineRun] = []
        for run in runs {
            if let last = out.last,
               last.bold == run.bold,
               last.italic == run.italic,
               last.underline == run.underline,
               last.strikethrough == run.strikethrough,
               last.colorHex == run.colorHex,
               last.link == run.link {
                out[out.count - 1] = InlineRun(
                    text: last.text + run.text,
                    bold: last.bold,
                    italic: last.italic,
                    underline: last.underline,
                    strikethrough: last.strikethrough,
                    colorHex: last.colorHex,
                    link: last.link
                )
            } else {
                out.append(run)
            }
        }
        return out
    }

    /// يفصل القائل عن نص المقولة عندما يأتيان في فقرة واحدة داخل blockquote:
    /// «المقولة» — فلان، صفته. النمط المعتمد في التحرير هو قفل الاقتباس «»»
    /// (أو سطر جديد من <br>) متبوعًا بشرطة ثم اسم القائل. لا فصل عند الشك —
    /// الشرطات داخل الجمل العادية لا تطابق لأن الفصل يشترط «»» أو \n قبلها.
    static func splitQuoteAttribution(
        _ runs: [InlineRun]
    ) -> (quote: [InlineRun], attribution: [InlineRun]?) {
        let full = runs.map(\.text).joined()
        // (نمط، هل تبقى علامة «»» ضمن المقولة)
        let separators: [(pattern: String, keepMark: Bool)] = [
            ("»\\s*[—–-]+\\s*", true),
            ("\\n\\s*[—–]+\\s*", false),
        ]
        for sep in separators {
            guard let regex = HTMLRegexCache.regex(sep.pattern) else { continue }
            let matches = regex.matches(in: full, range: NSRange(full.startIndex..., in: full))
            guard let last = matches.last, let match = Range(last.range, in: full) else { continue }
            let attributionText = String(full[match.upperBound...])
                .trimmingCharacters(in: .whitespacesAndNewlines)
            // قائل معقول: غير فارغ، قصير، وليس بداية اقتباس آخر
            guard !attributionText.isEmpty, attributionText.count <= 140,
                  !attributionText.contains("«"), !attributionText.contains("»") else { continue }
            let quoteEnd = sep.keepMark ? full.index(after: match.lowerBound) : match.lowerBound
            let quote = sliceRuns(runs, from: 0, to: full.distance(from: full.startIndex, to: quoteEnd))
            let attribution = sliceRuns(
                runs,
                from: full.distance(from: full.startIndex, to: match.upperBound),
                to: full.count
            )
            if runsAreEmpty(quote) || runsAreEmpty(attribution) { continue }
            return (quote, attribution)
        }
        return (runs, nil)
    }

    /// يقصّ [InlineRun] على مدى حرفي [from, to) مع الحفاظ على تنسيقات كل run.
    private static func sliceRuns(_ runs: [InlineRun], from: Int, to: Int) -> [InlineRun] {
        var out: [InlineRun] = []
        var pos = 0
        for run in runs {
            let len = run.text.count
            defer { pos += len }
            let start = max(from - pos, 0)
            let end = min(to - pos, len)
            guard start < end else { continue }
            let s = run.text.index(run.text.startIndex, offsetBy: start)
            let e = run.text.index(run.text.startIndex, offsetBy: end)
            out.append(InlineRun(
                text: String(run.text[s..<e]),
                bold: run.bold,
                italic: run.italic,
                underline: run.underline,
                strikethrough: run.strikethrough,
                colorHex: run.colorHex,
                link: run.link
            ))
        }
        return out
    }

    private static func runsAreEmpty(_ runs: [InlineRun]) -> Bool {
        let text = runs.map(\.text).joined()
        return text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private static func colorHexFromStyle(_ style: String) -> String? {
        let lower = style.lowercased()
        guard let range = lower.range(of: "color\\s*:\\s*", options: .regularExpression) else { return nil }
        let rest = lower[range.upperBound...].trimmingCharacters(in: .whitespaces)
        if rest.hasPrefix("#") {
            let hex = rest.dropFirst().prefix { "0123456789abcdef".contains($0) }
            return hex.count == 3 ? String(hex.map { "\($0)\($0)" }.joined()) : String(hex)
        }
        if rest.hasPrefix("rgb") {
            let pattern = #"rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)"#
            if let regex = try? NSRegularExpression(pattern: pattern),
               let m = regex.firstMatch(in: rest, range: NSRange(rest.startIndex..., in: rest)),
               m.numberOfRanges >= 4 {
                let comps: [Int] = (1...3).compactMap { i in
                    Range(m.range(at: i), in: rest).flatMap { Int(rest[$0]) }
                }
                if comps.count == 3 {
                    return String(format: "%02x%02x%02x", comps[0], comps[1], comps[2])
                }
            }
        }
        return nil
    }

    // MARK: - Helpers

    private static func normaliseWhitespace(_ html: String) -> String {
        var result = html.replacingOccurrences(of: "\r\n", with: "\n")
        result = result.replacingOccurrences(
            of: ">\\s+<", with: "><", options: .regularExpression
        )
        return result
    }

    private static func headingLevel(_ tagName: String) -> Int? {
        guard tagName.count == 2, tagName.first == "h" else { return nil }
        guard let digit = Int(String(tagName.last!)) else { return nil }
        return (1...6).contains(digit) ? digit : nil
    }

    private static func stripTags(_ html: String) -> String {
        guard let regex = HTMLRegexCache.regex("<[^>]+>") else { return html }
        return regex.stringByReplacingMatches(
            in: html,
            range: NSRange(html.startIndex..., in: html),
            withTemplate: ""
        )
    }

    static func decodeEntities(_ input: String) -> String {
        var out = input
        let entities: [(String, String)] = [
            ("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
            ("&quot;", "\""), ("&apos;", "'"), ("&#39;", "'"),
            ("&hellip;", "…"), ("&mdash;", "—"), ("&ndash;", "–"),
            ("&laquo;", "«"), ("&raquo;", "»"),
        ]
        for (k, v) in entities { out = out.replacingOccurrences(of: k, with: v) }
        let regex = HTMLRegexCache.regex("&#([0-9]+);")
        regex?.matches(in: out, range: NSRange(out.startIndex..., in: out)).reversed().forEach { match in
            guard match.numberOfRanges >= 2,
                  let r = Range(match.range, in: out),
                  let nr = Range(match.range(at: 1), in: out),
                  let scalar = Int(out[nr]),
                  let unicode = Unicode.Scalar(scalar) else { return }
            out.replaceSubrange(r, with: String(Character(unicode)))
        }
        return out
    }
}

// MARK: - Regex cache

/// كاش أنماط NSRegularExpression — كان `attr` يعيد ترجمة النمط عند كل
/// استعلام سمة (لكل وسم × لكل نمط اقتباس)، فمقال طويل يترجم مئات الأنماط
/// على الخيط الرئيسي أثناء أول رسم = تعليقة ملموسة عند فتح المقال.
/// المجموعة مغلقة (أسماء سمات معدودة) فالقاموس يبقى صغيرًا.
private nonisolated enum HTMLRegexCache {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var cache: [String: NSRegularExpression] = [:]

    static func regex(
        _ pattern: String,
        options: NSRegularExpression.Options = []
    ) -> NSRegularExpression? {
        let key = "\(options.rawValue)#\(pattern)"
        lock.lock()
        defer { lock.unlock() }
        if let hit = cache[key] { return hit }
        guard let compiled = try? NSRegularExpression(pattern: pattern, options: options) else {
            return nil
        }
        cache[key] = compiled
        return compiled
    }
}

// MARK: - Minimal HTML scanner

private nonisolated struct HTMLTag {
    let name: String
    let isClosing: Bool
    let attributesRaw: String

    var classes: [String] {
        guard let cls = attr("class") else { return [] }
        return cls.split(separator: " ").map(String.init)
    }

    func attr(_ name: String) -> String? {
        for q in ["\"", "'"] {
            let pattern = "\\b\(name)\\s*=\\s*\(q)([^\(q)]*)\(q)"
            if let regex = HTMLRegexCache.regex(pattern, options: .caseInsensitive),
               let m = regex.firstMatch(in: attributesRaw, range: NSRange(attributesRaw.startIndex..., in: attributesRaw)),
               let r = Range(m.range(at: 1), in: attributesRaw) {
                return String(attributesRaw[r])
            }
        }
        return nil
    }
}

private nonisolated struct HTMLScanner {
    let input: String
    var index: String.Index

    init(input: String) {
        self.input = input
        self.index = input.startIndex
    }

    var isAtEnd: Bool { index >= input.endIndex }

    func peek() -> Character? {
        guard !isAtEnd else { return nil }
        return input[index]
    }

    mutating func advance(_ n: Int = 1) {
        for _ in 0..<n {
            guard index < input.endIndex else { return }
            index = input.index(after: index)
        }
    }

    mutating func skipWhitespace() {
        while let ch = peek(), ch.isWhitespace { advance(1) }
    }

    func peekTag() -> HTMLTag? {
        guard !isAtEnd, input[index] == "<" else { return nil }
        guard let close = input[index...].firstIndex(of: ">") else { return nil }
        let raw = String(input[index...close])
        return parseTag(raw)
    }

    @discardableResult
    mutating func consumeTag() -> HTMLTag? {
        guard !isAtEnd, input[index] == "<" else { return nil }
        guard let close = input[index...].firstIndex(of: ">") else { return nil }
        let raw = String(input[index...close])
        index = input.index(after: close)
        return parseTag(raw)
    }

    mutating func consume(until stop: Character) -> String {
        let start = index
        while let ch = peek(), ch != stop { advance(1) }
        return String(input[start..<index])
    }

    mutating func consumeContainer() -> String {
        guard let openTag = consumeTag(), !openTag.isClosing else { return "" }
        let start = index
        var depth = 1
        while !isAtEnd {
            if input[index] == "<" {
                if let close = input[index...].firstIndex(of: ">") {
                    let raw = String(input[index...close])
                    let parsed = parseTag(raw)
                    if let parsed, parsed.name == openTag.name {
                        if parsed.isClosing {
                            depth -= 1
                            if depth == 0 {
                                let inner = String(input[start..<index])
                                index = input.index(after: close)
                                return inner
                            }
                        } else {
                            depth += 1
                        }
                    }
                    index = input.index(after: close)
                    continue
                }
            }
            advance(1)
        }
        // وسم لم يُغلق حتى نهاية المستند (HTML مشوّه/مبتور): الإرجاع السابق
        // كان يبتلع كل ما بعده داخل هذا البلوك فتختفي الصور/التغريدات/العناوين
        // التالية من المقال كله. نتعافى بإرجاع الماسح إلى ما بعد وسم الفتح
        // مباشرةً ومحتوى فارغ — فيُعاد تحليل ما بعده كبلوكات عليا وتظهر كلها.
        // التقدّم مضمون (وسم الفتح استُهلك) فلا حلقة لا نهائية.
        index = start
        return ""
    }

    private func parseTag(_ raw: String) -> HTMLTag? {
        var body = raw
        guard body.hasPrefix("<"), body.hasSuffix(">") else { return nil }
        body.removeFirst()
        body.removeLast()
        let isClosing = body.hasPrefix("/")
        if isClosing { body.removeFirst() }
        if body.hasSuffix("/") { body.removeLast() }
        body = body.trimmingCharacters(in: .whitespaces)
        guard !body.isEmpty else { return nil }

        let nameRun = body.prefix { $0.isLetter || $0.isNumber || $0 == "-" }
        let name = String(nameRun).lowercased()
        let attrsRaw = String(body.dropFirst(nameRun.count)).trimmingCharacters(in: .whitespaces)
        return HTMLTag(name: name, isClosing: isClosing, attributesRaw: attrsRaw)
    }
}
