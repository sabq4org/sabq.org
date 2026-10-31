import SwiftUI

/// «أخباري» — لوحة المراسل في تطبيق «سبق»، نسخة من صفحة الويب
/// (/dashboard/reporter/articles): ملخّص «يحتاج تعديلك» أعلى، ثم الشرائح
/// نفسها، ثم قائمة واحدة فيها ملاحظة المحرر وملصق طلب التعديل على صف الخبر،
/// والأداء مطوي في الأسفل. الكلمات من `EditorialStates` (قاموس الويب).
/// المصدر: GET /api/v1/editorial/my-news.
struct ReporterNewsView: View {
    @State private var board = MyNewsBoard()
    @State private var filter: MyNewsFilter = .all
    @State private var loading = true
    @State private var error: EditorialError?
    @State private var showCompose = false
    @State private var editTarget: MyNewsItem?
    @State private var cancelTarget: MyNewsItem?
    @State private var actionError: String?

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: SabqLayout.space16) {
                    header
                    if error != nil || (loading && board.items.isEmpty) {
                        EditorialStatusView(error: error, loading: loading) { Task { await load() } }
                    } else {
                        summary
                        chips
                        if let actionError {
                            Text(actionError)
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.danger)
                        }
                        if board.items.isEmpty {
                            emptyState
                        } else {
                            LazyVStack(spacing: 0) {
                                ForEach(board.items) { item in
                                    if item.id != board.items.first?.id {
                                        Divider().overlay(SabqTheme.separator)
                                    }
                                    newsRow(item)
                                }
                            }
                            .sabqNewsSurface()
                        }
                        performanceLink
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.top, SabqLayout.space8)
                .padding(.bottom, 120)
            }
            .refreshable { await load() }

            if error == nil {
                Button { showCompose = true } label: {
                    Label("خبر جديد", systemImage: "plus")
                        .sabqText(SabqType.button)
                        .foregroundStyle(SabqTheme.onAction)
                        .padding(.horizontal, SabqLayout.space24)
                        .frame(minHeight: 52)
                        .background(Capsule().fill(SabqTheme.actionFill))
                        .shadow(color: SabqTheme.shadow, radius: 12, y: 4)
                }
                .buttonStyle(.plain)
                .padding(.leading, SabqLayout.pageMargin)
                .padding(.bottom, SabqLayout.space24)
            }
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $showCompose, onDismiss: { Task { await load() } }) {
            ArticleSubmissionView(kind: .news)
        }
        .sheet(item: $editTarget, onDismiss: { Task { await load() } }) { item in
            EditRequestComposeView(articleId: item.id, articleTitle: item.title, stateLabel: item.stateLabel)
        }
        .confirmationDialog("إلغاء طلب التعديل؟", isPresented: Binding(
            get: { cancelTarget != nil }, set: { if !$0 { cancelTarget = nil } }
        ), titleVisibility: .visible) {
            Button(EditorialStates.cancelRequest, role: .destructive) {
                if let item = cancelTarget { Task { await cancel(item) } }
            }
            Button("تراجع", role: .cancel) {}
        } message: {
            Text("يمكنك إرسال طلب جديد بعد الإلغاء.")
        }
    }

    // MARK: - Sections

    private var header: some View {
        HStack(spacing: SabqLayout.space8) {
            Text("أخباري")
                .font(SabqType.pageTitle)
                .foregroundStyle(SabqTheme.textPrimary)
            Spacer(minLength: 0)
            NavigationLink(value: EditorialNotificationsRoute()) {
                Image(systemName: "bell")
                    .font(SabqFonts.app(size: 17, weight: .semibold))
                    .foregroundStyle(SabqTheme.textPrimary)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(SabqTheme.surface))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("إشعاراتي التحريرية")
        }
    }

    /// نفس ملخّص الويب: ما يحتاج تعديلك أولًا، ويفتح شريحته عند اللمس.
    private var summary: some View {
        Button {
            guard filter != .needs_changes else { return }
            filter = .needs_changes
            Task { await load() }
        } label: {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "pencil.line")
                    .font(SabqFonts.app(size: 19, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SabqTheme.surface))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
                        Text("\(board.counts.needs_changes)")
                            .font(SabqFonts.app(size: 30, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(SabqTheme.textPrimary)
                        Text("خبر يحتاج تعديلك")
                            .sabqText(SabqType.rowTitle)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                    Text("و\(board.counts.pending) قيد المراجعة عند المحرر، و\(board.counts.scheduled) مجدول للنشر")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                Spacer(minLength: 0)
            }
            .padding(SabqLayout.space16)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(LinearGradient(colors: [SabqTheme.primary.opacity(0.12), Color.purple.opacity(0.07)],
                                         startPoint: .trailing, endPoint: .leading))
            )
        }
        .buttonStyle(.plain)
    }

    private var chips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SabqLayout.space8) {
                ForEach(MyNewsFilter.allCases) { option in
                    EditorialChip(title: option.title, count: board.counts.count(for: option), selected: filter == option) {
                        guard filter != option else { return }
                        filter = option
                        Task { await load() }
                    }
                }
            }
        }
    }

    private func newsRow(_ item: MyNewsItem) -> some View {
        let returned = item.state == .needs_changes
        return VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(alignment: .top, spacing: SabqLayout.space12) {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    Text(item.title)
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: SabqLayout.space8) {
                        EditorialStatePill(item.stateLabel)
                        Text(metaLine(item))
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                if item.thumbnailURL != nil {
                    EditorialThumbnail(url: item.thumbnailURL, size: 60)
                }
            }

            if returned, let notes = item.reviewNotes, !notes.isEmpty {
                (Text("ملاحظة المحرر: ").bold() + Text(notes))
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, SabqLayout.space12)
                    .padding(.vertical, SabqLayout.space8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SabqTheme.warning.opacity(0.12)))
            }

            if let badge = requestBadge(item) {
                badge
                if let reason = item.lastEditRequest?.decisionNote, item.lastEditRequest?.outcome == .rejected, !reason.isEmpty {
                    Text("السبب: \(reason)")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            actions(item)
        }
        .padding(.horizontal, SabqLayout.cardInset)
        .padding(.vertical, SabqLayout.space12)
        .background(returned ? SabqTheme.warning.opacity(0.05) : Color.clear)
    }

    /// الملصق كما في الويب. سيرفر أقدم بلا lastEditRequest: المفتوح فقط.
    private func requestBadge(_ item: MyNewsItem) -> EditRequestBadge? {
        if let last = item.lastEditRequest {
            switch last.outcome {
            case .pending: return EditRequestBadge(outcome: .pending, detail: last.label, urgent: last.urgent)
            case .approved: return EditRequestBadge(outcome: .approved, detail: EditorialText.relative(last.decidedAt))
            case .rejected: return EditRequestBadge(outcome: .rejected, detail: EditorialText.relative(last.decidedAt))
            case .unknown: return nil
            }
        }
        if let pending = item.pendingEditRequest {
            return EditRequestBadge(outcome: .pending, detail: pending.label)
        }
        return nil
    }

    @ViewBuilder
    private func actions(_ item: MyNewsItem) -> some View {
        let hasPending = item.pendingEditRequest != nil
        if item.state == .needs_changes || item.canRequestEdit || item.publishedSlug != nil || hasPending {
            HStack(spacing: SabqLayout.space8) {
                if item.state == .needs_changes {
                    NavigationLink(value: DraftDeepLinkRoute(articleId: item.id)) {
                        Text(EditorialStates.resubmit)
                            .sabqText(SabqType.button)
                            .foregroundStyle(SabqTheme.onAction)
                            .padding(.horizontal, SabqLayout.space16)
                            .frame(minHeight: 40)
                            .background(Capsule().fill(SabqTheme.actionFill))
                    }
                    .buttonStyle(.plain)
                }
                if item.canRequestEdit && !hasPending {
                    Button { editTarget = item } label: {
                        EditorialPillButtonLabel(title: EditorialStates.requestEdit, systemImage: "pencil", emphasized: true)
                    }
                    .buttonStyle(.plain)
                }
                if let slug = item.publishedSlug {
                    NavigationLink(value: ArticleSlugRoute(slug: slug)) {
                        EditorialPillButtonLabel(title: EditorialStates.openArticle)
                    }
                    .buttonStyle(.plain)
                }
                if hasPending {
                    Button(EditorialStates.cancelRequest) { cancelTarget = item }
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.danger)
                        .frame(minHeight: 36)
                }
            }
        }
    }

    /// الأداء مطوي كما في الويب: المشاهدات والتفاعل في شاشة مستقلة.
    private var performanceLink: some View {
        NavigationLink(value: ContributorDashboardRoute()) {
            HStack(spacing: SabqLayout.space8) {
                Text("أداء أخباري")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text("المشاهدات والتفاعل والجمهور")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                Spacer(minLength: 0)
                Text("عرض")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.primary)
            }
            .padding(SabqLayout.cardInset)
            .frame(minHeight: 56)
            .sabqNewsSurface()
        }
        .buttonStyle(.plain)
    }

    private var emptyState: some View {
        VStack(spacing: SabqLayout.space8) {
            Image(systemName: "newspaper")
                .font(SabqFonts.app(size: 28, weight: .semibold))
                .foregroundStyle(SabqTheme.primary)
                .accessibilityHidden(true)
            Text(filter == .all ? "لا توجد أخبار بعد" : "لا توجد أخبار هنا")
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
            Text("أرسل خبرك من زر «خبر جديد» ويصل للمحررين فورًا.")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space32)
        .sabqNewsSurface()
    }

    // MARK: - Helpers

    /// التاريخ وما يخص الحالة؛ اسم الحالة في الشارة وحدها.
    private func metaLine(_ item: MyNewsItem) -> String {
        switch item.state {
        case .published:
            let views = item.views > 0 ? " · \(item.views.formatted(.number.locale(Locale(identifier: "en_US")))) مشاهدة" : ""
            return EditorialText.dayTime(item.publishedAt) + views
        case .scheduled:
            return EditorialText.dayTime(item.scheduledAt)
        case .needs_changes:
            return EditorialText.relative(item.reviewedAt ?? item.updatedAt)
        case .pending:
            return EditorialText.dayTime(item.submittedAt ?? item.createdAt)
        default:
            return EditorialText.dayTime(item.updatedAt)
        }
    }

    private func load() async {
        if board.items.isEmpty { loading = true }
        do {
            board = try await EditorialAPI.myNews(filter: filter)
            error = nil
        } catch let e as EditorialError {
            error = e
        } catch {
            self.error = .message(error.localizedDescription)
        }
        loading = false
    }

    private func cancel(_ item: MyNewsItem) async {
        guard let id = item.pendingEditRequest?.id else { return }
        do {
            try await EditorialAPI.cancelEditRequest(id: id)
            actionError = nil
            await load()
        } catch {
            actionError = error.localizedDescription
        }
        cancelTarget = nil
    }
}
