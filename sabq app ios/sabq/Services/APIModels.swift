import Foundation

// MARK: - Flexible Coding Keys

nonisolated struct FlexKey: CodingKey, Sendable {
    var stringValue: String
    var intValue: Int?
    init(_ string: String) { stringValue = string; intValue = nil }
    init?(stringValue: String) { self.stringValue = stringValue; intValue = nil }
    init?(intValue: Int) { stringValue = "\(intValue)"; self.intValue = intValue }
}

// MARK: - API Article

/// One photo inside a `weekly_photos` article — image + Arabic caption +
/// photographer/source credit. Backend lives at
/// `articles.weeklyPhotosData.photos`. Decoder is permissive so missing
/// caption/credit values still yield a renderable struct.
nonisolated struct APIMediaAsset: Decodable, Identifiable, Hashable {
    let url: String
    let altText: String
    let displayOrder: Int

    var id: String { "\(url)-\(displayOrder)" }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        url = (try? c.decode(String.self, forKey: FlexKey("url"))) ?? ""
        altText = (try? c.decode(String.self, forKey: FlexKey("altText")))
            ?? (try? c.decode(String.self, forKey: FlexKey("alt_text")))
            ?? ""
        displayOrder = (try? c.decode(Int.self, forKey: FlexKey("displayOrder")))
            ?? (try? c.decode(Int.self, forKey: FlexKey("display_order")))
            ?? 0
    }
}

nonisolated struct APIWeeklyPhoto: Decodable, Identifiable, Hashable {
    let imageUrl: String
    let caption: String
    let credit: String

    var id: String { imageUrl }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        let raw = (try? c.decode(String.self, forKey: FlexKey("imageUrl")))
            ?? (try? c.decode(String.self, forKey: FlexKey("image_url")))
            ?? (try? c.decode(String.self, forKey: FlexKey("image")))
            ?? ""
        if raw.hasPrefix("http") {
            imageUrl = raw
        } else if raw.isEmpty {
            imageUrl = ""
        } else {
            imageUrl = "https://sabq.org" + raw
        }
        caption = ((try? c.decode(String.self, forKey: FlexKey("caption"))) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        credit = ((try? c.decode(String.self, forKey: FlexKey("credit"))) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

nonisolated struct APIArticle: Decodable {
    let id: String
    let title: String
    let fullText: String
    let excerpt: String?
    let summary: String?
    /// Dashboard-generated AI summary. Distinct from `excerpt` (the editorial
    /// teaser): this is what the web `ArticleDetail` shows in the AI summary
    /// card. iOS prefers it for the "الموجز الذكي" card; fall back to
    /// `excerpt` when it isn't set.
    let aiSummary: String?
    let subtitle: String?
    let slug: String?
    let englishSlug: String?
    let categoryName: String?
    let categorySlug: String?
    let authorName: String?
    let publishedAt: String
    let articleType: String?
    let newsType: String?
    let isFeatured: Bool?
    var keywords: [String]?
    let imageUrl: String?
    /// Editorial focal point shipped by the backend as
    /// `image_focal_point: { x, y }` (percentages 0–100 from top-left).
    /// Mirrors the web's `imageFocalPoint` field — drives
    /// `FocalCachedAsyncImage` so hero / card crops anchor on the
    /// dashboard-picked subject. Nil → default centre.
    let imageFocalPoint: ImageFocalPoint?
    /// True when the hero/thumbnail was produced by the dashboard's AI
    /// image generator. Drives the "مولّدة بالذكاء الاصطناعي" badge
    /// overlay on iOS hero images — matches the web convention in
    /// `client/src/components/ImageWithCaption.tsx`.
    let isAiGeneratedImage: Bool?
    let aiImageModel: String?
    let viewsCount: Int?
    let commentsCount: Int?
    /// Present on `GET /articles/{slug}`; used for related stories in article detail.
    let relatedArticles: [APIArticle]?
    /// Editorial weekly-photos packs. When `articleType == "weekly_photos"`
    /// the detail endpoint ships a `weeklyPhotosData.photos` array. iOS
    /// renders these as a numbered gallery inside the article body.
    let weeklyPhotos: [APIWeeklyPhoto]?
    let mediaAssets: [APIMediaAsset]?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)

        if let strId = try? c.decode(String.self, forKey: FlexKey("id")) {
            id = strId
        } else if let intId = try? c.decode(Int.self, forKey: FlexKey("id")) {
            id = String(intId)
        } else {
            id = UUID().uuidString
        }

        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""

        if let v = try? c.decode(String.self, forKey: FlexKey("content")), !v.isEmpty { fullText = v }
        else if let v = try? c.decode(String.self, forKey: FlexKey("body")), !v.isEmpty { fullText = v }
        else if let v = try? c.decode(String.self, forKey: FlexKey("full_text")), !v.isEmpty { fullText = v }
        else { fullText = "" }

        excerpt = try? c.decode(String.self, forKey: FlexKey("excerpt"))
        summary = (try? c.decode(String.self, forKey: FlexKey("summary")))
            ?? (try? c.decode(String.self, forKey: FlexKey("aiSummary")))
        aiSummary = (try? c.decode(String.self, forKey: FlexKey("aiSummary")))
            ?? (try? c.decode(String.self, forKey: FlexKey("ai_summary")))
        subtitle = try? c.decode(String.self, forKey: FlexKey("subtitle"))
        slug = try? c.decode(String.self, forKey: FlexKey("slug"))
        englishSlug = (try? c.decode(String.self, forKey: FlexKey("englishSlug")))
            ?? (try? c.decode(String.self, forKey: FlexKey("english_slug")))

        if let cat = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey("category")) {
            categoryName = (try? cat.decode(String.self, forKey: FlexKey("nameAr")))
                ?? (try? cat.decode(String.self, forKey: FlexKey("name")))
            categorySlug = try? cat.decode(String.self, forKey: FlexKey("slug"))
        } else {
            categoryName = (try? c.decode(String.self, forKey: FlexKey("category_name")))
                ?? (try? c.decode(String.self, forKey: FlexKey("section")))
            categorySlug = (try? c.decode(String.self, forKey: FlexKey("category_slug")))
                ?? (try? c.decode(String.self, forKey: FlexKey("section_slug")))
        }

        if let auth = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey("author")) {
            let first = (try? auth.decode(String.self, forKey: FlexKey("firstName"))) ?? ""
            let last = (try? auth.decode(String.self, forKey: FlexKey("lastName"))) ?? ""
            let combined = "\(first) \(last)".trimmingCharacters(in: .whitespaces)
            authorName = combined.isEmpty
                ? (try? auth.decode(String.self, forKey: FlexKey("name")))
                : combined
        } else {
            authorName = (try? c.decode(String.self, forKey: FlexKey("author_name")))
                ?? (try? c.decode(String.self, forKey: FlexKey("author")))
        }

        if let v = try? c.decode(String.self, forKey: FlexKey("publishedAt")) { publishedAt = v }
        else if let v = try? c.decode(String.self, forKey: FlexKey("published_at")) { publishedAt = v }
        else if let v = try? c.decode(String.self, forKey: FlexKey("createdAt")) { publishedAt = v }
        else { publishedAt = "" }

        if let v = try? c.decode(String.self, forKey: FlexKey("articleType")) { articleType = v }
        else { articleType = try? c.decode(String.self, forKey: FlexKey("article_type")) }

        if let v = try? c.decode(String.self, forKey: FlexKey("newsType")) { newsType = v }
        else if let v = try? c.decode(String.self, forKey: FlexKey("news_type")) { newsType = v }
        else if let v = try? c.decode(Bool.self, forKey: FlexKey("is_breaking")), v { newsType = "breaking" }
        else { newsType = try? c.decode(String.self, forKey: FlexKey("type")) }

        if let v = try? c.decode(Bool.self, forKey: FlexKey("isFeatured")) { isFeatured = v }
        else if let v = try? c.decode(Bool.self, forKey: FlexKey("is_featured")) { isFeatured = v }
        else { isFeatured = try? c.decode(Bool.self, forKey: FlexKey("featured")) }

        do {
            var resolvedKeywords: [String]?
            if let seo = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey("seo")) {
                resolvedKeywords = (try? seo.decode([String].self, forKey: FlexKey("keywords")))
                    ?? (try? seo.decode([String].self, forKey: FlexKey("tags")))
                if resolvedKeywords == nil, let csv = try? seo.decode(String.self, forKey: FlexKey("keywords")), !csv.isEmpty {
                    resolvedKeywords = csv.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                }
            }
            if resolvedKeywords == nil || resolvedKeywords?.isEmpty == true {
                if let tagObjs = try? c.decode([APITag].self, forKey: FlexKey("tags")) {
                    let names = tagObjs.map(\.name).filter { !$0.isEmpty }
                    if !names.isEmpty { resolvedKeywords = names }
                }
            }
            if resolvedKeywords == nil || resolvedKeywords?.isEmpty == true {
                resolvedKeywords = (try? c.decode([String].self, forKey: FlexKey("tags")))
                    ?? (try? c.decode([String].self, forKey: FlexKey("keywords")))
            }
            keywords = resolvedKeywords
        }

        var rawImage: String?
        if let v = try? c.decode(String.self, forKey: FlexKey("imageUrl")) { rawImage = v }
        else if let v = try? c.decode(String.self, forKey: FlexKey("image_url")) { rawImage = v }
        else if let v = try? c.decode(String.self, forKey: FlexKey("image")) { rawImage = v }
        else if let v = try? c.decode(String.self, forKey: FlexKey("thumbnailUrl")) { rawImage = v }

        if let raw = rawImage {
            if raw.hasPrefix("http") {
                imageUrl = raw
            } else {
                imageUrl = "https://sabq.org" + raw
            }
        } else {
            imageUrl = nil
        }

        imageFocalPoint = Self.decodeFocalPoint(in: c)

        isAiGeneratedImage = (try? c.decode(Bool.self, forKey: FlexKey("is_ai_generated_image")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("isAiGeneratedImage")))
        aiImageModel = (try? c.decode(String.self, forKey: FlexKey("ai_image_model")))
            ?? (try? c.decode(String.self, forKey: FlexKey("aiImageModel")))

        viewsCount = (try? c.decode(Int.self, forKey: FlexKey("views")))
            ?? (try? c.decode(Int.self, forKey: FlexKey("views_count")))
        commentsCount = try? c.decode(Int.self, forKey: FlexKey("comments_count"))

        relatedArticles = try? c.decode([APIArticle].self, forKey: FlexKey("related_articles"))

        // weeklyPhotosData → { photos: [{ imageUrl, caption, credit }, ...] }
        // Surfaced for `articleType == "weekly_photos"` posts so the iOS
        // article detail view can render the numbered gallery instead of
        // showing only the intro paragraph.
        if let wpContainer = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey("weeklyPhotosData")) {
            weeklyPhotos = try? wpContainer.decode([APIWeeklyPhoto].self, forKey: FlexKey("photos"))
        } else if let wpContainer = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey("weekly_photos_data")) {
            weeklyPhotos = try? wpContainer.decode([APIWeeklyPhoto].self, forKey: FlexKey("photos"))
        } else {
            weeklyPhotos = nil
        }

        mediaAssets = try? c.decode([APIMediaAsset].self, forKey: FlexKey("mediaAssets"))
    }

    func withKeywords(_ newKeywords: [String]) -> APIArticle {
        var copy = self
        copy.keywords = newKeywords
        return copy
    }

    /// Pulls `image_focal_point` / `imageFocalPoint` out of the API
    /// envelope. The backend writes a `{x, y}` JSONB blob — most rows
    /// carry 0–100 percentages, but a tail of legacy / auto-detected
    /// rows ship 0–1 floats. The smart `ImageFocalPoint(raw:)`
    /// initializer auto-detects which encoding it received, mirroring
    /// Android's `ImageFocalPoint.normalised()`. Without it iOS used
    /// to treat 0–1 floats as percentages, producing focal points near
    /// the top-left corner instead of the editor-picked subject.
    /// Numeric, string, and integer encodings are all tolerated since
    /// the column is jsonb.
    static func decodeFocalPoint(in c: KeyedDecodingContainer<FlexKey>) -> ImageFocalPoint? {
        for key in ["imageFocalPoint", "image_focal_point", "focalPoint", "focal_point"] {
            if let nested = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey(key)) {
                let x = decodeFocalAxis(nested, key: "x")
                let y = decodeFocalAxis(nested, key: "y")
                if let fp = ImageFocalPoint(rawX: x, rawY: y) { return fp }
            }
        }
        return nil
    }

    private static func decodeFocalAxis(_ c: KeyedDecodingContainer<FlexKey>, key: String) -> Double? {
        let k = FlexKey(key)
        if let v = try? c.decode(Double.self, forKey: k) { return v }
        if let v = try? c.decode(Int.self, forKey: k) { return Double(v) }
        if let s = try? c.decode(String.self, forKey: k) {
            return Double(s.trimmingCharacters(in: .whitespaces))
        }
        return nil
    }

    var isOpinionContent: Bool {
        [articleType, newsType, categorySlug, categoryName]
            .compactMap { $0 }
            .contains(where: Self.matchesOpinionMarker)
    }

    private static func matchesOpinionMarker(_ value: String) -> Bool {
        let normalized = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "-", with: "_")
            .replacingOccurrences(of: " ", with: "_")
        let exactMatches: Set<String> = [
            "opinion",
            "opinions",
            "op_ed",
            "column",
            "columns",
            "الرأي",
            "راي",
            "مقالات_الرأي",
            "كتاب_الرأي"
        ]
        if exactMatches.contains(normalized) {
            return true
        }
        return normalized.contains("opinion")
            || normalized.contains("الرأي")
            || normalized.contains("مقالات_الرأي")
            || normalized.contains("كتاب_الرأي")
    }
}

// MARK: - API Tag

nonisolated struct APITag: Decodable {
    let id: Int?
    let name: String
    let slug: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = try? c.decode(Int.self, forKey: FlexKey("id"))
        name = (try? c.decode(String.self, forKey: FlexKey("name"))) ?? ""
        slug = try? c.decode(String.self, forKey: FlexKey("slug"))
    }
}

// MARK: - API Category

nonisolated struct APICategory: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let slug: String?
    let description: String?
    let articlesCount: Int?
    let icon: String?
    let color: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        if let strId = try? c.decode(String.self, forKey: FlexKey("id")) {
            id = strId
        } else if let intId = try? c.decode(Int.self, forKey: FlexKey("id")) {
            id = String(intId)
        } else {
            id = UUID().uuidString
        }
        name = (try? c.decode(String.self, forKey: FlexKey("nameAr")))
            ?? (try? c.decode(String.self, forKey: FlexKey("name")))
            ?? ""
        slug = try? c.decode(String.self, forKey: FlexKey("slug"))
        description = try? c.decode(String.self, forKey: FlexKey("description"))
        articlesCount = (try? c.decode(Int.self, forKey: FlexKey("articles_count")))
            ?? (try? c.decode(Int.self, forKey: FlexKey("count")))
        icon = try? c.decode(String.self, forKey: FlexKey("icon"))
        color = try? c.decode(String.self, forKey: FlexKey("color"))
    }
}

// MARK: - Homepage Response

/// استجابة `/api/cache-invalidation/check` — طابع زمني يتغيّر عند كل نشر/إبطال.
/// العميل يستطلعها بدل جلب الرئيسية كاملة كل دورة.
nonisolated struct APICacheInvalidationCheck: Decodable {
    let lastUpdate: Double

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        if let d = try? c.decode(Double.self, forKey: FlexKey("lastUpdate")) {
            lastUpdate = d
        } else if let i = try? c.decode(Int.self, forKey: FlexKey("lastUpdate")) {
            lastUpdate = Double(i)
        } else if let s = try? c.decode(String.self, forKey: FlexKey("lastUpdate")),
                  let d = Double(s) {
            lastUpdate = d
        } else {
            lastUpdate = 0
        }
    }
}

nonisolated struct APIHomepageResponse: Decodable {
    let hero: [APIArticle]
    let forYou: [APIArticle]
    let breaking: [APIArticle]
    let editorPicks: [APIArticle]
    let trending: [APITrendingItem]
    let categories: [APICategory]?
    let stories: [APIStory]?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        hero = (try? c.decode([APIArticle].self, forKey: FlexKey("hero"))) ?? []
        forYou = (try? c.decode([APIArticle].self, forKey: FlexKey("forYou")))
            ?? (try? c.decode([APIArticle].self, forKey: FlexKey("latest")))
            ?? (try? c.decode([APIArticle].self, forKey: FlexKey("articles")))
            ?? []
        breaking = (try? c.decode([APIArticle].self, forKey: FlexKey("breaking"))) ?? []
        editorPicks = (try? c.decode([APIArticle].self, forKey: FlexKey("editorPicks")))
            ?? (try? c.decode([APIArticle].self, forKey: FlexKey("featured")))
            ?? []
        trending = (try? c.decode([APITrendingItem].self, forKey: FlexKey("trending"))) ?? []
        categories = try? c.decode([APICategory].self, forKey: FlexKey("categories"))
        stories = try? c.decode([APIStory].self, forKey: FlexKey("stories"))
    }
}

// MARK: - Trending Item

nonisolated struct APITrendingItem: Decodable {
    let topic: String
    let views: Int?
    let count: Int?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        topic = (try? c.decode(String.self, forKey: FlexKey("topic")))
            ?? (try? c.decode(String.self, forKey: FlexKey("keyword")))
            ?? (try? c.decode(String.self, forKey: FlexKey("name")))
            ?? ""
        views = try? c.decode(Int.self, forKey: FlexKey("views"))
        count = try? c.decode(Int.self, forKey: FlexKey("count"))
    }
}

// MARK: - Breaking Ticker
//
// Mirrors the dashboard-managed "شريط الأخبار العاجلة" served by
// `GET /api/breaking-ticker/active` (server/storage.ts → getActiveBreakingTicker).
// The payload is `{ topic: {...}, headlines: [...] }` with camelCase keys, or a
// bare `null` when no topic is active. Earlier this model targeted the wrong
// endpoint (`/api/v1/breaking`, which returns breaking-type *articles*) and a
// flat shape that never matched, so the ticker never rendered on iOS.

nonisolated struct APIBreakingTicker: Decodable {
    let topic: APIBreakingTopic?
    let headlines: [APIBreakingHeadline]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        topic = try? c.decode(APIBreakingTopic.self, forKey: FlexKey("topic"))
        headlines = (try? c.decode([APIBreakingHeadline].self, forKey: FlexKey("headlines"))) ?? []
    }
}

nonisolated struct APIBreakingTopic: Decodable {
    let id: String
    let topicTitle: String
    let isActive: Bool

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? ""
        topicTitle = (try? c.decode(String.self, forKey: FlexKey("topicTitle")))
            ?? (try? c.decode(String.self, forKey: FlexKey("topic_title")))
            ?? (try? c.decode(String.self, forKey: FlexKey("title")))
            ?? ""
        isActive = (try? c.decode(Bool.self, forKey: FlexKey("isActive")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("is_active")))
            ?? false
    }
}

nonisolated struct APIBreakingHeadline: Decodable, Identifiable {
    let id: String
    let headline: String
    let linkedArticleSlug: String?
    let linkedArticleId: String?
    let externalUrl: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id")))
            ?? (try? c.decode(Int.self, forKey: FlexKey("id"))).map(String.init)
            ?? UUID().uuidString
        headline = (try? c.decode(String.self, forKey: FlexKey("headline")))
            ?? (try? c.decode(String.self, forKey: FlexKey("text")))
            ?? (try? c.decode(String.self, forKey: FlexKey("title")))
            ?? ""
        linkedArticleSlug = (try? c.decode(String.self, forKey: FlexKey("linkedArticleSlug")))
            ?? (try? c.decode(String.self, forKey: FlexKey("linked_article_slug")))
            ?? (try? c.decode(String.self, forKey: FlexKey("slug")))
        linkedArticleId = (try? c.decode(String.self, forKey: FlexKey("linkedArticleId")))
            ?? (try? c.decode(String.self, forKey: FlexKey("linked_article_id")))
        externalUrl = (try? c.decode(String.self, forKey: FlexKey("externalUrl")))
            ?? (try? c.decode(String.self, forKey: FlexKey("external_url")))
    }
}

// MARK: - Story

nonisolated struct APIStory: Decodable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let imageUrl: String?
    let articlesCount: Int?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        if let strId = try? c.decode(String.self, forKey: FlexKey("id")) {
            id = strId
        } else if let intId = try? c.decode(Int.self, forKey: FlexKey("id")) {
            id = String(intId)
        } else {
            id = UUID().uuidString
        }
        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""
        description = try? c.decode(String.self, forKey: FlexKey("description"))
        let raw = (try? c.decode(String.self, forKey: FlexKey("imageUrl")))
            ?? (try? c.decode(String.self, forKey: FlexKey("image_url")))
            ?? (try? c.decode(String.self, forKey: FlexKey("image")))
        if let raw, raw.hasPrefix("http") {
            imageUrl = raw
        } else if let raw {
            imageUrl = "https://sabq.org" + raw
        } else {
            imageUrl = nil
        }
        articlesCount = (try? c.decode(Int.self, forKey: FlexKey("articles_count")))
            ?? (try? c.decode(Int.self, forKey: FlexKey("count")))
    }
}

// MARK: - Comment

nonisolated struct APIComment: Decodable, Identifiable, Hashable {
    let id: String
    let body: String
    let userName: String?
    let userAvatar: String?
    let createdAt: String
    let likesCount: Int?
    let status: String?
    let parentId: String?
    let replies: [APIComment]

    init(
        id: String,
        body: String,
        userName: String?,
        userAvatar: String?,
        createdAt: String,
        likesCount: Int?,
        status: String?,
        parentId: String?,
        replies: [APIComment] = []
    ) {
        self.id = id
        self.body = body
        self.userName = userName
        self.userAvatar = userAvatar
        self.createdAt = createdAt
        self.likesCount = likesCount
        self.status = status
        self.parentId = parentId
        self.replies = replies
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        // Backend uses UUID strings; legacy v1 payloads may send Int.
        if let strId = try? c.decode(String.self, forKey: FlexKey("id")) {
            id = strId
        } else if let intId = try? c.decode(Int.self, forKey: FlexKey("id")) {
            id = String(intId)
        } else {
            id = UUID().uuidString
        }
        body = (try? c.decode(String.self, forKey: FlexKey("content")))
            ?? (try? c.decode(String.self, forKey: FlexKey("body")))
            ?? (try? c.decode(String.self, forKey: FlexKey("text")))
            ?? ""
        if let user = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey("user")) {
            let first = (try? user.decode(String.self, forKey: FlexKey("firstName"))) ?? ""
            let last = (try? user.decode(String.self, forKey: FlexKey("lastName"))) ?? ""
            let combined = "\(first) \(last)".trimmingCharacters(in: .whitespaces)
            userName = combined.isEmpty ? (try? user.decode(String.self, forKey: FlexKey("name"))) : combined
            userAvatar = (try? user.decode(String.self, forKey: FlexKey("avatar")))
                ?? (try? user.decode(String.self, forKey: FlexKey("profileImageUrl")))
        } else {
            userName = (try? c.decode(String.self, forKey: FlexKey("user_name")))
                ?? (try? c.decode(String.self, forKey: FlexKey("author")))
            userAvatar = try? c.decode(String.self, forKey: FlexKey("user_avatar"))
        }
        createdAt = (try? c.decode(String.self, forKey: FlexKey("createdAt")))
            ?? (try? c.decode(String.self, forKey: FlexKey("created_at")))
            ?? ""
        likesCount = try? c.decode(Int.self, forKey: FlexKey("likes_count"))
        status = (try? c.decode(String.self, forKey: FlexKey("status")))
        parentId = (try? c.decode(String.self, forKey: FlexKey("parentId")))
            ?? (try? c.decode(String.self, forKey: FlexKey("parent_id")))
        replies = (try? c.decode([APIComment].self, forKey: FlexKey("replies"))) ?? []
    }
}

// MARK: - Opinion

nonisolated struct APIOpinion: Decodable, Identifiable {
    let id: String
    let title: String
    let slug: String?
    let englishSlug: String?
    let excerpt: String?
    let summary: String?
    let subtitle: String?
    let fullText: String
    let authorName: String?
    let authorImage: String?
    let authorGender: String?
    let publishedAt: String?
    let imageUrl: String?
    let imageFocalPoint: ImageFocalPoint?
    let isAiGeneratedImage: Bool?
    let aiImageModel: String?
    let tags: [String]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        if let strId = try? c.decode(String.self, forKey: FlexKey("id")) {
            id = strId
        } else if let intId = try? c.decode(Int.self, forKey: FlexKey("id")) {
            id = String(intId)
        } else {
            id = UUID().uuidString
        }
        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""
        slug = try? c.decode(String.self, forKey: FlexKey("slug"))
        englishSlug = (try? c.decode(String.self, forKey: FlexKey("englishSlug")))
            ?? (try? c.decode(String.self, forKey: FlexKey("english_slug")))
        excerpt = try? c.decode(String.self, forKey: FlexKey("excerpt"))
        summary = (try? c.decode(String.self, forKey: FlexKey("summary")))
            ?? (try? c.decode(String.self, forKey: FlexKey("aiSummary")))
        subtitle = try? c.decode(String.self, forKey: FlexKey("subtitle"))
        if let value = try? c.decode(String.self, forKey: FlexKey("content")), !value.isEmpty {
            fullText = value
        } else if let value = try? c.decode(String.self, forKey: FlexKey("body")), !value.isEmpty {
            fullText = value
        } else if let value = try? c.decode(String.self, forKey: FlexKey("full_text")), !value.isEmpty {
            fullText = value
        } else {
            fullText = ""
        }
        if let auth = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey("author")) {
            let first = (try? auth.decode(String.self, forKey: FlexKey("firstName"))) ?? ""
            let last = (try? auth.decode(String.self, forKey: FlexKey("lastName"))) ?? ""
            let combined = "\(first) \(last)".trimmingCharacters(in: .whitespaces)
            authorName = combined.isEmpty
                ? (try? auth.decode(String.self, forKey: FlexKey("name")))
                : combined
            let rawAuthorImage = Self.decodeFirstString(
                in: auth,
                keys: ["profileImageUrl", "profile_image_url", "avatar", "avatar_url"]
            )
            authorImage = Self.absoluteMediaURL(from: rawAuthorImage)
            authorGender = Self.decodeFirstString(in: auth, keys: ["gender"])
        } else {
            authorName = try? c.decode(String.self, forKey: FlexKey("author_name"))
            let rawAuthorImage = Self.decodeFirstString(
                in: c,
                keys: ["author_image", "authorImage"]
            )
            authorImage = Self.absoluteMediaURL(from: rawAuthorImage)
            authorGender = Self.decodeFirstString(in: c, keys: ["author_gender", "authorGender"])
        }
        publishedAt = (try? c.decode(String.self, forKey: FlexKey("publishedAt")))
            ?? (try? c.decode(String.self, forKey: FlexKey("published_at")))
            ?? (try? c.decode(String.self, forKey: FlexKey("createdAt")))
            ?? (try? c.decode(String.self, forKey: FlexKey("created_at")))
        var decodedTags: [String]?
        if let seo = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey("seo")) {
            decodedTags = (try? seo.decode([String].self, forKey: FlexKey("keywords")))
                ?? (try? seo.decode([String].self, forKey: FlexKey("tags")))
            if decodedTags == nil, let csv = try? seo.decode(String.self, forKey: FlexKey("keywords")), !csv.isEmpty {
                decodedTags = csv.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            }
        }
        if decodedTags == nil || decodedTags?.isEmpty == true {
            if let tagObjs = try? c.decode([APITag].self, forKey: FlexKey("tags")) {
                let names = tagObjs.map(\.name).filter { !$0.isEmpty }
                if !names.isEmpty { decodedTags = names }
            }
        }
        if decodedTags == nil || decodedTags?.isEmpty == true {
            decodedTags = (try? c.decode([String].self, forKey: FlexKey("tags")))
                ?? (try? c.decode([String].self, forKey: FlexKey("keywords")))
        }
        tags = decodedTags ?? []
        let rawImage = Self.decodeFirstString(
            in: c,
            keys: ["imageUrl", "image_url", "image", "coverImage", "cover_image", "thumbnailUrl"]
        )
        imageUrl = Self.absoluteMediaURL(from: rawImage)
        imageFocalPoint = APIArticle.decodeFocalPoint(in: c)
        isAiGeneratedImage = (try? c.decode(Bool.self, forKey: FlexKey("is_ai_generated_image")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("isAiGeneratedImage")))
        aiImageModel = (try? c.decode(String.self, forKey: FlexKey("ai_image_model")))
            ?? (try? c.decode(String.self, forKey: FlexKey("aiImageModel")))
    }

    private static func decodeFirstString(
        in container: KeyedDecodingContainer<FlexKey>,
        keys: [String]
    ) -> String? {
        for key in keys {
            if let value = try? container.decode(String.self, forKey: FlexKey(key)),
               !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return value
            }
        }
        return nil
    }

    private static func absoluteMediaURL(from rawValue: String?) -> String? {
        guard let rawValue else { return nil }
        if rawValue.hasPrefix("http") {
            return rawValue
        }
        return "https://sabq.org\(rawValue.hasPrefix("/") ? "" : "/")\(rawValue)"
    }
}

// MARK: - Search

nonisolated struct APISearchResponse: Decodable {
    let articles: [APIArticle]
    let total: Int?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        if let results = try? c.decode([APIArticle].self, forKey: FlexKey("results")) {
            articles = results
        } else if let data = try? c.decode([APIArticle].self, forKey: FlexKey("data")) {
            articles = data
        } else if let arts = try? c.decode([APIArticle].self, forKey: FlexKey("articles")) {
            articles = arts
        } else {
            articles = []
        }
        total = (try? c.decode(Int.self, forKey: FlexKey("total")))
            ?? (try? c.decode(Int.self, forKey: FlexKey("titleMatches")))
    }
}

nonisolated struct APISearchSuggestion: Decodable {
    let text: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        text = (try? c.decode(String.self, forKey: FlexKey("text")))
            ?? (try? c.decode(String.self, forKey: FlexKey("keyword")))
            ?? (try? c.decode(String.self, forKey: FlexKey("query")))
            ?? (try? c.decode(String.self, forKey: FlexKey("name")))
            ?? (try? c.decode(String.self, forKey: FlexKey("topic")))
            ?? ""
    }
}

nonisolated struct APITrendingResponse: Decodable {
    let keywords: [String]

    init(from decoder: Decoder) throws {
        if let arr = try? decoder.singleValueContainer().decode([String].self) {
            keywords = arr
            return
        }
        if let items = try? decoder.singleValueContainer().decode([APITrendingItem].self) {
            keywords = items.map(\.topic).filter { !$0.isEmpty }
            return
        }
        let c = try decoder.container(keyedBy: FlexKey.self)
        if let data = try? c.decode([String].self, forKey: FlexKey("data")) {
            keywords = data
        } else if let kws = try? c.decode([String].self, forKey: FlexKey("keywords")) {
            keywords = kws
        } else if let items = try? c.decode([APITrendingItem].self, forKey: FlexKey("data")) {
            keywords = items.map(\.topic)
        } else {
            keywords = []
        }
    }
}

// MARK: - Auth

/// دخول بحساب سبق — البريد أو الجوال + كلمة المرور (nil يُحذف من JSON تلقائيًّا).
nonisolated struct APILoginRequest: Encodable {
    let email: String?
    let phone: String?
    let password: String
}

// دخول/تسجيل بالجوال (Twilio Verify)
nonisolated struct APIPhoneSendRequest: Encodable {
    let phone: String
}

nonisolated struct APIPhoneSendResponse: Decodable {
    let success: Bool
    let message: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        success = (try? c.decode(Bool.self, forKey: FlexKey("success"))) ?? false
        message = try? c.decode(String.self, forKey: FlexKey("message"))
    }
}

nonisolated struct APIPhoneVerifyRequest: Encodable {
    let phone: String
    let code: String
    let deviceInfo: APIDeviceInfo?
}

nonisolated struct APIAvatarUploadResponse: Decodable {
    let success: Bool?
    let imageUrl: String?
    let profileImageUrl: String?
    let user: APIUser

    /// The mobile endpoint returns `{success, message, imageUrl, user}`.
    /// Old uploads (deleted multipart legacy) returned `{user, profileImageUrl}`.
    /// Either way we want a non-nil APIUser — if the server didn't include
    /// one (older deploy), we synthesize a minimal placeholder so the
    /// uploader doesn't throw and the caller can refetch the full profile.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        success = try? c.decode(Bool.self, forKey: FlexKey("success"))
        imageUrl = try? c.decode(String.self, forKey: FlexKey("imageUrl"))
        profileImageUrl = (try? c.decode(String.self, forKey: FlexKey("profileImageUrl")))
            ?? (try? c.decode(String.self, forKey: FlexKey("profile_image_url")))
        if let decodedUser = try? c.decode(APIUser.self, forKey: FlexKey("user")) {
            user = decodedUser
        } else {
            // Empty fallback — AuthStore.uploadAvatar refetches the profile
            // afterwards so this placeholder never reaches the UI.
            user = try APIUser(from: EmptyUserDecoder().asDecoder())
        }
    }
}

/// Tiny shim used to construct an empty APIUser when the server response
/// doesn't include one. APIUser's decoder is fault-tolerant (every field
/// optional with a default), so feeding it an empty container yields a
/// placeholder with id=UUID(), no email, no roles — discarded immediately
/// by the caller, which refetches the full profile.
nonisolated private struct EmptyUserDecoder {
    func asDecoder() throws -> Decoder {
        let data = "{}".data(using: .utf8)!
        return try JSONDecoder().decode(EmptyDecoderProxy.self, from: data).decoder
    }
}

nonisolated private struct EmptyDecoderProxy: Decodable {
    let decoder: Decoder
    init(from decoder: Decoder) throws { self.decoder = decoder }
}

nonisolated struct APILoginResponse: Decodable {
    let message: String?
    let token: String?
    let user: APIUser?
    let emailSent: Bool?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        message = try? c.decode(String.self, forKey: FlexKey("message"))
        token = (try? c.decode(String.self, forKey: FlexKey("token")))
            ?? (try? c.decode(String.self, forKey: FlexKey("access_token")))
        user = (try? c.decode(APIUser.self, forKey: FlexKey("user")))
            ?? (try? c.decode(APIUser.self, forKey: FlexKey("data")))
        emailSent = try? c.decode(Bool.self, forKey: FlexKey("emailSent"))
    }
}

nonisolated struct ResendActivationResponse: Decodable {
    let success: Bool
    let message: String?
    let emailSent: Bool?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        success = (try? c.decode(Bool.self, forKey: FlexKey("success"))) ?? false
        message = try? c.decode(String.self, forKey: FlexKey("message"))
        emailSent = try? c.decode(Bool.self, forKey: FlexKey("emailSent"))
    }
}

nonisolated struct APIRegisterRequest: Encodable {
    let name: String
    let email: String
    let password: String
    let passwordConfirmation: String

    enum CodingKeys: String, CodingKey {
        case name, email, password
        case passwordConfirmation = "password_confirmation"
    }
}

nonisolated struct APIDeviceInfo: Encodable {
    let platform: String
    let osVersion: String
    let appVersion: String
    let deviceName: String?
    let deviceId: String?
}

nonisolated struct APIGoogleAuthRequest: Encodable {
    let idToken: String
    let deviceInfo: APIDeviceInfo?
}

nonisolated struct APIAppleAuthRequest: Encodable {
    let identityToken: String
    let fullName: AppleFullName?
    let email: String?
    let deviceInfo: APIDeviceInfo?

    struct AppleFullName: Encodable {
        let firstName: String?
        let lastName: String?
    }
}

nonisolated struct APIErrorResponse: Sendable {
    let message: String?
    /// Set by `/api/v1/auth/login` when the account exists but is still
    /// in the `pending` activation state. Drives the "إعادة إرسال رمز
    /// التفعيل" affordance on the iOS login sheet.
    let requiresActivation: Bool?
    /// User id echoed back by the backend so the resend-activation
    /// endpoint can target the exact account without trusting client
    /// input. May be nil if the caller went straight to a public
    /// password-reset endpoint that doesn't disclose the id.
    let userId: String?
}

nonisolated extension APIErrorResponse: Decodable {
    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        message = try? c.decode(String.self, forKey: .message)
        requiresActivation = try? c.decode(Bool.self, forKey: .requiresActivation)
        userId = try? c.decode(String.self, forKey: .userId)
    }
    private enum CodingKeys: String, CodingKey {
        case message
        case requiresActivation
        case userId
    }
}

nonisolated private struct APIRoleValue: Decodable {
    let key: String?
    let displayName: String?

    nonisolated init(from decoder: Decoder) throws {
        if let raw = try? decoder.singleValueContainer().decode(String.self) {
            let trimmed = Self.sanitizedText(raw)
            key = trimmed
            displayName = trimmed
            return
        }

        let c = try decoder.container(keyedBy: FlexKey.self)
        let decodedKey = Self.sanitizedText(try? c.decode(String.self, forKey: FlexKey("key")))
            ?? Self.sanitizedText(try? c.decode(String.self, forKey: FlexKey("slug")))
            ?? Self.sanitizedText(try? c.decode(String.self, forKey: FlexKey("code")))
            ?? Self.sanitizedText(try? c.decode(String.self, forKey: FlexKey("role")))
            ?? Self.sanitizedText(try? c.decode(String.self, forKey: FlexKey("name")))
        let decodedDisplayName = Self.sanitizedText(try? c.decode(String.self, forKey: FlexKey("nameAr")))
            ?? Self.sanitizedText(try? c.decode(String.self, forKey: FlexKey("displayName")))
            ?? Self.sanitizedText(try? c.decode(String.self, forKey: FlexKey("display_name")))
            ?? Self.sanitizedText(try? c.decode(String.self, forKey: FlexKey("titleAr")))
            ?? Self.sanitizedText(try? c.decode(String.self, forKey: FlexKey("title")))
            ?? Self.sanitizedText(try? c.decode(String.self, forKey: FlexKey("labelAr")))
            ?? Self.sanitizedText(try? c.decode(String.self, forKey: FlexKey("label")))
        key = decodedKey
        displayName = decodedDisplayName
    }

    nonisolated private static func sanitizedText(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }
}

/// One row of `/api/v1/members/profile` → `user.interests[]`. Returned by
/// `mobileApiRoutes.ts` after joining `userInterests` with `categories`.
nonisolated struct APIUserInterest: Decodable, Identifiable, Hashable {
    let id: String
    let name: String?
    let slug: String?
    let color: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        if let strId = try? c.decode(String.self, forKey: FlexKey("id")) {
            id = strId
        } else if let intId = try? c.decode(Int.self, forKey: FlexKey("id")) {
            id = String(intId)
        } else {
            id = UUID().uuidString
        }
        name = try? c.decode(String.self, forKey: FlexKey("name"))
        slug = try? c.decode(String.self, forKey: FlexKey("slug"))
        color = try? c.decode(String.self, forKey: FlexKey("color"))
    }
}

nonisolated struct APIUser: Decodable, Identifiable {
    let id: String
    let firstName: String?
    let lastName: String?
    let firstNameEn: String?
    let lastNameEn: String?
    let email: String?
    let avatar: String?
    let role: String?
    let roles: [String]
    let status: String?
    let isProfileComplete: Bool?
    let emailVerified: Bool?
    let phoneVerified: Bool?
    let phoneNumber: String?
    let bio: String?
    let city: String?
    let country: String?
    let gender: String?
    let birthDate: String?
    let jobTitle: String?
    let department: String?
    let verificationBadge: String?
    let hasPressCard: Bool?
    let authProvider: String?
    let createdAt: String?
    /// User-selected interest categories returned by `/api/v1/members/profile`
    /// (see `mobileApiRoutes.ts` — joins userInterests + categories). Drives
    /// the logged-in DailyBriefView dashboard.
    let interests: [APIUserInterest]
    private let roleDisplayName: String?
    private let roleDisplayNames: [String]
    private let membershipDisplayName: String?

    var displayName: String {
        let parts = [firstName, lastName].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? (email ?? "مستخدم") : parts.joined(separator: " ")
    }

    /// Human-readable dump of the decoded role/membership fields. Wired to a
    /// long-press gesture on the profile-role label so we can see exactly
    /// what the backend sent the device — useful when the displayed role
    /// disagrees with what's in the dashboard. Temporary diagnostic; delete
    /// once the "قارئ" reports stop.
    var roleDebugSummary: String {
        let rolesStr = roles.isEmpty ? "—" : roles.joined(separator: ", ")
        let displayName = roleDisplayName ?? "—"
        let displayNames = roleDisplayNames.isEmpty ? "—" : roleDisplayNames.joined(separator: ", ")
        let membership = membershipDisplayName ?? "—"
        let job = jobTitle ?? "—"
        return """
        role: \(role ?? "—")
        roles[]: \(rolesStr)
        roleDisplayName: \(displayName)
        roleDisplayNames[]: \(displayNames)
        membershipDisplayName: \(membership)
        jobTitle: \(job)
        ➜ localizedRole: \(localizedRole)
        """
    }

    var primaryRoleKey: String? {
        if let key = roles.first(where: { Self.isNonReaderRole($0) }) {
            return key
        }
        if let key = role, Self.isNonReaderRole(key) {
            return key
        }
        return roles.first ?? role
    }

    /// True when the basic personal fields needed for personalization are
    /// filled in — drives the "البيانات الشخصية" half of the Settings
    /// completion banner. firstName/lastName are NOT in the gate because
    /// they're locked at registration and can't be edited later, so the
    /// banner would never close for accounts that signed up without them.
    var hasMinimumBasicProfile: Bool {
        let cityFilled = !(city?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        let genderFilled = !(gender?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        return cityFilled && genderFilled
    }

    /// True when at least one interest category is selected.
    var hasAtLeastOneInterest: Bool {
        return !interests.isEmpty
    }

    var localizedRole: String {
        if let label = preferredRoleLabel {
            return label
        }

        if let membershipDisplayName = Self.sanitizedText(membershipDisplayName),
           Self.isNonReaderRoleLabel(membershipDisplayName) {
            return membershipDisplayName
        }

        if let jobTitle = Self.sanitizedText(jobTitle) {
            return jobTitle
        }

        if let key = primaryRoleKey {
            return Self.roleTranslations[key] ?? key
        }

        return "قارئ"
    }

    nonisolated private static let roleTranslations: [String: String] = {
        let base: [String: String] = [
            "system_admin": "مدير النظام",
            "admin": "مسؤول",
            "editor": "محرر",
            "editor_in_chief": "رئيس التحرير",
            "senior_editor": "محرر أول",
            "reporter": "مراسل",
            "journalist": "صحفي",
            "writer": "كاتب",
            "author": "كاتب",
            "article_writer": "كاتب مقال",
            "article_author": "كاتب مقال",
            "opinion_author": "كاتب مقال رأي",
            "columnist": "كاتب عمود",
            "correspondent": "مراسل",
            "managing_editor": "مدير تحرير",
            "editorial_manager": "مدير تحرير",
            "content_manager": "مدير محتوى",
            "comments_moderator": "مشرف تعليقات",
            "moderator": "مشرف",
            "media_manager": "مدير وسائط",
            "publisher": "ناشر",
            "photographer": "مصور",
            "contributor": "مساهم",
            "reader": "قارئ",
        ]
        var dict = base
        for (key, value) in base {
            dict[key.replacingOccurrences(of: "_", with: "-")] = value
            dict[key.replacingOccurrences(of: "_", with: "")] = value
        }
        return dict
    }()

    var isVerified: Bool {
        verificationBadge != nil && verificationBadge != "none"
    }

    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        if let strId = try? c.decode(String.self, forKey: FlexKey("id")) {
            id = strId
        } else if let intId = try? c.decode(Int.self, forKey: FlexKey("id")) {
            id = String(intId)
        } else {
            id = UUID().uuidString
        }
        firstName = (try? c.decode(String.self, forKey: FlexKey("firstName")))
            ?? (try? c.decode(String.self, forKey: FlexKey("first_name")))
        lastName = (try? c.decode(String.self, forKey: FlexKey("lastName")))
            ?? (try? c.decode(String.self, forKey: FlexKey("last_name")))
        firstNameEn = (try? c.decode(String.self, forKey: FlexKey("firstNameEn")))
            ?? (try? c.decode(String.self, forKey: FlexKey("first_name_en")))
        lastNameEn = (try? c.decode(String.self, forKey: FlexKey("lastNameEn")))
            ?? (try? c.decode(String.self, forKey: FlexKey("last_name_en")))
        email = try? c.decode(String.self, forKey: FlexKey("email"))
        let rawAvatar = (try? c.decode(String.self, forKey: FlexKey("profileImageUrl")))
            ?? (try? c.decode(String.self, forKey: FlexKey("profile_image_url")))
            ?? (try? c.decode(String.self, forKey: FlexKey("avatar")))
            ?? (try? c.decode(String.self, forKey: FlexKey("avatar_url")))
        if let raw = rawAvatar, !raw.isEmpty {
            avatar = raw.hasPrefix("http") ? raw : "https://sabq.org\(raw.hasPrefix("/") ? "" : "/")\(raw)"
        } else {
            avatar = nil
        }
        let roleValue = try? c.decode(APIRoleValue.self, forKey: FlexKey("role"))
        let roleString = try? c.decode(String.self, forKey: FlexKey("role"))
        let rolesString = try? c.decode(String.self, forKey: FlexKey("roles"))
        let roleValues = (try? c.decode([APIRoleValue].self, forKey: FlexKey("roles"))) ?? []
        let roleStrings = (try? c.decode([String].self, forKey: FlexKey("roles"))) ?? []

        let parsedRoleKeys = roleValues.compactMap { Self.normalizeRoleIdentifier($0.key) }
        let parsedRoleStringKeys = roleStrings.compactMap(Self.normalizeRoleIdentifier)
        let parsedRolesFromString = Self.splitRoleList(rolesString).compactMap(Self.normalizeRoleIdentifier)
        let fallbackRoleKey = Self.normalizeRoleIdentifier(roleValue?.key ?? roleString)

        role = fallbackRoleKey
            ?? parsedRoleKeys.first
            ?? parsedRoleStringKeys.first
            ?? parsedRolesFromString.first

        let mergedRoles = parsedRoleKeys + parsedRoleStringKeys + parsedRolesFromString + [role].compactMap { $0 }
        roles = Self.uniquePreservingOrder(mergedRoles)

        roleDisplayName = Self.displayLabel(from: roleValue?.displayName)
            ?? Self.displayLabel(from: roleString)
            ?? Self.displayLabel(from: try? c.decode(String.self, forKey: FlexKey("roleLabel")))
            ?? Self.displayLabel(from: try? c.decode(String.self, forKey: FlexKey("role_label")))
            ?? Self.displayLabel(from: try? c.decode(String.self, forKey: FlexKey("roleDisplayName")))
            ?? Self.displayLabel(from: try? c.decode(String.self, forKey: FlexKey("role_display_name")))

        let mergedRoleDisplayNames = roleValues.compactMap { Self.displayLabel(from: $0.displayName) }
            + roleStrings.compactMap(Self.displayLabel(from:))
            + Self.splitRoleList(rolesString).compactMap(Self.displayLabel(from:))
        roleDisplayNames = Self.uniquePreservingOrder(mergedRoleDisplayNames)
        status = try? c.decode(String.self, forKey: FlexKey("status"))
        isProfileComplete = (try? c.decode(Bool.self, forKey: FlexKey("isProfileComplete")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("is_profile_complete")))
        emailVerified = (try? c.decode(Bool.self, forKey: FlexKey("emailVerified")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("email_verified")))
        phoneVerified = (try? c.decode(Bool.self, forKey: FlexKey("phoneVerified")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("phone_verified")))
        phoneNumber = (try? c.decode(String.self, forKey: FlexKey("phoneNumber")))
            ?? (try? c.decode(String.self, forKey: FlexKey("phone_number")))
            ?? (try? c.decode(String.self, forKey: FlexKey("phone")))
        bio = try? c.decode(String.self, forKey: FlexKey("bio"))
        city = try? c.decode(String.self, forKey: FlexKey("city"))
        country = try? c.decode(String.self, forKey: FlexKey("country"))
        gender = try? c.decode(String.self, forKey: FlexKey("gender"))
        birthDate = (try? c.decode(String.self, forKey: FlexKey("birthDate")))
            ?? (try? c.decode(String.self, forKey: FlexKey("birth_date")))
        let decodedJobTitle = try? c.decode(String.self, forKey: FlexKey("jobTitle"))
        let decodedJobTitleSnake = try? c.decode(String.self, forKey: FlexKey("job_title"))
        let decodedTitleAr = try? c.decode(String.self, forKey: FlexKey("titleAr"))
        let decodedTitleArSnake = try? c.decode(String.self, forKey: FlexKey("title_ar"))
        let decodedTitle = try? c.decode(String.self, forKey: FlexKey("title"))
        let decodedPosition = try? c.decode(String.self, forKey: FlexKey("position"))
        let decodedStaffTitle = try? c.decode(String.self, forKey: FlexKey("staffTitle"))
        let decodedStaffTitleSnake = try? c.decode(String.self, forKey: FlexKey("staff_title"))
        jobTitle = decodedJobTitle
            ?? decodedJobTitleSnake
            ?? decodedTitleAr
            ?? decodedTitleArSnake
            ?? decodedTitle
            ?? decodedPosition
            ?? decodedStaffTitle
            ?? decodedStaffTitleSnake

        let decodedMembershipLabel = try? c.decode(String.self, forKey: FlexKey("membershipLabel"))
        let decodedMembershipLabelSnake = try? c.decode(String.self, forKey: FlexKey("membership_label"))
        let decodedMembershipTitle = try? c.decode(String.self, forKey: FlexKey("membershipTitle"))
        let decodedMembershipTitleSnake = try? c.decode(String.self, forKey: FlexKey("membership_title"))
        let decodedMemberType = try? c.decode(String.self, forKey: FlexKey("memberType"))
        let decodedMemberTypeSnake = try? c.decode(String.self, forKey: FlexKey("member_type"))
        membershipDisplayName = decodedMembershipLabel
            ?? decodedMembershipLabelSnake
            ?? decodedMembershipTitle
            ?? decodedMembershipTitleSnake
            ?? decodedMemberType
            ?? decodedMemberTypeSnake
        department = try? c.decode(String.self, forKey: FlexKey("department"))
        verificationBadge = (try? c.decode(String.self, forKey: FlexKey("verificationBadge")))
            ?? (try? c.decode(String.self, forKey: FlexKey("verification_badge")))
        hasPressCard = (try? c.decode(Bool.self, forKey: FlexKey("hasPressCard")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("has_press_card")))
        authProvider = (try? c.decode(String.self, forKey: FlexKey("authProvider")))
            ?? (try? c.decode(String.self, forKey: FlexKey("auth_provider")))
        createdAt = (try? c.decode(String.self, forKey: FlexKey("createdAt")))
            ?? (try? c.decode(String.self, forKey: FlexKey("created_at")))
        interests = (try? c.decode([APIUserInterest].self, forKey: FlexKey("interests"))) ?? []
    }

    private var preferredRoleLabel: String? {
        if let label = roleDisplayNames.first(where: Self.isNonReaderRoleLabel) {
            return label
        }
        if let label = Self.sanitizedText(roleDisplayName), Self.isNonReaderRoleLabel(label) {
            return label
        }
        if let key = primaryRoleKey, Self.isNonReaderRole(key) {
            return Self.roleTranslations[key] ?? Self.sanitizedText(roleDisplayName)
        }
        return nil
    }

    nonisolated private static func splitRoleList(_ value: String?) -> [String] {
        guard let value else { return [] }
        return value
            .split(separator: ",")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    nonisolated private static func normalizeRoleIdentifier(_ value: String?) -> String? {
        guard let value = sanitizedText(value) else { return nil }
        let normalized = value
            .lowercased()
            .replacingOccurrences(of: " ", with: "_")
        return normalized
    }

    nonisolated private static func uniquePreservingOrder(_ values: [String]) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for value in values {
            guard seen.insert(value).inserted else { continue }
            result.append(value)
        }
        return result
    }

    nonisolated private static func sanitizedText(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }

    nonisolated private static func displayLabel(from value: String?) -> String? {
        guard let text = sanitizedText(value) else { return nil }
        let normalized = normalizeRoleIdentifier(text)
        if let normalized, roleTranslations[normalized] != nil {
            return nil
        }
        return text
    }

    nonisolated private static func isNonReaderRole(_ value: String) -> Bool {
        let normalized = normalizeRoleIdentifier(value) ?? value.lowercased()
        return normalized != "reader"
    }

    nonisolated private static func isNonReaderRoleLabel(_ value: String) -> Bool {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized != "reader" && normalized != "قارئ" && normalized != "قاريء"
    }
}

// MARK: - Notification

nonisolated struct APINotification: Decodable, Identifiable {
    let id: String
    let title: String?
    let body: String?
    var isRead: Bool
    let createdAt: String?
    let type: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        if let strId = try? c.decode(String.self, forKey: FlexKey("id")) {
            id = strId
        } else if let intId = try? c.decode(Int.self, forKey: FlexKey("id")) {
            id = String(intId)
        } else {
            id = UUID().uuidString
        }
        title = try? c.decode(String.self, forKey: FlexKey("title"))
        body = (try? c.decode(String.self, forKey: FlexKey("body")))
            ?? (try? c.decode(String.self, forKey: FlexKey("message")))
        isRead = (try? c.decode(Bool.self, forKey: FlexKey("isRead")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("is_read")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("read")))
            ?? false
        createdAt = (try? c.decode(String.self, forKey: FlexKey("createdAt")))
            ?? (try? c.decode(String.self, forKey: FlexKey("created_at")))
        type = try? c.decode(String.self, forKey: FlexKey("type"))
    }
}

// MARK: - Audio Summary

nonisolated struct APIAudioSummary: Decodable {
    let url: String?
    let duration: Int?
    let text: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        url = (try? c.decode(String.self, forKey: FlexKey("url")))
            ?? (try? c.decode(String.self, forKey: FlexKey("audio_url")))
            ?? (try? c.decode(String.self, forKey: FlexKey("file_url")))
        duration = try? c.decode(Int.self, forKey: FlexKey("duration"))
        text = (try? c.decode(String.self, forKey: FlexKey("text")))
            ?? (try? c.decode(String.self, forKey: FlexKey("summary")))
    }
}

// MARK: - Paginated List

nonisolated struct APIPaginatedList<T: Decodable>: Decodable {
    let items: [T]
    let currentPage: Int
    let lastPage: Int
    let total: Int
    let hasMore: Bool

    init(from decoder: Decoder) throws {
        if let arr = try? decoder.singleValueContainer().decode([T].self) {
            items = arr
            currentPage = 1
            lastPage = 1
            total = arr.count
            hasMore = false
            return
        }
        let c = try decoder.container(keyedBy: FlexKey.self)
        items = (try? c.decode([T].self, forKey: FlexKey("data")))
            ?? (try? c.decode([T].self, forKey: FlexKey("results")))
            ?? (try? c.decode([T].self, forKey: FlexKey("items")))
            ?? (try? c.decode([T].self, forKey: FlexKey("articles")))
            ?? []
        if let meta = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey("meta")) {
            let decodedCurrentPage = (try? meta.decode(Int.self, forKey: FlexKey("current_page")))
                ?? (try? meta.decode(Int.self, forKey: FlexKey("currentPage")))
                ?? 1
            let decodedLastPage = (try? meta.decode(Int.self, forKey: FlexKey("last_page")))
                ?? (try? meta.decode(Int.self, forKey: FlexKey("lastPage")))
                ?? 1
            let decodedTotal = (try? meta.decode(Int.self, forKey: FlexKey("total"))) ?? items.count
            let decodedLimit = (try? meta.decode(Int.self, forKey: FlexKey("limit")))
                ?? (try? meta.decode(Int.self, forKey: FlexKey("per_page")))
                ?? (try? meta.decode(Int.self, forKey: FlexKey("perPage")))
                ?? max(items.count, 1)
            let directHasMore = (try? meta.decode(Bool.self, forKey: FlexKey("hasMore")))
                ?? (try? meta.decode(Bool.self, forKey: FlexKey("has_more")))

            currentPage = decodedCurrentPage
            lastPage = decodedLastPage
            total = decodedTotal
            hasMore = directHasMore
                ?? (decodedCurrentPage < decodedLastPage
                    || (((decodedCurrentPage - 1) * decodedLimit) + items.count < decodedTotal))
        } else {
            let decodedTotal = (try? c.decode(Int.self, forKey: FlexKey("total"))) ?? items.count
            let decodedLimit = (try? c.decode(Int.self, forKey: FlexKey("limit")))
                ?? (try? c.decode(Int.self, forKey: FlexKey("per_page")))
                ?? (try? c.decode(Int.self, forKey: FlexKey("perPage")))
                ?? max(items.count, 1)
            let decodedOffset = (try? c.decode(Int.self, forKey: FlexKey("offset"))) ?? 0
            let inferredCurrentPage = decodedLimit > 0 ? (decodedOffset / decodedLimit) + 1 : 1
            let decodedCurrentPage = (try? c.decode(Int.self, forKey: FlexKey("page")))
                ?? (try? c.decode(Int.self, forKey: FlexKey("current_page")))
                ?? inferredCurrentPage
            let inferredLastPage = decodedLimit > 0
                ? max(1, Int(ceil(Double(max(decodedTotal, items.count)) / Double(decodedLimit))))
                : 1
            let decodedLastPage = (try? c.decode(Int.self, forKey: FlexKey("last_page")))
                ?? (try? c.decode(Int.self, forKey: FlexKey("lastPage")))
                ?? inferredLastPage
            let directHasMore = (try? c.decode(Bool.self, forKey: FlexKey("hasMore")))
                ?? (try? c.decode(Bool.self, forKey: FlexKey("has_more")))

            currentPage = decodedCurrentPage
            lastPage = decodedLastPage
            total = decodedTotal
            hasMore = directHasMore ?? (decodedOffset + items.count < decodedTotal || decodedCurrentPage < decodedLastPage)
        }
    }
}

// MARK: - Shortlink

nonisolated struct APIShortlink: Decodable {
    let shortUrl: String?
    let shortCode: String?
    let originalUrl: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        shortUrl = (try? c.decode(String.self, forKey: FlexKey("short_url")))
            ?? (try? c.decode(String.self, forKey: FlexKey("shortUrl")))
            ?? (try? c.decode(String.self, forKey: FlexKey("url")))
            ?? (try? c.decode(String.self, forKey: FlexKey("link")))
        shortCode = (try? c.decode(String.self, forKey: FlexKey("shortCode")))
            ?? (try? c.decode(String.self, forKey: FlexKey("short_code")))
            ?? (try? c.decode(String.self, forKey: FlexKey("code")))
        originalUrl = (try? c.decode(String.self, forKey: FlexKey("originalUrl")))
            ?? (try? c.decode(String.self, forKey: FlexKey("original_url")))
    }

    var resolvedURLString: String? {
        if let direct = Self.normalizedURLString(shortUrl) {
            return direct
        }
        let trimmedShortCode = shortCode?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmedShortCode.isEmpty {
            return "https://sabq.org/s/\(trimmedShortCode)"
        }
        return Self.normalizedURLString(originalUrl)
    }

    private static func normalizedURLString(_ value: String?) -> String? {
        let trimmedValue = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmedValue.isEmpty else {
            return nil
        }
        if trimmedValue.hasPrefix("http://") || trimmedValue.hasPrefix("https://") {
            return trimmedValue
        }
        if trimmedValue.hasPrefix("/") {
            return "https://sabq.org\(trimmedValue)"
        }
        return "https://sabq.org/\(trimmedValue)"
    }
}

// MARK: - Trending Page

nonisolated struct APITrendingPageResponse: Decodable {
    let articles: [APIArticle]
    let tags: [String]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        articles = (try? c.decode([APIArticle].self, forKey: FlexKey("articles")))
            ?? (try? c.decode([APIArticle].self, forKey: FlexKey("data")))
            ?? []
        tags = (try? c.decode([String].self, forKey: FlexKey("tags")))
            ?? (try? c.decode([String].self, forKey: FlexKey("keywords")))
            ?? []
    }
}

// MARK: - Live Coverage

nonisolated struct APILiveCoverage: Decodable {
    let country: String
    var events: [APILiveEvent]
    let count: Int

    private static let countryNames: [String: String] = [
        "saudi_arabia": "السعودية",
        "uae": "الإمارات",
        "bahrain": "البحرين",
        "kuwait": "الكويت",
        "qatar": "قطر",
        "oman": "عُمان",
        "yemen": "اليمن",
    ]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        country = (try? c.decode(String.self, forKey: FlexKey("country"))) ?? ""
        var decoded = (try? c.decode([APILiveEvent].self, forKey: FlexKey("events"))) ?? []
        let name = Self.countryNames[country] ?? country
        for i in decoded.indices {
            if decoded[i].country.isEmpty { decoded[i].country = country }
            if decoded[i].countryNameAr.isEmpty { decoded[i].countryNameAr = name }
        }
        events = decoded
        count = (try? c.decode(Int.self, forKey: FlexKey("count"))) ?? 0
    }
}

nonisolated struct APILiveResponse: Decodable {
    let titleAr: String
    let isLive: Bool
    let coverages: [APILiveCoverage]
    let countries: [APILiveCountry]
    let events: [APILiveEvent]
    let stats: APILiveStats?
    let total: Int

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        titleAr = (try? c.decode(String.self, forKey: FlexKey("title_ar")))
            ?? (try? c.decode(String.self, forKey: FlexKey("titleAr")))
            ?? "البث الحي — الاعتداءات على دول الخليج"

        coverages = (try? c.decode([APILiveCoverage].self, forKey: FlexKey("coverages"))) ?? []

        let hasCoverages = !coverages.isEmpty
        isLive = (try? c.decode(Bool.self, forKey: FlexKey("is_live")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("isLive")))
            ?? hasCoverages

        if let directEvents = try? c.decode([APILiveEvent].self, forKey: FlexKey("events")), !directEvents.isEmpty {
            events = directEvents
        } else {
            events = coverages.flatMap(\.events).sorted { $0.publishedAt > $1.publishedAt }
        }

        if let directCountries = try? c.decode([APILiveCountry].self, forKey: FlexKey("countries")), !directCountries.isEmpty {
            countries = directCountries
        } else {
            countries = coverages.map { cov in
                APILiveCountry(key: cov.country, nameAr: Self.countryName(cov.country), count: cov.count)
            }
        }

        stats = (try? c.decode(APILiveStats.self, forKey: FlexKey("stats")))
            ?? (hasCoverages ? Self.computeStats(from: coverages) : nil)

        total = (try? c.decode(Int.self, forKey: FlexKey("total")))
            ?? coverages.reduce(0) { $0 + $1.count }
    }

    private static func countryName(_ key: String) -> String {
        switch key {
        case "saudi_arabia": return "السعودية"
        case "uae": return "الإمارات"
        case "bahrain": return "البحرين"
        case "kuwait": return "الكويت"
        case "qatar": return "قطر"
        case "oman": return "عُمان"
        case "yemen": return "اليمن"
        default: return key
        }
    }

    private static func computeStats(from coverages: [APILiveCoverage]) -> APILiveStats {
        let allEvents = coverages.flatMap(\.events)
        let total = allEvents.count
        let intercepted = allEvents.filter {
            $0.eventType.contains("intercepted")
        }.count
        var byCountry: [String: Int] = [:]
        for cov in coverages {
            byCountry[cov.country] = cov.count
        }
        return APILiveStats(
            totalEvents: total,
            intercepted: intercepted,
            injuries: 0,
            martyrdom: 0,
            byCountry: byCountry,
            lastUpdated: allEvents.first?.publishedAt
        )
    }
}

nonisolated struct APILiveStats: Decodable {
    let totalEvents: Int
    let intercepted: Int
    let injuries: Int
    let martyrdom: Int
    let byCountry: [String: Int]
    let lastUpdated: String?

    init(totalEvents: Int, intercepted: Int, injuries: Int, martyrdom: Int, byCountry: [String: Int], lastUpdated: String?) {
        self.totalEvents = totalEvents
        self.intercepted = intercepted
        self.injuries = injuries
        self.martyrdom = martyrdom
        self.byCountry = byCountry
        self.lastUpdated = lastUpdated
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        totalEvents = (try? c.decode(Int.self, forKey: FlexKey("total_events")))
            ?? (try? c.decode(Int.self, forKey: FlexKey("totalEvents")))
            ?? 0
        intercepted = (try? c.decode(Int.self, forKey: FlexKey("intercepted"))) ?? 0
        injuries = (try? c.decode(Int.self, forKey: FlexKey("injuries"))) ?? 0
        martyrdom = (try? c.decode(Int.self, forKey: FlexKey("martyrdom"))) ?? 0
        byCountry = (try? c.decode([String: Int].self, forKey: FlexKey("by_country")))
            ?? (try? c.decode([String: Int].self, forKey: FlexKey("byCountry")))
            ?? [:]
        lastUpdated = (try? c.decode(String.self, forKey: FlexKey("last_updated")))
            ?? (try? c.decode(String.self, forKey: FlexKey("lastUpdated")))
    }
}

nonisolated struct APILiveCountry: Decodable, Identifiable {
    var id: String { key }
    let key: String
    let nameAr: String
    let nameEn: String?
    let count: Int

    init(key: String, nameAr: String, count: Int) {
        self.key = key
        self.nameAr = nameAr
        self.nameEn = nil
        self.count = count
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        key = (try? c.decode(String.self, forKey: FlexKey("key"))) ?? ""
        nameAr = (try? c.decode(String.self, forKey: FlexKey("name_ar")))
            ?? (try? c.decode(String.self, forKey: FlexKey("nameAr")))
            ?? ""
        nameEn = (try? c.decode(String.self, forKey: FlexKey("name_en")))
            ?? (try? c.decode(String.self, forKey: FlexKey("nameEn")))
        count = (try? c.decode(Int.self, forKey: FlexKey("count"))) ?? 0
    }
}

nonisolated struct APILiveEventType: Decodable, Identifiable {
    var id: String { key }
    let key: String
    let labelAr: String
    let labelEn: String?
    let severity: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        key = (try? c.decode(String.self, forKey: FlexKey("key"))) ?? ""
        labelAr = (try? c.decode(String.self, forKey: FlexKey("label_ar")))
            ?? (try? c.decode(String.self, forKey: FlexKey("labelAr")))
            ?? ""
        labelEn = (try? c.decode(String.self, forKey: FlexKey("label_en")))
            ?? (try? c.decode(String.self, forKey: FlexKey("labelEn")))
        severity = (try? c.decode(String.self, forKey: FlexKey("severity"))) ?? "info"
    }
}

nonisolated struct APILiveEvent: Decodable, Identifiable {
    let id: String
    let content: String
    var country: String
    var countryNameAr: String
    let eventType: String
    let eventTypeLabelAr: String
    let severity: String
    let priority: String
    let sourceName: String?
    let isPinned: Bool
    let isUpdate: Bool
    let publishedAt: String

    private static let eventTypeLabels: [String: String] = [
        "drone_intercepted": "صد مسيّرة",
        "ballistic_intercepted": "صد صاروخ باليستي",
        "cruise_intercepted": "صد صاروخ كروز",
        "ballistic_and_drone": "صد صاروخ ومسيّرة",
        "debris_fallen": "سقوط شظايا",
        "no_damage": "لا أضرار",
        "injuries": "إصابات",
        "martyrdom": "استشهاد",
        "official_statement": "بيان رسمي",
        "official_comment": "تصريح مسؤول",
        "military_action": "تحرك عسكري",
        "international_condemnation": "إدانة دولية",
    ]

    private static let eventTypeSeverity: [String: String] = [
        "drone_intercepted": "success",
        "ballistic_intercepted": "success",
        "cruise_intercepted": "success",
        "ballistic_and_drone": "success",
        "debris_fallen": "warning",
        "no_damage": "info",
        "injuries": "danger",
        "martyrdom": "critical",
        "official_statement": "info",
        "official_comment": "info",
        "military_action": "danger",
        "international_condemnation": "info",
    ]

    private static let countryNames: [String: String] = [
        "saudi_arabia": "السعودية",
        "uae": "الإمارات",
        "bahrain": "البحرين",
        "kuwait": "الكويت",
        "qatar": "قطر",
        "oman": "عُمان",
        "yemen": "اليمن",
    ]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        if let strId = try? c.decode(String.self, forKey: FlexKey("id")) {
            id = strId
        } else if let intId = try? c.decode(Int.self, forKey: FlexKey("id")) {
            id = String(intId)
        } else {
            id = UUID().uuidString
        }
        content = (try? c.decode(String.self, forKey: FlexKey("content"))) ?? ""
        country = (try? c.decode(String.self, forKey: FlexKey("country"))) ?? ""
        countryNameAr = (try? c.decode(String.self, forKey: FlexKey("country_name_ar")))
            ?? (try? c.decode(String.self, forKey: FlexKey("countryNameAr")))
            ?? Self.countryNames[country] ?? country
        let rawType = (try? c.decode(String.self, forKey: FlexKey("event_type")))
            ?? (try? c.decode(String.self, forKey: FlexKey("eventType")))
            ?? ""
        eventType = rawType
        eventTypeLabelAr = (try? c.decode(String.self, forKey: FlexKey("event_type_label_ar")))
            ?? (try? c.decode(String.self, forKey: FlexKey("eventTypeLabelAr")))
            ?? Self.eventTypeLabels[rawType]
            ?? rawType
        severity = (try? c.decode(String.self, forKey: FlexKey("severity")))
            ?? Self.eventTypeSeverity[rawType]
            ?? "info"
        priority = (try? c.decode(String.self, forKey: FlexKey("priority"))) ?? "normal"
        sourceName = (try? c.decode(String.self, forKey: FlexKey("source_name")))
            ?? (try? c.decode(String.self, forKey: FlexKey("sourceName")))
            ?? (try? c.decode(String.self, forKey: FlexKey("source")))
        isPinned = (try? c.decode(Bool.self, forKey: FlexKey("is_pinned")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("isPinned")))
            ?? false
        isUpdate = (try? c.decode(Bool.self, forKey: FlexKey("is_update")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("isUpdate")))
            ?? false
        publishedAt = (try? c.decode(String.self, forKey: FlexKey("published_at")))
            ?? (try? c.decode(String.self, forKey: FlexKey("publishedAt")))
            ?? (try? c.decode(String.self, forKey: FlexKey("created_at")))
            ?? ""
    }
}

nonisolated struct APILiveTimelineDay: Decodable, Identifiable {
    var id: String { date }
    let date: String
    let events: [APILiveEvent]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        date = (try? c.decode(String.self, forKey: FlexKey("date"))) ?? ""
        events = (try? c.decode([APILiveEvent].self, forKey: FlexKey("events"))) ?? []
    }
}

nonisolated struct APILiveEventDetail: Decodable {
    let event: APILiveEvent
    let updates: [APILiveEvent]
    let updatesCount: Int

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        event = try c.decode(APILiveEvent.self, forKey: FlexKey("event"))
        updates = (try? c.decode([APILiveEvent].self, forKey: FlexKey("updates"))) ?? []
        updatesCount = (try? c.decode(Int.self, forKey: FlexKey("updates_count")))
            ?? (try? c.decode(Int.self, forKey: FlexKey("updatesCount")))
            ?? 0
    }
}

// MARK: - Moment-by-Moment (Live News Updates)

/// One row in the moment-by-moment feed (`GET /api/live/updates`). This is a
/// stream of recently-published articles, NOT the live-events table that
/// powers `APILiveEvent`. See `client/src/pages/MomentByMoment.tsx` for the
/// reference web implementation.
nonisolated struct APILiveUpdate: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let slug: String
    let imageUrl: String?
    let publishedAt: String
    let updatedAt: String
    let isBreaking: Bool
    let categoryNameAr: String
    let categoryColor: String?
    let viewsCount: Int
    let commentsCount: Int
    let summary: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""
        slug = (try? c.decode(String.self, forKey: FlexKey("slug"))) ?? ""
        imageUrl = try? c.decode(String.self, forKey: FlexKey("imageUrl"))
        publishedAt = (try? c.decode(String.self, forKey: FlexKey("publishedAt"))) ?? ""
        updatedAt = (try? c.decode(String.self, forKey: FlexKey("updatedAt"))) ?? publishedAt
        isBreaking = (try? c.decode(Bool.self, forKey: FlexKey("isBreaking"))) ?? false
        categoryNameAr = (try? c.decode(String.self, forKey: FlexKey("categoryNameAr"))) ?? "غير مصنف"
        categoryColor = try? c.decode(String.self, forKey: FlexKey("categoryColor"))
        viewsCount = (try? c.decode(Int.self, forKey: FlexKey("viewsCount"))) ?? 0
        commentsCount = (try? c.decode(Int.self, forKey: FlexKey("commentsCount"))) ?? 0
        summary = (try? c.decode(String.self, forKey: FlexKey("summary"))) ?? ""
    }
}

nonisolated struct APILiveUpdatesResponse: Decodable {
    let items: [APILiveUpdate]
    let nextCursor: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        items = (try? c.decode([APILiveUpdate].self, forKey: FlexKey("items"))) ?? []
        nextCursor = try? c.decode(String.self, forKey: FlexKey("nextCursor"))
    }
}

// MARK: - Today insights (personal knowledge journey)

/// Mirrors `GET /api/v1/insights/today`. Powers the inline metric tiles +
/// top-interests chips on the home feed for signed-in users.
nonisolated struct APITodayInsights: Decodable {
    let greeting: String
    let metrics: Metrics
    let topInterests: [String]
    let aiPhrase: String?
    let quickSummary: String?

    nonisolated struct Metrics: Decodable {
        let readingTime: Int       // minutes
        let completionRate: Int    // 0..100
        let likes: Int
        let comments: Int
        let articlesRead: Int

        init(readingTime: Int = 0, completionRate: Int = 0, likes: Int = 0,
             comments: Int = 0, articlesRead: Int = 0) {
            self.readingTime = readingTime
            self.completionRate = completionRate
            self.likes = likes
            self.comments = comments
            self.articlesRead = articlesRead
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: FlexKey.self)
            readingTime = (try? c.decode(Int.self, forKey: FlexKey("readingTime"))) ?? 0
            completionRate = (try? c.decode(Int.self, forKey: FlexKey("completionRate"))) ?? 0
            likes = (try? c.decode(Int.self, forKey: FlexKey("likes"))) ?? 0
            comments = (try? c.decode(Int.self, forKey: FlexKey("comments"))) ?? 0
            articlesRead = (try? c.decode(Int.self, forKey: FlexKey("articlesRead"))) ?? 0
        }
    }

    // فك متسامح (نمط FlexKey المتّبع في بقية الملف): تغيير صغير في شكل
    // الاستجابة كان يُفشل الفك كاملًا فتختفي بطاقة الرحلة المعرفية كليًا.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        greeting = (try? c.decode(String.self, forKey: FlexKey("greeting"))) ?? ""
        metrics = (try? c.decode(Metrics.self, forKey: FlexKey("metrics"))) ?? Metrics()
        topInterests = (try? c.decode([String].self, forKey: FlexKey("topInterests"))) ?? []
        aiPhrase = try? c.decode(String.self, forKey: FlexKey("aiPhrase"))
        quickSummary = try? c.decode(String.self, forKey: FlexKey("quickSummary"))
    }
}

// MARK: - Hajj Block (seasonal)
//
// Mirrors the GET /api/hajj-block public endpoint. The block hides
// itself outside the configured Hajj season by returning
// `isVisible: false` (no other fields). When visible, it ships the
// article list along with the live Hajj-day metadata so the iOS
// header can show "اليوم: عرفة" + countdown.

nonisolated struct APIHajjBlockResponse: Decodable {
    let isVisible: Bool
    let title: String?
    let subtitle: String?
    let articles: [APIHajjArticle]?
    let hajjDay: Int?
    let daysToArafat: Int?
    let hajjPhase: String?           // tarwiyah | arafat | nahr | tashreeq | before | after
    let lastUpdatedAt: String?
    let reason: String?              // why hidden (before_season / after_season / no_matching_articles)
}

nonisolated struct APIHajjArticle: Decodable, Identifiable {
    let id: String
    let title: String
    let slug: String?
    let excerpt: String?
    let imageUrl: String?
    let publishedAt: String?
    let isBreaking: Bool?
    let isPinned: Bool?
    let hajjTag: String              // "من عرفات", "في منى", ...
    let hajjEmoji: String            // 🏔️, 🪨, ...

    // hajjTag/hajjEmoji بقيم افتراضية فارغة: صف واحد ناقص كان يُفشل فك
    // المصفوفة كاملةً فيختفي بلوك الحج بأكمله.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = try c.decode(String.self, forKey: FlexKey("id"))
        title = try c.decode(String.self, forKey: FlexKey("title"))
        slug = try? c.decode(String.self, forKey: FlexKey("slug"))
        excerpt = try? c.decode(String.self, forKey: FlexKey("excerpt"))
        imageUrl = try? c.decode(String.self, forKey: FlexKey("imageUrl"))
        publishedAt = try? c.decode(String.self, forKey: FlexKey("publishedAt"))
        isBreaking = try? c.decode(Bool.self, forKey: FlexKey("isBreaking"))
        isPinned = try? c.decode(Bool.self, forKey: FlexKey("isPinned"))
        hajjTag = (try? c.decode(String.self, forKey: FlexKey("hajjTag"))) ?? ""
        hajjEmoji = (try? c.decode(String.self, forKey: FlexKey("hajjEmoji"))) ?? ""
    }
}

// MARK: - Article reactions (like toggle)

/// Mirrors `POST /api/v1/articles/:id/react` and
/// `GET /api/v1/articles/:id/react`. Backend toggles a row in the
/// reactions table for the current member; both verbs return the
/// post-mutation count so the Like button can update without a
/// second fetch.
nonisolated struct APIArticleReactionResponse: Decodable {
    let liked: Bool
    let likesCount: Int

    // liked إلزامي (جوهر الاستجابة)؛ likesCount متسامح — إسقاطه من الخادم
    // كان يرمي خطأ فك فيتجمّد زر الإعجاب كليًا بدل أن يفقد العدّاد فقط.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        liked = try c.decode(Bool.self, forKey: FlexKey("liked"))
        likesCount = (try? c.decode(Int.self, forKey: FlexKey("likesCount"))) ?? 0
    }
}

// MARK: - Editorial notifications (push history + preferences)

/// Single notification entry returned by GET /api/v1/notifications.
/// Mirrors `editorialNotifications` rows. `readAt` is an ISO-8601 string
/// when set so the same shape works for both Date encoders/decoders.
nonisolated struct APIEditorialNotification: Decodable, Identifiable, Hashable {
    let id: String
    let userId: String
    let type: String        // "scheduled" | "published" | "rejected" | "needs_revision"
    let title: String
    let body: String
    let articleId: String?
    let articleTitle: String?
    let articleSlug: String?
    let deepLink: String?
    let reviewerNote: String?
    let deliveryStatus: String?
    let readAt: String?
    let createdAt: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? UUID().uuidString
        userId = (try? c.decode(String.self, forKey: FlexKey("userId"))) ?? ""
        type = (try? c.decode(String.self, forKey: FlexKey("type"))) ?? ""
        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""
        body = (try? c.decode(String.self, forKey: FlexKey("body"))) ?? ""
        articleId = try? c.decode(String.self, forKey: FlexKey("articleId"))
        articleTitle = try? c.decode(String.self, forKey: FlexKey("articleTitle"))
        articleSlug = try? c.decode(String.self, forKey: FlexKey("articleSlug"))
        deepLink = (try? c.decode(String.self, forKey: FlexKey("deepLink")))
            ?? (try? c.decode(String.self, forKey: FlexKey("deep_link")))
        reviewerNote = (try? c.decode(String.self, forKey: FlexKey("reviewerNote")))
            ?? (try? c.decode(String.self, forKey: FlexKey("reviewer_note")))
        deliveryStatus = (try? c.decode(String.self, forKey: FlexKey("deliveryStatus")))
            ?? (try? c.decode(String.self, forKey: FlexKey("delivery_status")))
        readAt = (try? c.decode(String.self, forKey: FlexKey("readAt")))
            ?? (try? c.decode(String.self, forKey: FlexKey("read_at")))
        createdAt = (try? c.decode(String.self, forKey: FlexKey("createdAt")))
            ?? (try? c.decode(String.self, forKey: FlexKey("created_at")))
            ?? ""
    }
}

// MARK: - Author profile (mobile)
//
// Powers the redesigned writer page. Single GET /api/v1/authors/by-name
// returns the hero (avatar/bio/role), stats strip, top categories, and
// the recent-articles list — so the screen renders in one round-trip.

nonisolated struct APIAuthorProfile: Decodable {
    let id: String
    let name: String
    let role: String
    let avatarUrl: String?
    let bio: String?
    let jobTitle: String?
    let department: String?
    let joinedAt: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? ""
        name = (try? c.decode(String.self, forKey: FlexKey("name"))) ?? ""
        role = (try? c.decode(String.self, forKey: FlexKey("role"))) ?? ""
        var resolvedAvatar: String?
        for key in ["avatarUrl", "avatar_url", "profileImageUrl", "profile_image_url", "profile_image", "avatar"] {
            if let value = try? c.decode(String.self, forKey: FlexKey(key)) {
                let trimmed = value.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    resolvedAvatar = trimmed
                    break
                }
            }
        }
        if let resolvedAvatar {
            avatarUrl = URLConstants.absolutize(resolvedAvatar)
        } else {
            avatarUrl = nil
        }
        bio = try? c.decode(String.self, forKey: FlexKey("bio"))
        jobTitle = try? c.decode(String.self, forKey: FlexKey("jobTitle"))
        department = try? c.decode(String.self, forKey: FlexKey("department"))
        joinedAt = try? c.decode(String.self, forKey: FlexKey("joinedAt"))
    }
}

nonisolated struct APIAuthorStats: Decodable {
    let articleCount: Int
    let totalViews: Int
    let earliestPublish: String?

    init(articleCount: Int = 0, totalViews: Int = 0, earliestPublish: String? = nil) {
        self.articleCount = articleCount
        self.totalViews = totalViews
        self.earliestPublish = earliestPublish
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        articleCount = (try? c.decode(Int.self, forKey: FlexKey("articleCount"))) ?? 0
        totalViews = (try? c.decode(Int.self, forKey: FlexKey("totalViews"))) ?? 0
        earliestPublish = try? c.decode(String.self, forKey: FlexKey("earliestPublish"))
    }
}

nonisolated struct APIAuthorCategory: Decodable, Hashable {
    let id: String
    let nameAr: String
    let color: String?
    let icon: String?
    let count: Int

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? ""
        nameAr = (try? c.decode(String.self, forKey: FlexKey("nameAr"))) ?? ""
        color = try? c.decode(String.self, forKey: FlexKey("color"))
        icon = try? c.decode(String.self, forKey: FlexKey("icon"))
        count = (try? c.decode(Int.self, forKey: FlexKey("count"))) ?? 0
    }
}

nonisolated struct APIAuthorPage: Decodable {
    let author: APIAuthorProfile
    let stats: APIAuthorStats
    let topCategories: [APIAuthorCategory]
    let recentArticles: [APIArticle]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        author = try c.decode(APIAuthorProfile.self, forKey: FlexKey("author"))
        stats = (try? c.decode(APIAuthorStats.self, forKey: FlexKey("stats"))) ?? APIAuthorStats()
        topCategories = (try? c.decode([APIAuthorCategory].self, forKey: FlexKey("topCategories"))) ?? []
        recentArticles = (try? c.decode([APIArticle].self, forKey: FlexKey("recentArticles"))) ?? []
    }
}

nonisolated struct EditorialNotificationsPage: Decodable {
    let success: Bool
    let items: [APIEditorialNotification]
    let unread: Int

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        success = (try? c.decode(Bool.self, forKey: FlexKey("success"))) ?? true
        items = (try? c.decode([APIEditorialNotification].self, forKey: FlexKey("items"))) ?? []
        unread = (try? c.decode(Int.self, forKey: FlexKey("unread"))) ?? 0
    }
}

/// Per-type toggles surfaced in the iOS settings screen. Round-trips through
/// `GET` / `PUT /api/v1/notifications/preferences`.
nonisolated struct EditorialNotificationPreferences: Codable, Hashable {
    var scheduledEnabled: Bool
    var publishedEnabled: Bool
    var rejectedEnabled: Bool
    var revisionEnabled: Bool

    static let allOn = EditorialNotificationPreferences(
        scheduledEnabled: true,
        publishedEnabled: true,
        rejectedEnabled: true,
        revisionEnabled: true
    )

    init(scheduledEnabled: Bool, publishedEnabled: Bool,
         rejectedEnabled: Bool, revisionEnabled: Bool) {
        self.scheduledEnabled = scheduledEnabled
        self.publishedEnabled = publishedEnabled
        self.rejectedEnabled = rejectedEnabled
        self.revisionEnabled = revisionEnabled
    }

    // متسامح: حقل مفقود = مفعّل (الافتراضي allOn) بدل إفشال شاشة
    // التفضيلات كاملةً عند أي إضافة/إسقاط خادمي. encode يبقى مولَّدًا.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        scheduledEnabled = (try? c.decode(Bool.self, forKey: FlexKey("scheduledEnabled"))) ?? true
        publishedEnabled = (try? c.decode(Bool.self, forKey: FlexKey("publishedEnabled"))) ?? true
        rejectedEnabled = (try? c.decode(Bool.self, forKey: FlexKey("rejectedEnabled"))) ?? true
        revisionEnabled = (try? c.decode(Bool.self, forKey: FlexKey("revisionEnabled"))) ?? true
    }
}

/// تفضيلات أنواع تنبيهات المباريات (عامّة لكل المستخدم) — تُطبَّق على إشعارات
/// الفِرق التي يتابعها. تدور عبر `GET` / `PUT /api/v1/sports/alert-prefs`.
nonisolated struct SportsAlertPreferences: Codable, Hashable {
    var kickoff: Bool
    var goals: Bool
    var cards: Bool
    var varReview: Bool
    var fulltime: Bool

    static let allOn = SportsAlertPreferences(
        kickoff: true, goals: true, cards: true, varReview: true, fulltime: true
    )
}

/// متابعة رياضية واحدة (فريق/بطولة). تُستخدم لمعرفة ما إذا كان المستخدم يتابع
/// منتخبًا في صفحته. الحقول الزائدة (userId/createdAt) يتجاهلها Codable.
nonisolated struct SportsFollow: Codable, Hashable, Identifiable {
    let id: String
    let kind: String
    let refId: String
    let refName: String
    let refLogo: String?
    var notify: Bool
}
