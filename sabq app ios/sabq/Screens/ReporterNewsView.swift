import SwiftUI

/// «أخباري» — لوحة المراسل في تطبيق «سبق»: ما أُعيد له أولًا، ثم أخباره
/// بحالاتها كما يعرضها الويب (/dashboard/reporter/articles)، وطلب تعديل على
/// المنشور، وزر «خبر جديد». المصدر: GET /api/v1/editorial/my-news.
struct ReporterNewsView: View {
    @State private var board = MyNewsBoard()
    @State private var filter: MyNewsFilter = .all
    @State private var loading = true
    @State private var error: EditorialError?
    @State private var me: EditorialMe?
    @State private var showCompose = false
    @State private var editTarget: MyNewsItem?
    @State private var cancelTarget: MyNewsItem?
    @State private var actionError: String?

    private var returned: [MyNewsItem] { board.items.filter { $0.state == .needs_changes } }
    private var listed: [MyNewsItem] {
        filter == .all ? board.items.filter { $0.state != .needs_changes } : board.items
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: SabqLayout.space16) {
                    header
                    if error != nil || (loading && board.items.isEmpty) {
                        EditorialStatusView(error: error, loading: loading) { Task { await load() } }
                    } else {
                        if filter == .all || filter == .needs_changes {
                            ForEach(returned) { returnedCard($0) }
                        }
                        chips
                        if let actionError {
                            Text(actionError)
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.danger)
                        }
                        if listed.isEmpty && (filter != .all || returned.isEmpty) {
                            emptyState
                        } else if !listed.isEmpty {
                            LazyVStack(spacing: 0) {
                                ForEach(listed) { item in
                                    if item.id != listed.first?.id {
                                        Divider().overlay(SabqTheme.separator)
                                    }
                                    newsRow(item)
                                }
                            }
                            .padding(.horizontal, SabqLayout.cardInset)
                            .sabqNewsSurface()
                        }
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
            Button("ألغِ الطلب", role: .destructive) {
                if let item = cancelTarget { Task { await cancel(item) } }
            }
            Button("تراجع", role: .cancel) {}
        } message: {
            Text("يمكنك إرسال طلب جديد بعد الإلغاء.")
        }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            Text([EditorialText.todayLine(), me?.name].compactMap { $0 }.joined(separator: " · "))
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
            Text("أخباري")
                .font(SabqType.pageTitle)
                .foregroundStyle(SabqTheme.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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

    private func returnedCard(_ item: MyNewsItem) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                Text("أُعيد لك")
                    .sabqText(SabqType.tag)
                    .foregroundStyle(SabqTheme.warning)
                    .padding(.horizontal, SabqLayout.space8)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(SabqTheme.warning.opacity(0.12)))
                Text("\(EditorialText.relative(item.reviewedAt ?? item.updatedAt)) · المحرر")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            Text(item.title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            if let notes = item.reviewNotes, !notes.isEmpty {
                Text("«\(notes)»")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            NavigationLink(value: DraftDeepLinkRoute(articleId: item.id)) {
                Text("عدّل وأعد الإرسال")
                    .sabqText(SabqType.button)
                    .foregroundStyle(SabqTheme.onAction)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Capsule().fill(SabqTheme.actionFill))
            }
            .buttonStyle(.plain)
            .padding(.top, SabqLayout.space4)
        }
        .editorialGroup()
    }

    private func newsRow(_ item: MyNewsItem) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(alignment: .top, spacing: SabqLayout.space12) {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text(item.title)
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(metaLine(item))
                        .sabqText(SabqType.meta)
                        .foregroundStyle(stateColor(item.state))
                }
                Spacer(minLength: 0)
                if item.thumbnailURL != nil {
                    EditorialThumbnail(url: item.thumbnailURL, size: 60)
                }
            }

            if item.state == .pending {
                progressLine(item)
            }

            if let pending = item.pendingEditRequest {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "clock")
                        .foregroundStyle(SabqTheme.primary)
                        .accessibilityHidden(true)
                    Text(pending.label.isEmpty ? "طلب تعديلك قيد المراجعة" : "طلب تعديلك قيد المراجعة · \(pending.label)")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                    Spacer(minLength: 0)
                    Button("إلغاء") { cancelTarget = item }
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.danger)
                }
            } else if item.canRequestEdit || item.publishedSlug != nil {
                HStack(spacing: SabqLayout.space8) {
                    if item.canRequestEdit {
                        Button { editTarget = item } label: {
                            Label("طلب تعديل", systemImage: "pencil")
                                .sabqText(SabqType.metaEmphasis)
                                .foregroundStyle(SabqTheme.primary)
                                .padding(.horizontal, SabqLayout.space12)
                                .frame(minHeight: 36)
                                .background(Capsule().fill(SabqTheme.surfaceMuted))
                        }
                        .buttonStyle(.plain)
                    }
                    if let slug = item.publishedSlug {
                        NavigationLink(value: ArticleSlugRoute(slug: slug)) {
                            Text("فتح الخبر")
                                .sabqText(SabqType.metaEmphasis)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .padding(.horizontal, SabqLayout.space12)
                                .frame(minHeight: 36)
                                .background(Capsule().fill(SabqTheme.chipFill))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(.vertical, SabqLayout.space12)
    }

    /// أُرسل → قيد المراجعة → النشر.
    private func progressLine(_ item: MyNewsItem) -> some View {
        HStack(spacing: SabqLayout.space8) {
            step("أُرسل \(EditorialText.dayTime(item.submittedAt ?? item.createdAt).replacingOccurrences(of: "اليوم ", with: ""))", done: true)
            bar(done: true)
            step("قيد المراجعة", done: true)
            bar(done: false)
            step("النشر", done: false)
        }
    }

    private func step(_ title: String, done: Bool) -> some View {
        HStack(spacing: SabqLayout.space4) {
            Circle()
                .fill(done ? SabqTheme.primary : SabqTheme.outline)
                .frame(width: 8, height: 8)
            Text(title)
                .sabqText(SabqType.timestamp)
                .foregroundStyle(done ? SabqTheme.textPrimary : SabqTheme.textTertiary)
                .lineLimit(1)
        }
    }

    private func bar(done: Bool) -> some View {
        Capsule()
            .fill(done ? SabqTheme.primary : SabqTheme.separator)
            .frame(height: 2)
            .frame(maxWidth: .infinity)
    }

    private var emptyState: some View {
        VStack(spacing: SabqLayout.space8) {
            Image(systemName: "newspaper")
                .font(SabqFonts.app(size: 28, weight: .semibold))
                .foregroundStyle(SabqTheme.primary)
                .accessibilityHidden(true)
            Text(filter == .all ? "لا أخبار خلال الأشهر الأربعة الماضية" : "لا شيء هنا")
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
            Text("أرسل خبرك من زر «خبر جديد» ويصل للمحررين فورًا.")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space32)
    }

    // MARK: - Helpers

    private func metaLine(_ item: MyNewsItem) -> String {
        switch item.state {
        case .published:
            let views = item.views > 0 ? " · \(item.views.formatted(.number.locale(Locale(identifier: "en_US")))) قراءة" : ""
            return "منشور · \(EditorialText.dayTime(item.publishedAt))\(views)"
        case .scheduled:
            return "مجدول · \(EditorialText.dayTime(item.scheduledAt))"
        case .pending:
            return "قيد المراجعة" + (item.categoryName.map { " · \($0)" } ?? "")
        case .draft:
            return "مسودة · \(EditorialText.dayTime(item.updatedAt))"
        default:
            return item.stateLabel
        }
    }

    private func stateColor(_ state: MyNewsState) -> Color {
        switch state {
        case .published: return SabqTheme.success
        case .scheduled, .pending: return SabqTheme.primary
        case .needs_changes: return SabqTheme.warning
        default: return SabqTheme.textSecondary
        }
    }

    private func load() async {
        if board.items.isEmpty { loading = true }
        do {
            async let meTask = EditorialAPI.me()
            async let boardTask = EditorialAPI.myNews(filter: filter)
            let (who, data) = try await (meTask, boardTask)
            me = who
            board = data
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
