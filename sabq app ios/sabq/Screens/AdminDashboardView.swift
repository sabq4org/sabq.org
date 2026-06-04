import SwiftUI
import Combine

// MARK: - View model

/// Owns the admin dashboard's data + the administrative actions (filter by
/// status, publish, apply edits). Mirrors the observation pattern used by
/// `ContributorDashboardViewModel`. Backed by `AdminServicing`, so the mocked
/// store can be swapped for a live API without touching the view.
@MainActor
final class AdminDashboardViewModel: ObservableObject {
    @Published var overview: AdminOverview?
    @Published var items: [AdminNewsItem] = []
    @Published var selectedStatus: AdminArticleStatus = .draft
    @Published var isLoading = true
    @Published var error: String?
    /// Ids currently being published — drives the per-row spinner.
    @Published var publishingIds: Set<String> = []

    private let service: AdminServicing

    init(service: AdminServicing = LiveAdminService()) {
        self.service = service
    }

    /// Initial / pull-to-refresh load: metrics + the selected section's list.
    func load() async {
        isLoading = true
        error = nil
        do {
            async let overviewResult = service.fetchOverview()
            async let listResult = service.fetchNews(status: selectedStatus)
            overview = try await overviewResult
            items = try await listResult
        } catch {
            self.error = "تعذّر تحميل البيانات"
        }
        isLoading = false
    }

    /// Switch the active section and reload just its list.
    func select(_ status: AdminArticleStatus) async {
        guard status != selectedStatus else { return }
        selectedStatus = status
        isLoading = true
        await reloadList()
        isLoading = false
    }

    /// Publish an item, then refresh the visible list + metrics so the change
    /// (item leaves a non-published tab, "published today" bumps) is reflected.
    func publish(_ item: AdminNewsItem) async {
        publishingIds.insert(item.id)
        defer { publishingIds.remove(item.id) }
        do {
            _ = try await service.publish(id: item.id)
            await refreshListAndMetrics()
        } catch {
            self.error = "تعذّر نشر الخبر"
        }
    }

    /// Persist edits returned from the simplified editor, then refresh.
    func applyEdit(_ updated: AdminNewsItem) async {
        do {
            _ = try await service.saveEdit(updated)
            await refreshListAndMetrics()
        } catch {
            self.error = "تعذّر حفظ التعديلات"
        }
    }

    private func reloadList() async {
        do {
            items = try await service.fetchNews(status: selectedStatus)
            error = nil
        } catch {
            self.error = "تعذّر تحميل البيانات"
        }
    }

    private func refreshListAndMetrics() async {
        do {
            async let listResult = service.fetchNews(status: selectedStatus)
            async let overviewResult = service.fetchOverview()
            items = try await listResult
            overview = try await overviewResult
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
        // Registered here (not in ContentView) so the editor's save callback
        // can reach this screen's view model directly.
        .navigationDestination(for: AdminArticleEditorRoute.self) { route in
            AdminArticleEditorView(item: route.item) { updated in
                Task { await vm.applyEdit(updated) }
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

            if vm.overview == nil && vm.isLoading {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(0..<3, id: \.self) { _ in
                            SkeletonBox(width: 152, height: 124, radius: SabqTheme.tileRadius)
                        }
                    }
                }
            } else if let overview = vm.overview {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(overview.metrics()) { metric in
                            AdminMetricCard(metric: metric)
                        }
                    }
                    .padding(.vertical, 2)
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
                        onPublish: { Task { await vm.publish(item) } }
                    )
                }
            }
        }
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
