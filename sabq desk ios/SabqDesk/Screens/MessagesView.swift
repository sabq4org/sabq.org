import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// «الرسائل»: contributors' messages as a chat list, in three tabs.
struct MessagesView: View {
    @Environment(AppModel.self) private var app

    @State private var section: DeskTicketSection = .awaiting
    @State private var search = ""
    @FocusState private var searchFocused: Bool
    @State private var model: InboxModel?
    @State private var path: [DeskDeepLink] = []
    /// A quick reply picked on a waiting card, prefilled in that ticket's composer.
    @State private var drafts: [String: String] = [:]
    @State private var quickReplies = QuickReplyStore().replies

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
                    TicketDetailView(ticketID: id, initialDraft: drafts[id] ?? "") { status in
                        model?.apply(link, status: status)
                    }
                }
            }
        }
        .onAppear {
            _ = ensureModel()
            consumePendingLink()
            quickReplies = QuickReplyStore().replies
        }
        .onChange(of: app.pendingLink) { _, _ in consumePendingLink() }
        .onChange(of: path) { _, newPath in
            if newPath.isEmpty {
                drafts.removeAll()
                Task {
                    await model?.reload()
                    await app.refreshUnread()
                }
            }
        }
    }

    /// Title with the waiting count, an always-visible search field, then the tabs.
    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            DeskScreenHeader(title: "الرسائل", subtitle: "رسائل المساهمين") {
                if app.unread.tickets > 0 {
                    Text("\(DeskCount.messages(app.unread.tickets)) بانتظار ردك")
                        .deskText(DeskType.metaEmphasis)
                        .foregroundStyle(DeskInk.link)
                        .padding(.horizontal, DeskLayout.space12)
                        .padding(.vertical, 6)
                        .background(DeskInk.soft, in: Capsule())
                }
            }
            .padding(.horizontal, DeskLayout.pageMargin + 4)
            searchRow
                .padding(.horizontal, DeskLayout.pageMargin + 4)
            SectionChipBar(sections: DeskTicketSection.allCases, selection: $section,
                           title: \.title,
                           count: { $0 == .awaiting ? app.unread.tickets : 0 })
        }
    }

    private var searchRow: some View {
        HStack(spacing: DeskLayout.space12) {
            HStack(spacing: DeskLayout.space8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(DeskTheme.textSecondary)
                    .accessibilityHidden(true)
                TextField("ابحث باسم الكاتب أو الموضوع", text: $search)
                    .deskText(DeskType.excerpt)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .focused($searchFocused)
                if !search.isEmpty {
                    Button { search = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(DeskTheme.textTertiary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("مسح البحث")
                }
            }
            .padding(.horizontal, DeskLayout.space16)
            .frame(minHeight: 48)
            .background(DeskTheme.surface, in: Capsule())
            .shadow(color: DeskTheme.shadow, radius: 4, y: 1)
            if searchFocused || !search.isEmpty {
                Button("إلغاء") {
                    search = ""
                    searchFocused = false
                }
                .deskText(DeskType.button)
                .foregroundStyle(DeskInk.link)
            }
        }
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
        } else if section == .awaiting {
            // Waiting messages are decisions: one card each, with quick replies.
            ForEach(model.items, id: \.listID) { item in
                WaitingConversationCard(item: item, quickReplies: Array(quickReplies.prefix(2))) {
                    path.append(.ticket(id: item.id))
                } onQuickReply: { reply in
                    drafts[item.id] = reply
                    path.append(.ticket(id: item.id))
                }
                .listRowInsets(EdgeInsets(top: 5, leading: DeskLayout.pageMargin + 4, bottom: 5, trailing: DeskLayout.pageMargin + 4))
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                .task { await model.loadMoreIfNeeded(after: item) }
            }
        } else {
            // Answered and closed messages are history: compact rows in one group.
            VStack(spacing: 0) {
                ForEach(Array(model.items.enumerated()), id: \.element.listID) { index, item in
                    Button { path.append(.ticket(id: item.id)) } label: {
                        CompactConversationRow(item: item)
                    }
                    .buttonStyle(.plain)
                    .task { await model.loadMoreIfNeeded(after: item) }
                    if index < model.items.count - 1 {
                        Rectangle().fill(DeskInk.hairline).frame(height: 1).padding(.leading, 60)
                    }
                }
            }
            .background(DeskCardBackground(radius: 22))
            .listRowInsets(EdgeInsets(top: 5, leading: DeskLayout.pageMargin + 4, bottom: 5, trailing: DeskLayout.pageMargin + 4))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
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

/// A waiting message on its own card: who, how long it has waited, the
/// subject and last message, then quick replies that open the reply prefilled.
private struct WaitingConversationCard: View {
    let item: StaffInboxItem
    let quickReplies: [String]
    let onOpen: () -> Void
    let onQuickReply: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            Button(action: onOpen) {
                HStack(alignment: .top, spacing: 12) {
                    RailAvatar(name: item.sender.name, kind: item.sender.kind, imageURL: item.sender.avatarUrl)
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(item.sender.name)
                                .deskText(DeskRowType.name)
                                .foregroundStyle(DeskTheme.textPrimary)
                                .lineLimit(1)
                            SenderKindLabel(kind: item.sender.kind)
                            Spacer(minLength: DeskLayout.space4)
                            if item.hasUnread {
                                Circle()
                                    .fill(DeskTheme.warning)
                                    .frame(width: 8, height: 8)
                                    .accessibilityHidden(true)
                            }
                        }
                        // «تنتظر · قبل 3 س»: how long the writer has been waiting.
                        Text(verbatim: "تنتظر · \(RiyadhTime.ago(item.updatedAt))")
                            .deskText(DeskType.meta)
                            .foregroundStyle(DeskTheme.warning)
                            .lineLimit(1)
                        Text(item.title)
                            .deskText(DeskRowType.subjectStrong)
                            .foregroundStyle(DeskTheme.textPrimary)
                            .lineLimit(2)
                            .padding(.top, 2)
                        Text(item.previewText ?? "")
                            .deskText(DeskRowType.preview)
                            .foregroundStyle(DeskTheme.textSecondary)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            if !quickReplies.isEmpty {
                HStack(spacing: DeskLayout.space8) {
                    ForEach(quickReplies, id: \.self) { reply in
                        Button(reply) { onQuickReply(reply) }
                            .deskText(DeskType.metaEmphasis)
                            .foregroundStyle(DeskInk.link)
                            .lineLimit(1)
                            .padding(.horizontal, DeskLayout.space12)
                            .frame(minHeight: 36)
                            .background(DeskInk.soft, in: Capsule())
                            .buttonStyle(.plain)
                            .accessibilityHint("يفتح الرسالة والرد مكتوب، ولا يُرسل قبل تأكيدك")
                    }
                }
                .padding(.leading, RailAvatar.size + 12)
            }
        }
        .deskRowCard()
    }
}

/// An answered or closed message as a compact row inside one group.
private struct CompactConversationRow: View {
    let item: StaffInboxItem

    var body: some View {
        HStack(spacing: 12) {
            SenderAvatar(name: item.sender.name, kind: item.sender.kind, imageURL: item.sender.avatarUrl, size: 36)
                .overlay(Circle().strokeBorder(DeskTheme.separator, lineWidth: 1))
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(item.sender.name)
                        .deskText(item.hasUnread ? DeskRowType.name : DeskRowType.nameRead)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .lineLimit(1)
                    SenderKindLabel(kind: item.sender.kind)
                    Spacer(minLength: DeskLayout.space4)
                    if item.hasUnread {
                        Circle()
                            .fill(DeskInk.action)
                            .frame(width: 8, height: 8)
                            .accessibilityHidden(true)
                    }
                    Text(verbatim: RiyadhTime.ago(item.updatedAt))
                        .deskText(DeskType.timestamp)
                        .foregroundStyle(DeskTheme.textSecondary)
                        .lineLimit(1)
                        .fixedSize()
                }
                Text(item.title)
                    .deskText(DeskRowType.subjectRead)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .lineLimit(1)
                if let preview = item.previewText, !preview.isEmpty {
                    Text(verbatim: "↩ \(preview)")
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textTertiary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
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
