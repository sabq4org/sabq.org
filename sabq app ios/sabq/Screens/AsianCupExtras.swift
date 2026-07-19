import SwiftUI

// MARK: - سباقات كأس آسيا + صفحة المنتخب (متابعة + تنبيهات)

struct AcRacesSection: View {
    let scorers: [AcScorer]
    let assists: [AcLeader]
    let cards: [AcLeader]
    let isLoading: Bool
    let started: Bool

    enum Tab: String, CaseIterable { case scorers = "الهدّافون", assists = "الصنّاع", cards = "البطاقات" }
    @State private var tab: Tab = .scorers
    @State private var openPlayer: AcPlayerSelection?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AcSectionHeader(icon: "chart.bar.fill", title: "السباقات الفردية", subtitle: "أهداف · صناعات · بطاقات")
                .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Tab.allCases, id: \.self) { t in
                        Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                            Text(t.rawValue)
                                .font(SabqFonts.app(size: 14, weight: .semibold))
                                .foregroundStyle(tab == t ? .white : AcTheme.onDarkDim)
                                .padding(.horizontal, 14).padding(.vertical, 8)
                                .background(Capsule().fill(tab == t ? AcTheme.emeraldDeep : AcTheme.chipFill))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }

            if isLoading {
                AcLoading()
            } else {
                content.padding(.horizontal, 16)
            }
        }
        .sheet(item: $openPlayer) { sel in
            AcPlayerSheet(playerId: sel.id).presentationDetents([.large])
        }
    }

    @ViewBuilder private var content: some View {
        switch tab {
        case .scorers:
            if scorers.isEmpty {
                acEmptyText(started ? "لا توجد أهداف مسجّلة بعد" : "قائمة الهدّافين تظهر بعد انطلاق البطولة")
            } else {
                VStack(spacing: 8) {
                    ForEach(Array(scorers.prefix(15))) { s in
                        Button {
                            if let sel = AcPlayerSelection(s.playerId) { openPlayer = sel }
                        } label: {
                            raceRow(rank: s.rank, name: s.name, photo: s.photo, team: s.team,
                                    value: "\(s.goals)", valueLabel: "هدف",
                                    sub: s.assists > 0 ? "\(s.assists) صناعة" : nil)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        case .assists:
            if assists.isEmpty {
                acEmptyText(started ? "لا توجد صناعات مسجّلة بعد" : "قائمة الصنّاع تظهر بعد انطلاق البطولة")
            } else {
                VStack(spacing: 8) {
                    ForEach(Array(assists.prefix(15))) { l in
                        Button {
                            if let sel = AcPlayerSelection(l.playerId) { openPlayer = sel }
                        } label: {
                            raceRow(rank: l.rank, name: l.name, photo: l.photo, team: l.team,
                                    value: "\(l.assists)", valueLabel: "صناعة", sub: nil)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        case .cards:
            if cards.isEmpty {
                acEmptyText(started ? "لا توجد بطاقات مسجّلة بعد" : "قائمة البطاقات تظهر بعد انطلاق البطولة")
            } else {
                VStack(spacing: 8) {
                    ForEach(Array(cards.prefix(15))) { l in
                        Button {
                            if let sel = AcPlayerSelection(l.playerId) { openPlayer = sel }
                        } label: {
                            raceRow(
                                rank: l.rank, name: l.name, photo: l.photo, team: l.team,
                                value: l.red > 0 ? "\(l.red)" : "\(l.yellow)",
                                valueLabel: l.red > 0 ? "حمراء" : "صفراء",
                                sub: l.red > 0 && l.yellow > 0 ? "\(l.yellow) صفراء" : nil,
                                valueColor: l.red > 0 ? AcTheme.liveRed : AcTheme.gold
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func raceRow(
        rank: Int, name: String, photo: String, team: AcTeam,
        value: String, valueLabel: String, sub: String?,
        valueColor: Color = AcTheme.emeraldDeep
    ) -> some View {
        HStack(spacing: 10) {
            Text("\(rank)")
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(AcTheme.onDarkDim)
                .frame(width: 20)
            if photo.isEmpty {
                Circle().fill(AcTheme.chipFill).frame(width: 34, height: 34)
                    .overlay(Text(String(name.prefix(1))).font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(AcTheme.onDarkDim))
            } else {
                AcRemoteImage(url: photo, contentMode: .fill)
                    .frame(width: 34, height: 34).clipShape(Circle())
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(name).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.onDark).lineLimit(1)
                HStack(spacing: 5) {
                    AcRemoteImage(url: team.logo).frame(width: 14, height: 14)
                    Text(team.name).font(SabqFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim).lineLimit(1)
                    if let sub { Text("· \(sub)").font(SabqFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim) }
                }
            }
            Spacer()
            VStack(spacing: 0) {
                Text(value)
                    .font(SabqFonts.app(size: 17, weight: .semibold))
                    .foregroundStyle(valueColor)
                    .environment(\.layoutDirection, .leftToRight)
                Text(valueLabel).font(SabqFonts.app(size: 9)).foregroundStyle(AcTheme.onDarkDim)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .acElevatedCard(cornerRadius: 14)
    }
}

// MARK: - صفحة المنتخب (تكافؤ WCTeamSheet: ترتيب الأقسام + sheet موحّد)

private enum AcTeamRoute: Identifiable {
    case match(Int)
    case player(Int)
    var id: String {
        switch self {
        case .match(let id): return "m\(id)"
        case .player(let id): return "p\(id)"
        }
    }
}

struct AcTeamSheet: View {
    let teamId: Int
    let teamName: String
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    @State private var activeTeamId: Int
    @State private var headerTeam: AcTeam
    @State private var profile: AcTeamProfile?
    @State private var loading = true
    @State private var route: AcTeamRoute?
    @State private var isFollowing = false
    @State private var followBusy = false
    @State private var showLogin = false
    @State private var showAlertPrefs = false

    private let sections: [(en: String, label: String)] = [
        ("Goalkeeper", "حراسة المرمى"), ("Defender", "الدفاع"),
        ("Midfielder", "الوسط"), ("Attacker", "الهجوم")
    ]

    init(teamId: Int, teamName: String) {
        self.teamId = teamId
        self.teamName = teamName
        _activeTeamId = State(initialValue: teamId)
        _headerTeam = State(initialValue: AcTeam(id: teamId, name: teamName, nameEn: nil, logo: "", fifaRank: nil))
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                if loading && profile == nil {
                    AcLoading().padding(.top, 40)
                } else {
                    VStack(alignment: .leading, spacing: 22) {
                        headerCard
                        followBar
                        quickFacts
                        if let group = profile?.group, !group.rows.isEmpty {
                            groupTable(group)
                        }
                        coachCard
                        seasonStatsSection
                        matchesSection
                        squadSection
                    }
                    .padding(16)
                }
            }
            .background(AcTheme.sectionBackground.ignoresSafeArea())
            .navigationTitle(headerTeam.name.isEmpty ? teamName : headerTeam.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(AcTheme.stadiumTop, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    AcTeamLogo(team: headerTeam, size: 30)
                }
            }
            .task(id: activeTeamId) { await load() }
            .refreshable { await load(force: true) }
            .sheet(item: $route) { r in
                switch r {
                case .match(let id): AsianCupMatchCenter(fixtureId: id)
                case .player(let id): AcPlayerSheet(playerId: id).presentationDetents([.large])
                }
            }
            .sheet(isPresented: $showLogin) { LoginSheet() }
            .sheet(isPresented: $showAlertPrefs) {
                NavigationStack { WCMatchEventNotificationsView() }
            }
            .task(id: activeTeamId) { await refreshFollow() }
        }
        .sabqRTL()
    }

    private func load(force: Bool = false) async {
        if let p = try? await APIClient.shared.fetchAsianCupTeamProfile(teamId: activeTeamId, ignoreCache: force) {
            await MainActor.run { profile = p; headerTeam = p.team; loading = false }
        } else {
            await MainActor.run { loading = false }
        }
    }

    private func switchTeam(to t: AcTeam) {
        guard t.id != activeTeamId else { return }
        headerTeam = t
        profile = nil
        loading = true
        activeTeamId = t.id
    }

    // MARK: ترويسة WC-style

    private var headerCard: some View {
        let isSaudi = profile?.isSaudi ?? (headerTeam.id == AcTheme.saudiId)
        return HStack(spacing: 14) {
            AcTeamLogo(team: headerTeam, size: 72)
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Text(headerTeam.name)
                        .font(SabqFonts.headline(size: 24)).foregroundStyle(.white).lineLimit(1)
                    if isSaudi {
                        Text("الأخضر")
                            .font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(.white)
                            .padding(.horizontal, 8).padding(.vertical, 2)
                            .background(Capsule().fill(AcTheme.emeraldDeep))
                    }
                }
                if let group = profile?.group {
                    Label(group.name, systemImage: "list.number")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(AcTheme.emerald.opacity(0.85))
                        .labelStyle(.titleAndIcon)
                } else if let g = profile?.stats?.groupName {
                    Label(g, systemImage: "list.number")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(AcTheme.emerald.opacity(0.85))
                }
                if let coach = profile?.coach, !coach.isEmpty {
                    Label("المدرّب: \(coach)", systemImage: "person.crop.square")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(.white.opacity(0.75))
                        .labelStyle(.titleAndIcon)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [AcTheme.heroTop, AcTheme.heroBottom],
                           startPoint: .topTrailing, endPoint: .bottomLeading)
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: AcTheme.heroTop.opacity(0.25), radius: 12, x: 0, y: 6)
    }

    private var followBar: some View {
        HStack(spacing: 10) {
            Button {
                if authStore.isLoggedIn {
                    Task { await toggleFollow() }
                } else {
                    showLogin = true
                }
            } label: {
                HStack(spacing: 7) {
                    if followBusy {
                        ProgressView().controlSize(.small)
                            .tint(isFollowing ? .white : AcTheme.emeraldDeep)
                    } else {
                        Image(systemName: isFollowing ? "bell.fill" : "bell")
                    }
                    Text(isFollowing ? "تتابع التنبيهات" : "تابع التنبيهات")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                }
                .foregroundStyle(isFollowing ? .white : AcTheme.emeraldDeep)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(Capsule().fill(isFollowing ? AcTheme.emeraldDeep : AcTheme.emerald.opacity(0.14)))
            }
            .buttonStyle(.plain)
            .disabled(followBusy)

            if isFollowing {
                Button { showAlertPrefs = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "slider.horizontal.3")
                        Text("نوع التنبيهات")
                            .font(SabqFonts.app(size: 11, weight: .medium))
                    }
                    .foregroundStyle(AcTheme.emeraldDeep)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(Capsule().stroke(AcTheme.emeraldDeep.opacity(0.35), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder private var quickFacts: some View {
        let fifa = profile?.fifaRank
        let stats = profile?.stats
        let facts: [(value: String, label: String, accent: Color?)] = [
            fifa.map { ("#\($0.rank)", "تصنيف فيفا", AcTheme.emeraldDeep as Color?) },
            stats.map { ("\($0.played)", "لعب", nil) },
            stats.map { ("\($0.points)", "نقاط", AcTheme.gold as Color?) },
            stats.map { ($0.goalsDiff > 0 ? "+\($0.goalsDiff)" : "\($0.goalsDiff)", "فارق", nil) },
        ].compactMap { $0 }

        if !facts.isEmpty {
            VStack(spacing: 6) {
                HStack(spacing: 8) {
                    ForEach(facts, id: \.label) { f in
                        VStack(spacing: 2) {
                            Text(f.value)
                                .font(SabqFonts.app(size: 15, weight: .semibold).monospacedDigit())
                                .foregroundStyle(f.accent ?? AcTheme.onDark)
                                .lineLimit(1).minimumScaleFactor(0.7)
                                .environment(\.layoutDirection, .leftToRight)
                            Text(f.label)
                                .font(SabqFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9).padding(.horizontal, 6)
                        .acElevatedCard(cornerRadius: 12)
                    }
                }
                if let change = fifa?.change, change != 0 {
                    HStack(spacing: 4) {
                        Image(systemName: change > 0 ? "arrow.up.right" : "arrow.down.right")
                            .font(.system(size: 9, weight: .medium))
                        Text("\(abs(change)) مركزًا عن التحديث السابق")
                            .font(SabqFonts.app(size: 10))
                    }
                    .foregroundStyle(change > 0 ? AcTheme.emerald : AcTheme.liveRed)
                    .frame(maxWidth: .infinity, alignment: .center)
                }
            }
        }
    }

    private func groupTable(_ group: AcGroup) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(group.name).font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(AcTheme.emeraldDeep)
                Spacer()
                HStack(spacing: 0) {
                    Text("لعب").frame(width: 28); Text("فارق").frame(width: 36); Text("نقاط").frame(width: 28)
                }
                .font(SabqFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim)
            }
            ForEach(group.rows) { row in groupRow(row) }
        }
        .padding(14)
        .acElevatedCard(cornerRadius: 20)
    }

    @ViewBuilder private func groupRow(_ row: AcStandingRow) -> some View {
        let isCurrent = row.team.id == activeTeamId
        let isLive = row.live == true
        let delta = row.liveDelta ?? 0
        let content = HStack(spacing: 8) {
            HStack(spacing: 2) {
                Text("\(row.rank)").foregroundStyle(AcTheme.onDarkDim).frame(width: 16)
                if isLive {
                    Image(systemName: delta > 0 ? "arrow.up" : delta < 0 ? "arrow.down" : "minus")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(delta > 0 ? AcTheme.emeraldDeep : delta < 0 ? AcTheme.liveRed : AcTheme.onDarkDim)
                }
            }
            AcTeamLogo(team: row.team, size: 20)
            Text(row.team.name)
                .font(SabqFonts.app(size: 13, weight: isCurrent ? .black : .semibold))
                .foregroundStyle(AcTheme.onDark).lineLimit(1)
            if isLive {
                Text("مباشر")
                    .font(SabqFonts.app(size: 8, weight: .bold)).foregroundStyle(.white)
                    .padding(.horizontal, 5).padding(.vertical, 1)
                    .background(Capsule().fill(AcTheme.liveRed))
            }
            Spacer()
            Text("\(row.played)").frame(width: 28)
            Text(row.goalsDiff > 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)").frame(width: 36)
                .environment(\.layoutDirection, .leftToRight)
            Text("\(row.points)").font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.onDark).frame(width: 28)
        }
        .font(SabqFonts.app(size: 12).monospacedDigit())
        .foregroundStyle(AcTheme.onDarkDim)
        .padding(.vertical, 5).padding(.horizontal, 6)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(isCurrent ? AcTheme.emeraldDeep.opacity(0.16) : Color.clear)
        )

        if isCurrent {
            content
        } else {
            Button { switchTeam(to: row.team) } label: { content }.buttonStyle(.plain)
        }
    }

    @ViewBuilder private var coachCard: some View {
        if let coach = profile?.coach, !coach.isEmpty {
            HStack(spacing: 12) {
                Image(systemName: "person.crop.square.fill")
                    .font(.system(size: 34)).foregroundStyle(AcTheme.onDarkDim)
                    .frame(width: 52, height: 52)
                VStack(alignment: .leading, spacing: 3) {
                    Text("المدرّب").font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(AcTheme.emerald)
                    Text(coach).font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(AcTheme.onDark)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .acElevatedCard(cornerRadius: 18)
        }
    }

    @ViewBuilder private var seasonStatsSection: some View {
        if let s = profile?.seasonStats, s.available, !s.items.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "chart.bar.fill").font(.system(size: 13)).foregroundStyle(AcTheme.emerald)
                    Text("أرقام المنتخب في البطولة")
                        .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(AcTheme.emerald)
                    Spacer()
                    if s.matches > 0 {
                        Text("\(s.matches) مباراة")
                            .font(SabqFonts.app(size: 10, weight: .medium)).foregroundStyle(AcTheme.onDarkDim)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Capsule().fill(AcTheme.chipFill))
                    }
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
                    ForEach(s.items) { item in
                        AcFactTile(value: item.display, label: item.label)
                    }
                }
            }
        }
    }

    @ViewBuilder private var matchesSection: some View {
        let fixtures = profile?.fixtures ?? []
        let live = fixtures.filter { $0.status.live }
        let upcoming = fixtures.filter { !$0.status.live && !$0.status.finished }
        let finished = Array(fixtures.filter { $0.status.finished }.reversed())
        VStack(alignment: .leading, spacing: 12) {
            Text("المباريات").font(SabqFonts.app(size: 17, weight: .semibold)).foregroundStyle(AcTheme.onDark)
            if fixtures.isEmpty {
                Text("لا توجد مباريات معلنة لهذا المنتخب بعد")
                    .font(SabqFonts.app(size: 13)).foregroundStyle(AcTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 20)
            } else {
                matchGroup("مباشر الآن", live)
                matchGroup("المباريات القادمة", upcoming)
                matchGroup("النتائج", finished)
            }
        }
    }

    @ViewBuilder private func matchGroup(_ label: String, _ fixtures: [AcFixture]) -> some View {
        if !fixtures.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Circle().fill(AcTheme.emeraldDeep).frame(width: 7, height: 7)
                    Text(label).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.onDark)
                    Text("(\(fixtures.count))").font(SabqFonts.app(size: 12)).foregroundStyle(AcTheme.onDarkDim)
                }
                ForEach(fixtures) { fx in
                    Button { route = .match(fx.id) } label: {
                        HStack {
                            Text(fx.home.name).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                            if fx.started {
                                Text("\(fx.goals.away ?? 0) - \(fx.goals.home ?? 0)")
                                    .font(SabqFonts.app(size: 14, weight: .bold).monospacedDigit())
                                    .environment(\.layoutDirection, .leftToRight)
                            } else {
                                Text(AcFormat.time(fx))
                                    .font(SabqFonts.app(size: 12, weight: .semibold))
                                    .foregroundStyle(AcTheme.emeraldDeep)
                            }
                            Text(fx.away.name).lineLimit(1).frame(maxWidth: .infinity, alignment: .trailing)
                        }
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(AcTheme.onDark)
                        .padding(10)
                        .acElevatedCard(cornerRadius: 12)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder private var squadSection: some View {
        let squad = profile?.squad ?? []
        VStack(alignment: .leading, spacing: 12) {
            Text("القائمة").font(SabqFonts.app(size: 17, weight: .semibold)).foregroundStyle(AcTheme.onDark)
            if squad.isEmpty {
                Text("القائمة الرسمية لم تُعلن بعد")
                    .font(SabqFonts.app(size: 13)).foregroundStyle(AcTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 20)
            } else {
                ForEach(sections, id: \.en) { sec in
                    let players = squad.filter { $0.positionEn == sec.en }
                    if !players.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(sec.label).font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(AcTheme.emeraldDeep)
                            ForEach(players) { p in playerRow(p) }
                        }
                    }
                }
                // أي مركز غير قياسي
                let known = Set(sections.map(\.en))
                let other = squad.filter { !known.contains($0.positionEn) }
                if !other.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("آخرون").font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(AcTheme.emeraldDeep)
                        ForEach(other) { p in playerRow(p) }
                    }
                }
            }
        }
    }

    private func playerRow(_ p: AcSquadPlayer) -> some View {
        Button { if let sel = AcPlayerSelection(p.id) { route = .player(sel.id) } } label: {
            HStack(spacing: 10) {
                if p.photo.isEmpty {
                    Circle().fill(AcTheme.chipFill).frame(width: 36, height: 36)
                } else {
                    AcRemoteImage(url: p.photo, contentMode: .fill).frame(width: 36, height: 36).clipShape(Circle())
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(p.name).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.onDark).lineLimit(1)
                    if let age = p.age {
                        Text("\(age) سنة").font(SabqFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim)
                    }
                }
                Spacer()
                Text(p.number.map { "\($0)" } ?? "—")
                    .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(AcTheme.onDarkDim)
                Image(systemName: "chevron.left")
                    .font(SabqFonts.app(size: 10, weight: .medium)).foregroundStyle(AcTheme.onDarkDim.opacity(0.6))
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .acElevatedCard(cornerRadius: 14)
        }
        .buttonStyle(.plain)
    }

    private func refreshFollow() async {
        guard authStore.isLoggedIn else {
            await MainActor.run { isFollowing = false }
            return
        }
        if let follows = try? await APIClient.shared.fetchSportsFollows() {
            let following = follows.contains { $0.kind == "team" && $0.refId == String(activeTeamId) }
            await MainActor.run { isFollowing = following }
        }
    }

    private func toggleFollow() async {
        await MainActor.run { followBusy = true }
        do {
            if isFollowing {
                try await APIClient.shared.removeSportsFollow(kind: "team", refId: String(activeTeamId))
                await MainActor.run { isFollowing = false }
            } else {
                let name = profile?.team.name ?? headerTeam.name
                let logo = profile?.team.logo ?? headerTeam.logo
                try await APIClient.shared.addSportsFollow(
                    kind: "team", refId: String(activeTeamId), refName: name, refLogo: logo
                )
                await MainActor.run { isFollowing = true }
            }
        } catch { }
        await MainActor.run { followBusy = false }
    }
}
