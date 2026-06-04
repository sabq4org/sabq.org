import Foundation

// MARK: - Admin service contract
//
// The dashboard talks to the backend through this protocol. The live
// implementation hits the real `/api/v1/admin/*` endpoints (added in
// `server/routes/mobileApiRoutes.ts`), authenticated by the mobile Bearer
// session + a platform-admin role check on the server.

protocol AdminServicing: Sendable {
    /// KPI snapshot for the metrics strip.
    func fetchOverview() async throws -> AdminOverview
    /// News items filtered by editorial status, newest first.
    func fetchNews(status: AdminArticleStatus) async throws -> [AdminNewsItem]
    /// Flip an item to `.published` and return the updated record.
    func publish(id: String) async throws -> AdminNewsItem
    /// Persist edits coming back from the simplified editor.
    func saveEdit(_ item: AdminNewsItem) async throws -> AdminNewsItem
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
}

private struct AdminNewsItemResponse: Decodable {
    let item: AdminNewsItem?
}

/// Body sent to PATCH /admin/articles/:id.
private struct AdminEditBody: Encodable {
    let title: String
    let excerpt: String
    let body: String
    let status: String
}

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

    func fetchNews(status: AdminArticleStatus) async throws -> [AdminNewsItem] {
        let response = try await APIClient.shared.get(
            AdminNewsListResponse.self,
            path: "/admin/articles",
            query: ["status": status.rawValue],
            ignoreCache: true
        )
        return response.items
    }

    func publish(id: String) async throws -> AdminNewsItem {
        let response = try await APIClient.shared.post(
            AdminNewsItemResponse.self,
            path: "/admin/articles/\(id)/publish"
        )
        guard let item = response.item else { throw AdminServiceError.missingItem }
        return item
    }

    func saveEdit(_ item: AdminNewsItem) async throws -> AdminNewsItem {
        let response = try await APIClient.shared.patch(
            AdminNewsItemResponse.self,
            path: "/admin/articles/\(item.id)",
            body: AdminEditBody(
                title: item.title,
                excerpt: item.excerpt,
                body: item.body,
                status: item.status.rawValue
            )
        )
        guard let updated = response.item else { throw AdminServiceError.missingItem }
        return updated
    }
}
