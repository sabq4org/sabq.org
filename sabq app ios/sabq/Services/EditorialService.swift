import Foundation

// MARK: - لوحة المراسل والمشرف (/api/v1/editorial/*)
//
// تطبيق «سبق» هو أداة المنسوبين على الجوال: المراسل يرى «أخباري» ويطلب
// تعديلًا، ومن يملك articles.publish يرى ما ينتظر قراره. نفس خدمات الويب
// و«مكتب سبق»، فكل قرار يظهر في الثلاثة فورًا.
// العقد: docs/systems/editorial/MOBILE_EDITORIAL_API.md
//
// طلبات هذا الملف لا تمر عبر APIClient.perform لأن رمز الخطأ (`code`) مهم
// هنا: `two_factor_required` يفتح شاشة تفعيل المصادقة الثنائية بدل رسالة عامة.

nonisolated enum EditorialError: LocalizedError, Equatable {
    case unauthorized
    case twoFactorRequired(String)
    case forbidden(String)
    case conflict(String)
    case message(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "سجّل الدخول أولًا"
        case .twoFactorRequired(let m), .forbidden(let m), .conflict(let m), .message(let m): return m
        }
    }
}

// MARK: - Me

nonisolated struct EditorialMe: Decodable, Equatable {
    let userId: String
    let name: String
    let canReport: Bool
    let canNews: Bool
}

// MARK: - أخباري (المراسل)

nonisolated enum MyNewsState: String, Decodable, Equatable {
    case draft, pending, needs_changes, scheduled, published, archived, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = MyNewsState(rawValue: raw) ?? .unknown
    }
}

nonisolated enum MyNewsFilter: String, CaseIterable, Identifiable {
    case all, pending, needs_changes, published, scheduled, draft

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: return "الكل"
        case .pending: return "قيد المراجعة"
        case .needs_changes: return "أُعيد لك"
        case .published: return "منشورة"
        case .scheduled: return "مجدولة"
        case .draft: return "مسودة"
        }
    }
}

nonisolated struct MyNewsItem: Decodable, Identifiable, Equatable {
    struct PendingEditRequest: Decodable, Equatable {
        let id: String
        let label: String
        let createdAt: Date?
    }

    let id: String
    let title: String
    let state: MyNewsState
    let stateLabel: String
    let reviewNotes: String?
    let imageUrl: String?
    let thumbnailUrl: String?
    let categoryName: String?
    let views: Int
    let url: String?
    let createdAt: Date?
    let updatedAt: Date?
    let submittedAt: Date?
    let reviewedAt: Date?
    let scheduledAt: Date?
    let publishedAt: Date?
    let pendingEditRequest: PendingEditRequest?
    let canRequestEdit: Bool

    var thumbnailURL: URL? { EditorialURL.https(thumbnailUrl ?? imageUrl) }

    /// المسار الأخير من رابط الخبر المنشور، لفتحه داخل التطبيق.
    var publishedSlug: String? {
        guard let url = EditorialURL.https(url) else { return nil }
        let slug = url.lastPathComponent
        return slug.isEmpty || slug == "/" ? nil : slug
    }
}

nonisolated struct MyNewsBoard: Decodable, Equatable {
    struct Counts: Decodable, Equatable {
        var all = 0
        var pending = 0
        var needs_changes = 0
        var scheduled = 0
        var published = 0
        var draft = 0

        func count(for filter: MyNewsFilter) -> Int {
            switch filter {
            case .all: return all
            case .pending: return pending
            case .needs_changes: return needs_changes
            case .published: return published
            case .scheduled: return scheduled
            case .draft: return draft
            }
        }
    }

    let counts: Counts
    let editRequestsReady: Bool
    let items: [MyNewsItem]

    init(counts: Counts = Counts(), editRequestsReady: Bool = true, items: [MyNewsItem] = []) {
        self.counts = counts
        self.editRequestsReady = editRequestsReady
        self.items = items
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        counts = try c.decodeIfPresent(Counts.self, forKey: .counts) ?? Counts()
        editRequestsReady = try c.decodeIfPresent(Bool.self, forKey: .editRequestsReady) ?? true
        items = (try c.decodeIfPresent([MyNewsItem].self, forKey: .items) ?? []).filter { $0.state != .unknown }
    }

    private enum CodingKeys: String, CodingKey { case counts, editRequestsReady, items }
}

// MARK: - طلب التعديل (المراسل)

nonisolated struct EditRequestContext: Decodable, Equatable {
    struct Article: Decodable, Equatable {
        let id: String
        let title: String
        let subtitle: String?
        let status: String?
        let imageUrl: String?
        let albumImages: [String]?
    }

    let article: Article
    let paragraphs: [String]
    let acceptsRequests: Bool
    let pendingRequestId: String?
}

nonisolated struct EditRequestDraft: Encodable {
    struct ContentEdit: Encodable {
        let before: String
        let after: String
    }

    struct Proposed: Encodable {
        var title: String?
        var contentEdits: [ContentEdit]?
        var appendParagraph: String?
        var imageUrl: String?
        var albumAdd: [String]?
    }

    let articleId: String
    let urgent: Bool
    let note: String
    let proposed: Proposed
}

// MARK: - المشرف: ما ينتظر قرارك (/editorial/news/*)

nonisolated enum EditorialNewsChannel: String, Decodable, Equatable {
    case app, web, email, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = EditorialNewsChannel(rawValue: raw) ?? .unknown
    }

    var title: String {
        switch self {
        case .app: return "من التطبيق"
        case .web: return "من لوحة التحكم"
        case .email: return "من البريد"
        case .unknown: return ""
        }
    }
}

nonisolated enum EditorialNewsFilter: String, CaseIterable, Identifiable {
    case all
    case reporters
    case editRequests = "edit_requests"
    case email

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: return "الكل"
        case .reporters: return "مراسلون"
        case .editRequests: return "طلبات تعديل"
        case .email: return "البريد"
        }
    }
}

nonisolated enum EditRequestField: String, Decodable, Equatable, Hashable, CaseIterable, Identifiable {
    case title, subtitle, content, imageUrl, albumImages, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = EditRequestField(rawValue: raw) ?? .unknown
    }

    var id: String { rawValue }

    var title: String {
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

nonisolated struct EditorialNewsDraft: Decodable, Equatable, Hashable, Identifiable {
    let id: String
    let title: String
    let channel: EditorialNewsChannel
    let reporterName: String?
    let categoryName: String?
    let imageUrl: String?
    let thumbnailUrl: String?
    let albumCount: Int
    let isBreaking: Bool
    let lockedBy: String?
    let submittedAt: Date?

    var thumbnailURL: URL? { EditorialURL.https(thumbnailUrl ?? imageUrl) }
}

nonisolated struct EditorialNewsEditRequest: Decodable, Equatable, Hashable, Identifiable {
    let id: String
    let articleId: String
    let title: String
    let articleStatus: String?
    let requesterName: String
    let urgent: Bool
    let note: String?
    let label: String?
    let imageUrl: String?
    let submittedAt: Date?

    var onWhat: String { articleStatus == "published" ? "على خبر منشور" : "على مسودة" }
}

nonisolated enum EditorialNewsItem: Decodable, Equatable, Hashable, Identifiable {
    case draft(EditorialNewsDraft)
    case editRequest(EditorialNewsEditRequest)
    case unknown

    private enum CodingKeys: String, CodingKey { case kind }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try? c.decode(String.self, forKey: .kind) {
        case "draft": self = .draft(try EditorialNewsDraft(from: decoder))
        case "edit_request": self = .editRequest(try EditorialNewsEditRequest(from: decoder))
        default: self = .unknown
        }
    }

    var id: String {
        switch self {
        case .draft(let d): return "draft-\(d.id)"
        case .editRequest(let r): return "edit-\(r.id)"
        case .unknown: return "unknown"
        }
    }
}

nonisolated struct EditorialNewsBoard: Decodable, Equatable {
    struct Counts: Decodable, Equatable {
        var all = 0
        var reporters = 0
        var editRequests = 0
        var email = 0

        func count(for filter: EditorialNewsFilter) -> Int {
            switch filter {
            case .all: return all
            case .reporters: return reporters
            case .editRequests: return editRequests
            case .email: return email
            }
        }
    }

    let counts: Counts
    let oldestAt: Date?
    let items: [EditorialNewsItem]

    init(counts: Counts = Counts(), oldestAt: Date? = nil, items: [EditorialNewsItem] = []) {
        self.counts = counts
        self.oldestAt = oldestAt
        self.items = items
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        counts = try c.decodeIfPresent(Counts.self, forKey: .counts) ?? Counts()
        oldestAt = try c.decodeIfPresent(Date.self, forKey: .oldestAt)
        items = (try c.decodeIfPresent([EditorialNewsItem].self, forKey: .items) ?? []).filter { $0 != .unknown }
    }

    private enum CodingKeys: String, CodingKey { case counts, oldestAt, items }

    /// «3 مراسلون · 1 بريد · 1 طلب تعديل».
    var breakdown: String {
        var parts: [String] = []
        if counts.reporters > 0 { parts.append("\(counts.reporters) \(counts.reporters == 1 ? "مراسل" : "مراسلون")") }
        if counts.email > 0 { parts.append("\(counts.email) بريد") }
        if counts.editRequests > 0 {
            parts.append("\(counts.editRequests) \(counts.editRequests == 1 ? "طلب تعديل" : "طلبات تعديل")")
        }
        return parts.joined(separator: " · ")
    }
}

nonisolated struct EditorialCategory: Decodable, Equatable, Hashable, Identifiable {
    let id: String
    let name: String
}

nonisolated struct EditorialNewsPreview: Decodable, Equatable {
    let id: String
    let title: String
    let subtitle: String?
    let status: String
    let content: String
    let imageUrl: String?
    let albumImages: [String]
    let category: EditorialCategory?
    let isBreaking: Bool
    let channel: EditorialNewsChannel
    let reporterName: String?
    let submittedAt: Date?
    let summaryReady: Bool
    let seoReady: Bool
    let lockedBy: String?
    let pendingEditRequestId: String?
    /// نص الخادم كما هو: يُعاد حرفيًا في `expectedUpdatedAt`.
    let updatedAt: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        subtitle = try c.decodeIfPresent(String.self, forKey: .subtitle)
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "draft"
        content = try c.decodeIfPresent(String.self, forKey: .content) ?? ""
        imageUrl = try c.decodeIfPresent(String.self, forKey: .imageUrl)
        albumImages = try c.decodeIfPresent([String].self, forKey: .albumImages) ?? []
        category = try c.decodeIfPresent(EditorialCategory.self, forKey: .category)
        isBreaking = try c.decodeIfPresent(Bool.self, forKey: .isBreaking) ?? false
        channel = try c.decodeIfPresent(EditorialNewsChannel.self, forKey: .channel) ?? .unknown
        reporterName = try c.decodeIfPresent(String.self, forKey: .reporterName)
        submittedAt = try c.decodeIfPresent(Date.self, forKey: .submittedAt)
        summaryReady = try c.decodeIfPresent(Bool.self, forKey: .summaryReady) ?? false
        seoReady = try c.decodeIfPresent(Bool.self, forKey: .seoReady) ?? false
        lockedBy = try c.decodeIfPresent(String.self, forKey: .lockedBy)
        pendingEditRequestId = try c.decodeIfPresent(String.self, forKey: .pendingEditRequestId)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, subtitle, status, content, imageUrl, albumImages, category, isBreaking, channel
        case reporterName, submittedAt, summaryReady, seoReady, lockedBy, pendingEditRequestId, updatedAt
    }

    var heroURL: URL? { EditorialURL.https(imageUrl) }
    var albumURLs: [URL] { albumImages.compactMap { EditorialURL.https($0) } }
    var isDecidable: Bool { status == "draft" || status == "ready_to_publish" }
    var paragraphs: [String] { EditorialText.paragraphs(fromHTML: content) }

    var readinessLine: String? {
        switch (summaryReady, seoReady) {
        case (true, true): return "الموجز والسيو جاهزان"
        case (true, false): return "الموجز جاهز"
        case (false, true): return "السيو جاهز"
        case (false, false): return nil
        }
    }
}

nonisolated struct EditorialActionResult: Decodable, Equatable {
    struct Article: Decodable, Equatable {
        let id: String
        let status: String
        let scheduledAt: Date?
    }

    let article: Article
}

nonisolated struct EditRequestReview: Decodable, Equatable {
    struct Proposed: Decodable, Equatable {
        struct ContentEdit: Decodable, Equatable {
            let before: String
            let after: String
        }

        let title: String?
        let subtitle: String?
        let contentEdits: [ContentEdit]?
        let appendParagraph: String?
        let imageUrl: String?
        let albumAdd: [String]?
    }

    struct Request: Decodable, Equatable {
        let id: String
        let articleId: String
        let status: String
        let urgent: Bool
        let note: String?
        let requesterName: String
        let decidedByName: String?
        let decisionNote: String?
        let proposed: Proposed
        let createdAt: Date?

        var isPending: Bool { status == "pending" }
    }

    struct Article: Decodable, Equatable {
        let id: String
        let title: String
        let subtitle: String?
        let status: String
        let imageUrl: String?
    }

    struct ContentEdit: Decodable, Equatable, Hashable {
        let before: String
        let after: String
        let found: Bool

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            before = try c.decodeIfPresent(String.self, forKey: .before) ?? ""
            after = try c.decodeIfPresent(String.self, forKey: .after) ?? ""
            found = try c.decodeIfPresent(Bool.self, forKey: .found) ?? true
        }

        private enum CodingKeys: String, CodingKey { case before, after, found }
    }

    let request: Request
    let article: Article
    let fields: [EditRequestField]
    let contentEdits: [ContentEdit]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        request = try c.decode(Request.self, forKey: .request)
        article = try c.decode(Article.self, forKey: .article)
        fields = (try c.decodeIfPresent([EditRequestField].self, forKey: .fields) ?? []).filter { $0 != .unknown }
        contentEdits = try c.decodeIfPresent([ContentEdit].self, forKey: .contentEdits) ?? []
    }

    private enum CodingKeys: String, CodingKey { case request, article, fields, contentEdits }

    var hasMissingParagraphs: Bool { contentEdits.contains { !$0.found } }

    /// «اعتمد وطبّق (2 من 3)».
    static func approveTitle(selected: Int, total: Int) -> String {
        total > 1 && selected < total ? "اعتمد وطبّق (\(selected) من \(total))" : "اعتمد وطبّق"
    }
}

nonisolated struct EditRequestApproveResult: Decodable, Equatable {
    let ok: Bool
    let regenerating: Bool?
}

// MARK: - Helpers

nonisolated enum EditorialURL {
    static func https(_ raw: String?) -> URL? {
        guard let raw, let url = URL(string: raw), url.scheme?.lowercased() == "https" else { return nil }
        return url
    }
}

nonisolated enum EditorialText {
    /// فقرات نصية من HTML المحرر (للاستعراض فقط).
    static func paragraphs(fromHTML html: String) -> [String] {
        var text = html
        for tag in ["</p>", "<br>", "<br/>", "<br />", "</h2>", "</h3>", "</li>", "</blockquote>"] {
            text = text.replacingOccurrences(of: tag, with: "\n", options: .caseInsensitive)
        }
        text = text.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        let entities = ["&nbsp;": " ", "&amp;": "&", "&quot;": "\"", "&#39;": "'", "&lt;": "<", "&gt;": ">"]
        for (key, value) in entities { text = text.replacingOccurrences(of: key, with: value) }
        return text
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    static func relative(_ date: Date?) -> String {
        guard let date else { return "" }
        let minutes = max(0, Int(Date().timeIntervalSince(date) / 60))
        if minutes < 1 { return "الآن" }
        if minutes < 60 { return "منذ \(minutes) د" }
        let hours = minutes / 60
        if hours < 24 { return hours == 1 ? "منذ ساعة" : (hours == 2 ? "منذ ساعتين" : "منذ \(hours) ساعات") }
        return dayTime(date)
    }

    /// «أمس 21:10» أو «31 أكتوبر 08:40» بالأرقام اللاتينية والتقويم الميلادي.
    static func dayTime(_ date: Date?) -> String {
        guard let date else { return "" }
        let calendar = Calendar(identifier: .gregorian)
        let time = format(date, "HH:mm")
        if calendar.isDateInToday(date) { return "اليوم \(time)" }
        if calendar.isDateInYesterday(date) { return "أمس \(time)" }
        return "\(format(date, "d MMMM")) \(time)"
    }

    static func todayLine() -> String { format(Date(), "EEEE d MMMM") }

    private static func format(_ date: Date, _ pattern: String) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "ar_SA@numbers=latn;calendar=gregorian")
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = pattern
        return f.string(from: date)
    }
}

// MARK: - Client

nonisolated enum EditorialAPI {
    private struct ErrorBody: Decodable {
        let code: String?
        let message: String?
    }

    private struct Envelope<T: Decodable>: Decodable {
        let article: T
    }

    private struct CategoriesEnvelope: Decodable {
        let categories: [EditorialCategory]
    }

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            let withFraction = ISO8601DateFormatter()
            withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = withFraction.date(from: raw) { return date }
            let plain = ISO8601DateFormatter()
            if let date = plain.date(from: raw) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "bad date \(raw)"))
        }
        return d
    }()

    private static func send<T: Decodable>(
        _ type: T.Type,
        method: String = "GET",
        path: String,
        query: [String: String] = [:],
        body: Encodable? = nil
    ) async throws -> T {
        guard var components = URLComponents(string: URLConstants.mobileAPI + "/editorial" + path) else {
            throw EditorialError.message("رابط غير صالح")
        }
        if !query.isEmpty { components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        guard let url = components.url else { throw EditorialError.message("رابط غير صالح") }
        guard let token = await APIClient.shared.getAuthToken() else { throw EditorialError.unauthorized }

        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(EncodableBox(body))
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw EditorialError.message("تعذر الاتصال. تحقق من الشبكة وحاول مجددًا")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 500
        guard (200...299).contains(status) else {
            let body = try? decoder.decode(ErrorBody.self, from: data)
            let message = body?.message ?? "حدث خطأ (\(status))"
            switch (status, body?.code) {
            case (401, _): throw EditorialError.unauthorized
            case (403, "two_factor_required"?): throw EditorialError.twoFactorRequired(message)
            case (403, _): throw EditorialError.forbidden(message)
            case (409, _): throw EditorialError.conflict(message)
            case (429, _): throw EditorialError.message(body?.message ?? "طلبات كثيرة خلال فترة قصيرة؛ انتظر قليلًا")
            default: throw EditorialError.message(message)
            }
        }
        do {
            return try decoder.decode(type, from: data)
        } catch {
            #if DEBUG
            print("[Editorial] decode failure for \(T.self):", error)
            #endif
            throw EditorialError.message("تعذر قراءة البيانات")
        }
    }

    private struct OK: Decodable {}

    private struct EncodableBox: Encodable {
        let value: Encodable
        init(_ value: Encodable) { self.value = value }
        func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
    }

    // Me
    static func me() async throws -> EditorialMe {
        try await send(EditorialMe.self, path: "/me")
    }

    // Reporter
    static func myNews(filter: MyNewsFilter) async throws -> MyNewsBoard {
        try await send(MyNewsBoard.self, path: "/my-news", query: ["filter": filter.rawValue])
    }

    static func editRequestContext(articleId: String) async throws -> EditRequestContext {
        try await send(EditRequestContext.self, path: "/edit-requests/context/\(articleId)")
    }

    static func createEditRequest(_ draft: EditRequestDraft) async throws {
        _ = try await send(OK.self, method: "POST", path: "/edit-requests", body: draft)
    }

    static func cancelEditRequest(id: String) async throws {
        _ = try await send(OK.self, method: "POST", path: "/edit-requests/\(id)/cancel")
    }

    // Supervisor
    static func newsBoard(filter: EditorialNewsFilter) async throws -> EditorialNewsBoard {
        try await send(EditorialNewsBoard.self, path: "/news", query: ["filter": filter.rawValue])
    }

    static func categories() async throws -> [EditorialCategory] {
        try await send(CategoriesEnvelope.self, path: "/news/categories").categories
    }

    static func preview(id: String) async throws -> EditorialNewsPreview {
        try await send(Envelope<EditorialNewsPreview>.self, path: "/news/\(id)").article
    }

    private struct PublishBody: Encodable {
        let expectedUpdatedAt: String?
        let categoryId: String?
    }

    private struct ScheduleBody: Encodable {
        let scheduledAt: String
        let expectedUpdatedAt: String?
        let categoryId: String?
    }

    static func publish(id: String, expectedUpdatedAt: String?, categoryId: String?) async throws -> EditorialActionResult {
        try await send(EditorialActionResult.self, method: "POST", path: "/news/\(id)/publish",
                       body: PublishBody(expectedUpdatedAt: expectedUpdatedAt, categoryId: categoryId))
    }

    static func schedule(id: String, at date: Date, expectedUpdatedAt: String?, categoryId: String?) async throws -> EditorialActionResult {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        return try await send(EditorialActionResult.self, method: "POST", path: "/news/\(id)/schedule",
                              body: ScheduleBody(scheduledAt: iso.string(from: date),
                                                 expectedUpdatedAt: expectedUpdatedAt, categoryId: categoryId))
    }

    private struct NoteBody: Encodable { let note: String }
    private struct ReasonBody: Encodable { let reason: String }

    static func returnToReporter(id: String, note: String) async throws {
        _ = try await send(OK.self, method: "POST", path: "/news/\(id)/return", body: NoteBody(note: note))
    }

    static func editRequestReview(id: String) async throws -> EditRequestReview {
        try await send(EditRequestReview.self, path: "/news/edit-requests/\(id)")
    }

    private struct ApproveBody: Encodable {
        let fields: [String]?
        let updateLine: String?
        let regenerate: Bool
    }

    static func approveEditRequest(id: String, fields: [EditRequestField]?, updateLine: String?, regenerate: Bool) async throws -> EditRequestApproveResult {
        let line = updateLine?.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await send(EditRequestApproveResult.self, method: "POST", path: "/news/edit-requests/\(id)/approve",
                              body: ApproveBody(fields: fields?.map(\.rawValue),
                                                updateLine: (line?.isEmpty ?? true) ? nil : line,
                                                regenerate: regenerate))
    }

    static func rejectEditRequest(id: String, reason: String) async throws {
        _ = try await send(OK.self, method: "POST", path: "/news/edit-requests/\(id)/reject", body: ReasonBody(reason: reason))
    }
}
