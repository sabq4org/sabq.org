import SwiftUI

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
    @State private var unreadCount: Int = 0
    /// When the user taps a row we present a full-screen detail sheet
    /// instead of trying to push onto a fragile nested NavigationStack.
    /// The sheet works the same regardless of how we got to this screen
    /// (settings → notifications, or header bell → notifications).
    @State private var selectedNotification: APIEditorialNotification?

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
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink(destination: NotificationPreferencesView()) {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 16, weight: .semibold))
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
                    .font(.system(size: 40, weight: .light))
                    .foregroundStyle(SabqTheme.coral)
                Text(message)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.center)
                Button("إعادة المحاولة") { Task { await load() } }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Spacer()
            }
            .padding()
        case .loaded:
            if items.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        if unreadCount > 0 { markAllReadButton }
                        ForEach(items) { item in
                            notificationRow(item)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 40)
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "bell")
                .font(.system(size: 50, weight: .light))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text("لا توجد إشعارات بعد")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
            Text("سيصلك هنا كل ما يخص مقالاتك وأخبارك من جدولة ونشر ومراجعة.")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
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
            .font(.system(size: 13, weight: .semibold))
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
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(style.tint)
                }

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(item.title)
                            .font(.system(size: 14, weight: .bold))
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
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineSpacing(3)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if let reviewerNote = item.reviewerNote, !reviewerNote.isEmpty {
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "quote.bubble.fill")
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(style.tint)
                                .padding(.top, 2)
                            Text(reviewerNote)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(style.tint)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.top, 2)
                    }
                    Text(relativeDate(from: item.createdAt))
                        .font(.system(size: 10, weight: .medium))
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
        default:               return ("bell.fill", SabqTheme.secondaryInk)
        }
    }

    // ISO-8601 → relative Arabic ("منذ 3 دقائق") using Latin digits. The
    // `-u-nu-latn` locale extension forces 4567 instead of ٤٥٦٧ which is
    // the editorial team's standard across the rest of the product.
    private func relativeDate(from iso: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: iso) else { return iso }
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
            unreadCount = page.unread
            NotificationsStore.shared.unreadCount = page.unread
            loadState = .loaded
        } catch {
            loadState = .failed("تعذر جلب الإشعارات")
        }
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
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
                ToolbarItem(placement: .principal) {
                    Text("تفاصيل الإشعار")
                        .font(.system(size: 15, weight: .bold))
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
                    .font(.system(size: 36, weight: .regular))
                    .foregroundStyle(style.tint)
            }
            Text(style.label)
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .tracking(0.5)
                .foregroundStyle(style.tint)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Capsule().fill(style.tint.opacity(0.10)))
                .overlay(Capsule().stroke(style.tint.opacity(0.25), lineWidth: 0.5))
            Text(item.title)
                .font(.system(size: 18, weight: .heavy, design: .rounded))
                .foregroundStyle(SabqTheme.ink)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private var titleCard: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("المحتوى المعني")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                Text(item.articleTitle ?? item.title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                Text(EditorialNotificationsView.cleanBody(item))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(5)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func reviewerNoteCard(_ note: String) -> some View {
        SurfaceCard(accent: style.tint) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "quote.bubble.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(style.tint)
                    Text("ملاحظة المحرر")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }
                Text(note)
                    .font(.system(size: 14, weight: .medium))
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
                .font(.system(size: 11, weight: .semibold))
            Text(relativeArabic(item.createdAt))
                .font(.system(size: 12, weight: .medium))
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

    private func actionForType() -> ActionDescriptor? {
        switch item.type {
        case "published":
            guard let slug = item.articleSlug, !slug.isEmpty else { return nil }
            return ActionDescriptor(title: "اقرأ المقال", icon: "doc.text.fill", deepLink: .article(slug: slug))
        case "scheduled", "needs_revision", "rejected", "archived":
            // No usable destination yet: scheduled/needs_revision route
            // to sabq://draft/<id> which is wired as a placeholder back
            // to this same notifications list (ContentView.handleDeepLink
            // — "reserved for future per-draft preview"). rejected and
            // archived have no public surface to send the author to.
            // The detail view itself is the destination — all relevant
            // info (date, reviewer note, article title) is already
            // visible on this sheet, so we hide the action button until
            // a dedicated ArticleDraftPreview screen ships.
            return nil
        default:
            return nil
        }
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
                    .font(.system(size: 14, weight: .heavy))
                Text(action.title)
                    .font(.system(size: 16, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func relativeArabic(_ iso: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: iso) else { return iso }
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
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 20)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                        .padding(8)
                        .background(Circle().fill(.ultraThinMaterial))
                }
            }
            ToolbarItem(placement: .principal) {
                Text("إعدادات الإشعارات")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
            }
        }
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
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                    Text("إشعاراتك الشخصية")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }
                Text("تحكم في الأنواع التي تصلك على هذا الجهاز. تطفئة نوع لا يلغي إرسالها — يمكن الاطلاع عليها لاحقاً من شاشة الإشعارات.")
                    .font(.system(size: 12, weight: .medium))
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
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(tint)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                Text(subtitle)
                    .font(.system(size: 11, weight: .medium))
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
