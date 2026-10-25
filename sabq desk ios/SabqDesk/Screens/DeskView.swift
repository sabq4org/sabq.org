import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// «المكتب»: tweet proposals in four tabs — waiting for a decision,
/// scheduled (a Riyadh-time timeline), published and rejected.
struct DeskView: View {
    @Environment(AppModel.self) private var app
    /// Opens the account tab from the avatar.
    let openAccount: () -> Void

    @State private var section: DeskSocialSection = .pending
    @State private var lists: [DeskSocialSection: InboxModel] = [:]
    @State private var path: [DeskDeepLink] = []
    @State private var scheduleTarget: StaffInboxItem?
    @State private var rejectTarget: StaffInboxItem?
    @State private var rowError: String?
    @State private var busyRow: String?

    private var model: InboxModel? { lists[section] }

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
            .contentMargins(.bottom, DeskLayout.space24, for: .scrollContent)
            .refreshable {
                await model?.reload()
                await app.refreshUnread()
            }
            .task(id: section) {
                makeListsIfNeeded()
                await model?.reload()
                if section != .scheduled { await lists[.scheduled]?.reload() }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: DeskDeepLink.self) { link in
                if case .social(let id) = link {
                    SocialDetailView(postID: id, scheduledTimes: scheduledTimes(excluding: id)) { status in
                        for list in lists.values { list.apply(link, status: status) }
                    }
                }
            }
        }
        .onAppear {
            makeListsIfNeeded()
            consumePendingLink()
        }
        .onChange(of: app.pendingLink) { _, _ in consumePendingLink() }
        .onChange(of: path) { _, newPath in
            if newPath.isEmpty { Task { await refreshAfterDetail() } }
        }
        .sheet(item: $scheduleTarget) { item in
            ScheduleSheet(initial: item.scheduledAt, scheduledTimes: scheduledTimes(excluding: item.id)) { date in
                Task { await schedule(item, at: date) }
            }
        }
        .sheet(item: $rejectTarget) { item in
            RejectSheet { reason in
                Task { await reject(item, reason: reason) }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space16) {
            DeskScreenHeader(title: "مكتب سبق", subtitle: RiyadhTime.dayTitle(Date())) {
                if let me = app.me {
                    Button(action: openAccount) { MemberAvatar(name: me.displayName) }
                        .buttonStyle(.plain)
                        .accessibilityLabel("حسابي")
                }
            }
            .padding(.horizontal, DeskLayout.pageMargin + 4)
            AssistantBubble(text: greeting)
                .padding(.horizontal, DeskLayout.pageMargin + 4)
            SectionChipBar(sections: DeskSocialSection.allCases, selection: $section,
                           title: \.title,
                           count: { $0 == .pending ? app.unread.social : ($0 == .scheduled ? scheduledCount : 0) })
            if let rowError {
                ErrorLine(message: rowError)
                    .padding(.horizontal, DeskLayout.pageMargin + 4)
            }
        }
    }

    private var greeting: String {
        var line = DeskCount.greeting(name: app.me?.displayName, pendingTweets: app.unread.social,
                                      openMessages: app.unread.tickets, showsTweets: true,
                                      showsMessages: app.capabilities.canTickets)
        if let next = upcoming.first?.scheduledAt {
            line += " وأقرب منشور مجدول الساعة \u{2066}\(RiyadhTime.timeString(next))\u{2069}."
        }
        return line
    }

    // MARK: - Content

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
                DeskEmptyState(title: section.emptyTitle, message: section.emptyMessage)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
        } else if section == .scheduled {
            timeline(model)
        } else {
            ForEach(model.items, id: \.listID) { item in
                row(item, model: model)
            }
            if section == .pending, canSwipe {
                Text("اسحب السطر لجدولته أو رفضه دون فتحه")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textTertiary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, DeskLayout.space12)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
        }
        if model.isLoadingMore {
            HStack { Spacer(); ProgressView(); Spacer() }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        }
    }

    private var canSwipe: Bool {
        app.capabilities.canSocial.schedule || app.capabilities.canSocial.reject
    }

    private func row(_ item: StaffInboxItem, model: InboxModel) -> some View {
        let caps = app.capabilities.canSocial
        let status = StaffSocialStatus(rawValue: item.status) ?? .unknown
        return NavigationLink(value: DeskDeepLink.social(id: item.id)) {
            SocialRow(item: item, section: section)
        }
        .listRowInsets(EdgeInsets(top: 14, leading: DeskLayout.pageMargin + 4, bottom: 14, trailing: DeskLayout.pageMargin + 4))
        .listRowSeparatorTint(DeskInk.hairline)
        .listRowBackground(Color.clear)
        .disabled(busyRow == item.listID)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if section == .pending, caps.reject, status == .draft {
                Button("رفض") { rejectTarget = item }
                    .tint(DeskTheme.danger)
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            if section == .pending, caps.schedule, status == .draft || status == .failed {
                Button("جدولة") { scheduleTarget = item }
                    .tint(DeskInk.link)
            }
            if section == .rejected, caps.reject {
                Button("أعده للانتظار") { Task { await returnToDraft(item) } }
                    .tint(DeskInk.link)
            }
        }
        .task { await model.loadMoreIfNeeded(after: item) }
    }

    // MARK: - Scheduled timeline

    private struct DayGroup: Identifiable {
        let id: Date
        let items: [StaffInboxItem]
    }

    private var upcoming: [StaffInboxItem] {
        (lists[.scheduled]?.items ?? [])
            .filter { $0.scheduledAt != nil }
            .sorted { ($0.scheduledAt ?? .distantFuture) < ($1.scheduledAt ?? .distantFuture) }
    }

    private var scheduledCount: Int { lists[.scheduled]?.items.count ?? 0 }

    private func scheduledTimes(excluding id: String) -> [Date] {
        upcoming.filter { $0.id != id }.compactMap(\.scheduledAt)
    }

    @ViewBuilder
    private func timeline(_ model: InboxModel) -> some View {
        let groups = Dictionary(grouping: upcoming) { RiyadhTime.dayKey($0.scheduledAt ?? $0.updatedAt) }
            .map { DayGroup(id: $0.key, items: $0.value) }
            .sorted { $0.id < $1.id }
        ForEach(groups) { group in
            Section {
                ForEach(Array(group.items.enumerated()), id: \.element.listID) { index, item in
                    NavigationLink(value: DeskDeepLink.social(id: item.id)) {
                        TimelineRow(item: item, isFirst: index == 0 && group.id == groups.first?.id,
                                    isLast: index == group.items.count - 1)
                    }
                    .listRowInsets(EdgeInsets(top: 0, leading: DeskLayout.pageMargin + 4, bottom: 0, trailing: DeskLayout.pageMargin + 4))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if app.capabilities.canSocial.schedule {
                            Button("ألغِ الجدولة") { Task { await returnToDraft(item) } }
                                .tint(DeskTheme.danger)
                        }
                    }
                    .task { await model.loadMoreIfNeeded(after: item) }
                }
            } header: {
                Text(RiyadhTime.dayTitle(group.id))
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .padding(.top, DeskLayout.space8)
            }
        }
    }

    // MARK: - Actions

    private func makeListsIfNeeded() {
        guard lists.isEmpty else { return }
        for section in DeskSocialSection.allCases {
            lists[section] = InboxModel(client: app.client, query: section.query) { [app] error in app.handle(error) }
        }
    }

    private func consumePendingLink() {
        guard let link = app.pendingLink, case .social = link, app.capabilities.canSocial.view else { return }
        app.pendingLink = nil
        path = [link]
    }

    private func refreshAfterDetail() async {
        await model?.reload()
        if section != .scheduled { await lists[.scheduled]?.reload() }
        await app.refreshUnread()
    }

    private func schedule(_ item: StaffInboxItem, at date: Date) async {
        await act(on: item) { try await app.client.scheduleSocialPost(id: item.id, at: date) }
    }

    private func reject(_ item: StaffInboxItem, reason: String?) async {
        await act(on: item) { try await app.client.rejectSocialPost(id: item.id, reason: reason) }
    }

    private func returnToDraft(_ item: StaffInboxItem) async {
        await act(on: item) { try await app.client.returnSocialPostToDraft(id: item.id) }
    }

    private func act(on item: StaffInboxItem, _ call: () async throws -> StaffSocialPost) async {
        busyRow = item.listID
        rowError = nil
        defer { busyRow = nil }
        do {
            _ = try await call()
            for list in lists.values { list.remove(item) }
            await lists[.scheduled]?.reload()
            await app.refreshUnread()
        } catch {
            if !app.handle(error) {
                rowError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }
}

/// Tweet proposal row: avatar, name and label, the tweet, then one line
/// that depends on the tab (linked article, failure, publish time, reason).
private struct SocialRow: View {
    let item: StaffInboxItem
    let section: DeskSocialSection

    private var status: StaffSocialStatus { StaffSocialStatus(rawValue: item.status) ?? .unknown }

    var body: some View {
        HStack(alignment: .top, spacing: DeskLayout.space12) {
            SenderAvatar(name: item.sender.name, kind: item.sender.kind)
            VStack(alignment: .leading, spacing: DeskLayout.space4) {
                HStack(spacing: 6) {
                    if item.hasUnread {
                        Circle().fill(DeskInk.action).frame(width: 8, height: 8)
                            .accessibilityHidden(true)
                    }
                    Text(item.sender.name)
                        .deskText(DeskType.metaEmphasis)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .lineLimit(1)
                    SenderKindTag(kind: item.sender.kind)
                    Spacer(minLength: DeskLayout.space4)
                    LTRText(text: trailingTime, role: DeskType.timestamp, color: DeskTheme.textSecondary)
                }
                Text(item.previewText?.isEmpty == false ? item.previewText! : item.title)
                    .deskText(DeskType.excerpt)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .lineLimit(3)
                footer
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint(item.hasUnread ? "جديد" : "")
    }

    private var trailingTime: String {
        switch section {
        case .pending: return RiyadhTime.ago(item.createdAt)
        case .published: return RiyadhTime.shortString(item.publishedAt ?? item.updatedAt)
        case .scheduled: return item.scheduledAt.map { RiyadhTime.timeString($0) } ?? ""
        case .rejected: return RiyadhTime.shortString(item.updatedAt)
        }
    }

    @ViewBuilder
    private var footer: some View {
        switch section {
        case .pending where status == .failed:
            Text(item.lastError.map { "فشلت المحاولة السابقة: \($0)" } ?? "فشلت المحاولة السابقة · أعد النشر")
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(DeskTheme.danger)
                .lineLimit(2)
        case .pending where status == .processing:
            Text("قيد النشر الآن…")
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(DeskInk.link)
        case .rejected:
            Text(item.lastError.map { "السبب: \($0)" } ?? "رُفض دون ذكر سبب")
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(DeskTheme.danger)
                .lineLimit(2)
        default:
            if let title = item.article?.title, !title.isEmpty, title != item.previewText {
                Text("مرتبط بـ «\(title)»")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textTertiary)
                    .lineLimit(1)
            }
        }
    }
}

/// Scheduled timeline row: big Riyadh time and countdown on a rail, then
/// who sent it and the tweet.
private struct TimelineRow: View {
    let item: StaffInboxItem
    let isFirst: Bool
    let isLast: Bool

    private static let timeRole = DeskTextRole(size: 22, weight: .bold, style: .title2, lineSpacing: 0)

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(spacing: 2) {
                if let at = item.scheduledAt {
                    LTRText(text: RiyadhTime.timeString(at), role: Self.timeRole,
                            color: isFirst ? DeskInk.link : DeskTheme.textPrimary)
                    if let countdown = RiyadhTime.countdown(to: at) {
                        Text(countdown)
                            .deskText(DeskType.tag)
                            .foregroundStyle(isFirst ? DeskInk.link : DeskTheme.textSecondary)
                    }
                }
                if !isLast {
                    Rectangle()
                        .fill(DeskTheme.outline)
                        .frame(width: 2)
                        .frame(maxHeight: .infinity)
                        .padding(.top, 6)
                }
            }
            .frame(width: 66)
            VStack(alignment: .leading, spacing: DeskLayout.space4) {
                HStack(spacing: 6) {
                    Text(item.sender.name)
                        .deskText(DeskType.metaEmphasis)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .lineLimit(1)
                    SenderKindTag(kind: item.sender.kind)
                }
                Text(item.previewText?.isEmpty == false ? item.previewText! : item.title)
                    .deskText(DeskType.excerpt)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .lineLimit(3)
            }
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .bottom) {
                if !isLast { Rectangle().fill(DeskInk.hairline).frame(height: 1) }
            }
        }
        .padding(.top, 4)
        .accessibilityElement(children: .combine)
    }
}

#if DEBUG
#Preview("المكتب") {
    DeskView(openAccount: {})
        .deskPreviewEnvironment()
}
#endif
