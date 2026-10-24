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
    @Bindable var inbox: InboxModel
    let filters: [StaffInboxFilter]
    let unread: StaffUnreadCounts

    var body: some View {
        List {
            Section {
                controls
                    .listRowInsets(EdgeInsets(top: DeskLayout.space8, leading: DeskLayout.pageMargin,
                                              bottom: DeskLayout.space8, trailing: DeskLayout.pageMargin))
                    .listRowSeparator(.hidden)
            }

            if let message = inbox.errorMessage {
                ErrorLine(message: message)
                    .listRowSeparator(.hidden)
            }

            if inbox.items.isEmpty, !inbox.isLoading, inbox.errorMessage == nil {
                emptyState
                    .listRowSeparator(.hidden)
            }

            ForEach(inbox.items, id: \.listID) { item in
                if let link = DeskDeepLink(item: item) {
                    NavigationLink(value: link) {
                        InboxRow(item: item)
                    }
                    .task { await inbox.loadMoreIfNeeded(after: item) }
                }
            }

            if inbox.isLoadingMore {
                HStack { Spacer(); ProgressView(); Spacer() }
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .overlay {
            if inbox.isLoading, inbox.items.isEmpty { ProgressView() }
        }
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

    private var controls: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
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

    private var emptyState: some View {
        VStack(spacing: DeskLayout.space8) {
            Image(systemName: "tray")
                .font(.system(size: 32))
                .foregroundStyle(DeskTheme.textTertiary)
            Text(inbox.search.isEmpty ? "لا شيء هنا الآن" : "لا نتائج مطابقة")
                .deskText(DeskType.rowTitle)
                .foregroundStyle(DeskTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, DeskLayout.space32)
    }
}

/// A flat row: unread dot, kind, sender, title, preview, status and time.
private struct InboxRow: View {
    let item: StaffInboxItem

    var body: some View {
        HStack(alignment: .top, spacing: DeskLayout.space12) {
            Circle()
                .fill(item.hasUnread ? DeskTheme.primary : Color.clear)
                .frame(width: 8, height: 8)
                .padding(.top, 7)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: DeskLayout.space4) {
                HStack(spacing: DeskLayout.space8) {
                    Image(systemName: item.kind == .ticket ? "bubble.left.and.bubble.right" : "paperplane")
                        .font(.system(size: 12))
                        .foregroundStyle(DeskTheme.textTertiary)
                    Text("\(item.sender.name) · \(item.sender.kind.title)")
                        .deskText(DeskType.metaEmphasis)
                        .foregroundStyle(DeskTheme.textSecondary)
                        .lineLimit(1)
                    Spacer(minLength: DeskLayout.space8)
                    LTRText(text: RiyadhTime.shortString(item.updatedAt))
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
                StatusPill(title: item.statusTitle, tint: item.statusTint)
                    .padding(.top, 2)
            }
        }
        .padding(.vertical, DeskLayout.space8)
        .accessibilityElement(children: .combine)
        .accessibilityHint(item.hasUnread ? "غير مقروء" : "")
    }
}
