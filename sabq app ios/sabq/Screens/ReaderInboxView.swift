import SwiftUI

struct ReaderInboxRoute: Hashable {}

/// صندوق إشعارات القارئ (نظير /notifications في الويب): أخبار الكلمات التي
/// يتابعها، والتوصيات، والملخص اليومي. للكتّاب والمراسلين صفّ في الأعلى إلى
/// «إشعاراتي التحريرية» (الشاشة القائمة). النقر يعلّم الإشعار مقروءًا ويفتح
/// رابطه عبر نفس موجّه إشعارات الدفع، والسحب يحذفه.
struct ReaderInboxView: View {
    @Environment(AuthStore.self) private var authStore
    @State private var notificationsStore = NotificationsStore.shared
    @State private var items: [APIInboxItem] = []
    @State private var hasMore = false
    @State private var loading = true
    @State private var loadingMore = false
    @State private var loadError: String?
    @State private var showSettings = false

    private var hasEditorial: Bool {
        guard let user = authStore.currentUser else { return false }
        return user.isWriter || user.isReporter || user.isAdminLike
    }

    var body: some View {
        List {
            if hasEditorial {
                Section {
                    NavigationLink(value: EditorialNotificationsRoute()) {
                        editorialRow
                    }
                    .listRowBackground(SabqTheme.background)
                }
            }

            Section {
                ForEach(items) { item in
                    Button { open(item) } label: { row(item) }
                        .buttonStyle(.plain)
                        .listRowBackground(SabqTheme.background)
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) { delete(item) } label: {
                                Label("حذف", systemImage: "trash")
                            }
                        }
                        .onAppear {
                            if item.id == items.last?.id { Task { await loadMore() } }
                        }
                }
                if loadingMore {
                    ProgressView().frame(maxWidth: .infinity).listRowBackground(SabqTheme.background)
                }
            } header: {
                HStack(spacing: SabqLayout.space16) {
                    if notificationsStore.readerUnread > 0 {
                        Text(Self.unreadLabel(notificationsStore.readerUnread))
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                    Spacer(minLength: 0)
                    if notificationsStore.readerUnread > 0 {
                        Button("قراءة الكل") { markAllRead() }
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.primary)
                            .frame(minHeight: SabqLayout.touchTarget)
                    }
                    Button { showSettings = true } label: {
                        Label("الإعدادات", systemImage: "gearshape")
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.primary)
                    }
                    .frame(minHeight: SabqLayout.touchTarget)
                    .accessibilityLabel("إعدادات الإشعارات")
                }
                .textCase(nil)
                // هامش رأس القائمة الافتراضي ~10 نقاط على شاشة Duo المطوية
                .padding(.horizontal, SabqLayout.space8)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(SabqTheme.background)
        .overlay { stateOverlay }
        .sabqRTL()
        .navigationTitle("الإشعارات")
        .navigationBarTitleDisplayMode(.inline)
        // لا أزرار في شريط التنقل: على Duo ينزل زر الأيقونة سطرًا ثانيًا تحت زر
        // الرجوع فيغطي أول إشعار (محاكي 2026-10-18، حتى في HStack). الإعدادات
        // و«قراءة الكل» في رأس القائمة.
        .navigationDestination(isPresented: $showSettings) {
            ReaderNotificationSettingsView()
                .duoContentInsets()
        }
        .task(id: authStore.isLoggedIn) { await load() }
        // مهمة منفصلة: تغيّر الحالة أثناء السحب كان يلغي مهمة refreshable
        // فتصل الاستجابة ولا تُطبَّق (لقطة المحاكي 2026-10-18).
        .refreshable { await Task { await load() }.value }
    }

    @ViewBuilder
    private var stateOverlay: some View {
        if loading && items.isEmpty {
            ProgressView()
        } else if items.isEmpty, let loadError {
            ErrorStateView(message: loadError) { Task { await load() } }
        } else if items.isEmpty {
            EmptyStateView(
                icon: "bell",
                tint: SabqTheme.secondaryInk,
                title: "لا إشعارات بعد",
                subtitle: "تصلك هنا أخبار الكلمات التي تتابعها، والتوصيات المختارة لك، والملخص اليومي إن فعّلته."
            )
            .padding(.top, hasEditorial ? 120 : 0)
        }
    }

    private var editorialRow: some View {
        HStack(spacing: SabqLayout.space12) {
            icon("doc.text.magnifyingglass", tint: SabqTheme.primary)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text("إشعاراتي التحريرية")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text("جدولة ونشر ومراجعة محتواك")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
            Spacer(minLength: 0)
            if notificationsStore.unreadCount > 0 {
                Text("\(min(notificationsStore.unreadCount, 99))")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(SabqTheme.breaking))
            }
        }
        .padding(.vertical, SabqLayout.space4)
    }

    private func row(_ item: APIInboxItem) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            icon(Self.symbol(for: item.type), tint: item.read ? SabqTheme.textTertiary : SabqTheme.primary)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space8) {
                    Text(item.title)
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if !item.read {
                        Circle().fill(SabqTheme.primary).frame(width: 8, height: 8)
                            .accessibilityLabel("غير مقروء")
                    }
                }
                Text(item.body)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(item.read ? SabqTheme.textSecondary : SabqTheme.textPrimary)
                    .lineLimit(3)
                Text(Self.relative(item.createdAt))
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
        }
        .padding(.vertical, SabqLayout.space8)
        .contentShape(Rectangle())
    }

    private func icon(_ name: String, tint: Color) -> some View {
        Image(systemName: name)
            .font(SabqFonts.app(size: 15, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 36, height: 36)
            .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
            .accessibilityHidden(true)
    }

    static func unreadLabel(_ n: Int) -> String {
        switch n {
        case 1: return "إشعار غير مقروء"
        case 2: return "إشعاران غير مقروءين"
        case 3...10: return "\(n) إشعارات غير مقروءة"
        default: return "\(n) إشعارًا غير مقروء"
        }
    }

    static func symbol(for type: String) -> String {
        switch type {
        case "KeywordFollow": return "number"
        case "recommendation": return "sparkles"
        case "daily_digest": return "newspaper"
        default:
            if type.hasPrefix("sports") || type.hasPrefix("gc") { return "sportscourt" }
            if type.lowercased().contains("comment") || type.lowercased().contains("reply") { return "bubble.left" }
            return "bell"
        }
    }

    static func relative(_ raw: String) -> String {
        guard let date = SabqFormatters.iso8601Fractional.date(from: raw) ?? SabqFormatters.iso8601Basic.date(from: raw)
        else { return "" }
        // فرق ساعة الجهاز عن الخادم قد يجعل الإشعار «في المستقبل»
        if date > Date() { return "الآن" }
        return SabqFormatters.relativeArabic.localizedString(for: date, relativeTo: Date())
    }

    // MARK: - Actions

    private func load() async {
        guard authStore.isLoggedIn else { loading = false; return }
        if items.isEmpty { loading = true }
        defer { loading = false }
        do {
            let page = try await APIClient.shared.fetchInbox()
            items = page.items
            hasMore = page.hasMore
            notificationsStore.readerUnread = page.unread
            loadError = nil
        } catch {
            if items.isEmpty { loadError = "تعذر تحميل الإشعارات" }
        }
    }

    private func loadMore() async {
        guard hasMore, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        guard let page = try? await APIClient.shared.fetchInbox(offset: items.count) else { return }
        let known = Set(items.map(\.id))
        items.append(contentsOf: page.items.filter { !known.contains($0.id) })
        hasMore = page.hasMore
    }

    private func open(_ item: APIInboxItem) {
        if !item.read, let i = items.firstIndex(of: item) {
            items[i].read = true
            notificationsStore.readerUnread = max(0, notificationsStore.readerUnread - 1)
            Task { try? await APIClient.shared.markInboxRead(id: item.id) }
        }
        if let raw = item.deeplink, let url = URL(string: raw),
           let link = notificationsStore.parseSabqDeepLink(url: url) {
            notificationsStore.pendingDeepLink = link
        }
    }

    private func delete(_ item: APIInboxItem) {
        guard let i = items.firstIndex(of: item) else { return }
        items.remove(at: i)
        if !item.read { notificationsStore.readerUnread = max(0, notificationsStore.readerUnread - 1) }
        Task {
            do { try await APIClient.shared.deleteInboxItem(id: item.id) } catch { await load() }
        }
    }

    private func markAllRead() {
        let snapshot = items
        items = items.map { var c = $0; c.read = true; return c }
        notificationsStore.readerUnread = 0
        Task {
            do { try await APIClient.shared.markInboxAllRead() } catch { items = snapshot; await load() }
        }
    }
}
