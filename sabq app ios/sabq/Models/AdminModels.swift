import SwiftUI

// MARK: - Admin Dashboard models
//
// Data layer for the in-app admin dashboard. These decode the REAL backend
// payloads from `/api/v1/admin/*` (see `AdminService.swift`). No mock data —
// this is a production surface.

// MARK: Article status

/// The four real editorial states on `articles.status`, matching the web CMS.
/// Drives the segmented control, the per-item badge, and the metric tiles.
nonisolated enum AdminArticleStatus: String, CaseIterable, Codable, Identifiable, Hashable {
    case draft
    case scheduled
    case published
    case archived

    var id: String { rawValue }

    /// Plural/section label used in the segmented control.
    var label: String {
        switch self {
        case .draft:     return "المسودات"
        case .scheduled: return "المجدولة"
        case .published: return "المنشورة"
        case .archived:  return "المؤرشفة"
        }
    }

    /// Singular label used on an individual item's badge.
    var badgeLabel: String {
        switch self {
        case .draft:     return "مسودة"
        case .scheduled: return "مجدول"
        case .published: return "منشور"
        case .archived:  return "مؤرشف"
        }
    }

    var icon: String {
        switch self {
        case .draft:     return "doc.text"
        case .scheduled: return "clock.fill"
        case .published: return "checkmark.seal.fill"
        case .archived:  return "archivebox.fill"
        }
    }

    var tint: Color {
        switch self {
        case .draft:     return SabqTheme.gold
        case .scheduled: return SabqTheme.sky
        case .published: return SabqTheme.teal
        case .archived:  return SabqTheme.coral
        }
    }
}

// MARK: News item

/// A single news row in the dashboard. Decoded from `/api/v1/admin/articles`.
/// Deliberately flat — the simplified editor edits these fields directly.
nonisolated struct AdminNewsItem: Identifiable, Hashable, Decodable {
    let id: String
    var title: String
    var excerpt: String
    var body: String
    var status: AdminArticleStatus
    var author: String
    var updatedAt: Date
    var views: Int
    /// Publish date/time for scheduled items.
    var scheduledAt: Date?
    /// Editorial review state — "needs_changes" drives the amber revision cue.
    var reviewStatus: String?
    /// Editor's note (revision request / archive reason).
    var reviewNotes: String?

    /// True when an editor sent this back to the author for changes.
    var awaitingRevision: Bool { reviewStatus == "needs_changes" }

    private enum CodingKeys: String, CodingKey {
        case id, title, excerpt, body, status, author, updatedAt, views, scheduledAt, reviewStatus, reviewNotes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        excerpt = (try? c.decode(String.self, forKey: .excerpt)) ?? ""
        body = (try? c.decode(String.self, forKey: .body)) ?? ""
        status = (try? c.decode(AdminArticleStatus.self, forKey: .status)) ?? .draft
        author = (try? c.decode(String.self, forKey: .author)) ?? ""
        views = (try? c.decode(Int.self, forKey: .views)) ?? 0
        reviewStatus = try? c.decodeIfPresent(String.self, forKey: .reviewStatus)
        reviewNotes = try? c.decodeIfPresent(String.self, forKey: .reviewNotes)
        // Backend sends ISO-8601 strings; reuse the app's tolerant parser.
        let dateString = (try? c.decode(String.self, forKey: .updatedAt)) ?? ""
        updatedAt = SabqFormatters.parseISO8601(dateString) ?? Date()
        let schedString = (try? c.decode(String.self, forKey: .scheduledAt)) ?? ""
        scheduledAt = SabqFormatters.parseISO8601(schedString)
    }
}

// MARK: Overview stats (mirrors the web /dashboard cards)

/// KPI groups decoded from `/api/v1/admin/dashboard/full-stats`. One tolerant
/// `Group` shape (all-optional) covers every card so missing keys never throw.
nonisolated struct AdminFullStats: Decodable {
    nonisolated struct Group: Decodable {
        var total: Int?
        var published: Int?
        var draft: Int?
        var scheduled: Int?
        var active24h: Int?
        var newThisWeek: Int?
        var pending: Int?
        var approved: Int?
        var completed: Int?
        var thisWeek: Int?
        var totalFiles: Int?
        var totalSize: Int?
    }

    var articles: Group?
    var users: Group?
    var comments: Group?
    var mediaLibrary: Group?
    var aiTasks: Group?
    var aiImages: Group?
    var smartBlocks: Group?

    /// The 7 cards the user selected, built here so labels/formatting live
    /// next to the data.
    func cards() -> [AdminStatCard] {
        func n(_ v: Int?) -> String { SabqFormatters.compactViewCount(v ?? 0) }
        func mb(_ bytes: Int?) -> String {
            let m = Double(bytes ?? 0) / (1024 * 1024)
            return m >= 1024 ? String(format: "%.1f GB", m / 1024) : String(format: "%.0f MB", m)
        }
        return [
            AdminStatCard(key: "articles", title: "المقالات", value: n(articles?.total),
                          breakdown: "\(articles?.published ?? 0) منشور · \(articles?.draft ?? 0) مسودة · \(articles?.scheduled ?? 0) مجدولة",
                          icon: "doc.text.fill", tint: SabqTheme.sky),
            AdminStatCard(key: "users", title: "المستخدمون", value: n(users?.total),
                          breakdown: "\(users?.active24h ?? 0) نشط اليوم · \(users?.newThisWeek ?? 0) جديد",
                          icon: "person.2.fill", tint: SabqTheme.teal),
            AdminStatCard(key: "comments", title: "التعليقات", value: n(comments?.total),
                          breakdown: "\(comments?.pending ?? 0) قيد المراجعة · \(comments?.approved ?? 0) موافق",
                          icon: "bubble.left.and.bubble.right.fill", tint: SabqTheme.gold),
            AdminStatCard(key: "media", title: "مكتبة الوسائط", value: n(mediaLibrary?.totalFiles),
                          breakdown: "\(mb(mediaLibrary?.totalSize)) إجمالي",
                          icon: "externaldrive.fill", tint: SabqTheme.coral),
            AdminStatCard(key: "aiImages", title: "صور الذكاء", value: n(aiImages?.total),
                          breakdown: "\(aiImages?.thisWeek ?? 0) هذا الأسبوع",
                          icon: "photo.fill", tint: SabqTheme.sky),
            AdminStatCard(key: "smartBlocks", title: "القوالب الذكية", value: n(smartBlocks?.total),
                          breakdown: nil, icon: "square.grid.2x2.fill", tint: SabqTheme.gold),
        ]
    }
}

/// One compact KPI tile.
nonisolated struct AdminStatCard: Identifiable {
    let key: String
    let title: String
    let value: String
    let breakdown: String?
    let icon: String
    let tint: Color

    var id: String { key }
}

/// Lightweight overview — just the two counts the simplified dashboard shows.
nonisolated struct AdminCounts: Decodable {
    var draft: Int
    var scheduled: Int
}

// MARK: - Full editor detail

/// SEO sub-object stored in `articles.seo` jsonb.
nonisolated struct AdminSEO: Codable, Hashable {
    var metaTitle: String = ""
    var metaDescription: String = ""
    var keywords: [String] = []
}

/// Complete editor payload decoded from `GET /api/v1/admin/articles/:id`.
nonisolated struct AdminArticleDetail: Decodable, Hashable {
    let id: String
    var title: String
    var subtitle: String
    var excerpt: String
    var content: String          // HTML
    var slug: String
    var status: AdminArticleStatus
    var articleType: String
    var newsType: String
    var categoryId: String?
    var categoryName: String?
    var reporterId: String?
    var reporterName: String?
    var authorId: String?
    var authorName: String?
    var isFeatured: Bool
    var hideFromHomepage: Bool
    var aiSummary: String
    var imageUrl: String
    var thumbnailUrl: String
    var seo: AdminSEO
    var scheduledAt: Date?
    var publishedAt: Date?
    var views: Int

    private enum CodingKeys: String, CodingKey {
        case id, title, subtitle, excerpt, content, slug, status, articleType, newsType
        case categoryId, categoryName, reporterId, reporterName, authorId, authorName, isFeatured, hideFromHomepage
        case aiSummary, imageUrl, thumbnailUrl, seo, scheduledAt, publishedAt, views
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        func str(_ k: CodingKeys) -> String { (try? c.decode(String.self, forKey: k)) ?? "" }
        title = str(.title)
        subtitle = str(.subtitle)
        excerpt = str(.excerpt)
        content = str(.content)
        slug = str(.slug)
        status = (try? c.decode(AdminArticleStatus.self, forKey: .status)) ?? .draft
        articleType = (try? c.decode(String.self, forKey: .articleType)) ?? "news"
        newsType = (try? c.decode(String.self, forKey: .newsType)) ?? "regular"
        categoryId = try? c.decodeIfPresent(String.self, forKey: .categoryId)
        categoryName = try? c.decodeIfPresent(String.self, forKey: .categoryName)
        reporterId = try? c.decodeIfPresent(String.self, forKey: .reporterId)
        reporterName = try? c.decodeIfPresent(String.self, forKey: .reporterName)
        authorId = try? c.decodeIfPresent(String.self, forKey: .authorId)
        authorName = try? c.decodeIfPresent(String.self, forKey: .authorName)
        isFeatured = (try? c.decode(Bool.self, forKey: .isFeatured)) ?? false
        hideFromHomepage = (try? c.decode(Bool.self, forKey: .hideFromHomepage)) ?? false
        aiSummary = str(.aiSummary)
        imageUrl = str(.imageUrl)
        thumbnailUrl = str(.thumbnailUrl)
        seo = (try? c.decode(AdminSEO.self, forKey: .seo)) ?? AdminSEO()
        views = (try? c.decode(Int.self, forKey: .views)) ?? 0
        let sched = (try? c.decode(String.self, forKey: .scheduledAt)) ?? ""
        scheduledAt = SabqFormatters.parseISO8601(sched)
        let pub = (try? c.decode(String.self, forKey: .publishedAt)) ?? ""
        publishedAt = SabqFormatters.parseISO8601(pub)
    }
}

// MARK: - AI tool results

/// Unified result from توليد ذكي شامل / تحرير وتوليد شامل. Only the present
/// fields are applied to the editor (content is set only by edit-and-generate).
nonisolated struct AdminGenerationResult: Decodable {
    var title: String?
    var subtitle: String?
    var summary: String?
    var keywords: [String]?
    var seoTitle: String?
    var seoDescription: String?
    var categoryId: String?
    var categoryName: String?
    var content: String?

    private enum CodingKeys: String, CodingKey {
        case title, subtitle, summary, keywords, seo, categoryId, categoryName, content
    }
    private enum SEOKeys: String, CodingKey { case metaTitle, metaDescription }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        title = try? c.decodeIfPresent(String.self, forKey: .title)
        subtitle = try? c.decodeIfPresent(String.self, forKey: .subtitle)
        summary = try? c.decodeIfPresent(String.self, forKey: .summary)
        keywords = try? c.decodeIfPresent([String].self, forKey: .keywords)
        categoryId = try? c.decodeIfPresent(String.self, forKey: .categoryId)
        categoryName = try? c.decodeIfPresent(String.self, forKey: .categoryName)
        content = try? c.decodeIfPresent(String.self, forKey: .content)
        if let seo = try? c.nestedContainer(keyedBy: SEOKeys.self, forKey: .seo) {
            seoTitle = try? seo.decodeIfPresent(String.self, forKey: .metaTitle)
            seoDescription = try? seo.decodeIfPresent(String.self, forKey: .metaDescription)
        }
    }
}

/// One proofreading issue (original → suggestion).
nonisolated struct AdminProofIssue: Decodable, Identifiable, Hashable {
    let original: String
    let suggestion: String
    var type: String?
    var explanation: String?
    var id: String { "\(original)→\(suggestion)" }
}

/// Body sent to PATCH /api/v1/admin/articles/:id. Nil optionals are omitted
/// by JSONEncoder, so the backend treats them as "no change".
nonisolated struct AdminArticleEditPayload: Encodable {
    var title: String
    var subtitle: String
    var excerpt: String
    var content: String
    var status: String
    var newsType: String
    var isFeatured: Bool
    var hideFromHomepage: Bool
    var aiSummary: String
    var imageUrl: String
    var categoryId: String?
    var reporterId: String?
    var authorId: String?
    var scheduledAt: String?
    var seo: AdminSEO
}

/// Body sent to POST /api/v1/admin/articles (create). Carries `articleType`
/// and `opinionAuthorId` (opinion byline) which the edit payload doesn't.
nonisolated struct AdminCreateBody: Encodable {
    var title: String
    var subtitle: String
    var excerpt: String
    var content: String
    var status: String
    var articleType: String
    var newsType: String
    var isFeatured: Bool
    var hideFromHomepage: Bool
    var aiSummary: String
    var imageUrl: String
    var categoryId: String?
    var reporterId: String?
    var opinionAuthorId: String?
    var scheduledAt: String?
    var seo: AdminSEO
}

/// A staff member shown in the reporter / opinion-author picker.
nonisolated struct AdminUser: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    var email: String?
    var avatarUrl: String?
}
