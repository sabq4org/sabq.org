import Observation
import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// «الأخبار» (approved mockup 2026-10-31, phase 1 of the web↔iOS plan): what
/// waits for the supervisor's decision — reporter news sent from the app or the
/// web, news that arrived by email, and edit requests on published news. Urgent
/// first, then the oldest waiting. A card opens the preview or the request.
struct NewsView: View {
    @Environment(AppModel.self) private var app
    let openAccount: () -> Void

    @State private var model: NewsModel?
    @State private var filter: StaffNewsFilter = .all
    @State private var previewTarget: NewsTarget?
    @State private var requestTarget: NewsTarget?
    @State private var scheduleTarget: StaffNewsDraft?
    @State private var returnTarget: StaffNewsDraft?
    @State private var rowError: String?
    @State private var busyID: String?
    @State private var success: String?

    /// Identifiable id for `.sheet(item:)`.
    struct NewsTarget: Identifiable, Hashable {
        let id: String
        var title: String = ""
    }

    private var board: StaffNewsBoard? { model?.board }

    var body: some View {
        NavigationStack {
            List {
                header
                    .listRowInsets(EdgeInsets(top: DeskLayout.space8, leading: 0, bottom: DeskLayout.space8, trailing: 0))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                content
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(DeskTheme.background)
            .contentMargins(.bottom, DeskLayout.tabBarClearance, for: .scrollContent)
            .refreshable { await reload() }
            .task(id: filter) { await reload() }
            .toolbar(.hidden, for: .navigationBar)
        }
        .onAppear {
            makeModelIfNeeded()
            consumePendingLink()
        }
        .onChange(of: app.pendingLink) { _, _ in consumePendingLink() }
        .sheet(item: $previewTarget, onDismiss: { Task { await reload() } }) { target in
            NewsPreviewSheet(articleID: target.id, fallbackTitle: target.title) { message in
                success = message
            }
        }
        .sheet(item: $requestTarget, onDismiss: { Task { await reload() } }) { target in
            EditRequestReviewSheet(requestID: target.id, fallbackTitle: target.title) { message in
                success = message
            }
        }
        .sheet(item: $scheduleTarget) { draft in
            ScheduleSheet(initial: nil, title: "موعد الخبر",
                          prompt: "متى يُنشر خبر \(draft.reporterName ?? "المراسل")؟ الأوقات بتوقيت الرياض مهما كان توقيت جهازك.") { date in
                Task { await schedule(draft, at: date) }
            }
        }
        .sheet(item: $returnTarget) { draft in
            NewsNoteSheet(title: "إعادة الخبر للمراسل",
                          header: "ملاحظتك إلى \(draft.reporterName ?? "المراسل")",
                          footer: "الملاحظة مطلوبة وتصل إلى المراسل مع إشعار وبريد. يعود الخبر إلى مسوداته ليعدّله ويرسله من جديد.",
                          placeholder: "ما الذي يحتاج تعديلًا؟",
                          confirm: "أعده للمراسل",
                          limit: 2000) { note in
                Task { await returnToReporter(draft, note: note) }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            DeskScreenHeader(title: "الأخبار", subtitle: RiyadhTime.dayTitle(Date())) {
                HStack(spacing: 10) {
                    // The bell lives on «المكتب» when it is shown.
                    if !app.capabilities.canSocial.view { DeskBellButton() }
                    if app.capabilities.accountInHeader, let me = app.me {
                        Button(action: openAccount) {
                            AccountAvatar(name: me.displayName, imageURL: me.profileImageUrl, size: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("حسابي")
                    }
                }
            }
            .padding(.horizontal, DeskLayout.pageMargin + 4)

            Group {
                if let board, board.counts.all > 0 {
                    DeskSummaryCard(systemImage: "doc.text", label: "بانتظار قرارك",
                                    value: "\(board.counts.all)",
                                    detail: board.breakdown,
                                    note: board.oldestAt == nil ? nil : "أقدمها منذ",
                                    noteValue: board.oldestAt.map { NewsCopy.waitedFor($0) })
                } else if model?.hasLoaded == true {
                    DeskCalmHero(title: "لا أخبار بانتظارك", detail: "ما يرسله المراسلون والبريد يظهر هنا فور وصوله.")
                }
            }
            .padding(.horizontal, DeskLayout.pageMargin + 4)

            SectionChipBar(sections: visibleFilters, selection: $filter,
                           title: \.title,
                           count: { board?.counts.count(for: $0) ?? 0 })

            if let success {
                Label(success, systemImage: "checkmark.circle.fill")
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskTone.success.ink)
                    .padding(.horizontal, DeskLayout.pageMargin + 4)
            }
            if let text = rowError ?? model?.errorMessage {
                ErrorLine(message: text)
                    .padding(.horizontal, DeskLayout.pageMargin + 4)
            }
        }
    }

    /// «طلبات تعديل» hides until the server's table exists (SQL not run yet).
    private var visibleFilters: [StaffNewsFilter] {
        StaffNewsFilter.allCases.filter { $0 != .editRequests || board?.editRequestsReady != false }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        let items = board?.items ?? []
        if items.isEmpty {
            Group {
                if model?.hasLoaded != true {
                    HStack { Spacer(); ProgressView(); Spacer() }
                        .padding(.vertical, DeskLayout.space32)
                } else if model?.errorMessage == nil, (board?.counts.all ?? 0) > 0 {
                    DeskEmptyState(title: "لا شيء هنا", message: "جرّب «الكل» لترى كل ما ينتظرك.")
                }
            }
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
        } else {
            ForEach(items) { item in
                row(item)
            }
            if items.contains(where: { if case .draft = $0 { return true } else { return false } }) {
                Text("اسحب بطاقة الخبر لجدولته أو إعادته إلى المراسل دون فتحه")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textTertiary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, DeskLayout.space12)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
        }
    }

    @ViewBuilder
    private func row(_ item: StaffNewsItem) -> some View {
        switch item {
        case .draft(let draft):
            Button { previewTarget = NewsTarget(id: draft.articleId, title: draft.title) } label: {
                NewsDraftCard(draft: draft)
            }
            .buttonStyle(.plain)
            .modifier(NewsRowChrome())
            .disabled(busyID == draft.id)
            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                Button("جدولة") { scheduleTarget = draft }
                    .tint(DeskInk.link)
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button("أعده") { returnTarget = draft }
                    .tint(DeskTheme.warning)
            }
        case .editRequest(let request):
            Button { requestTarget = NewsTarget(id: request.id, title: request.title) } label: {
                EditRequestCard(request: request)
            }
            .buttonStyle(.plain)
            .modifier(NewsRowChrome())
        case .unknown:
            EmptyView()
        }
    }

    // MARK: - Actions

    private func makeModelIfNeeded() {
        guard model == nil else { return }
        model = NewsModel(client: app.client) { [app] error in app.handle(error) }
    }

    private func reload() async {
        makeModelIfNeeded()
        await model?.reload(filter: filter)
        if let count = model?.board?.counts.all { app.setNewsPending(count) }
    }

    private func consumePendingLink() {
        guard app.capabilities.canNews else { return }
        switch app.pendingLink {
        case .news(let id)?:
            app.pendingLink = nil
            previewTarget = NewsTarget(id: id)
        case .editRequest(let id)?:
            app.pendingLink = nil
            requestTarget = NewsTarget(id: id)
        default:
            break
        }
    }

    private func run(_ draft: StaffNewsDraft, done: String, _ call: () async throws -> Void) async {
        busyID = draft.id
        rowError = nil
        success = nil
        defer { busyID = nil }
        do {
            try await call()
            success = done
            await reload()
        } catch {
            if !app.handle(error) {
                rowError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    /// From the list there is no preview open, so no version guard: the
    /// server still refuses when a colleague holds the edit lock.
    private func schedule(_ draft: StaffNewsDraft, at date: Date) async {
        await run(draft, done: "جُدول الخبر \(RiyadhTime.displayString(date))") {
            _ = try await app.client.scheduleNews(id: draft.articleId, at: date, expectedUpdatedAt: nil)
        }
    }

    private func returnToReporter(_ draft: StaffNewsDraft, note: String) async {
        await run(draft, done: "أُعيد الخبر إلى \(draft.reporterName ?? "المراسل")") {
            _ = try await app.client.returnNewsToReporter(id: draft.articleId, note: note)
        }
    }
}

// MARK: - Model

@Observable
final class NewsModel {
    private(set) var board: StaffNewsBoard?
    private(set) var hasLoaded = false
    private(set) var errorMessage: String?

    private let client: StaffAPIClient
    private let onError: (Error) -> Bool

    init(client: StaffAPIClient, onError: @escaping (Error) -> Bool) {
        self.client = client
        self.onError = onError
    }

    func reload(filter: StaffNewsFilter) async {
        do {
            board = try await client.newsBoard(filter: filter)
            errorMessage = nil
        } catch {
            if !onError(error) {
                errorMessage = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
        hasLoaded = true
    }
}

// MARK: - Copy

enum NewsCopy {
    /// «18 د», «3 س», «يومين» for the summary's «أقدمها منذ».
    static func waitedFor(_ date: Date, now: Date = Date()) -> String {
        let minutes = max(0, Int(now.timeIntervalSince(date) / 60))
        if minutes < 60 { return "\(max(minutes, 1)) د" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours) س" }
        let days = hours / 24
        return days == 1 ? "يوم" : (days == 2 ? "يومين" : "\(days) أيام")
    }

    /// «منذ 4 د» on a card.
    static func since(_ date: Date, now: Date = Date()) -> String {
        "منذ \(waitedFor(date, now: now))"
    }
}

// MARK: - Cards

private struct NewsRowChrome: ViewModifier {
    func body(content: Content) -> some View {
        content
            .listRowInsets(EdgeInsets(top: 6, leading: DeskLayout.pageMargin + 4, bottom: 6, trailing: DeskLayout.pageMargin + 4))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}

/// A small coloured label at the top of a card («عاجل من المراسل»).
private struct NewsKindLabel: View {
    let text: String
    let tone: DeskTone

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(tone.ink).frame(width: 7, height: 7)
            Text(text)
        }
        .deskText(DeskType.tag)
        .foregroundStyle(tone.ink)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(tone.fill, in: Capsule())
    }
}

struct NewsDraftCard: View {
    let draft: StaffNewsDraft

    private var kind: (text: String, tone: DeskTone) {
        if draft.isBreaking { return ("عاجل من المراسل", .danger) }
        if draft.channel == .email { return ("من البريد", .warning) }
        return ("خبر من مراسل", .info)
    }

    var body: some View {
        HStack(alignment: .top, spacing: DeskLayout.space12) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: DeskLayout.space8) {
                    NewsKindLabel(text: kind.text, tone: kind.tone)
                    Text(NewsCopy.since(draft.submittedAt))
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textTertiary)
                    Spacer(minLength: 0)
                    if let category = draft.categoryName, !category.isEmpty {
                        Text(category)
                            .deskText(DeskType.tag)
                            .foregroundStyle(DeskInk.link)
                            .lineLimit(1)
                    }
                }
                Text(draft.title)
                    .deskText(DeskRowType.subjectStrong)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Text([draft.reporterName, draft.channel.title].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: " · "))
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .lineLimit(1)
                if let lockedBy = draft.lockedBy {
                    QuietLine(systemImage: "lock", text: "مفتوح للتحرير عند \(lockedBy)")
                }
            }
            if let url = draft.thumbnailURL {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        DeskTheme.surfaceMuted
                    }
                }
                .frame(width: 76, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(alignment: .bottomLeading) {
                    if draft.albumCount > 0 {
                        Text(verbatim: "+\(draft.albumCount)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(Color.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.black.opacity(0.5), in: Capsule())
                            .padding(5)
                    }
                }
                .accessibilityHidden(true)
            }
        }
        .deskRowCard(padding: 14)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("يفتح استعراض الخبر")
    }
}

struct EditRequestCard: View {
    let request: StaffNewsEditRequest

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: DeskLayout.space8) {
                NewsKindLabel(text: request.urgent ? "طلب تعديل عاجل" : "طلب تعديل", tone: request.urgent ? .danger : .warning)
                Text("\(request.onWhat) · \(NewsCopy.since(request.submittedAt))")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textTertiary)
                    .lineLimit(1)
            }
            Text(request.title)
                .deskText(DeskRowType.subjectStrong)
                .foregroundStyle(DeskTheme.textPrimary)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            Text(request.requesterName)
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textSecondary)
            if !request.fields.isEmpty {
                HStack(spacing: 6) {
                    ForEach(request.fields.filter { $0 != .unknown }) { field in
                        Text(field.tag)
                            .deskText(DeskType.tag)
                            .foregroundStyle(DeskTheme.textPrimary)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 4)
                            .background(DeskInk.chip, in: Capsule())
                    }
                }
            } else if let note = request.note, !note.isEmpty {
                Text("«\(note)»")
                    .deskText(DeskType.excerpt)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .lineLimit(2)
            }
            HStack {
                Spacer(minLength: 0)
                Text("راجع الطلب")
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskInk.link)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 34)
                    .background(DeskInk.soft, in: Capsule())
            }
        }
        .deskRowCard(padding: 14)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("يفتح مراجعة طلب التعديل")
    }
}

/// A required note (return to reporter, reject an edit request).
struct NewsNoteSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let header: String
    let footer: String
    let placeholder: String
    let confirm: String
    var destructive = false
    let limit: Int
    let onConfirm: (String) -> Void

    @State private var note = ""

    private var trimmed: String { note.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(placeholder, text: $note, axis: .vertical)
                        .lineLimit(4...10)
                        .deskText(DeskType.excerpt)
                        .onChange(of: note) { _, value in
                            if value.count > limit { note = String(value.prefix(limit)) }
                        }
                } header: {
                    Text(header)
                } footer: {
                    Text(footer)
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                }

                Section {
                    Button(confirm) {
                        onConfirm(trimmed)
                        dismiss()
                    }
                    .buttonStyle(DeskPrimaryButtonStyle())
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .disabled(trimmed.count < 3)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

#if DEBUG
#Preview("الأخبار") {
    NewsView(openAccount: {})
        .deskPreviewEnvironment()
}
#endif
