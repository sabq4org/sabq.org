import SwiftUI

/// قسم التعليقات المشترك بين صفحة الخبر ومقال الرأي (كان داخل ArticleDetailView).
/// يقرأ ويكتب عبر `CommentsStore` على `/api/v1/articles/:slug/comments`، وهو يقبل
/// slug الرأي أيضًا لأن مقالات الرأي في جدول المقالات نفسه. يضيف الإعجاب
/// بالتعليقات وترتيبها «الأحدث / الأكثر إعجابًا» كما في الويب.
struct ArticleCommentsSection: View {
    let store: CommentsStore
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var showLoginForCommentSheet = false
    @State private var commentFeedback: CommentFeedback?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HomeSectionHeader(title: "التعليقات", context: commentsSubtitle(for: store))

            if let feedback = commentFeedback {
                commentFeedbackBanner(feedback)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }

            if store.comments.count > 1 {
                sortPicker
            }

            if authStore.isLoggedIn {
                CommentComposer(
                    store: store,
                    onSubmit: { outcome in
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                            commentFeedback = .init(outcome: outcome)
                        }
                        scheduleFeedbackDismissal()
                    },
                    onAuthRequired: { showLoginForCommentSheet = true },
                    onError: { message in
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                            commentFeedback = .init(message: message, isError: true)
                        }
                        scheduleFeedbackDismissal()
                    }
                )
            } else {
                signInPromptCard
            }

            commentsList(store: store)
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 6)
        .sabqBlockSurface(SabqTheme.publicSurface)
        .sheet(isPresented: $showLoginForCommentSheet) {
            LoginSheet()
        }
        .task(id: authStore.isLoggedIn) {
            if authStore.isLoggedIn { await store.loadMyLikes() }
        }
    }

    /// «الأحدث / الأكثر إعجابًا» كما في قسم التعليقات بالويب.
    private var sortPicker: some View {
        Picker("ترتيب التعليقات", selection: Binding(
            get: { store.sortOrder },
            set: { newValue in withAnimation(.snappy(duration: 0.25)) { store.sortOrder = newValue } }
        )) {
            ForEach(CommentsStore.SortOrder.allCases) { order in
                Text(order.rawValue).tag(order)
            }
        }
        .pickerStyle(.segmented)
    }

    private func like(_ comment: APIComment) {
        guard authStore.isLoggedIn else {
            showLoginForCommentSheet = true
            return
        }
        Task {
            do {
                try await store.toggleLike(comment)
            } catch {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                    commentFeedback = .init(message: "تعذر تسجيل الإعجاب، حاول مرة أخرى", isError: true)
                }
                scheduleFeedbackDismissal()
            }
        }
    }

    private func commentsSubtitle(for store: CommentsStore) -> String {
        switch store.loadState {
        case .idle, .loading: return "يتم التحميل…"
        case .failed: return "تعذر التحميل"
        case .loaded:
            let total = store.comments.reduce(0) { $0 + 1 + $1.replies.count }
            return total == 0 ? "كن أول من يعلّق" : "\(total) تعليق"
        }
    }

    @ViewBuilder
    private func commentsList(store: CommentsStore) -> some View {
        if store.comments.isEmpty {
            switch store.loadState {
            case .idle, .loading:
                commentSkeletonList
            case .failed(let message):
                commentErrorState(message: message, store: store)
            case .loaded:
                commentEmptyState
            }
        } else {
            LazyVStack(alignment: .leading, spacing: 6) {
                let ordered = store.sortedComments
                ForEach(ordered) { comment in
                    if comment.id != ordered.first?.id {
                        SidebarRowDivider()
                    }
                    CommentRow(
                        comment: comment,
                        onReply: { tapped in store.replyingTo = tapped },
                        likeState: { c in (store.isLiked(c), store.likes(for: c)) },
                        onLike: { c in like(c) }
                    )
                }
            }
        }
    }

    /// دعوة الدخول سطر واحد بزر مستطيل (نموذج صفحة الخبر المعتمد 2026-10-09).
    private var signInPromptCard: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SabqLayout.space12))
            : AnyLayout(HStackLayout(spacing: SabqLayout.space12))
        return layout {
            Text("سجّل دخولك لإضافة تعليق")
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Button {
                SabqHaptics.light()
                showLoginForCommentSheet = true
            } label: {
                Text("تسجيل الدخول")
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(SabqTheme.onAction)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .frame(minHeight: SabqLayout.touchTarget)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.actionFill)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .sabqBlockSurface()
    }

    private var commentEmptyState: some View {
        HStack(spacing: 8) {
            Image(systemName: "bubble.left")
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textTertiary)
            Text("لا توجد تعليقات بعد")
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 10)
    }

    private var commentSkeletonList: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(0..<3, id: \.self) { _ in
                HStack(alignment: .top, spacing: 10) {
                    Circle()
                        .fill(SabqTheme.surfaceMuted)
                        .frame(width: 32, height: 32)
                    VStack(alignment: .leading, spacing: 6) {
                        RoundedRectangle(cornerRadius: SabqRadius.small)
                            .fill(SabqTheme.surfaceMuted)
                            .frame(width: 110, height: 12)
                        RoundedRectangle(cornerRadius: SabqRadius.small)
                            .fill(SabqTheme.surfaceMuted)
                            .frame(maxWidth: .infinity)
                            .frame(height: 10)
                        RoundedRectangle(cornerRadius: SabqRadius.small)
                            .fill(SabqTheme.surfaceMuted)
                            .frame(width: 220, height: 10)
                    }
                }
            }
        }
        .redacted(reason: .placeholder)
    }

    private func commentErrorState(message: String, store: CommentsStore) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "wifi.exclamationmark")
                .font(SabqType.sectionHeading.font)
                .foregroundStyle(SabqTheme.textTertiary)
            Text(message)
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
            Button {
                Task { await store.load() }
            } label: {
                Text("إعادة المحاولة")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.primary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(
                        Capsule().fill(SabqTheme.surfaceMuted)
                    )
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
    }

    private func commentFeedbackBanner(_ feedback: CommentFeedback) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: feedback.icon)
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(feedback.tint)
            Text(feedback.message)
                .font(SabqType.tag.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                withAnimation { commentFeedback = nil }
            } label: {
                Image(systemName: "xmark")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                .fill(feedback.tint.opacity(0.12))
        )
    }

    private func scheduleFeedbackDismissal() {
        Task {
            try? await Task.sleep(nanoseconds: 4_500_000_000)
            await MainActor.run {
                withAnimation(.easeOut(duration: 0.25)) {
                    commentFeedback = nil
                }
            }
        }
    }
}


/// One-shot toast/banner state for the comments section. Lives on the view
/// (not on the store) so it can be cleared by user interaction independently
/// from the underlying submission state.
struct CommentFeedback: Equatable {
    let message: String
    let icon: String
    let tint: Color
    let isError: Bool

    init(message: String, icon: String = "info.circle.fill", tint: Color = SabqTheme.teal, isError: Bool = false) {
        self.message = message
        self.icon = icon
        self.tint = tint
        self.isError = isError
    }

    init(outcome: CommentsStore.SubmitOutcome) {
        switch outcome {
        case .published:
            self.init(
                message: "تم نشر تعليقك",
                icon: "checkmark.circle.fill",
                tint: SabqTheme.teal
            )
        case .awaitingReview:
            self.init(
                message: "SABQ AI يراجع تعليقك الآن — يظهر فور الاعتماد",
                icon: "sparkles",
                tint: SabqTheme.primaryEnd
            )
        case .rejected:
            self.init(
                message: "لم يستوفِ التعليق سياسة النشر",
                icon: "xmark.octagon.fill",
                tint: .red,
                isError: true
            )
        }
    }
}
