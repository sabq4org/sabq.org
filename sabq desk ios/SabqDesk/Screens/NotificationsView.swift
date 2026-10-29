import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// «التنبيهات» (approved mockup 2026-10-29): the bell's timeline of tweets,
/// opinion articles and news published from «نشر سبق», grouped by day, with
/// filter tabs and one button per row that opens the item.
struct NotificationsView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var filter: NotificationFilter = .all
    @State private var items: [StaffNotification] = []
    @State private var nextCursor: String?
    @State private var categories: [StaffNotificationCategory] = []
    @State private var counts = StaffNotificationCounts()
    @State private var unread = 0
    @State private var hasLoaded = false
    @State private var isLoadingMore = false
    @State private var loadError: String?
    @State private var openedArticle: DeskWebPage?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                header
                if filters.count > 2 {
                    SectionChipBar(sections: filters, selection: $filter, title: \.title,
                                   count: { counts.count($0.category) })
                        .padding(.horizontal, -DeskLayout.pageMargin)
                }
                if let loadError {
                    ErrorLine(message: loadError)
                }
                content
            }
            .padding(.horizontal, DeskLayout.pageMargin + 4)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .scrollContentBackground(.hidden)
        .background(NotifInk.page.ignoresSafeArea())
        .refreshable { await load() }
        .task(id: filter) { await load() }
        .fullScreenCover(item: $openedArticle) { page in
            SafariView(url: page.url).ignoresSafeArea()
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(DeskInk.strong)
                        .frame(width: 44, height: 44)
                        .background(Color.white, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("إغلاق")
                Spacer()
                if unread > 0 {
                    Button { Task { await markAllSeen() } } label: {
                        Text("تعليم الكل كمقروء")
                            .deskText(DeskType.metaEmphasis)
                            .foregroundStyle(DeskInk.link)
                            .padding(.horizontal, 14)
                            .frame(minHeight: 36)
                            .background(DeskInk.soft, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: DeskLayout.touchTarget)
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(newSinceLine)
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
                Text("التنبيهات")
                    .deskText(DeskHomeType.name)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }
        }
    }

    // MARK: - Timeline

    @ViewBuilder private var content: some View {
        if !hasLoaded && items.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity, minHeight: 200)
        } else if items.isEmpty {
            DeskEmptyState(title: filter.emptyTitle, message: filter.emptyMessage)
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
        } else {
            ForEach(StaffNotificationTimeline.days(items)) { day in
                NotificationDayGroup(day: day) { item in open(item) }
            }
            if nextCursor != nil {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .task { await loadMore() }
            } else {
                Text("نحتفظ بتنبيهات آخر 30 يومًا")
                    .deskText(DeskType.timestamp)
                    .foregroundStyle(DeskTheme.textTertiary)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 4)
            }
        }
    }

    private var newSinceLine: String {
        unread > 0 ? "\(unread) جديدة منذ آخر زيارة" : "لا جديد منذ آخر زيارة"
    }

    /// Only «الكل» plus the tabs this member's permissions open.
    private var filters: [NotificationFilter] {
        [.all] + categories.map(NotificationFilter.category)
    }

    // MARK: - Actions

    private func open(_ item: StaffNotification) {
        markRead(item)
        if item.category == .news {
            if let url = item.articleURL { openedArticle = DeskWebPage(url: url) }
            return
        }
        guard let link = item.link else { return }
        dismiss()
        // Routed after the sheet closes, so the tab switch and push are clean.
        Task {
            try? await Task.sleep(for: .milliseconds(350))
            app.pendingLink = link
        }
    }

    private func markRead(_ item: StaffNotification) {
        guard item.isUnread, let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        items[index].isUnread = false
        unread = max(unread - 1, 0)
        app.setNotificationsUnread(unread)
        Task { try? await app.client.markNotificationRead(id: item.id) }
    }

    private func markAllSeen() async {
        do {
            try await app.client.markNotificationsSeen()
            for index in items.indices { items[index].isUnread = false }
            unread = 0
            app.setNotificationsUnread(0)
        } catch {
            if !app.handle(error) {
                loadError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    // MARK: - Data

    private func load() async {
        do {
            let page = try await app.client.notifications(category: filter.category)
            items = page.items
            nextCursor = page.nextCursor
            categories = page.categories
            counts = page.counts
            unread = page.unreadCount
            app.setNotificationsUnread(page.unreadCount)
            if !filters.contains(filter) { filter = .all }
            loadError = nil
        } catch {
            guard !Task.isCancelled else { return }
            if !app.handle(error) {
                loadError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
        hasLoaded = true
    }

    private func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await app.client.notifications(category: filter.category, cursor: cursor)
            let known = Set(items.map(\.id))
            items.append(contentsOf: page.items.filter { !known.contains($0.id) })
            nextCursor = page.nextCursor
        } catch {
            guard !Task.isCancelled else { return }
            nextCursor = nil
            if !app.handle(error) {
                loadError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }
}

// MARK: - Filter tabs

private enum NotificationFilter: Hashable, Identifiable {
    case all
    case category(StaffNotificationCategory)

    var id: String { category?.rawValue ?? "all" }

    var category: StaffNotificationCategory? {
        if case .category(let category) = self { return category }
        return nil
    }

    var title: String { category?.title ?? "الكل" }

    var emptyTitle: String {
        switch category {
        case nil: return "لا تنبيهات بعد"
        case .tweet?: return "لا تنبيهات تغريدات"
        case .opinion?: return "لا تنبيهات مقالات رأي"
        case .news?: return "لا أخبار جديدة"
        }
    }

    var emptyMessage: String {
        switch category {
        case .news?: return "حين ينشر زميل أو شريك خبرًا عبر «نشر سبق» يظهر هنا مع اسم الناشر."
        default: return "يظهر هنا كل ما يُضاف أو يُجدول أو يُنشر، بترتيب زمني."
        }
    }
}

// MARK: - Pieces

enum NotifInk {
    static let page = Color(red: 0xF5 / 255, green: 0xF7 / 255, blue: 0xFA / 255)
    static let rail = Color(red: 0xE3 / 255, green: 0xEA / 255, blue: 0xF1 / 255)

    static func tint(_ category: StaffNotificationCategory) -> Color {
        switch category {
        case .tweet: return DeskTheme.softBlue
        case .opinion: return Color(red: 0xFF / 255, green: 0xF6 / 255, blue: 0xE5 / 255)
        case .news: return Color(red: 0xE8 / 255, green: 0xF6 / 255, blue: 0xEF / 255)
        }
    }

    static func ink(_ category: StaffNotificationCategory) -> Color {
        switch category {
        case .tweet: return DeskTheme.link
        case .opinion: return Color(red: 0x94 / 255, green: 0x60 / 255, blue: 0x00 / 255)
        case .news: return Color(red: 0x13 / 255, green: 0x73 / 255, blue: 0x4E / 255)
        }
    }
}

/// One day: «اليوم · الخميس 29 أكتوبر», then its rows in a white group on a rail.
private struct NotificationDayGroup: View {
    let day: StaffNotificationDay
    let open: (StaffNotification) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(day.title)
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskInk.strong)
                if day.title != day.date {
                    Text(day.date)
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                }
            }
            .padding(.horizontal, 6)
            .accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) {
                ForEach(Array(day.items.enumerated()), id: \.element.id) { index, item in
                    NotificationRow(item: item, isFirst: index == 0, isLast: index == day.items.count - 1) {
                        open(item)
                    }
                }
            }
            .padding(.horizontal, 16)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }
}

private struct NotificationRow: View {
    let item: StaffNotification
    let isFirst: Bool
    let isLast: Bool
    let open: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            tile
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(item.label)
                        .deskText(DeskType.tag)
                        .foregroundStyle(NotifInk.ink(item.category))
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    LTRText(text: StaffNotificationTimeline.time(item.createdAt))
                    if item.isUnread {
                        Circle()
                            .fill(DeskInk.action)
                            .frame(width: 8, height: 8)
                            .accessibilityLabel("جديد")
                    }
                }
                Text(item.title)
                    .deskText(item.isUnread ? DeskRowType.subjectStrong : DeskRowType.subjectPlain)
                    .foregroundStyle(DeskInk.strong)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                if !item.detail.isEmpty {
                    Text(item.detail)
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                        .lineLimit(1)
                }
                if hasAction {
                    Button(action: open) {
                        HStack(spacing: 4) {
                            Text(item.actionLabel)
                            Image(systemName: "chevron.backward")
                                .font(.system(size: 10, weight: .bold))
                                .accessibilityHidden(true)
                        }
                        .deskText(DeskType.tag)
                        .foregroundStyle(NotifInk.ink(item.category))
                        .padding(.horizontal, 12)
                        .frame(minHeight: 32)
                        .background(NotifInk.tint(item.category), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 4)
                }
            }
        }
        .padding(.vertical, 14)
        .background(alignment: .leading) { rail }
        .overlay(alignment: .bottom) {
            if !isLast {
                Rectangle().fill(DeskTheme.hairline).frame(height: 1).padding(.leading, 52)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { if hasAction { open() } }
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: Text(item.actionLabel)) { if hasAction { open() } }
    }

    private var hasAction: Bool {
        item.category == .news ? item.articleURL != nil : item.link != nil
    }

    /// The timeline rail runs through the tiles, from the first row to the last.
    private var rail: some View {
        VStack(spacing: 0) {
            Rectangle().fill(isFirst ? Color.clear : NotifInk.rail).frame(width: 2, height: 14)
            Spacer(minLength: 40)
            Rectangle().fill(isLast ? Color.clear : NotifInk.rail).frame(width: 2)
        }
        .frame(width: 40)
        .accessibilityHidden(true)
    }

    private var tile: some View {
        Group {
            switch item.kind {
            case "tweet_draft":
                Image(systemName: "square.and.pencil")
            case "tweet_scheduled", "opinion_scheduled":
                Image(systemName: "clock")
            case "tweet_published":
                Text(verbatim: "X").font(.system(size: 16, weight: .bold))
            case "opinion_draft":
                Image(systemName: "doc.text")
            default:
                Image(systemName: "newspaper")
            }
        }
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(NotifInk.ink(item.category))
        .frame(width: 40, height: 40)
        .background(NotifInk.tint(item.category), in: Circle())
        .overlay(Circle().strokeBorder(Color.white, lineWidth: 3))
        .accessibilityHidden(true)
    }
}

/// The bell in the home headers: a white circle with a blue count badge.
struct DeskBellButton: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        if app.canOpenNotifications {
            Button { app.showsNotifications = true } label: {
                Image(systemName: app.notificationsUnread > 0 ? "bell.badge" : "bell")
                    .symbolRenderingMode(.monochrome)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(DeskInk.strong)
                    .frame(width: 48, height: 48)
                    .background(Color.white, in: Circle())
                    .shadow(color: DeskTheme.shadow, radius: 6, y: 2)
                    .overlay(alignment: .topTrailing) {
                        if app.notificationsUnread > 0 {
                            Text(verbatim: app.notificationsUnread > 99 ? "99+" : "\(app.notificationsUnread)")
                                .font(.system(size: 11, weight: .bold))
                                .monospacedDigit()
                                .foregroundStyle(Color.white)
                                .padding(.horizontal, 5)
                                .frame(minWidth: 20, minHeight: 20)
                                .background(DeskInk.action, in: Capsule())
                                .overlay(Capsule().stroke(Color.white, lineWidth: 2))
                                .offset(x: 4, y: -2)
                        }
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("التنبيهات")
            .accessibilityValue(Text(verbatim: app.notificationsUnread > 0 ? "\(app.notificationsUnread) جديدة" : ""))
        }
    }
}

/// «آخر تنبيه» under the home greeting: the latest notification in one line.
struct DeskLatestNotificationLine: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        if app.canOpenNotifications, let latest = app.latestNotification {
            Button { app.showsNotifications = true } label: {
                HStack(spacing: 8) {
                    Circle()
                        .fill(NotifInk.ink(latest.category))
                        .frame(width: 6, height: 6)
                        .accessibilityHidden(true)
                    Text("آخر تنبيه: \(latest.label) · \(latest.title)")
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    LTRText(text: StaffNotificationTimeline.time(latest.createdAt))
                }
                .frame(minHeight: 32)
            }
            .buttonStyle(.plain)
            .accessibilityHint("يفتح التنبيهات")
        }
    }
}

#if DEBUG
#Preview("التنبيهات") {
    NotificationsView()
        .deskPreviewEnvironment()
}
#endif
