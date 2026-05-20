import SwiftUI

/// Owns the writer's revision-pending article list and the badge count
/// that surfaces in the settings card. Auto-refreshes on app foreground
/// and after a successful resubmit, so the card collapses to zero as
/// soon as the editor's queue moves forward.
///
/// Mounted as a singleton via `@Environment(ArticleRevisionsStore.self)`
/// in `sabqApp` next to AuthStore / NotificationsStore — same lifetime,
/// same DI pattern.
@MainActor
@Observable
final class ArticleRevisionsStore {
    private(set) var items: [ArticleRevisionSummary] = []
    private(set) var isLoading = false
    private(set) var lastError: String?

    /// Convenience for the settings card. Zero hides the row, ≥1 shows
    /// the "X مقال ينتظر التعديل" affordance.
    var count: Int { items.count }

    /// Called by AuthStore once after login, and by ContentView on
    /// app-foreground. Cheap query (single SELECT with one index hit),
    /// safe to call frequently.
    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        lastError = nil
        defer { isLoading = false }
        do {
            items = try await APIClient.shared.fetchMyRevisions()
        } catch let error as APIError {
            // Surface unauthorized as a silent reset — the user
            // signed out elsewhere; AuthStore will clean up.
            switch error {
            case .unauthorized, .forbidden:
                items = []
                lastError = nil
            default:
                lastError = error.errorDescription
            }
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Optimistic removal after a successful resubmit, before we
    /// re-fetch from the server. Keeps the list animation smooth.
    func removeOptimistically(id: String) {
        items.removeAll { $0.id == id }
    }

    /// Clear everything on logout so the next user doesn't briefly
    /// see the previous account's pending revisions.
    func clear() {
        items = []
        lastError = nil
    }
}
