import SwiftUI
import Foundation

// Parsed structural representation of a published article body. The API
// returns `content` as TipTap-generated HTML; ArticleHtmlParser converts
// that HTML into an ordered list of these blocks so SwiftUI can render
// each one with native UI — no WebView.
//
// Text-bearing blocks store [InlineRun] (not AttributedString) because the
// renderer needs to compose `Text` views with Text-level modifiers — the
// outer `.font(...)` modifier on a Text(AttributedString) silently
// overrides per-range font attributes, which was costing us bold/italic.

enum ArticleBlock {
    case heading(level: Int, runs: [InlineRun])
    case paragraph(runs: [InlineRun])
    case list(ordered: Bool, items: [[InlineRun]])
    case blockquote(runs: [InlineRun])
    case image(url: URL, alt: String?, caption: String?)
    case imageGallery(images: [GalleryImage])
    case twitterEmbed(tweetURL: URL)
    case videoEmbed(provider: VideoProvider, embedURL: URL, sourceURL: URL?)
    case divider
}

struct InlineRun: Hashable {
    let text: String
    var bold: Bool = false
    var italic: Bool = false
    var underline: Bool = false
    var strikethrough: Bool = false
    /// Hex string `#RRGGBB` if a TipTap colour-pick produced one. Decoded
    /// to a SwiftUI Color in the renderer (keeps the model Codable-friendly).
    var colorHex: String? = nil
    var link: URL? = nil
}

struct GalleryImage: Hashable {
    let url: URL
    let caption: String?
}

enum VideoProvider {
    case youtube
    case dailymotion
    case other
}
