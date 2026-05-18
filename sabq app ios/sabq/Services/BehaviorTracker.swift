import Foundation

// MARK: - Behavior Tracker
//
// Unified reader-side analytics for iOS. Mirrors what the web app
// records via /api/me/reading-history + /api/behavior/signal so the
// "Reading Journey" card on the home screen
// (GET /api/v1/insights/today) and the trending opinion query both
// see web + iOS sessions identically.
//
// Lifecycle:
//   1. `startSession(articleId:)` on ArticleDetailView / OpinionDetailView .onAppear
//      → fires `view` event → backend bumps articles.views AND
//        inserts a reading_history seed row.
//   2. `updateScroll(percent:)` from the scroll callback each time the
//      reader moves. Updates an in-memory max — we don't post per
//      scroll, that would hammer the network.
//   3. `endSession()` on .onDisappear / scenePhase background
//      → fires `read` event with the final dwell + scroll +
//        completionRate so the row reflects what actually happened.
//   4. `toggleLike(articleId:)` from the Like button →
//      POST /api/v1/articles/:id/react, returns new state + count.
//
// All writes go through the Bearer-token session (verifyMemberSession
// on the backend). Anonymous opens still hit /articles/:id/view in
// APIClient.trackView so the global counter never drops.
@MainActor
final class BehaviorTracker {
    static let shared = BehaviorTracker()

    private var activeArticleId: String?
    private var startedAt: Date?
    private var maxScrollPercent: Double = 0
    private var endedForCurrentSession = false

    private init() {}

    // MARK: - Session lifecycle

    func startSession(articleId: String) {
        // Idempotent — if the view re-appears (push/pop) we keep the
        // same session running rather than double-counting.
        if activeArticleId == articleId, !endedForCurrentSession {
            return
        }
        // If a previous session was open and never ended (foreground
        // bug or rapid nav), close it best-effort before opening a
        // new one. We don't await this — it's fire-and-forget.
        if activeArticleId != nil, !endedForCurrentSession {
            flushReadEventBestEffort()
        }

        activeArticleId = articleId
        startedAt = Date()
        maxScrollPercent = 0
        endedForCurrentSession = false

        Task.detached(priority: .background) {
            do {
                try await APIClient.shared.trackBehaviorEvent(
                    articleId: articleId,
                    eventType: "view",
                    dwellSeconds: nil,
                    scrollDepth: nil,
                    completionRate: nil
                )
            } catch {
                // Silent — tracking is best-effort. Don't pollute the
                // user-facing UI with analytics failures.
            }
            // Loyalty: enqueue READ_OPEN. The server-side daily cap
            // (30/day) and 24h dedup-by-source make this idempotent so
            // re-opening the same article in a single day awards once.
            await LoyaltyEventQueue.shared.enqueue(action: .readOpen, articleId: articleId)
        }
    }

    /// Pass the normalized scroll position (0...1) from the article
    /// scroll callback. We only post the high-water mark, not every
    /// delta.
    func updateScroll(percent: Double) {
        guard activeArticleId != nil else { return }
        let clamped = min(1.0, max(0.0, percent))
        if clamped > maxScrollPercent {
            maxScrollPercent = clamped
        }
    }

    /// Closes the current session. Safe to call multiple times — only
    /// the first call after startSession posts.
    func endSession() {
        guard !endedForCurrentSession, let articleId = activeArticleId else {
            return
        }
        endedForCurrentSession = true

        let dwell = elapsedSeconds()
        let scrollPct = Int((maxScrollPercent * 100).rounded())
        let completion = estimateCompletion(scrollPercent: maxScrollPercent, dwellSeconds: dwell)

        // Capture into locals before the detached task so the actor
        // state isn't read off-MainActor.
        Task.detached(priority: .background) {
            do {
                try await APIClient.shared.trackBehaviorEvent(
                    articleId: articleId,
                    eventType: "read",
                    dwellSeconds: dwell,
                    scrollDepth: scrollPct,
                    completionRate: completion
                )
            } catch {
                // Best-effort.
            }
            // Loyalty: a "deep read" earns the extra 3 pts on top of
            // the READ_OPEN already enqueued at start. Match the web's
            // /api/behavior-log rule: dwell ≥ 60s. Server dedup keeps
            // multiple bg/fg cycles on the same article from
            // double-charging.
            if dwell >= 60 {
                await LoyaltyEventQueue.shared.enqueue(action: .readDeep, articleId: articleId, duration: dwell)
            }
        }

        activeArticleId = nil
        startedAt = nil
        maxScrollPercent = 0
    }

    // MARK: - Likes

    /// Toggle like state for an article. Returns the new (liked,
    /// likesCount) tuple from the server. Throws if the user isn't
    /// authenticated or the network call fails — the caller (Like
    /// button) should surface a small toast in that case.
    func toggleLike(articleId: String) async throws -> (liked: Bool, count: Int) {
        let response = try await APIClient.shared.toggleArticleLike(articleId: articleId)
        return (response.liked, response.likesCount)
    }

    func fetchLikeStatus(articleId: String) async throws -> (liked: Bool, count: Int) {
        let response = try await APIClient.shared.fetchArticleLikeStatus(articleId: articleId)
        return (response.liked, response.likesCount)
    }

    // MARK: - Helpers

    private func elapsedSeconds() -> Int {
        guard let startedAt else { return 0 }
        let delta = Date().timeIntervalSince(startedAt)
        // Cap at 1 hour so a screen left open overnight doesn't
        // poison the dwell average.
        return min(3600, max(0, Int(delta.rounded())))
    }

    /// Heuristic for "did the user actually read this." Scroll alone
    /// is misleading (hero image takes 100% on tap), and dwell alone
    /// is misleading (article left open while user does something
    /// else). Combine them: max of (scroll, dwell-saturating-at-3min).
    private func estimateCompletion(scrollPercent: Double, dwellSeconds: Int) -> Int {
        let dwellComponent = min(1.0, Double(dwellSeconds) / 180.0)
        let combined = max(scrollPercent, dwellComponent)
        return Int((combined * 100).rounded())
    }

    /// Fire-and-forget read event for when we have to close a stale
    /// session (e.g. user navigated to a second article without the
    /// first endSession firing). We can't await from a non-async
    /// caller so wrap in a detached task.
    private func flushReadEventBestEffort() {
        guard let articleId = activeArticleId else { return }
        let dwell = elapsedSeconds()
        let scrollPct = Int((maxScrollPercent * 100).rounded())
        let completion = estimateCompletion(scrollPercent: maxScrollPercent, dwellSeconds: dwell)
        Task.detached(priority: .background) {
            try? await APIClient.shared.trackBehaviorEvent(
                articleId: articleId,
                eventType: "read",
                dwellSeconds: dwell,
                scrollDepth: scrollPct,
                completionRate: completion
            )
        }
    }
}
