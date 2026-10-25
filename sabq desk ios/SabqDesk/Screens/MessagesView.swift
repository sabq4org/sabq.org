import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// «الرسائل»: contributors' messages as a chat list, in three tabs.
struct MessagesView: View {
    @Environment(AppModel.self) private var app

    @State private var section: DeskTicketSection = .awaiting
    @State private var search = ""
    @State private var model: InboxModel?
    @State private var path: [DeskDeepLink] = []

    var body: some View {
        NavigationStack(path: $path) {
            List {
                header
                    .listRowInsets(EdgeInsets(top: DeskLayout.space8, leading: 0, bottom: DeskLayout.space8, trailing: 0))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                if let model {
                    content(model)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(DeskTheme.background)
            .contentMargins(.bottom, DeskLayout.tabBarClearance, for: .scrollContent)
            .refreshable {
                await model?.reload()
                await app.refreshUnread()
            }
            .task(id: "\(section.rawValue)|\(search)") {
                let model = ensureModel()
                if !search.isEmpty { try? await Task.sleep(for: .milliseconds(350)) }
                guard !Task.isCancelled else { return }
                model.query = section.query(search: search)
                await model.reload()
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: DeskDeepLink.self) { link in
                if case .ticket(let id) = link {
                    TicketDetailView(ticketID: id) { status in
                        model?.apply(link, status: status)
                    }
                }
            }
        }
        .onAppear {
            _ = ensureModel()
            consumePendingLink()
        }
        .onChange(of: app.pendingLink) { _, _ in consumePendingLink() }
        .onChange(of: path) { _, newPath in
            if newPath.isEmpty {
                Task {
                    await model?.reload()
                    await app.refreshUnread()
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space12) {
            DeskScreenHeader(title: "رسائل المساهمين", subtitle: subtitle)
                .padding(.horizontal, DeskLayout.pageMargin + 4)
            HStack(spacing: DeskLayout.space8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(DeskTheme.textSecondary)
                    .accessibilityHidden(true)
                TextField("ابحث باسم الكاتب أو الموضوع", text: $search)
                    .deskText(DeskType.excerpt)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                if !search.isEmpty {
                    Button { search = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(DeskTheme.textTertiary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("مسح البحث")
                }
            }
            .padding(.horizontal, DeskLayout.space12)
            .frame(minHeight: 44)
            .background(DeskInk.chip, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, DeskLayout.pageMargin + 4)
            SectionChipBar(sections: DeskTicketSection.allCases, selection: $section,
                           title: \.title,
                           count: { $0 == .awaiting ? app.unread.tickets : 0 })
        }
    }

    private var subtitle: String {
        let count = app.unread.tickets
        return count > 0 ? "\(DeskCount.messages(count)) بانتظار ردك" : "لا رسائل جديدة"
    }

    @ViewBuilder
    private func content(_ model: InboxModel) -> some View {
        if let message = model.errorMessage {
            ErrorLine(message: message)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        }
        if model.items.isEmpty {
            if model.isLoading || !model.hasLoaded {
                HStack { Spacer(); ProgressView(); Spacer() }
                    .padding(.vertical, DeskLayout.space32)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            } else if model.errorMessage == nil {
                DeskEmptyState(title: search.isEmpty ? section.emptyTitle : "لا نتائج مطابقة",
                               message: search.isEmpty
                                   ? "تصلك رسائل الكتّاب والمراسلين هنا مع إشعار فوري."
                                   : "جرّب اسمًا أو كلمة أخرى.")
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
        } else {
            ForEach(model.items, id: \.listID) { item in
                NavigationLink(value: DeskDeepLink.ticket(id: item.id)) {
                    ConversationRow(item: item)
                }
                .listRowInsets(EdgeInsets(top: 14, leading: DeskLayout.pageMargin + 4, bottom: 14, trailing: DeskLayout.pageMargin + 4))
                .listRowSeparatorTint(DeskInk.hairline)
                .listRowBackground(Color.clear)
                .task { await model.loadMoreIfNeeded(after: item) }
            }
        }
        if model.isLoadingMore {
            HStack { Spacer(); ProgressView(); Spacer() }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        }
    }

    private func ensureModel() -> InboxModel {
        if let model { return model }
        let created = InboxModel(client: app.client, query: section.query(search: search)) { [app] error in
            app.handle(error)
        }
        model = created
        return created
    }

    private func consumePendingLink() {
        guard let link = app.pendingLink, case .ticket = link, app.capabilities.canTickets else { return }
        app.pendingLink = nil
        path = [link]
    }
}

/// Chat-list row: avatar, name and label, time, subject, last message, unread dot.
private struct ConversationRow: View {
    let item: StaffInboxItem

    var body: some View {
        HStack(alignment: .top, spacing: DeskLayout.space12) {
            SenderAvatar(name: item.sender.name, kind: item.sender.kind, imageURL: item.sender.avatarUrl, size: 48)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(item.sender.name)
                        .deskText(item.hasUnread ? DeskRowType.name : DeskRowType.nameRead)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .lineLimit(1)
                    SenderKindTag(kind: item.sender.kind)
                    Spacer(minLength: DeskLayout.space4)
                    // «قبل 12 د» / «11 أكتوبر»: Arabic phrases, natural RTL order.
                    Text(verbatim: RiyadhTime.ago(item.updatedAt))
                        .deskText(DeskType.timestamp)
                        .foregroundStyle(item.hasUnread ? DeskInk.link : DeskTheme.textSecondary)
                        .lineLimit(1)
                        .fixedSize()
                }
                Text(item.title)
                    .deskText(item.hasUnread ? DeskRowType.subject : DeskRowType.subjectRead)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .lineLimit(1)
                HStack(spacing: DeskLayout.space8) {
                    Text(item.previewText ?? "")
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if item.hasUnread {
                        Circle()
                            .fill(DeskInk.action)
                            .frame(width: 10, height: 10)
                            .accessibilityHidden(true)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint(item.hasUnread ? "غير مقروءة" : "")
    }
}

#if DEBUG
#Preview("الرسائل") {
    MessagesView()
        .deskPreviewEnvironment()
}
#endif
