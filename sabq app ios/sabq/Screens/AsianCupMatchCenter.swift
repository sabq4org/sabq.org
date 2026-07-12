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
                VStack(spacing: 16) {
                    if loading && detail == nil && seed == nil {
                        AcLoading().padding(.top, 30)
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
                        acEmptyText("تعذر جلب تفاصيل المباراة").padding(.top, 50)
                    }
                }
                .padding(16)
            }
            .background(AcTheme.sectionBackground.ignoresSafeArea())
            .navigationTitle("مركز المباراة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(AcTheme.stadiumTop, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white) }
                }
            }
            .task { await load() }
            .task(id: detail?.fixture.id) {
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
        VStack(spacing: 8) {
            HStack(alignment: .top) {
                teamHead(f.home)
                VStack(spacing: 4) {
                    if f.started {
                        Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                            .font(SabqFonts.app(size: 24, weight: .semibold))
                            .foregroundStyle(AcTheme.onDark)
                            .environment(\.layoutDirection, .leftToRight)
                    } else {
                        Text(AcFormat.time(f))
                            .font(SabqFonts.app(size: 20, weight: .semibold))
                            .foregroundStyle(AcTheme.onDark)
                    }
                    AcStatusPill(fixture: f)
                }
                .frame(minWidth: 90)
                teamHead(f.away)
            }
            Text("\(f.round) · \(f.venue.name)\(f.venue.city.isEmpty ? "" : " — \(f.venue.city)") · \(AcFormat.day(f))")
                .font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
    }

    private func teamHead(_ team: AcTeam) -> some View {
        VStack(spacing: 6) {
            AcTeamLogo(team: team, size: 48)
            Text(team.name)
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(AcTheme.onDark)
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
                HStack(spacing: 7) {
                    if followBusy {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: isFollowingMatch ? "bell.fill" : "bell")
                    }
                    Text(isFollowingMatch ? "تتابع المباراة" : "تابع المباراة")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                }
                .foregroundStyle(isFollowingMatch ? .white : AcTheme.emeraldDeep)
                .padding(.horizontal, 14).padding(.vertical, 9)
                .background(Capsule().fill(isFollowingMatch ? AcTheme.emeraldDeep : AcTheme.emerald.opacity(0.14)))
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
                    HStack(spacing: 8) {
                        ForEach(channels) { ch in
                            Text(ch.name)
                                .font(SabqFonts.app(size: 11, weight: .medium))
                                .foregroundStyle(AcTheme.onDark)
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .background(Capsule().fill(AcTheme.chipFill))
                        }
                    }
                }
            }
        }
    }

    // MARK: Tabs

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(tabs, id: \.self) { t in
                    Button {
                        withAnimation(.easeOut(duration: 0.2)) { tab = t }
                    } label: {
                        Text(t.rawValue)
                            .font(SabqFonts.app(size: 12, weight: .medium))
                            .foregroundStyle(tab == t ? .white : AcTheme.onDarkDim)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Capsule().fill(tab == t ? AcTheme.emeraldDeep : AcTheme.chipFill))
                    }
                    .buttonStyle(.plain)
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
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(items) { item in
                        HStack(alignment: .top, spacing: 8) {
                            Text(item.minuteLabel)
                                .font(SabqFonts.app(size: 11, weight: .bold).monospacedDigit())
                                .foregroundStyle(AcTheme.emeraldDeep)
                                .frame(width: 36, alignment: .leading)
                                .environment(\.layoutDirection, .leftToRight)
                            Text(item.textAr.isEmpty ? item.textEn : item.textAr)
                                .font(SabqFonts.app(size: 13))
                                .foregroundStyle(AcTheme.onDark)
                        }
                        .padding(.vertical, 4)
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

    private let barHeight: CGFloat = 96
    private let axisY: CGFloat = 42
    private let topRowY: CGFloat = 20
    private let bottomRowY: CGFloat = 64
    private let barInset: CGFloat = 16

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
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
        HStack(spacing: 8) {
            Text("نتيجة الشوط الأول").font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
            Text("\(ht.away) - \(ht.home)")
                .font(SabqFonts.app(size: 11, weight: .regular).monospacedDigit())
                .foregroundStyle(AcTheme.onDark)
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
        VStack(alignment: .leading, spacing: 10) {
            Text("خط زمن المباراة")
                .font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(AcTheme.emerald)

            GeometryReader { geo in
                let w = geo.size.width
                ZStack(alignment: .topLeading) {
                    Rectangle().fill(AcTheme.emerald.opacity(0.22))
                        .frame(width: w - barInset * 2, height: 2)
                        .position(x: w / 2, y: axisY)
                    ForEach(refMarks, id: \.self) { m in
                        let x = barX(m, width: w)
                        Rectangle().fill(AcTheme.emerald.opacity(0.12))
                            .frame(width: 1, height: barHeight - 22)
                            .position(x: x, y: (barHeight - 22) / 2)
                        Text("\(m)'")
                            .font(SabqFonts.app(size: 8).monospacedDigit())
                            .foregroundStyle(AcTheme.onDarkDim)
                            .position(x: x, y: barHeight - 6)
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

            HStack(spacing: 10) {
                HStack(spacing: 5) {
                    Circle().fill(AcTheme.emerald).frame(width: 7, height: 7)
                    Text("\(detail.fixture.home.name) · أعلى")
                        .font(SabqFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim).lineLimit(1)
                }
                Spacer(minLength: 8)
                HStack(spacing: 5) {
                    Text("\(detail.fixture.away.name) · أسفل")
                        .font(SabqFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim).lineLimit(1)
                    Circle().fill(AcTheme.gold).frame(width: 7, height: 7)
                }
            }
        }
        .padding(12)
        .acElevatedCard()
    }

    private func minuteTiny(_ ev: AcMatchEvent) -> some View {
        Text(minuteLabel(ev))
            .font(SabqFonts.app(size: 8, weight: .semibold).monospacedDigit())
            .foregroundStyle(AcTheme.onDarkDim)
            .environment(\.layoutDirection, .leftToRight)
    }

    @ViewBuilder private func barMarker(_ ev: AcMatchEvent) -> some View {
        switch ev.type {
        case "goal":
            Image(systemName: "soccerball")
                .font(.system(size: 12))
                .foregroundStyle(AcTheme.emeraldDeep)
                .padding(3)
                .background(Circle().fill(.white))
                .overlay(Circle().stroke(AcTheme.emerald.opacity(0.6), lineWidth: 1.5))
        case "yellow-card":
            RoundedRectangle(cornerRadius: 2).fill(AcTheme.gold).frame(width: 9, height: 13)
        case "red-card":
            RoundedRectangle(cornerRadius: 2).fill(AcTheme.liveRed).frame(width: 9, height: 13)
        default:
            EmptyView()
        }
    }

    private var verticalFlow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("مجريات المباراة")
                .font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(AcTheme.emerald)
            ForEach(sorted) { ev in
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
        return HStack(spacing: 10) {
            Circle().fill(isHome ? AcTheme.emerald : AcTheme.gold).frame(width: 8, height: 8)
            Text(minuteLabel(ev))
                .font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit())
                .foregroundStyle(AcTheme.onDarkDim)
                .frame(minWidth: 40)
                .environment(\.layoutDirection, .leftToRight)
            icon(ev.type)
            VStack(alignment: .leading, spacing: 1) {
                Text(ev.player.isEmpty ? ev.label : "\(ev.player) (\(ev.label))")
                    .font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.onDark).lineLimit(1)
                if let extra {
                    Text(extra).font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.sky).lineLimit(1)
                }
                if let assist = ev.assist, ev.type == "goal" {
                    Text("صناعة: \(assist)").font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
                } else if let assist = ev.assist, ev.type == "substitution" {
                    Text("بديلًا عن: \(assist)").font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
                }
            }
            Spacer()
            AcRemoteImage(url: team.logo).frame(width: 20, height: 20)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .acElevatedCard()
    }

    @ViewBuilder private func icon(_ type: String) -> some View {
        switch type {
        case "goal": Image(systemName: "soccerball").foregroundStyle(AcTheme.emeraldDeep)
        case "missed-penalty": Image(systemName: "xmark.circle.fill").foregroundStyle(AcTheme.liveRed)
        case "yellow-card": RoundedRectangle(cornerRadius: 2).fill(AcTheme.gold).frame(width: 11, height: 15)
        case "red-card": RoundedRectangle(cornerRadius: 2).fill(AcTheme.liveRed).frame(width: 11, height: 15)
        case "substitution": Image(systemName: "arrow.left.arrow.right").foregroundStyle(AcTheme.sky)
        case "var": Image(systemName: "tv").foregroundStyle(.purple)
        default: Image(systemName: "circle.fill").foregroundStyle(AcTheme.onDarkDim)
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
        VStack(spacing: 14) {
            if let m = momentum, m.available, !m.points.isEmpty {
                if let p = m.possession {
                    HStack {
                        Text("\(p.home)%").font(SabqFonts.app(size: 12, weight: .bold).monospacedDigit())
                        Spacer()
                        Text("الاستحواذ").font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
                        Spacer()
                        Text("\(p.away)%").font(SabqFonts.app(size: 12, weight: .bold).monospacedDigit())
                    }
                    .foregroundStyle(AcTheme.onDark)
                }
                Text("الزخم الهجومي — أعلى: \(homeName) · أسفل: \(awayName)")
                    .font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
                    .multilineTextAlignment(.center)
                Chart(m.points) { pt in
                    BarMark(x: .value("د", pt.minute), y: .value("صافي", pt.net))
                        .foregroundStyle(pt.net >= 0 ? AcTheme.emeraldDeep : AcTheme.gold)
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
        VStack(spacing: 14) {
            if let d = pressure, d.available, !d.points.isEmpty {
                if live, let latest = d.latest, latest.side != "even" {
                    HStack(spacing: 8) {
                        Image(systemName: "gauge.medium").foregroundStyle(AcTheme.emerald)
                        Text("الأكثر سيطرة الآن:").font(SabqFonts.app(size: 13)).foregroundStyle(AcTheme.onDarkDim)
                        Text(latest.side == "home" ? homeName : awayName)
                            .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(AcTheme.onDark)
                        Text("\(Int(latest.value))")
                            .font(SabqFonts.app(size: 11, weight: .regular).monospacedDigit())
                            .foregroundStyle(AcTheme.onDark)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Capsule().fill(AcTheme.chipFill))
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                Text("مؤشّر الضغط لحظة بلحظة — أعلى: \(homeName) · أسفل: \(awayName)")
                    .font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
                    .multilineTextAlignment(.center)
                Chart(d.points) { p in
                    BarMark(x: .value("الدقيقة", p.minute), y: .value("الضغط", p.net))
                        .foregroundStyle(p.net >= 0 ? AcTheme.emeraldDeep : AcTheme.liveRed)
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
            VStack(spacing: 18) {
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
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(lineup.teamName).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.onDark)
                Spacer()
                if let f = lineup.formation {
                    Text(f).font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit())
                        .foregroundStyle(AcTheme.onDarkDim)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Capsule().fill(AcTheme.chipFill))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            pitch
            if !lineup.coach.isEmpty {
                Text("المدرب: \(lineup.coach)").font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
            }
            if !lineup.substitutes.isEmpty { bench }
        }
    }

    private var bench: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "figure.seated.side").font(.system(size: 11, weight: .medium)).foregroundStyle(AcTheme.emerald)
                Text("دكة البدلاء").font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(AcTheme.emerald)
                Text("(\(lineup.substitutes.count))").font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(lineup.substitutes) { p in
                    Button { onOpenPlayer(p.id) } label: { benchRow(p) }
                        .buttonStyle(.plain)
                }
            }
        }
        .padding(.top, 4)
    }

    private func benchRow(_ p: AcLineupPlayer) -> some View {
        HStack(spacing: 8) {
            Text(p.number.map { "\($0)" } ?? "•")
                .font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit()).foregroundStyle(AcTheme.emeraldDeep)
                .frame(width: 22, height: 22)
                .background(Circle().fill(AcTheme.emerald.opacity(0.15)))
                .environment(\.layoutDirection, .leftToRight)
            Text(p.name)
                .font(SabqFonts.app(size: 11, weight: .regular)).foregroundStyle(AcTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(AcTheme.chipFill))
    }

    private var pitch: some View {
        GeometryReader { geo in
            let r = rows
            ZStack {
                LinearGradient(colors: [AcTheme.pitchTop, AcTheme.pitchBottom], startPoint: .top, endPoint: .bottom)
                RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.25), lineWidth: 1).padding(8)
                Rectangle().fill(.white.opacity(0.2)).frame(height: 1)
                Circle().stroke(.white.opacity(0.25), lineWidth: 1).frame(width: 64, height: 64)

                if r.isEmpty {
                    Text("التشكيلة غير متاحة بعد").font(SabqFonts.app(size: 12)).foregroundStyle(.white.opacity(0.8))
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
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func playerDot(_ p: AcLineupPlayer) -> some View {
        Button { onOpenPlayer(p.id) } label: {
            VStack(spacing: 2) {
                Text(p.number.map { "\($0)" } ?? "•")
                    .font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit()).foregroundStyle(AcTheme.pitchBottom)
                    .frame(width: 28, height: 28).background(Circle().fill(.white))
                Text(p.name).font(SabqFonts.app(size: 9, weight: .regular)).foregroundStyle(.white)
                    .lineLimit(1).frame(maxWidth: 56)
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
        VStack(spacing: 14) {
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
        VStack(spacing: 10) {
            statRow(AcStatistic(key: "xg", label: "الأهداف المتوقعة (xG)",
                                home: String(format: "%.2f", home.xg),
                                away: String(format: "%.2f", away.xg)))
            if home.xgot > 0 || away.xgot > 0 {
                HStack {
                    Text(String(format: "%.2f", home.xgot))
                        .font(SabqFonts.app(size: 11).monospacedDigit()).foregroundStyle(AcTheme.onDarkDim)
                        .frame(width: 48, alignment: .leading)
                    Spacer()
                    Text("على المرمى (xGoT)").font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
                    Spacer()
                    Text(String(format: "%.2f", away.xgot))
                        .font(SabqFonts.app(size: 11).monospacedDigit()).foregroundStyle(AcTheme.onDarkDim)
                        .frame(width: 48, alignment: .trailing)
                }
            }
            if !top.isEmpty {
                Divider().overlay(AcTheme.cardStroke)
                VStack(alignment: .leading, spacing: 5) {
                    Text("الأعلى خطورة (xG)").font(SabqFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim)
                    ForEach(Array(top.prefix(3))) { p in
                        HStack(spacing: 8) {
                            AcRemoteImage(url: p.location == "home" ? detail.fixture.home.logo : detail.fixture.away.logo)
                                .frame(width: 16, height: 16)
                            Text(p.name).font(SabqFonts.app(size: 12)).foregroundStyle(AcTheme.onDark).lineLimit(1)
                            Spacer()
                            Text(String(format: "%.2f", p.xg))
                                .font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit()).foregroundStyle(AcTheme.onDark)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(14)
        .acElevatedCard()
    }

    private func weatherCard(_ w: AcWeather) -> some View {
        HStack(spacing: 12) {
            if w.icon.isEmpty {
                Image(systemName: "cloud.fill").font(.system(size: 24)).foregroundStyle(AcTheme.sky)
            } else {
                AcRemoteImage(url: w.icon).frame(width: 34, height: 34)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(w.description).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.onDark)
                    if w.type == "forecast" {
                        Text("· توقّع").font(SabqFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim)
                    }
                }
                HStack(spacing: 12) {
                    if let t = w.temp {
                        Text("\(t)°م").font(SabqFonts.app(size: 11).monospacedDigit()).foregroundStyle(AcTheme.onDarkDim)
                    }
                    if let h = w.humidity, !h.isEmpty {
                        HStack(spacing: 2) {
                            Image(systemName: "drop.fill").font(.system(size: 9))
                            Text(h)
                        }
                        .font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
                    }
                }
            }
            Spacer()
        }
        .padding(12)
        .acElevatedCard()
    }

    private func absenteesView(_ list: [AcAbsentee]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "bandage.fill").font(.system(size: 12)).foregroundStyle(AcTheme.liveRed)
                Text("الغيابات").font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(AcTheme.liveRed)
            }
            HStack(alignment: .top, spacing: 12) {
                absenteeCol(detail.fixture.home, list.filter { $0.location == "home" })
                absenteeCol(detail.fixture.away, list.filter { $0.location == "away" })
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .acElevatedCard()
    }

    private func absenteeCol(_ team: AcTeam, _ players: [AcAbsentee]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                AcRemoteImage(url: team.logo).frame(width: 16, height: 16)
                Text(team.name).font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(AcTheme.onDark).lineLimit(1)
            }
            if players.isEmpty {
                Text("—").font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
            } else {
                ForEach(players) { p in
                    Text("\(p.name)\(p.reason.isEmpty ? "" : " — \(p.reason)")")
                        .font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim).lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func statRow(_ s: AcStatistic) -> some View {
        let h = Double(s.home.replacingOccurrences(of: "%", with: "")) ?? 0
        let a = Double(s.away.replacingOccurrences(of: "%", with: "")) ?? 0
        let max = (h + a) == 0 ? 1 : (h + a)
        return VStack(spacing: 5) {
            HStack {
                Text(s.home).font(SabqFonts.app(size: 14, weight: .semibold)).frame(width: 48, alignment: .leading)
                Spacer()
                Text(s.label).font(SabqFonts.app(size: 12)).foregroundStyle(AcTheme.onDarkDim)
                Spacer()
                Text(s.away).font(SabqFonts.app(size: 14, weight: .semibold)).frame(width: 48, alignment: .trailing)
            }
            .foregroundStyle(AcTheme.onDark)
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule().fill(AcTheme.emeraldDeep)
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
            VStack(spacing: 8) {
                if let motm = detail.manOfTheMatch {
                    Button { onOpenPlayer(motm.id) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "crown.fill").foregroundStyle(AcTheme.gold)
                            VStack(alignment: .leading, spacing: 1) {
                                Text("رجل المباراة").font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(AcTheme.gold)
                                Text(motm.name).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.onDark)
                            }
                            Spacer()
                            ratingBadge(motm.rating)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(AcTheme.gold.opacity(0.12)))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(AcTheme.gold.opacity(0.3), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
                ForEach(detail.ratings) { p in
                    Button { onOpenPlayer(p.id) } label: { playerRow(p) }
                        .buttonStyle(.plain)
                }
            }
        }
    }

    private func playerRow(_ p: AcPlayerRating) -> some View {
        let teamLogo = p.teamId == detail.fixture.home.id ? detail.fixture.home.logo : detail.fixture.away.logo
        return HStack(spacing: 10) {
            if p.photo.isEmpty {
                Circle().fill(AcTheme.chipFill).frame(width: 32, height: 32)
            } else {
                AcRemoteImage(url: p.photo, contentMode: .fill).frame(width: 32, height: 32).clipShape(Circle())
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("\(p.name)\(p.captain ? " (ك)" : "")")
                    .font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.onDark).lineLimit(1)
                Text(subtitle(p)).font(SabqFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim)
            }
            Spacer()
            AcRemoteImage(url: teamLogo).frame(width: 16, height: 16)
            ratingBadge(p.rating)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .acElevatedCard()
    }

    private func subtitle(_ p: AcPlayerRating) -> String {
        var parts = [p.position]
        if p.minutes > 0 { parts.append("\(p.minutes) د") }
        if p.goals > 0 { parts.append("\(p.goals) ⚽") }
        if p.assists > 0 { parts.append("\(p.assists) صناعة") }
        return parts.joined(separator: " · ")
    }

    private func ratingBadge(_ rating: Double) -> some View {
        Text(String(format: "%.1f", rating))
            .font(SabqFonts.app(size: 11, weight: .regular).monospacedDigit())
            .foregroundStyle(.white)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(RoundedRectangle(cornerRadius: 8).fill(ratingColor(rating)))
            .environment(\.layoutDirection, .leftToRight)
    }

    private func ratingColor(_ r: Double) -> Color {
        if r >= 8 { return AcTheme.emeraldDeep }
        if r >= 7 { return AcTheme.leaf }
        if r >= 6 { return AcTheme.gold }
        return AcTheme.liveRed
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
        VStack(alignment: .leading, spacing: 16) {
            if let ft {
                VStack(spacing: 10) {
                    bar("فوز \(detail.fixture.home.name)", ft.home, AcTheme.emeraldDeep)
                    bar("التعادل", ft.draw, AcTheme.onDarkDim)
                    bar("فوز \(detail.fixture.away.name)", ft.away, AcTheme.sky)
                }
            } else if loaded {
                Text("لا تتوفر توقعات لهذه المباراة")
                    .font(SabqFonts.app(size: 13)).foregroundStyle(AcTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 4)
            }

            if ft != nil {
                Text("توقعات خوارزمية من مزود البيانات الرياضية — للاستئناس وليست ترجيحًا تحريريًا")
                    .font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
                    .frame(maxWidth: .infinity, alignment: .center)
            }

            Divider().overlay(AcTheme.cardStroke)
            Text("سجل المواجهات").font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(AcTheme.emeraldDeep)
            if detail.headToHead.isEmpty {
                Text("أول مواجهة رسمية بين المنتخبين — التاريخ يبدأ من هنا")
                    .font(SabqFonts.app(size: 12)).foregroundStyle(AcTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 6)
            } else {
                ForEach(detail.headToHead) { m in
                    h2hRow(m)
                }
            }
        }
        .task(id: detail.fixture.id) {
            forecast = try? await APIClient.shared.fetchAsianCupForecast(fixtureId: detail.fixture.id)
            loaded = true
        }
    }

    private func bar(_ label: String, _ pct: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(SabqFonts.app(size: 12)).foregroundStyle(AcTheme.onDark)
                Spacer()
                Text("\(pct)%").font(SabqFonts.app(size: 12, weight: .semibold).monospacedDigit()).foregroundStyle(color)
            }
            GeometryReader { geo in
                Capsule().fill(AcTheme.chipFill)
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
            Text(m.home.name).font(SabqFonts.app(size: 12)).foregroundStyle(AcTheme.onDark).lineLimit(1)
            Spacer()
            if m.started {
                Text("\(m.goals.away ?? 0) - \(m.goals.home ?? 0)")
                    .font(SabqFonts.app(size: 13, weight: .bold).monospacedDigit())
                    .foregroundStyle(AcTheme.onDark)
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text("—").foregroundStyle(AcTheme.onDarkDim)
            }
            Spacer()
            Text(m.away.name).font(SabqFonts.app(size: 12)).foregroundStyle(AcTheme.onDark).lineLimit(1)
        }
        .padding(.vertical, 6)
    }
}
