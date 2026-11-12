import SabqDeskDesign
import SabqDeskKit
import SwiftUI
import UserNotifications

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
    @State private var confirmsClear = false

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
        } else if items.isEmpty {
            DeskEmptyState(title: filter.emptyTitle, message: filter.emptyMessage)
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
        } else {
            let split = StaffNotificationTimeline.split(items)
            if !split.decisions.isEmpty {
                NotificationDecisionGroup(items: split.decisions,
                                          open: { item in open(item) }, clear: { item in clear(item) })
            }
            if !split.days.isEmpty {
                // «للعلم» is named only when it sits under the decisions.
                if !split.decisions.isEmpty {
                    NotificationSectionTitle(systemImage: "info.circle", title: "للعلم", tint: DeskTheme.textSecondary)
                        .padding(.top, 4)
                }
                ForEach(split.days) { day in
                    NotificationDayGroup(day: day, open: { item in open(item) }, clear: { item in clear(item) })
                }
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
    /// The bot's tile: the one dark mark on the screen, so a machine never reads as a person.
    static let bot = DeskTheme.navy

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

/// «تحتاج قرارك» / «للعلم» above a group.
private struct NotificationSectionTitle: View {
    let systemImage: String
    let title: String
    var count: Int?
    let tint: Color

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            Text(title)
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(DeskInk.strong)
            if let count {
                Text(verbatim: "\(count)")
                    .deskText(DeskType.meta)
                    .monospacedDigit()
                    .foregroundStyle(DeskTheme.textSecondary)
            }
        }
        .padding(.horizontal, 6)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// What still waits for the desk: full rows with the button that opens each.
private struct NotificationDecisionGroup: View {
    let items: [StaffNotification]
    let open: (StaffNotification) -> Void
    let clear: (StaffNotification) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            NotificationSectionTitle(systemImage: "hand.raised.fill", title: "تحتاج قرارك",
                                     count: items.count, tint: DeskTheme.danger)
            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    NotificationDecisionRow(item: item, isLast: index == items.count - 1,
                                            open: { open(item) }, clear: { clear(item) })
                }
            }
            .padding(.horizontal, 14)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }
}

/// One day of «للعلم»: «اليوم · الخميس 29 أكتوبر», then its compact rows.
private struct NotificationDayGroup: View {
    let day: StaffNotificationDay
    let open: (StaffNotification) -> Void
    let clear: (StaffNotification) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(day.title)
                    .deskText(DeskType.meta)
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
                    NotificationNoteRow(item: item, isLast: index == day.items.count - 1,
                                        open: { open(item) }, clear: { clear(item) })
                }
            }
            .padding(.horizontal, 14)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }
}

/// Who is behind the item: a person's photo in a circle, an agency's logo in
/// a square, a dark square for a bot, a clock for the scheduler. Without a
/// photo or logo the name's initials stand in.
private struct NotificationSourceTile: View {
    let item: StaffNotification
    let size: CGFloat

    private var square: RoundedRectangle { RoundedRectangle(cornerRadius: size * 0.28, style: .continuous) }

    var body: some View {
        Group {
            switch item.actor {
            case .bot:
                if let art = NotifBotArt.image(for: item.actorName) {
                    art.resizable().scaledToFill()
                        .frame(width: size, height: size)
                        .clipShape(square)
                } else {
                    Image(systemName: "cpu")
                        .font(.system(size: size * 0.5, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .frame(width: size, height: size)
                        .background(NotifInk.bot, in: square)
                }
            case .system:
                Image(systemName: "clock")
                    .font(.system(size: size * 0.45, weight: .semibold))
                    .foregroundStyle(NotifInk.ink(item.category))
                    .frame(width: size, height: size)
                    .background(NotifInk.tint(item.category), in: Circle())
            case .agency:
                remote(fit: true) {
                    initials
                        .foregroundStyle(DeskTheme.warning)
                        .frame(width: size, height: size)
                        .background(NotifInk.tint(.opinion))
                }
                .frame(width: size, height: size)
                .background(Color.white)
                .clipShape(square)
                .overlay(square.strokeBorder(DeskTheme.separator, lineWidth: 1))
            case .person, .unknown:
                remote(fit: false) {
                    initials
                        .foregroundStyle(DeskTheme.link)
                        .frame(width: size, height: size)
                        .background(DeskTheme.softBlue)
                }
                .frame(width: size, height: size)
                .clipShape(Circle())
            }
        }
        .accessibilityHidden(true)
    }

    /// The photo or logo, with `fallback` while it loads, when it fails and when there is none.
    @ViewBuilder
    private func remote<Fallback: View>(fit: Bool, @ViewBuilder fallback: @escaping () -> Fallback) -> some View {
        if let url = item.actorAvatarURL {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    if fit {
                        image.resizable().scaledToFit().padding(size * 0.08)
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

    @ViewBuilder private var initials: some View {
        if let name = item.actorName?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
            Text(verbatim: DeskInitials.of(name))
                .font(DeskFonts.app(size: size * 0.36, weight: .bold, relativeTo: .caption))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        } else {
            Image(systemName: item.actor == .agency ? "building.2.fill" : "person.fill")
                .font(.system(size: size * 0.42, weight: .semibold))
        }
    }
}

/// A bot's own picture, when one ships in the asset catalog: «BotNashrSabq»
/// for «نشر سبق», «BotGrok» for «قروك بوت». Absent art falls back to the dark tile.
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

/// The first line of every row: the type tag (one colour per type), who it
/// came from, then the time and the «new» dot.
private struct NotificationHeadline: View {
    let item: StaffNotification

    var body: some View {
        HStack(spacing: 8) {
            Text(item.category.tag)
                .deskText(DeskType.tag)
                .foregroundStyle(NotifInk.ink(item.category))
                .padding(.horizontal, 9)
                .padding(.vertical, 2)
                .background(NotifInk.tint(item.category), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                .fixedSize()
            Text(item.sourceLine)
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textSecondary)
                .lineLimit(1)
            Spacer(minLength: 4)
            LTRText(text: StaffNotificationTimeline.time(item.createdAt))
                .fixedSize()
            if item.isUnread {
                Circle()
                    .fill(DeskInk.action)
                    .frame(width: 8, height: 8)
                    .accessibilityLabel("جديد")
            }
        }
    }
}

private struct NotificationDecisionRow: View {
    let item: StaffNotification
    let isLast: Bool
    let open: () -> Void
    let clear: () -> Void

    private var hasAction: Bool { item.link != nil || item.articleURL != nil }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            NotificationSourceTile(item: item, size: 40)
            VStack(alignment: .leading, spacing: 6) {
                NotificationHeadline(item: item)
                Text(item.title)
                    .deskText(DeskRowType.subjectStrong)
                    .foregroundStyle(DeskInk.strong)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    if hasAction {
                        Button(action: open) {
                            Text(item.actionLabel)
                                .deskText(DeskType.tag)
                                .foregroundStyle(NotifInk.ink(item.category))
                                .padding(.horizontal, 14)
                                .frame(minHeight: 32)
                                .background(NotifInk.tint(item.category), in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer(minLength: 4)
                    Button(action: clear) {
                        Text("مسح")
                            .deskText(DeskType.tag)
                            .foregroundStyle(DeskTheme.textSecondary)
                            .padding(.horizontal, 10)
                            .frame(minHeight: 32)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("مسح التنبيه")
                }
                .padding(.top, 2)
            }
        }
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) {
            if !isLast { Rectangle().fill(DeskTheme.hairline).frame(height: 1) }
        }
        .contentShape(Rectangle())
        .onTapGesture { if hasAction { open() } }
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: Text(item.actionLabel)) { if hasAction { open() } }
        .accessibilityAction(named: Text("مسح التنبيه")) { clear() }
    }
}

/// «للعلم»: two lines, no button. A tap opens the item; the small cross clears it.
private struct NotificationNoteRow: View {
    let item: StaffNotification
    let isLast: Bool
    let open: () -> Void
    let clear: () -> Void

    private var hasAction: Bool { item.link != nil || item.articleURL != nil }

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            NotificationSourceTile(item: item, size: 30)
            VStack(alignment: .leading, spacing: 4) {
                NotificationHeadline(item: item)
                Text(item.title)
                    .deskText(DeskRowType.preview)
                    .foregroundStyle(DeskInk.strong)
                    .lineLimit(1)
            }
            Button(action: clear) {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(DeskTheme.textTertiary)
                    .frame(width: 30, height: DeskLayout.touchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("مسح التنبيه")
        }
        .padding(.vertical, 6)
        .overlay(alignment: .bottom) {
            if !isLast { Rectangle().fill(DeskTheme.hairline).frame(height: 1) }
        }
        .contentShape(Rectangle())
        .onTapGesture { if hasAction { open() } }
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: Text(item.actionLabel)) { if hasAction { open() } }
        .accessibilityAction(named: Text("مسح التنبيه")) { clear() }
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
