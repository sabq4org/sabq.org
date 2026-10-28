import Foundation
import Observation
import SabqDeskKit

/// One cursor-paginated inbox list (a desk tab or a messages tab).
@Observable
final class InboxModel {
    /// The list's query without a cursor; change it, then `reload()`.
    var query: StaffInboxQuery

    private(set) var items: [StaffInboxItem] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var hasLoaded = false
    private(set) var errorMessage: String?
    private(set) var hasMore = false
    private var nextCursor: String?
    private var generation = 0

    private let client: StaffAPIClient
    private let onSessionError: (Error) -> Bool

    init(client: StaffAPIClient, query: StaffInboxQuery, onSessionError: @escaping (Error) -> Bool) {
        self.client = client
        self.query = query
        self.onSessionError = onSessionError
    }

    private func page(cursor: String?) -> StaffInboxQuery {
        var page = query
        page.cursor = cursor
        return page
    }

    /// Reloads from the first page. A newer reload discards older responses
    /// so fast tab/search changes never show stale rows.
    func reload() async {
        generation += 1
        let current = generation
        isLoading = true
        errorMessage = nil
        defer { if current == generation { isLoading = false } }
        do {
            let result = try await client.inbox(page(cursor: nil))
            guard current == generation else { return }
            items = result.items
            nextCursor = result.nextCursor
            hasMore = result.hasMore && result.nextCursor != nil
            hasLoaded = true
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
            let result = try await client.inbox(page(cursor: cursor))
            guard current == generation else { return }
            let known = Set(items.map(\.listID))
            items.append(contentsOf: result.items.filter { !known.contains($0.listID) })
            nextCursor = result.nextCursor
            hasMore = result.hasMore && result.nextCursor != nil
        } catch {
            guard current == generation else { return }
            if !onSessionError(error) {
                errorMessage = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    /// Fetches the remaining pages (at most `maxPages`), for a filter that
    /// hides rows and so never reaches the last row's `loadMoreIfNeeded`.
    func loadAll(maxPages: Int = 10) async {
        for _ in 0..<maxPages {
            guard hasMore, let last = items.last else { return }
            let before = items.count
            await loadMoreIfNeeded(after: last)
            if items.count == before { return }
        }
    }

    /// Reflects a change made on a detail screen without a full reload. A row
    /// whose new status no longer belongs to this tab leaves the list.
    func apply(_ link: DeskDeepLink, status: String?) {
        guard let index = items.firstIndex(where: { DeskDeepLink(item: $0) == link }) else { return }
        if case .ticket = link { items[index].hasUnread = false }
        guard let status else { return }
        let allowed = Set((query.status ?? "").split(separator: ",").map(String.init))
        if !allowed.isEmpty, !allowed.contains(status) {
            items.remove(at: index)
            return
        }
        items[index].status = status
        if case .social = link { items[index].hasUnread = status == StaffSocialStatus.draft.rawValue }
    }

    func remove(_ item: StaffInboxItem) {
        items.removeAll { $0.listID == item.listID }
    }
}
