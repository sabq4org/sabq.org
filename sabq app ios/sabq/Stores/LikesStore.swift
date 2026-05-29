import SwiftUI

// Local-first cache of which articles the current user has liked.
// Modeled on BookmarksStore — addresses the editor's complaint
// 2026-05-19 evening: "بمجرد الخروج والرجوع الدخول ألقى تسجيلي للايك
// اختفى". Old flow drove `isLiked` purely off the server response,
// so any transient server hiccup (token expiry mid-session, a
// silently-failed insert, a 5xx) made the heart go cold on re-entry.
// Bookmarks didn't have the same bug because they kept a UserDefaults
// set as their source of truth and treated the API call as
// fire-and-forget; this store does the same for likes.
//
// Cross-device sync nuance: if the user un-likes on web while iOS is
// offline, iOS will still show the article as liked until the next
// foreground reconcile lands. The reconcile path (toggle that hits
// server "already liked, deleting" before iOS knows) self-heals on
// the next tap. That window is small enough to accept; the
// alternative — trusting the server unconditionally — is the bug we
// just fixed.
@Observable
final class LikesStore {
    private(set) var likedIDs: Set<String> = []
    /// Last-known server count per article, keyed by id. The heart
    /// reads liked-or-not from likedIDs (instant), the number next to
    /// it reads from this dict (refreshed in the background).
    private(set) var counts: [String: Int] = [:]

    private let storageKey = "sabq_liked_articles_v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode(Set<String>.self, from: data) {
            likedIDs = decoded
        }
    }

    func isLiked(_ articleID: String) -> Bool { likedIDs.contains(articleID) }
    func count(for articleID: String) -> Int? { counts[articleID] }

    /// Optimistic toggle: flip local immediately, then sync to server.
    /// On server success we trust the response (which is the same
    /// state we flipped to, except in the rare case the server
    /// already had the opposite state — in which case we sync to it).
    /// On failure we revert.
    @MainActor
    func toggle(_ articleID: String) async -> (liked: Bool, count: Int)? {
        let wasLiked = likedIDs.contains(articleID)
        if wasLiked {
            likedIDs.remove(articleID)
        } else {
            likedIDs.insert(articleID)
        }
        persist()

        do {
            let result = try await BehaviorTracker.shared.toggleLike(articleId: articleID)
            if result.liked {
                likedIDs.insert(articleID)
            } else {
                likedIDs.remove(articleID)
            }
            counts[articleID] = result.count
            persist()
            return (result.liked, result.count)
        } catch {
            // Revert optimistic update.
            if wasLiked {
                likedIDs.insert(articleID)
            } else {
                likedIDs.remove(articleID)
            }
            persist()
            return nil
        }
    }

    /// On article view appear: fetch the server count + reconcile.
    /// If local says liked but server says not, we POST again to heal
    /// the missing row — this is the specific fallback that fixes the
    /// "like vanishes on re-entry" report. If local says NOT liked
    /// but server says liked (e.g. liked from web), we just sync
    /// local to match.
    @MainActor
    func reconcile(_ articleID: String) async {
        do {
            let status = try await BehaviorTracker.shared.fetchLikeStatus(articleId: articleID)
            counts[articleID] = status.count

            let localSaysLiked = likedIDs.contains(articleID)
            if status.liked && !localSaysLiked {
                likedIDs.insert(articleID)
                persist()
            } else if !status.liked && localSaysLiked {
                // Heal — push the like back to the server so the row
                // exists on next reconcile. We don't flip local
                // because the user's intent on this device was
                // "liked".
                _ = try? await BehaviorTracker.shared.toggleLike(articleId: articleID)
            }
        } catch {
            // Network blip — keep local state as-is.
        }
    }

    func clear() {
        likedIDs.removeAll()
        counts.removeAll()
        UserDefaults.standard.removeObject(forKey: storageKey)
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(likedIDs) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }
}
