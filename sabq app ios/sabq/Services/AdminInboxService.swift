import Foundation

/// API contract for the two editorial inboxes available to platform admins.
/// Keeping it separate from article administration makes both inboxes easy to
/// test with a fixture service and prevents dashboard/editor code from growing
/// another unrelated responsibility.
protocol AdminInboxServicing: Sendable {
    func fetchContactMessages(page: Int, status: AdminContactMessageStatus?, search: String) async throws -> AdminContactMessagesResponse
    func fetchContactMessage(id: String) async throws -> AdminContactMessageDetailResponse
    func updateContactMessage(id: String, status: AdminContactMessageStatus) async throws
    func replyToContactMessage(id: String, text: String) async throws -> AdminInboxActionResponse

    func fetchOpinionTickets(page: Int, status: AdminOpinionTicketStatus?, search: String) async throws -> AdminOpinionTicketsResponse
    func fetchOpinionTicket(id: String) async throws -> AdminOpinionTicketDetailResponse
    func updateOpinionTicket(id: String, status: AdminOpinionTicketStatus) async throws
    func replyToOpinionTicket(id: String, text: String, parentMessageId: String?) async throws
}

private nonisolated struct InboxStatusBody: Encodable { let status: String }
private nonisolated struct InboxReplyBody: Encodable {
    let replyText: String?
    let message: String?
    let parentMessageId: String?

    static func contact(_ text: String) -> Self {
        Self(replyText: text, message: nil, parentMessageId: nil)
    }

    static func ticket(_ text: String, parentMessageId: String?) -> Self {
        Self(replyText: nil, message: text, parentMessageId: parentMessageId)
    }
}

struct LiveAdminInboxService: AdminInboxServicing {
    nonisolated init() {}

    func fetchContactMessages(page: Int, status: AdminContactMessageStatus?, search: String) async throws -> AdminContactMessagesResponse {
        var query = ["page": "\(page)", "limit": "20"]
        if let status { query["status"] = status.rawValue }
        if !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { query["search"] = search }
        return try await APIClient.shared.get(
            AdminContactMessagesResponse.self,
            path: "/admin/contact-messages",
            query: query,
            ignoreCache: true
        )
    }

    func fetchContactMessage(id: String) async throws -> AdminContactMessageDetailResponse {
        try await APIClient.shared.get(
            AdminContactMessageDetailResponse.self,
            path: "/admin/contact-messages/\(id)",
            ignoreCache: true
        )
    }

    func updateContactMessage(id: String, status: AdminContactMessageStatus) async throws {
        _ = try await APIClient.shared.patch(
            AdminInboxActionResponse.self,
            path: "/admin/contact-messages/\(id)",
            body: InboxStatusBody(status: status.rawValue)
        )
    }

    func replyToContactMessage(id: String, text: String) async throws -> AdminInboxActionResponse {
        try await APIClient.shared.post(
            AdminInboxActionResponse.self,
            path: "/admin/contact-messages/\(id)/reply",
            body: InboxReplyBody.contact(text)
        )
    }

    func fetchOpinionTickets(page: Int, status: AdminOpinionTicketStatus?, search: String) async throws -> AdminOpinionTicketsResponse {
        var query = ["page": "\(page)", "limit": "20"]
        if let status { query["status"] = status.rawValue }
        if !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { query["search"] = search }
        return try await APIClient.shared.get(
            AdminOpinionTicketsResponse.self,
            path: "/admin/opinion-tickets",
            query: query,
            ignoreCache: true
        )
    }

    func fetchOpinionTicket(id: String) async throws -> AdminOpinionTicketDetailResponse {
        try await APIClient.shared.get(
            AdminOpinionTicketDetailResponse.self,
            path: "/admin/opinion-tickets/\(id)",
            ignoreCache: true
        )
    }

    func updateOpinionTicket(id: String, status: AdminOpinionTicketStatus) async throws {
        _ = try await APIClient.shared.patch(
            AdminInboxActionResponse.self,
            path: "/admin/opinion-tickets/\(id)/status",
            body: InboxStatusBody(status: status.rawValue)
        )
    }

    func replyToOpinionTicket(id: String, text: String, parentMessageId: String?) async throws {
        _ = try await APIClient.shared.post(
            AdminInboxActionResponse.self,
            path: "/admin/opinion-tickets/\(id)/messages",
            body: InboxReplyBody.ticket(text, parentMessageId: parentMessageId)
        )
    }
}
