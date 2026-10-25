import SabqDeskDesign
import SabqDeskKit
import SwiftUI

struct InboxView: View {
    @Environment(AppModel.self) private var app
    @State private var inbox: InboxModel?
    @State private var path: [DeskDeepLink] = []

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if let inbox {
                    InboxList(inbox: inbox, filters: app.capabilities.inboxFilters, unread: app.unread)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(DeskTheme.groupedBackground)
                }
            }
            .navigationTitle("الوارد")
            .navigationDestination(for: DeskDeepLink.self) { link in
                switch link {
                case .ticket(let id):
                    TicketDetailView(ticketID: id) { status in
                        inbox?.markRead(link, status: status)
                    }
                case .social(let id):
                    SocialDetailView(postID: id) { status in
                        inbox?.markRead(link, status: status)
                    }
                }
            }
        }
        .onAppear {
            if inbox == nil {
                let model = InboxModel(client: app.client) { [app] error in app.handle(error) }
                if let first = app.capabilities.inboxFilters.first { model.filter = first }
                inbox = model
            }
            consumePendingLink()
        }
        .onChange(of: app.pendingLink) { _, _ in consumePendingLink() }
    }

    private func consumePendingLink() {
        guard let link = app.pendingLink else { return }
        app.pendingLink = nil
        let allowed: Bool
        switch link {
        case .ticket: allowed = app.capabilities.canTickets
        case .social: allowed = app.capabilities.canSocial.view
        }
        guard allowed else { return }
        path = [link]
    }
}

private struct InboxList: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Bindable var inbox: InboxModel
    let filters: [StaffInboxFilter]
    let unread: StaffUnreadCounts

    var body: some View {
        List {
            Section {
                header
                    .listRowInsets(EdgeInsets(top: DeskLayout.space8, leading: DeskLayout.pageMargin,
                                              bottom: DeskLayout.space8, trailing: DeskLayout.pageMargin))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }

            if let message = inbox.errorMessage {
                ErrorLine(message: message)
                    .padding(DeskLayout.space12)
                    .background(DeskTone.danger.fill, in: RoundedRectangle(cornerRadius: DeskRadius.medium, style: .continuous))
                    .listRowInsets(plainInsets)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }

            if inbox.items.isEmpty, !inbox.isLoading, inbox.errorMessage == nil {
                emptyState
                    .listRowInsets(plainInsets)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }

            if inbox.isLoading, inbox.items.isEmpty {
                ForEach(0..<3, id: \.self) { index in
                    InboxSkeletonRow()
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("جارٍ تحميل الوارد")
                        .accessibilityHidden(index > 0)
                        .listRowInsets(cardContentInsets)
                        .listRowSeparator(.hidden)
                        .listRowBackground(cardRowBackground)
                }
            }

            ForEach(inbox.items, id: \.listID) { item in
                if let link = DeskDeepLink(item: item) {
                    NavigationLink(value: link) {
                        InboxRow(item: item)
                    }
                    .listRowInsets(cardContentInsets)
                    .listRowSeparator(.hidden)
                    .listRowBackground(cardRowBackground)
                    .task { await inbox.loadMoreIfNeeded(after: item) }
                }
            }

            if inbox.isLoadingMore {
                HStack { Spacer(); ProgressView(); Spacer() }
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(DeskTheme.groupedBackground)
        .contentMargins(.bottom, DeskLayout.tabBarClearance, for: .scrollContent)
        .searchable(text: $inbox.search, placement: .navigationBarDrawer(displayMode: .always), prompt: "بحث في العنوان أو المرسل")
        .refreshable {
            await inbox.reload()
            await app.refreshUnread()
        }
        .task(id: reloadKey) {
            if !inbox.search.isEmpty { try? await Task.sleep(for: .milliseconds(350)) }
            guard !Task.isCancelled else { return }
            await inbox.reload()
        }
    }

    private var reloadKey: String {
        "\(inbox.filter.rawValue)|\(inbox.unreadOnly)|\(inbox.search)"
    }

    // MARK: - Card rows

    private var plainInsets: EdgeInsets {
        EdgeInsets(top: DeskLayout.cardGap / 2, leading: DeskLayout.pageMargin,
                   bottom: DeskLayout.cardGap / 2, trailing: DeskLayout.pageMargin)
    }

    /// Content sits inside the card drawn by `cardRowBackground`.
    private var cardContentInsets: EdgeInsets {
        let vertical = DeskLayout.cardGap / 2 + DeskLayout.space12
        let horizontal = DeskLayout.pageMargin + DeskLayout.space12
        return EdgeInsets(top: vertical, leading: horizontal, bottom: vertical, trailing: horizontal)
    }

    private var cardRowBackground: some View {
        DeskCardBackground()
            .padding(.horizontal, DeskLayout.pageMargin)
            .padding(.vertical, DeskLayout.cardGap / 2)
    }

    // MARK: - Header

    private var showsTickets: Bool { filters.contains(.ticket) }
    private var showsSocial: Bool { filters.contains(.social) }

    private var header: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space12) {
            if showsTickets || showsSocial {
                Text("بانتظارك")
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .accessibilityAddTraits(.isHeader)
                let layout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(spacing: DeskLayout.space12))
                    : AnyLayout(HStackLayout(alignment: .top, spacing: DeskLayout.space12))
                layout {
                    if showsTickets {
                        InboxCountTile(title: "استفسارات جديدة", count: unread.tickets,
                                       systemImage: StaffInboxKind.ticket.systemImage, tone: StaffInboxKind.ticket.tone)
                    }
                    if showsSocial {
                        InboxCountTile(title: "مقترحات بانتظار القرار", count: unread.social,
                                       systemImage: StaffInboxKind.social.systemImage, tone: StaffInboxKind.social.tone)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            controls
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space12) {
            if filters.count > 1 {
                Picker("النوع", selection: $inbox.filter) {
                    ForEach(filters, id: \.self) { filter in
                        Text(segmentTitle(filter)).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
            }
            Toggle(isOn: $inbox.unreadOnly) {
                Text("غير المقروء فقط")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
            }
            .toggleStyle(.switch)
            .padding(.horizontal, DeskLayout.cardInset)
            .padding(.vertical, DeskLayout.space8)
            .background(DeskCardBackground())
        }
    }

    private func segmentTitle(_ filter: StaffInboxFilter) -> String {
        let count: Int
        switch filter {
        case .all: count = unread.total
        case .ticket: count = unread.tickets
        case .social: count = unread.social
        }
        return count > 0 ? "\(filter.title) \(count)" : filter.title
    }

    // MARK: - Empty

    private var emptyState: some View {
        let content: (icon: String, tone: DeskTone, title: String, message: String)
        if !inbox.search.isEmpty {
            content = ("magnifyingglass", .neutral, "لا نتائج مطابقة", "جرّب كلمة أخرى أو امسح البحث.")
        } else if inbox.unreadOnly {
            content = ("checkmark.circle", .success, "لا جديد غير مقروء",
                       "اطّلعت على كل شيء. أوقف «غير المقروء فقط» لعرض الكل.")
        } else {
            content = ("tray", .info, "لا شيء هنا الآن",
                       "تظهر هنا الاستفسارات ومقترحات النشر فور وصولها. اسحب للأسفل للتحديث.")
        }
        return InboxEmptyCard(systemImage: content.icon, tone: content.tone,
                              title: content.title, message: content.message)
    }
}

/// Summary tile in the inbox header: icon, large count, label.
private struct InboxCountTile: View {
    let title: String
    let count: Int
    let systemImage: String
    let tone: DeskTone

    var body: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            DeskIconTile(systemImage: systemImage, tone: tone)
            LTRText(text: "\(count)", role: DeskType.statValue,
                    color: count > 0 ? tone.ink : DeskTheme.textTertiary)
            Text(title)
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .deskCard(radius: DeskRadius.large)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title): \(count)")
    }
}

private struct InboxEmptyCard: View {
    let systemImage: String
    let tone: DeskTone
    let title: String
    let message: String
    @ScaledMetric(relativeTo: .title) private var circle: CGFloat = DeskLayout.avatar

    var body: some View {
        VStack(spacing: DeskLayout.space12) {
            Image(systemName: systemImage)
                .font(.system(size: circle * 0.42, weight: .semibold))
                .foregroundStyle(tone.ink)
                .frame(width: circle, height: circle)
                .background(tone.tileFill, in: Circle())
                .accessibilityHidden(true)
            Text(title)
                .deskText(DeskType.rowTitle)
                .foregroundStyle(DeskTheme.textPrimary)
                .multilineTextAlignment(.center)
            Text(message)
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, DeskLayout.space24)
        .deskCard(radius: DeskRadius.large)
        .accessibilityElement(children: .combine)
    }
}

/// Card row: kind tile, sender and time, title, preview, then status chip.
private struct InboxRow: View {
    let item: StaffInboxItem

    var body: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            HStack(alignment: .center, spacing: DeskLayout.space8) {
                DeskIconTile(systemImage: item.kind.systemImage, tone: item.kind.tone)
                VStack(alignment: .leading, spacing: 0) {
                    Text(item.sender.name)
                        .deskText(DeskType.metaEmphasis)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .lineLimit(1)
                    Text(item.sender.kind.title)
                        .deskText(DeskType.timestamp)
                        .foregroundStyle(DeskTheme.textTertiary)
                        .lineLimit(1)
                }
                Spacer(minLength: DeskLayout.space8)
                LTRText(text: RiyadhTime.shortString(item.updatedAt))
                if item.hasUnread {
                    Circle()
                        .fill(DeskTheme.primary)
                        .frame(width: 8, height: 8)
                        .accessibilityHidden(true)
                }
            }
            Text(item.title)
                .deskText(DeskType.rowTitle)
                .foregroundStyle(DeskTheme.textPrimary)
                .lineLimit(2)
            if let preview = item.previewText, !preview.isEmpty, preview != item.title {
                Text(preview)
                    .deskText(DeskType.excerpt)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .lineLimit(2)
            }
            StatusChip(title: item.statusTitle, tone: item.statusTone)
                .padding(.top, 2)
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint(item.hasUnread ? "غير مقروء" : "")
    }
}

/// Placeholder card shown while the first page loads.
private struct InboxSkeletonRow: View {
    var body: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            HStack(spacing: DeskLayout.space8) {
                DeskIconTile(systemImage: "tray", tone: .neutral)
                Text("اسم المرسل")
                    .deskText(DeskType.metaEmphasis)
                Spacer(minLength: DeskLayout.space8)
                Text("00:00")
                    .deskText(DeskType.timestamp)
            }
            Text("عنوان العنصر في الوارد يظهر في هذا المكان")
                .deskText(DeskType.rowTitle)
            Text("معاينة قصيرة للنص")
                .deskText(DeskType.excerpt)
        }
        .foregroundStyle(DeskTheme.textTertiary)
        .redacted(reason: .placeholder)
    }
}

#if DEBUG
#Preview("الوارد — فاتح") {
    InboxView()
        .deskPreviewEnvironment()
}

#Preview("الوارد — داكن") {
    InboxView()
        .deskPreviewEnvironment()
        .preferredColorScheme(.dark)
}

#Preview("الوارد — فارغ") {
    InboxView()
        .deskPreviewEnvironment(emptyInbox: true)
}
#endif
