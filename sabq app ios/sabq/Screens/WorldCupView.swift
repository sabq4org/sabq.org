import SwiftUI

// MARK: - قسم كأس العالم 2026 — الشاشة الرئيسية
//
// تستهلك /api/world-cup/* العامة. تطابق صفحة الويب /world-cup: هيرو مباراة
// اليوم، مشوار الأخضر، المباريات بتبويبات، ترتيب المجموعات، السباقات،
// والمنتخبات. الضغط على أي مباراة يفتح مركز المباراة (WorldCupMatchCenter).

private struct WCMatchSelection: Identifiable { let id: Int }

struct WorldCupView: View {
    @State private var overview: WCOverview?
    @State private var fixtures: [WCFixture] = []
    @State private var standings: [WCGroup] = []
    @State private var scorers: [WCScorer] = []

    @State private var overviewLoading = true
    @State private var fixturesLoading = true
    @State private var standingsLoading = true
    @State private var scorersLoading = true

    @State private var selectedMatch: WCMatchSelection?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 22) {
                WCHeroSection(overview: overview, isLoading: overviewLoading) { open($0) }

                if let saudi = overview?.saudi, !saudi.fixtures.isEmpty {
                    WCSaudiSpotlight(saudi: saudi) { open($0) }
                }

                WCMatchesSection(fixtures: fixtures, isLoading: fixturesLoading) { open($0) }

                WCStandingsSection(groups: standings, isLoading: standingsLoading)

                WCRacesSection(scorers: scorers, scorersLoading: scorersLoading)

                WCTeamsSection()
            }
            .padding(.bottom, 36)
        }
        .background(WCTheme.sectionBackground.ignoresSafeArea())
        .navigationTitle("مونديال 2026")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(WCTheme.stadiumTop, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task { await loadAll() }
        .refreshable { await loadAll(force: true) }
        .sheet(item: $selectedMatch) { sel in
            WorldCupMatchCenter(fixtureId: sel.id)
        }
        .sabqRTL()
    }

    private func open(_ fixtureId: Int) { selectedMatch = WCMatchSelection(id: fixtureId) }

    private func loadAll(force: Bool = false) async {
        async let a: Void = loadOverview(force: force)
        async let b: Void = loadFixtures()
        async let c: Void = loadStandings()
        async let d: Void = loadScorers()
        _ = await (a, b, c, d)
    }

    private func loadOverview(force: Bool) async {
        do {
            let r = try await APIClient.shared.fetchWorldCupOverview(ignoreCache: force)
            await MainActor.run { overview = r; overviewLoading = false }
        } catch { await MainActor.run { overviewLoading = false } }
    }
    private func loadFixtures() async {
        do {
            let r = try await APIClient.shared.fetchWorldCupFixtures()
            await MainActor.run { fixtures = r; fixturesLoading = false }
        } catch { await MainActor.run { fixturesLoading = false } }
    }
    private func loadStandings() async {
        do {
            let r = try await APIClient.shared.fetchWorldCupStandings()
            await MainActor.run { standings = r; standingsLoading = false }
        } catch { await MainActor.run { standingsLoading = false } }
    }
    private func loadScorers() async {
        do {
            let r = try await APIClient.shared.fetchWorldCupScorers()
            await MainActor.run { scorers = r; scorersLoading = false }
        } catch { await MainActor.run { scorersLoading = false } }
    }
}

// MARK: - الهيرو (مباراة اليوم)

struct WCHeroSection: View {
    let overview: WCOverview?
    let isLoading: Bool
    let onOpenMatch: (Int) -> Void

    private var motd: WCMatchOfDay? { overview?.matchOfTheDay }
    private var liveCount: Int { overview?.live.count ?? 0 }

    var body: some View {
        ZStack {
            LinearGradient(colors: [WCTheme.stadiumTop, WCTheme.stadiumBottom],
                           startPoint: .topTrailing, endPoint: .bottomLeading)
            Circle()
                .stroke(.white.opacity(0.06), lineWidth: 2)
                .frame(width: 360, height: 360)
                .offset(y: 150)

            VStack(spacing: 18) {
                header
                card
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 22)
        }
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var header: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                pill(icon: "trophy.fill", text: "تغطية خاصة",
                     bg: WCTheme.emerald.opacity(0.15), fg: WCTheme.emerald)
                if liveCount > 0 {
                    pill(icon: "dot.radiowaves.left.and.right",
                         text: liveCount == 1 ? "مباراة مباشرة" : "\(liveCount) مباريات مباشرة",
                         bg: WCTheme.liveRed, fg: .white)
                }
            }
            Text("مونديال 2026")
                .font(.system(size: 40, weight: .black, design: .rounded))
                .foregroundStyle(.white)
            Text("48 منتخبًا · 16 ملعبًا · تغطية حية بتوقيت الرياض")
                .font(.system(size: 12))
                .foregroundStyle(WCTheme.emerald.opacity(0.75))
                .multilineTextAlignment(.center)
        }
    }

    @ViewBuilder private var card: some View {
        if isLoading {
            VStack(spacing: 14) {
                ProgressView().tint(.white)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 30)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(.white.opacity(0.06)))
        } else if let motd {
            matchCard(motd)
        } else {
            WCEmptyDark(icon: "sparkles", title: "تغطية المونديال تنطلق قريبًا",
                        subtitle: "جدول المباريات والنتائج الحية ستجدها هنا أولًا بأول")
        }
    }

    private func matchCard(_ motd: WCMatchOfDay) -> some View {
        let f = motd.fixture
        return VStack(spacing: 16) {
            HStack(spacing: 6) {
                Text(f.status.live ? "تجري الآن" : (WCFormat.dayKey(f.date) == WCFormat.todayKey() ? "مباراة اليوم" : "المباراة القادمة"))
                    .foregroundStyle(WCTheme.emerald)
                Text("·").foregroundStyle(.white.opacity(0.4))
                Text(f.round).foregroundStyle(.white.opacity(0.7))
            }
            .font(.system(size: 12, weight: .semibold))

            HStack(alignment: .top, spacing: 8) {
                teamColumn(f.home)
                centerColumn(f)
                teamColumn(f.away)
            }

            if !f.started {
                WCCountdownChips(timestamp: f.timestamp)
            }
            if let p = motd.prediction, !f.status.finished {
                WCProbabilityBar(fixture: f, prediction: p)
            }

            Button { onOpenMatch(f.id) } label: {
                Text("مركز المباراة")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(WCTheme.stadiumTop)
                    .padding(.horizontal, 24).padding(.vertical, 10)
                    .background(Capsule().fill(WCTheme.emerald))
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(.white.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(.white.opacity(0.1), lineWidth: 1))
    }

    private func teamColumn(_ team: WCTeam) -> some View {
        VStack(spacing: 8) {
            WCTeamLogo(team: team, size: 64, ring: .white.opacity(0.15))
            Text(team.name)
                .font(.system(size: 16, weight: .heavy))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private func centerColumn(_ f: WCFixture) -> some View {
        VStack(spacing: 6) {
            if f.started {
                Text("\(f.goals.home ?? 0) - \(f.goals.away ?? 0)")
                    .font(.system(size: 40, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .environment(\.layoutDirection, .leftToRight)
                if let pen = f.penalties {
                    Text("(\(pen.home ?? 0) - \(pen.away ?? 0)) ركلات الترجيح")
                        .font(.system(size: 11)).foregroundStyle(WCTheme.emerald.opacity(0.85))
                }
                WCStatusPill(fixture: f, onDark: true)
            } else {
                Text(WCFormat.time(f))
                    .font(.system(size: 26, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                Label(WCFormat.day(f), systemImage: "calendar")
                    .font(.system(size: 11))
                    .foregroundStyle(WCTheme.emerald.opacity(0.75))
                    .labelStyle(.titleAndIcon)
            }
        }
        .frame(minWidth: 110)
    }

    private func pill(icon: String, text: String, bg: Color, fg: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 11, weight: .bold))
            Text(text).font(.system(size: 12, weight: .bold))
        }
        .foregroundStyle(fg)
        .padding(.horizontal, 12).padding(.vertical, 5)
        .background(Capsule().fill(bg))
    }
}

/// حالة فارغة داخل الهيرو الداكن.
struct WCEmptyDark: View {
    let icon: String; let title: String; let subtitle: String
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 30)).foregroundStyle(WCTheme.emerald)
            Text(title).font(.system(size: 16, weight: .bold)).foregroundStyle(.white)
            Text(subtitle).font(.system(size: 12)).foregroundStyle(.white.opacity(0.7))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 24)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(.white.opacity(0.06)))
    }
}

// MARK: - مشوار الأخضر

struct WCSaudiSpotlight: View {
    let saudi: WCSaudi
    let onOpenMatch: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Text("مشوار الأخضر")
                    .font(SabqFonts.headline(size: 24)).foregroundStyle(.white)
                if let g = saudi.group {
                    Text(g.group)
                        .font(.system(size: 11, weight: .semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Capsule().fill(.white.opacity(0.15)))
                }
                Spacer()
            }
            if let next = saudi.next {
                Label("\(next.venue.name) — \(next.venue.city)", systemImage: "mappin.and.ellipse")
                    .font(.system(size: 12)).foregroundStyle(WCTheme.emerald.opacity(0.85))
            }
            ForEach(saudi.fixtures) { f in
                saudiRow(f)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [WCTheme.emeraldDeep, WCTheme.stadiumTop],
                           startPoint: .topTrailing, endPoint: .bottomLeading)
        )
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .padding(.horizontal, 16)
    }

    private func saudiRow(_ f: WCFixture) -> some View {
        let opp = f.home.id == WCTheme.saudiId ? f.away : f.home
        let saudiGoals = f.home.id == WCTheme.saudiId ? f.goals.home : f.goals.away
        let oppGoals = f.home.id == WCTheme.saudiId ? f.goals.away : f.goals.home
        return Button { onOpenMatch(f.id) } label: {
            HStack(spacing: 10) {
                WCTeamLogo(team: opp, size: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text("ضد \(opp.name)").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                    Text("\(f.round) · \(WCFormat.day(f))")
                        .font(.system(size: 11)).foregroundStyle(WCTheme.emerald.opacity(0.7))
                }
                Spacer()
                if f.started {
                    Text("\(saudiGoals ?? 0) - \(oppGoals ?? 0)")
                        .font(.system(size: 17, weight: .black, design: .rounded)).foregroundStyle(.white)
                        .environment(\.layoutDirection, .leftToRight)
                } else {
                    Text(WCFormat.time(f)).font(.system(size: 14, weight: .bold)).foregroundStyle(WCTheme.emerald)
                }
                WCStatusPill(fixture: f, onDark: true)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white.opacity(0.08)))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - المباريات (تبويبات)

struct WCMatchesSection: View {
    let fixtures: [WCFixture]
    let isLoading: Bool
    let onOpenMatch: (Int) -> Void

    enum Tab: String, CaseIterable { case live = "مباشر", today = "اليوم", upcoming = "القادمة", finished = "النتائج" }
    // nil = اتبع الافتراضي المحسوب؛ بمجرد اختيار المستخدم يثبت اختياره
    @State private var userTab: Tab?

    private var live: [WCFixture] { fixtures.filter { $0.status.live } }
    private var today: [WCFixture] { fixtures.filter { WCFormat.dayKey($0.date) == WCFormat.todayKey() } }
    private var upcoming: [WCFixture] { fixtures.filter { !$0.status.live && !$0.status.finished } }
    private var finished: [WCFixture] { fixtures.filter { $0.status.finished }.reversed() }

    // الافتراضي «اليوم» إذا كان فيه مباريات (لتقليل الازدحام)، وإلا مباشر ثم القادمة
    private var defaultTab: Tab {
        if !today.isEmpty { return .today }
        if !live.isEmpty { return .live }
        return .upcoming
    }
    private var tab: Tab { userTab ?? defaultTab }

    private var current: [WCFixture] {
        switch tab {
        case .live: return live
        case .today: return today
        case .upcoming: return upcoming
        case .finished: return finished
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            WCSectionHeader(icon: "calendar", title: "المباريات",
                            subtitle: "جدول مونديال 2026 بتوقيت الرياض")
                .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Tab.allCases, id: \.self) { t in
                        let count = t == .live ? live.count : 0
                        Button { withAnimation(.easeOut(duration: 0.2)) { userTab = t } } label: {
                            HStack(spacing: 5) {
                                Text(t.rawValue)
                                if t == .live && count > 0 {
                                    Text("\(count)").font(.system(size: 10, weight: .bold))
                                        .padding(.horizontal, 5).padding(.vertical, 1)
                                        .background(Capsule().fill(WCTheme.liveRed)).foregroundStyle(.white)
                                }
                            }
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(tab == t ? .white : WCTheme.onDarkDim)
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(Capsule().fill(tab == t ? WCTheme.emeraldDeep : WCTheme.chipFill))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }

            if isLoading {
                WCLoading()
            } else if current.isEmpty {
                Text(emptyText)
                    .font(.system(size: 13)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 30)
            } else {
                LazyVStack(spacing: 16) {
                    ForEach(groupedByDay(current), id: \.key) { day in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 6) {
                                Circle().fill(WCTheme.emeraldDeep).frame(width: 7, height: 7)
                                Text(day.label).font(.system(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark)
                                Text("(\(day.items.count))").font(.system(size: 12)).foregroundStyle(WCTheme.onDarkDim)
                            }
                            ForEach(day.items) { f in
                                WCMatchCard(fixture: f) { onOpenMatch(f.id) }
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private var emptyText: String {
        switch tab {
        case .live: return "لا توجد مباريات مباشرة الآن — عُد عند صافرة البداية"
        case .today: return "لا توجد مباريات اليوم"
        case .upcoming: return "لا توجد مباريات قادمة معلنة بعد"
        case .finished: return "لم تُلعب أي مباراة بعد — الانطلاقة قريبًا"
        }
    }

    private struct DayBucket { let key: String; let label: String; let items: [WCFixture] }
    private func groupedByDay(_ items: [WCFixture]) -> [DayBucket] {
        var buckets: [DayBucket] = []
        for f in items {
            let key = WCFormat.dayKey(f.date)
            if let last = buckets.last, last.key == key {
                buckets[buckets.count - 1] = DayBucket(key: key, label: last.label, items: last.items + [f])
            } else {
                buckets.append(DayBucket(key: key, label: WCFormat.day(f), items: [f]))
            }
        }
        return buckets
    }
}

/// بطاقة مباراة.
struct WCMatchCard: View {
    let fixture: WCFixture
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 10) {
                HStack {
                    Text(fixture.round).font(.system(size: 11, weight: .semibold)).foregroundStyle(WCTheme.onDarkDim)
                    Spacer()
                    WCStatusPill(fixture: fixture)
                }
                teamRow(fixture.home, goals: fixture.started ? fixture.goals.home ?? 0 : nil, win: fixture.home.winner == true)
                teamRow(fixture.away, goals: fixture.started ? fixture.goals.away ?? 0 : nil, win: fixture.away.winner == true)
                if let pen = fixture.penalties {
                    HStack {
                        Text("ركلات الترجيح: \(pen.home ?? 0) - \(pen.away ?? 0)")
                            .font(.system(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                        Spacer()
                    }
                }
                Divider().overlay(WCTheme.cardStroke)
                HStack(spacing: 5) {
                    Image(systemName: "mappin.and.ellipse").font(.system(size: 10))
                    Text("\(fixture.venue.name) — \(fixture.venue.city)").lineLimit(1)
                    Spacer()
                }
                .font(.system(size: 11)).foregroundStyle(WCTheme.onDarkDim)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(WCTheme.card))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
        }
        .buttonStyle(.plain)
    }

    private func teamRow(_ team: WCTeam, goals: Int?, win: Bool) -> some View {
        HStack(spacing: 8) {
            WCTeamLogo(team: team, size: 28, ring: WCTheme.cardStroke)
            Text(team.name)
                .font(.system(size: 14, weight: win ? .heavy : .semibold))
                .foregroundStyle(WCTheme.onDark)
            Spacer()
            if let goals {
                Text("\(goals)")
                    .font(.system(size: 16, weight: .heavy, design: .rounded))
                    .foregroundStyle(win ? WCTheme.emeraldDeep : WCTheme.onDark)
            }
        }
    }
}

// MARK: - ترتيب المجموعات

struct WCStandingsSection: View {
    let groups: [WCGroup]
    let isLoading: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            WCSectionHeader(icon: "list.number", title: "ترتيب المجموعات",
                            subtitle: "يتأهل الأول والثاني وأفضل 8 من أصحاب المركز الثالث")
                .padding(.horizontal, 16)

            if isLoading {
                WCLoading()
            } else if groups.isEmpty {
                Text("جداول الترتيب تظهر هنا فور انطلاق البطولة")
                    .font(.system(size: 13)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 28)
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(groups) { group in
                        groupCard(group)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func groupCard(_ group: WCGroup) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(group.group).font(.system(size: 15, weight: .heavy)).foregroundStyle(WCTheme.emeraldDeep)
                Spacer()
                HStack(spacing: 10) {
                    Text("لعب"); Text("فارق"); Text("نقاط")
                }
                .font(.system(size: 10)).foregroundStyle(WCTheme.onDarkDim)
            }
            ForEach(group.rows) { row in
                standingRow(row)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }

    private func standingRow(_ row: WCStandingRow) -> some View {
        let highlight: Color = row.rank <= 2 ? WCTheme.emeraldDeep : (row.rank == 3 ? WCTheme.gold : .clear)
        return HStack(spacing: 8) {
            Text("\(row.rank)").font(.system(size: 12)).foregroundStyle(WCTheme.onDarkDim).frame(width: 16)
            WCTeamLogo(team: row.team, size: 20, ring: WCTheme.cardStroke)
            Text(row.team.name).font(.system(size: 13, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
            if let form = row.form { WCFormDots(form: form) }
            Spacer()
            Text("\(row.played)").frame(width: 28)
            Text(row.goalsDiff > 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)").frame(width: 36)
                .environment(\.layoutDirection, .leftToRight)
            Text("\(row.points)").font(.system(size: 14, weight: .black)).foregroundStyle(WCTheme.onDark).frame(width: 28)
        }
        .font(.system(size: 12).monospacedDigit())
        .foregroundStyle(WCTheme.onDarkDim)
        .padding(.vertical, 5).padding(.horizontal, 6)
        .background(
            HStack { Rectangle().fill(highlight).frame(width: 3); Spacer() }
                .background(highlight == .clear ? Color.clear : highlight.opacity(0.07))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        )
    }
}

/// نقاط شكل آخر 5 مباريات.
struct WCFormDots: View {
    let form: String
    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(form.suffix(5).enumerated()), id: \.offset) { _, ch in
                Circle().fill(color(ch)).frame(width: 6, height: 6)
            }
        }
        .environment(\.layoutDirection, .leftToRight)
    }
    private func color(_ ch: Character) -> Color {
        switch ch { case "W": return WCTheme.emeraldDeep; case "D": return WCTheme.onDarkDim; case "L": return WCTheme.liveRed; default: return WCTheme.cardStroke }
    }
}
