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

    init(service: AdminServicing = LiveAdminService()) {
        self.service = service
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
    /// Drives the push into the editor in "new article" mode ("news"/"opinion").
    @State private var newArticleType: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                metricsSection
                AdminSegmentedControl(selected: vm.selectedStatus) { status in
                    Task { await vm.select(status) }
                }
                listSection
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 110)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("لوحة التحكم")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showNewArticleChoice = true } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 18, weight: .semibold))
                }
            }
        }
        .confirmationDialog("نوع المحتوى", isPresented: $showNewArticleChoice, titleVisibility: .visible) {
            Button("خبر") { newArticleType = "news" }
            Button("مقال رأي") { newArticleType = "opinion" }
            Button("إلغاء", role: .cancel) {}
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
        .task { await vm.load() }
        .refreshable { await vm.load() }
        .sabqScreen("AdminDashboard")
    }

    // MARK: Metrics strip

    @ViewBuilder
    private var metricsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("نظرة عامة")
                .font(.system(size: 18, weight: .heavy, design: .rounded))
                .foregroundStyle(SabqTheme.ink)

            let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]
            if let counts = vm.counts {
                LazyVGrid(columns: columns, spacing: 10) {
                    AdminStatGridCard(
                        card: AdminStatCard(key: "draft", title: "المسودات", value: "\(counts.draft)",
                                            breakdown: "اضغط للعرض", icon: "doc.text", tint: SabqTheme.gold)
                    ) { Task { await vm.select(.draft) } }
                    AdminStatGridCard(
                        card: AdminStatCard(key: "scheduled", title: "المجدولة", value: "\(counts.scheduled)",
                                            breakdown: "اضغط للعرض", icon: "clock.fill", tint: SabqTheme.sky)
                    ) { Task { await vm.select(.scheduled) } }
                }
            } else if vm.isStatsLoading {
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(0..<2, id: \.self) { _ in
                        SkeletonBox(height: 78, radius: SabqTheme.tileRadius)
                    }
                }
            }
        }
    }

    // MARK: News list

    @ViewBuilder
    private var listSection: some View {
        if let error = vm.error, vm.items.isEmpty {
            errorState(error)
        } else if vm.isLoading && vm.items.isEmpty {
            VStack(spacing: 12) {
                ForEach(0..<4, id: \.self) { _ in AdminNewsRowSkeleton() }
            }
        } else if vm.items.isEmpty {
            emptyState
        } else {
            LazyVStack(spacing: 12) {
                ForEach(vm.items) { item in
                    AdminNewsRow(
                        item: item,
                        isPublishing: vm.publishingIds.contains(item.id),
                        onPublish: { Task { await vm.publish(item) } },
                        onRequestRevision: { pendingAction = .requestRevision(item) },
                        onArchive: { pendingAction = .archive(item) },
                        onPermanentDelete: { pendingAction = .permanentDelete(item) }
                    )
                }
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
            HStack(spacing: 8) {
                if vm.isLoadingMore {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "arrow.down.circle")
                        .font(.system(size: 15, weight: .bold))
                }
                Text(vm.isLoadingMore ? "جارٍ الجلب…" : "جلب المزيد")
                    .font(.system(size: 14, weight: .bold))
            }
            .foregroundStyle(SabqTheme.sky)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .fill(SabqTheme.sky.opacity(0.10))
            )
        }
        .buttonStyle(.plain)
        .disabled(vm.isLoadingMore)
        .padding(.top, 4)
    }

    // MARK: Empty / error states

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "tray")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(SabqTheme.secondaryInk.opacity(0.4))
            Text("لا توجد أخبار في \(vm.selectedStatus.label)")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity, minHeight: 240)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(SabqTheme.secondaryInk.opacity(0.4))
            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
            Button { Task { await vm.load() } } label: {
                Text("إعادة المحاولة")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(SabqTheme.sky)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(SabqTheme.sky.opacity(0.12)))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, minHeight: 240)
    }
}

// MARK: - Routes

/// Pushes the dashboard from the profile screen.
struct AdminDashboardRoute: Hashable {}

/// Pushes the simplified editor for a specific item.
struct AdminArticleEditorRoute: Hashable {
    let item: AdminNewsItem
}
