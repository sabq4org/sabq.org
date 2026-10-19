import SwiftUI

/// State container for one article's comments. One instance per article view —
/// owned by `ArticleDetailView` via `@State`. Holds the list, the submit
/// pipeline (composer → API → optimistic state), and surfaces user-facing
/// outcome messages so the view can show toasts/alerts.
@Observable
@MainActor
final class CommentsStore {
    enum SubmitOutcome: Equatable {
        /// Backend AI moderation auto-approved synchronously (rare — AI runs async,
        /// so this practically only happens if the post path skips moderation).
        case published
        /// Comment created in `pending` status; will be reviewed shortly (AI or
        /// human). This is the *normal* path the user sees right after pressing send.
        case awaitingReview
        /// Comment was rejected outright at submission time (e.g. suspicious-words
        /// hard block).
        case rejected
    }

    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(message: String)
    }

    private(set) var comments: [APIComment] = []
    private(set) var loadState: LoadState = .idle
    private(set) var isSubmitting = false
    private(set) var lastSubmitOutcome: SubmitOutcome?
    private(set) var lastError: String?

    /// User taps "Reply" on a row → this holds the parent the next composer
    /// submission should attach to. `nil` means a top-level comment.
    var replyingTo: APIComment?

    /// ترتيب القائمة كما في الويب: «الأحدث» أو «الأكثر إعجابًا».
    enum SortOrder: String, CaseIterable, Identifiable {
        case newest = "الأحدث"
        case mostLiked = "الأكثر إعجابًا"
        var id: String { rawValue }
    }
    var sortOrder: SortOrder = .newest

    /// ما أعجب به القارئ (من `my-likes`)، والأعداد بعد إعجابه أو إلغائه.
    /// القائمة نفسها محايدة ومخزّنة 15ث في الخادم، فنركّب هذا فوقها محليًا.
    private(set) var likedIds: Set<String> = []
    private var likeOverrides: [String: Int] = [:]
    private var likesInFlight: Set<String> = []

    var sortedComments: [APIComment] {
        switch sortOrder {
        case .newest:
            return comments.sorted { $0.createdAt > $1.createdAt }
        case .mostLiked:
            return comments.sorted {
                let a = likes(for: $0), b = likes(for: $1)
                return a == b ? $0.createdAt > $1.createdAt : a > b
            }
        }
    }

    func likes(for comment: APIComment) -> Int {
        likeOverrides[comment.id] ?? comment.likesCount ?? 0
    }

    func isLiked(_ comment: APIComment) -> Bool { likedIds.contains(comment.id) }

    /// يجلب إعجابات القارئ؛ يُستدعى للمسجّل فقط، وفشله صامت.
    func loadMyLikes() async {
        guard let ids = try? await APIClient.shared.fetchMyCommentLikes(slug: slug) else { return }
        likedIds = Set(ids)
    }

    /// إعجاب متفائل: يتغيّر الزر والعدد فورًا ثم يُعتمد عدد الخادم، ويُرجع عند الفشل.
    func toggleLike(_ comment: APIComment) async throws {
        guard !likesInFlight.contains(comment.id) else { return }
        likesInFlight.insert(comment.id)
        defer { likesInFlight.remove(comment.id) }

        let wasLiked = likedIds.contains(comment.id)
        let previous = likes(for: comment)
        if wasLiked { likedIds.remove(comment.id) } else { likedIds.insert(comment.id) }
        likeOverrides[comment.id] = max(0, previous + (wasLiked ? -1 : 1))
        do {
            let result = try await APIClient.shared.setCommentLike(id: comment.id, liked: !wasLiked)
            likeOverrides[comment.id] = result.likesCount
            if result.liked { likedIds.insert(comment.id) } else { likedIds.remove(comment.id) }
        } catch {
            if wasLiked { likedIds.insert(comment.id) } else { likedIds.remove(comment.id) }
            likeOverrides[comment.id] = previous
            throw error
        }
    }

    private let slug: String

    /// Max length is wider than the backend hard limit on purpose: we want a
    /// generous local soft limit so the user is told before paying for a
    /// network round-trip, not after.
    nonisolated static let maxLength = 2000

    init(slug: String) {
        self.slug = slug
    }

    // MARK: - Load

    func load() async {
        if case .loading = loadState { return }
        loadState = .loading
        do {
            let fetched = try await APIClient.shared.fetchComments(slug: slug)
            comments = fetched
            loadState = .loaded
        } catch let api as APIError {
            loadState = .failed(message: api.errorDescription ?? "تعذر تحميل التعليقات")
        } catch {
            loadState = .failed(message: "تعذر تحميل التعليقات")
        }
    }

    func refresh() async {
        // Pull-to-refresh path: don't flicker the skeleton; just refetch.
        do {
            let fetched = try await APIClient.shared.fetchComments(slug: slug)
            comments = fetched
            loadState = .loaded
        } catch {
            // Silent on refresh failure — keep the stale list visible.
        }
    }

    // MARK: - Submit

    /// Returns the outcome so the caller can show the right toast/alert.
    /// Throws only for network/auth errors that need a sheet (login) or banner.
    @discardableResult
    func submit(content: String, parentId: String? = nil) async throws -> SubmitOutcome {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw CommentsError.empty }
        guard trimmed.count <= Self.maxLength else { throw CommentsError.tooLong }

        isSubmitting = true
        defer { isSubmitting = false }

        do {
            let saved = try await APIClient.shared.postComment(slug: slug, content: trimmed, parentId: parentId)
            SabqAnalytics.articleComment(slug: slug, parentId: parentId)
            let outcome = Self.outcome(for: saved)
            lastSubmitOutcome = outcome
            lastError = nil

            // If the backend auto-approved (`safe` AI classification synchronous
            // race), insert it into the visible list. Otherwise keep the list as
            // is — the user will see their comment on the next refresh when AI
            // moderation finishes.
            if outcome == .published {
                if let parent = parentId, let idx = comments.firstIndex(where: { $0.id == parent }) {
                    var copy = comments[idx]
                    let mergedReplies = copy.replies + [saved]
                    copy = APIComment(
                        id: copy.id,
                        body: copy.body,
                        userId: copy.userId,
                        userName: copy.userName,
                        userAvatar: copy.userAvatar,
                        createdAt: copy.createdAt,
                        likesCount: copy.likesCount,
                        status: copy.status,
                        parentId: copy.parentId,
                        replies: mergedReplies
                    )
                    comments[idx] = copy
                } else if parentId == nil {
                    comments.insert(saved, at: 0)
                }
            }
            replyingTo = nil
            return outcome
        } catch let api as APIError {
            lastError = api.errorDescription
            throw api
        } catch let custom as CommentsError {
            lastError = custom.errorDescription
            throw custom
        } catch {
            lastError = "تعذر إرسال التعليق"
            throw error
        }
    }

    private static func outcome(for comment: APIComment) -> SubmitOutcome {
        switch comment.status?.lowercased() {
        case "approved": return .published
        case "rejected": return .rejected
        default: return .awaitingReview
        }
    }
}

enum CommentsError: LocalizedError {
    case empty
    case tooLong

    var errorDescription: String? {
        switch self {
        case .empty: return "اكتب نص التعليق قبل الإرسال"
        case .tooLong: return "التعليق طويل جداً (الحد الأقصى \(CommentsStore.maxLength) حرف)"
        }
    }
}
