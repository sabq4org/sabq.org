import SwiftUI
import Combine

// MARK: - View model

/// Owns the admin dashboard's data + the administrative actions (filter by
/// status, publish, apply edits). Mirrors the observation pattern used by
/// `ContributorDashboardViewModel`. Backed by `AdminServicing`, so the mocked
/// store can be swapped for a live API without touching the view.
@MainActor
final class AdminDashboardViewModel: ObservableObject {
    @Published var counts: AdminCounts?
    @Published var items: [AdminNewsItem] = []
    @Published var selectedStatus: AdminArticleStatus = .draft
    @Published var isLoading = true
    /// Stats load independently of the list (they're heavy) so the news list
    /// shows immediately while the cards fill in.
    @Published var isStatsLoading = true
    @Published var isLoadingMore = false
    @Published var error: String?
    /// Ids currently being published — drives the per-row spinner.
    @Published var publishingIds: Set<String> = []

    /// Total items behind the current tab (for the "load more" affordance).
    @Published private(set) var total = 0
    private var page = 1

    /// True when there are more pages to fetch for the current tab.
    var canLoadMore: Bool { items.count < total }

    private let service: AdminServicing

    init(service: AdminServicing? = nil) {
        self.service = service ?? LiveAdminService()
    }

    /// Initial / pull-to-refresh load. The (slow) stats fetch runs in its own
    /// task so it doesn't block the news list from appearing.
    func load() async {
        isLoading = true
        error = nil
        page = 1
        Task { await refreshStats() }
        do {
            let pageResult = try await service.fetchNews(status: selectedStatus, page: 1)
            items = pageResult.items
            total = pageResult.total
        } catch {
            self.error = "تعذّر تحميل البيانات"
        }
        isLoading = false
    }

    /// Fetch the lightweight counts (independent of the list).
    private func refreshStats() async {
        isStatsLoading = true
        defer { isStatsLoading = false }
        counts = (try? await service.fetchCounts()) ?? counts
    }

    /// Switch the active section and reload its first page.
    func select(_ status: AdminArticleStatus) async {
        guard status != selectedStatus else { return }
        selectedStatus = status
        isLoading = true
        page = 1
        await reloadFirstPage()
        isLoading = false
    }

    /// Append the next page of the current tab.
    func loadMore() async {
        guard !isLoadingMore, canLoadMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let next = page + 1
            let pageResult = try await service.fetchNews(status: selectedStatus, page: next)
            // De-dupe defensively in case rows shifted between pages.
            let existing = Set(items.map(\.id))
            items.append(contentsOf: pageResult.items.filter { !existing.contains($0.id) })
            total = pageResult.total
            page = next
        } catch {
            self.error = "تعذّر جلب المزيد"
        }
    }

    /// Publish an item, then refresh the visible list + metrics so the change
    /// (item leaves a non-published tab, "published today" bumps) is reflected.
    func publish(_ item: AdminNewsItem) async {
        publishingIds.insert(item.id)
        defer { publishingIds.remove(item.id) }
        do {
            _ = try await service.publish(id: item.id)
            await refreshFirstPageAndMetrics()
        } catch {
            self.error = "تعذّر نشر الخبر"
        }
    }

    /// Called after the editor saves — refresh the visible list + metrics.
    func refreshAfterEdit() async {
        await refreshFirstPageAndMetrics()
    }

    // MARK: Editorial workflow

    func archive(_ item: AdminNewsItem, reason: String) async -> Bool {
        do {
            try await service.archive(id: item.id, reason: reason)
            await refreshFirstPageAndMetrics()
            return true
        } catch {
            self.error = "تعذّر أرشفة الخبر"
            return false
        }
    }

    func requestRevision(_ item: AdminNewsItem, notes: String) async -> Bool {
        do {
            try await service.requestRevision(id: item.id, notes: notes)
            await refreshFirstPageAndMetrics()
            return true
        } catch {
            self.error = "تعذّر إرسال طلب التعديل"
            return false
        }
    }

    func permanentDelete(_ item: AdminNewsItem, reason: String) async -> Bool {
        do {
            try await service.permanentDelete(id: item.id, reason: reason)
            await refreshFirstPageAndMetrics()
            return true
        } catch {
            self.error = "تعذّر الحذف النهائي"
            return false
        }
    }

    private func reloadFirstPage() async {
        do {
            let pageResult = try await service.fetchNews(status: selectedStatus, page: 1)
            items = pageResult.items
            total = pageResult.total
            page = 1
            error = nil
        } catch {
            self.error = "تعذّر تحميل البيانات"
        }
    }

    private func refreshFirstPageAndMetrics() async {
        Task { await refreshStats() }
        do {
            let pageResult = try await service.fetchNews(status: selectedStatus, page: 1)
            items = pageResult.items
            total = pageResult.total
            page = 1
        } catch {
            self.error = "تعذّر تحديث البيانات"
        }
    }
}

// MARK: - Dashboard view

/// Streamlined newsroom dashboard for platform admins. Reachable from the
/// profile screen and pushed onto the shared `NavigationStack`.
struct AdminDashboardView: View {
    @StateObject private var vm = AdminDashboardViewModel()
    @State private var pendingAction: AdminWorkflowAction?
    @State private var showNewArticleChoice = false
    @State private var pendingPublish: AdminNewsItem?
    /// Drives the push into the editor in "new article" mode ("news"/"opinion").
    @State private var newArticleType: String?
    /// ما ينتظر القرار (/editorial/news): الملخّص أعلى اللوحة، وملصق طلب
    /// التعديل على صف الخبر كما في «الأخبار والمقالات» على الويب. فشله لا يوقف اللوحة.
    @State private var queue: EditorialNewsBoard?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                if let queue {
                    decisionSummary(queue)
                } else {
                    // تعذّر الملخّص (مثل مصادقة ثنائية غير مفعّلة): المدخل يبقى،
                    // وصفحة القائمة تشرح السبب ورابط التفعيل.
                    NavigationLink(value: SupervisorNewsRoute()) {
                        adminShortcut(
                            title: "بانتظار قرارك",
                            subtitle: "أخبار المراسلين وطلبات التعديل",
                            icon: "tray.full",
                            tint: SabqTheme.primary
                        )
                        .padding(.horizontal, SabqLayout.space16)
                        .sabqNewsSurface()
                    }
                    .buttonStyle(.plain)
                }
                AdminSegmentedControl(selected: vm.selectedStatus) { status in
                    Task { await vm.select(status) }
                }
                listSection
                metricsSection
                inboxSection
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.tabBarClearance)
        }
        .sabqNavigationEdge()
        .sabqAutoHideTabBar()
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("لوحة التحكم")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(SabqTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showNewArticleChoice = true } label: {
                    Image(systemName: "plus")
                        .font(SabqFonts.app(size: 17, weight: .semibold))
                }
            }
        }
        .confirmationDialog("نوع المحتوى", isPresented: $showNewArticleChoice, titleVisibility: .visible) {
            Button("خبر") { newArticleType = "news" }
            Button("مقال رأي") { newArticleType = "opinion" }
            Button("إلغاء", role: .cancel) {}
        }
        .alert("تأكيد النشر الآن", isPresented: Binding(
            get: { pendingPublish != nil },
            set: { if !$0 { pendingPublish = nil } }
        ), presenting: pendingPublish) { item in
            Button("نشر الآن") { Task { await vm.publish(item) } }
            Button("إلغاء", role: .cancel) {}
        } message: { item in
            if let schedule = item.schedulePresentation(), let when = schedule.fullLabel {
                Text("سيُنشر المقال فورًا. موعده المعروض: \(when). للجدولة في موعد آخر، افتح تعديل المقال.")
            } else {
                Text("سيُنشر المقال فورًا. للجدولة في موعد لاحق، افتح تعديل المقال.")
            }
        }
        // Registered here (not in ContentView) so the editor's save callback
        // can reach this screen's view model directly.
        .navigationDestination(for: AdminArticleEditorRoute.self) { route in
            AdminArticleEditorView(articleId: route.item.id, title: route.item.title) {
                Task { await vm.refreshAfterEdit() }
            }
        }
        .navigationDestination(item: $newArticleType) { type in
            AdminArticleEditorView(articleId: nil, articleType: type, title: "") {
                Task { await vm.refreshAfterEdit() }
            }
        }
        .sheet(item: $pendingAction) { action in
            AdminReasonSheet(action: action) { reason in
                switch action {
                case .requestRevision(let item): return await vm.requestRevision(item, notes: reason)
                case .archive(let item):         return await vm.archive(item, reason: reason)
                case .permanentDelete(let item): return await vm.permanentDelete(item, reason: reason)
                }
            }
        }
        .task {
            Task { await loadQueue() }
            await vm.load()
        }
        .refreshable {
            Task { await loadQueue() }
            await vm.load()
        }
        .sabqScreen("AdminDashboard")
    }

    // MARK: بانتظار قرارك (نفس ملخّص الويب و«مكتب سبق»)

    /// طلبات التعديل المفتوحة لكل خبر، للملصق النابض على صفه.
    private var openRequests: [String: [EditorialNewsEditRequest]] {
        var map: [String: [EditorialNewsEditRequest]] = [:]
        for item in queue?.items ?? [] {
            if case .editRequest(let request) = item { map[request.articleId, default: []].append(request) }
        }
        return map
    }

    private func loadQueue() async {
        // بلا مصادقة ثنائية أو صلاحية: تبقى اللوحة كما كانت دون الملخّص.
        queue = try? await EditorialAPI.newsBoard(filter: .all)
    }

    private func decisionSummary(_ board: EditorialNewsBoard) -> some View {
        let requests = openRequests.values.flatMap { $0 }
        let urgent = requests.filter(\.urgent).count
        let drafts = board.counts.all - board.counts.editRequests
        return VStack(alignment: .leading, spacing: SabqLayout.space12) {
            NavigationLink(value: SupervisorNewsRoute()) {
                HStack(spacing: SabqLayout.space12) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
                            Text("\(board.counts.all)")
                                .font(SabqFonts.app(size: 30, weight: .bold))
                                .monospacedDigit()
                                .foregroundStyle(SabqTheme.textPrimary)
                            Text("بانتظار قرارك")
                                .sabqText(SabqType.rowTitle)
                                .foregroundStyle(SabqTheme.textSecondary)
                        }
                        Text(board.counts.all == 0
                             ? "لا شيء ينتظر قرارك الآن"
                             : "\(drafts) من المراسلين والبريد، و\(board.counts.editRequests) طلب تعديل" + (urgent > 0 ? " (\(urgent) عاجل)" : ""))
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                    Spacer(minLength: 0)
                    if let oldest = board.oldestAt, board.counts.all > 0 {
                        VStack(spacing: 0) {
                            Text("أقدمها").sabqText(SabqType.timestamp).foregroundStyle(SabqTheme.textSecondary)
                            Text(EditorialText.relative(oldest)).sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                        }
                        .padding(.horizontal, SabqLayout.space12)
                        .padding(.vertical, SabqLayout.space8)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(SabqTheme.surface.opacity(0.7)))
                    }
                }
                .padding(SabqLayout.space16)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(LinearGradient(colors: [SabqTheme.primary.opacity(0.12), Color.purple.opacity(0.07)],
                                             startPoint: .trailing, endPoint: .leading))
                )
            }
            .buttonStyle(.plain)

            if board.counts.editRequests > 0 {
                NavigationLink(value: SupervisorNewsRoute(filter: .editRequests)) {
                    EditRequestBadge(outcome: .pending, detail: "", urgent: urgent > 0, count: board.counts.editRequests, title: "عليها طلب تعديل")
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: Admin inbox shortcuts

    /// Operational queues deliberately sit above the article workflow: they
    /// are time-sensitive communications, while drafts can wait for the next
    /// editorial session. Both destinations remain protected server-side by
    /// the mobile platform-admin Bearer check.
    private var inboxSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HomeSectionHeader(title: "صندوق الإدارة")

            VStack(spacing: 0) {
                NavigationLink(value: AdminContactMessagesRoute()) {
                    adminShortcut(
                        title: "رسائل التواصل",
                        subtitle: "عرض الرسائل الواردة والرد عليها",
                        icon: "envelope",
                        tint: SabqTheme.success
                    )
                }
                .buttonStyle(.plain)

                SidebarRowDivider()

                NavigationLink(value: AdminOpinionTicketsRoute()) {
                    adminShortcut(
                        title: "استفسارات كتّاب الرأي",
                        subtitle: "متابعة المحادثات مع الكتّاب",
                        icon: "text.bubble",
                        tint: SabqTheme.warning
                    )
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, SabqLayout.space16)
            .sabqNewsSurface()
        }
    }

    private func adminShortcut(title: String, subtitle: String, icon: String, tint: Color) -> some View {
        HStack(spacing: SabqLayout.space12) {
            SmallSquareBadge(systemImage: icon, tint: tint)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1)
                Text(subtitle)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.forward")
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
        }
        .padding(.vertical, SabqLayout.space12)
        .frame(maxWidth: .infinity, minHeight: SabqLayout.touchTarget, alignment: .leading)
        .contentShape(Rectangle())
    }

    // MARK: Metrics strip

    @ViewBuilder
    private var metricsSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HomeSectionHeader(title: "نظرة عامة")

            let columns = SabqGrid.adaptive(spacing: SabqLayout.space8)
            if let counts = vm.counts {
                LazyVGrid(columns: columns, spacing: SabqLayout.space8) {
                    AdminStatGridCard(
                        card: AdminStatCard(key: "draft", title: "المسودات", value: "\(counts.draft)",
                                            breakdown: nil, icon: "doc.text", tint: SabqTheme.warning),
                        isSelected: vm.selectedStatus == .draft
                    ) { Task { await vm.select(.draft) } }
                    AdminStatGridCard(
                        card: AdminStatCard(key: "scheduled", title: "المجدولة", value: "\(counts.scheduled)",
                                            breakdown: nil, icon: "clock", tint: SabqTheme.primary),
                        isSelected: vm.selectedStatus == .scheduled
                    ) { Task { await vm.select(.scheduled) } }
                }
            } else if vm.isStatsLoading {
                LazyVGrid(columns: columns, spacing: SabqLayout.space8) {
                    ForEach(0..<2, id: \.self) { _ in
                        SkeletonBox(height: 72, radius: SabqRadius.medium)
                    }
                }
            }
        }
    }

    // MARK: News list

    @ViewBuilder
    private var listSection: some View {
        if let error = vm.error, vm.items.isEmpty {
            ErrorStateView(message: error) { Task { await vm.load() } }
                .frame(maxWidth: .infinity, minHeight: 240)
        } else if vm.isLoading && vm.items.isEmpty {
            VStack(spacing: 0) {
                ForEach(0..<4, id: \.self) { index in
                    if index > 0 { SidebarRowDivider() }
                    AdminNewsRowSkeleton()
                }
            }
            .padding(.horizontal, SabqLayout.space16)
            .sabqNewsSurface()
        } else if vm.items.isEmpty {
            EmptyStateView(
                icon: "tray",
                tint: SabqTheme.textTertiary,
                title: "لا توجد أخبار",
                subtitle: "لا شيء في \(vm.selectedStatus.label) حاليًا"
            )
            .frame(maxWidth: .infinity, minHeight: 240)
        } else {
            VStack(spacing: SabqLayout.space12) {
                LazyVStack(spacing: 0) {
                    ForEach(vm.items) { item in
                        if item.id != vm.items.first?.id {
                            SidebarRowDivider()
                        }
                        VStack(alignment: .leading, spacing: 0) {
                            AdminNewsRow(
                                item: item,
                                isPublishing: vm.publishingIds.contains(item.id),
                                onPublish: { pendingPublish = item },
                                onRequestRevision: { pendingAction = .requestRevision(item) },
                                onArchive: { pendingAction = .archive(item) },
                                onPermanentDelete: { pendingAction = .permanentDelete(item) }
                            )
                            if let requests = openRequests[item.id], let first = requests.first(where: \.urgent) ?? requests.first {
                                NavigationLink(value: EditRequestReviewRoute(id: first.id)) {
                                    EditRequestBadge(outcome: .pending, detail: first.label ?? "", urgent: first.urgent, count: requests.count)
                                }
                                .buttonStyle(.plain)
                                .padding(.bottom, SabqLayout.space12)
                            }
                        }
                    }
                }
                .padding(.horizontal, SabqLayout.space16)
                .sabqNewsSurface()

                if vm.canLoadMore {
                    loadMoreButton
                }
            }
        }
    }

    private var loadMoreButton: some View {
        Button {
            Task { await vm.loadMore() }
        } label: {
            HStack(spacing: SabqLayout.space8) {
                if vm.isLoadingMore {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "arrow.down")
                        .font(SabqType.button.font)
                }
                Text(vm.isLoadingMore ? "جارٍ الجلب…" : "جلب المزيد")
                    .sabqText(SabqType.button)
            }
            .foregroundStyle(SabqTheme.primary)
            .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
            .overlay(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .stroke(SabqTheme.outline, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(vm.isLoadingMore)
    }
}

// MARK: - Routes

/// Pushes the dashboard from the profile screen.
struct AdminDashboardRoute: Hashable {}

/// Pushes the simplified editor for a specific item.
struct AdminArticleEditorRoute: Hashable {
    let item: AdminNewsItem
}
