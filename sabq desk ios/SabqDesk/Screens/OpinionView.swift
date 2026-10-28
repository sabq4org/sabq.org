import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// «الرأي» (approved concept C, 2026-10-28): the week first — a strip of seven
/// Riyadh days with a dot per slot state — then an hourly timeline in the
/// style of «مجدول» in المكتب. Every fixed slot keeps its place even before
/// its draft arrives; writers without a fixed slot close the list.
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

    @State private var publishTarget: StaffOpinionItem?
    @State private var returnTarget: StaffOpinionItem?
    @State private var scheduleTarget: StaffOpinionItem?
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
                    guard let day else { return }
                    withAnimation { proxy.scrollTo(Self.dayAnchor(day), anchor: .top) }
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
            DeskScreenHeader(title: "مقالات الرأي", subtitle: weekTitle) {
                if let me = app.me {
                    Button(action: openAccount) {
                        AccountAvatar(name: me.displayName, imageURL: me.profileImageUrl, size: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("حسابي")
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
                timelineRow(linked, isFirst: false, isLast: true, unslotted: linked.slotAt == nil)
            }
            if board.hasNoDrafts {
                DeskEmptyState(title: "لا مسودات بانتظارك هذا الأسبوع",
                               message: "المواعيد الثابتة محجوزة لكتّابها، وتظهر كل مسودة في خانة موعدها فور وصولها.")
                    .padding(.top, -DeskLayout.space8)
            }
            let groups = dayGroups(board.slots)
            ForEach(groups, id: \.day) { group in
                dayHeader(RiyadhTime.dayTitle(group.start), anchor: Self.dayAnchor(group.day))
                ForEach(Array(group.items.enumerated()), id: \.element.id) { index, item in
                    timelineRow(item,
                                isFirst: group.day == groups.first?.day && index == 0,
                                isLast: index == group.items.count - 1,
                                unslotted: false)
                }
            }
            if !board.unslotted.isEmpty {
                dayHeader("بلا موعد ثابت", anchor: "unslotted")
                ForEach(Array(board.unslotted.enumerated()), id: \.element.id) { index, item in
                    timelineRow(item, isFirst: false, isLast: index == board.unslotted.count - 1, unslotted: true)
                }
            }
            if board.slots.isEmpty, board.unslotted.isEmpty, !board.hasNoDrafts {
                DeskEmptyState(title: "لا مواعيد هذا الأسبوع", message: "لا يوجد كتّاب بمواعيد ثابتة في هذه الأيام.")
            }
        } else if model?.isLoading ?? true {
            HStack { Spacer(); ProgressView(); Spacer() }
                .padding(.vertical, DeskLayout.space32)
        }
    }

    private struct DayGroup {
        let day: String
        let start: Date
        let items: [StaffOpinionItem]
    }

    private func dayGroups(_ items: [StaffOpinionItem]) -> [DayGroup] {
        var order: [String] = []
        var byDay: [String: [StaffOpinionItem]] = [:]
        var starts: [String: Date] = [:]
        for item in items {
            guard let at = item.slotAt else { continue }
            let key = RiyadhTime.dayString(at)
            if byDay[key] == nil {
                order.append(key)
                starts[key] = RiyadhTime.dayKey(at)
            }
            byDay[key, default: []].append(item)
        }
        return order.sorted().map { DayGroup(day: $0, start: starts[$0] ?? Date(), items: byDay[$0] ?? []) }
    }

    private static func dayAnchor(_ day: String) -> String { "day-\(day)" }

    private func dayHeader(_ title: String, anchor: String?) -> some View {
        HStack(spacing: DeskLayout.space8) {
            Text(title)
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(DeskTheme.textSecondary)
                .accessibilityAddTraits(.isHeader)
            Rectangle().fill(DeskInk.hairline).frame(height: 1)
        }
        .padding(.horizontal, DeskLayout.pageMargin + 4)
        .padding(.top, DeskLayout.space16)
        .padding(.bottom, 6)
        .id(anchor ?? "linked")
    }

    private func timelineRow(_ item: StaffOpinionItem, isFirst: Bool, isLast: Bool, unslotted: Bool) -> some View {
        HStack(alignment: .top, spacing: DeskLayout.space12) {
            OpinionTimeColumn(date: unslotted ? nil : item.slotAt, isFirst: isFirst, isLast: isLast)
            OpinionCard(item: item,
                        caps: caps,
                        isUnslotted: unslotted,
                        isHighlighted: highlighted == item.id,
                        isBusy: busyID == item.id,
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

    private func prepare(_ item: StaffOpinionItem) async {
        guard OpinionFeatureFlags.autoPrepEnabled, let id = item.article?.id else { return }
        await run(item) { _ = try await app.client.prepareOpinion(id: id) }
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

// MARK: - Week strip

/// Seven day chips: the selected one dark navy, today's number in link blue,
/// and one dot per state present that day.
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
                            .foregroundStyle(isSelected ? Color(white: 0.75) : DeskTheme.textSecondary)
                        Text(verbatim: day.start.map(RiyadhTime.dayNumber) ?? "")
                            .font(DeskFonts.app(size: 17, weight: .bold, relativeTo: .headline))
                            .monospacedDigit()
                            .foregroundStyle(isSelected ? Color.white : (day.date == today ? DeskInk.link : DeskTheme.textPrimary))
                        OpinionDayDots(counts: day.counts)
                    }
                    .frame(maxWidth: .infinity, minHeight: 64)
                    .background(isSelected ? DeskInk.strong : DeskInk.chip,
                                in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
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
        if c.missing > 0 { parts.append("\(c.missing) لم تصل بعد") }
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
            if counts.missing > 0 {
                Circle().strokeBorder(DeskTheme.outline, lineWidth: 1.5).frame(width: 6, height: 6)
            }
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
            HStack(spacing: DeskLayout.space4) {
                Circle().strokeBorder(DeskTheme.outline, lineWidth: 1.5).frame(width: 7, height: 7)
                Text(OpinionStateStyle.missing.title)
            }
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

/// Big Riyadh time, the countdown under it, and the rail down to the next slot.
private struct OpinionTimeColumn: View {
    let date: Date?
    let isFirst: Bool
    let isLast: Bool

    var body: some View {
        VStack(spacing: 2) {
            if let date {
                LTRText(text: RiyadhTime.timeString(date), role: DeskType.timelineTime,
                        color: isFirst ? DeskInk.link : DeskTheme.textPrimary)
                if let countdown = RiyadhTime.slotCountdown(to: date) {
                    Text(countdown)
                        .deskText(DeskType.tag)
                        .foregroundStyle(isFirst ? DeskInk.link : DeskTheme.textSecondary)
                        .lineLimit(1)
                        .fixedSize()
                }
            } else {
                Text(verbatim: "—")
                    .deskText(DeskType.timelineTime)
                    .foregroundStyle(DeskTheme.textTertiary)
            }
            if !isLast {
                Rectangle()
                    .fill(DeskTheme.outline)
                    .frame(width: 2)
                    .frame(maxHeight: .infinity)
                    .padding(.top, 6)
            }
        }
        .padding(.top, 6)
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
        let returnToWriter: () -> Void
    }

    let item: StaffOpinionItem
    let caps: StaffCapabilities.Opinion
    let isUnslotted: Bool
    let isHighlighted: Bool
    let isBusy: Bool
    let actions: Actions

    private var style: OpinionStateStyle { OpinionStateStyle(item: item) }
    private var status: StaffOpinionStatus? { item.article?.status }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            topLine
            if let article = item.article {
                Text(article.title)
                    .font(DeskFonts.app(size: 15, weight: .semibold, relativeTo: .subheadline))
                    .lineSpacing(4)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, DeskLayout.space8)
                    .padding(.bottom, 10)
                actionArea
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
                        .deskText(DeskRowType.nameRead)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .lineLimit(1)
                }
                Text(metaLine)
                    .deskText(DeskType.timestamp)
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
                        .disabled(!OpinionFeatureFlags.autoPrepEnabled)
                    }
                    if caps.publish { publishButton }
                }
                if caps.schedule, !OpinionFeatureFlags.autoPrepEnabled {
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
            shape.fill(isHighlighted ? DeskInk.bubble : DeskTheme.surface)
                .overlay(shape.strokeBorder(isHighlighted ? DeskInk.action : DeskTheme.skyOutline,
                                            lineWidth: isHighlighted ? 2 : 1))
                .shadow(color: DeskShadow.card.color, radius: DeskShadow.card.radius, y: DeskShadow.card.y)
        }
    }
}

/// Compact card buttons (36 pt): filled blue, grey, or tinted blue.
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
            .frame(maxWidth: .infinity, minHeight: 36)
            .background(fill, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
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
        case .tinted: return DeskInk.bubble
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
