import Combine
import Foundation
import Testing
@testable import sabq

private final class PublicationProbe: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    func record() {
        lock.lock()
        count += 1
        lock.unlock()
    }

    var value: Int {
        lock.lock()
        defer { lock.unlock() }
        return count
    }
}

private struct AdminInboxFixtureService: AdminInboxServicing {
    func fetchContactMessages(page: Int, status: AdminContactMessageStatus?, search: String) async throws -> AdminContactMessagesResponse {
        AdminContactMessagesResponse(messages: [], total: 0, page: 1, totalPages: 1)
    }

    func fetchContactMessage(id: String) async throws -> AdminContactMessageDetailResponse {
        let data = Data(
            """
            {
              "message": {
                "id": "contact-1",
                "name": "زائر سبق",
                "phone": "+966500000000",
                "email": "visitor@example.com",
                "subject": "استفسار",
                "message": "نص الرسالة",
                "status": "read",
                "createdAt": "2026-07-10T10:00:00.000Z"
              },
              "replies": []
            }
            """.utf8
        )
        return try JSONDecoder().decode(AdminContactMessageDetailResponse.self, from: data)
    }

    func updateContactMessage(id: String, status: AdminContactMessageStatus) async throws {}

    func replyToContactMessage(id: String, text: String) async throws -> AdminInboxActionResponse {
        AdminInboxActionResponse(success: true, message: nil, emailSent: true)
    }

    func fetchOpinionTickets(page: Int, status: AdminOpinionTicketStatus?, search: String) async throws -> AdminOpinionTicketsResponse {
        AdminOpinionTicketsResponse(tickets: [], total: 0, page: 1, totalPages: 1)
    }

    func fetchOpinionTicket(id: String) async throws -> AdminOpinionTicketDetailResponse {
        let data = Data(
            """
            {
              "ticket": {
                "id": "ticket-1",
                "writerId": "writer-1",
                "writerName": "كاتب رأي",
                "writerEmail": "writer@example.com",
                "title": "عنوان الاستفسار",
                "status": "open",
                "lastMessageAt": "2026-07-10T10:00:00.000Z",
                "createdAt": "2026-07-10T09:00:00.000Z",
                "hasUnread": false
              },
              "messages": [
                {
                  "id": "message-1",
                  "ticketId": "ticket-1",
                  "senderId": "writer-1",
                  "senderRole": "writer",
                  "senderName": "كاتب رأي",
                  "message": "نص الاستفسار",
                  "parentMessageId": null,
                  "createdAt": "2026-07-10T10:00:00.000Z"
                }
              ]
            }
            """.utf8
        )
        return try JSONDecoder().decode(AdminOpinionTicketDetailResponse.self, from: data)
    }

    func updateOpinionTicket(id: String, status: AdminOpinionTicketStatus) async throws {}
    func replyToOpinionTicket(id: String, text: String, parentMessageId: String?) async throws {}
}

struct AdminInboxViewModelTests {
    @Test @MainActor
    func contactDetailPublishesWhenLoadingCompletes() async throws {
        let viewModel = AdminContactMessageDetailViewModel(
            id: "contact-1",
            service: AdminInboxFixtureService()
        )
        let probe = PublicationProbe()
        let observation = viewModel.objectWillChange.sink { probe.record() }

        await viewModel.load()

        #expect(viewModel.detail?.message.id == "contact-1")
        #expect(viewModel.isLoading == false)
        #expect(probe.value > 0)
        withExtendedLifetime(observation) {}
    }

    @Test @MainActor
    func opinionDetailPublishesWhenLoadingCompletes() async throws {
        let viewModel = AdminOpinionTicketDetailViewModel(
            id: "ticket-1",
            service: AdminInboxFixtureService()
        )
        let probe = PublicationProbe()
        let observation = viewModel.objectWillChange.sink { probe.record() }

        await viewModel.load()

        #expect(viewModel.detail?.ticket.id == "ticket-1")
        #expect(viewModel.detail?.messages.count == 1)
        #expect(viewModel.isLoading == false)
        #expect(probe.value > 0)
        withExtendedLifetime(observation) {}
    }
}
