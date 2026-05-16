import Foundation
import SwiftUI

// MARK: - Shared Formatters

enum SabqFormatters {
    /// Arabic locale that ALWAYS uses Latin digits (1234) instead of the
    /// default Eastern Arabic digits (١٢٣٤). The numbering-system override
    /// is a BCP-47 Unicode extension — `nu-latn` forces the formatter
    /// regardless of the device's locale preferences. Per user request
    /// 2026-05-16: notifications + history list must read "4545" not
    /// "٤٥٤٥" because the editorial team standardised on Latin digits
    /// across web + email + dashboard.
    private static let arabicLatinDigits = Locale(identifier: "ar-u-nu-latn")
    private static let saudiArabicLatinDigits = Locale(identifier: "ar_SA-u-nu-latn")

    static let arabicDate: DateFormatter = {
        let f = DateFormatter()
        f.locale = arabicLatinDigits
        f.dateFormat = "d MMMM yyyy"
        return f
    }()

    static let relativeArabic: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.locale = arabicLatinDigits
        f.unitsStyle = .short
        return f
    }()

    static let iso8601Fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static let iso8601Basic: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static let riyadhTime: DateFormatter = {
        let f = DateFormatter()
        f.locale = saudiArabicLatinDigits
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = "HH:mm"
        return f
    }()

    static let arabicFullDate: DateFormatter = {
        let f = DateFormatter()
        f.locale = saudiArabicLatinDigits
        f.dateFormat = "EEEE d MMMM yyyy"
        return f
    }()

    static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func parseISO8601(_ string: String) -> Date? {
        iso8601Fractional.date(from: string) ?? iso8601Basic.date(from: string)
    }
}

// MARK: - App Tab

enum AppTab: String, CaseIterable, Identifiable {
    case home
    case explore
    case bookmarks
    case profile

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home:      "الرئيسية"
        case .explore:   "استكشف"
        case .bookmarks: "محفوظاتي"
        case .profile:   "حسابي"
        }
    }

    var systemImage: String {
        switch self {
        case .home:      "house"
        case .explore:   "sparkle.magnifyingglass"
        case .bookmarks: "bookmark"
        case .profile:   "person.crop.circle"
        }
    }

    var selectedImage: String {
        switch self {
        case .home:      "house.fill"
        case .explore:   "sparkle.magnifyingglass"
        case .bookmarks: "bookmark.fill"
        case .profile:   "person.crop.circle.fill"
        }
    }
}

struct OpinionsRoute: Hashable {}

struct KeywordRoute: Hashable {
    let keyword: String
}

struct SearchRoute: Hashable {}

struct TrendingRoute: Hashable {}

struct AuthorRoute: Hashable {
    let name: String
}

struct LiveCoverageRoute: Hashable {}
/// "لحظة بلحظة" — published-articles live feed (mirrors web's
/// `/moment-by-moment`). Distinct from `LiveCoverageRoute` which targets the
/// live-events table.
struct MomentByMomentRoute: Hashable {}

// MARK: - Article Category

enum ArticleCategory: String, CaseIterable, Identifiable {
    case saudi = "محليات"
    case regions = "مناطق"
    case culture = "ثقافة"
    case community = "مجتمع"
    case sports = "رياضة"
    case tourism = "سياحة"
    case technology = "تقنية"
    case business = "أعمال"
    case life = "حياتنا"
    case cars = "سيارات"
    case stations = "محطات"
    case world = "العالم"

    var id: String { rawValue }

    var title: String { rawValue }

    var subtitle: String {
        switch self {
        case .saudi:      "أخبار المملكة والمدن الرئيسية"
        case .regions:    "تغطيات من مختلف مناطق المملكة"
        case .culture:    "فنون وتراث وأدب ومشهد ثقافي"
        case .community:  "مجتمع وتعليم وقضايا يومية"
        case .sports:     "رياضة محلية وعالمية"
        case .tourism:    "وجهات وفعاليات وسفر"
        case .technology: "تقنية وابتكار ورقمنة"
        case .business:   "اقتصاد وأسواق وأعمال"
        case .life:       "نمط حياة وصحة وعائلة"
        case .cars:       "سيارات وطرق ومواصلات"
        case .stations:   "محطات وقصص وملفات"
        case .world:      "أخبار عربية ودولية"
        }
    }

    var icon: String {
        switch self {
        case .saudi:      "building.2.fill"
        case .regions:    "map.fill"
        case .culture:    "theatermasks.fill"
        case .community:  "person.3.fill"
        case .sports:     "sportscourt.fill"
        case .tourism:    "airplane.departure"
        case .technology: "cpu.fill"
        case .business:   "briefcase.fill"
        case .life:       "heart.fill"
        case .cars:       "car.fill"
        case .stations:   "signpost.right.fill"
        case .world:      "globe.americas.fill"
        }
    }

    nonisolated var slug: String {
        switch self {
        case .saudi:      "saudi"
        case .regions:    "regions"
        case .culture:    "culture"
        case .community:  "community"
        case .sports:     "sports"
        case .tourism:    "tourism"
        case .technology: "technology"
        case .business:   "business"
        case .life:       "life"
        case .cars:       "cars"
        case .stations:   "stations"
        case .world:      "world"
        }
    }

    var tint: Color {
        switch self {
        case .saudi:      Self.color(hex: "3498db")
        case .regions:    Self.color(hex: "84cc16")
        case .culture:    Self.color(hex: "d946ef")
        case .community:  Self.color(hex: "f97316")
        case .sports:     Self.color(hex: "2ecc71")
        case .tourism:    Self.color(hex: "14b8a6")
        case .technology: Self.color(hex: "6366f1")
        case .business:   Self.color(hex: "ca8a04")
        case .life:       Self.color(hex: "F472B6")
        case .cars:       Self.color(hex: "0EA5E9")
        case .stations:   Self.color(hex: "FBBF24")
        case .world:      Self.color(hex: "e74c3c")
        }
    }

    nonisolated init(fromSection name: String?) {
        let trimmed = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if let match = ArticleCategory(rawValue: trimmed) {
            self = match
            return
        }
        let lower = trimmed.lowercased()
        if let bySlug = ArticleCategory.allCases.first(where: { $0.slug == lower }) {
            self = bySlug
            return
        }
        self = .saudi
    }

    private static func color(hex: String) -> Color {
        let s = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        guard Scanner(string: s).scanHexInt64(&value), s.count == 6 else {
            return SabqTheme.primaryEnd
        }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        return Color(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}

// MARK: - App Accent

enum AppAccent: String, CaseIterable, Identifiable {
    case blue
    case teal
    case purple
    case rose
    case orange

    var id: String { rawValue }

    var title: String {
        switch self {
        case .blue:   "أزرق"
        case .teal:   "فيروزي"
        case .purple: "بنفسجي"
        case .rose:   "وردي"
        case .orange: "برتقالي"
        }
    }

    var color: Color {
        switch self {
        case .blue:   Color(red: 0.36, green: 0.74, blue: 0.91)
        case .teal:   Color(red: 0.16, green: 0.65, blue: 0.55)
        case .purple: Color(red: 0.55, green: 0.35, blue: 0.85)
        case .rose:   Color(red: 0.88, green: 0.34, blue: 0.46)
        case .orange: Color(red: 0.95, green: 0.55, blue: 0.20)
        }
    }

    var darkColor: Color {
        switch self {
        case .blue:   Color(red: 0.45, green: 0.80, blue: 0.96)
        case .teal:   Color(red: 0.25, green: 0.78, blue: 0.65)
        case .purple: Color(red: 0.68, green: 0.50, blue: 0.95)
        case .rose:   Color(red: 0.95, green: 0.48, blue: 0.58)
        case .orange: Color(red: 1.0, green: 0.65, blue: 0.30)
        }
    }

    static var current: AppAccent {
        AppAccent(rawValue: UserDefaults.standard.string(forKey: "appAccent") ?? "blue") ?? .blue
    }
}

// MARK: - Article

struct Article: Identifiable, Equatable, Hashable {
    let id: String
    let title: String
    let excerpt: String
    /// Dashboard-generated AI summary surfaced as "الموجز الذكي" in the
    /// article detail card. Empty when the article hasn't been AI-processed
    /// yet — the card then falls back to `excerpt` (matching the web).
    let aiSummary: String
    /// Plain-text fallback used for share sheets, list rows, accessibility.
    let body: String
    /// Raw HTML body when the API returns one (article detail). Empty for
    /// list-payload articles. ArticleHtmlParser consumes this — never `body`.
    let bodyHTML: String
    let category: ArticleCategory
    let author: String
    let publishDate: Date
    let isBreaking: Bool
    let isFeatured: Bool
    var tags: [String]
    let imageURL: String?
    let slug: String?
    let articleURL: String?

    var readingMinutes: Int {
        max(1, body.count / 800)
    }

    var readingTime: String {
        "\(readingMinutes) دقائق قراءة"
    }

    var dateFormatted: String {
        SabqFormatters.arabicDate.string(from: publishDate)
    }

    var relativeDate: String {
        SabqFormatters.relativeArabic.localizedString(for: publishDate, relativeTo: Date())
    }

    /// Minimal Article shell used by deep-link navigation when only the
    /// slug is known. `ArticleDetailView`'s loader replaces the
    /// placeholder fields with real values once the slug-based fetch
    /// completes — the placeholder just keeps the navigation type-safe.
    static func placeholder(slug: String) -> Article {
        Article(
            id: slug,
            title: "",
            excerpt: "",
            aiSummary: "",
            body: "",
            bodyHTML: "",
            category: .saudi,
            author: "",
            publishDate: Date(),
            isBreaking: false,
            isFeatured: false,
            tags: [],
            imageURL: nil,
            slug: slug,
            articleURL: nil
        )
    }

    static func == (lhs: Article, rhs: Article) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    nonisolated static func from(_ api: APIArticle) -> Article {
        let body = Self.stripHTMLTags(from: api.fullText)
        // Preserve raw HTML for the rich renderer. List payloads return a
        // short excerpt without HTML; detail payloads carry the full body
        // with TipTap markup (paragraphs, bold, blockquotes, galleries, …).
        let bodyHTML = api.fullText
        let excerpt = Self.resolveExcerpt(excerpt: api.excerpt, summary: api.summary, subtitle: api.subtitle, body: body)
        let aiSummary = (api.aiSummary ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let slug = api.slug.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.flatMap { $0.isEmpty ? nil : $0 }
        let sharePath = api.englishSlug?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty ?? slug
        let articleURL = sharePath.map { "https://sabq.org/article/\($0)" }

        return Article(
            id: api.id,
            title: api.title,
            excerpt: excerpt,
            aiSummary: aiSummary,
            body: body.isEmpty ? excerpt : body,
            bodyHTML: bodyHTML,
            category: ArticleCategory(fromSection: api.categoryName),
            author: api.authorName.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.flatMap { $0.isEmpty ? nil : $0 } ?? "سبق",
            publishDate: Self.parsePublishedAt(api.publishedAt),
            isBreaking: api.newsType == "breaking",
            isFeatured: api.isFeatured ?? false,
            tags: api.keywords ?? [],
            imageURL: api.imageUrl,
            slug: slug,
            articleURL: articleURL
        )
    }

    nonisolated fileprivate static func parsePublishedAt(_ string: String) -> Date {
        SabqFormatters.parseISO8601(string) ?? Date()
    }

    nonisolated fileprivate static func stripHTMLTags(from html: String) -> String {
        var text = html
        text = text.replacingOccurrences(of: "<p[^>]*>", with: "\n\n", options: .regularExpression)
        text = text.replacingOccurrences(of: "</p>", with: "\n\n", options: .caseInsensitive)
        text = text.replacingOccurrences(of: "<br\\s*/?>", with: "\n", options: .regularExpression)
        text = text.replacingOccurrences(of: "</div>", with: "\n\n", options: .caseInsensitive)
        text = text.replacingOccurrences(of: "</li>", with: "\n", options: .caseInsensitive)
        text = text.replacingOccurrences(of: "</h[1-6]>", with: "\n\n", options: .regularExpression)
        text = text.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        text = text.replacingOccurrences(of: "&nbsp;", with: " ")
        text = text.replacingOccurrences(of: "&amp;", with: "&")
        text = text.replacingOccurrences(of: "&lt;", with: "<")
        text = text.replacingOccurrences(of: "&gt;", with: ">")
        text = text.replacingOccurrences(of: "&quot;", with: "\"")
        text = text.replacingOccurrences(of: "&#39;", with: "'")
        text = text.replacingOccurrences(of: #"[^\S\n]+"#, with: " ", options: .regularExpression)
        text = text.replacingOccurrences(of: #"\n[ \t]+"#, with: "\n", options: .regularExpression)
        text = text.replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Paragraphs for article body UI. Normalizes CMS/API plain text (no space after `.` / `؟` before the next word) so layout matches the web.
    nonisolated static func displayParagraphs(for body: String) -> [String] {
        let trimmed = normalizeEditorialPlainText(body).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        let normalized = trimmed
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")

        var chunks = normalized
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        if chunks.count <= 1 {
            chunks = normalized
                .components(separatedBy: "\n")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        }

        return chunks.isEmpty ? [trimmed] : chunks
    }

    /// Sabq API often returns one continuous string where sentence breaks are glued (e.g. `القطاع.وفي`, `4».وقالت`). The site renders these as new blocks; we insert paragraph breaks the same way.
    private static let editorialRegexRules: [(regex: NSRegularExpression, template: String)] = {
        let patterns: [(String, String)] = [
            (#"([.!?؟])([\u0600-\u06FF]{2,})"#, "$1\n\n$2"),
            (#"(»)([\u0600-\u06FF]{2,})"#, "$1\n\n$2"),
            (#"([.!?؟])([A-Za-z]{2,})"#, "$1\n\n$2"),
        ]
        return patterns.compactMap { pattern, template in
            guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { return nil }
            return (regex, template)
        }
    }()

    nonisolated private static func normalizeEditorialPlainText(_ text: String) -> String {
        var result = text
        for (regex, template) in editorialRegexRules {
            let range = NSRange(result.startIndex..., in: result)
            result = regex.stringByReplacingMatches(in: result, options: [], range: range, withTemplate: template)
        }
        while result.contains("\n\n\n") {
            result = result.replacingOccurrences(of: "\n\n\n", with: "\n\n")
        }
        return result
    }

    nonisolated fileprivate static func resolveExcerpt(excerpt: String?, summary: String?, subtitle: String? = nil, body: String) -> String {
        if let e = excerpt?.trimmingCharacters(in: .whitespacesAndNewlines), !e.isEmpty {
            return e
        }
        if let s = summary?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty {
            return s
        }
        if let sub = subtitle?.trimmingCharacters(in: .whitespacesAndNewlines), !sub.isEmpty {
            return sub
        }
        if body.isEmpty { return "" }
        let prefix = String(body.prefix(200))
        if prefix.count < body.count {
            return prefix + "…"
        }
        return prefix
    }

}

struct OpinionArticle: Identifiable, Equatable, Hashable {
    let id: String
    let title: String
    let excerpt: String
    let body: String
    let authorName: String
    let authorImageURL: String?
    let authorGender: String?
    let publishDate: Date
    let tags: [String]
    let imageURL: String?
    let slug: String?
    let articleURL: String?

    var readingMinutes: Int {
        max(1, body.count / 800)
    }

    var readingTime: String {
        "\(readingMinutes) دقائق قراءة"
    }

    var dateFormatted: String {
        SabqFormatters.arabicDate.string(from: publishDate)
    }

    var relativeDate: String {
        SabqFormatters.relativeArabic.localizedString(for: publishDate, relativeTo: Date())
    }

    /// Gendered byline label. Returns "الكاتبة" for female authors, "الكاتب"
    /// for male, and the neutral "بقلم" when gender is unknown. The backend
    /// reads `users.gender` (`"male" | "female"`).
    var bylineLabel: String {
        switch authorGender?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "female", "f", "أنثى": return "الكاتبة"
        case "male", "m", "ذكر": return "الكاتب"
        default: return "بقلم"
        }
    }

    nonisolated static func from(_ api: APIOpinion) -> OpinionArticle {
        let body = Article.stripHTMLTags(from: api.fullText)
        let excerpt = Article.resolveExcerpt(
            excerpt: api.excerpt,
            summary: api.summary,
            subtitle: api.subtitle,
            body: body
        )
        let slug = api.slug?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty
        let sharePath = api.englishSlug?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty ?? slug
        let articleURL = sharePath.map { "https://sabq.org/opinion/\($0)" }

        return OpinionArticle(
            id: api.id,
            title: api.title,
            excerpt: excerpt,
            body: body.isEmpty ? excerpt : body,
            authorName: api.authorName?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .nilIfEmpty ?? "كاتب الرأي",
            authorImageURL: api.authorImage,
            authorGender: api.authorGender,
            publishDate: Article.parsePublishedAt(api.publishedAt ?? ""),
            tags: api.tags
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty },
            imageURL: api.imageUrl,
            slug: slug,
            articleURL: articleURL
        )
    }

    nonisolated static func from(_ api: APIArticle) -> OpinionArticle {
        let body = Article.stripHTMLTags(from: api.fullText)
        let excerpt = Article.resolveExcerpt(
            excerpt: api.excerpt,
            summary: api.summary,
            subtitle: api.subtitle,
            body: body
        )
        let slug = api.slug?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty
        let sharePath = api.englishSlug?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty ?? slug
        let articleURL = sharePath.map { "https://sabq.org/article/\($0)" }

        return OpinionArticle(
            id: api.id,
            title: api.title,
            excerpt: excerpt,
            body: body.isEmpty ? excerpt : body,
            authorName: api.authorName?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .nilIfEmpty ?? "كاتب الرأي",
            authorImageURL: nil,
            authorGender: nil,
            publishDate: Article.parsePublishedAt(api.publishedAt),
            tags: (api.keywords ?? [])
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty },
            imageURL: api.imageUrl,
            slug: slug,
            articleURL: articleURL
        )
    }
}

private extension String {
    nonisolated var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
