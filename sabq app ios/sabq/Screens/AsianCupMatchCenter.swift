import SwiftUI
import Charts

// MARK: - مركز مباراة كأس آسيا (parity مونديال سبق)

struct AsianCupMatchCenter: View {
    let fixtureId: Int
    var seed: AcFixture? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var detail: AcMatchDetail?
    @State private var loading = true
    @State private var commentary: AcCommentary?
    @State private var momentum: AcMomentum?
    @State private var pressure: AcPressure?
    @State private var selectedPlayer: AcPlayerSelection?
    @State private var isFollowingMatch = false
    @State private var followBusy = false
    @State private var showLogin = false
    @Environment(AuthStore.self) private var authStore

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
        if started, commentary?.available == true, !(commentary?.items.isEmpty ?? true) {
            t.append(.commentary)
        } else if started {
            t.append(.commentary) // يظهر حتى يُحمَّل؛ المحتوى يُخفى إن فارغ
        }
        t.append(.events)
        if started {
            if momentum?.available == true { t.append(.momentum) }
            if pressure?.available == true { t.append(.pressure) }
        }
        t.append(contentsOf: [.lineups, .stats])
        if let d = detail, !d.ratings.isEmpty { t.append(.ratings) }
        if detail?.prediction != nil { t.append(.prediction) }
        return t
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 16) {
                    if let f = detail?.fixture ?? seed {
                        header(f)
                        followMatchBar(f)
                        if !f.status.finished {
                            tvStrip
                        }
                        tabBar
                        if let detail {
                            content(detail)
                        } else if loading {
                            AcLoading()
                        } else {
                            acEmptyText("تعذر جلب تفاصيل المباراة")
                        }
                    } else if loading {
                        AcLoading().padding(.top, 30)
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
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 8_000_000_000)
                    if Task.isCancelled { return }
                    guard let f = detail?.fixture else { continue }
                    if f.status.live { await load(force: true) }
                }
            }
            .refreshable { await load(force: true) }
            .sheet(item: $selectedPlayer) { sel in
                AcPlayerSheet(playerId: sel.id).presentationDetents([.large])
            }
            .sheet(isPresented: $showLogin) {
                LoginSheet()
            }
        }
        .sabqRTL()
    }

    // MARK: Header

    private func header(_ f: AcFixture) -> some View {
        VStack(spacing: 12) {
            Text(f.round)
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(.white.opacity(0.7))
            HStack(spacing: 16) {
                teamSide(f.home)
                VStack(spacing: 4) {
                    if f.started {
                        Text("\(f.goals.home ?? 0) – \(f.goals.away ?? 0)")
                            .font(SabqFonts.app(size: 28, weight: .bold).monospacedDigit())
                            .foregroundStyle(.white)
                            .environment(\.layoutDirection, .leftToRight)
                    } else {
                        Text(AcFormat.time(f))
                            .font(SabqFonts.app(size: 22, weight: .bold))
                            .foregroundStyle(AcTheme.gold)
                    }
                    AcStatusPill(fixture: f, onDark: true)
                }
                teamSide(f.away)
            }
            if !f.venue.name.isEmpty {
                Text("\(f.venue.name)\(f.venue.city.isEmpty ? "" : " · \(f.venue.city)")")
                    .font(SabqFonts.app(size: 11))
                    .foregroundStyle(.white.opacity(0.65))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(
            LinearGradient(colors: [AcTheme.stadiumTop, AcTheme.stadiumBottom], startPoint: .top, endPoint: .bottom)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func teamSide(_ team: AcTeam) -> some View {
        VStack(spacing: 6) {
            AcTeamLogo(team: team, size: 52)
            Text(team.name)
                .font(SabqFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(width: 80)
        }
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
                            .font(SabqFonts.app(size: 13, weight: .semibold))
                            .foregroundStyle(tab == t ? .white : AcTheme.onDarkDim)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Capsule().fill(tab == t ? AcTheme.emeraldDeep : AcTheme.chipFill))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .onChange(of: tabs) { _, newTabs in
            if !didPickDefaultTab, let first = newTabs.first {
                tab = first
                didPickDefaultTab = true
            } else if !newTabs.contains(tab), let first = newTabs.first {
                tab = first
            }
        }
    }

    @ViewBuilder
    private func content(_ detail: AcMatchDetail) -> some View {
        switch tab {
        case .commentary:
            commentaryBlock
        case .events:
            eventsBlock(detail.events)
        case .momentum:
            momentumBlock
        case .pressure:
            pressureBlock
        case .lineups:
            lineupsBlock(detail.lineups)
        case .stats:
            statsBlock(detail.statistics)
        case .ratings:
            ratingsBlock(detail.ratings, motm: detail.manOfTheMatch)
        case .prediction:
            if let p = detail.prediction {
                predictionBlock(p, h2h: detail.headToHead)
            } else {
                acEmptyText("التوقع غير متاح")
            }
        }
    }

    private var commentaryBlock: some View {
        Group {
            if let items = commentary?.items, !items.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(items) { item in
                        HStack(alignment: .top, spacing: 8) {
                            Text("\(item.minute)'")
                                .font(SabqFonts.app(size: 11, weight: .bold).monospacedDigit())
                                .foregroundStyle(AcTheme.emeraldDeep)
                                .frame(width: 28, alignment: .leading)
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
        .task {
            if commentary == nil {
                commentary = try? await APIClient.shared.fetchAsianCupCommentary(fixtureId: fixtureId)
            }
        }
    }

    private func eventsBlock(_ events: [AcMatchEvent]) -> some View {
        Group {
            if events.isEmpty {
                acEmptyText("لا أحداث بعد")
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(events) { ev in
                        Button {
                            if let sel = AcPlayerSelection(ev.playerId) { selectedPlayer = sel }
                        } label: {
                            HStack(spacing: 8) {
                                Text("\(ev.minute)'")
                                    .font(SabqFonts.app(size: 11, weight: .bold).monospacedDigit())
                                    .foregroundStyle(AcTheme.emeraldDeep)
                                    .frame(width: 28, alignment: .leading)
                                Text(ev.label)
                                    .font(SabqFonts.app(size: 11, weight: .medium))
                                    .foregroundStyle(AcTheme.onDarkDim)
                                    .frame(width: 56, alignment: .leading)
                                Text(ev.player)
                                    .font(SabqFonts.app(size: 13, weight: .semibold))
                                    .foregroundStyle(AcTheme.onDark)
                                    .lineLimit(1)
                                Spacer()
                                if let a = ev.assist, !a.isEmpty {
                                    Text(a)
                                        .font(SabqFonts.app(size: 11))
                                        .foregroundStyle(AcTheme.onDarkDim)
                                        .lineLimit(1)
                                }
                            }
                            .padding(.vertical, 6)
                        }
                        .buttonStyle(.plain)
                        .disabled(ev.playerId == nil || (ev.playerId ?? 0) <= 0)
                    }
                }
            }
        }
    }

    private var momentumBlock: some View {
        Group {
            if let m = momentum, m.available, !m.points.isEmpty {
                chart(points: m.points, title: "الزخم الهجومي")
            } else {
                acEmptyText("الزخم غير متاح")
            }
        }
        .task {
            if momentum == nil {
                momentum = try? await APIClient.shared.fetchAsianCupMomentum(fixtureId: fixtureId)
            }
        }
    }

    private var pressureBlock: some View {
        Group {
            if let p = pressure, p.available, !p.points.isEmpty {
                chart(points: p.points, title: "مؤشّر الضغط")
            } else {
                acEmptyText("الضغط غير متاح")
            }
        }
        .task {
            if pressure == nil {
                pressure = try? await APIClient.shared.fetchAsianCupPressure(fixtureId: fixtureId)
            }
        }
    }

    private func chart(points: [AcMomentumPoint], title: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(AcTheme.onDark)
            Chart(points) { pt in
                BarMark(
                    x: .value("د", pt.minute),
                    y: .value("صافي", pt.net)
                )
                .foregroundStyle(pt.net >= 0 ? AcTheme.emeraldDeep : AcTheme.gold)
            }
            .frame(height: 160)
            .environment(\.layoutDirection, .leftToRight)
        }
        .padding(12)
        .acElevatedCard()
    }

    private func lineupsBlock(_ lineups: [AcLineup]) -> some View {
        Group {
            if lineups.isEmpty {
                acEmptyText("التشكيلة لم تُعلن بعد")
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(lineups) { lu in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(lu.teamName)
                                    .font(SabqFonts.app(size: 14, weight: .bold))
                                    .foregroundStyle(AcTheme.onDark)
                                if let form = lu.formation, !form.isEmpty {
                                    Text(form)
                                        .font(SabqFonts.app(size: 12))
                                        .foregroundStyle(AcTheme.emeraldDeep)
                                }
                                Spacer()
                                if !lu.coach.isEmpty {
                                    Text(lu.coach)
                                        .font(SabqFonts.app(size: 11))
                                        .foregroundStyle(AcTheme.onDarkDim)
                                }
                            }
                            ForEach(lu.startXI) { p in
                                playerLine(p, badge: true)
                            }
                            if !lu.substitutes.isEmpty {
                                Text("البدلاء")
                                    .font(SabqFonts.app(size: 11, weight: .medium))
                                    .foregroundStyle(AcTheme.onDarkDim)
                                    .padding(.top, 4)
                                ForEach(lu.substitutes) { p in
                                    playerLine(p, badge: false)
                                }
                            }
                        }
                        .padding(12)
                        .acElevatedCard()
                    }
                }
            }
        }
    }

    private func playerLine(_ p: AcLineupPlayer, badge: Bool) -> some View {
        Button {
            if let sel = AcPlayerSelection(p.id) { selectedPlayer = sel }
        } label: {
            HStack(spacing: 8) {
                if let n = p.number {
                    Text("\(n)")
                        .font(SabqFonts.app(size: 11, weight: .bold).monospacedDigit())
                        .foregroundStyle(badge ? AcTheme.emeraldDeep : AcTheme.onDarkDim)
                        .frame(width: 22)
                }
                Text(p.name)
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(AcTheme.onDark)
                Spacer()
                if let pos = p.position, !pos.isEmpty {
                    Text(pos)
                        .font(SabqFonts.app(size: 10))
                        .foregroundStyle(AcTheme.onDarkDim)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(p.id <= 0)
    }

    private func statsBlock(_ stats: [AcStatistic]) -> some View {
        Group {
            if stats.isEmpty {
                acEmptyText("لا إحصائيات بعد")
            } else {
                VStack(spacing: 10) {
                    ForEach(stats) { s in
                        VStack(spacing: 4) {
                            HStack {
                                Text(s.home).font(SabqFonts.app(size: 13, weight: .bold).monospacedDigit())
                                Spacer()
                                Text(s.label).font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
                                Spacer()
                                Text(s.away).font(SabqFonts.app(size: 13, weight: .bold).monospacedDigit())
                            }
                            .foregroundStyle(AcTheme.onDark)
                            GeometryReader { geo in
                                let h = Double(s.home) ?? 0
                                let a = Double(s.away) ?? 0
                                let total = max(h + a, 1)
                                HStack(spacing: 2) {
                                    RoundedRectangle(cornerRadius: 2).fill(AcTheme.emeraldDeep)
                                        .frame(width: geo.size.width * h / total)
                                    RoundedRectangle(cornerRadius: 2).fill(AcTheme.gold)
                                        .frame(width: geo.size.width * a / total)
                                }
                            }
                            .frame(height: 4)
                        }
                    }
                }
                .padding(12)
                .acElevatedCard()
            }
        }
    }

    private func ratingsBlock(_ ratings: [AcPlayerRating], motm: AcPlayerRating?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let m = motm {
                HStack(spacing: 10) {
                    AcRemoteImage(url: m.photo, contentMode: .fill)
                        .frame(width: 44, height: 44).clipShape(Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text("رجل المباراة").font(SabqFonts.app(size: 10)).foregroundStyle(AcTheme.gold)
                        Text(m.name).font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(AcTheme.onDark)
                    }
                    Spacer()
                    Text(String(format: "%.1f", m.rating))
                        .font(SabqFonts.app(size: 18, weight: .bold).monospacedDigit())
                        .foregroundStyle(AcTheme.gold)
                }
                .padding(12)
                .acElevatedCard()
            }
            ForEach(ratings) { r in
                Button {
                    if let sel = AcPlayerSelection(r.id) { selectedPlayer = sel }
                } label: {
                    HStack {
                        AcRemoteImage(url: r.photo, contentMode: .fill)
                            .frame(width: 32, height: 32).clipShape(Circle())
                        Text(r.name).font(SabqFonts.app(size: 13, weight: .medium)).foregroundStyle(AcTheme.onDark)
                        Spacer()
                        Text(String(format: "%.1f", r.rating))
                            .font(SabqFonts.app(size: 14, weight: .bold).monospacedDigit())
                            .foregroundStyle(AcTheme.emeraldDeep)
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func predictionBlock(_ p: AcMatchPrediction, h2h: [AcFixture]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                predCol("فوز المضيف", p.home)
                predCol("تعادل", p.draw)
                predCol("فوز الضيف", p.away)
            }
            if !h2h.isEmpty {
                Text("المواجهات السابقة")
                    .font(SabqFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                ForEach(h2h.prefix(5)) { fx in
                    HStack {
                        Text(fx.home.name).lineLimit(1)
                        Spacer()
                        Text("\(fx.goals.home ?? 0)–\(fx.goals.away ?? 0)")
                            .font(SabqFonts.app(size: 13, weight: .bold).monospacedDigit())
                            .environment(\.layoutDirection, .leftToRight)
                        Spacer()
                        Text(fx.away.name).lineLimit(1)
                    }
                    .font(SabqFonts.app(size: 12))
                    .foregroundStyle(AcTheme.onDark)
                }
            }
        }
        .padding(12)
        .acElevatedCard()
    }

    private func predCol(_ label: String, _ value: Int) -> some View {
        VStack(spacing: 4) {
            Text("\(value)%")
                .font(SabqFonts.app(size: 18, weight: .bold).monospacedDigit())
                .foregroundStyle(AcTheme.emeraldDeep)
            Text(label)
                .font(SabqFonts.app(size: 10))
                .foregroundStyle(AcTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Load / Follow

    private func load(force: Bool = false) async {
        let result = try? await APIClient.shared.fetchAsianCupMatch(fixtureId: fixtureId, ignoreCache: force)
        await MainActor.run {
            detail = result
            loading = false
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
