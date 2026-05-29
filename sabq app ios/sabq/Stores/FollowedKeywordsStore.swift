import Foundation
import Observation

// Lightweight local-first followed-keywords store. The remote
// /keywords/follow endpoint takes an Int tag_id we don't always have
// at the call site, so we persist by string and treat it as a personal
// reading list. Future enhancement: reconcile with `/keywords/followed`
// when authenticated.
@Observable
final class FollowedKeywordsStore {
    private let key = "sabq_followed_keywords"
    var followed: [String]

    init() {
        followed = UserDefaults.standard.stringArray(forKey: "sabq_followed_keywords") ?? []
    }

    func isFollowed(_ keyword: String) -> Bool {
        followed.contains(keyword)
    }

    func toggle(_ keyword: String) {
        let trimmed = keyword.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if let index = followed.firstIndex(of: trimmed) {
            followed.remove(at: index)
        } else {
            followed.append(trimmed)
        }
        UserDefaults.standard.set(followed, forKey: key)
    }

    func remove(_ keyword: String) {
        if let index = followed.firstIndex(of: keyword) {
            followed.remove(at: index)
            UserDefaults.standard.set(followed, forKey: key)
        }
    }

    /// Wipe in-memory + on-disk state. Mirrors BookmarksStore.clear() so
    /// the Settings "مسح البيانات المحلية" action fully empties followed
    /// keywords inside the same session, not only after a relaunch.
    func clear() {
        followed.removeAll()
        UserDefaults.standard.removeObject(forKey: key)
    }
}
