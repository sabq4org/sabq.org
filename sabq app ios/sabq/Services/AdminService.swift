import Foundation

// MARK: - Admin service contract
//
// The dashboard talks to the backend through this protocol. The live
// implementation hits the real `/api/v1/admin/*` endpoints (added in
// `server/routes/mobileApiRoutes.ts`), authenticated by the mobile Bearer
// session + a platform-admin role check on the server.

/// One page of news for a status tab, plus the total count behind it.
struct AdminNewsPage {
    let items: [AdminNewsItem]
    let total: Int
}

protocol AdminServicing: Sendable {
    /// KPI snapshot for the metrics strip.
    func fetchOverview() async throws -> AdminOverview
    /// One page of news for a status tab (newest first), with the total count.
    func fetchNews(status: AdminArticleStatus, page: Int) async throws -> AdminNewsPage
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

private struct AdminNewsListResponse: Decodable {
    let items: [AdminNewsItem]
    let total: Int?
}

/// Page size for the dashboard news tabs.
let adminNewsPageSize = 10

private struct AdminNewsItemResponse: Decodable {
    let item: AdminNewsItem?
}

private struct AdminArticleDetailResponse: Decodable {
    let article: AdminArticleDetail?
}

private struct AdminSummaryResponse: Decodable { let summary: String? }
private struct AdminSEOResponse: Decodable { let seo: AdminSEO? }
private struct AdminUploadResponse: Decodable { let url: String? }

private struct AdminSummaryBody: Encodable { let text: String }
private struct AdminSEOBody: Encodable { let title: String; let content: String; let excerpt: String }
private struct AdminUploadBody: Encodable { let image: String }

// MARK: - Live implementation

/// Talks to the real backend via the shared, Bearer-authenticated `APIClient`.
/// All paths are relative to the mobile API root (`/api/v1`).
struct LiveAdminService: AdminServicing {
    func fetchOverview() async throws -> AdminOverview {
        try await APIClient.shared.get(
            AdminOverview.self,
            path: "/admin/dashboard/stats",
            ignoreCache: true
        )
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
            body: AdminSummaryBody(text: text),
            timeout: 60
        )
        return response.summary ?? ""
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
}
