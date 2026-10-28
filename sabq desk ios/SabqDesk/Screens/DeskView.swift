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
    /// A day picked on the week strip; the scheduled timeline shows only it.
    @State private var selectedDay: Date?

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
            .contentMargins(.bottom, DeskLayout.tabBarClearance, for: .scrollContent)
            .refreshable {
                await model?.reload()
                await app.refreshUnread()
            }
            .task(id: section) {
                makeListsIfNeeded()
                await model?.reload()
                if section != .scheduled { await lists[.scheduled]?.reload() }
                if section == .scheduled, selectedDay != nil { await model?.loadAll() }
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
        .onChange(of: selectedDay) { _, day in
            guard day != nil else { return }
            // The day filter hides rows, so every scheduled page is fetched
            // up front (here, or by the section task after its reload).
            if section == .scheduled {
                Task { await lists[.scheduled]?.loadAll() }
            } else {
                section = .scheduled
            }
        }
        .onChange(of: section) { _, newSection in
            if newSection != .scheduled { selectedDay = nil }
        }
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
        VStack(alignment: .leading, spacing: 18) {
            DeskGreetingHeader(name: app.me?.displayName, subtitle: "كل ما ينتظرك اليوم في مكان واحد") {
                if let me = app.me {
                    Button(action: openAccount) {
                        AccountAvatar(name: me.displayName, imageURL: me.profileImageUrl, size: 48)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("حسابي")
                }
            }
            .padding(.horizontal, DeskLayout.pageMargin + 4)
            DeskSummaryCard(systemImage: "tray.full", label: "بانتظارك الآن",
                            value: pendingTotal == 0 ? "لا شيء" : DeskCount.tasks(pendingTotal),
                            detail: pendingDetail,
                            note: upcoming.first == nil ? nil : "أقرب منشور",
                            noteValue: upcoming.first?.scheduledAt.map { RiyadhTime.timeString($0) })
                .padding(.horizontal, DeskLayout.pageMargin + 4)
            DeskWeekStrip(counts: weekCounts, selection: $selectedDay)
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

    private var showsMessages: Bool { app.capabilities.canTickets }

    /// Tweets waiting for a decision, plus open contributor messages when
    /// the member answers them.
    private var pendingTotal: Int {
        app.unread.social + (showsMessages ? app.unread.tickets : 0)
    }

    private var pendingDetail: String {
        var parts: [String] = []
        if app.unread.social > 0 { parts.append("\(DeskCount.tweets(app.unread.social)) بانتظار قرارك") }
        if showsMessages, app.unread.tickets > 0 { parts.append("\(DeskCount.messages(app.unread.tickets)) من المساهمين") }
        if parts.isEmpty { return "أنجزت كل شيء، وما يصل يظهر هنا." }
        return parts.joined(separator: " · ")
    }

    /// Scheduled posts per Riyadh day, for the week strip.
    private var weekCounts: [Date: Int] {
        Dictionary(grouping: upcoming.compactMap(\.scheduledAt), by: RiyadhTime.dayKey).mapValues(\.count)
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
        return Button { path.append(.social(id: item.id)) } label: {
            SocialRow(item: item, section: section)
        }
        .buttonStyle(.plain)
        .listRowInsets(EdgeInsets(top: 5, leading: DeskLayout.pageMargin + 4, bottom: 5, trailing: DeskLayout.pageMargin + 4))
        .listRowSeparator(.hidden)
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
        let shown = selectedDay.map { day in upcoming.filter { RiyadhTime.dayKey($0.scheduledAt ?? $0.updatedAt) == day } } ?? upcoming
        if let selectedDay, shown.isEmpty {
            DeskEmptyState(title: "لا منشورات مجدولة في هذا اليوم",
                           message: "\(RiyadhTime.dayTitle(selectedDay)). اضغط اليوم مرة أخرى لعرض كل الأيام.")
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        }
        let groups = Dictionary(grouping: shown) { RiyadhTime.dayKey($0.scheduledAt ?? $0.updatedAt) }
            .map { DayGroup(id: $0.key, items: $0.value) }
            .sorted { $0.id < $1.id }
        ForEach(groups) { group in
            Section {
                ForEach(Array(group.items.enumerated()), id: \.element.listID) { index, item in
                    NavigationLink(value: DeskDeepLink.social(id: item.id)) {
                        TimelineRow(item: item, isFirst: index == 0 && group.id == groups.first?.id)
                    }
                    .listRowInsets(EdgeInsets(top: 5, leading: DeskLayout.pageMargin + 4, bottom: 5, trailing: DeskLayout.pageMargin + 4))
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

    private func reject(_ item: StaffInboxItem, reason: String) async {
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
/// Each row sits on its own white rounded card.
private struct SocialRow: View {
    let item: StaffInboxItem
    let section: DeskSocialSection

    private var status: StaffSocialStatus { StaffSocialStatus(rawValue: item.status) ?? .unknown }

    private var badge: RailAvatar.Badge? {
        guard section == .rejected else { return nil }
        return item.rejectionNote == .withdrawn ? .withdrawn : .rejected
    }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            RailAvatar(name: item.sender.name, kind: item.sender.kind, imageURL: item.sender.avatarUrl, badge: badge)
            VStack(alignment: .leading, spacing: DeskLayout.space4) {
                HStack(spacing: 6) {
                    if item.hasUnread {
                        Circle().fill(DeskInk.action).frame(width: 8, height: 8)
                            .accessibilityHidden(true)
                    }
                    Text(item.sender.name)
                        .deskText(DeskRowType.nameRead)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .lineLimit(1)
                    SenderKindLabel(kind: item.sender.kind)
                    Spacer(minLength: DeskLayout.space4)
                    trailingTime
                }
                Text(item.listPreview)
                    .deskText(DeskRowType.tweet)
                    // Not published: a step lighter, so the reason under it leads.
                    .foregroundStyle(section == .rejected ? DeskTheme.textSecondary : DeskTheme.textPrimary)
                    .lineLimit(2)
                footer
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .deskRowCard()
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint(item.hasUnread ? "جديد" : "")
    }

    /// «قبل 12 د» and «11 أكتوبر» are Arabic phrases and keep the RTL order;
    /// only a bare HH:mm is isolated left-to-right.
    @ViewBuilder
    private var trailingTime: some View {
        switch section {
        case .scheduled:
            if let at = item.scheduledAt {
                LTRText(text: RiyadhTime.timeString(at), role: DeskType.timestamp, color: DeskTheme.textSecondary)
            }
        case .pending:
            timeText(RiyadhTime.ago(item.createdAt))
        case .published:
            timeText(RiyadhTime.shortString(item.publishedAt ?? item.updatedAt))
        case .rejected:
            timeText(RiyadhTime.shortString(item.updatedAt))
        }
    }

    private func timeText(_ text: String) -> some View {
        Text(verbatim: text)
            .deskText(DeskType.timestamp)
            .foregroundStyle(DeskTheme.textSecondary)
            .lineLimit(1)
            .fixedSize()
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
            switch item.rejectionNote {
            case .reason(let reason):
                RejectionReasonBubble(reason: reason)
                    .padding(.top, 6)
            case .withdrawn:
                QuietLine(systemImage: "arrow.uturn.backward", text: DeskRejectionNote.withdrawn.listText)
                    .padding(.top, 2)
            case .noReason:
                QuietLine(systemImage: "minus.circle", text: DeskRejectionNote.noReason.listText)
                    .padding(.top, 2)
            }
        default:
            if let title = item.linkedArticleTitle {
                HStack(spacing: DeskLayout.space4) {
                    Image(systemName: "link").imageScale(.small)
                    Text(title).lineLimit(1)
                }
                .deskText(DeskType.meta)
                .foregroundStyle(DeskInk.link)
                .padding(.top, 2)
                .accessibilityLabel("مرتبط بـ «\(title)»")
            }
        }
    }
}

/// «سبب الرفض» and the editor's reason on a light red bubble.
private struct RejectionReasonBubble: View {
    let reason: String

    var body: some View {
        HStack(alignment: .top, spacing: DeskLayout.space8) {
            Image(systemName: "xmark.circle.fill")
                .imageScale(.small)
                .foregroundStyle(DeskTheme.danger)
                .padding(.top, 2)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text("سبب الرفض")
                    .deskText(DeskType.tag)
                    .foregroundStyle(DeskTheme.danger)
                Text(reason)
                    .deskText(DeskRowType.preview)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .lineLimit(3)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, DeskLayout.space12)
        .padding(.vertical, 10)
        .background(DeskTone.danger.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// Scheduled timeline row on a card: big Riyadh time and countdown, then
/// who sent it and the tweet. The next post due leads in blue.
private struct TimelineRow: View {
    let item: StaffInboxItem
    let isFirst: Bool

    private static let timeRole = DeskType.timelineTime

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
            }
            .frame(width: 66)
            .padding(.vertical, 6)
            .background(isFirst ? DeskInk.soft : DeskTheme.background,
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: DeskLayout.space4) {
                HStack(spacing: 6) {
                    Text(item.sender.name)
                        .deskText(DeskRowType.nameRead)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .lineLimit(1)
                    SenderKindTag(kind: item.sender.kind)
                }
                Text(item.listPreview)
                    .deskText(DeskRowType.preview)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .deskRowCard(padding: 12)
        .accessibilityElement(children: .combine)
    }
}

#if DEBUG
#Preview("المكتب") {
    DeskView(openAccount: {})
        .deskPreviewEnvironment()
}
#endif
