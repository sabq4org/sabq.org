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
    @State private var showPredictions = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: SabqLayout.sectionGap) {
                KcHeroSection(overview: overview, isLoading: overviewLoading) { open($0) }

                KcPredictCTA { showPredictions = true }
                    .padding(.horizontal, SabqLayout.pageMargin)

                KcHistorySection(history: history)

                KcMatchesSection(fixtures: fixtures, isLoading: fixturesLoading) { open($0) }

                KcBracketSection(bracket: bracket, isLoading: bracketLoading) { open($0) }

                KcRacesSection(
                    scorers: scorers, assists: assists, cards: cards,
                    isLoading: racesLoading,
                    started: fixtures.contains { $0.status.live || $0.status.finished }
                )

                KcTeamsSection(teams: teams)

                KcRecordSection()
            }
            .padding(.bottom, SabqLayout.space40)
        }
        .sabqAutoHideTabBar()
        .background(SabqTheme.background.ignoresSafeArea())
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
            // seed = المباراة من القوائم المحمّلة أصلًا — يفتح المركز فورًا
            KingsCupMatchCenter(fixtureId: sel.id, seed: seedFixture(sel.id))
        }
        .fullScreenCover(isPresented: $showPredictions) {
            KcPredictionsView()
        }
        .sabqRTL()
    }

    private func open(_ fixtureId: Int) { selectedMatch = KcMatchSelection(id: fixtureId) }

    /// المباراة من أي قائمة محمّلة (fixtures/overview) لبذر مركز المباراة.
    private func seedFixture(_ id: Int) -> KcFixture? {
        if let f = fixtures.first(where: { $0.id == id }) { return f }
        if let o = overview {
            for list in [o.live, o.today] {
                if let f = list.first(where: { $0.id == id }) { return f }
            }
            if o.nextMatch?.id == id { return o.nextMatch }
            if o.matchOfTheDay?.fixture.id == id { return o.matchOfTheDay?.fixture }
        }
        return nil
    }

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
        VStack(spacing: SabqLayout.space16) {
            header
            card
            if !isLoading, showStrip {
                KcHeroTodayStrip(matches: today, activeId: featured?.id, onOpenMatch: onOpenMatch)
            }
        }
        .padding(.horizontal, SabqLayout.pageMargin)
        .padding(.top, SabqLayout.space24)
        .frame(maxWidth: .infinity)
        .sheet(item: $selectedTeam) { team in
            KcTeamSheet(teamId: team.id, teamName: team.name).presentationDetents([.large])
        }
    }

    private var header: some View {
        VStack(spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                pill(icon: "trophy.fill", text: "تغطية خاصة", bg: SabqTheme.surfaceMuted,
                     fg: SabqTheme.textPrimary, iconTint: KcTheme.gold)
                if liveCount > 0 {
                    pill(icon: "dot.radiowaves.left.and.right",
                         text: liveCount == 1 ? "مباراة مباشرة" : "\(liveCount) مباريات مباشرة",
                         bg: KcTheme.liveFill, fg: .white, iconTint: .white)
                }
            }
            Text("كأس الملك")
                .sabqText(SabqType.articleTitle)
                .foregroundStyle(KcTheme.accent)
                .accessibilityAddTraits(.isHeader)
            Text("كأس خادم الحرمين الشريفين · تغطية حية بتوقيت الرياض")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
    }

    @ViewBuilder private var card: some View {
        if isLoading {
            VStack { ProgressView().tint(KcTheme.accent) }
                .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space32)
                .sabqBlockSurface()
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
        VStack(spacing: SabqLayout.space16) {
            HStack(spacing: SabqLayout.space4) {
                Text(f.status.live ? "تجري الآن" : (WCFormat.dayKey(f.date) == WCFormat.todayKey() ? "مباراة اليوم" : "المباراة القادمة"))
                    .foregroundStyle(KcTheme.accent)
                Text("·").foregroundStyle(SabqTheme.textTertiary)
                Text(f.round).foregroundStyle(SabqTheme.textSecondary)
            }
            .sabqText(SabqType.metaEmphasis)

            HStack(alignment: .top, spacing: SabqLayout.space8) {
                teamColumn(f.home)
                centerColumn(f)
                teamColumn(f.away)
            }

            if !f.started { KcCountdownChips(timestamp: f.timestamp) }

            // شريط الاحتمالات — يصل جاهزًا مع overview للمباراة المميّزة،
            // ويختفي بعد نهاية المباراة (نفس سلوك هيرو المونديال)
            if let pred = overview?.matchOfTheDay?.prediction,
               f.id == overview?.matchOfTheDay?.fixture.id,
               !f.status.finished {
                KcProbabilityBar(fixture: f, prediction: pred)
            }

            Button { onOpenMatch(f.id) } label: {
                Text("مركز المباراة")
                    .font(SabqType.button.font).foregroundStyle(SabqTheme.onAction)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(KcTheme.accentFill))
            }
            .buttonStyle(.plain)
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity)
        .sabqBlockSurface()
    }

    private func championHero(_ c: KcChampion) -> some View {
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: "trophy.fill").font(SabqType.articleTitle.font).foregroundStyle(KcTheme.gold)
                .accessibilityHidden(true)
            Text("بطل كأس الملك").sabqText(SabqType.metaEmphasis).foregroundStyle(KcTheme.accent)
            KcTeamLogo(team: c.team, size: 72)
            Text(c.team.name).sabqText(SabqType.leadTitle).foregroundStyle(SabqTheme.textPrimary)
            if let runnerUp = c.runnerUp, let score = c.score {
                Text("فاز على \(runnerUp.name) في النهائي \(score)\(c.penalties.map { " (بركلات الترجيح \($0))" } ?? "")")
                    .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(SabqLayout.space24)
        .frame(maxWidth: .infinity)
        .sabqBlockSurface()
    }

    private func teamColumn(_ team: KcTeam) -> some View {
        Button { selectedTeam = team } label: {
            VStack(spacing: SabqLayout.space8) {
                KcTeamLogo(team: team, size: 64)
                Text(team.name)
                    .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private func centerColumn(_ f: KcFixture) -> some View {
        VStack(spacing: SabqLayout.space8) {
            if f.started {
                Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                    .sabqText(SabqType.articleTitle).foregroundStyle(SabqTheme.textPrimary)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                if let po = f.penaltyOutcome {
                    Text("فاز \(po.winnerName) بالترجيح (\(po.winnerScore)-\(po.loserScore))")
                        .sabqText(SabqType.tag).foregroundStyle(KcTheme.accent)
                        .multilineTextAlignment(.center)
                }
                KcStatusPill(fixture: f)
            } else {
                Text(KcFormat.time(f)).sabqText(SabqType.leadTitle).foregroundStyle(SabqTheme.textPrimary)
                Label(KcFormat.day(f), systemImage: "calendar")
                    .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                    .labelStyle(.titleAndIcon)
            }
        }
        .frame(minWidth: 110)
    }

    private func pill(icon: String, text: String, bg: Color, fg: Color, iconTint: Color) -> some View {
        HStack(spacing: SabqLayout.space4) {
            Image(systemName: icon).foregroundStyle(iconTint).accessibilityHidden(true)
            Text(text)
        }
        .sabqText(SabqType.tag)
        .foregroundStyle(fg)
        .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space4)
        .background(Capsule().fill(bg))
    }
}

/// شريط «مباريات اليوم» أسفل الهيرو.
struct KcHeroTodayStrip: View {
    let matches: [KcFixture]
    let activeId: Int?
    let onOpenMatch: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space4) {
                Image(systemName: "calendar").foregroundStyle(KcTheme.accent).accessibilityHidden(true)
                Text("مباريات اليوم").foregroundStyle(SabqTheme.textPrimary)
                Text("(\(matches.count))").foregroundStyle(SabqTheme.textSecondary)
            }
            .sabqText(SabqType.metaEmphasis)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SabqLayout.space8) {
                    ForEach(matches) { f in chip(f) }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
            }
            .padding(.horizontal, -SabqLayout.pageMargin)
        }
    }

    private func chip(_ f: KcFixture) -> some View {
        let active = f.id == activeId
        let shape = RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
        return Button { onOpenMatch(f.id) } label: {
            VStack(spacing: SabqLayout.space4) {
                HStack(spacing: SabqLayout.space8) {
                    KcTeamLogo(team: f.home, size: 24)
                    Text(f.started ? "\(f.goals.away ?? 0) - \(f.goals.home ?? 0)" : KcFormat.time(f))
                        .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight).frame(minWidth: 44)
                    KcTeamLogo(team: f.away, size: 24)
                }
                Group {
                    if f.status.live {
                        HStack(spacing: SabqLayout.space4) {
                            Circle().fill(KcTheme.liveText).frame(width: 5, height: 5)
                            Text(f.status.label.isEmpty ? "مباشر" : f.status.label)
                        }
                        .foregroundStyle(KcTheme.liveText)
                    } else {
                        Text(f.status.finished ? "انتهت" : "لم تبدأ").foregroundStyle(SabqTheme.textSecondary)
                    }
                }
                .sabqText(SabqType.tag)
            }
            .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space8)
            .background(shape.fill(SabqTheme.surfaceMuted))
            .overlay(shape.stroke(active ? KcTheme.accentFill : Color.clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}

struct KcHeroEmpty: View {
    let icon: String; let title: String; let subtitle: String
    var body: some View {
        EmptyStateView(icon: icon, tint: KcTheme.accent, title: title, subtitle: subtitle)
            .frame(maxWidth: .infinity)
            .padding(.vertical, SabqLayout.space24)
            .sabqBlockSurface()
    }
}

// MARK: - حقائق النسخة السابقة

struct KcHistorySection: View {
    let history: KcHistory?

    var body: some View {
        if let h = history, h.hasContent {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                KcSectionHeader(icon: "clock.arrow.circlepath", title: "من النسخة السابقة",
                                subtitle: h.previousSeason.map { "موسم \($0)" } ?? "أبرز أرقام البطولة")
                HStack(spacing: SabqLayout.space12) {
                    if let champ = h.champion {
                        factCard(icon: "trophy.fill", tint: KcTheme.gold, label: "حامل اللقب",
                                 name: champ.name, logo: champ.logo)
                    }
                    if let scorer = h.topScorer {
                        factCard(icon: "soccerball", tint: KcTheme.accent, label: "هدّاف النسخة",
                                 name: scorer.name, logo: scorer.photo, sub: "\(scorer.goals) أهداف")
                    }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
        }
    }

    private func factCard(icon: String, tint: Color, label: String, name: String, logo: String, sub: String? = nil) -> some View {
        HStack(spacing: SabqLayout.space12) {
            ZStack {
                Circle().fill(SabqTheme.surface).frame(width: 44, height: 44)
                if logo.isEmpty {
                    Image(systemName: icon).foregroundStyle(tint)
                } else {
                    WCRemoteImage(url: logo).frame(width: 32, height: 32).clipShape(Circle())
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(label).sabqText(SabqType.tag).foregroundStyle(KcTheme.accent)
                Text(name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                if let sub { Text(sub).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary) }
            }
            Spacer(minLength: 0)
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sabqBlockSurface()
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
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            KcSectionHeader(icon: "calendar", title: "المباريات", subtitle: "جدول كأس الملك بتوقيت الرياض")
                .padding(.horizontal, SabqLayout.pageMargin)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SabqLayout.space8) {
                    ForEach(Tab.allCases, id: \.self) { t in
                        KcChip(title: t.rawValue, selected: tab == t,
                               badge: t == .live ? live.count : 0) {
                            withAnimation(.easeOut(duration: 0.2)) { userTab = t }
                        }
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
            }

            if isLoading {
                KcLoading()
            } else if current.isEmpty {
                kcEmptyText(emptyText)
            } else {
                LazyVStack(alignment: .leading, spacing: SabqLayout.space24) {
                    ForEach(groupedByDay(current), id: \.key) { day in
                        VStack(alignment: .leading, spacing: 0) {
                            HStack(spacing: SabqLayout.space4) {
                                Text(day.label).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                                Text("(\(day.items.count))").sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                            }
                            .accessibilityAddTraits(.isHeader)
                            .padding(.bottom, SabqLayout.space4)
                            ForEach(Array(day.items.enumerated()), id: \.element.id) { index, f in
                                if index > 0 { KcRowSeparator() }
                                KcMatchCard(fixture: f) { onOpenMatch(f.id) }
                            }
                        }
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
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

/// صف مباراة في القائمة: بلا صندوق، تفصله عن جاره خطوط رفيعة.
struct KcMatchCard: View {
    let fixture: KcFixture
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: SabqLayout.space8) {
                HStack {
                    Text(fixture.round).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                    Spacer()
                    KcStatusPill(fixture: fixture)
                }
                teamRow(fixture.home, goals: fixture.started ? fixture.goals.home ?? 0 : nil, win: fixture.home.winner == true)
                teamRow(fixture.away, goals: fixture.started ? fixture.goals.away ?? 0 : nil, win: fixture.away.winner == true)
                if let po = fixture.penaltyOutcome {
                    HStack {
                        Text("فاز \(po.winnerName) بركلات الترجيح (\(po.winnerScore)-\(po.loserScore))")
                            .sabqText(SabqType.tag).foregroundStyle(KcTheme.accent)
                        Spacer()
                    }
                }
                HStack(spacing: SabqLayout.space4) {
                    Image(systemName: "mappin.and.ellipse").accessibilityHidden(true)
                    Text(venueLine).lineLimit(1)
                    Spacer()
                }
                .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
            }
            .padding(.vertical, SabqLayout.space12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var venueLine: String {
        let parts = [fixture.venue.name, fixture.venue.city].filter { !$0.isEmpty }
        return parts.isEmpty ? fixture.round : parts.joined(separator: " — ")
    }

    private func teamRow(_ team: KcTeam, goals: Int?, win: Bool) -> some View {
        HStack(spacing: SabqLayout.space8) {
            KcTeamLogo(team: team, size: 28)
            Text(team.name)
                .font(SabqFonts.editorial(.headline, size: 16, weight: win ? .semibold : .regular))
                .foregroundStyle(SabqTheme.textPrimary)
            Spacer()
            if let goals {
                Text("\(goals)").sabqText(SabqType.rowTitle).monospacedDigit()
                    .foregroundStyle(win ? KcTheme.accent : SabqTheme.textPrimary)
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
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                KcSectionHeader(icon: "point.3.filled.connected.trianglepath.dotted",
                                title: "الأدوار الإقصائية", subtitle: "طريق اللقب من الأدوار المبكرة حتى النهائي")
                    .padding(.horizontal, SabqLayout.pageMargin)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: SabqLayout.space12) {
                        ForEach(rounds) { round in
                            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                                Text(round.round)
                                    .sabqText(SabqType.metaEmphasis).foregroundStyle(KcTheme.accent)
                                ForEach(round.matches) { m in
                                    bracketMatch(m)
                                }
                            }
                            .frame(width: 216)
                        }
                    }
                    .padding(.horizontal, SabqLayout.pageMargin)
                }
            }
        }
    }

    private func bracketMatch(_ m: KcFixture) -> some View {
        Button { onOpenMatch(m.id) } label: {
            VStack(spacing: SabqLayout.space8) {
                bracketTeam(m.home, goals: m.started ? m.goals.home : nil, win: m.home.winner == true)
                bracketTeam(m.away, goals: m.started ? m.goals.away : nil, win: m.away.winner == true)
                HStack {
                    KcStatusPill(fixture: m)
                    Spacer()
                    if let po = m.penaltyOutcome {
                        Text("ترجيح \(po.winnerScore)-\(po.loserScore)")
                            .sabqText(SabqType.tag).foregroundStyle(KcTheme.accent)
                    }
                }
            }
            .padding(SabqLayout.space12)
            .sabqBlockSurface()
        }
        .buttonStyle(.plain)
    }

    private func bracketTeam(_ team: KcTeam, goals: Int?, win: Bool) -> some View {
        HStack(spacing: SabqLayout.space8) {
            KcTeamLogo(team: team, size: 24)
            Text(team.name)
                .font(SabqFonts.editorial(.subheadline, size: 15, weight: win ? .semibold : .regular))
                .foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
            Spacer(minLength: SabqLayout.space4)
            if let goals {
                Text("\(goals)").sabqText(SabqType.metaEmphasis).monospacedDigit()
                    .foregroundStyle(win ? KcTheme.accent : SabqTheme.textPrimary)
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
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            KcSectionHeader(icon: "chart.bar.fill", title: "السباقات الفردية", subtitle: "هدّافو وصنّاع أهداف البطولة")
                .padding(.horizontal, SabqLayout.pageMargin)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SabqLayout.space8) {
                    ForEach(Tab.allCases, id: \.self) { t in
                        KcChip(title: t.rawValue, selected: tab == t) {
                            withAnimation(.easeOut(duration: 0.2)) { tab = t }
                        }
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
            }

            if isLoading {
                KcLoading()
            } else {
                content.padding(.horizontal, SabqLayout.pageMargin)
            }
        }
    }

    @ViewBuilder private var content: some View {
        switch tab {
        case .scorers:
            if scorers.isEmpty {
                kcEmptyText(started ? "لا توجد أهداف مسجّلة بعد" : "قائمة الهدّافين تظهر بعد انطلاق البطولة")
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(scorers.prefix(15).enumerated()), id: \.element.id) { index, s in
                        if index > 0 { KcRowSeparator() }
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
                VStack(spacing: 0) {
                    ForEach(Array(assists.prefix(15).enumerated()), id: \.element.id) { index, l in
                        if index > 0 { KcRowSeparator() }
                        raceRow(rank: l.rank, name: l.name, photo: l.photo, team: l.team,
                                value: "\(l.assists ?? 0)", valueLabel: "صناعة", sub: nil)
                    }
                }
            }
        case .cards:
            if let c = cards, !(c.yellow.isEmpty && c.red.isEmpty) {
                VStack(alignment: .leading, spacing: SabqLayout.space16) {
                    if !c.red.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("البطاقات الحمراء").sabqText(SabqType.metaEmphasis).foregroundStyle(KcTheme.liveText)
                            ForEach(Array(c.red.prefix(8).enumerated()), id: \.element.id) { index, l in
                                if index > 0 { KcRowSeparator() }
                                raceRow(rank: l.rank, name: l.name, photo: l.photo, team: l.team,
                                        value: "\(l.red ?? 0)", valueLabel: "حمراء", sub: nil, valueColor: KcTheme.liveText)
                            }
                        }
                    }
                    if !c.yellow.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("البطاقات الصفراء").sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.warning)
                            ForEach(Array(c.yellow.prefix(8).enumerated()), id: \.element.id) { index, l in
                                if index > 0 { KcRowSeparator() }
                                raceRow(rank: l.rank, name: l.name, photo: l.photo, team: l.team,
                                        value: "\(l.yellow ?? 0)", valueLabel: "صفراء", sub: nil, valueColor: SabqTheme.warning)
                            }
                        }
                    }
                }
            } else {
                kcEmptyText("لا توجد بطاقات مسجّلة بعد")
            }
        }
    }

    private func raceRow(rank: Int, name: String, photo: String, team: KcTeam, value: String, valueLabel: String, sub: String?, valueColor: Color = KcTheme.accent) -> some View {
        HStack(spacing: SabqLayout.space12) {
            Text("\(rank)").sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                .monospacedDigit().frame(width: 20)
            KcAvatar(url: photo, size: 36)
            VStack(alignment: .leading, spacing: 0) {
                Text(name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                HStack(spacing: SabqLayout.space4) {
                    WCRemoteImage(url: team.logo).frame(width: 16, height: 16)
                    Text(team.name).lineLimit(1)
                    if let sub { Text("· \(sub)") }
                }
                .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
            }
            Spacer()
            VStack(spacing: 0) {
                Text(value).sabqText(SabqType.sectionHeading).foregroundStyle(valueColor)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                Text(valueLabel).sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .padding(.vertical, SabqLayout.space12)
    }
}

// MARK: - الأندية المشاركة

struct KcTeamsSection: View {
    let teams: [KcTeam]
    @State private var selectedTeam: KcTeam?

    var body: some View {
        if !teams.isEmpty {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                KcSectionHeader(icon: "shield.lefthalf.filled", title: "الأندية المشاركة", subtitle: "\(teams.count) ناديًا في البطولة")

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: SabqLayout.space12)], spacing: SabqLayout.space16) {
                    ForEach(teams) { team in
                        Button { selectedTeam = team } label: {
                            VStack(spacing: SabqLayout.space8) {
                                KcTeamLogo(team: team, size: 52)
                                Text(team.name).sabqText(SabqType.meta)
                                    .foregroundStyle(SabqTheme.textPrimary).lineLimit(1).minimumScaleFactor(0.8)
                            }
                            .frame(maxWidth: .infinity, minHeight: SabqLayout.touchTarget)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .sheet(item: $selectedTeam) { team in
                KcTeamSheet(teamId: team.id, teamName: team.name).presentationDetents([.large])
            }
        }
    }
}
