import SabqDeskDesign
import SabqDeskKit
import SwiftUI
import UserNotifications

/// «التنبيهات» (approved mockup 2026-11-12): one timeline split by day only.
/// Each row is one item (a tweet, a news story, an article, a ticket) with all
/// its stages on one line; the sender's photo or logo sits on the rail. A tap
/// opens the item and a swipe clears it.
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
    @State private var confirmsClear = false

    var body: some View {
        List {
            VStack(alignment: .leading, spacing: 16) {
                header
                if filters.count > 2 {
                    SectionChipBar(sections: filters, selection: $filter, title: \.title,
                                   count: { counts.count($0.category) })
                        .padding(.horizontal, -DeskLayout.pageMargin)
                }
                if let loadError {
                    ErrorLine(message: loadError)
                }
            }
            .padding(.top, 8)
            .listRowInsets(EdgeInsets(top: 0, leading: NotifLayout.margin, bottom: 0, trailing: NotifLayout.margin))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            content
        }
        .listStyle(.plain)
        .environment(\.defaultMinListRowHeight, 1)
        .scrollContentBackground(.hidden)
        .background(NotifInk.page.ignoresSafeArea())
        .refreshable { await load() }
        .task(id: filter) { await load() }
        .fullScreenCover(item: $openedArticle) { page in
            SafariView(url: page.url).ignoresSafeArea()
        }
        .confirmationDialog(clearPrompt, isPresented: $confirmsClear, titleVisibility: .visible) {
            Button("مسح", role: .destructive) { Task { await clearAll() } }
            Button("إلغاء", role: .cancel) {}
        } message: {
            Text("تُمسح من قائمتك أنت فقط، ولا يتأثر زملاؤك.")
        }
    }

    private var clearPrompt: String {
        if let category = filter.category { return "مسح تنبيهات «\(category.title)»؟" }
        return "مسح كل التنبيهات؟"
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
                if !items.isEmpty {
                    Button { confirmsClear = true } label: {
                        Text("مسح الكل")
                            .deskText(DeskType.metaEmphasis)
                            .foregroundStyle(DeskInk.strong)
                            .padding(.horizontal, 14)
                            .frame(minHeight: 36)
                            .background(Color.white, in: Capsule())
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
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        } else if items.isEmpty {
            DeskEmptyState(title: filter.emptyTitle, message: filter.emptyMessage)
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        } else {
            ForEach(StaffNotificationTimeline.days(items)) { day in
                NotificationDayTitle(day: day)
                    .listRowInsets(EdgeInsets(top: 18, leading: NotifLayout.margin + 6, bottom: 8, trailing: NotifLayout.margin))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                ForEach(Array(day.items.enumerated()), id: \.element.id) { index, item in
                    let isFirst = index == 0
                    let isLast = index == day.items.count - 1
                    NotificationTimelineRow(item: item, isFirst: isFirst, isLast: isLast) { open(item) }
                        .listRowInsets(EdgeInsets(top: 0, leading: NotifLayout.margin + 14,
                                                  bottom: 0, trailing: NotifLayout.margin + 14))
                        .listRowSeparator(.hidden)
                        .listRowBackground(
                            UnevenRoundedRectangle(topLeadingRadius: isFirst ? 20 : 0, bottomLeadingRadius: isLast ? 20 : 0,
                                                   bottomTrailingRadius: isLast ? 20 : 0, topTrailingRadius: isFirst ? 20 : 0,
                                                   style: .continuous)
                                .fill(Color.white)
                                .padding(.horizontal, NotifLayout.margin)
                        )
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button("مسح", role: .destructive) { clear(item) }
                        }
                }
            }
            Group {
                if nextCursor != nil {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .task { await loadMore() }
                } else {
                    Text("نحتفظ بتنبيهات آخر 30 يومًا · اسحب التنبيه لمسحه")
                        .deskText(DeskType.timestamp)
                        .foregroundStyle(DeskTheme.textTertiary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                }
            }
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
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
        // Published news has no screen in the app: it opens the live page.
        guard let link = item.link else {
            if let url = item.articleURL { openedArticle = DeskWebPage(url: url) }
            return
        }
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

    /// «مسح» on one row: gone at once, restored if the server refuses.
    private func clear(_ item: StaffNotification) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        let before = (items, unread, counts)
        items.remove(at: index)
        if item.isUnread { unread = max(unread - 1, 0) }
        counts.all = max(counts.all - 1, 0)
        app.setNotificationsUnread(unread)
        Task {
            do {
                try await app.client.clearNotification(id: item.id)
            } catch {
                (items, unread, counts) = before
                app.setNotificationsUnread(unread)
                if !app.handle(error) {
                    loadError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
                }
            }
        }
    }

    /// «مسح الكل» in the open tab; «الكل» also clears the phone's Notification Center.
    private func clearAll() async {
        let requested = filter
        do {
            try await app.client.clearNotifications(category: requested.category)
            if requested.category == nil {
                UNUserNotificationCenter.current().removeAllDeliveredNotifications()
            }
            await load()
        } catch {
            if !app.handle(error) {
                loadError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
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
        let requested = filter
        do {
            let page = try await app.client.notifications(category: requested.category)
            guard requested == filter else { return }
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
        // A page for a tab the member has since left is dropped, results and errors alike.
        let requested = filter
        do {
            let page = try await app.client.notifications(category: requested.category, cursor: cursor)
            guard requested == filter, cursor == nextCursor else { return }
            let known = Set(items.map(\.id))
            items.append(contentsOf: page.items.filter { !known.contains($0.id) })
            nextCursor = page.nextCursor
        } catch {
            guard !Task.isCancelled, requested == filter, cursor == nextCursor else { return }
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
        case .message?: return "لا رسائل جديدة"
        }
    }

    var emptyMessage: String {
        switch category {
        case .news?: return "يظهر هنا خبر المراسل ومسودة البوت وطلب التعديل، وكل خبر يُنشر عبر «نشر سبق»."
        case .message?: return "حين يرسل كاتب استفسارًا أو ردًا يظهر هنا."
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
        case .message: return DeskTheme.chipGrey
        }
    }

    static func ink(_ category: StaffNotificationCategory) -> Color {
        switch category {
        case .tweet: return DeskTheme.link
        case .opinion: return Color(red: 0x94 / 255, green: 0x60 / 255, blue: 0x00 / 255)
        case .news: return Color(red: 0x13 / 255, green: 0x73 / 255, blue: 0x4E / 255)
        case .message: return DeskTheme.textSecondary
        }
    }
}

enum NotifLayout {
    static let margin: CGFloat = DeskLayout.pageMargin
    static let avatar: CGFloat = 36
}

/// The three text sizes of a row: a small grey sender line, a large dark
/// title, and a small status line (approved 2026-11-12).
private enum NotifType {
    static let by = DeskTextRole(size: 12, weight: .regular, style: .caption, lineSpacing: 0)
    static let byName = DeskTextRole(size: 12, weight: .medium, style: .caption, lineSpacing: 0)
    static let titleNew = DeskTextRole(size: 16, weight: .semibold, style: .callout, lineSpacing: 2)
    static let titleRead = DeskTextRole(size: 16, weight: .medium, style: .callout, lineSpacing: 2)
    static let status = DeskTextRole(size: 12, weight: .regular, style: .caption, lineSpacing: 0)
    static let statusStrong = DeskTextRole(size: 12, weight: .semibold, style: .caption, lineSpacing: 0)
}

/// «اليوم · الخميس 12 نوفمبر» above a day's rows.
private struct NotificationDayTitle: View {
    let day: StaffNotificationDay

    var body: some View {
        HStack(spacing: 4) {
            Text(day.title)
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(DeskInk.strong)
            if day.title != day.date {
                // The dot is its own Text: leading a string, a neutral mark
                // would drift to the far end of a right-to-left line.
                Text(verbatim: "·")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textTertiary)
                Text(day.date)
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// One item on the timeline: who sent it (small, grey), what it is (large,
/// dark), and where it stands (type in its colour, then its stages, or
/// «بانتظار قرارك» in red with the way in).
private struct NotificationTimelineRow: View {
    let item: StaffNotification
    let isFirst: Bool
    let isLast: Bool
    let open: () -> Void

    private var hasAction: Bool { item.link != nil || item.articleURL != nil }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            NotificationAvatar(item: item)
            VStack(alignment: .leading, spacing: 4) {
                byLine
                Text(item.title)
                    .deskText(item.isUnread ? NotifType.titleNew : NotifType.titleRead)
                    .foregroundStyle(DeskInk.strong)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                statusLine
            }
        }
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .leading) { rail }
        .overlay(alignment: .bottom) {
            if !isLast { Rectangle().fill(DeskTheme.hairline).frame(height: 1) }
        }
        .contentShape(Rectangle())
        .onTapGesture { if hasAction { open() } }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(hasAction ? .isButton : [])
        .accessibilityAction(named: Text(item.actionLabel)) { if hasAction { open() } }
    }

    private var byLine: some View {
        HStack(spacing: 4) {
            Text(item.actorName?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? fallbackName)
                .deskText(NotifType.byName)
                .foregroundStyle(DeskTheme.textSecondary)
                .lineLimit(1)
            if let role = shownRole {
                Text(verbatim: "·")
                    .deskText(NotifType.by)
                    .foregroundStyle(DeskTheme.textTertiary)
                Text(role)
                    .deskText(NotifType.by)
                    .foregroundStyle(DeskTheme.textTertiary)
                    .lineLimit(1)
                    .fixedSize()
            }
            Spacer(minLength: 6)
            LTRText(text: StaffNotificationTimeline.time(item.createdAt))
                .fixedSize()
            if item.isUnread {
                Circle()
                    .fill(DeskInk.action)
                    .frame(width: 7, height: 7)
                    .accessibilityLabel("جديد")
            }
        }
    }

    /// «قروك بوت · بوت» says it twice: the role is dropped when the name already holds it.
    private var shownRole: String? {
        guard let role = item.roleLabel else { return nil }
        return (item.actorName ?? "").contains(role) ? nil : role
    }

    private var fallbackName: String {
        item.actor == .system ? "نشر آلي" : item.category.tag
    }

    @ViewBuilder private var statusLine: some View {
        HStack(spacing: 6) {
            Text(item.category.tag)
                .deskText(NotifType.statusStrong)
                .foregroundStyle(NotifInk.ink(item.category))
                .fixedSize()
            if item.waitsForDecision {
                Text("بانتظار قرارك")
                    .deskText(NotifType.statusStrong)
                    .foregroundStyle(DeskTheme.danger)
                    .lineLimit(1)
                Spacer(minLength: 4)
                if hasAction {
                    Text(item.actionLabel)
                        .deskText(NotifType.statusStrong)
                        .foregroundStyle(DeskInk.link)
                        .lineLimit(1)
                        .fixedSize()
                }
            } else {
                Text(item.statusLine)
                    .deskText(NotifType.status)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.head)
                Spacer(minLength: 0)
            }
        }
        .padding(.top, 1)
    }

    /// The rail runs through the avatars, from the day's first row to its last.
    private var rail: some View {
        VStack(spacing: 0) {
            Rectangle().fill(isFirst ? Color.clear : NotifInk.rail).frame(width: 2, height: 13)
            Spacer(minLength: NotifLayout.avatar)
            Rectangle().fill(isLast ? Color.clear : NotifInk.rail).frame(width: 2)
        }
        .frame(width: NotifLayout.avatar)
        .accessibilityHidden(true)
    }
}

/// Every sender is a circle of one size on white: a person's photo, an
/// agency's logo shown whole, a bot's glyph on light grey, or a clock for the
/// scheduler. Initials stand in when there is no picture.
private struct NotificationAvatar: View {
    let item: StaffNotification
    private let size = NotifLayout.avatar

    var body: some View {
        content
            .frame(width: size, height: size)
            .background(Color.white)
            .clipShape(Circle())
            .overlay(Circle().strokeBorder(DeskTheme.separator, lineWidth: 1))
            .background(Circle().fill(Color.white).padding(-3))
            .accessibilityHidden(true)
    }

    @ViewBuilder private var content: some View {
        switch item.actor {
        case .bot:
            if let art = NotifBotArt.image(for: item.actorName) {
                art.resizable().scaledToFill()
            } else {
                Image(systemName: "cpu")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(DeskInk.strong)
                    .frame(width: size, height: size)
                    .background(DeskTheme.chipGrey)
            }
        case .system:
            Image(systemName: "clock")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(NotifInk.ink(item.category))
                .frame(width: size, height: size)
                .background(NotifInk.tint(item.category))
        case .agency:
            remote(fit: true) { initials(ink: DeskTheme.warning, fill: NotifInk.tint(.opinion)) }
        case .person, .unknown:
            remote(fit: false) { initials(ink: DeskTheme.link, fill: DeskTheme.softBlue) }
        }
    }

    @ViewBuilder
    private func remote<Fallback: View>(fit: Bool, @ViewBuilder fallback: @escaping () -> Fallback) -> some View {
        if let url = item.actorAvatarURL {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    if fit {
                        image.resizable().scaledToFit().padding(5)
                    } else {
                        image.resizable().scaledToFill()
                    }
                } else {
                    fallback()
                }
            }
        } else {
            fallback()
        }
    }

    private func initials(ink: Color, fill: Color) -> some View {
        Group {
            if let name = item.actorName?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty {
                Text(verbatim: DeskInitials.of(name))
                    .font(DeskFonts.app(size: 13, weight: .bold, relativeTo: .caption))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            } else {
                Image(systemName: item.actor == .agency ? "building.2.fill" : "person.fill")
                    .font(.system(size: 15, weight: .semibold))
            }
        }
        .foregroundStyle(ink)
        .frame(width: size, height: size)
        .background(fill)
    }
}

/// A bot's own picture, when one ships in the asset catalog: «BotNashrSabq»
/// for «نشر سبق», «BotGrok» for «قروك بوت». Without art the grey glyph stands in.
enum NotifBotArt {
    static func assetName(for botName: String?) -> String? {
        let name = (botName ?? "").lowercased()
        if name.contains("قروك") || name.contains("grok") { return "BotGrok" }
        if name.contains("نشر سبق") || name.contains("nashr") { return "BotNashrSabq" }
        return nil
    }

    static func image(for botName: String?) -> Image? {
        guard let asset = assetName(for: botName), UIImage(named: asset) != nil else { return nil }
        return Image(asset)
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
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
