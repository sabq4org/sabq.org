import SwiftUI

/// الإبلاغ والحظر وقبول شروط التعليق (بند أبل 1.2 للمحتوى الذي ينشره المستخدمون).
///
/// قائمة التعليقات العامة محايدة ومخزّنة في الخادم، فتعليقات المحظورين تُخفى
/// هنا محليًا. القائمة نفسها محفوظة في الخادم (`/members/blocks`) فتعود على أي جهاز.
/// البلاغ يُخفي التعليق عن صاحبه فورًا، والخادم يسحبه من العرض العام حتى يراجعه مشرف.
@Observable
@MainActor
final class CommentSafetyStore {
    static let shared = CommentSafetyStore()

    private(set) var blockedUsers: [APIBlockedUser] = []
    private(set) var blockedIds: Set<String> = []
    private(set) var reportedCommentIds: Set<String> = []
    private var activeUserId: String?
    private var loadedForUserId: String?
    private var requestGeneration = 0
    private let fetchBlockedUsers: @MainActor () async throws -> [APIBlockedUser]

    init(fetchBlockedUsers: @escaping @MainActor () async throws -> [APIBlockedUser] = {
        try await APIClient.shared.fetchBlockedUsers()
    }) {
        self.fetchBlockedUsers = fetchBlockedUsers
    }

    enum ReportReason: String, CaseIterable, Identifiable {
        case offensive, harassment, spam, misinformation, other
        var id: String { rawValue }
        var label: String {
            switch self {
            case .offensive: return "محتوى مسيء أو غير لائق"
            case .harassment: return "إساءة أو تحرش بشخص"
            case .spam: return "رسائل مزعجة أو إعلان"
            case .misinformation: return "معلومة مضللة"
            case .other: return "سبب آخر"
            }
        }
    }

    /// يجلب قائمة الحظر مرة لكل حساب، ويفرّغها عند الخروج.
    func syncIfNeeded(userId: String?) async {
        guard let userId else {
            clear()
            return
        }
        if activeUserId != userId {
            clear()
            activeUserId = userId
        }
        guard loadedForUserId != userId else { return }
        await reloadBlocked()
    }

    func reloadBlocked() async {
        requestGeneration += 1
        let generation = requestGeneration
        let userId = activeUserId
        do {
            let users = try await fetchBlockedUsers()
            // الخروج أو تبديل الحساب أو جلب أحدث يلغي صلاحية هذا الرد.
            guard generation == requestGeneration, activeUserId == userId else { return }
            blockedUsers = users
            blockedIds = Set(users.map(\.id))
            loadedForUserId = userId
        } catch {
            guard generation == requestGeneration, activeUserId == userId else { return }
            // لا نعتبر الطلب الفاشل تحميلًا ناجحًا؛ فتح التعليقات مجددًا يعيد المحاولة.
            loadedForUserId = nil
        }
    }

    func clear() {
        requestGeneration += 1
        activeUserId = nil
        loadedForUserId = nil
        blockedUsers = []
        blockedIds = []
        reportedCommentIds = []
    }

    func isHidden(_ comment: APIComment) -> Bool {
        if reportedCommentIds.contains(comment.id) { return true }
        if let userId = comment.userId, blockedIds.contains(userId) { return true }
        return false
    }

    /// التعليقات بعد إخفاء المحظورين وما أبلغ عنه القارئ، بما فيها الردود.
    func visible(_ comments: [APIComment]) -> [APIComment] {
        comments.compactMap { comment in
            guard !isHidden(comment) else { return nil }
            let replies = comment.replies.filter { !isHidden($0) }
            guard replies.count != comment.replies.count else { return comment }
            return APIComment(
                id: comment.id,
                body: comment.body,
                userId: comment.userId,
                userName: comment.userName,
                userAvatar: comment.userAvatar,
                createdAt: comment.createdAt,
                likesCount: comment.likesCount,
                status: comment.status,
                parentId: comment.parentId,
                replies: replies
            )
        }
    }

    func report(_ comment: APIComment, reason: ReportReason) async throws {
        try await APIClient.shared.reportComment(id: comment.id, reason: reason.rawValue, details: nil)
        reportedCommentIds.insert(comment.id)
    }

    func block(userId: String, name: String?) async throws {
        try await APIClient.shared.blockUser(id: userId)
        blockedIds.insert(userId)
        if !blockedUsers.contains(where: { $0.id == userId }) {
            blockedUsers.insert(APIBlockedUser(id: userId, name: name, profileImageUrl: nil), at: 0)
        }
    }

    func unblock(userId: String) async throws {
        try await APIClient.shared.unblockUser(id: userId)
        blockedIds.remove(userId)
        blockedUsers.removeAll { $0.id == userId }
    }

    // MARK: - شروط التعليق

    private static func termsKey(_ userId: String) -> String { "sabq.commentTerms.accepted.\(userId)" }

    func hasAcceptedCommentTerms(userId: String?) -> Bool {
        guard let userId else { return false }
        return UserDefaults.standard.bool(forKey: Self.termsKey(userId))
    }

    func acceptCommentTerms(userId: String?) {
        guard let userId else { return }
        UserDefaults.standard.set(true, forKey: Self.termsKey(userId))
    }
}
