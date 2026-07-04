import Foundation

// MARK: - Admin service contract
//
// The dashboard talks to the backend through this protocol. The live
// implementation hits the real `/api/v1/admin/*` endpoints (added in
// `server/routes/mobileApiRoutes.ts`), authenticated by the mobile Bearer
// session + a platform-admin role check on the server.

/// One page of news for a status tab, plus the total count behind it.
nonisolated struct AdminNewsPage {
    let items: [AdminNewsItem]
    let total: Int
}

protocol AdminServicing: Sendable {
    /// KPI groups for the overview cards (mirrors the web /dashboard).
    func fetchFullStats() async throws -> AdminFullStats
    /// Lightweight draft + scheduled counts for the simplified overview.
    func fetchCounts() async throws -> AdminCounts
    /// One page of news for a status tab (newest first), with the total count.
    func fetchNews(status: AdminArticleStatus, page: Int) async throws -> AdminNewsPage
    /// Create a new article (خبر جديد / مقال رأي); returns the new id.
    func createArticle(_ body: AdminCreateBody) async throws -> String
    /// Flip an item to `.published` and return the updated record.
    func publish(id: String) async throws -> AdminNewsItem
    /// Full article for the editor.
    func fetchDetail(id: String) async throws -> AdminArticleDetail
    /// Persist all editor fields.
    func saveArticle(id: String, payload: AdminArticleEditPayload) async throws

    // AI tools
    /// الموجز الذكي — summarize plain text.
    func generateSummary(text: String) async throws -> String
    /// توليد SEO + الكلمات المفتاحية from title/content/excerpt.
    func generateSEO(title: String, content: String, excerpt: String) async throws -> AdminSEO
    /// رفع صورة — base64 data URI → Cloudflare Images, returns the URL.
    func uploadImage(dataURI: String) async throws -> String
    /// توليد ذكي شامل — fills fields, keeps content.
    func generateAll(content: String) async throws -> AdminGenerationResult
    /// تحرير وتوليد شامل — rewrites content + fills fields.
    func editAndGenerate(content: String) async throws -> AdminGenerationResult
    /// تدقيق لغوي — returns spelling issues.
    func proofread(content: String) async throws -> [AdminProofIssue]
    /// توليد صورة بضغطة واحدة — يستخدم إعدادات auto-image المحفوظة + المحتوى.
    func autoGenerateImage(articleId: String, title: String, content: String, excerpt: String, category: String, articleType: String) async throws -> String
    /// قائمة المراسلين / كتّاب الرأي للمنتقي.
    func fetchUsers(role: String, query: String) async throws -> [AdminUser]

    // Editorial workflow
    /// أرشفة (حذف ناعم) بسبب — يُشعر الكاتب.
    func archive(id: String, reason: String) async throws
    /// طلب تعديل بملاحظات — يعيد للمسودات ويُشعر الكاتب.
    func requestRevision(id: String, notes: String) async throws
    /// حذف نهائي (للمؤرشفة فقط).
    func permanentDelete(id: String, reason: String) async throws
}

enum AdminServiceError: LocalizedError {
    case missingItem

    var errorDescription: String? {
        switch self {
        case .missingItem: return "تعذّر قراءة بيانات الخبر"
        }
    }
}

// MARK: - Response envelopes

private nonisolated struct AdminNewsListResponse: Decodable {
    let items: [AdminNewsItem]
    let total: Int?
}

/// Page size for the dashboard news tabs.
let adminNewsPageSize = 10

private nonisolated struct AdminNewsItemResponse: Decodable {
    let item: AdminNewsItem?
}

private nonisolated struct AdminArticleDetailResponse: Decodable {
    let article: AdminArticleDetail?
}

private nonisolated struct AdminSummaryResponse: Decodable { let summary: String? }
private nonisolated struct AdminSEOResponse: Decodable { let seo: AdminSEO? }
private nonisolated struct AdminUploadResponse: Decodable { let url: String? }
private nonisolated struct AdminGenerationResponse: Decodable { let result: AdminGenerationResult? }
private nonisolated struct AdminProofreadResponse: Decodable { let issues: [AdminProofIssue]? }
private nonisolated struct AdminImageGenResponse: Decodable { let imageUrl: String? }
private nonisolated struct AdminUsersResponse: Decodable { let items: [AdminUser]? }
private nonisolated struct AdminCreateResponse: Decodable { let id: String? }

private nonisolated struct AdminContentBody: Encodable { let content: String }
private nonisolated struct AdminSEOBody: Encodable { let title: String; let content: String; let excerpt: String }
private nonisolated struct AdminUploadBody: Encodable { let image: String }

/// Body for the one-click auto-image generation.
private nonisolated struct AdminAutoImageBody: Encodable {
    let articleId: String
    let title: String
    let content: String
    let excerpt: String
    let category: String
    let articleType: String
}
private nonisolated struct AdminReviewNotesBody: Encodable { let reviewNotes: String }
private nonisolated struct AdminDeletionBody: Encodable { let deletionReason: String }

// MARK: - Live implementation

/// Talks to the real backend via the shared, Bearer-authenticated `APIClient`.
/// All paths are relative to the mobile API root (`/api/v1`).
struct LiveAdminService: AdminServicing {
    func fetchFullStats() async throws -> AdminFullStats {
        try await APIClient.shared.get(
            AdminFullStats.self,
            path: "/admin/dashboard/full-stats",
            ignoreCache: true
        )
    }

    func fetchCounts() async throws -> AdminCounts {
        try await APIClient.shared.get(
            AdminCounts.self,
            path: "/admin/dashboard/counts",
            ignoreCache: true
        )
    }

    func createArticle(_ body: AdminCreateBody) async throws -> String {
        let response = try await APIClient.shared.post(
            AdminCreateResponse.self,
            path: "/admin/articles",
            body: body,
            timeout: 30
        )
        guard let id = response.id, !id.isEmpty else { throw AdminServiceError.missingItem }
        return id
    }

    func fetchNews(status: AdminArticleStatus, page: Int) async throws -> AdminNewsPage {
        let response = try await APIClient.shared.get(
            AdminNewsListResponse.self,
            path: "/admin/articles",
            query: [
                "status": status.rawValue,
                "page": "\(page)",
                "limit": "\(adminNewsPageSize)",
            ],
            ignoreCache: true
        )
        return AdminNewsPage(items: response.items, total: response.total ?? response.items.count)
    }

    func publish(id: String) async throws -> AdminNewsItem {
        let response = try await APIClient.shared.post(
            AdminNewsItemResponse.self,
            path: "/admin/articles/\(id)/publish"
        )
        guard let item = response.item else { throw AdminServiceError.missingItem }
        return item
    }

    func fetchDetail(id: String) async throws -> AdminArticleDetail {
        let response = try await APIClient.shared.get(
            AdminArticleDetailResponse.self,
            path: "/admin/articles/\(id)",
            ignoreCache: true
        )
        guard let article = response.article else { throw AdminServiceError.missingItem }
        return article
    }

    func saveArticle(id: String, payload: AdminArticleEditPayload) async throws {
        _ = try await APIClient.shared.patch(
            AdminNewsItemResponse.self,
            path: "/admin/articles/\(id)",
            body: payload
        )
    }

    func generateSummary(text: String) async throws -> String {
        let response = try await APIClient.shared.post(
            AdminSummaryResponse.self,
            path: "/admin/ai/summarize",
            body: AdminContentBody(content: text),
            timeout: 60
        )
        return response.summary ?? ""
    }

    func generateAll(content: String) async throws -> AdminGenerationResult {
        let response = try await APIClient.shared.post(
            AdminGenerationResponse.self,
            path: "/admin/ai/generate-all",
            body: AdminContentBody(content: content),
            timeout: 90
        )
        guard let result = response.result else { throw AdminServiceError.missingItem }
        return result
    }

    func editAndGenerate(content: String) async throws -> AdminGenerationResult {
        let response = try await APIClient.shared.post(
            AdminGenerationResponse.self,
            path: "/admin/ai/edit-and-generate",
            body: AdminContentBody(content: content),
            timeout: 120
        )
        guard let result = response.result else { throw AdminServiceError.missingItem }
        return result
    }

    func proofread(content: String) async throws -> [AdminProofIssue] {
        let response = try await APIClient.shared.post(
            AdminProofreadResponse.self,
            path: "/admin/ai/proofread",
            body: AdminContentBody(content: content),
            timeout: 90
        )
        return response.issues ?? []
    }

    func autoGenerateImage(articleId: String, title: String, content: String, excerpt: String, category: String, articleType: String) async throws -> String {
        let response = try await APIClient.shared.post(
            AdminImageGenResponse.self,
            path: "/admin/auto-image/generate",
            body: AdminAutoImageBody(
                articleId: articleId, title: title, content: content,
                excerpt: excerpt, category: category, articleType: articleType
            ),
            timeout: 180
        )
        guard let url = response.imageUrl, !url.isEmpty else { throw AdminServiceError.missingItem }
        return url
    }

    func fetchUsers(role: String, query: String) async throws -> [AdminUser] {
        var q = ["role": role]
        if !query.isEmpty { q["query"] = query }
        let response = try await APIClient.shared.get(
            AdminUsersResponse.self,
            path: "/admin/users",
            query: q,
            ignoreCache: true
        )
        return response.items ?? []
    }

    func generateSEO(title: String, content: String, excerpt: String) async throws -> AdminSEO {
        let response = try await APIClient.shared.post(
            AdminSEOResponse.self,
            path: "/admin/seo/generate",
            body: AdminSEOBody(title: title, content: content, excerpt: excerpt),
            timeout: 60
        )
        return response.seo ?? AdminSEO()
    }

    func uploadImage(dataURI: String) async throws -> String {
        let response = try await APIClient.shared.post(
            AdminUploadResponse.self,
            path: "/admin/media/upload",
            body: AdminUploadBody(image: dataURI),
            timeout: 90
        )
        guard let url = response.url, !url.isEmpty else { throw AdminServiceError.missingItem }
        return url
    }

    func archive(id: String, reason: String) async throws {
        _ = try await APIClient.shared.post(
            AdminNewsItemResponse.self,
            path: "/admin/articles/\(id)/archive",
            body: AdminReviewNotesBody(reviewNotes: reason)
        )
    }

    func requestRevision(id: String, notes: String) async throws {
        _ = try await APIClient.shared.post(
            AdminNewsItemResponse.self,
            path: "/admin/articles/\(id)/request-revision",
            body: AdminReviewNotesBody(reviewNotes: notes)
        )
    }

    func permanentDelete(id: String, reason: String) async throws {
        try await APIClient.shared.deleteRaw(
            path: "/admin/articles/\(id)/permanent",
            body: AdminDeletionBody(deletionReason: reason)
        )
    }
}
