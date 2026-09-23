import SwiftUI
import UserNotifications

/// In-app history of editorial push notifications (scheduled / published /
/// rejected / needs_revision). Mirrors what the user sees in the iOS
/// notification center but persists across deletions and stays available
/// even when push delivery failed.
///
/// The list is the source of truth — every editorial event the backend
/// dispatched gets a row here regardless of whether the push reached the
/// device.
struct EditorialNotificationsView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var items: [APIEditorialNotification] = []
    @State private var loadState: LoadState = .loading
    /// عدّاد غير المقروء له مصدر واحد: NotificationsStore.shared.unreadCount —
    /// النسخة المحلية السابقة كانت تنحرف عن نقطة الجرس عند أي تعديل ناقص.
    private var notificationsStore: NotificationsStore { NotificationsStore.shared }
    /// When the user taps a row we present a full-screen detail sheet
    /// instead of trying to push onto a fragile nested NavigationStack.
    /// The sheet works the same regardless of how we got to this screen
    /// (settings → notifications, or header bell → notifications).
    @State private var selectedNotification: APIEditorialNotification?
    @State private var showClearAllConfirm: Bool = false

    enum LoadState {
        case loading, loaded, failed(String)
    }

    var body: some View {
        // NOTE: this view is pushed onto the outer NavigationStack
        // (HomeFeedView's header bell appends `EditorialNotificationsRoute`,
        // SettingsView's submission card uses NavigationLink). Wrapping it
        // in another NavigationStack here caused dismiss() to fail on the
        // back button, which left `navigationPath` non-empty in ContentView
        // and hid the tab bar — locking the user inside the screen.
        content
            .background(SabqTheme.background)
            .sabqRTL()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("الإشعارات")
                        .font(SabqFonts.app(size: 16, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink(destination: NotificationPreferencesView()) {
                        Image(systemName: "slider.horizontal.3")
                            .font(SabqFonts.app(size: 16, weight: .semibold))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(item: $selectedNotification) { notification in
                EditorialNotificationDetailView(item: notification)
            }
    }

    @ViewBuilder
    private var content: some View {
        switch loadState {
        case .loading:
            VStack { ProgressView().padding(.top, 120); Spacer() }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            VStack(spacing: 12) {
                Spacer()
                Image(systemName: "exclamationmark.circle")
                    .font(SabqFonts.app(size: 40, weight: .light))
                    .foregroundStyle(SabqTheme.coral)
                Text(message)
                    .font(SabqFonts.app(size: 14, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.center)
                Button("إعادة المحاولة") { Task { await load() } }
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Spacer()
            }
            .padding()
        case .loaded:
            if items.isEmpty {
                emptyState
            } else {
                // List (with .swipeActions) instead of LazyVStack so each
                // row gets a native swipe-to-delete handle. We aggressively
                // strip List's default chrome to keep the same visual rhythm
                // (no separators, no inset background, custom row padding).
                List {
                    if notificationsStore.unreadCount > 0 {
                        markAllReadButton
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 8, trailing: 16))
                    }

                    ForEach(items) { item in
                        notificationRow(item)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    // The optimistic remove MUST happen
                                    // synchronously inside this action so
                                    // SwiftUI's swipe animation has an empty
                                    // slot to settle into. With the previous
                                    // `Task { await deleteNotification(item) }`
                                    // wrapper, the items array wasn't mutated
                                    // until the API call returned — by then
                                    // SwiftUI had already snapped the row
                                    // back into place. User-visible bug: every
                                    // delete appeared to "come back".
                                    deleteNotification(item)
                                } label: {
                                    Label("حذف", systemImage: "trash.fill")
                                }
                            }
                    }

                    clearAllFooter
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 16, leading: 16, bottom: 40, trailing: 16))
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(SabqTheme.background)
            }
        }
    }

    private var clearAllFooter: some View {
        Button {
            showClearAllConfirm = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "trash")
                    .font(SabqFonts.app(size: 11, weight: .regular))
                Text("مسح كل الإشعارات")
                    .font(SabqFonts.app(size: 12, weight: .medium))
            }
            .foregroundStyle(SabqTheme.coral)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                Capsule(style: .continuous)
                    .fill(SabqTheme.coral.opacity(0.08))
            )
            .overlay(
                Capsule(style: .continuous)
                    .stroke(SabqTheme.coral.opacity(0.22), lineWidth: 0.6)
            )
        }
        .buttonStyle(.plain)
        .alert("مسح كل الإشعارات؟", isPresented: $showClearAllConfirm) {
            Button("مسح", role: .destructive) { Task { await clearAll() } }
            Button("إلغاء", role: .cancel) { }
        } message: {
            Text("سيتم حذف سجلّ إشعاراتك التحريرية بالكامل. لا يمكن التراجع عن هذه الخطوة.")
        }
    }

    @MainActor
    private func deleteNotification(_ item: APIEditorialNotification) {
        // Synchronously drop the row from UI state so the List's swipe
        // animation can complete cleanly. The network call is fire-and-
        // forget; on failure we restore the row at the original index.
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        let removed = items.remove(at: index)
        if removed.readAt == nil {
            notificationsStore.unreadCount = max(0, notificationsStore.unreadCount - 1)
        }
        Task {
            do {
                try await APIClient.shared.deleteEditorialNotification(id: item.id)
            } catch {
                await MainActor.run {
                    items.insert(removed, at: index)
                    if removed.readAt == nil { notificationsStore.unreadCount += 1 }
                }
            }
        }
    }

    @MainActor
    private func clearAll() async {
        let snapshot = items
        let snapshotUnread = notificationsStore.unreadCount
        items = []
        notificationsStore.unreadCount = 0
        do {
            try await APIClient.shared.deleteAllEditorialNotifications()
        } catch {
            items = snapshot
            notificationsStore.unreadCount = snapshotUnread
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Spacer()
            ZStack {
                Circle()
                    .fill(SabqTheme.primaryEnd.opacity(0.10))
                    .frame(width: 96, height: 96)
                Image(systemName: "bell.fill")
                    .font(SabqFonts.app(size: 38, weight: .light))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
            HStack(spacing: 6) {
                Image(systemName: "checkmark.seal.fill")
                    .font(SabqFonts.app(size: 10, weight: .regular))
                Text("أنت محدّث")
                    .font(SabqFonts.app(size: 11, weight: .black))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(SabqTheme.primaryEnd, in: Capsule())
            Text("لا توجد إشعارات بعد")
                .font(SabqFonts.app(size: 17, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
            Text("سيصلك هنا كل ما يخص مقالاتك وأخبارك من جدولة ونشر ومراجعة.")
                .font(SabqFonts.app(size: 13))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, 28)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var markAllReadButton: some View {
        Button {
            Task { @MainActor in
                try? await APIClient.shared.markAllEditorialNotificationsRead()
                await load()
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                Text("تحديد الكل كمقروء")
            }
            .font(SabqFonts.app(size: 12, weight: .medium))
            .foregroundStyle(SabqTheme.primaryEnd)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Capsule().fill(SabqTheme.primaryEnd.opacity(0.10)))
        }
        .buttonStyle(.plain)
    }

    private func notificationRow(_ item: APIEditorialNotification) -> some View {
        let style = rowStyle(for: item.type)
        let isUnread = item.readAt == nil
        return Button {
            // Open the rich detail sheet. Mark-read happens in the
            // sheet's onAppear so the unread dot drops the moment the
            // sheet animates in (felt sluggish when read was awaited).
            selectedNotification = item
        } label: {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    Circle()
                        .fill(style.tint.opacity(0.14))
                        .frame(width: 40, height: 40)
                    Image(systemName: style.icon)
                        .font(SabqFonts.app(size: 17, weight: .semibold))
                        .foregroundStyle(style.tint)
                }

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(item.title)
                            .font(SabqFonts.app(size: 14, weight: .bold))
                            .foregroundStyle(SabqTheme.ink)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        if isUnread {
                            Circle()
                                .fill(SabqTheme.coral)
                                .frame(width: 7, height: 7)
                        }
                    }
                    // Strip any "— السبب: …" / "— ملاحظة المحرر: …" tail
                    // from the body when we have a separate reviewerNote
                    // — otherwise the reason renders twice (body suffix +
                    // dedicated callout below).
                    Text(Self.cleanBody(item))
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineSpacing(3)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if let reviewerNote = item.reviewerNote, !reviewerNote.isEmpty {
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "quote.bubble.fill")
                                .font(SabqFonts.app(size: 9, weight: .semibold))
                                .foregroundStyle(style.tint)
                                .padding(.top, 2)
                            Text(reviewerNote)
                                .font(SabqFonts.app(size: 11, weight: .regular))
                                .foregroundStyle(style.tint)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.top, 2)
                    }
                    Text(relativeDate(from: item.createdAt))
                        .font(SabqFonts.app(size: 10, weight: .regular))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .fill(isUnread ? style.tint.opacity(0.05) : SabqTheme.paleFill.opacity(0.3))
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    private func rowStyle(for type: String) -> (icon: String, tint: Color) {
        switch type {
        case "scheduled":      return ("calendar.badge.clock", SabqTheme.sky)
        case "published":      return ("checkmark.seal.fill", SabqTheme.leaf)
        case "rejected":       return ("xmark.octagon.fill", SabqTheme.coral)
        case "needs_revision": return ("pencil.and.scribble", SabqTheme.primaryEnd)
        case "archived":       return ("archivebox.fill", SabqTheme.tertiaryInk)
        case "survey_invite":  return ("checklist", SabqTheme.sky)
        default:               return ("bell.fill", SabqTheme.secondaryInk)
        }
    }

    // ISO-8601 → relative Arabic ("منذ 3 دقائق") using Latin digits. The
    // `-u-nu-latn` locale extension forces 4567 instead of ٤٥٦٧ which is
    // the editorial team's standard across the rest of the product.
    private func relativeDate(from iso: String) -> String {
        guard let date = SabqFormatters.parseISO8601(iso) else { return iso }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        formatter.locale = Locale(identifier: "ar-u-nu-latn")
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    @MainActor
    private func handleTap(_ item: APIEditorialNotification) async {
        try? await APIClient.shared.markEditorialNotificationRead(id: item.id)
        if let link = item.deepLink, let url = URL(string: link) {
            // Hand the deep link to the store so whichever view the user
            // bounces back to can route accordingly (same path the system
            // delegate uses for cold-start taps).
            if let parsed = NotificationsStore.shared.extractDeepLink(from: ["deeplink": url.absoluteString]) {
                NotificationsStore.shared.pendingDeepLink = parsed
            }
        }
        await load()
    }

    private func load() async {
        do {
            let page = try await APIClient.shared.fetchEditorialNotifications()
            items = page.items
            notificationsStore.unreadCount = page.unread
            loadState = .loaded
        } catch {
            loadState = .failed("تعذر جلب الإشعارات")
        }
        // The user is actively viewing the in-app list now, so any
        // editorial notifications still sitting in the system
        // notification center are stale. Sweep them so the iPhone
        // banner / notification center matches the in-app state.
        await Self.clearDeliveredEditorialNotifications()
    }

    /// Removes every iOS-level delivered notification whose userInfo
    /// `type` starts with "editorial." (matches the categories the
    /// backend sets in `editorialNotifications.ts` — `EDITORIAL_PUBLISHED`
    /// etc. — and also clears the app badge). Non-editorial pushes are
    /// left untouched.
    static func clearDeliveredEditorialNotifications() async {
        let center = UNUserNotificationCenter.current()
        let delivered = await center.deliveredNotifications()
        let editorialIds: [String] = delivered.compactMap { notif in
            let userInfo = notif.request.content.userInfo
            if let t = userInfo["type"] as? String, t.hasPrefix("editorial.") {
                return notif.request.identifier
            }
            // Fallback heuristic for older notifications that didn't
            // include a `type` key — clear them too if their category
            // starts with EDITORIAL_.
            if notif.request.content.categoryIdentifier.uppercased().hasPrefix("EDITORIAL_") {
                return notif.request.identifier
            }
            return nil
        }
        if !editorialIds.isEmpty {
            center.removeDeliveredNotifications(withIdentifiers: editorialIds)
        }
        // Reset the app badge so the home screen icon no longer carries
        // a stale count from already-seen editorial pushes.
        try? await center.setBadgeCount(0)
    }

    /// Strip the trailing "— السبب: …" / "— ملاحظة المحرر: …" pattern from
    /// notification bodies when the same text is available in the
    /// reviewerNote field. Keeps the row uncluttered (the editor's note
    /// has its own visually-distinct callout).
    static func cleanBody(_ item: APIEditorialNotification) -> String {
        let raw = item.body
        guard let note = item.reviewerNote, !note.isEmpty else { return raw }
        // Drop everything from the first "—" onward — we standardise on
        // an em-dash separator in `editorialNotifications.ts`.
        if let dashRange = raw.range(of: "—") {
            return String(raw[..<dashRange.lowerBound])
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return raw
    }
}

// MARK: - Detail sheet

/// Detail view shown when the user taps a notification row. Renders the
/// full payload (icon, title, body, reviewer note, timestamp) plus a
/// contextual action button that bounces back to the right place in the
/// app via the existing deep-link mechanism.
struct EditorialNotificationDetailView: View {
    let item: APIEditorialNotification
    @Environment(\.dismiss) private var dismiss
    /// Used to decide whether a `needs_revision` notification still has
    /// a usable "open to edit" target — if the article isn't in the
    /// pending-revisions list anymore, the writer already resubmitted
    /// and we swap the button for a "تم إرسال التعديل" placeholder
    /// so they can't accidentally edit twice.
    @Environment(ArticleRevisionsStore.self) private var revisionsStore
    @State private var marked = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    typeHeader
                    titleCard
                    if let note = item.reviewerNote, !note.isEmpty {
                        reviewerNoteCard(note)
                    }
                    metadataRow
                    if let action = actionForType() {
                        actionButton(action)
                    } else if isResubmittedRevision {
                        alreadyResubmittedChip
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 40)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(SabqFonts.app(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
                ToolbarItem(placement: .principal) {
                    Text("تفاصيل الإشعار")
                        .font(SabqFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }
            }
        }
        .task {
            guard !marked else { return }
            marked = true
            // Mark read silently — failure is harmless (next fetch
            // reconciles), so we don't surface errors to the user.
            try? await APIClient.shared.markEditorialNotificationRead(id: item.id)
            // Optimistically decrement the header bell's unread count.
            await MainActor.run {
                if item.readAt == nil {
                    NotificationsStore.shared.unreadCount = max(0, NotificationsStore.shared.unreadCount - 1)
                }
            }
            // Sweep any iOS-level delivered notifications too — the user
            // is clearly looking at this content, no need to keep an
            // entry hanging in the notification center.
            await EditorialNotificationsView.clearDeliveredEditorialNotifications()
        }
    }

    // MARK: Sub-views

    private var style: (icon: String, tint: Color, label: String) {
        switch item.type {
        case "scheduled":      return ("calendar.badge.clock", SabqTheme.sky, "جدولة")
        case "published":      return ("checkmark.seal.fill", SabqTheme.leaf, "نشر")
        case "rejected":       return ("xmark.octagon.fill", SabqTheme.coral, "اعتذار")
        case "needs_revision": return ("pencil.and.scribble", SabqTheme.primaryEnd, "طلب تعديل")
        case "archived":       return ("archivebox.fill", SabqTheme.tertiaryInk, "أرشفة")
        case "survey_invite":  return ("checklist", SabqTheme.sky, "دعوة استطلاع")
        default:               return ("bell.fill", SabqTheme.secondaryInk, "إشعار")
        }
    }

    private var typeHeader: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(style.tint.opacity(0.14))
                    .frame(width: 80, height: 80)
                Image(systemName: style.icon)
                    .font(SabqFonts.app(size: 36, weight: .regular))
                    .foregroundStyle(style.tint)
            }
            Text(style.label)
                .font(SabqFonts.app(size: 10, weight: .regular))
                .tracking(0.5)
                .foregroundStyle(style.tint)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Capsule().fill(style.tint.opacity(0.10)))
                .overlay(Capsule().stroke(style.tint.opacity(0.25), lineWidth: 0.5))
            Text(item.title)
                .font(SabqFonts.app(size: 18, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private var titleCard: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("المحتوى المعني")
                    .font(SabqFonts.app(size: 10, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)

                Text(item.articleTitle ?? item.title)
                    .font(SabqFonts.app(size: 16, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)

                if let parts = extractScheduleParts() {
                    Divider().background(SabqTheme.outline.opacity(0.5))
                    scheduleMetaRow(icon: "calendar", label: parts.dateText)
                    scheduleMetaRow(icon: "clock", label: parts.timeText)
                } else {
                    // Non-scheduled events: render the body once with the
                    // duplicated "«title» —" prefix stripped, so the title
                    // doesn't appear twice in the same card.
                    let body = bodyWithoutTitlePrefix()
                    if !body.isEmpty {
                        Text(body)
                            .font(SabqFonts.app(size: 13, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .multilineTextAlignment(.leading)
                            .lineSpacing(5)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    private func scheduleMetaRow(icon: String, label: String) -> some View {
        HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(SabqTheme.sky.opacity(0.14))
                    .frame(width: 28, height: 28)
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.sky)
            }
            Text(label)
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
                .monospacedDigit() // no-op for Arabic glyphs, aligns Latin digits in time
        }
    }

    /// Parses a scheduled-notification body of the form
    /// `«{title}» — تنشر يوم {weekday}، {day} {month} في {hh:mm} {صباحًا/مساءً}`
    /// into separate date / time text. Returns nil for non-scheduled
    /// events or when the expected shape isn't present.
    private func extractScheduleParts() -> (dateText: String, timeText: String)? {
        guard item.type == "scheduled" else { return nil }

        var text = item.body
        // Drop the `«title» — ` prefix.
        if let dashRange = text.range(of: "—") {
            text = String(text[text.index(after: dashRange.lowerBound)...])
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        // Drop the "تنشر يوم " lead so the date reads as a clean
        // "weekday، day month" string.
        for prefix in ["تنشر يوم ", "ستُنشر يوم "] {
            if text.hasPrefix(prefix) {
                text = String(text.dropFirst(prefix.count))
                break
            }
        }
        // Split on " في " to separate date from time.
        guard let r = text.range(of: " في ") else { return nil }
        let date = String(text[..<r.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        let time = String(text[r.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !date.isEmpty, !time.isEmpty else { return nil }
        return (date, time)
    }

    /// Removes the leading `«title» — ` from the body so the article
    /// title doesn't render twice in the detail card.
    private func bodyWithoutTitlePrefix() -> String {
        let raw = EditorialNotificationsView.cleanBody(item)
        if let dashRange = raw.range(of: "—") {
            return String(raw[raw.index(after: dashRange.lowerBound)...])
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return raw
    }

    private func reviewerNoteCard(_ note: String) -> some View {
        SurfaceCard(accent: style.tint) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "quote.bubble.fill")
                        .font(SabqFonts.app(size: 14, weight: .semibold))
                        .foregroundStyle(style.tint)
                    Text("ملاحظة المحرر")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.ink)
                }
                Text(note)
                    .font(SabqFonts.app(size: 14, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(6)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                            .fill(style.tint.opacity(0.08))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                            .stroke(style.tint.opacity(0.20), lineWidth: 0.5)
                    )
            }
        }
    }

    private var metadataRow: some View {
        HStack(spacing: 6) {
            Image(systemName: "clock")
                .font(SabqFonts.app(size: 11, weight: .regular))
            Text(relativeArabic(item.createdAt))
                .font(SabqFonts.app(size: 12, weight: .medium))
        }
        .foregroundStyle(SabqTheme.tertiaryInk)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Action button

    private struct ActionDescriptor {
        let title: String
        let icon: String
        let deepLink: NotificationDeepLink
    }

    /// True when this notification is a `needs_revision` event whose
    /// article is no longer in the pending-revisions list — the writer
    /// already resubmitted and we shouldn't surface the "افتح للتعديل"
    /// button anymore. We compare against `revisionsStore.items` rather
    /// than fetching the article state on the fly so the swap is
    /// instantaneous after a successful resubmit.
    private var isResubmittedRevision: Bool {
        // Only treat a needs_revision notification as "already resubmitted"
        // once the store has actually loaded — before the first refresh
        // completes the empty `items` array would mis-flag every fresh
        // notification (the bug reported 2026-05-21 where a brand-new
        // revision request showed "تم إرسال التعديل سابقاً" on first open).
        guard item.type == "needs_revision",
              let id = item.articleId, !id.isEmpty,
              revisionsStore.hasLoaded else {
            return false
        }
        return !revisionsStore.items.contains(where: { $0.id == id })
    }

    private func actionForType() -> ActionDescriptor? {
        switch item.type {
        case "published":
            guard let slug = item.articleSlug, !slug.isEmpty else { return nil }
            return ActionDescriptor(title: "اقرأ المقال", icon: "doc.text.fill", deepLink: .article(slug: slug))
        case "needs_revision":
            // Resolves to the in-app revision form (ArticleRevisionView).
            // Needs the articleId — fall back gracefully if the
            // notification arrived without one (shouldn't happen, but
            // we'd rather surface the note than crash).
            //
            // Suppress the action when the writer already resubmitted
            // (article isn't in revisionsStore anymore) — the chip
            // below replaces the button so it's clear to the reader
            // that no further action is needed.
            guard let id = item.articleId, !id.isEmpty else { return nil }
            if isResubmittedRevision { return nil }
            return ActionDescriptor(title: "افتح للتعديل", icon: "pencil.and.list.clipboard", deepLink: .draft(id: id))
        case "survey_invite":
            // deepLink carries sabq://survey/<token>; reuse the shared
            // parser so the button lands on SurveyView like a push tap.
            guard let raw = item.deepLink, let url = URL(string: raw),
                  case let .survey(token)? = NotificationsStore.shared.parseSabqDeepLink(url: url) else { return nil }
            return ActionDescriptor(title: "شارك برأيك الآن", icon: "checklist", deepLink: .survey(token: token))
        case "scheduled", "rejected", "archived":
            // No actionable destination: scheduled has no detail page
            // until publish, and rejected/archived articles aren't
            // public. The card already shows date + reviewer note, so
            // the lack of a button is fine here.
            return nil
        default:
            return nil
        }
    }

    /// Inline replacement for the action button when the writer already
    /// resubmitted. Reads as "تم إرسال التعديل سابقاً" with a green
    /// check, so opening the notification a second time gives clear
    /// feedback instead of inviting another edit.
    private var alreadyResubmittedChip: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.seal.fill")
                .font(SabqFonts.app(size: 16, weight: .heavy))
            Text("تم إرسال التعديل سابقاً")
                .font(SabqFonts.app(size: 15, weight: .bold))
        }
        .foregroundStyle(SabqTheme.leaf)
        .padding(.vertical, 14)
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(SabqTheme.leaf.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(SabqTheme.leaf.opacity(0.35), lineWidth: 1)
        )
    }

    private func actionButton(_ action: ActionDescriptor) -> some View {
        Button {
            // Hand the deep link to the singleton so ContentView's
            // onChange handler routes us to the home tab + the right
            // surface. Then dismiss the sheet.
            NotificationsStore.shared.pendingDeepLink = action.deepLink
            dismiss()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: action.icon)
                    .font(SabqFonts.app(size: 14, weight: .heavy))
                Text(action.title)
                    .font(SabqFonts.app(size: 16, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func relativeArabic(_ iso: String) -> String {
        guard let date = SabqFormatters.parseISO8601(iso) else { return iso }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        formatter.locale = Locale(identifier: "ar-u-nu-latn")
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Preferences

/// Per-type toggles screen. Lives one level deeper than the history view
/// so the user always lands on their notifications first; the gear in the
/// nav bar takes them here.
struct NotificationPreferencesView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var prefs: EditorialNotificationPreferences = .allOn
    @State private var loaded = false
    @State private var saving = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                introCard

                SurfaceCard {
                    VStack(spacing: 4) {
                        toggleRow(
                            icon: "calendar.badge.clock",
                            tint: SabqTheme.sky,
                            title: "جدولة المحتوى",
                            subtitle: "عند جدولة مقالتك/خبرك لوقت لاحق",
                            isOn: $prefs.scheduledEnabled
                        )
                        Divider()
                        toggleRow(
                            icon: "checkmark.seal.fill",
                            tint: SabqTheme.leaf,
                            title: "النشر",
                            subtitle: "عند نشر المحتوى وإتاحته للقراء",
                            isOn: $prefs.publishedEnabled
                        )
                        Divider()
                        toggleRow(
                            icon: "pencil.and.scribble",
                            tint: SabqTheme.primaryEnd,
                            title: "طلب تعديل",
                            subtitle: "حين يطلب المحرّر تعديلاً قبل النشر",
                            isOn: $prefs.revisionEnabled
                        )
                        Divider()
                        toggleRow(
                            icon: "xmark.octagon.fill",
                            tint: SabqTheme.coral,
                            title: "الاعتذار / الرفض",
                            subtitle: "عند الاعتذار عن النشر مع توضيح السبب",
                            isOn: $prefs.rejectedEnabled
                        )
                    }
                }

                if saving {
                    HStack(spacing: 6) {
                        ProgressView().controlSize(.small)
                        Text("جاري الحفظ...")
                            .font(SabqFonts.app(size: 10, weight: .regular))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 20)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("إعدادات الإشعارات")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let p = try? await APIClient.shared.fetchNotificationPreferences() {
                prefs = p
                loaded = true
            }
        }
        .onChange(of: prefs) { _, newPrefs in
            guard loaded else { return }
            Task { await save(newPrefs) }
        }
    }

    private var introCard: some View {
        SurfaceCard(accent: SabqTheme.primaryEnd) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "bell.badge")
                        .font(SabqFonts.app(size: 18, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                    Text("إشعاراتك الشخصية")
                        .font(SabqFonts.app(size: 16, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }
                Text("تحكم في الأنواع التي تصلك على هذا الجهاز. تطفئة نوع لا يلغي إرسالها — يمكن الاطلاع عليها لاحقاً من شاشة الإشعارات.")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(3)
            }
        }
    }

    private func toggleRow(icon: String, tint: Color, title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.14))
                    .frame(width: 36, height: 36)
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(tint)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                Text(subtitle)
                    .font(SabqFonts.app(size: 10, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(tint)
        }
        .padding(.vertical, 8)
    }

    private func save(_ newPrefs: EditorialNotificationPreferences) async {
        saving = true
        defer { saving = false }
        try? await APIClient.shared.updateNotificationPreferences(newPrefs)
    }
}
