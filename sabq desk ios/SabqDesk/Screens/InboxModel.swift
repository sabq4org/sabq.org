import Foundation
import Observation
import SabqDeskKit

/// Cursor-paginated unified inbox with filter, unread toggle and search.
@Observable
final class InboxModel {
    var filter: StaffInboxFilter = .all
    var unreadOnly = false
    var search = ""

    private(set) var items: [StaffInboxItem] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var errorMessage: String?
    private(set) var hasMore = false
    private var nextCursor: String?
    private var generation = 0

    private let client: StaffAPIClient
    private let onSessionError: (Error) -> Bool

    init(client: StaffAPIClient, onSessionError: @escaping (Error) -> Bool) {
        self.client = client
        self.onSessionError = onSessionError
    }

    private func query(cursor: String?) -> StaffInboxQuery {
        StaffInboxQuery(type: filter, unreadOnly: unreadOnly, search: search, cursor: cursor)
    }

    /// Reloads from the first page. A newer reload discards older responses
    /// so fast filter/search changes never show stale rows.
    func reload() async {
        generation += 1
        let current = generation
        isLoading = true
        errorMessage = nil
        defer { if current == generation { isLoading = false } }
        do {
            let page = try await client.inbox(query(cursor: nil))
            guard current == generation else { return }
            items = page.items
            nextCursor = page.nextCursor
            hasMore = page.hasMore && page.nextCursor != nil
        } catch {
            guard current == generation, !(error is CancellationError) else { return }
            if !onSessionError(error) {
                errorMessage = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    func loadMoreIfNeeded(after item: StaffInboxItem) async {
        guard item.listID == items.last?.listID, hasMore, !isLoadingMore, !isLoading, let cursor = nextCursor else { return }
        let current = generation
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await client.inbox(query(cursor: cursor))
            guard current == generation else { return }
            let known = Set(items.map(\.listID))
            items.append(contentsOf: page.items.filter { !known.contains($0.listID) })
            nextCursor = page.nextCursor
            hasMore = page.hasMore && page.nextCursor != nil
        } catch {
            guard current == generation else { return }
            if !onSessionError(error) {
                errorMessage = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    /// Reflects a change made on a detail screen without a full reload.
    func markRead(_ link: DeskDeepLink, status: String? = nil) {
        guard let index = items.firstIndex(where: { DeskDeepLink(item: $0) == link }) else { return }
        if case .ticket = link { items[index].hasUnread = false }
        if let status {
            items[index].status = status
            if case .social = link { items[index].hasUnread = status == StaffSocialStatus.draft.rawValue }
        }
    }
}
