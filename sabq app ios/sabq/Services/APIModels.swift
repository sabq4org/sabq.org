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

nonisolated struct APIArticle: Decodable {
    let id: String
    let title: String
    let fullText: String
    let excerpt: String?
    let summary: String?
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
    let viewsCount: Int?
    let commentsCount: Int?
    /// Present on `GET /articles/{slug}`; used for related stories in article detail.
    let relatedArticles: [APIArticle]?

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

        viewsCount = (try? c.decode(Int.self, forKey: FlexKey("views")))
            ?? (try? c.decode(Int.self, forKey: FlexKey("views_count")))
        commentsCount = try? c.decode(Int.self, forKey: FlexKey("comments_count"))

        relatedArticles = try? c.decode([APIArticle].self, forKey: FlexKey("related_articles"))
    }

    func withKeywords(_ newKeywords: [String]) -> APIArticle {
        var copy = self
        copy.keywords = newKeywords
        return copy
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

nonisolated struct APICategory: Decodable {
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

nonisolated struct APIBreakingTicker: Decodable {
    let id: Int?
    let title: String?
    let headlines: [APIBreakingHeadline]?
    let articles: [APIArticle]?
    let count: Int?
    let isActive: Bool?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = try? c.decode(Int.self, forKey: FlexKey("id"))
        title = try? c.decode(String.self, forKey: FlexKey("title"))
        headlines = try? c.decode([APIBreakingHeadline].self, forKey: FlexKey("headlines"))
        articles = try? c.decode([APIArticle].self, forKey: FlexKey("articles"))
        count = try? c.decode(Int.self, forKey: FlexKey("count"))
        isActive = (try? c.decode(Bool.self, forKey: FlexKey("is_active")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("active")))
    }
}

nonisolated struct APIBreakingHeadline: Decodable, Identifiable {
    let id: Int
    let text: String
    let articleSlug: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(Int.self, forKey: FlexKey("id"))) ?? 0
        text = (try? c.decode(String.self, forKey: FlexKey("text")))
            ?? (try? c.decode(String.self, forKey: FlexKey("title")))
            ?? ""
        articleSlug = (try? c.decode(String.self, forKey: FlexKey("article_slug")))
            ?? (try? c.decode(String.self, forKey: FlexKey("slug")))
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

nonisolated struct APIComment: Decodable, Identifiable {
    let id: Int
    let body: String
    let userName: String?
    let userAvatar: String?
    let createdAt: String
    let likesCount: Int?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(Int.self, forKey: FlexKey("id"))) ?? 0
        body = (try? c.decode(String.self, forKey: FlexKey("body")))
            ?? (try? c.decode(String.self, forKey: FlexKey("content")))
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
    let publishedAt: String?
    let imageUrl: String?
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
        } else {
            authorName = try? c.decode(String.self, forKey: FlexKey("author_name"))
            let rawAuthorImage = Self.decodeFirstString(
                in: c,
                keys: ["author_image", "authorImage"]
            )
            authorImage = Self.absoluteMediaURL(from: rawAuthorImage)
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

nonisolated struct APILoginRequest: Encodable {
    let email: String
    let password: String
}

nonisolated struct APIAvatarUploadResponse: Decodable {
    let success: Bool?
    let profileImageUrl: String?
    let user: APIUser
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

nonisolated struct APIErrorResponse: Sendable {
    let message: String?
}

nonisolated extension APIErrorResponse: Decodable {
    nonisolated init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        message = try? c.decode(String.self, forKey: .message)
    }
    private enum CodingKeys: String, CodingKey { case message }
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
    private let roleDisplayName: String?
    private let roleDisplayNames: [String]

    var displayName: String {
        let parts = [firstName, lastName].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? (email ?? "مستخدم") : parts.joined(separator: " ")
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

    var localizedRole: String {
        if let label = preferredRoleLabel {
            return label
        }

        if let key = primaryRoleKey {
            return Self.roleTranslations[key] ?? key
        }

        if let jobTitle = Self.sanitizedText(jobTitle) {
            return jobTitle
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
            "opinion_author": "كاتب مقال رأي",
            "columnist": "كاتب عمود",
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
        jobTitle = (try? c.decode(String.self, forKey: FlexKey("jobTitle")))
            ?? (try? c.decode(String.self, forKey: FlexKey("job_title")))
        department = try? c.decode(String.self, forKey: FlexKey("department"))
        verificationBadge = (try? c.decode(String.self, forKey: FlexKey("verificationBadge")))
            ?? (try? c.decode(String.self, forKey: FlexKey("verification_badge")))
        hasPressCard = (try? c.decode(Bool.self, forKey: FlexKey("hasPressCard")))
            ?? (try? c.decode(Bool.self, forKey: FlexKey("has_press_card")))
        authProvider = (try? c.decode(String.self, forKey: FlexKey("authProvider")))
            ?? (try? c.decode(String.self, forKey: FlexKey("auth_provider")))
        createdAt = (try? c.decode(String.self, forKey: FlexKey("createdAt")))
            ?? (try? c.decode(String.self, forKey: FlexKey("created_at")))
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
