import Foundation
import Observation

// الكلمات المتابَعة: نسخة محلية فورية + مزامنة مع حساب القارئ عبر
// /v1/keywords/* (نفس جدول «كلماتي» في الويب، فتظهر المتابعة في الموقع
// وتولّد إشعارات الكلمة في الوارد). الزائر يتابع محليًا، وعند الدخول تُدمج
// كلماته في حسابه (syncFromServer). المسارات تعمل بالاسم لا بمعرّف الوسم.
@Observable
final class FollowedKeywordsStore {
    private let key = "sabq_followed_keywords"
    var followed: [String]
    /// عدد الأخبار المنشورة لكل كلمة، من آخر مزامنة (للحساب فقط).
    private(set) var articleCounts: [String: Int] = [:]
    private(set) var syncing = false

    init() {
        followed = UserDefaults.standard.stringArray(forKey: "sabq_followed_keywords") ?? []
    }

    func isFollowed(_ keyword: String) -> Bool {
        followed.contains(keyword)
    }

    func toggle(_ keyword: String) {
        let trimmed = keyword.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let nowFollowed: Bool
        if let index = followed.firstIndex(of: trimmed) {
            followed.remove(at: index)
            nowFollowed = false
        } else {
            followed.append(trimmed)
            nowFollowed = true
        }
        persist()
        pushRemote(trimmed, followed: nowFollowed)
    }

    func remove(_ keyword: String) {
        if let index = followed.firstIndex(of: keyword) {
            followed.remove(at: index)
            persist()
            pushRemote(keyword, followed: false)
        }
    }

    /// يدمج المحلي في الحساب ثم يعتمد قائمة الخادم (الأحدث متابعةً أولًا).
    func syncFromServer() {
        guard APIClient.shared.hasSession, !syncing else { return }
        syncing = true
        let local = followed
        Task {
            defer { syncing = false }
            guard let remote = try? await APIClient.shared.syncFollowedKeywords(local) else { return }
            followed = remote.map(\.name)
            articleCounts = Dictionary(remote.map { ($0.name, $0.articleCount) }, uniquingKeysWith: { a, _ in a })
            persist()
        }
    }

    /// Wipe in-memory + on-disk state. Mirrors BookmarksStore.clear() so
    /// the Settings "مسح البيانات المحلية" action fully empties followed
    /// keywords inside the same session, not only after a relaunch.
    func clear() {
        followed.removeAll()
        articleCounts.removeAll()
        UserDefaults.standard.removeObject(forKey: key)
    }

    private func persist() {
        UserDefaults.standard.set(followed, forKey: key)
    }

    /// أفضل جهد: فشل الشبكة يُبقي النسخة المحلية، والمزامنة القادمة تدمجها.
    private func pushRemote(_ keyword: String, followed: Bool) {
        guard APIClient.shared.hasSession else { return }
        Task { try? await APIClient.shared.setKeywordFollow(keyword, followed: followed) }
    }
}
