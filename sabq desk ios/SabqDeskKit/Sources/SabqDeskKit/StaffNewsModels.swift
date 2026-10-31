import Foundation

// Codable mirrors of the «الأخبار» tab endpoints (`/api/v1/staff/news/*`,
// shared/staffNews.ts, docs/systems/editorial/STAFF_APP_API.md). Unknown enum
// values fall back to `.unknown` so an additive server change never breaks decoding.

/// Where a news draft came from.
public enum StaffNewsChannel: String, Codable, Sendable {
    case app, web, email, unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffNewsChannel(rawValue: raw) ?? .unknown
    }

    /// «من التطبيق» under the reporter's name.
    public var title: String {
        switch self {
        case .app: return "من التطبيق"
        case .web: return "من لوحة التحكم"
        case .email: return "من البريد"
        case .unknown: return ""
        }
    }
}

/// The chips at the top of «الأخبار».
public enum StaffNewsFilter: String, Codable, Sendable, CaseIterable, Identifiable {
    case all
    case reporters
    case editRequests = "edit_requests"
    case email

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .all: return "الكل"
        case .reporters: return "مراسلون"
        case .editRequests: return "طلبات تعديل"
        case .email: return "البريد"
        }
    }
}

/// A field an edit request proposes to change (`EDIT_REQUEST_FIELDS`).
public enum StaffEditRequestField: String, Codable, Sendable, CaseIterable, Identifiable {
    case title, subtitle, content, imageUrl, albumImages
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffEditRequestField(rawValue: raw) ?? .unknown
    }

    public var id: String { rawValue }

    /// Tag on the list card («عنوان جديد»).
    public var tag: String {
        switch self {
        case .title: return "عنوان جديد"
        case .subtitle: return "عنوان فرعي"
        case .content: return "فقرة معدّلة"
        case .imageUrl: return "صورة بارزة"
        case .albumImages: return "صور للألبوم"
        case .unknown: return "تعديل"
        }
    }

    /// Row title on the review screen.
    public var title: String {
        switch self {
        case .title: return "العنوان"
        case .subtitle: return "العنوان الفرعي"
        case .content: return "النص"
        case .imageUrl: return "الصورة البارزة"
        case .albumImages: return "صور الألبوم"
        case .unknown: return "تعديل"
        }
    }
}

public struct StaffNewsDraft: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var articleId: String
    public var title: String
    public var subtitle: String?
    public var channel: StaffNewsChannel
    public var reporterName: String?
    public var categoryName: String?
    public var imageUrl: String?
    public var thumbnailUrl: String?
    public var albumCount: Int
    public var isBreaking: Bool
    /// A colleague has it open in the web editor right now.
    public var lockedBy: String?
    public var submittedAt: Date

    public init(id: String, articleId: String? = nil, title: String, subtitle: String? = nil,
                channel: StaffNewsChannel = .app, reporterName: String? = nil, categoryName: String? = nil,
                imageUrl: String? = nil, thumbnailUrl: String? = nil, albumCount: Int = 0,
                isBreaking: Bool = false, lockedBy: String? = nil, submittedAt: Date) {
        self.id = id
        self.articleId = articleId ?? id
        self.title = title
        self.subtitle = subtitle
        self.channel = channel
        self.reporterName = reporterName
        self.categoryName = categoryName
        self.imageUrl = imageUrl
        self.thumbnailUrl = thumbnailUrl
        self.albumCount = albumCount
        self.isBreaking = isBreaking
        self.lockedBy = lockedBy
        self.submittedAt = submittedAt
    }

    /// The small picture on the card, https only.
    public var thumbnailURL: URL? { StaffNewsURL.https(thumbnailUrl ?? imageUrl) }
}

public struct StaffNewsEditRequest: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var articleId: String
    public var title: String
    public var articleStatus: String
    public var requesterName: String
    public var urgent: Bool
    public var note: String?
    public var fields: [StaffEditRequestField]
    public var label: String
    public var imageUrl: String?
    public var submittedAt: Date

    public init(id: String, articleId: String, title: String, articleStatus: String = "published",
                requesterName: String, urgent: Bool = false, note: String? = nil,
                fields: [StaffEditRequestField] = [], label: String = "", imageUrl: String? = nil,
                submittedAt: Date) {
        self.id = id
        self.articleId = articleId
        self.title = title
        self.articleStatus = articleStatus
        self.requesterName = requesterName
        self.urgent = urgent
        self.note = note
        self.fields = fields
        self.label = label
        self.imageUrl = imageUrl
        self.submittedAt = submittedAt
    }

    /// «على خبر منشور» / «على مسودة».
    public var onWhat: String { articleStatus == "published" ? "على خبر منشور" : "على مسودة" }
}

/// One card on «الأخبار».
public enum StaffNewsItem: Codable, Sendable, Equatable, Hashable, Identifiable {
    case draft(StaffNewsDraft)
    case editRequest(StaffNewsEditRequest)
    /// A kind this build does not know; skipped by the list.
    case unknown

    private enum Kind: String, Decodable { case draft, edit_request }
    private enum CodingKeys: String, CodingKey { case kind }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try? container.decode(Kind.self, forKey: .kind) {
        case .draft?: self = .draft(try StaffNewsDraft(from: decoder))
        case .edit_request?: self = .editRequest(try StaffNewsEditRequest(from: decoder))
        case nil: self = .unknown
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .draft(let draft):
            try container.encode("draft", forKey: .kind)
            try draft.encode(to: encoder)
        case .editRequest(let request):
            try container.encode("edit_request", forKey: .kind)
            try request.encode(to: encoder)
        case .unknown:
            try container.encode("unknown", forKey: .kind)
        }
    }

    public var id: String {
        switch self {
        case .draft(let d): return "draft-\(d.id)"
        case .editRequest(let r): return "edit-\(r.id)"
        case .unknown: return "unknown"
        }
    }

    public var submittedAt: Date? {
        switch self {
        case .draft(let d): return d.submittedAt
        case .editRequest(let r): return r.submittedAt
        case .unknown: return nil
        }
    }
}

public struct StaffNewsBoard: Codable, Sendable, Equatable {
    public struct Counts: Codable, Sendable, Equatable {
        public var all: Int
        public var reporters: Int
        public var editRequests: Int
        public var email: Int

        public init(all: Int = 0, reporters: Int = 0, editRequests: Int = 0, email: Int = 0) {
            self.all = all
            self.reporters = reporters
            self.editRequests = editRequests
            self.email = email
        }

        public func count(for filter: StaffNewsFilter) -> Int {
            switch filter {
            case .all: return all
            case .reporters: return reporters
            case .editRequests: return editRequests
            case .email: return email
            }
        }
    }

    public var counts: Counts
    public var oldestAt: Date?
    public var editRequestsReady: Bool
    public var items: [StaffNewsItem]

    public init(counts: Counts = Counts(), oldestAt: Date? = nil, editRequestsReady: Bool = true,
                items: [StaffNewsItem] = []) {
        self.counts = counts
        self.oldestAt = oldestAt
        self.editRequestsReady = editRequestsReady
        self.items = items
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        counts = try container.decodeIfPresent(Counts.self, forKey: .counts) ?? Counts()
        oldestAt = try container.decodeIfPresent(Date.self, forKey: .oldestAt)
        editRequestsReady = try container.decodeIfPresent(Bool.self, forKey: .editRequestsReady) ?? true
        items = (try container.decodeIfPresent([StaffNewsItem].self, forKey: .items) ?? []).filter { $0 != .unknown }
    }

    private enum CodingKeys: String, CodingKey { case counts, oldestAt, editRequestsReady, items }

    /// «3 مراسلون · 1 بريد · 1 طلب تعديل» under the summary.
    public var breakdown: String {
        var parts: [String] = []
        if counts.reporters > 0 { parts.append("\(counts.reporters) \(counts.reporters == 1 ? "مراسل" : "مراسلون")") }
        if counts.email > 0 { parts.append("\(counts.email) بريد") }
        if counts.editRequests > 0 {
            parts.append("\(counts.editRequests) \(counts.editRequests == 1 ? "طلب تعديل" : "طلبات تعديل")")
        }
        return parts.joined(separator: " · ")
    }
}

public struct StaffNewsCategory: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

public struct StaffNewsPreview: Codable, Sendable, Equatable {
    public var id: String
    public var title: String
    public var subtitle: String?
    public var status: String
    public var reviewStatus: String?
    /// HTML as the reporter or the email agent saved it.
    public var content: String
    public var excerpt: String?
    public var imageUrl: String?
    public var albumImages: [String]
    public var category: StaffNewsCategory?
    public var isBreaking: Bool
    public var channel: StaffNewsChannel
    public var reporterName: String?
    public var submittedAt: Date?
    public var summaryReady: Bool
    public var seoReady: Bool
    public var lockedBy: String?
    public var webEditUrl: String?
    public var pendingEditRequestId: String?
    /// Kept as the server's string: sent back verbatim as `expectedUpdatedAt`.
    public var updatedAt: String?

    public init(id: String, title: String, subtitle: String? = nil, status: String = "draft",
                reviewStatus: String? = "pending_review", content: String = "", excerpt: String? = nil,
                imageUrl: String? = nil, albumImages: [String] = [], category: StaffNewsCategory? = nil,
                isBreaking: Bool = false, channel: StaffNewsChannel = .app, reporterName: String? = nil,
                submittedAt: Date? = nil, summaryReady: Bool = false, seoReady: Bool = false,
                lockedBy: String? = nil, webEditUrl: String? = nil, pendingEditRequestId: String? = nil,
                updatedAt: String? = nil) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.status = status
        self.reviewStatus = reviewStatus
        self.content = content
        self.excerpt = excerpt
        self.imageUrl = imageUrl
        self.albumImages = albumImages
        self.category = category
        self.isBreaking = isBreaking
        self.channel = channel
        self.reporterName = reporterName
        self.submittedAt = submittedAt
        self.summaryReady = summaryReady
        self.seoReady = seoReady
        self.lockedBy = lockedBy
        self.webEditUrl = webEditUrl
        self.pendingEditRequestId = pendingEditRequestId
        self.updatedAt = updatedAt
    }

    public var heroURL: URL? { StaffNewsURL.https(imageUrl) }
    public var albumURLs: [URL] { albumImages.compactMap { StaffNewsURL.https($0) } }
    public var webEditURL: URL? { StaffNewsURL.https(webEditUrl) }
    /// Still waiting for a decision (not published, scheduled or archived).
    public var isDecidable: Bool { status == "draft" || status == "ready_to_publish" }

    /// «الموجز والسيو جاهزان».
    public var readinessLine: String? {
        switch (summaryReady, seoReady) {
        case (true, true): return "الموجز والسيو جاهزان"
        case (true, false): return "الموجز جاهز"
        case (false, true): return "السيو جاهز"
        case (false, false): return nil
        }
    }
}

struct StaffNewsPreviewEnvelope: Decodable {
    var article: StaffNewsPreview
}

struct StaffNewsCategoriesEnvelope: Decodable {
    var categories: [StaffNewsCategory]
}

public struct StaffNewsActionResult: Codable, Sendable, Equatable {
    public struct Article: Codable, Sendable, Equatable {
        public var id: String
        public var status: String
        public var publishedAt: Date?
        public var scheduledAt: Date?
        public var url: String?
    }

    public var article: Article
}

/// One paragraph the reporter rewrote (`contentEdits`).
public struct StaffEditRequestContentEdit: Codable, Sendable, Equatable, Hashable {
    public var before: String
    public var after: String
    /// The paragraph still exists in the article; false = edit in the web editor.
    public var found: Bool

    public init(before: String, after: String, found: Bool = true) {
        self.before = before
        self.after = after
        self.found = found
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        before = try container.decodeIfPresent(String.self, forKey: .before) ?? ""
        after = try container.decodeIfPresent(String.self, forKey: .after) ?? ""
        found = try container.decodeIfPresent(Bool.self, forKey: .found) ?? true
    }

    private enum CodingKeys: String, CodingKey { case before, after, found }
}

public struct StaffEditRequestDetail: Codable, Sendable, Equatable {
    public struct Proposed: Codable, Sendable, Equatable {
        public var title: String?
        public var subtitle: String?
        public var appendParagraph: String?
        public var imageUrl: String?
        public var albumAdd: [String]?

        public init(title: String? = nil, subtitle: String? = nil, appendParagraph: String? = nil,
                    imageUrl: String? = nil, albumAdd: [String]? = nil) {
            self.title = title
            self.subtitle = subtitle
            self.appendParagraph = appendParagraph
            self.imageUrl = imageUrl
            self.albumAdd = albumAdd
        }
    }

    public struct Request: Codable, Sendable, Equatable {
        public var id: String
        public var articleId: String
        public var status: String
        public var urgent: Bool
        public var note: String?
        public var requesterName: String
        public var decidedByName: String?
        public var decisionNote: String?
        public var proposed: Proposed
        public var createdAt: Date

        public init(id: String, articleId: String, status: String = "pending", urgent: Bool = false,
                    note: String? = nil, requesterName: String, decidedByName: String? = nil,
                    decisionNote: String? = nil, proposed: Proposed = Proposed(), createdAt: Date) {
            self.id = id
            self.articleId = articleId
            self.status = status
            self.urgent = urgent
            self.note = note
            self.requesterName = requesterName
            self.decidedByName = decidedByName
            self.decisionNote = decisionNote
            self.proposed = proposed
            self.createdAt = createdAt
        }

        public var isPending: Bool { status == "pending" }
    }

    public struct Article: Codable, Sendable, Equatable {
        public var id: String
        public var title: String
        public var subtitle: String?
        public var status: String
        public var imageUrl: String?
        public var albumImages: [String]?

        public init(id: String, title: String, subtitle: String? = nil, status: String = "published",
                    imageUrl: String? = nil, albumImages: [String]? = nil) {
            self.id = id
            self.title = title
            self.subtitle = subtitle
            self.status = status
            self.imageUrl = imageUrl
            self.albumImages = albumImages
        }
    }

    public var request: Request
    public var article: Article
    public var fields: [StaffEditRequestField]
    public var contentEdits: [StaffEditRequestContentEdit]

    public init(request: Request, article: Article, fields: [StaffEditRequestField],
                contentEdits: [StaffEditRequestContentEdit] = []) {
        self.request = request
        self.article = article
        self.fields = fields
        self.contentEdits = contentEdits
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        request = try container.decode(Request.self, forKey: .request)
        article = try container.decode(Article.self, forKey: .article)
        fields = (try container.decodeIfPresent([StaffEditRequestField].self, forKey: .fields) ?? [])
            .filter { $0 != .unknown }
        contentEdits = try container.decodeIfPresent([StaffEditRequestContentEdit].self, forKey: .contentEdits) ?? []
    }

    private enum CodingKeys: String, CodingKey { case request, article, fields, contentEdits }

    /// Some rewritten paragraphs no longer exist: applying «النص» would skip them.
    public var hasMissingParagraphs: Bool { contentEdits.contains { !$0.found } }

    /// «اعتمد وطبّق (2 من 3)».
    public static func approveTitle(selected: Int, total: Int) -> String {
        total > 1 && selected < total ? "اعتمد وطبّق (\(selected) من \(total))" : "اعتمد وطبّق"
    }
}

public struct StaffEditRequestApproveResult: Codable, Sendable, Equatable {
    public var ok: Bool
    public var appliedFields: [StaffEditRequestField]
    public var regenerating: Bool?

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ok = try container.decodeIfPresent(Bool.self, forKey: .ok) ?? true
        appliedFields = (try container.decodeIfPresent([StaffEditRequestField].self, forKey: .appliedFields) ?? [])
            .filter { $0 != .unknown }
        regenerating = try container.decodeIfPresent(Bool.self, forKey: .regenerating)
    }

    private enum CodingKeys: String, CodingKey { case ok, appliedFields, regenerating }
}

enum StaffNewsURL {
    static func https(_ raw: String?) -> URL? {
        guard let raw, let url = URL(string: raw), url.scheme?.lowercased() == "https" else { return nil }
        return url
    }
}
