import SwiftUI
import Charts

// MARK: - مركز مباراة كأس آسيا
//
// تكافؤ مع WorldCupMatchCenter: أحداث (شريط أفقي + سرد عمودي)، تشكيلات على
// ملعب 2D، إحصائيات + xG/طقس/غيابات، تقييمات، توقعات. يُعرض كـ sheet من أي بطاقة.

struct AsianCupMatchCenter: View {
    let fixtureId: Int
    var seed: AcFixture? = nil
    @Environment(\.dismiss) private var dismiss
    @Environment(SabqLiveStream.self) private var liveStream
    @Environment(AuthStore.self) private var authStore

    @State private var detail: AcMatchDetail?
    @State private var loading = true
    @State private var commentary: AcCommentary?
    @State private var momentum: AcMomentum?
    @State private var pressure: AcPressure?
    @State private var selectedPlayer: AcPlayerSelection?
    @State private var isFollowingMatch = false
    @State private var followBusy = false
    @State private var showLogin = false

    enum Tab: String, CaseIterable {
        case commentary = "التعليق"
        case events = "الأحداث"
        case momentum = "الزخم"
        case pressure = "الضغط"
        case lineups = "التشكيلات"
        case stats = "الإحصائيات"
        case ratings = "التقييمات"
        case prediction = "التوقعات"
    }
    @State private var tab: Tab = .events
    @State private var didPickDefaultTab = false

    private var tabs: [Tab] {
        let started = (detail?.fixture.status.live ?? false) || (detail?.fixture.status.finished ?? false)
        var t: [Tab] = []
        if started { t.append(.commentary) }
        t.append(.events)
        if started { t.append(contentsOf: [.momentum, .pressure]) }
        t.append(contentsOf: [.lineups, .stats])
        if let d = detail, !d.ratings.isEmpty { t.append(.ratings) }
        t.append(.prediction)
        return t
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: SabqLayout.space16) {
                    if loading && detail == nil && seed == nil {
                        AcLoading().padding(.top, SabqLayout.space32)
                    } else if let f = detail?.fixture ?? seed {
                        header(f)
                        if !f.status.finished {
                            tvStrip
                        }
                        followMatchBar(f)
                        tabBar
                        if let detail {
                            content(detail)
                        } else if loading {
                            AcLoading()
                        } else {
                            acEmptyText("تعذر جلب تفاصيل المباراة")
                        }
                    } else {
                        acEmptyText("تعذر جلب تفاصيل المباراة").padding(.top, SabqLayout.space40)
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.top, SabqLayout.space16)
                .padding(.bottom, SabqLayout.space40)
            }
            .background(SabqTheme.background.ignoresSafeArea())
            .navigationTitle("مركز المباراة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(SabqTheme.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .foregroundStyle(SabqTheme.textPrimary)
                            .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    }
                    .accessibilityLabel("إغلاق")
                }
            }
            .task { await load() }
            .task(id: detail?.fixture.id) {
                liveStream.acquire()
                defer { liveStream.release() }
                var tick = 0
                while !Task.isCancelled {
                    let interval: UInt64 = liveStream.connected ? 20_000_000_000 : 8_000_000_000
                    try? await Task.sleep(nanoseconds: interval)
                    if Task.isCancelled { return }
                    tick += 1
                    guard let f = detail?.fixture else { continue }
                    if f.status.live {
                        await load(force: true)
                    } else if !f.status.finished, tick % 2 == 0 {
                        let dt = Double(f.timestamp) - Date().timeIntervalSince1970
                        if dt <= 600 && dt >= -900 { await load(force: true) }
                    }
                }
            }
            .onChange(of: liveStream.stamps["s:\(fixtureId)"]) { _, _ in
                Task { await load(force: true) }
            }
            .refreshable { await load(force: true) }
            .sheet(item: $selectedPlayer) { sel in
                AcPlayerSheet(playerId: sel.id).presentationDetents([.large])
            }
            .sheet(isPresented: $showLogin) { LoginSheet() }
        }
        .sabqRTL()
        .environment(liveStream)
    }

    // MARK: Header — نفس ترتيب WC (ضيف–مضيف داخل LTR لعرض صحيح في RTL)

    private func header(_ f: AcFixture) -> some View {
        VStack(spacing: SabqLayout.space12) {
            HStack(alignment: .top, spacing: SabqLayout.space8) {
                teamHead(f.home)
                VStack(spacing: SabqLayout.space8) {
                    if f.started {
                        Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                            .font(SabqType.articleTitle.font.monospacedDigit())
                            .foregroundStyle(SabqTheme.textPrimary)
                            .environment(\.layoutDirection, .leftToRight)
                    } else {
                        Text(AcFormat.time(f))
                            .font(SabqType.leadTitle.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                    }
                    AcStatusPill(fixture: f)
                }
                .frame(minWidth: 96)
                teamHead(f.away)
            }
            Text("\(f.round) · \(f.venue.name)\(f.venue.city.isEmpty ? "" : " — \(f.venue.city)") · \(AcFormat.day(f))")
                .font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
    }

    private func teamHead(_ team: AcTeam) -> some View {
        VStack(spacing: SabqLayout.space8) {
            AcTeamLogo(team: team, size: 56)
            Text(team.name)
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private func followMatchBar(_ f: AcFixture) -> some View {
        HStack {
            Button {
                if authStore.isLoggedIn {
                    Task { await toggleMatchFollow(f) }
                } else {
                    showLogin = true
                }
            } label: {
                HStack(spacing: SabqLayout.space8) {
                    if followBusy {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: isFollowingMatch ? "bell.fill" : "bell")
                    }
                    Text(isFollowingMatch ? "تتابع المباراة" : "تابع المباراة")
                        .font(SabqType.button.font)
                }
                .foregroundStyle(isFollowingMatch ? SabqTheme.onAction : AcStyle.accent)
                .padding(.horizontal, SabqLayout.space16)
                .frame(minHeight: SabqLayout.controlHeight)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(isFollowingMatch ? AcStyle.accentFill : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .stroke(isFollowingMatch ? Color.clear : SabqTheme.outline, lineWidth: 1)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(followBusy)
            Spacer()
        }
        .task(id: f.id) { await refreshMatchFollow(f) }
    }

    private var tvStrip: some View {
        Group {
            if let channels = detail?.tv, !channels.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: SabqLayout.space8) {
                        ForEach(channels) { ch in
                            AcTag(text: ch.name)
                        }
                    }
                }
            }
        }
    }

    // MARK: Tabs

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SabqLayout.space8) {
                ForEach(tabs, id: \.self) { t in
                    Button {
                        withAnimation(.easeOut(duration: 0.2)) { tab = t }
                    } label: {
                        Text(t.rawValue).acChip(selected: tab == t)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(tab == t ? .isSelected : [])
                }
            }
        }
        .onChange(of: tabs) { _, newTabs in
            if !newTabs.contains(tab), let first = newTabs.first { tab = first }
        }
    }

    @ViewBuilder
    private func content(_ detail: AcMatchDetail) -> some View {
        let openPlayer: (Int?) -> Void = { selectedPlayer = AcPlayerSelection($0) }
        switch tab {
        case .commentary:
            AcCommentaryView(fixtureId: fixtureId, commentary: $commentary, live: detail.fixture.status.live)
        case .events:
            AcEventsTimeline(detail: detail, onOpenPlayer: openPlayer)
        case .momentum:
            AcMomentumView(
                fixtureId: fixtureId, live: detail.fixture.status.live,
                homeName: detail.fixture.home.name, awayName: detail.fixture.away.name,
                momentum: $momentum
            )
        case .pressure:
            AcPressureView(
                fixtureId: fixtureId, live: detail.fixture.status.live,
                homeName: detail.fixture.home.name, awayName: detail.fixture.away.name,
                pressure: $pressure
            )
        case .lineups:
            AcLineupsView(detail: detail, onOpenPlayer: openPlayer)
        case .stats:
            AcStatsView(detail: detail)
        case .ratings:
            AcRatingsView(detail: detail, onOpenPlayer: openPlayer)
        case .prediction:
            AcPredictionView(detail: detail)
        }
    }

    // MARK: Load / Follow

    private func load(force: Bool = false) async {
        let result = try? await APIClient.shared.fetchAsianCupMatch(fixtureId: fixtureId, ignoreCache: force)
        await MainActor.run {
            detail = result
            loading = false
            if !didPickDefaultTab, let r = result {
                didPickDefaultTab = true
                if r.fixture.status.live { tab = .commentary }
            }
        }
        if result?.fixture.status.live == true || result?.fixture.status.finished == true {
            async let c = try? APIClient.shared.fetchAsianCupCommentary(fixtureId: fixtureId, ignoreCache: force)
            async let m = try? APIClient.shared.fetchAsianCupMomentum(fixtureId: fixtureId, ignoreCache: force)
            async let p = try? APIClient.shared.fetchAsianCupPressure(fixtureId: fixtureId, ignoreCache: force)
            let (cR, mR, pR) = await (c, m, p)
            await MainActor.run {
                commentary = cR
                momentum = mR
                pressure = pR
            }
        }
    }

    private func refreshMatchFollow(_ f: AcFixture) async {
        guard authStore.isLoggedIn else {
            await MainActor.run { isFollowingMatch = false }
            return
        }
        if let follows = try? await APIClient.shared.fetchSportsFollows() {
            let following = follows.contains { $0.kind == "match" && $0.refId == String(f.id) }
            await MainActor.run { isFollowingMatch = following }
        }
    }

    private func toggleMatchFollow(_ f: AcFixture) async {
        await MainActor.run { followBusy = true }
        do {
            if isFollowingMatch {
                try await APIClient.shared.removeSportsFollow(kind: "match", refId: String(f.id))
                await MainActor.run { isFollowingMatch = false }
            } else {
                let name = "\(f.home.name) × \(f.away.name)"
                try await APIClient.shared.addSportsFollow(
                    kind: "match", refId: String(f.id), refName: name, refLogo: f.home.logo
                )
                await MainActor.run { isFollowingMatch = true }
            }
        } catch { }
        await MainActor.run { followBusy = false }
    }
}

// MARK: - التعليق

private struct AcCommentaryView: View {
    let fixtureId: Int
    @Binding var commentary: AcCommentary?
    let live: Bool

    var body: some View {
        Group {
            if let items = commentary?.items, !items.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        if index > 0 { AcRowDivider() }
                        HStack(alignment: .top, spacing: SabqLayout.space12) {
                            Text(item.minuteLabel)
                                .font(SabqType.metaEmphasis.font.monospacedDigit())
                                .foregroundStyle(AcStyle.accent)
                                .frame(width: 40, alignment: .leading)
                                .environment(\.layoutDirection, .leftToRight)
                            Text(item.textAr.isEmpty ? item.textEn : item.textAr)
                                .sabqText(SabqType.excerpt)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.vertical, SabqLayout.space12)
                    }
                }
            } else {
                acEmptyText("التعليق المباشر غير متاح لهذه المباراة")
            }
        }
        .task(id: fixtureId) {
            if commentary == nil {
                commentary = try? await APIClient.shared.fetchAsianCupCommentary(
                    fixtureId: fixtureId, ignoreCache: live)
            }
        }
    }
}

// MARK: - الأحداث (شريط أفقي + سرد عمودي — تكافؤ WC)

struct AcEventsTimeline: View {
    let detail: AcMatchDetail
    let onOpenPlayer: (Int?) -> Void
    @State private var facts: AcMatchFacts?

    private let barHeight: CGFloat = 112
    private let axisY: CGFloat = 48
    private let topRowY: CGFloat = 22
    private let bottomRowY: CGFloat = 74
    private let barInset: CGFloat = 16

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            if let ht = facts?.halftime { halftimeRow(ht) }

            if detail.events.isEmpty {
                acEmptyText("الأحداث تظهر هنا لحظة بلحظة مع انطلاق المباراة")
            } else {
                if !barEvents.isEmpty { horizontalBar }
                verticalFlow
            }
        }
        .task(id: detail.fixture.id) {
            facts = try? await APIClient.shared.fetchAsianCupMatchFacts(
                fixtureId: detail.fixture.id, ignoreCache: detail.fixture.status.live)
        }
    }

    private func halftimeRow(_ ht: AcHalftime) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Text("نتيجة الشوط الأول").font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
            Text("\(ht.away) - \(ht.home)")
                .font(SabqType.metaEmphasis.font.monospacedDigit())
                .foregroundStyle(SabqTheme.textPrimary)
                .environment(\.layoutDirection, .leftToRight)
            Spacer(minLength: 0)
        }
    }

    private var barEvents: [AcMatchEvent] {
        detail.events.filter { $0.type == "goal" || $0.type == "yellow-card" || $0.type == "red-card" }
    }
    private var maxMinute: Int {
        max(90, detail.events.map { $0.minute + ($0.extraMinute ?? 0) }.max() ?? 90)
    }
    private var refMarks: [Int] {
        maxMinute > 95 ? [0, 45, 90, maxMinute] : [0, 45, 90]
    }

    private func barX(_ minute: Int, width w: CGFloat) -> CGFloat {
        let f = min(max(CGFloat(minute) / CGFloat(maxMinute), 0), 1)
        let usable = max(w - barInset * 2, 1)
        return barInset + usable * (1 - f)
    }

    private var horizontalBar: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text("خط زمن المباراة")
                .font(SabqType.metaEmphasis.font).foregroundStyle(SabqTheme.textPrimary)

            GeometryReader { geo in
                let w = geo.size.width
                ZStack(alignment: .topLeading) {
                    Rectangle().fill(SabqTheme.outline)
                        .frame(width: w - barInset * 2, height: 2)
                        .position(x: w / 2, y: axisY)
                    ForEach(refMarks, id: \.self) { m in
                        let x = barX(m, width: w)
                        Rectangle().fill(SabqTheme.separator)
                            .frame(width: 1, height: barHeight - 24)
                            .position(x: x, y: (barHeight - 24) / 2)
                        Text("\(m)'")
                            .font(SabqFonts.app(size: 12).monospacedDigit())
                            .foregroundStyle(SabqTheme.textSecondary)
                            .position(x: x, y: barHeight - 8)
                    }
                    ForEach(barEvents) { ev in
                        let isHome = ev.teamId == detail.fixture.home.id
                        let x = barX(ev.minute + (ev.extraMinute ?? 0), width: w)
                        VStack(spacing: 1) {
                            if isHome { minuteTiny(ev); barMarker(ev) }
                            else { barMarker(ev); minuteTiny(ev) }
                        }
                        .position(x: x, y: isHome ? topRowY : bottomRowY)
                    }
                }
                .frame(width: w, height: barHeight)
                .environment(\.layoutDirection, .leftToRight)
            }
            .frame(height: barHeight)

            HStack(spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space4) {
                    Circle().fill(AcStyle.accentFill).frame(width: 8, height: 8)
                    Text("\(detail.fixture.home.name) · أعلى")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                }
                Spacer(minLength: SabqLayout.space8)
                HStack(spacing: SabqLayout.space4) {
                    Text("\(detail.fixture.away.name) · أسفل")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                    Circle().fill(AcTheme.gold).frame(width: 8, height: 8)
                }
            }
        }
        .padding(SabqLayout.space12)
        .acQuietBlock()
    }

    private func minuteTiny(_ ev: AcMatchEvent) -> some View {
        Text(minuteLabel(ev))
            .font(SabqFonts.app(size: 12).monospacedDigit())
            .foregroundStyle(SabqTheme.textSecondary)
            .environment(\.layoutDirection, .leftToRight)
    }

    @ViewBuilder private func barMarker(_ ev: AcMatchEvent) -> some View {
        switch ev.type {
        case "goal":
            Image(systemName: "soccerball")
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(AcTheme.royal)
                .padding(3)
                .background(Circle().fill(.white))
                .overlay(Circle().stroke(SabqTheme.outline, lineWidth: 1))
        case "yellow-card":
            RoundedRectangle(cornerRadius: 2).fill(AcTheme.gold).frame(width: 9, height: 13)
        case "red-card":
            RoundedRectangle(cornerRadius: 2).fill(SabqTheme.danger).frame(width: 9, height: 13)
        default:
            EmptyView()
        }
    }

    private var verticalFlow: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("مجريات المباراة")
                .font(SabqType.metaEmphasis.font).foregroundStyle(SabqTheme.textPrimary)
                .padding(.bottom, SabqLayout.space4)
            ForEach(Array(sorted.enumerated()), id: \.element.id) { index, ev in
                if index > 0 { AcRowDivider() }
                Button { onOpenPlayer(ev.playerId) } label: { row(ev) }
                    .buttonStyle(.plain)
            }
        }
    }

    private var sorted: [AcMatchEvent] {
        detail.events.sorted { ($0.minute, $0.extraMinute ?? 0) > ($1.minute, $1.extraMinute ?? 0) }
    }

    private func minuteLabel(_ ev: AcMatchEvent) -> String {
        "\(ev.minute)'\(ev.extraMinute.map { "+\($0)" } ?? "")"
    }

    private func detailFor(_ ev: AcMatchEvent) -> String? {
        guard let list = facts?.eventDetails else { return nil }
        let klass: String? = {
            switch ev.type {
            case "goal": return "goal"
            case "yellow-card", "red-card": return "card"
            case "var": return "var"
            default: return nil
            }
        }()
        guard let klass else { return nil }
        let loc = ev.teamId == detail.fixture.home.id ? "home" : "away"
        return list.first { $0.klass == klass && $0.location == loc && abs($0.minute - ev.minute) <= 1 }?.detail
    }

    private func row(_ ev: AcMatchEvent) -> some View {
        let isHome = ev.teamId == detail.fixture.home.id
        let team = isHome ? detail.fixture.home : detail.fixture.away
        let extra = detailFor(ev)
        return HStack(spacing: SabqLayout.space8) {
            Circle().fill(isHome ? AcStyle.accentFill : AcTheme.gold).frame(width: 8, height: 8)
            Text(minuteLabel(ev))
                .font(SabqType.meta.font.monospacedDigit())
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(minWidth: 40)
                .environment(\.layoutDirection, .leftToRight)
            icon(ev.type)
            VStack(alignment: .leading, spacing: 2) {
                Text(ev.player.isEmpty ? ev.label : "\(ev.player) (\(ev.label))")
                    .font(SabqType.rowTitle.font).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                if let extra {
                    Text(extra).font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                }
                if let assist = ev.assist, ev.type == "goal" {
                    Text("صناعة: \(assist)").font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                } else if let assist = ev.assist, ev.type == "substitution" {
                    Text("بديلًا عن: \(assist)").font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                }
            }
            Spacer()
            AcRemoteImage(url: team.logo).frame(width: 20, height: 20)
        }
        .padding(.vertical, SabqLayout.space12)
        .contentShape(Rectangle())
    }

    @ViewBuilder private func icon(_ type: String) -> some View {
        switch type {
        case "goal": Image(systemName: "soccerball").foregroundStyle(AcStyle.accent)
        case "missed-penalty": Image(systemName: "xmark.circle.fill").foregroundStyle(SabqTheme.danger)
        case "yellow-card": RoundedRectangle(cornerRadius: 2).fill(AcTheme.gold).frame(width: 11, height: 15)
        case "red-card": RoundedRectangle(cornerRadius: 2).fill(SabqTheme.danger).frame(width: 11, height: 15)
        case "substitution": Image(systemName: "arrow.left.arrow.right").foregroundStyle(SabqTheme.textSecondary)
        case "var": Image(systemName: "tv").foregroundStyle(SabqTheme.textSecondary)
        default: Image(systemName: "circle.fill").foregroundStyle(SabqTheme.textTertiary)
        }
    }
}

// MARK: - الزخم

struct AcMomentumView: View {
    let fixtureId: Int
    let live: Bool
    let homeName: String
    let awayName: String
    @Binding var momentum: AcMomentum?

    var body: some View {
        VStack(spacing: SabqLayout.space16) {
            if let m = momentum, m.available, !m.points.isEmpty {
                if let p = m.possession {
                    HStack {
                        Text("\(p.home)%").font(SabqType.rowTitle.font.monospacedDigit())
                        Spacer()
                        Text("الاستحواذ").font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                        Spacer()
                        Text("\(p.away)%").font(SabqType.rowTitle.font.monospacedDigit())
                    }
                    .foregroundStyle(SabqTheme.textPrimary)
                }
                Text("الزخم الهجومي — أعلى: \(homeName) · أسفل: \(awayName)")
                    .font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.center)
                Chart(m.points) { pt in
                    BarMark(x: .value("د", pt.minute), y: .value("صافي", pt.net))
                        .foregroundStyle(pt.net >= 0 ? AcStyle.accentFill : AcTheme.gold)
                }
                .chartYAxis(.hidden)
                .frame(height: 180)
                .environment(\.layoutDirection, .leftToRight)
            } else {
                acEmptyText("الزخم يظهر هنا أثناء المباراة")
            }
        }
        .task(id: fixtureId) {
            if momentum == nil {
                momentum = try? await APIClient.shared.fetchAsianCupMomentum(
                    fixtureId: fixtureId, ignoreCache: live)
            }
        }
    }
}

// MARK: - الضغط

struct AcPressureView: View {
    let fixtureId: Int
    let live: Bool
    let homeName: String
    let awayName: String
    @Binding var pressure: AcPressure?

    var body: some View {
        VStack(spacing: SabqLayout.space16) {
            if let d = pressure, d.available, !d.points.isEmpty {
                if live, let latest = d.latest, latest.side != "even" {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "gauge.medium").foregroundStyle(AcStyle.accent)
                            .accessibilityHidden(true)
                        Text("الأكثر سيطرة الآن:").font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                        Text(latest.side == "home" ? homeName : awayName)
                            .font(SabqType.metaEmphasis.font).foregroundStyle(SabqTheme.textPrimary)
                        AcTag(text: "\(Int(latest.value))")
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                Text("مؤشّر الضغط لحظة بلحظة — أعلى: \(homeName) · أسفل: \(awayName)")
                    .font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.center)
                Chart(d.points) { p in
                    BarMark(x: .value("الدقيقة", p.minute), y: .value("الضغط", p.net))
                        .foregroundStyle(p.net >= 0 ? AcStyle.accentFill : SabqTheme.danger)
                }
                .chartYAxis(.hidden)
                .frame(height: 180)
                .environment(\.layoutDirection, .leftToRight)
            } else {
                acEmptyText("مؤشّر الضغط يظهر هنا أثناء المباراة")
            }
        }
        .task(id: fixtureId) {
            if pressure == nil {
                pressure = try? await APIClient.shared.fetchAsianCupPressure(
                    fixtureId: fixtureId, ignoreCache: live)
            }
        }
    }
}

// MARK: - التشكيلات (ملعب 2D)

struct AcLineupsView: View {
    let detail: AcMatchDetail
    let onOpenPlayer: (Int?) -> Void

    var body: some View {
        if detail.lineups.isEmpty {
            acEmptyText("التشكيلات تُعلن قبل انطلاق المباراة بنحو 20–40 دقيقة")
        } else {
            VStack(spacing: SabqLayout.space32) {
                ForEach(detail.lineups) { lineup in
                    AcPitch(lineup: lineup, onOpenPlayer: onOpenPlayer)
                }
            }
        }
    }
}

struct AcPitch: View {
    let lineup: AcLineup
    let onOpenPlayer: (Int?) -> Void

    private var rows: [[AcLineupPlayer]] {
        var byRow: [Int: [(col: Int, p: AcLineupPlayer)]] = [:]
        for p in lineup.startXI {
            let parts = (p.grid ?? "0:0").split(separator: ":").map { Int($0) ?? 0 }
            let r = parts.first ?? 0, c = parts.count > 1 ? parts[1] : 0
            byRow[r, default: []].append((c, p))
        }
        return byRow.keys.filter { $0 > 0 }.sorted().map { r in
            byRow[r]!.sorted { $0.col < $1.col }.map { $0.p }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack {
                Text(lineup.teamName).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                Spacer()
                if let f = lineup.formation {
                    AcTag(text: f)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            pitch
            if !lineup.coach.isEmpty {
                Text("المدرب: \(lineup.coach)").font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
            }
            if !lineup.substitutes.isEmpty { bench }
        }
    }

    private var bench: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "figure.seated.side").font(SabqType.meta.font).foregroundStyle(AcStyle.accent)
                    .accessibilityHidden(true)
                Text("دكة البدلاء").font(SabqType.metaEmphasis.font).foregroundStyle(SabqTheme.textPrimary)
                Text("(\(lineup.substitutes.count))").font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: SabqLayout.space8)], alignment: .leading, spacing: SabqLayout.space8) {
                ForEach(lineup.substitutes) { p in
                    Button { onOpenPlayer(p.id) } label: { benchRow(p) }
                        .buttonStyle(.plain)
                }
            }
        }
        .padding(.top, 4)
    }

    private func benchRow(_ p: AcLineupPlayer) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Text(p.number.map { "\($0)" } ?? "•")
                .font(SabqType.tag.font.monospacedDigit()).foregroundStyle(AcStyle.accent)
                .frame(width: 24, height: 24)
                .background(Circle().fill(SabqTheme.surface))
                .environment(\.layoutDirection, .leftToRight)
            Text(p.name)
                .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, SabqLayout.space8)
        .frame(minHeight: SabqLayout.touchTarget)
        .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
        .contentShape(Rectangle())
    }

    private var pitch: some View {
        GeometryReader { geo in
            let r = rows
            ZStack {
                AcTheme.pitchTop
                RoundedRectangle(cornerRadius: SabqRadius.small).stroke(.white.opacity(0.25), lineWidth: 1).padding(SabqLayout.space8)
                Rectangle().fill(.white.opacity(0.2)).frame(height: 1)
                Circle().stroke(.white.opacity(0.25), lineWidth: 1).frame(width: 64, height: 64)

                if r.isEmpty {
                    Text("التشكيلة غير متاحة بعد").font(SabqType.meta.font).foregroundStyle(.white)
                } else {
                    ForEach(Array(r.enumerated()), id: \.offset) { ri, players in
                        let y = geo.size.height * (1 - (CGFloat(ri) + 0.6) / (CGFloat(r.count) + 0.4))
                        HStack(spacing: 0) {
                            ForEach(players) { p in
                                playerDot(p).frame(maxWidth: .infinity)
                            }
                        }
                        .environment(\.layoutDirection, .leftToRight)
                        .position(x: geo.size.width / 2, y: y)
                        .frame(width: geo.size.width)
                    }
                }
            }
        }
        .aspectRatio(3.0 / 4.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private func playerDot(_ p: AcLineupPlayer) -> some View {
        Button { onOpenPlayer(p.id) } label: {
            VStack(spacing: 2) {
                Text(p.number.map { "\($0)" } ?? "•")
                    .font(SabqType.tag.font.monospacedDigit()).foregroundStyle(AcTheme.pitchBottom)
                    .frame(width: 28, height: 28).background(Circle().fill(.white))
                Text(p.name).font(SabqFonts.app(size: 12)).foregroundStyle(.white)
                    .lineLimit(1).frame(maxWidth: 64)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - الإحصائيات (+ xG / طقس / غيابات)

struct AcStatsView: View {
    let detail: AcMatchDetail
    @State private var facts: AcMatchFacts?
    @State private var xg: AcXg?
    @State private var loaded = false

    private var stats: [AcStatistic] {
        if detail.fixture.status.live, !detail.statistics.isEmpty { return detail.statistics }
        if let f = facts, !f.statistics.isEmpty { return f.statistics }
        return detail.statistics
    }

    private var nothing: Bool {
        stats.isEmpty && !(xg?.available ?? false) && facts?.weather == nil
            && (facts?.absentees.isEmpty ?? true)
    }

    var body: some View {
        VStack(spacing: SabqLayout.space16) {
            if let xg, xg.available, let home = xg.home, let away = xg.away {
                xgCard(home: home, away: away, top: xg.topPlayers ?? [])
            }
            if let w = facts?.weather { weatherCard(w) }
            if let f = facts, !f.absentees.isEmpty { absenteesView(f.absentees) }
            if !stats.isEmpty {
                ForEach(stats) { statRow($0) }
            }
            if loaded && nothing {
                acEmptyText("الإحصائيات تظهر هنا أثناء المباراة")
            }
        }
        .task(id: detail.fixture.id) {
            async let f = APIClient.shared.fetchAsianCupMatchFacts(
                fixtureId: detail.fixture.id, ignoreCache: detail.fixture.status.live)
            async let x = APIClient.shared.fetchAsianCupXg(
                fixtureId: detail.fixture.id, ignoreCache: detail.fixture.status.live)
            facts = try? await f
            xg = try? await x
            loaded = true
        }
    }

    private func xgCard(home: AcXgSide, away: AcXgSide, top: [AcXgPlayer]) -> some View {
        VStack(spacing: SabqLayout.space12) {
            statRow(AcStatistic(key: "xg", label: "الأهداف المتوقعة (xG)",
                                home: String(format: "%.2f", home.xg),
                                away: String(format: "%.2f", away.xg)))
            if home.xgot > 0 || away.xgot > 0 {
                HStack {
                    Text(String(format: "%.2f", home.xgot))
                        .font(SabqType.meta.font.monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                        .frame(width: 48, alignment: .leading)
                    Spacer()
                    Text("على المرمى (xGoT)").font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                    Spacer()
                    Text(String(format: "%.2f", away.xgot))
                        .font(SabqType.meta.font.monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                        .frame(width: 48, alignment: .trailing)
                }
            }
            if !top.isEmpty {
                AcRowDivider()
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    Text("الأعلى خطورة (xG)").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    ForEach(Array(top.prefix(3))) { p in
                        HStack(spacing: SabqLayout.space8) {
                            AcRemoteImage(url: p.location == "home" ? detail.fixture.home.logo : detail.fixture.away.logo)
                                .frame(width: 16, height: 16)
                            Text(p.name).font(SabqType.excerpt.font).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                            Spacer()
                            Text(String(format: "%.2f", p.xg))
                                .font(SabqType.metaEmphasis.font.monospacedDigit()).foregroundStyle(SabqTheme.textPrimary)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(SabqLayout.space16)
        .acQuietBlock()
    }

    private func weatherCard(_ w: AcWeather) -> some View {
        HStack(spacing: SabqLayout.space12) {
            if w.icon.isEmpty {
                Image(systemName: "cloud.fill").font(SabqType.leadTitle.font).foregroundStyle(SabqTheme.textTertiary)
                    .accessibilityHidden(true)
            } else {
                AcRemoteImage(url: w.icon).frame(width: 36, height: 36)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: SabqLayout.space4) {
                    Text(w.description).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                    if w.type == "forecast" {
                        Text("· توقّع").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    }
                }
                HStack(spacing: SabqLayout.space12) {
                    if let t = w.temp {
                        Text("\(t)°م").font(SabqType.meta.font.monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                    }
                    if let h = w.humidity, !h.isEmpty {
                        HStack(spacing: 2) {
                            Image(systemName: "drop.fill").accessibilityHidden(true)
                            Text(h)
                        }
                        .font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                    }
                }
            }
            Spacer()
        }
        .padding(SabqLayout.space12)
        .acQuietBlock()
    }

    private func absenteesView(_ list: [AcAbsentee]) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "bandage.fill").font(SabqType.meta.font).foregroundStyle(SabqTheme.danger)
                    .accessibilityHidden(true)
                Text("الغيابات").font(SabqType.metaEmphasis.font).foregroundStyle(SabqTheme.textPrimary)
            }
            HStack(alignment: .top, spacing: SabqLayout.space12) {
                absenteeCol(detail.fixture.home, list.filter { $0.location == "home" })
                absenteeCol(detail.fixture.away, list.filter { $0.location == "away" })
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(SabqLayout.space12)
        .acQuietBlock()
    }

    private func absenteeCol(_ team: AcTeam, _ players: [AcAbsentee]) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            HStack(spacing: SabqLayout.space8) {
                AcRemoteImage(url: team.logo).frame(width: 16, height: 16)
                Text(team.name).font(SabqType.metaEmphasis.font).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
            }
            if players.isEmpty {
                Text("—").font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
            } else {
                ForEach(players) { p in
                    Text("\(p.name)\(p.reason.isEmpty ? "" : " — \(p.reason)")")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func statRow(_ s: AcStatistic) -> some View {
        let h = Double(s.home.replacingOccurrences(of: "%", with: "")) ?? 0
        let a = Double(s.away.replacingOccurrences(of: "%", with: "")) ?? 0
        let max = (h + a) == 0 ? 1 : (h + a)
        return VStack(spacing: SabqLayout.space8) {
            HStack {
                Text(s.home).font(SabqType.rowTitle.font.monospacedDigit()).frame(width: 56, alignment: .leading)
                Spacer()
                Text(s.label).font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                Spacer()
                Text(s.away).font(SabqType.rowTitle.font.monospacedDigit()).frame(width: 56, alignment: .trailing)
            }
            .foregroundStyle(SabqTheme.textPrimary)
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule().fill(AcStyle.accentFill)
                        .frame(width: geo.size.width / 2 * CGFloat(h / max))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    Capsule().fill(AcTheme.sky)
                        .frame(width: geo.size.width / 2 * CGFloat(a / max))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .environment(\.layoutDirection, .leftToRight)
            }
            .frame(height: 6)
        }
    }
}

// MARK: - التقييمات

struct AcRatingsView: View {
    let detail: AcMatchDetail
    let onOpenPlayer: (Int?) -> Void

    var body: some View {
        if detail.ratings.isEmpty {
            acEmptyText("تقييمات اللاعبين تظهر هنا بعد انطلاق المباراة")
        } else {
            VStack(spacing: 0) {
                if let motm = detail.manOfTheMatch {
                    Button { onOpenPlayer(motm.id) } label: {
                        HStack(spacing: SabqLayout.space12) {
                            Image(systemName: "crown.fill").foregroundStyle(AcTheme.gold)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("رجل المباراة").font(SabqType.tag.font).foregroundStyle(SabqTheme.textSecondary)
                                Text(motm.name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                            }
                            Spacer()
                            AcRatingBadge(rating: motm.rating)
                        }
                        .padding(.horizontal, SabqLayout.space16).padding(.vertical, SabqLayout.space12)
                        .acQuietBlock()
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, SabqLayout.space8)
                }
                ForEach(Array(detail.ratings.enumerated()), id: \.element.id) { index, p in
                    if index > 0 { AcRowDivider() }
                    Button { onOpenPlayer(p.id) } label: { playerRow(p) }
                        .buttonStyle(.plain)
                }
            }
        }
    }

    private func playerRow(_ p: AcPlayerRating) -> some View {
        let teamLogo = p.teamId == detail.fixture.home.id ? detail.fixture.home.logo : detail.fixture.away.logo
        return HStack(spacing: SabqLayout.space12) {
            AcPlayerAvatar(photo: p.photo, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(p.name)\(p.captain ? " (ك)" : "")")
                    .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                Text(subtitle(p)).font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
            }
            Spacer()
            AcRemoteImage(url: teamLogo).frame(width: 16, height: 16)
            AcRatingBadge(rating: p.rating)
        }
        .padding(.vertical, SabqLayout.space12)
        .contentShape(Rectangle())
    }

    private func subtitle(_ p: AcPlayerRating) -> String {
        var parts = [p.position]
        if p.minutes > 0 { parts.append("\(p.minutes) د") }
        if p.goals > 0 { parts.append("\(p.goals) ⚽") }
        if p.assists > 0 { parts.append("\(p.assists) صناعة") }
        return parts.joined(separator: " · ")
    }

}

// MARK: - التوقعات + المواجهات

struct AcPredictionView: View {
    let detail: AcMatchDetail
    @State private var forecast: AcForecast?
    @State private var loaded = false

    private var ft: (home: Int, draw: Int, away: Int)? {
        if let p = detail.prediction { return (p.home, p.draw, p.away) }
        if let f = forecast, f.available { return (f.home, f.draw, f.away) }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            if let ft {
                VStack(spacing: SabqLayout.space12) {
                    bar("فوز \(detail.fixture.home.name)", ft.home, AcStyle.accentFill)
                    bar("التعادل", ft.draw, SabqTheme.textTertiary)
                    bar("فوز \(detail.fixture.away.name)", ft.away, AcTheme.sky)
                }
            } else if loaded {
                Text("لا تتوفر توقعات لهذه المباراة")
                    .font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space4)
            }

            if ft != nil {
                Text("توقعات خوارزمية من مزود البيانات الرياضية — للاستئناس وليست ترجيحًا تحريريًا")
                    .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textTertiary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, alignment: .center)
            }

            SabqSectionBand()
            Text("سجل المواجهات").sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            if detail.headToHead.isEmpty {
                Text("أول مواجهة رسمية بين المنتخبين — التاريخ يبدأ من هنا")
                    .font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space8)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(detail.headToHead.enumerated()), id: \.element.id) { index, m in
                        if index > 0 { AcRowDivider() }
                        h2hRow(m)
                    }
                }
            }
        }
        .task(id: detail.fixture.id) {
            forecast = try? await APIClient.shared.fetchAsianCupForecast(fixtureId: detail.fixture.id)
            loaded = true
        }
    }

    private func bar(_ label: String, _ pct: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            HStack {
                Text(label).font(SabqType.excerpt.font).foregroundStyle(SabqTheme.textPrimary)
                Spacer()
                Text("\(pct)%").font(SabqType.metaEmphasis.font.monospacedDigit()).foregroundStyle(SabqTheme.textPrimary)
            }
            GeometryReader { geo in
                Capsule().fill(SabqTheme.surfaceMuted)
                    .overlay(alignment: .leading) {
                        Capsule().fill(color).frame(width: geo.size.width * CGFloat(pct) / 100)
                    }
            }
            .frame(height: 6)
            .environment(\.layoutDirection, .leftToRight)
        }
    }

    private func h2hRow(_ m: AcFixture) -> some View {
        HStack {
            Text(m.home.name).font(SabqType.excerpt.font).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
            Spacer()
            if m.started {
                Text("\(m.goals.away ?? 0) - \(m.goals.home ?? 0)")
                    .font(SabqType.rowTitle.font.monospacedDigit())
                    .foregroundStyle(SabqTheme.textPrimary)
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text("—").foregroundStyle(SabqTheme.textSecondary)
            }
            Spacer()
            Text(m.away.name).font(SabqType.excerpt.font).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
        }
        .padding(.vertical, SabqLayout.space12)
    }
}
