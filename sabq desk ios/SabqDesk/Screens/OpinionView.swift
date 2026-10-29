import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// «الرأي» (approved concept C, 2026-10-28): the week first — a strip of seven
/// Riyadh days with a dot per slot state — then the material that arrived:
/// drafts waiting for the desk first, then scheduled, published last
/// (owner feedback 2026-10-28: empty «لم تصل بعد» slots are not shown).
struct OpinionView: View {
    @Environment(AppModel.self) private var app
    @Environment(AppLockController.self) private var appLock
    let openAccount: () -> Void

    @State private var model: OpinionModel?
    @State private var selectedDay: String?
    @State private var highlighted: String?
    @State private var focusID: String?
    @State private var busyID: String?
    @State private var errorText: String?
    @State private var notice: String?
    @State private var success: PrepSuccess?
    /// «جهّز وجدول» jobs in flight or just finished, by article id.
    @State private var prepJobs: [String: StaffOpinionPrepJob] = [:]

    @State private var publishTarget: StaffOpinionItem?
    @State private var returnTarget: StaffOpinionItem?
    @State private var scheduleTarget: StaffOpinionItem?
    @State private var previewTarget: StaffOpinionItem?
    @State private var pendingSchedule: PendingSchedule?

    /// A schedule waiting for «جدول رغم ذلك» after a clash warning.
    struct PendingSchedule: Identifiable {
        let id = UUID()
        let item: StaffOpinionItem
        let target: StaffOpinionScheduleTarget
        let warnings: [StaffOpinionWarning]
    }

    private var caps: StaffCapabilities.Opinion { app.capabilities.canOpinion }
    private var board: StaffOpinionBoard? { model?.board }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0, pinnedViews: []) {
                        header
                        content
                    }
                    .padding(.bottom, DeskLayout.space24)
                }
                .scrollContentBackground(.hidden)
                .background(DeskTheme.background)
                .contentMargins(.bottom, DeskLayout.tabBarClearance, for: .scrollContent)
                .refreshable { await reload() }
                .onChange(of: focusID) { _, id in scroll(to: id, proxy: proxy) }
                .onChange(of: model?.board) { _, _ in scroll(to: focusID, proxy: proxy) }
                .onChange(of: model?.linked) { _, _ in scroll(to: focusID, proxy: proxy) }
                .onChange(of: selectedDay) { _, day in
                    guard let day, let first = board.map(sections)?.flatMap(\.items)
                        .first(where: { $0.slotAt.map(RiyadhTime.dayString) == day }) else { return }
                    withAnimation { proxy.scrollTo(first.id, anchor: .top) }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .task {
            makeModelIfNeeded()
            await reload()
        }
        .onAppear {
            makeModelIfNeeded()
            consumePendingLink()
        }
        .onChange(of: app.pendingLink) { _, _ in consumePendingLink() }
        .confirmationDialog(publishTarget.map { "نشر «\($0.article?.title ?? "")» الآن؟" } ?? "",
                            isPresented: Binding(get: { publishTarget != nil }, set: { if !$0 { publishTarget = nil } }),
                            titleVisibility: .visible,
                            presenting: publishTarget) { item in
            Button("انشر الآن") { Task { await publish(item) } }
            Button("إلغاء", role: .cancel) {}
        } message: { _ in
            Text("يُنشر المقال فورًا على سبق بعد التحقق بـ Face ID.")
        }
        .alert(pendingSchedule?.warnings.first?.displayText ?? "تنبيه",
               isPresented: Binding(get: { pendingSchedule != nil }, set: { if !$0 { pendingSchedule = nil } }),
               presenting: pendingSchedule) { pending in
            Button("جدول رغم ذلك") { Task { await schedule(pending.item, pending.target, checked: true) } }
            Button("إلغاء", role: .cancel) {}
        } message: { pending in
            Text(pending.warnings.count > 1
                 ? pending.warnings.map(\.displayText).joined(separator: "\n")
                 : "يمكنك الجدولة في الموعد نفسه أو اختيار موعد آخر.")
        }
        .sheet(item: $returnTarget) { item in
            ReturnToWriterSheet(writerName: item.writer.name) { note in
                Task { await returnToWriter(item, note: note) }
            }
        }
        .sheet(item: $previewTarget) { item in
            if let article = item.article {
                OpinionPreviewSheet(articleID: article.id, writerName: item.writer.name, fallbackTitle: article.title,
                                    opensLivePage: article.status == .published)
            }
        }
        .sheet(item: $scheduleTarget) { item in
            ScheduleSheet(initial: item.article?.scheduledAt ?? item.slotAt,
                          title: "موعد مقال الرأي",
                          prompt: "متى يُنشر مقال \(item.writer.name)؟ الأوقات بتوقيت الرياض مهما كان توقيت جهازك.") { date in
                Task { await schedule(item, .at(date), checked: false) }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space12) {
            DeskScreenHeader(title: "الرأي", subtitle: "مقالات الرأي", detail: weekTitle) {
                HStack(spacing: 6) {
                    // The bell lives here only when «المكتب» (which carries it) is hidden.
                    if !app.capabilities.canSocial.view { DeskBellButton() }
                    if counts.pending > 0 {
                        CountPill(text: "\(counts.pending) بانتظارك", tone: .warning)
                    }
                    if counts.scheduled > 0 {
                        CountPill(text: "\(counts.scheduled) مجدولة", tone: .success)
                    }
                }
            }
            .padding(.horizontal, DeskLayout.pageMargin + 4)
            if let days = board?.days, !days.isEmpty {
                OpinionWeekStrip(days: days, today: RiyadhTime.dayString(Date()),
                                 selection: Binding(get: { selectedDay ?? days.first?.date }, set: { selectedDay = $0 }))
                OpinionLegend()
                    .padding(.horizontal, DeskLayout.pageMargin + 6)
            }
            if let text = errorText ?? model?.errorMessage {
                ErrorLine(message: text)
                    .padding(.horizontal, DeskLayout.pageMargin + 4)
            }
            if let success {
                PrepSuccessLabel(success: success)
                    .padding(.horizontal, DeskLayout.pageMargin + 4)
            }
            if let notice {
                Label(notice, systemImage: "exclamationmark.triangle")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTone.warning.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, DeskLayout.pageMargin + 4)
            }
        }
        .padding(.top, DeskLayout.space8)
    }

    /// Header pills: drafts waiting for the desk and articles already scheduled.
    private var counts: (pending: Int, scheduled: Int) {
        let items = board?.allItems.compactMap(\.article) ?? []
        return (items.filter { $0.status.isPending }.count, items.filter { $0.status == .scheduled }.count)
    }

    private var weekTitle: String {
        if let start = board?.days.first?.start { return RiyadhTime.weekTitle(from: start) }
        return RiyadhTime.weekTitle(from: RiyadhTime.dayKey(Date()))
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if let board {
            if let linked = model?.linked {
                dayHeader("من الإشعار", anchor: nil)
                timelineRow(linked, isFirst: false, unslotted: linked.slotAt == nil)
            }
            if board.hasNoDrafts {
                DeskInlineEmpty(systemImage: "tray",
                                title: "لا مسودات بانتظارك هذا الأسبوع",
                                message: "كل مسودة تظهر هنا في خانة موعد كاتبها فور وصولها")
                    .padding(.horizontal, DeskLayout.pageMargin + 4)
                    .padding(.top, DeskLayout.space12)
            }
            ForEach(sections(board), id: \.title) { section in
                dayHeader(section.title, anchor: section.anchor)
                ForEach(section.items) { item in
                    timelineRow(item,
                                isFirst: false,
                                unslotted: item.slotAt == nil)
                }
            }
            if sections(board).isEmpty, !board.hasNoDrafts {
                DeskEmptyState(title: "لا مقالات هذا الأسبوع", message: "تظهر هنا مقالات الرأي فور وصولها.")
            }
        } else if model?.isLoading ?? true {
            HStack { Spacer(); ProgressView(); Spacer() }
                .padding(.vertical, DeskLayout.space32)
        }
    }

    private struct Section {
        let title: String
        let anchor: String
        let items: [StaffOpinionItem]
    }

    /// المسودات بانتظارك أولاً، ثم المجدول، والمنشور أسفل القائمة. الخانات
    /// التي لم تصل مسودتها لا تُعرض (الخادم لا يرسلها، والنسخ الأقدم تُرشَّح هنا).
    private func sections(_ board: StaffOpinionBoard) -> [Section] {
        let arrived = board.allItems.filter { $0.article != nil }
        let bySlot: (StaffOpinionItem, StaffOpinionItem) -> Bool = {
            ($0.slotAt ?? .distantFuture) < ($1.slotAt ?? .distantFuture)
        }
        let pending = arrived.filter { $0.article?.status.isPending == true }.sorted(by: bySlot)
        let scheduled = arrived.filter { $0.article?.status == .scheduled }.sorted(by: bySlot)
        let published = arrived.filter { $0.article?.status == .published }.sorted(by: bySlot)
        return [
            Section(title: "بانتظارك", anchor: "pending", items: pending),
            Section(title: "مجدولة", anchor: "scheduled", items: scheduled),
            Section(title: "نُشرت", anchor: "published", items: published),
        ].filter { !$0.items.isEmpty }
    }

    private func dayHeader(_ title: String, anchor: String?) -> some View {
        HStack(spacing: DeskLayout.space8) {
            Text(title)
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(DeskTheme.textSecondary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, DeskLayout.pageMargin + 4)
        .padding(.top, DeskLayout.space16)
        .padding(.bottom, 6)
        .id(anchor ?? "linked")
    }

    private func timelineRow(_ item: StaffOpinionItem, isFirst: Bool, unslotted: Bool) -> some View {
        HStack(alignment: .top, spacing: DeskLayout.space12) {
            OpinionTimeColumn(date: unslotted ? nil : item.slotAt, isFirst: isFirst)
            OpinionCard(item: item,
                        caps: caps,
                        isUnslotted: unslotted,
                        isHighlighted: highlighted == item.id,
                        isBusy: busyID == item.id,
                        prepJob: item.article.flatMap { prepJobs[$0.id] },
                        actions: actions(for: item))
                .padding(.bottom, DeskLayout.space12)
        }
        .padding(.horizontal, DeskLayout.pageMargin + 4)
        .id(item.id)
    }

    private func actions(for item: StaffOpinionItem) -> OpinionCard.Actions {
        OpinionCard.Actions(
            prepare: { Task { await prepare(item) } },
            publish: { publishTarget = item },
            scheduleFixed: { Task { await schedule(item, .fixedSlot, checked: false) } },
            changeTime: { scheduleTarget = item },
            preview: { previewTarget = item },
            returnToWriter: { returnTarget = item })
    }

    // MARK: - Focus

    private func makeModelIfNeeded() {
        guard model == nil else { return }
        model = OpinionModel(client: app.client) { [app] error in app.handle(error) }
    }

    private func consumePendingLink() {
        guard case .opinion(let id)? = app.pendingLink, caps.view else { return }
        app.pendingLink = nil
        focusID = id
        Task {
            if model?.board == nil { await reload() }
            await model?.ensureVisible(articleID: id)
        }
    }

    private func scroll(to id: String?, proxy: ScrollViewProxy) {
        guard let id, board?.item(articleID: id) != nil || model?.linked?.id == id else { return }
        focusID = nil
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(250))
            withAnimation(.easeInOut) { proxy.scrollTo(id, anchor: .center) }
            withAnimation { highlighted = id }
            try? await Task.sleep(for: .seconds(2))
            withAnimation { if highlighted == id { highlighted = nil } }
        }
    }

    // MARK: - Actions

    private func reload() async {
        makeModelIfNeeded()
        await model?.reload()
        if let count = model?.board?.pendingCount { app.setOpinionPending(count) }
    }

    private func run(_ item: StaffOpinionItem, _ call: () async throws -> Void) async {
        busyID = item.id
        errorText = nil
        defer { busyID = nil }
        do {
            try await call()
            await reload()
        } catch {
            if !app.handle(error) {
                errorText = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    /// Starts «جهّز وجدول» on the server, then follows it until it finishes.
    /// Leaving the screen is fine: the server keeps going and pushes the result.
    private func prepare(_ item: StaffOpinionItem) async {
        guard OpinionFeatureFlags.autoPrepEnabled, let id = item.article?.id else { return }
        if prepJobs[id]?.status == .running { return }
        errorText = nil
        notice = nil
        success = nil
        busyID = item.id
        do {
            let job = try await app.client.prepareOpinion(id: id)
            busyID = nil
            prepJobs[id] = job
            await follow(id: id, title: item.article?.title ?? "")
        } catch {
            busyID = nil
            if !app.handle(error) {
                errorText = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    private func follow(id: String, title: String) async {
        // Image generation alone can take ~2.5 minutes; give up polling after 10.
        for _ in 0..<150 {
            guard let job = prepJobs[id], !job.isFinished else { break }
            try? await Task.sleep(for: .seconds(4))
            if Task.isCancelled { return }
            if let fresh = try? await app.client.opinionPrepStatus(id: id) { prepJobs[id] = fresh }
        }
        guard let job = prepJobs[id], job.isFinished else { return }
        prepJobs[id] = nil
        switch job.status {
        case .done:
            var parts = ["جُهّز وجُدول"]
            if let at = job.scheduledAt { parts.append("\(RiyadhTime.shortWeekday(at)) \(RiyadhTime.timeString(at))") }
            if let category = job.categoryName { parts.append(category) }
            if job.titleChanged { parts.append("صُحّح العنوان") }
            if job.contentFixes > 0 { parts.append("\(job.contentFixes) تصحيحات") }
            if job.image == "generated" { parts.append("صورة جديدة") }
            success = PrepSuccess(headline: parts.joined(separator: " · "), title: title)
            if let message = job.message { notice = message }
        case .failed:
            errorText = job.message ?? "تعذر إكمال التجهيز"
        case .running:
            break
        }
        await reload()
    }

    /// Confirmation dialog → Face ID → publish.
    private func publish(_ item: StaffOpinionItem) async {
        guard let id = item.article?.id else { return }
        switch await appLock.confirmSensitiveAction(reason: "تأكيد نشر مقال الرأي الآن") {
        case .confirmed:
            await run(item) { _ = try await app.client.publishOpinion(id: id) }
        case .cancelled:
            break
        case .failed(let message):
            errorText = message
        }
    }

    /// Checks the slot first: a clash with another writer warns, never blocks.
    private func schedule(_ item: StaffOpinionItem, _ target: StaffOpinionScheduleTarget, checked: Bool) async {
        guard let id = item.article?.id else { return }
        notice = nil
        if !checked {
            let at: Date? = {
                switch target {
                case .fixedSlot: return item.slotAt
                case .at(let date): return date
                }
            }()
            if let at {
                do {
                    let warnings = try await app.client.opinionSlotCheck(id: id, at: at)
                    if !warnings.isEmpty {
                        pendingSchedule = PendingSchedule(item: item, target: target, warnings: warnings)
                        return
                    }
                } catch {
                    // The check is advisory; the schedule call below still validates.
                    if app.handle(error) { return }
                }
            }
        }
        await run(item) {
            let result = try await app.client.scheduleOpinion(id: id, target)
            if let first = result.warnings.first { notice = first.displayText }
        }
    }

    private func returnToWriter(_ item: StaffOpinionItem, note: String) async {
        guard let id = item.article?.id else { return }
        await run(item) { _ = try await app.client.returnOpinionToWriter(id: id, note: note) }
    }
}

/// A small coloured count in the header («2 بانتظارك»).
private struct CountPill: View {
    let text: String
    let tone: DeskTone

    var body: some View {
        Text(text)
            .deskText(DeskType.tag)
            .foregroundStyle(tone.ink)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(tone.fill, in: Capsule())
    }
}

// MARK: - Week strip

/// Seven day chips on white: the selected one filled Sabq blue, today's
/// number in link blue, and one dot per state present that day.
private struct OpinionWeekStrip: View {
    let days: [StaffOpinionDay]
    let today: String
    @Binding var selection: String?

    var body: some View {
        HStack(spacing: 6) {
            ForEach(days, id: \.date) { day in
                let isSelected = selection == day.date
                Button { selection = day.date } label: {
                    VStack(spacing: 1) {
                        Text(day.start.map(RiyadhTime.shortWeekday) ?? "")
                            .deskText(DeskType.timestamp)
                            .foregroundStyle(isSelected ? Color.white.opacity(0.85) : DeskTheme.textSecondary)
                        Text(verbatim: day.start.map(RiyadhTime.dayNumber) ?? "")
                            .font(DeskFonts.app(size: 17, weight: .bold, relativeTo: .headline))
                            .monospacedDigit()
                            .foregroundStyle(isSelected ? Color.white : (day.date == today ? DeskInk.link : DeskTheme.textPrimary))
                        OpinionDayDots(counts: day.counts)
                    }
                    .frame(maxWidth: .infinity, minHeight: 72)
                    .background(isSelected ? DeskInk.selected : DeskTheme.surface,
                                in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .shadow(color: isSelected ? DeskInk.selected.opacity(0.3) : DeskTheme.shadow,
                            radius: isSelected ? 10 : 4, y: isSelected ? 5 : 1)
                    .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
                .accessibilityLabel(accessibilityLabel(day))
            }
        }
        .padding(.horizontal, DeskLayout.pageMargin + 4)
    }

    private func accessibilityLabel(_ day: StaffOpinionDay) -> String {
        var parts = [day.start.map { RiyadhTime.dayTitle($0) } ?? day.date]
        let c = day.counts
        if c.draft > 0 { parts.append("\(c.draft) مسودة جديدة") }
        if c.prep > 0 { parts.append("\(c.prep) قيد التجهيز") }
        if c.scheduled > 0 { parts.append("\(c.scheduled) مجدول") }
        return parts.joined(separator: "، ")
    }
}

private struct OpinionDayDots: View {
    let counts: StaffOpinionDay.Counts

    var body: some View {
        HStack(spacing: 3) {
            if counts.draft > 0 { dot(OpinionStateStyle.newDraft.ink) }
            if counts.prep > 0 { dot(OpinionStateStyle.inPrep.ink) }
            if counts.scheduled > 0 { dot(OpinionStateStyle.scheduled.ink) }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }

    private func dot(_ color: Color) -> some View {
        Circle().fill(color).frame(width: 6, height: 6)
    }
}

private struct OpinionLegend: View {
    var body: some View {
        HStack(spacing: DeskLayout.space12) {
            item(OpinionStateStyle.newDraft)
            item(OpinionStateStyle.inPrep)
            item(OpinionStateStyle.scheduled)
        }
        .deskText(DeskType.timestamp)
        .foregroundStyle(DeskTheme.textSecondary)
        .accessibilityHidden(true)
    }

    private func item(_ style: OpinionStateStyle) -> some View {
        HStack(spacing: DeskLayout.space4) {
            Circle().fill(style.ink).frame(width: 7, height: 7)
            Text(style.title)
        }
    }
}

/// The four colours of the concept: amber new draft, teal in prep, blue
/// scheduled, grey not arrived yet.
private enum OpinionStateStyle {
    case newDraft, inPrep, scheduled, published, missing

    init(item: StaffOpinionItem) {
        switch item.article?.status {
        case .newDraft?: self = .newDraft
        case .inPrep?: self = .inPrep
        case .scheduled?: self = .scheduled
        case .published?: self = .published
        case .unknown?, nil: self = .missing
        }
    }

    var tone: DeskTone {
        switch self {
        case .newDraft: return .warning
        case .inPrep: return .teal
        case .scheduled: return .info
        case .published: return .success
        case .missing: return .neutral
        }
    }

    var ink: Color { tone.ink }

    var title: String {
        switch self {
        case .newDraft: return StaffOpinionStatus.newDraft.title
        case .inPrep: return StaffOpinionStatus.inPrep.title
        case .scheduled: return StaffOpinionStatus.scheduled.title
        case .published: return StaffOpinionStatus.published.title
        case .missing: return "لم تصل بعد"
        }
    }
}

// MARK: - Timeline

/// Weekday, big Riyadh time and the countdown beside each card.
private struct OpinionTimeColumn: View {
    let date: Date?
    let isFirst: Bool

    var body: some View {
        VStack(spacing: 2) {
            if let date {
                Text(RiyadhTime.shortWeekday(date))
                    .deskText(DeskType.tag)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .lineLimit(1)
                    .fixedSize()
                LTRText(text: RiyadhTime.timeString(date), role: DeskType.rowTitle,
                        color: isFirst ? DeskInk.link : DeskTheme.textPrimary)
                    .lineLimit(1)
                    .fixedSize()
                if let countdown = RiyadhTime.slotCountdown(to: date) {
                    Text(countdown)
                        .deskText(DeskType.tag)
                        .foregroundStyle(isFirst ? DeskInk.link : DeskTheme.textSecondary)
                        .lineLimit(1)
                        .fixedSize()
                }
            } else {
                Text(verbatim: "—")
                    .deskText(DeskType.rowTitle)
                    .foregroundStyle(DeskTheme.textTertiary)
            }
        }
        .padding(.top, 10)
        .frame(width: 62)
        .accessibilityElement(children: .combine)
    }
}

/// One slot: writer, state chip, title and the actions this member may take.
private struct OpinionCard: View {
    struct Actions {
        let prepare: () -> Void
        let publish: () -> Void
        let scheduleFixed: () -> Void
        let changeTime: () -> Void
        let preview: () -> Void
        let returnToWriter: () -> Void
    }

    let item: StaffOpinionItem
    let caps: StaffCapabilities.Opinion
    let isUnslotted: Bool
    let isHighlighted: Bool
    let isBusy: Bool
    let prepJob: StaffOpinionPrepJob?
    let actions: Actions

    private var isPreparing: Bool { prepJob?.status == .running }

    private var style: OpinionStateStyle { OpinionStateStyle(item: item) }
    private var status: StaffOpinionStatus? { item.article?.status }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            topLine
            if let article = item.article {
                Button(action: actions.preview) {
                    Text(article.title)
                        .font(DeskFonts.app(size: 15, weight: .semibold, relativeTo: .subheadline))
                        .lineSpacing(4)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .accessibilityHint("يفتح استعراض المقال")
                .padding(.top, DeskLayout.space8)
                .padding(.bottom, 10)
                actionArea
                Button(action: actions.preview) {
                    Label(status == .published ? "استعراض المنشور على سبق" : "استعراض المقال قبل النشر",
                          systemImage: status == .published ? "safari" : "eye")
                }
                .buttonStyle(OpinionButtonStyle(kind: .tinted))
                .padding(.top, status == .published ? 0 : 6)
                footer
            } else {
                Text(item.state == .late
                     ? "فات موعده الثابت ولم تصل مسودته."
                     : "موعده الثابت قادم ولم تصل مسودته بعد. سأذكّرك قبل الموعد بيوم.")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(background)
        .overlay {
            if isBusy { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
        }
        .disabled(isBusy)
        .animation(.easeInOut, value: isHighlighted)
    }

    // MARK: Parts

    private var topLine: some View {
        HStack(spacing: DeskLayout.space8) {
            SenderAvatar(name: item.writer.name, kind: .writer, imageURL: item.writer.avatarUrl, size: 36)
                .overlay(Circle().strokeBorder(DeskTheme.separator, lineWidth: 1))
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    if status == .newDraft {
                        Circle().fill(DeskInk.action).frame(width: 8, height: 8)
                            .accessibilityLabel("جديد")
                    }
                    Text(item.writer.name)
                        .font(DeskFonts.app(size: 14, weight: .semibold, relativeTo: .footnote))
                        .foregroundStyle(DeskTheme.textPrimary)
                        .lineLimit(1)
                }
                Text(metaLine)
                    .font(DeskFonts.app(size: 10, weight: .regular, relativeTo: .caption2))
                    .foregroundStyle(DeskTheme.textSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: DeskLayout.space4)
            StatusChip(title: style.title, tone: style.tone)
                .fixedSize()
        }
    }

    private var metaLine: String {
        if let submitted = item.article?.submittedAt, item.article?.status.isPending == true {
            return "كاتب رأي · أُرسلت \(RiyadhTime.ago(submitted))"
        }
        if let slot = item.writer.fixedSlot { return "كاتب رأي · \(slot.everyLabel)" }
        return "كاتب رأي"
    }

    @ViewBuilder
    private var actionArea: some View {
        switch status {
        case .newDraft?, .inPrep?:
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    if caps.schedule {
                        Button(action: actions.prepare) {
                            Label(status == .newDraft ? "جهّز وجدول" : "أكمل التجهيز", systemImage: "sparkles")
                        }
                        .buttonStyle(OpinionButtonStyle(kind: .primary))
                        .disabled(!OpinionFeatureFlags.autoPrepEnabled || isPreparing)
                    }
                    if caps.publish { publishButton.disabled(isPreparing) }
                }
                if isPreparing {
                    HStack(spacing: 6) {
                        ProgressView().controlSize(.small)
                        Text("يجهّز الآن: \(prepJob?.stepLabel ?? "التدقيق")")
                            .deskText(DeskType.timestamp)
                            .foregroundStyle(DeskTheme.textSecondary)
                    }
                    .accessibilityElement(children: .combine)
                } else if caps.schedule, !OpinionFeatureFlags.autoPrepEnabled {
                    Text("التجهيز الآلي قريبًا")
                        .deskText(DeskType.timestamp)
                        .foregroundStyle(DeskTheme.textTertiary)
                }
                if caps.schedule, item.writer.fixedSlot != nil, let slot = item.slotAt {
                    Button(action: actions.scheduleFixed) {
                        Label("جدول في موعده · \(RiyadhTime.shortWeekday(slot)) \(RiyadhTime.timeString(slot))",
                              systemImage: "calendar.badge.clock")
                    }
                    .buttonStyle(OpinionButtonStyle(kind: .tinted))
                }
            }
        case .scheduled?:
            HStack(spacing: 6) {
                Label("يُنشر تلقائيًا في موعده", systemImage: "checkmark")
                    .deskText(DeskType.tag)
                    .foregroundStyle(DeskTheme.success)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if caps.publish { publishButton.fixedSize() }
            }
        default:
            EmptyView()
        }
    }

    private var publishButton: some View {
        Button(action: actions.publish) {
            Label("انشر الآن", systemImage: "faceid")
        }
        .buttonStyle(OpinionButtonStyle(kind: .secondary))
        .accessibilityHint("يتطلب Face ID")
    }

    @ViewBuilder
    private var footer: some View {
        let canReturn = caps.returnToWriter && status != .published
        let canMove = caps.schedule && status != .published
        if canReturn || canMove {
            HStack {
                if canReturn {
                    Button(action: actions.returnToWriter) {
                        Label("أعده للكاتب", systemImage: "arrow.uturn.backward")
                    }
                    .foregroundStyle(DeskTheme.textSecondary)
                }
                Spacer()
                if canMove {
                    Button(action: actions.changeTime) {
                        Label(isUnslotted ? "اختر موعدًا" : "تغيير الموعد", systemImage: "pencil")
                    }
                    .foregroundStyle(DeskInk.link)
                }
            }
            .buttonStyle(.plain)
            .font(DeskFonts.app(size: 12, weight: .semibold, relativeTo: .caption))
            .frame(minHeight: 32)
            .padding(.top, 9)
            .overlay(alignment: .top) { Rectangle().fill(DeskInk.hairline).frame(height: 1).padding(.top, 2) }
            .padding(.top, 6)
        }
    }

    @ViewBuilder
    private var background: some View {
        let shape = RoundedRectangle(cornerRadius: DeskRadius.large, style: .continuous)
        if item.isAwaitingDraft {
            shape.fill(DeskTheme.slotWaiting)
                .overlay(shape.strokeBorder(DeskTheme.outline, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
        } else if isUnslotted {
            shape.fill(DeskTheme.amberTint)
                .overlay(shape.strokeBorder(isHighlighted ? DeskInk.action : DeskTheme.amberOutline,
                                            lineWidth: isHighlighted ? 2 : 1))
        } else {
            shape.fill(isHighlighted ? DeskInk.soft : DeskTheme.surface)
                .overlay(shape.strokeBorder(isHighlighted ? DeskInk.action : Color.clear, lineWidth: 2))
                .shadow(color: DeskShadow.card.color, radius: DeskShadow.card.radius, y: DeskShadow.card.y)
        }
    }
}

/// Card pill buttons (40 pt): filled Sabq blue, grey, or soft blue.
private struct OpinionButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, tinted }
    let kind: Kind
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(DeskFonts.app(size: 13, weight: .semibold, relativeTo: .footnote))
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .foregroundStyle(ink)
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, minHeight: 40)
            .background(fill, in: Capsule())
            .opacity(configuration.isPressed ? 0.85 : 1)
    }

    private var ink: Color {
        guard isEnabled else { return DeskTheme.disabledInk }
        switch kind {
        case .primary: return .white
        case .secondary: return DeskTheme.textPrimary
        case .tinted: return DeskInk.link
        }
    }

    private var fill: Color {
        guard isEnabled else { return DeskTheme.disabledFill }
        switch kind {
        case .primary: return DeskInk.action
        case .secondary: return DeskInk.chip
        case .tinted: return DeskInk.soft
        }
    }
}

// MARK: - Return to writer

/// «أعده للكاتب»: the note is required and reaches the writer by push and email.
private struct ReturnToWriterSheet: View {
    @Environment(\.dismiss) private var dismiss
    let writerName: String
    let onConfirm: (String) -> Void

    @State private var note = ""

    private var trimmed: String { note.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("ما الذي يحتاج تعديلًا؟", text: $note, axis: .vertical)
                        .lineLimit(4...10)
                        .deskText(DeskType.excerpt)
                        .onChange(of: note) { _, value in
                            if value.count > 2000 { note = String(value.prefix(2000)) }
                        }
                } header: {
                    Text("ملاحظتك إلى \(writerName)")
                } footer: {
                    Text("الملاحظة مطلوبة وتصل إلى الكاتب مع إشعار وبريد. يعود المقال إلى مسوداته ليعدّله ويرسله من جديد.")
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                }

                Section {
                    Button("أعده للكاتب") {
                        onConfirm(trimmed)
                        dismiss()
                    }
                    .buttonStyle(DeskPrimaryButtonStyle())
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .disabled(trimmed.count < 3)
                }
            }
            .navigationTitle("إعادة المقال للكاتب")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

#if DEBUG
#Preview("الرأي") {
    OpinionView(openAccount: {})
        .deskPreviewEnvironment()
}

#Preview("الرأي — أسبوع فارغ") {
    OpinionView(openAccount: {})
        .deskPreviewEnvironment(emptyOpinion: true)
}
#endif

// MARK: - Preparation result

struct PrepSuccess: Equatable {
    let headline: String
    let title: String
}

/// «جُهّز وجُدول» result: a light green label, the summary on one line and
/// the article title on its own line (never split mid-phrase).
private struct PrepSuccessLabel: View {
    let success: PrepSuccess

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(DeskTone.success.ink)
                .font(DeskFonts.app(size: 14, weight: .semibold, relativeTo: .footnote))
            VStack(alignment: .leading, spacing: 2) {
                Text(success.headline)
                    .font(DeskFonts.app(size: 12, weight: .semibold, relativeTo: .caption))
                    .foregroundStyle(DeskTone.success.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                Text(success.title)
                    .font(DeskFonts.app(size: 12, weight: .regular, relativeTo: .caption))
                    .foregroundStyle(DeskTheme.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(DeskTone.success.fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
