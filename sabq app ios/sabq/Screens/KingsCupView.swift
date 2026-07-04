import SwiftUI

// MARK: - قسم كأس خادم الحرمين الشريفين — الشاشة الكاملة
//
// تستهلك /api/kings-cup/* العامة. تطابق صفحة الويب /kings-cup: هيرو مباراة
// اليوم/القادمة، جدول المباريات بتبويبات، شجرة الأدوار الإقصائية، سباقات
// الهدّافين وصنّاع الأهداف والبطاقات، الأندية المشاركة، وحقائق النسخة السابقة.
// الضغط على أي مباراة يفتح مركز المباراة (KingsCupMatchCenter).

private struct KcMatchSelection: Identifiable { let id: Int }

struct KingsCupView: View {
    @State private var overview: KcOverview?
    @State private var fixtures: [KcFixture] = []
    @State private var bracket: KcBracket?
    @State private var scorers: [KcScorer] = []
    @State private var assists: [KcLeader] = []
    @State private var cards: KcCards?
    @State private var teams: [KcTeam] = []
    @State private var history: KcHistory?

    @State private var overviewLoading = true
    @State private var fixturesLoading = true
    @State private var bracketLoading = true
    @State private var racesLoading = true

    @State private var selectedMatch: KcMatchSelection?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 22) {
                KcHeroSection(overview: overview, isLoading: overviewLoading) { open($0) }

                KcHistorySection(history: history)

                KcMatchesSection(fixtures: fixtures, isLoading: fixturesLoading) { open($0) }

                KcBracketSection(bracket: bracket, isLoading: bracketLoading) { open($0) }

                KcRacesSection(
                    scorers: scorers, assists: assists, cards: cards,
                    isLoading: racesLoading,
                    started: fixtures.contains { $0.status.live || $0.status.finished }
                )

                KcTeamsSection(teams: teams)
            }
            .padding(.bottom, 36)
        }
        .sabqAutoHideTabBar()
        .background(WCTheme.sectionBackground.ignoresSafeArea())
        .navigationTitle("كأس الملك")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadAll() }
        .task {
            var tick = 0
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                if Task.isCancelled { return }
                tick += 1
                if isAnyLive {
                    await loadAll(force: true)
                } else if isKickoffImminent, tick % 3 == 0 {
                    async let a: Void = loadOverview(force: true)
                    async let b: Void = loadFixtures(force: true)
                    _ = await (a, b)
                }
            }
        }
        .refreshable { await loadAll(force: true) }
        .sheet(item: $selectedMatch) { sel in
            KingsCupMatchCenter(fixtureId: sel.id)
        }
        .sabqRTL()
    }

    private func open(_ fixtureId: Int) { selectedMatch = KcMatchSelection(id: fixtureId) }

    private var isAnyLive: Bool {
        (overview?.live.contains { $0.status.live } ?? false) || fixtures.contains { $0.status.live }
    }

    private var isKickoffImminent: Bool {
        let now = Int(Date().timeIntervalSince1970)
        return fixtures.contains {
            !$0.status.live && !$0.status.finished && $0.timestamp - now <= 600 && now - $0.timestamp <= 900
        }
    }

    private func loadAll(force: Bool = false) async {
        async let a: Void = loadOverview(force: force)
        async let b: Void = loadFixtures(force: force)
        async let c: Void = loadBracket(force: force)
        async let d: Void = loadRaces(force: force)
        async let e: Void = loadTeams()
        async let f: Void = loadHistory()
        _ = await (a, b, c, d, e, f)
    }

    private func loadOverview(force: Bool) async {
        do {
            let r = try await APIClient.shared.fetchKingsCupOverview(ignoreCache: force)
            await MainActor.run { overview = r; overviewLoading = false }
        } catch { await MainActor.run { overviewLoading = false } }
    }
    private func loadFixtures(force: Bool = false) async {
        do {
            let r = try await APIClient.shared.fetchKingsCupFixtures(ignoreCache: force)
            await MainActor.run { fixtures = r; fixturesLoading = false }
        } catch { await MainActor.run { fixturesLoading = false } }
    }
    private func loadBracket(force: Bool = false) async {
        do {
            let r = try await APIClient.shared.fetchKingsCupBracket(ignoreCache: force)
            await MainActor.run { bracket = r; bracketLoading = false }
        } catch { await MainActor.run { bracketLoading = false } }
    }
    private func loadRaces(force: Bool = false) async {
        async let s = APIClient.shared.fetchKingsCupScorers(ignoreCache: force)
        async let a = APIClient.shared.fetchKingsCupAssists()
        async let c = APIClient.shared.fetchKingsCupCards()
        let rs = (try? await s) ?? []
        let ra = (try? await a) ?? []
        let rc = try? await c
        await MainActor.run { scorers = rs; assists = ra; cards = rc; racesLoading = false }
    }
    private func loadTeams() async {
        if let r = try? await APIClient.shared.fetchKingsCupTeams() {
            await MainActor.run { teams = r }
        }
    }
    private func loadHistory() async {
        if let r = try? await APIClient.shared.fetchKingsCupHistory() {
            await MainActor.run { history = r }
        }
    }
}

// MARK: - الهيرو (مباراة اليوم/القادمة)

struct KcHeroSection: View {
    let overview: KcOverview?
    let isLoading: Bool
    let onOpenMatch: (Int) -> Void

    @State private var selectedTeam: KcTeam?

    private var featured: KcFixture? { overview?.matchOfTheDay?.fixture ?? overview?.nextMatch }
    private var today: [KcFixture] { overview?.today ?? [] }
    private var liveCount: Int { (overview?.live ?? []).filter { $0.status.live }.count }
    private var showStrip: Bool { today.count >= 2 }

    var body: some View {
        VStack(spacing: 18) {
            header
            card
            if !isLoading, showStrip {
                KcHeroTodayStrip(matches: today, activeId: featured?.id, onOpenMatch: onOpenMatch)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 52)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .sheet(item: $selectedTeam) { team in
            KcTeamSheet(teamId: team.id, teamName: team.name).presentationDetents([.large])
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                pill(icon: "trophy.fill", text: "تغطية خاصة", bg: WCTheme.gold.opacity(0.18), fg: WCTheme.gold)
                if liveCount > 0 {
                    pill(icon: "dot.radiowaves.left.and.right",
                         text: liveCount == 1 ? "مباراة مباشرة" : "\(liveCount) مباريات مباشرة",
                         bg: WCTheme.liveRed, fg: .white)
                }
            }
            Text("كأس الملك")
                .font(SabqFonts.app(size: 40, weight: .black))
                .foregroundStyle(WCTheme.emeraldDeep)
            Text("كأس خادم الحرمين الشريفين · تغطية حية بتوقيت الرياض")
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(WCTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
    }

    @ViewBuilder private var card: some View {
        if isLoading {
            VStack(spacing: 14) { ProgressView().tint(WCTheme.emerald) }
                .frame(maxWidth: .infinity).padding(.vertical, 30)
                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(WCTheme.card))
        } else if let champion = overview?.champion {
            championHero(champion)
        } else if let f = featured {
            matchCard(f)
        } else {
            KcHeroEmpty(icon: "sparkles", title: "تغطية كأس الملك تنطلق قريبًا",
                        subtitle: "جدول المباريات والنتائج الحية ستجدها هنا أولًا بأول")
        }
    }

    private func matchCard(_ f: KcFixture) -> some View {
        VStack(spacing: 16) {
            HStack(spacing: 6) {
                Text(f.status.live ? "تجري الآن" : (WCFormat.dayKey(f.date) == WCFormat.todayKey() ? "مباراة اليوم" : "المباراة القادمة"))
                    .foregroundStyle(WCTheme.emeraldDeep)
                Text("·").foregroundStyle(WCTheme.onDarkDim)
                Text(f.round).foregroundStyle(WCTheme.onDarkDim)
            }
            .font(SabqFonts.app(size: 12, weight: .semibold))

            HStack(alignment: .top, spacing: 8) {
                teamColumn(f.home)
                centerColumn(f)
                teamColumn(f.away)
            }

            if !f.started { KcCountdownChips(timestamp: f.timestamp) }

            Button { onOpenMatch(f.id) } label: {
                Text("مركز المباراة")
                    .font(SabqFonts.app(size: 15, weight: .bold)).foregroundStyle(.white)
                    .padding(.horizontal, 24).padding(.vertical, 10)
                    .background(Capsule().fill(WCTheme.royal))
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(WCTheme.cardStroke, lineWidth: 1))
        .shadow(color: WCTheme.royal.opacity(0.10), radius: 16, x: 0, y: 8)
    }

    private func championHero(_ c: KcChampion) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "trophy.fill").font(.system(size: 34)).foregroundStyle(WCTheme.gold)
            Text("بطل كأس الملك").font(SabqFonts.app(size: 13, weight: .bold)).foregroundStyle(WCTheme.gold)
            KcTeamLogo(team: c.team, size: 72, ring: WCTheme.gold.opacity(0.6))
            Text(c.team.name).font(SabqFonts.app(size: 24, weight: .black)).foregroundStyle(WCTheme.onDark)
            if let runnerUp = c.runnerUp, let score = c.score {
                Text("فاز على \(runnerUp.name) في النهائي \(score)\(c.penalties.map { " (بركلات الترجيح \($0))" } ?? "")")
                    .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(WCTheme.emeraldDeep)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(WCTheme.gold.opacity(0.3), lineWidth: 1))
    }

    private func teamColumn(_ team: KcTeam) -> some View {
        Button { selectedTeam = team } label: {
            VStack(spacing: 8) {
                KcTeamLogo(team: team, size: 64, ring: WCTheme.cardStroke)
                Text(team.name)
                    .font(SabqFonts.app(size: 16, weight: .heavy)).foregroundStyle(WCTheme.onDark)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private func centerColumn(_ f: KcFixture) -> some View {
        VStack(spacing: 6) {
            if f.started {
                Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                    .font(SabqFonts.app(size: 40, weight: .black)).foregroundStyle(WCTheme.onDark)
                    .environment(\.layoutDirection, .leftToRight)
                if let po = f.penaltyOutcome {
                    Text("فاز \(po.winnerName) بالترجيح (\(po.winnerScore)-\(po.loserScore))")
                        .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                        .multilineTextAlignment(.center)
                }
                KcStatusPill(fixture: f)
            } else {
                Text(KcFormat.time(f)).font(SabqFonts.app(size: 26, weight: .black)).foregroundStyle(WCTheme.onDark)
                Label(KcFormat.day(f), systemImage: "calendar")
                    .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                    .labelStyle(.titleAndIcon)
            }
        }
        .frame(minWidth: 110)
    }

    private func pill(icon: String, text: String, bg: Color, fg: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon).font(SabqFonts.app(size: 11, weight: .bold))
            Text(text).font(SabqFonts.app(size: 12, weight: .bold))
        }
        .foregroundStyle(fg)
        .padding(.horizontal, 12).padding(.vertical, 5)
        .background(Capsule().fill(bg))
    }
}

/// شريط «مباريات اليوم» أسفل الهيرو.
struct KcHeroTodayStrip: View {
    let matches: [KcFixture]
    let activeId: Int?
    let onOpenMatch: (Int) -> Void

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 5) {
                Image(systemName: "calendar").font(SabqFonts.app(size: 11, weight: .bold))
                Text("مباريات اليوم").font(SabqFonts.app(size: 12, weight: .bold))
                Text("(\(matches.count))").font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
            }
            .foregroundStyle(WCTheme.emeraldDeep)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(matches) { f in chip(f) }
                }
                .padding(.horizontal, 2)
            }
        }
        .padding(.top, 4)
    }

    private func chip(_ f: KcFixture) -> some View {
        let active = f.id == activeId
        return Button { onOpenMatch(f.id) } label: {
            VStack(spacing: 4) {
                HStack(spacing: 6) {
                    KcTeamLogo(team: f.home, size: 22, ring: WCTheme.cardStroke)
                    Text(f.started ? "\(f.goals.away ?? 0) - \(f.goals.home ?? 0)" : KcFormat.time(f))
                        .font(SabqFonts.app(size: 13, weight: .black)).foregroundStyle(WCTheme.onDark)
                        .environment(\.layoutDirection, .leftToRight).frame(minWidth: 44)
                    KcTeamLogo(team: f.away, size: 22, ring: WCTheme.cardStroke)
                }
                Group {
                    if f.status.live {
                        HStack(spacing: 3) {
                            Circle().fill(WCTheme.liveRed).frame(width: 5, height: 5)
                            Text(f.status.label.isEmpty ? "مباشر" : f.status.label)
                        }
                        .foregroundStyle(WCTheme.liveRed)
                    } else {
                        Text(f.status.finished ? "انتهت" : "لم تبدأ").foregroundStyle(WCTheme.onDarkDim)
                    }
                }
                .font(SabqFonts.app(size: 10, weight: .semibold))
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(active ? WCTheme.emerald.opacity(0.15) : WCTheme.chipFill))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(active ? WCTheme.emerald.opacity(0.5) : WCTheme.cardStroke.opacity(0.4), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

struct KcHeroEmpty: View {
    let icon: String; let title: String; let subtitle: String
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(SabqFonts.app(size: 30)).foregroundStyle(WCTheme.emerald)
            Text(title).font(SabqFonts.app(size: 16, weight: .bold)).foregroundStyle(WCTheme.onDark)
            Text(subtitle).font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 24)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(WCTheme.card))
    }
}

// MARK: - حقائق النسخة السابقة

struct KcHistorySection: View {
    let history: KcHistory?

    var body: some View {
        if let h = history, h.hasContent {
            VStack(alignment: .leading, spacing: 12) {
                KcSectionHeader(icon: "clock.arrow.circlepath", title: "من النسخة السابقة",
                                subtitle: h.previousSeason.map { "موسم \($0)" } ?? "أبرز أرقام البطولة")
                    .padding(.horizontal, 16)
                HStack(spacing: 12) {
                    if let champ = h.champion {
                        factCard(icon: "trophy.fill", tint: WCTheme.gold, label: "حامل اللقب",
                                 name: champ.name, logo: champ.logo)
                    }
                    if let scorer = h.topScorer {
                        factCard(icon: "soccerball", tint: WCTheme.emeraldDeep, label: "هدّاف النسخة",
                                 name: scorer.name, logo: scorer.photo, sub: "\(scorer.goals) أهداف")
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func factCard(icon: String, tint: Color, label: String, name: String, logo: String, sub: String? = nil) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(tint.opacity(0.14)).frame(width: 46, height: 46)
                if logo.isEmpty {
                    Image(systemName: icon).foregroundStyle(tint)
                } else {
                    WCRemoteImage(url: logo).frame(width: 34, height: 34)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(tint)
                Text(name).font(SabqFonts.app(size: 14, weight: .black)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                if let sub { Text(sub).font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim) }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }
}

// MARK: - المباريات (تبويبات)

struct KcMatchesSection: View {
    let fixtures: [KcFixture]
    let isLoading: Bool
    let onOpenMatch: (Int) -> Void

    enum Tab: String, CaseIterable { case live = "مباشر", today = "اليوم", upcoming = "القادمة", finished = "النتائج" }
    @State private var userTab: Tab?

    private var live: [KcFixture] { fixtures.filter { $0.status.live } }
    private var today: [KcFixture] {
        func rank(_ f: KcFixture) -> Int { f.status.live ? 0 : (f.status.finished ? 2 : 1) }
        return fixtures
            .filter { WCFormat.dayKey($0.date) == WCFormat.todayKey() }
            .sorted { a, b in
                let (ra, rb) = (rank(a), rank(b))
                return ra != rb ? ra < rb : a.timestamp < b.timestamp
            }
    }
    private var upcoming: [KcFixture] { fixtures.filter { !$0.status.live && !$0.status.finished } }
    private var finished: [KcFixture] { fixtures.filter { $0.status.finished }.reversed() }

    private var defaultTab: Tab {
        if !today.isEmpty { return .today }
        if !live.isEmpty { return .live }
        return .upcoming
    }
    private var tab: Tab { userTab ?? defaultTab }

    private var current: [KcFixture] {
        switch tab {
        case .live: return live
        case .today: return today
        case .upcoming: return upcoming
        case .finished: return finished
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            KcSectionHeader(icon: "calendar", title: "المباريات", subtitle: "جدول كأس الملك بتوقيت الرياض")
                .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Tab.allCases, id: \.self) { t in
                        let count = t == .live ? live.count : 0
                        Button { withAnimation(.easeOut(duration: 0.2)) { userTab = t } } label: {
                            HStack(spacing: 5) {
                                Text(t.rawValue)
                                if t == .live && count > 0 {
                                    Text("\(count)").font(SabqFonts.app(size: 10, weight: .bold))
                                        .padding(.horizontal, 5).padding(.vertical, 1)
                                        .background(Capsule().fill(WCTheme.liveRed)).foregroundStyle(.white)
                                }
                            }
                            .font(SabqFonts.app(size: 14, weight: .semibold))
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
                KcLoading()
            } else if current.isEmpty {
                kcEmptyText(emptyText)
            } else {
                LazyVStack(spacing: 16) {
                    ForEach(groupedByDay(current), id: \.key) { day in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 6) {
                                Circle().fill(WCTheme.emeraldDeep).frame(width: 7, height: 7)
                                Text(day.label).font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark)
                                Text("(\(day.items.count))").font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
                            }
                            ForEach(day.items) { f in
                                KcMatchCard(fixture: f) { onOpenMatch(f.id) }
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
        case .finished: return live.isEmpty ? "النتائج تظهر هنا فور انتهاء أول مباراة" : "مباراة جارية الآن — نتيجتها تظهر هنا فور صافرة النهاية"
        }
    }

    private struct DayBucket { let key: String; let label: String; let items: [KcFixture] }
    private func groupedByDay(_ items: [KcFixture]) -> [DayBucket] {
        var buckets: [DayBucket] = []
        for f in items {
            let key = WCFormat.dayKey(f.date)
            if let last = buckets.last, last.key == key {
                buckets[buckets.count - 1] = DayBucket(key: key, label: last.label, items: last.items + [f])
            } else {
                buckets.append(DayBucket(key: key, label: KcFormat.day(f), items: [f]))
            }
        }
        return buckets
    }
}

struct KcMatchCard: View {
    let fixture: KcFixture
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 10) {
                HStack {
                    Text(fixture.round).font(SabqFonts.app(size: 11, weight: .semibold)).foregroundStyle(WCTheme.onDarkDim)
                    Spacer()
                    KcStatusPill(fixture: fixture)
                }
                teamRow(fixture.home, goals: fixture.started ? fixture.goals.home ?? 0 : nil, win: fixture.home.winner == true)
                teamRow(fixture.away, goals: fixture.started ? fixture.goals.away ?? 0 : nil, win: fixture.away.winner == true)
                if let po = fixture.penaltyOutcome {
                    HStack {
                        Text("فاز \(po.winnerName) بركلات الترجيح (\(po.winnerScore)-\(po.loserScore))")
                            .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                        Spacer()
                    }
                }
                Divider().overlay(WCTheme.cardStroke)
                HStack(spacing: 5) {
                    Image(systemName: "mappin.and.ellipse").font(SabqFonts.app(size: 10))
                    Text(venueLine).lineLimit(1)
                    Spacer()
                }
                .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(WCTheme.card))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
        }
        .buttonStyle(.plain)
    }

    private var venueLine: String {
        let parts = [fixture.venue.name, fixture.venue.city].filter { !$0.isEmpty }
        return parts.isEmpty ? fixture.round : parts.joined(separator: " — ")
    }

    private func teamRow(_ team: KcTeam, goals: Int?, win: Bool) -> some View {
        HStack(spacing: 8) {
            KcTeamLogo(team: team, size: 28, ring: WCTheme.cardStroke)
            Text(team.name).font(SabqFonts.app(size: 14, weight: win ? .heavy : .semibold)).foregroundStyle(WCTheme.onDark)
            Spacer()
            if let goals {
                Text("\(goals)").font(SabqFonts.app(size: 16, weight: .heavy))
                    .foregroundStyle(win ? WCTheme.emeraldDeep : WCTheme.onDark)
            }
        }
    }
}

// MARK: - شجرة الأدوار الإقصائية

struct KcBracketSection: View {
    let bracket: KcBracket?
    let isLoading: Bool
    let onOpenMatch: (Int) -> Void

    var body: some View {
        let rounds = (bracket?.rounds ?? []).filter { !$0.matches.isEmpty }
        if isLoading {
            VStack { KcLoading() }
        } else if !rounds.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                KcSectionHeader(icon: "point.3.filled.connected.trianglepath.dotted",
                                title: "الأدوار الإقصائية", subtitle: "طريق اللقب من الأدوار المبكرة حتى النهائي")
                    .padding(.horizontal, 16)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(rounds) { round in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(round.round)
                                    .font(SabqFonts.app(size: 13, weight: .heavy)).foregroundStyle(WCTheme.emeraldDeep)
                                ForEach(round.matches) { m in
                                    bracketMatch(m)
                                }
                            }
                            .frame(width: 210)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
        }
    }

    private func bracketMatch(_ m: KcFixture) -> some View {
        Button { onOpenMatch(m.id) } label: {
            VStack(spacing: 6) {
                bracketTeam(m.home, goals: m.started ? m.goals.home : nil, win: m.home.winner == true)
                bracketTeam(m.away, goals: m.started ? m.goals.away : nil, win: m.away.winner == true)
                HStack {
                    KcStatusPill(fixture: m)
                    Spacer()
                    if let po = m.penaltyOutcome {
                        Text("ترجيح \(po.winnerScore)-\(po.loserScore)")
                            .font(SabqFonts.app(size: 9, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                    }
                }
            }
            .padding(10)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
        }
        .buttonStyle(.plain)
    }

    private func bracketTeam(_ team: KcTeam, goals: Int?, win: Bool) -> some View {
        HStack(spacing: 6) {
            KcTeamLogo(team: team, size: 22, ring: WCTheme.cardStroke)
            Text(team.name).font(SabqFonts.app(size: 12, weight: win ? .heavy : .regular))
                .foregroundStyle(WCTheme.onDark).lineLimit(1)
            Spacer(minLength: 4)
            if let goals {
                Text("\(goals)").font(SabqFonts.app(size: 13, weight: .black))
                    .foregroundStyle(win ? WCTheme.emeraldDeep : WCTheme.onDark)
            }
        }
    }
}

// MARK: - السباقات (الهدّافون / الصنّاع / البطاقات)

struct KcRacesSection: View {
    let scorers: [KcScorer]
    let assists: [KcLeader]
    let cards: KcCards?
    let isLoading: Bool
    let started: Bool

    enum Tab: String, CaseIterable { case scorers = "الهدّافون", assists = "الصنّاع", cards = "البطاقات" }
    @State private var tab: Tab = .scorers

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            KcSectionHeader(icon: "chart.bar.fill", title: "السباقات الفردية", subtitle: "هدّافو وصنّاع أهداف البطولة")
                .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Tab.allCases, id: \.self) { t in
                        Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                            Text(t.rawValue)
                                .font(SabqFonts.app(size: 14, weight: .semibold))
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
                KcLoading()
            } else {
                content.padding(.horizontal, 16)
            }
        }
    }

    @ViewBuilder private var content: some View {
        switch tab {
        case .scorers:
            if scorers.isEmpty {
                kcEmptyText(started ? "لا توجد أهداف مسجّلة بعد" : "قائمة الهدّافين تظهر بعد انطلاق البطولة")
            } else {
                VStack(spacing: 8) {
                    ForEach(Array(scorers.prefix(15))) { s in
                        raceRow(rank: s.rank, name: s.name, photo: s.photo, team: s.team,
                                value: "\(s.goals)", valueLabel: "هدف",
                                sub: s.assists > 0 ? "\(s.assists) صناعة" : nil)
                    }
                }
            }
        case .assists:
            if assists.isEmpty {
                kcEmptyText(started ? "لا توجد صناعات مسجّلة بعد" : "قائمة الصنّاع تظهر بعد انطلاق البطولة")
            } else {
                VStack(spacing: 8) {
                    ForEach(Array(assists.prefix(15))) { l in
                        raceRow(rank: l.rank, name: l.name, photo: l.photo, team: l.team,
                                value: "\(l.assists ?? 0)", valueLabel: "صناعة", sub: nil)
                    }
                }
            }
        case .cards:
            if let c = cards, !(c.yellow.isEmpty && c.red.isEmpty) {
                VStack(alignment: .leading, spacing: 12) {
                    if !c.red.isEmpty {
                        Text("البطاقات الحمراء").font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.liveRed)
                        ForEach(Array(c.red.prefix(8))) { l in
                            raceRow(rank: l.rank, name: l.name, photo: l.photo, team: l.team,
                                    value: "\(l.red ?? 0)", valueLabel: "حمراء", sub: nil, valueColor: WCTheme.liveRed)
                        }
                    }
                    if !c.yellow.isEmpty {
                        Text("البطاقات الصفراء").font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.gold)
                        ForEach(Array(c.yellow.prefix(8))) { l in
                            raceRow(rank: l.rank, name: l.name, photo: l.photo, team: l.team,
                                    value: "\(l.yellow ?? 0)", valueLabel: "صفراء", sub: nil, valueColor: WCTheme.gold)
                        }
                    }
                }
            } else {
                kcEmptyText("لا توجد بطاقات مسجّلة بعد")
            }
        }
    }

    private func raceRow(rank: Int, name: String, photo: String, team: KcTeam, value: String, valueLabel: String, sub: String?, valueColor: Color = WCTheme.emeraldDeep) -> some View {
        HStack(spacing: 10) {
            Text("\(rank)").font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDarkDim).frame(width: 20)
            if photo.isEmpty {
                Circle().fill(WCTheme.chipFill).frame(width: 34, height: 34)
                    .overlay(Text(String(name.prefix(1))).font(SabqFonts.app(size: 13, weight: .bold)).foregroundStyle(WCTheme.onDarkDim))
            } else {
                WCRemoteImage(url: photo, contentMode: .fill).frame(width: 34, height: 34).clipShape(Circle())
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(name).font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                HStack(spacing: 5) {
                    WCRemoteImage(url: team.logo).frame(width: 14, height: 14)
                    Text(team.name).font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                    if let sub { Text("· \(sub)").font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim) }
                }
            }
            Spacer()
            VStack(spacing: 0) {
                Text(value).font(SabqFonts.app(size: 18, weight: .black)).foregroundStyle(valueColor)
                    .environment(\.layoutDirection, .leftToRight)
                Text(valueLabel).font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }
}

// MARK: - الأندية المشاركة

struct KcTeamsSection: View {
    let teams: [KcTeam]
    @State private var selectedTeam: KcTeam?

    var body: some View {
        if !teams.isEmpty {
            VStack(alignment: .leading, spacing: 14) {
                KcSectionHeader(icon: "shield.lefthalf.filled", title: "الأندية المشاركة", subtitle: "\(teams.count) ناديًا في البطولة")
                    .padding(.horizontal, 16)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 12)], spacing: 12) {
                    ForEach(teams) { team in
                        Button { selectedTeam = team } label: {
                            VStack(spacing: 8) {
                                KcTeamLogo(team: team, size: 50, ring: WCTheme.cardStroke)
                                Text(team.name).font(SabqFonts.app(size: 12, weight: .semibold))
                                    .foregroundStyle(WCTheme.onDark).lineLimit(1).minimumScaleFactor(0.8)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WCTheme.card))
                            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
            .sheet(item: $selectedTeam) { team in
                KcTeamSheet(teamId: team.id, teamName: team.name).presentationDetents([.large])
            }
        }
    }
}
