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

nonisolated enum ArticleBlock {
    case heading(level: Int, runs: [InlineRun])
    case paragraph(runs: [InlineRun])
    case list(ordered: Bool, items: [[InlineRun]])
    // attribution: القائل («— فلان، صفته») عندما يُفصل عن نص المقولة
    case blockquote(runs: [InlineRun], attribution: [InlineRun]?)
    /// layout: عرض ومحاذاة الصورة كما ضبطها المحرر (`data-width`/`data-align`).
    case image(url: URL, alt: String?, caption: String?, layout: ImageLayout)
    case imageGallery(images: [GalleryImage])
    case twitterEmbed(tweetURL: URL)
    case videoEmbed(provider: VideoProvider, embedURL: URL, sourceURL: URL?)
    /// زر تواصل واتساب من المحرر: `<div data-whatsapp-cta data-phone …>`
    case whatsappCta(phone: String, phrase: String, url: URL)
    /// جدول من المحرر (`<table class="sabq-table">`). header: صف الرؤوس
    /// (<th>) إن وُجد؛ rows: بقية الصفوف؛ cardStyle: مظهر «بطاقة» للعمودين.
    case table(header: [[InlineRun]]?, rows: [[[InlineRun]]], cardStyle: Bool)
    case divider
}

/// محاذاة صورة المحرر — القيم الثلاث التي يكتبها TipTap في `data-align`.
nonisolated enum ImageAlign: String, Hashable {
    case center, right, left
}

/// تخطيط صورة داخل جسم المقال: نسبة العرض من عمود القراءة والمحاذاة.
/// الويب يعوّم الصورة (float) ويلفّ النص حولها؛ في SwiftUI نكتفي بالعرض
/// الجزئي والمحاذاة إلى الجهة نفسها بلا التفاف — يطابق سلوك الويب على
/// الشاشات الضيقة أصلًا (نقل تعديل الويب #1512).
nonisolated struct ImageLayout: Hashable {
    /// نسبة العرض (0.2–1). nil = عرض العمود الكامل.
    var widthFraction: CGFloat? = nil
    var align: ImageAlign = .center

    static let full = ImageLayout()

    /// عرض العمود الاسمي في الويب — تُنسب إليه قيم `px`.
    static let nominalColumnWidth: CGFloat = 760

    static func parse(width: String?, align: String?) -> ImageLayout {
        var layout = ImageLayout()
        if let raw = width?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !raw.isEmpty {
            if raw.hasSuffix("%"), let v = Double(raw.dropLast()) {
                layout.widthFraction = CGFloat(v / 100)
            } else if raw.hasSuffix("px"), let v = Double(raw.dropLast(2)) {
                layout.widthFraction = CGFloat(v) / nominalColumnWidth
            } else if let v = Double(raw) {
                layout.widthFraction = v <= 1 ? CGFloat(v) : CGFloat(v) / nominalColumnWidth
            }
            if let f = layout.widthFraction {
                layout.widthFraction = f >= 0.98 ? nil : max(0.2, f)
            }
        }
        if let a = align?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
           let parsed = ImageAlign(rawValue: a) {
            layout.align = parsed
        }
        return layout
    }
}

nonisolated struct InlineRun: Hashable {
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

nonisolated struct GalleryImage: Hashable {
    let url: URL
    let caption: String?
}

nonisolated enum VideoProvider {
    case youtube
    case dailymotion
    case other
}
