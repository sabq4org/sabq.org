import SwiftUI

// MARK: - مركز مباراة كأس الملك
//
// أحداث لحظة بلحظة، التشكيلات على ملعب 2D، والإحصائيات. يُعرض كـ sheet من أي
// بطاقة مباراة. أبسط من مركز مباراة المونديال (لا زخم/ضغط/تعليق حي/تقييمات —
// هذه غير متاحة في بيانات كأس الملك من API-Football).

struct KingsCupMatchCenter: View {
    let fixtureId: Int
    /// المباراة الممرَّرة من البطاقة الفاتحة — ترسم الترويسة فورًا بلا انتظار
    /// نداء التفاصيل (كان الفتح البارد يحجب الشاشة كلها عدة ثوانٍ)
    var seed: KcFixture? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var detail: KcMatchDetail?
    @State private var loading = true

    enum Tab: String, CaseIterable {
        case events = "الأحداث", lineups = "التشكيلات", stats = "الإحصائيات", ratings = "التقييمات"
    }
    @State private var tab: Tab = .events
    @State private var openPlayer: KcPlayerSelection?

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 16) {
                    if let f = detail?.fixture ?? seed {
                        header(f)
                        if !f.status.finished {
                            KcFetchedPrediction(fixture: f)
                            KcTvStrip(fixtureId: f.id)
                        }
                        tabBar
                        if let detail {
                            content(detail)
                        } else if loading {
                            KcLoading()
                        } else {
                            retryBlock
                        }
                    } else if loading {
                        KcLoading().padding(.top, 30)
                    } else {
                        retryBlock.padding(.top, 50)
                    }
                }
                .padding(16)
            }
            .background(WCTheme.sectionBackground.ignoresSafeArea())
            .navigationTitle("مركز المباراة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(WCTheme.stadiumTop, for: .navigationBar)
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
                    try? await Task.sleep(nanoseconds: 8_000_000_000)
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
            .refreshable { await load(force: true) }
            .sheet(item: $openPlayer) { sel in
                KcPlayerSheet(playerId: sel.id).presentationDetents([.large])
            }
        }
        .sabqRTL()
    }

    private var retryBlock: some View {
        VStack(spacing: 10) {
            Text("تعذر جلب تفاصيل المباراة")
                .font(SabqFonts.app(size: 14)).foregroundStyle(WCTheme.onDarkDim)
            Button {
                loading = true
                Task { await load(force: true) }
            } label: {
                Text("إعادة المحاولة")
                    .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(.white)
                    .padding(.horizontal, 20).padding(.vertical, 8)
                    .background(Capsule().fill(WCTheme.emeraldDeep))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
    }

    private func load(force: Bool = false) async {
        // محاولتان (فشل حد الدقيقة العابر يُعاد تلقائيًا) قبل إظهار زر الإعادة
        let r = await kcRetrying { try await APIClient.shared.fetchKingsCupMatch(fixtureId: fixtureId, ignoreCache: force) }
        await MainActor.run {
            if let r { detail = r }
            loading = false
        }
    }

    // MARK: ترويسة

    private func header(_ f: KcFixture) -> some View {
        VStack(spacing: 8) {
            HStack(alignment: .top) {
                teamHead(f.home)
                VStack(spacing: 4) {
                    if f.started {
                        Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                            .font(SabqFonts.app(size: 24, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                            .environment(\.layoutDirection, .leftToRight)
                    } else {
                        Text(KcFormat.time(f)).font(SabqFonts.app(size: 20, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                    }
                    KcStatusPill(fixture: f)
                }
                .frame(minWidth: 90)
                teamHead(f.away)
            }
            if let po = f.penaltyOutcome {
                Text("فاز \(po.winnerName) بركلات الترجيح (\(po.winnerScore)-\(po.loserScore))")
                    .font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(WCTheme.emeraldDeep)
            }
            Text(headerLine(f))
                .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
    }

    private func headerLine(_ f: KcFixture) -> String {
        var parts = [f.round]
        let venue = [f.venue.name, f.venue.city].filter { !$0.isEmpty }.joined(separator: " — ")
        if !venue.isEmpty { parts.append(venue) }
        parts.append(KcFormat.day(f))
        return parts.joined(separator: " · ")
    }

    private func teamHead(_ team: KcTeam) -> some View {
        VStack(spacing: 6) {
            KcTeamLogo(team: team, size: 48, ring: WCTheme.cardStroke)
            Text(team.name).font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(WCTheme.onDark)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: التبويبات

    private var tabBar: some View {
        HStack(spacing: 8) {
            ForEach(Tab.allCases, id: \.self) { t in
                Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                    Text(t.rawValue)
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(tab == t ? .white : WCTheme.onDarkDim)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(tab == t ? WCTheme.emeraldDeep : WCTheme.chipFill))
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder private func content(_ d: KcMatchDetail) -> some View {
        switch tab {
        case .events: KcEventsTimeline(detail: d)
        case .lineups: KcLineupsView(detail: d)
        case .stats: KcStatsView(detail: d)
        case .ratings: KcRatingsView(detail: d) { openPlayer = KcPlayerSelection(id: $0) }
        }
    }
}

/// غلاف Identifiable لفتح بطاقة لاعب كـ sheet.
nonisolated struct KcPlayerSelection: Identifiable, Hashable { let id: Int }

// MARK: - الأحداث

struct KcEventsTimeline: View {
    let detail: KcMatchDetail

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if detail.events.isEmpty {
                kcEmptyText("الأحداث تظهر هنا لحظة بلحظة مع انطلاق المباراة")
            } else {
                Text("مجريات المباراة").font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(WCTheme.emerald)
                ForEach(sorted) { ev in row(ev) }
            }
        }
    }

    private var sorted: [KcMatchEvent] {
        detail.events.sorted { ($0.minute ?? 0, $0.extra ?? 0) > ($1.minute ?? 0, $1.extra ?? 0) }
    }

    private func row(_ ev: KcMatchEvent) -> some View {
        let isHome = ev.teamId == detail.fixture.home.id
        let team = isHome ? detail.fixture.home : detail.fixture.away
        return HStack(spacing: 10) {
            Circle().fill(isHome ? WCTheme.emerald : WCTheme.gold).frame(width: 8, height: 8)
            Text(ev.minuteLabel)
                .font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit())
                .foregroundStyle(WCTheme.onDarkDim)
                .frame(minWidth: 40)
                .environment(\.layoutDirection, .leftToRight)
            icon(ev.type)
            VStack(alignment: .leading, spacing: 1) {
                Text(ev.player.isEmpty ? ev.label : "\(ev.player) (\(ev.label))")
                    .font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                if let assist = ev.assist, !assist.isEmpty {
                    Text(ev.type == "substitution" ? "بديلًا عن: \(assist)" : "صناعة: \(assist)")
                        .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                }
            }
            Spacer()
            WCRemoteImage(url: team.logo).frame(width: 20, height: 20)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .wcElevatedCard()
    }

    @ViewBuilder private func icon(_ type: String) -> some View {
        switch type {
        case "goal": Image(systemName: "soccerball").foregroundStyle(WCTheme.emeraldDeep)
        case "missed-penalty": Image(systemName: "xmark.circle.fill").foregroundStyle(WCTheme.liveRed)
        case "yellow-card": RoundedRectangle(cornerRadius: 2).fill(WCTheme.gold).frame(width: 11, height: 15)
        case "red-card": RoundedRectangle(cornerRadius: 2).fill(WCTheme.liveRed).frame(width: 11, height: 15)
        case "substitution": Image(systemName: "arrow.left.arrow.right").foregroundStyle(WCTheme.sky)
        case "var": Image(systemName: "tv").foregroundStyle(.purple)
        default: Image(systemName: "circle.fill").foregroundStyle(WCTheme.onDarkDim)
        }
    }
}

// MARK: - التشكيلات (ملعب 2D)

struct KcLineupsView: View {
    let detail: KcMatchDetail

    var body: some View {
        if detail.lineups.isEmpty {
            kcEmptyText("التشكيلات تُعلن قبل انطلاق المباراة بنحو 20–40 دقيقة")
        } else {
            VStack(spacing: 18) {
                ForEach(detail.lineups) { lineup in KcPitch(lineup: lineup) }
            }
        }
    }
}

struct KcPitch: View {
    let lineup: KcLineup

    private var rows: [[KcLineupPlayer]] {
        var byRow: [Int: [(col: Int, p: KcLineupPlayer)]] = [:]
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
                Text(lineup.team.name).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                Spacer()
                if let f = lineup.formation {
                    Text(f).font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit())
                        .foregroundStyle(WCTheme.onDarkDim)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Capsule().fill(WCTheme.chipFill))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            pitch
            if let coach = lineup.coach, !coach.isEmpty {
                Text("المدرب: \(coach)").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
            }
            if !lineup.substitutes.isEmpty { bench }
        }
    }

    private var bench: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "figure.seated.side").font(.system(size: 11, weight: .medium)).foregroundStyle(WCTheme.emerald)
                Text("دكة البدلاء").font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(WCTheme.emerald)
                Text("(\(lineup.substitutes.count))").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(lineup.substitutes) { p in benchRow(p) }
            }
        }
        .padding(.top, 4)
    }

    private func benchRow(_ p: KcLineupPlayer) -> some View {
        HStack(spacing: 8) {
            Text(p.number.map { "\($0)" } ?? "•")
                .font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit()).foregroundStyle(WCTheme.emeraldDeep)
                .frame(width: 22, height: 22)
                .background(Circle().fill(WCTheme.emerald.opacity(0.15)))
                .environment(\.layoutDirection, .leftToRight)
            Text(p.name).font(SabqFonts.app(size: 11, weight: .regular)).foregroundStyle(WCTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(WCTheme.chipFill))
    }

    private var pitch: some View {
        GeometryReader { geo in
            let r = rows
            ZStack {
                LinearGradient(colors: [WCTheme.pitchTop, WCTheme.pitchBottom], startPoint: .top, endPoint: .bottom)
                RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.25), lineWidth: 1).padding(8)
                Rectangle().fill(.white.opacity(0.2)).frame(height: 1)
                Circle().stroke(.white.opacity(0.25), lineWidth: 1).frame(width: 64, height: 64)

                if r.isEmpty {
                    Text("التشكيلة غير متاحة بعد").font(SabqFonts.app(size: 12)).foregroundStyle(.white.opacity(0.8))
                } else {
                    ForEach(Array(r.enumerated()), id: \.offset) { ri, players in
                        let y = geo.size.height * (1 - (CGFloat(ri) + 0.6) / (CGFloat(r.count) + 0.4))
                        HStack(spacing: 0) {
                            ForEach(players) { p in playerDot(p).frame(maxWidth: .infinity) }
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

    private func playerDot(_ p: KcLineupPlayer) -> some View {
        VStack(spacing: 2) {
            Text(p.number.map { "\($0)" } ?? "•")
                .font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit()).foregroundStyle(WCTheme.pitchBottom)
                .frame(width: 28, height: 28).background(Circle().fill(.white))
            Text(p.name).font(SabqFonts.app(size: 9, weight: .regular)).foregroundStyle(.white)
                .lineLimit(1).frame(maxWidth: 56)
        }
    }
}

// MARK: - الإحصائيات

struct KcStatsView: View {
    let detail: KcMatchDetail

    var body: some View {
        if let stats = detail.statistics, !stats.rows.isEmpty {
            VStack(spacing: 14) {
                ForEach(stats.rows) { statRow($0) }
            }
        } else {
            kcEmptyText("الإحصائيات تظهر هنا أثناء المباراة")
        }
    }

    private func statRow(_ s: KcStatRow) -> some View {
        let h = Double(s.homeText.replacingOccurrences(of: "%", with: "")) ?? 0
        let a = Double(s.awayText.replacingOccurrences(of: "%", with: "")) ?? 0
        let total = (h + a) == 0 ? 1 : (h + a)
        return VStack(spacing: 5) {
            HStack {
                Text(s.homeText).font(SabqFonts.app(size: 14, weight: .semibold)).frame(width: 52, alignment: .leading)
                Spacer()
                Text(s.label).font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
                Spacer()
                Text(s.awayText).font(SabqFonts.app(size: 14, weight: .semibold)).frame(width: 52, alignment: .trailing)
            }
            .foregroundStyle(WCTheme.onDark)
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule().fill(WCTheme.emeraldDeep)
                        .frame(width: geo.size.width / 2 * CGFloat(h / total))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    Capsule().fill(WCTheme.sky)
                        .frame(width: geo.size.width / 2 * CGFloat(a / total))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .environment(\.layoutDirection, .leftToRight)
            }
            .frame(height: 6)
        }
    }
}

// MARK: - التقييمات (رجل المباراة + تقييمات اللاعبين)
//
// مرآة WCRatingsView — المصدر /kings-cup/match/:id/player-stats (تقييمات
// API-Football). جلب ذاتي مع تحديث دوري أثناء البث، وكل صف يفتح بطاقة اللاعب.

struct KcRatingsView: View {
    let detail: KcMatchDetail
    let onOpenPlayer: (Int) -> Void

    @State private var ratings: KcMatchRatings?
    @State private var loaded = false

    private var players: [KcMatchRating] {
        (ratings?.players ?? [])
            .filter { $0.rating != nil }
            .sorted { ($0.rating ?? 0) > ($1.rating ?? 0) }
    }

    var body: some View {
        Group {
            if !loaded {
                KcLoading()
            } else if players.isEmpty {
                kcEmptyText("تقييمات اللاعبين تظهر هنا بعد انطلاق المباراة")
            } else {
                VStack(spacing: 8) {
                    if let motm = ratings?.motm {
                        Button { onOpenPlayer(motm.id) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "crown.fill").foregroundStyle(WCTheme.gold)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text("رجل المباراة").font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(WCTheme.gold)
                                    Text(motm.name).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                                }
                                Spacer()
                                ratingBadge(motm.rating)
                            }
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WCTheme.gold.opacity(0.12)))
                            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(WCTheme.gold.opacity(0.3), lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                    ForEach(players) { p in
                        Button { onOpenPlayer(p.id) } label: { playerRow(p) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
        .task(id: detail.fixture.id) {
            await load()
            while !Task.isCancelled, detail.fixture.status.live {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                if Task.isCancelled { return }
                await load(force: true)
            }
        }
    }

    private func load(force: Bool = false) async {
        let r = try? await APIClient.shared.fetchKingsCupMatchRatings(fixtureId: detail.fixture.id, ignoreCache: force)
        await MainActor.run {
            if let r { ratings = r }
            loaded = true
        }
    }

    private func playerRow(_ p: KcMatchRating) -> some View {
        let teamLogo = p.teamId == detail.fixture.home.id ? detail.fixture.home.logo : detail.fixture.away.logo
        return HStack(spacing: 10) {
            if p.photo.isEmpty {
                Circle().fill(WCTheme.chipFill).frame(width: 32, height: 32)
            } else {
                WCRemoteImage(url: p.photo, contentMode: .fill).frame(width: 32, height: 32).clipShape(Circle())
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("\(p.name)\(p.captain ? " (ك)" : "")")
                    .font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                Text(subtitle(p)).font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
            }
            Spacer()
            WCRemoteImage(url: teamLogo).frame(width: 16, height: 16)
            ratingBadge(p.rating ?? 0)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .wcElevatedCard()
    }

    private func subtitle(_ p: KcMatchRating) -> String {
        var parts = [p.pos]
        if p.minutes > 0 { parts.append("\(p.minutes) د") }
        if p.goals > 0 { parts.append("\(p.goals) ⚽") }
        if p.assists > 0 { parts.append("\(p.assists) صناعة") }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
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
        if r >= 8 { return WCTheme.emeraldDeep }
        if r >= 7 { return WCTheme.leaf }
        if r >= 6 { return WCTheme.gold }
        return WCTheme.liveRed
    }
}

// MARK: - قنوات البث

struct KcTvStrip: View {
    let fixtureId: Int
    @State private var channels: [KcTvChannel] = []
    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(width: 0, height: 0)
            if !channels.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Image(systemName: "tv.fill").font(.system(size: 11)).foregroundStyle(WCTheme.emeraldDeep)
                        Text("القنوات الناقلة").font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(WCTheme.emeraldDeep)
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(channels) { ch in chip(ch) }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .task(id: fixtureId) {
            if let r = try? await APIClient.shared.fetchKingsCupTv(fixtureId: fixtureId), r.available {
                await MainActor.run { channels = r.channels }
            }
        }
    }

    @ViewBuilder private func chip(_ ch: KcTvChannel) -> some View {
        let content = HStack(spacing: 6) {
            if let logo = ch.logo, !logo.isEmpty {
                WCRemoteImage(url: logo).frame(width: 18, height: 18)
            } else {
                Image(systemName: "play.tv").font(.system(size: 12)).foregroundStyle(WCTheme.onDarkDim)
            }
            Text(ch.name).font(SabqFonts.app(size: 11, weight: .regular)).foregroundStyle(WCTheme.onDark).lineLimit(1)
            if let c = ch.country, !c.isEmpty {
                Text(c).font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(Capsule().fill(WCTheme.chipFill))
        .overlay(Capsule().stroke(WCTheme.cardStroke.opacity(0.6), lineWidth: 0.5))

        if let urlString = ch.url, let url = URL(string: urlString) {
            Button { openURL(url) } label: { content }.buttonStyle(.plain)
        } else {
            content
        }
    }
}

// MARK: - صفحة النادي (sheet)

struct KcTeamSheet: View {
    let teamId: Int
    let teamName: String
    @Environment(\.dismiss) private var dismiss

    @State private var profile: KcTeamProfile?
    @State private var loading = true
    /// الإثراء الثقيل (?with=stats): إحصائيات الدوري والكأس + مسيرة المدرب +
    /// الهدّافون + الانتقالات — غير حاجب: الأساس يرسم فورًا وبطاقاته تظهر تباعًا
    @State private var extras: KcTeamExtras?
    /// مباريات النادي في الكأس (الموسم الجاري + مشوار النسخة السابقة)
    @State private var teamMatches: KcTeamMatches?
    /// سجلّ الأبطال — منه ألقاب النادي وخزينتها
    @State private var record: KcRecord?
    @State private var openPlayer: KcPlayerSelection?

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    if loading {
                        KcLoading().padding(.top, 30)
                    } else if let p = profile {
                        teamHeader(p)
                        if let coach = extras?.coach ?? p.coach { KcCoachCard(coach: coach) }
                        if let cup = extras?.kcStats {
                            KcTeamStatsCard(title: "مشوار النادي في كأس الملك",
                                            subtitle: "نسخة \(KcFormat.seasonLabel(cup.season))",
                                            stats: cup.stats)
                        }
                        if let league = extras?.stats {
                            KcTeamStatsCard(title: "نبض الأرقام",
                                            subtitle: p.competitionName ?? "بطولة النادي",
                                            stats: league)
                        }
                        if let m = teamMatches, !m.fixtures.isEmpty || m.previous != nil {
                            KcTeamMatchesBlock(matches: m)
                        } else if !p.fixtures.isEmpty {
                            fixturesBlock(p.fixtures)
                        }
                        if let scorers = extras?.topScorers ?? (p.topScorers.isEmpty ? nil : p.topScorers), !scorers.isEmpty {
                            scorersBlock(scorers)
                        }
                        if let transfers = extras?.transfers,
                           !transfers.arrivals.isEmpty || !transfers.departures.isEmpty {
                            KcTransfersBlock(transfers: transfers)
                        }
                        if let record {
                            KcTeamTitlesBlock(teamId: teamId, record: record)
                        }
                        if !p.squad.isEmpty { squadBlock(p.squad) }
                    } else {
                        Text("تعذر جلب صفحة النادي")
                            .font(SabqFonts.app(size: 14)).foregroundStyle(WCTheme.onDarkDim)
                            .padding(.top, 50)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(WCTheme.sectionBackground.ignoresSafeArea())
            .navigationTitle(teamName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(WCTheme.stadiumTop, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white) }
                }
            }
            .task {
                // الأساس أولًا (يرسم الصفحة فورًا)، والإثراء والمباريات والسجل
                // بالتوازي بلا حجب — نمط صفحة نادي الويب نفسه
                async let base = APIClient.shared.fetchKingsCupTeamProfile(teamId: teamId)
                async let x = APIClient.shared.fetchKingsCupTeamExtras(teamId: teamId)
                async let m = APIClient.shared.fetchKingsCupTeamMatches(teamId: teamId)
                async let rec = APIClient.shared.fetchKingsCupRecord()
                var baseResult = try? await base
                if baseResult == nil {
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                    baseResult = try? await APIClient.shared.fetchKingsCupTeamProfile(teamId: teamId)
                }
                await MainActor.run { profile = baseResult; loading = false }
                let extrasResult = try? await x
                let matchesResult = try? await m
                let recordResult = try? await rec
                await MainActor.run {
                    extras = extrasResult
                    teamMatches = matchesResult
                    record = recordResult
                }
            }
            .sheet(item: $openPlayer) { sel in
                KcPlayerSheet(playerId: sel.id).presentationDetents([.large])
            }
        }
        .sabqRTL()
    }

    private func teamHeader(_ p: KcTeamProfile) -> some View {
        HStack(spacing: 14) {
            WCRemoteImage(url: p.team.logo)
                .padding(8).frame(width: 72, height: 72)
                .background(Circle().fill(.white))
                .overlay(Circle().stroke(WCTheme.cardStroke, lineWidth: 1))
            VStack(alignment: .leading, spacing: 4) {
                Text(p.team.name).font(SabqFonts.app(size: 18, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                if let founded = p.team.founded {
                    Text("تأسّس \(String(founded))").font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
                        .environment(\.layoutDirection, .leftToRight)
                }
                if let v = p.team.venue, !v.name.isEmpty {
                    Label("\(v.name)\(v.city.isEmpty ? "" : " — \(v.city)")", systemImage: "sportscourt")
                        .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                        .labelStyle(.titleAndIcon).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }

    private func coachRow(_ coach: KcCoach) -> some View {
        HStack(spacing: 10) {
            if coach.photo.isEmpty {
                Circle().fill(WCTheme.chipFill).frame(width: 40, height: 40)
                    .overlay(Image(systemName: "person.fill").foregroundStyle(WCTheme.onDarkDim))
            } else {
                WCRemoteImage(url: coach.photo, contentMode: .fill).frame(width: 40, height: 40).clipShape(Circle())
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("المدرّب").font(SabqFonts.app(size: 10, weight: .medium)).foregroundStyle(WCTheme.emeraldDeep)
                Text(coach.name).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.onDark)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }

    private func fixturesBlock(_ fixtures: [KcFixture]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("مباريات النادي").font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(WCTheme.emeraldDeep)
            ForEach(fixtures) { f in fixtureRow(f) }
        }
    }

    private func fixtureRow(_ f: KcFixture) -> some View {
        HStack(spacing: 8) {
            KcTeamLogo(team: f.home, size: 24, ring: WCTheme.cardStroke)
            Text(f.started ? "\(f.goals.away ?? 0) - \(f.goals.home ?? 0)" : KcFormat.time(f))
                .font(SabqFonts.app(size: 11, weight: .regular)).foregroundStyle(WCTheme.onDark)
                .environment(\.layoutDirection, .leftToRight).frame(minWidth: 44)
            KcTeamLogo(team: f.away, size: 24, ring: WCTheme.cardStroke)
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 1) {
                Text(f.round).font(SabqFonts.app(size: 10, weight: .regular)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                Text(KcFormat.day(f)).font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .wcElevatedCard(cornerRadius: 12)
    }

    private func scorersBlock(_ scorers: [KcTeamTopScorer]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("هدّافو النادي").font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(WCTheme.emeraldDeep)
            ForEach(scorers) { s in
                Button { if s.id > 0 { openPlayer = KcPlayerSelection(id: s.id) } } label: {
                    HStack(spacing: 10) {
                        if s.photo.isEmpty {
                            Circle().fill(WCTheme.chipFill).frame(width: 32, height: 32)
                        } else {
                            WCRemoteImage(url: s.photo, contentMode: .fill).frame(width: 32, height: 32).clipShape(Circle())
                        }
                        Text(s.name).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                        Spacer()
                        Text("\(s.goals)").font(SabqFonts.app(size: 16, weight: .semibold)).foregroundStyle(WCTheme.emeraldDeep)
                        Text("هدف").font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .wcElevatedCard(cornerRadius: 12)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func squadBlock(_ squad: [KcSquadPlayer]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("التشكيلة").font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(WCTheme.emeraldDeep)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(squad) { p in
                    Button { if p.id > 0 { openPlayer = KcPlayerSelection(id: p.id) } } label: {
                        HStack(spacing: 8) {
                            Text(p.number.map { "\($0)" } ?? "•")
                                .font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit()).foregroundStyle(WCTheme.emeraldDeep)
                                .frame(width: 22, height: 22).background(Circle().fill(WCTheme.emerald.opacity(0.15)))
                                .environment(\.layoutDirection, .leftToRight)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(p.name).font(SabqFonts.app(size: 11, weight: .regular)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                                Text(p.position).font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 8).padding(.vertical, 6)
                        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(WCTheme.chipFill))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
