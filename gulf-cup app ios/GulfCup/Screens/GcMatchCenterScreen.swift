import SwiftUI
import Combine

// مركز المباراة — شاشة كاملة تُدفع في الملاحة (لا ورقة مقتضبة): لوحة نتيجة بطلة
// حيّة، وأقسام: ملخّص (شريط الأحداث) · التشكيلات (أساسية + بدلاء بالمراكز) ·
// إحصاءات (أشرطة مزدوجة) · مواجهات (رصيد تاريخي شامل عبر كل البطولات + آخر
// اللقاءات + مواجهات البطولة). يتحدّث تلقائيًّا كل 30 ثانية أثناء المباشر.
struct GcMatchCenterScreen: View {
    let fixture: GcFixture
    @State private var detail: GcMatchDetail?
    @State private var loading = true
    @State private var segment: GcMatchSegment = .summary
    private let liveMgr = GcLiveActivityManager.shared
    private let refreshTimer = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    private var displayFixture: GcFixture { detail?.fixture ?? fixture }
    private var started: Bool { displayFixture.status.live || displayFixture.status.finished }

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 14) {
                scoreboardHero

                if let tv = detail?.tv, !tv.isEmpty {
                    GcTvChipsRow(channels: tv)
                }

                if GcLiveActivityManager.shared.isSupported && !displayFixture.status.finished {
                    liveActivityButton
                }

                segmentBar

                switch segment {
                case .summary: summarySection
                case .lineups: lineupsSection
                case .stats: statsSection
                case .h2h: h2hSection
                }

                infoCard
                GcFooterSignature()
            }
        }
        .navigationTitle(L("match.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(GcTheme.appBg, for: .navigationBar)
        .task { await load() }
        .refreshable { await load(force: true) }
        .onReceive(refreshTimer) { _ in
            if displayFixture.status.live {
                Task { await load(force: true) }
            }
        }
    }

    private func load(force: Bool = false) async {
        if detail == nil { loading = true }
        detail = (try? await APIClient.shared.fetchGcMatchDetail(fixture.id, ignoreCache: force)) ?? detail
        loading = false
    }

    // MARK: لوحة النتيجة

    private var scoreboardHero: some View {
        GcHeroPanel {
            VStack(spacing: 14) {
                HStack {
                    GcChip(text: displayFixture.round, tint: GcTheme.goldLite)
                    Spacer()
                    GcStatusPill(fixture: displayFixture)
                }
                HStack(alignment: .top, spacing: 6) {
                    teamCol(displayFixture.home)
                    centerScore
                    teamCol(displayFixture.away)
                }
                if displayFixture.status.live, let elapsed = displayFixture.status.elapsed {
                    // شريط تقدّم زمن المباراة
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(.white.opacity(0.12))
                            Capsule().fill(GcTheme.goldFill)
                                .frame(width: geo.size.width * min(CGFloat(elapsed) / 90.0, 1))
                        }
                    }
                    .frame(height: 4)
                    .environment(\.layoutDirection, .leftToRight)
                }
            }
            .padding(18)
        }
        .padding(.top, 8)
    }

    private func teamCol(_ team: GcTeam) -> some View {
        Group {
            if team.id > 0 {
                NavigationLink {
                    GcTeamProfileScreen(teamId: team.id, fallback: team)
                } label: {
                    teamColBody(team)
                }
                .buttonStyle(GcPressStyle())
            } else {
                teamColBody(team)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func teamColBody(_ team: GcTeam) -> some View {
        VStack(spacing: 8) {
            GcTeamLogo(logo: team.logo, size: GcTheme.logoLg)
            Text(team.name)
                .font(GulfCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
    }

    private var centerScore: some View {
        Group {
            if started {
                Text("\(displayFixture.goals.away ?? 0) - \(displayFixture.goals.home ?? 0)")
                    .font(GulfCupFonts.app(size: 42, weight: .bold))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                VStack(spacing: 3) {
                    Text(GcFormat.kickoffTime(displayFixture.date))
                        .font(GulfCupFonts.app(size: 25, weight: .bold))
                        .foregroundStyle(GcTheme.goldLite)
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                    Text(GcFormat.relativeKickoff(displayFixture.date))
                        .font(GulfCupFonts.app(size: 10.5, weight: .semibold))
                        .foregroundStyle(GcTheme.onHeroFaint)
                }
            }
        }
        .padding(.top, GcTheme.logoLg / 3)
    }

    private var liveActivityButton: some View {
        Button {
            liveMgr.toggle(for: displayFixture)
        } label: {
            HStack {
                Image(systemName: liveMgr.isActive(displayFixture.id) ? "bell.slash.fill" : "bell.badge.fill")
                Text(liveMgr.isActive(displayFixture.id) ? L("liveActivity.stop") : L("liveActivity.start"))
            }
            .font(GulfCupFonts.app(size: 13.5, weight: .bold))
            .foregroundStyle(GcTheme.emerald)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: GcTheme.buttonRadius, style: .continuous).fill(GcTheme.emerald.opacity(0.10)))
        }
        .buttonStyle(GcPressStyle())
    }

    private var segmentBar: some View {
        HStack(spacing: 6) {
            ForEach(GcMatchSegment.allCases) { seg in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { segment = seg }
                } label: {
                    Text(seg.title)
                        .font(GulfCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(segment == seg ? .white : GcTheme.inkDim)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(
                            RoundedRectangle(cornerRadius: GcTheme.chipRadius, style: .continuous)
                                .fill(segment == seg ? GcTheme.emerald : Color.clear)
                        )
                }
                .buttonStyle(GcPressStyle())
            }
        }
        .padding(4)
        .gcCard(radius: GcTheme.tileRadius)
    }

    // MARK: ملخّص (الأحداث)

    @ViewBuilder private var summarySection: some View {
        if let d = detail, !d.events.isEmpty {
            GcEventsTimeline(events: d.events, fixture: displayFixture)
        } else if loading {
            GcLoadingPanel(title: L("match.loading"))
        } else {
            GcEmptyState(icon: "list.bullet.rectangle", title: L("match.noEvents.title"), subtitle: L("match.noEvents.subtitle"))
        }
    }

    // MARK: التشكيلات

    @ViewBuilder private var lineupsSection: some View {
        if let rich = detail?.lineupsRich, GcPitchCard.hasCoordinates(rich) {
            GcPitchCard(rich: rich, fixture: displayFixture)
        }
        if let d = detail, !d.lineups.isEmpty {
            ForEach(d.lineups) { lineup in
                GcLineupCard(lineup: lineup)
            }
        } else if detail?.lineupsRich == nil {
            if loading {
                GcLoadingPanel(title: L("match.loading"))
            } else {
                GcEmptyState(icon: "person.3.sequence", title: L("match.lineups.empty.title"), subtitle: L("match.lineups.empty.subtitle"))
            }
        }
        if let injuries = detail?.injuries, !(injuries.home.isEmpty && injuries.away.isEmpty) {
            GcInjuriesCard(injuries: injuries, fixture: displayFixture)
        }
    }

    // MARK: الإحصاءات

    @ViewBuilder private var statsSection: some View {
        if let d = detail, !d.statistics.isEmpty {
            VStack(alignment: .leading, spacing: 13) {
                HStack {
                    HStack(spacing: 6) {
                        GcTeamLogo(logo: displayFixture.home.logo, size: 22)
                        Text(displayFixture.home.name).font(GulfCupFonts.app(size: 11.5, weight: .bold)).foregroundStyle(GcTheme.ink)
                    }
                    Spacer()
                    HStack(spacing: 6) {
                        Text(displayFixture.away.name).font(GulfCupFonts.app(size: 11.5, weight: .bold)).foregroundStyle(GcTheme.ink)
                        GcTeamLogo(logo: displayFixture.away.logo, size: 22)
                    }
                }
                ForEach(d.statistics) { s in
                    GcDuoBar(label: s.label, home: s.home, away: s.away)
                }
            }
            .padding(14)
            .gcCard()
        } else if loading {
            GcLoadingPanel(title: L("match.loading"))
        } else if detail?.trend == nil && (detail?.playerStats?.isEmpty ?? true) {
            GcEmptyState(icon: "chart.bar", title: L("match.stats.empty.title"), subtitle: L("match.stats.empty.subtitle"))
        }
        if let trend = detail?.trend, !trend.values.isEmpty {
            GcTrendCard(trend: trend, fixture: displayFixture)
        }
        if let ps = detail?.playerStats, ps.contains(where: { $0.rating != nil }) {
            GcRatingsCard(stats: ps, fixture: displayFixture)
        }
    }

    // MARK: المواجهات

    @ViewBuilder private var h2hSection: some View {
        if let d = detail {
            if let history = d.history, history.total > 0 {
                GcH2HRecordCard(history: history, home: displayFixture.home, away: displayFixture.away)
                if !history.recent.isEmpty {
                    GcSectionHeader(icon: "clock.arrow.circlepath", title: L("match.h2h.recent"), count: history.recent.count, tint: GcTheme.teal)
                    GcH2HRecentList(matches: history.recent)
                }
            }
            if !d.headToHead.isEmpty {
                GcSectionHeader(icon: "trophy.fill", title: L("match.h2h.tournament"), count: d.headToHead.count, tint: GcTheme.gold)
                GcMatchListCard(fixtures: d.headToHead)
            }
            if (d.history?.total ?? 0) == 0 && d.headToHead.isEmpty && !loading {
                GcEmptyState(icon: "arrow.triangle.swap", title: L("match.h2h.empty.title"), subtitle: L("match.h2h.empty.subtitle"))
            }
        } else if loading {
            GcLoadingPanel(title: L("match.loading"))
        }
    }

    private var infoCard: some View {
        VStack(alignment: .leading, spacing: 9) {
            labelRow(L("match.info.venue"), "\(displayFixture.venue.name) — \(displayFixture.venue.city)")
            labelRow(L("match.info.date"), GcFormat.kickoffDay(displayFixture.date))
            labelRow(L("match.info.time"), GcFormat.kickoffTime(displayFixture.date))
            if let no = displayFixture.matchNo { labelRow(L("match.info.matchNo"), "#\(no)") }
        }
        .padding(14)
        .gcCard()
    }

    private func labelRow(_ k: String, _ v: String) -> some View {
        HStack {
            Text(k).font(GulfCupFonts.app(size: 12)).foregroundStyle(GcTheme.inkDim)
            Spacer()
            Text(v).font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.ink)
        }
    }
}

enum GcMatchSegment: String, CaseIterable, Identifiable {
    case summary, lineups, stats, h2h
    var id: String { rawValue }
    var title: String {
        switch self {
        case .summary: return L("match.seg.summary")
        case .lineups: return L("match.seg.lineups")
        case .stats: return L("match.seg.stats")
        case .h2h: return L("match.seg.h2h")
        }
    }
}

// MARK: - شريط الأحداث الزمني (المضيف يمينًا والضيف يسارًا)

struct GcEventsTimeline: View {
    let events: [GcMatchEvent]
    let fixture: GcFixture

    private var sorted: [GcMatchEvent] {
        events.sorted { ($0.minute, $0.extraMinute ?? 0) > ($1.minute, $1.extraMinute ?? 0) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            GcSectionHeader(icon: "list.bullet.rectangle.fill", title: L("match.events"), count: events.count, tint: GcTheme.gold)
            VStack(spacing: 0) {
                ForEach(Array(sorted.enumerated()), id: \.element.id) { idx, ev in
                    if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1) }
                    eventRow(ev)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 4)
            .gcCard()
        }
    }

    private func eventRow(_ ev: GcMatchEvent) -> some View {
        let isHome = ev.teamId == fixture.home.id
        return HStack(spacing: 10) {
            if isHome {
                minuteBadge(ev)
                eventIcon(ev)
                eventText(ev, alignment: .leading)
                Spacer(minLength: 20)
            } else {
                Spacer(minLength: 20)
                eventText(ev, alignment: .trailing)
                eventIcon(ev)
                minuteBadge(ev)
            }
        }
        .padding(.vertical, 9)
    }

    private func minuteBadge(_ ev: GcMatchEvent) -> some View {
        Text(ev.extraMinute.map { "\(ev.minute)+\($0)'" } ?? "\(ev.minute)'")
            .font(GulfCupFonts.app(size: 11, weight: .bold))
            .foregroundStyle(GcTheme.emerald)
            .monospacedDigit()
            .frame(width: 42)
            .environment(\.layoutDirection, .leftToRight)
    }

    private func eventText(_ ev: GcMatchEvent, alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 1) {
            Text(ev.player ?? ev.label)
                .font(GulfCupFonts.app(size: 12.5, weight: .semibold))
                .foregroundStyle(GcTheme.ink)
                .lineLimit(1)
            if ev.player != nil {
                Text(localizedEventLabel(ev))
                    .font(GulfCupFonts.app(size: 10))
                    .foregroundStyle(GcTheme.inkDim)
            }
        }
    }

    private func localizedEventLabel(_ ev: GcMatchEvent) -> String {
        let t = ev.type.lowercased()
        let d = ev.label.lowercased()
        if t == "goal" {
            if d.contains("penalty") { return "هدف من ركلة جزاء" }
            if d.contains("own") { return "هدف في مرماه" }
            if d.contains("missed") { return "ركلة جزاء مهدرة" }
            return "هدف"
        }
        if t == "card" { return d.contains("red") ? "بطاقة حمراء" : "بطاقة صفراء" }
        if t == "subst" { return "تبديل" }
        if t == "var" { return "قرار VAR" }
        return ev.label
    }

    @ViewBuilder private func eventIcon(_ ev: GcMatchEvent) -> some View {
        let t = ev.type.lowercased()
        let d = ev.label.lowercased()
        Group {
            if t == "goal" {
                Image(systemName: "soccerball.inverse")
                    .foregroundStyle(d.contains("missed") ? GcTheme.crimson : GcTheme.emerald)
            } else if t == "card" {
                RoundedRectangle(cornerRadius: 2)
                    .fill(d.contains("red") ? GcTheme.crimson : Color(red: 0.95, green: 0.78, blue: 0.15))
                    .frame(width: 10, height: 14)
            } else if t == "subst" {
                Image(systemName: "arrow.left.arrow.right").foregroundStyle(GcTheme.teal)
            } else if t == "var" {
                Image(systemName: "tv").foregroundStyle(GcTheme.inkDim)
            } else {
                Image(systemName: "circle.fill").foregroundStyle(GcTheme.inkFaint)
            }
        }
        .font(.system(size: 13, weight: .semibold))
        .frame(width: 20)
    }
}

// MARK: - بطاقة تشكيلة

struct GcLineupCard: View {
    let lineup: GcLineup

    private func positionName(_ pos: String?) -> String {
        switch pos {
        case "G": return "حارس"
        case "D": return "دفاع"
        case "M": return "وسط"
        case "F": return "هجوم"
        default: return pos ?? ""
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(lineup.teamName).font(GulfCupFonts.headline(size: 15)).foregroundStyle(GcTheme.ink)
                Spacer()
                if let formation = lineup.formation {
                    GcChip(text: formation, icon: "square.grid.3x3", tint: GcTheme.emerald)
                }
            }
            if !lineup.coach.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "person.text.rectangle").font(.system(size: 11)).foregroundStyle(GcTheme.inkDim)
                    Text("\(L("match.coach")): \(lineup.coach)").font(GulfCupFonts.app(size: 11.5)).foregroundStyle(GcTheme.inkDim)
                }
            }

            Text(L("match.startXI")).font(GulfCupFonts.app(size: 12, weight: .bold)).foregroundStyle(GcTheme.emerald)
            playersGrid(lineup.startXI)

            if !lineup.substitutes.isEmpty {
                Text(L("match.subs")).font(GulfCupFonts.app(size: 12, weight: .bold)).foregroundStyle(GcTheme.inkDim)
                playersGrid(lineup.substitutes)
            }
        }
        .padding(14)
        .gcCard()
    }

    private func playersGrid(_ players: [GcLineupPlayer]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 7) {
            ForEach(players) { p in
                HStack(spacing: 7) {
                    Text(p.number.map(String.init) ?? "–")
                        .font(GulfCupFonts.app(size: 10.5, weight: .bold))
                        .foregroundStyle(GcTheme.emerald)
                        .monospacedDigit()
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(GcTheme.emerald.opacity(0.10)))
                    VStack(alignment: .leading, spacing: 0) {
                        Text(p.name).font(GulfCupFonts.app(size: 11.5, weight: .semibold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                        if p.position != nil {
                            Text(positionName(p.position)).font(GulfCupFonts.app(size: 9)).foregroundStyle(GcTheme.inkFaint)
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

// MARK: - الرصيد التاريخي

struct GcH2HRecordCard: View {
    let history: GcH2HSummary
    let home: GcTeam
    let away: GcTeam

    var body: some View {
        VStack(spacing: 13) {
            GcSectionHeader(icon: "arrow.triangle.swap", title: L("match.h2h.record"), subtitle: "\(history.total) مواجهة عبر كل البطولات", tint: GcTheme.emerald)

            HStack(spacing: 0) {
                recordCol(team: home, wins: history.homeWins, tint: GcTheme.emerald)
                VStack(spacing: 2) {
                    Text("\(history.draws)").font(GulfCupFonts.app(size: 21, weight: .bold)).foregroundStyle(GcTheme.inkDim).monospacedDigit()
                    Text(L("match.draws")).font(GulfCupFonts.app(size: 10)).foregroundStyle(GcTheme.inkFaint)
                }
                .frame(maxWidth: .infinity)
                recordCol(team: away, wins: history.awayWins, tint: GcTheme.teal)
            }

            // شريط الغلبة — المضيف من اليمين (RTL يرتّب تلقائيًّا)
            GeometryReader { geo in
                let total = CGFloat(max(history.total, 1))
                HStack(spacing: 2) {
                    Capsule().fill(GcTheme.emerald)
                        .frame(width: geo.size.width * CGFloat(history.homeWins) / total)
                    Capsule().fill(GcTheme.inkFaint.opacity(0.35))
                        .frame(width: geo.size.width * CGFloat(history.draws) / total)
                    Capsule().fill(GcTheme.teal)
                        .frame(width: geo.size.width * CGFloat(history.awayWins) / total)
                }
            }
            .frame(height: 6)
        }
        .padding(14)
        .gcCard()
    }

    private func recordCol(team: GcTeam, wins: Int, tint: Color) -> some View {
        VStack(spacing: 5) {
            GcTeamLogo(logo: team.logo, size: 30)
            Text("\(wins)").font(GulfCupFonts.app(size: 21, weight: .bold)).foregroundStyle(tint).monospacedDigit()
            Text(L("match.wins")).font(GulfCupFonts.app(size: 10)).foregroundStyle(GcTheme.inkFaint)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - إثراء TheSports: القنوات · الملعب التفاعلي · الزخم · التقييمات · الغيابات

/// القنوات الناقلة — رقاقات أفقية تحت لوحة النتيجة («وين أشوف المباراة؟»).
struct GcTvChipsRow: View {
    let channels: [GcTvChannel]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Image(systemName: "tv.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(GcTheme.goldDeep)
                ForEach(channels.prefix(5)) { channel in
                    Text(channel.name)
                        .font(GulfCupFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(GcTheme.ink)
                        .padding(.horizontal, 11).padding(.vertical, 6)
                        .background(Capsule().fill(GcTheme.chipFill))
                }
            }
            .padding(.horizontal, 2)
        }
    }
}

/// ملعبان متجاوران بإحداثيات المزوّد (0..100) — رقم القميص + التقييم الحي + الكابتن.
struct GcPitchCard: View {
    let rich: GcRichLineup
    let fixture: GcFixture

    static func hasCoordinates(_ rich: GcRichLineup) -> Bool {
        rich.home.contains { $0.starter && $0.x != nil && $0.y != nil }
            && rich.away.contains { $0.starter && $0.x != nil && $0.y != nil }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            GcSectionHeader(icon: "sportscourt.fill", title: "التشكيلة على الملعب", subtitle: rich.confirmed ? "تشكيلة رسمية" : "تشكيلة متوقعة", tint: GcTheme.emerald)
            HStack(alignment: .top, spacing: 10) {
                pitchHalf(players: rich.home, formation: rich.homeFormation, name: fixture.home.name)
                pitchHalf(players: rich.away, formation: rich.awayFormation, name: fixture.away.name)
            }
        }
        .padding(14)
        .gcCard()
    }

    private func pitchHalf(players: [GcRichLineupPlayer], formation: String?, name: String) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 5) {
                Text(name).font(GulfCupFonts.app(size: 11.5, weight: .bold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                if let formation {
                    Text(formation).font(GulfCupFonts.app(size: 10, weight: .semibold)).foregroundStyle(GcTheme.inkDim)
                }
            }
            GeometryReader { geo in
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(LinearGradient(colors: [Color(red: 0.06, green: 0.48, blue: 0.30), Color(red: 0.04, green: 0.42, blue: 0.28)], startPoint: .top, endPoint: .bottom))
                    // خطوط استرشادية خفيفة
                    Rectangle().fill(.white.opacity(0.18)).frame(height: 1)
                        .position(x: geo.size.width / 2, y: 1)
                    ForEach(players.filter { $0.starter && $0.x != nil && $0.y != nil }) { p in
                        playerDot(p)
                            .position(
                                x: geo.size.width * CGFloat(p.x!) / 100,
                                y: geo.size.height * CGFloat(p.y!) / 100
                            )
                    }
                }
            }
            .aspectRatio(3.0 / 4.0, contentMode: .fit)
            .environment(\.layoutDirection, .leftToRight)
        }
        .frame(maxWidth: .infinity)
    }

    private func playerDot(_ p: GcRichLineupPlayer) -> some View {
        VStack(spacing: 1) {
            ZStack(alignment: .topTrailing) {
                Text(p.number.map(String.init) ?? "•")
                    .font(GulfCupFonts.app(size: 9, weight: .bold))
                    .foregroundStyle(GcTheme.forest)
                    .monospacedDigit()
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(.white))
                if p.captain {
                    Text("C")
                        .font(.system(size: 6, weight: .black))
                        .foregroundStyle(GcTheme.forest)
                        .frame(width: 9, height: 9)
                        .background(Circle().fill(GcTheme.goldLite))
                        .offset(x: 3, y: -3)
                }
            }
            if let rating = p.rating {
                Text(String(format: "%.1f", rating))
                    .font(GulfCupFonts.app(size: 7.5, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 3).padding(.vertical, 1)
                    .background(RoundedRectangle(cornerRadius: 3).fill(rating >= 7.5 ? GcTheme.emerald : rating >= 6 ? Color.orange : GcTheme.crimson))
                    .monospacedDigit()
            }
            Text(p.name)
                .font(GulfCupFonts.app(size: 7.5, weight: .semibold))
                .foregroundStyle(.white.opacity(0.92))
                .lineLimit(1)
                .frame(maxWidth: 52)
        }
    }
}

/// مؤشر الخطورة والزخم — أعمدة ±: موجب (زمردي) ضغط المضيف، سالب (كهرماني) ضغط الضيف.
struct GcTrendCard: View {
    let trend: GcTrend
    let fixture: GcFixture

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            GcSectionHeader(icon: "waveform.path.ecg", title: "الخطورة والزخم", subtitle: "\(fixture.home.name) أعلى · \(fixture.away.name) أسفل", tint: GcTheme.emerald)
            GeometryReader { geo in
                let count = max(trend.values.count, 1)
                let w = geo.size.width / CGFloat(count)
                ZStack {
                    Rectangle().fill(GcTheme.outline).frame(height: 1)
                    HStack(alignment: .center, spacing: 0) {
                        ForEach(Array(trend.values.enumerated()), id: \.offset) { _, point in
                            VStack(spacing: 0) {
                                Spacer(minLength: 0)
                                Rectangle()
                                    .fill(point.value >= 0 ? GcTheme.emerald : Color.orange)
                                    .frame(width: max(w - 1.5, 1.5), height: max(CGFloat(abs(point.value)) / 100 * geo.size.height / 2, point.value == 0 ? 0 : 2))
                                    .offset(y: point.value >= 0 ? -geo.size.height / 4 + CGFloat(abs(point.value)) / 100 * geo.size.height / 4 : geo.size.height / 4 - CGFloat(abs(point.value)) / 100 * geo.size.height / 4)
                                Spacer(minLength: 0)
                            }
                            .frame(width: w)
                        }
                    }
                }
            }
            .frame(height: 72)
            .environment(\.layoutDirection, .leftToRight)
        }
        .padding(14)
        .gcCard()
    }
}

/// تقييمات اللاعبين — رجل المباراة أولًا (مرتّبة من الخادم بالتقييم).
struct GcRatingsCard: View {
    let stats: [GcPlayerMatchStat]
    let fixture: GcFixture

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            GcSectionHeader(icon: "star.fill", title: "تقييمات اللاعبين", tint: GcTheme.goldDeep)
            VStack(spacing: 0) {
                ForEach(Array(stats.filter { $0.rating != nil }.prefix(10).enumerated()), id: \.element.id) { idx, p in
                    if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                    HStack(spacing: 10) {
                        if idx == 0 {
                            Image(systemName: "star.fill").font(.system(size: 11)).foregroundStyle(GcTheme.gold)
                        } else {
                            Text("\(idx + 1)").font(GulfCupFonts.app(size: 11, weight: .bold)).foregroundStyle(GcTheme.inkFaint).frame(width: 14)
                        }
                        GcPlayerPhoto(url: p.photo, size: 30)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(p.name).font(GulfCupFonts.app(size: 12.5, weight: .semibold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                            Text(p.side == "home" ? fixture.home.name : p.side == "away" ? fixture.away.name : "")
                                .font(GulfCupFonts.app(size: 9.5)).foregroundStyle(GcTheme.inkDim)
                        }
                        Spacer()
                        Text(String(format: "%.1f", p.rating ?? 0))
                            .font(GulfCupFonts.app(size: 12, weight: .bold))
                            .foregroundStyle(.white)
                            .monospacedDigit()
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(RoundedRectangle(cornerRadius: 7, style: .continuous)
                                .fill((p.rating ?? 0) >= 7.5 ? GcTheme.emerald : (p.rating ?? 0) >= 6 ? Color.orange : GcTheme.crimson))
                    }
                    .padding(.horizontal, 14).padding(.vertical, 8)
                }
            }
            .gcCard(radius: GcTheme.tileRadius, fill: GcTheme.cardBgSubtle)
        }
        .padding(14)
        .gcCard()
    }
}

/// الغيابات والإصابات للطرفين — قبل المباراة وأثناءها.
struct GcInjuriesCard: View {
    let injuries: GcMatchInjuries
    let fixture: GcFixture

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            GcSectionHeader(icon: "cross.case.fill", title: "الغيابات والإصابات", tint: GcTheme.crimson)
            HStack(alignment: .top, spacing: 12) {
                sideList(name: fixture.home.name, list: injuries.home)
                sideList(name: fixture.away.name, list: injuries.away)
            }
        }
        .padding(14)
        .gcCard()
    }

    @ViewBuilder private func sideList(name: String, list: [GcInjury]) -> some View {
        if list.isEmpty {
            VStack(alignment: .leading, spacing: 5) {
                Text(name).font(GulfCupFonts.app(size: 11.5, weight: .bold)).foregroundStyle(GcTheme.ink)
                Text("لا غيابات").font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.inkFaint)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(alignment: .leading, spacing: 5) {
                Text(name).font(GulfCupFonts.app(size: 11.5, weight: .bold)).foregroundStyle(GcTheme.ink)
                ForEach(list.prefix(5)) { inj in
                    HStack(spacing: 5) {
                        Image(systemName: "stethoscope").font(.system(size: 9)).foregroundStyle(GcTheme.crimson)
                        Text(inj.player).font(GulfCupFonts.app(size: 11, weight: .semibold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                    }
                    if let reason = inj.reason, !reason.isEmpty {
                        Text(reason).font(GulfCupFonts.app(size: 9)).foregroundStyle(GcTheme.inkDim).lineLimit(1).padding(.leading, 14)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct GcH2HRecentList: View {
    let matches: [GcH2HMatch]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(matches.enumerated()), id: \.element.id) { idx, m in
                if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(GcFormat.year(m.date)).font(GulfCupFonts.app(size: 11, weight: .bold)).foregroundStyle(GcTheme.ink).monospacedDigit()
                        Text(m.competition).font(GulfCupFonts.app(size: 9)).foregroundStyle(GcTheme.inkFaint).lineLimit(1)
                    }
                    .frame(width: 84, alignment: .leading)
                    Spacer(minLength: 2)
                    Text(m.home.name).font(GulfCupFonts.app(size: 11.5, weight: .semibold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                    GcTeamLogo(logo: m.home.logo, size: 20)
                    Text("\(m.goals.away ?? 0)-\(m.goals.home ?? 0)")
                        .font(GulfCupFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(GcTheme.ink)
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                        .frame(width: 40)
                    GcTeamLogo(logo: m.away.logo, size: 20)
                    Text(m.away.name).font(GulfCupFonts.app(size: 11.5, weight: .semibold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                    Spacer(minLength: 2)
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
            }
        }
        .gcCard()
    }
}
