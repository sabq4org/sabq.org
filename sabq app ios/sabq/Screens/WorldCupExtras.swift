import SwiftUI

// MARK: - سباقات البطولة (الهدافون / صنّاع الأهداف / البطاقات)

struct WCRacesSection: View {
    let scorers: [WCScorer]
    let scorersLoading: Bool
    /// انطلقت البطولة — المزود يعتمد لوحات اللاعبين بفاصل بعد المباريات
    let tournamentStarted: Bool

    enum Tab: String, CaseIterable { case goals = "الهدافون", assists = "صنّاع الأهداف", cards = "البطاقات" }
    @State private var tab: Tab = .goals
    @State private var assists: [WCLeader] = []
    @State private var cards: [WCLeader] = []
    @State private var assistsLoaded = false
    @State private var cardsLoaded = false
    @State private var selectedPlayer: WCPlayerSelection?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            WCSectionHeader(icon: "trophy.fill", title: "سباقات البطولة",
                            subtitle: "الحذاء الذهبي، صنّاع الأهداف، والبطاقات", tint: WCTheme.gold)
                .padding(.horizontal, 16)

            HStack(spacing: 8) {
                ForEach(Tab.allCases, id: \.self) { t in
                    Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                        Text(t.rawValue)
                            .font(SabqFonts.app(size: 12, weight: .medium))
                            .foregroundStyle(tab == t ? .white : WCTheme.onDarkDim)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Capsule().fill(tab == t ? WCTheme.gold : WCTheme.chipFill))
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
            }
            .padding(.horizontal, 16)

            Group {
                switch tab {
                case .goals: goalsView
                case .assists: leadersView(assists, empty: tournamentStarted ? Self.pendingStats : "سباق صنّاع الأهداف ينطلق مع أول صافرة") { l in
                    metric("\(l.assists)", sub: "\(l.goals) أهداف")
                }
                case .cards: leadersView(cards, empty: tournamentStarted ? "البطاقات تُعتمد بعد المباريات بقليل — وعسى ألا تكثر" : "لا بطاقات بعد — وعسى ألا تكثر") { l in
                    HStack(spacing: 8) {
                        cardCount(l.yellow, color: WCTheme.gold)
                        cardCount(l.red, color: WCTheme.liveRed)
                    }
                }
                }
            }
            .padding(.horizontal, 16)
        }
        .task(id: tab) { await loadIfNeeded() }
        .sheet(item: $selectedPlayer) { sel in
            WCPlayerSheet(playerId: sel.id)
                .presentationDetents([.large])
        }
    }

    // «ينطلق مع أول صافرة» تصبح خاطئة لحظة انطلاق البطولة — العبارات تتبع الحالة
    static let pendingStats = "انطلقت البطولة — الترتيب يظهر فور اعتماد المزود لإحصاءات المباريات"

    // الهدافون: منصة تتويج (باكتمال ثلاثة) + قائمة
    @ViewBuilder private var goalsView: some View {
        if scorersLoading {
            WCLoading()
        } else if scorers.isEmpty {
            WCRaceEmpty(message: tournamentStarted ? Self.pendingStats : "سباق الحذاء الذهبي ينطلق مع أول صافرة")
        } else {
            // المنصة تحتاج ثلاثة هدافين مكتملين — أقل من ذلك قائمة صفوف عادية
            let showPodium = scorers.count >= 3
            let podium = showPodium ? Array(scorers.prefix(3)) : []
            let rest = showPodium ? Array(scorers.dropFirst(3)) : scorers
            VStack(spacing: 18) {
                if showPodium {
                    HStack(alignment: .top, spacing: 10) {
                        podiumButton(podium[1], place: 1)
                        podiumButton(podium[0], place: 0)
                        podiumButton(podium[2], place: 2)
                    }
                }
                ForEach(rest) { s in
                    Button { selectedPlayer = WCPlayerSelection(s.playerId) } label: {
                        WCLeaderRow(rank: s.rank, name: s.name, photo: s.photo, team: s.team, minutes: s.minutes) {
                            metric("\(s.goals)", sub: "\(s.assists) صناعة")
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func podiumButton(_ scorer: WCScorer, place: Int) -> some View {
        Button { selectedPlayer = WCPlayerSelection(scorer.playerId) } label: {
            WCPodium(scorer: scorer, place: place)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func leadersView<Trailing: View>(_ leaders: [WCLeader], empty: String, @ViewBuilder trailing: @escaping (WCLeader) -> Trailing) -> some View {
        if leaders.isEmpty {
            WCRaceEmpty(message: empty)
        } else {
            VStack(spacing: 8) {
                ForEach(leaders) { l in
                    Button { selectedPlayer = WCPlayerSelection(l.playerId) } label: {
                        WCLeaderRow(rank: l.rank, name: l.name, photo: l.photo, team: l.team, minutes: l.minutes) {
                            trailing(l)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func metric(_ value: String, sub: String) -> some View {
        HStack(spacing: 8) {
            Text(sub).font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
            Text(value).font(SabqFonts.app(size: 17, weight: .semibold)).foregroundStyle(WCTheme.onDark)
        }
    }
    private func cardCount(_ n: Int, color: Color) -> some View {
        HStack(spacing: 3) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 9, height: 12)
            Text("\(n)").font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.onDark)
        }
    }

    private func loadIfNeeded() async {
        if tab == .assists && !assistsLoaded {
            assistsLoaded = true
            if let r = try? await APIClient.shared.fetchWorldCupAssists() { await MainActor.run { assists = r } }
        } else if tab == .cards && !cardsLoaded {
            cardsLoaded = true
            if let r = try? await APIClient.shared.fetchWorldCupCards() { await MainActor.run { cards = r } }
        }
    }
}

struct WCRaceEmpty: View {
    let message: String
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "soccerball").font(SabqFonts.app(size: 28)).foregroundStyle(WCTheme.gold)
            Text(message).font(SabqFonts.subhead(size: 14)).foregroundStyle(WCTheme.onDark)
            Text("تابع هنا الترتيب أولًا بأول طوال البطولة")
                .font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 26)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }
}

/// منصة تتويج هدّاف.
struct WCPodium: View {
    let scorer: WCScorer
    let place: Int

    private var ring: Color { [WCTheme.gold, Color(white: 0.75), Color(red: 0.7, green: 0.4, blue: 0.15)][place] }
    private var size: CGFloat { place == 0 ? 84 : 64 }

    var body: some View {
        VStack(spacing: 6) {
            ZStack(alignment: .bottom) {
                photo
                Text("\(place + 1)")
                    .font(SabqFonts.app(size: 10, weight: .medium)).foregroundStyle(.white)
                    .padding(.horizontal, 7).padding(.vertical, 1)
                    .background(Capsule().fill(ring))
                    .offset(y: 6)
            }
            Text(scorer.name).font(SabqFonts.app(size: place == 0 ? 15 : 13, weight: .semibold))
                .foregroundStyle(WCTheme.onDark).multilineTextAlignment(.center).lineLimit(1)
            HStack(spacing: 4) {
                WCRemoteImage(url: scorer.team.logo).frame(width: 14, height: 14)
                Text(scorer.team.name).font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
            }
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text("\(scorer.goals)")
                    .font(SabqFonts.app(size: place == 0 ? 28 : 22, weight: .semibold))
                    .foregroundStyle(place == 0 ? WCTheme.gold : WCTheme.onDark)
                Text(scorer.goals == 1 ? "هدف" : "أهداف").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, place == 0 ? 0 : 24)
    }

    private var photo: some View {
        Group {
            if scorer.photo.isEmpty {
                Text(String(scorer.name.prefix(2)))
                    .font(SabqFonts.app(size: 17, weight: .semibold)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(width: size, height: size).background(Circle().fill(WCTheme.chipFill))
            } else {
                WCRemoteImage(url: scorer.photo, contentMode: .fill)
                    .frame(width: size, height: size).clipShape(Circle())
            }
        }
        .overlay(Circle().stroke(ring, lineWidth: 4))
    }
}

/// صف متصدّر مشترك (هدافون/صنّاع/بطاقات).
struct WCLeaderRow<Trailing: View>: View {
    let rank: Int
    let name: String
    let photo: String
    let team: WCTeam
    let minutes: Int
    @ViewBuilder let trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 12) {
            Text("\(rank)").font(SabqFonts.app(size: 13)).foregroundStyle(WCTheme.onDarkDim).frame(width: 20)
            photoView
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                HStack(spacing: 4) {
                    WCRemoteImage(url: team.logo).frame(width: 12, height: 12)
                    Text(team.name).font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                }
            }
            Spacer()
            trailing()
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }

    private var photoView: some View {
        Group {
            if photo.isEmpty {
                Circle().fill(WCTheme.chipFill).frame(width: 36, height: 36)
            } else {
                WCRemoteImage(url: photo, contentMode: .fill).frame(width: 36, height: 36).clipShape(Circle())
            }
        }
    }
}

// MARK: - المنتخبات + قائمة المنتخب

struct WCTeamsSection: View {
    @State private var teams: [WCTeam] = []
    @State private var loading = true
    @State private var selected: WCTeam?

    private let columns = [GridItem(.adaptive(minimum: 92), spacing: 10)]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            WCSectionHeader(icon: "person.3.fill", title: "المنتخبات",
                            subtitle: "48 منتخبًا — اضغط على أي منتخب لعرض صفحته الكاملة")
                .padding(.horizontal, 16)

            if loading {
                WCLoading()
            } else {
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(teams) { team in
                        Button { selected = team } label: { teamTile(team) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
        .task {
            if let r = try? await APIClient.shared.fetchWorldCupTeams() {
                await MainActor.run { teams = r; loading = false }
            } else { await MainActor.run { loading = false } }
        }
        .sheet(item: $selected) { team in
            WCTeamSheet(team: team)
                .presentationDetents([.large])
        }
    }

    private func teamTile(_ team: WCTeam) -> some View {
        let isSaudi = team.id == WCTheme.saudiId
        return VStack(spacing: 6) {
            ZStack(alignment: .topTrailing) {
                WCTeamLogo(team: team, size: 38, ring: WCTheme.cardStroke)
                if let rank = team.fifaRank {
                    Text("#\(rank)")
                        .font(SabqFonts.app(size: 8, weight: .medium).monospacedDigit())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 4).padding(.vertical, 1)
                        .background(Capsule().fill(WCTheme.emeraldDeep))
                        .environment(\.layoutDirection, .leftToRight)
                        .offset(x: 8, y: -4)
                }
            }
            Text(team.name).font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(WCTheme.onDark)
                .lineLimit(1).multilineTextAlignment(.center)
            if isSaudi {
                Text("الأخضر").font(SabqFonts.app(size: 9, weight: .medium)).foregroundStyle(.white)
                    .padding(.horizontal, 6).padding(.vertical, 1)
                    .background(Capsule().fill(WCTheme.emeraldDeep))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12).padding(.horizontal, 6)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(WCTheme.card))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(isSaudi ? WCTheme.emeraldDeep : WCTheme.cardStroke.opacity(0.5), lineWidth: isSaudi ? 2 : 0.5)
        )
    }
}

/// وجهة فتح من داخل صفحة المنتخب — مركز مباراة أو بطاقة لاعب.
/// سهم واحد (.sheet) بدل اثنين على نفس العرض تفاديًا لتعارض الأوراق المتعددة.
private enum WCTeamRoute: Identifiable {
    case match(Int)
    case player(Int)
    var id: String {
        switch self {
        case .match(let id): return "m\(id)"
        case .player(let id): return "p\(id)"
        }
    }
}

/// صفحة المنتخب المتكاملة — تُعرض كـsheet: ترويسة (الشعار + المجموعة +
/// المدرّب) ثم ترتيب مجموعته ثم مبارياته (مباشر/قادم/نتائج) ثم قائمته
/// مجمعة بالمراكز. تستهلك /world-cup/team/:id (تكافؤ مع WorldCupTeam على
/// الويب). الضغط على منتخب آخر في الترتيب يفتح صفحته مكانه، وعلى مباراة
/// يفتح مركزها، وعلى لاعب يفتح بطاقته الشاملة.
struct WCTeamSheet: View {
    let team: WCTeam
    @Environment(\.dismiss) private var dismiss

    @State private var teamId: Int
    /// هوية الترويسة الفورية أثناء التحميل/التبديل قبل وصول الملف الكامل
    @State private var headerTeam: WCTeam
    @State private var profile: WCTeamProfile?
    @State private var loading = true
    @State private var route: WCTeamRoute?

    @Environment(AuthStore.self) private var authStore
    @State private var isFollowing = false
    @State private var followBusy = false
    @State private var showLogin = false
    @State private var showAlertPrefs = false

    init(team: WCTeam) {
        self.team = team
        _teamId = State(initialValue: team.id)
        _headerTeam = State(initialValue: team)
    }

    private let sections: [(en: String, label: String)] = [
        ("Goalkeeper", "حراسة المرمى"), ("Defender", "الدفاع"),
        ("Midfielder", "الوسط"), ("Attacker", "الهجوم")
    ]

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                if loading && profile == nil {
                    WCLoading().padding(.top, 40)
                } else {
                    VStack(alignment: .leading, spacing: 22) {
                        headerCard
                        followBar
                        quickFacts
                        if let group = profile?.group, !group.rows.isEmpty {
                            groupTable(group)
                        }
                        coachCard
                        venueCard
                        injuriesSection
                        seasonStatsSection
                        matchesSection
                        squadSection
                    }
                    .padding(16)
                }
            }
            .background(WCTheme.sectionBackground.ignoresSafeArea())
            .navigationTitle(headerTeam.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(WCTheme.stadiumTop, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    WCTeamLogo(team: headerTeam, size: 30, ring: WCTheme.cardStroke)
                }
            }
            .task(id: teamId) { await load() }
            .refreshable { await load(force: true) }
            .sheet(item: $route) { r in
                switch r {
                case .match(let id): WorldCupMatchCenter(fixtureId: id)
                case .player(let id): WCPlayerSheet(playerId: id).presentationDetents([.large])
                }
            }
            .sheet(isPresented: $showLogin) { LoginSheet() }
            .sheet(isPresented: $showAlertPrefs) {
                NavigationStack { WCMatchEventNotificationsView() }
            }
            .task(id: teamId) { await refreshFollowState() }
        }
        .sabqRTL()
    }

    private func load(force: Bool = false) async {
        if let p = try? await APIClient.shared.fetchWorldCupTeamProfile(teamId: teamId, ignoreCache: force) {
            await MainActor.run { profile = p; headerTeam = p.team; loading = false }
        } else {
            await MainActor.run { loading = false }
        }
    }

    /// تبديل لمنتخب آخر بالضغط على صفّه في الترتيب — يعيد تشغيل task(id:)
    private func switchTeam(to t: WCTeam) {
        guard t.id != teamId else { return }
        headerTeam = t
        profile = nil
        loading = true
        teamId = t.id
    }

    // MARK: الترويسة

    private var headerCard: some View {
        let isSaudi = profile?.isSaudi ?? (headerTeam.id == WCTheme.saudiId)
        return HStack(spacing: 14) {
            WCTeamLogo(team: headerTeam, size: 72, ring: .white.opacity(0.18))
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Text(headerTeam.name)
                        .font(SabqFonts.headline(size: 24)).foregroundStyle(.white).lineLimit(1)
                    if isSaudi {
                        Text("الأخضر")
                            .font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(.white)
                            .padding(.horizontal, 8).padding(.vertical, 2)
                            .background(Capsule().fill(WCTheme.emeraldDeep))
                    }
                }
                if let group = profile?.group {
                    Label(group.group, systemImage: "list.number")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.emerald.opacity(0.85))
                        .labelStyle(.titleAndIcon)
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
            LinearGradient(colors: [WCTheme.heroTop, WCTheme.heroBottom],
                           startPoint: .topTrailing, endPoint: .bottomLeading)
                .overlay(alignment: .topLeading) {
                    Circle()
                        .fill(WCTheme.gold.opacity(0.16))
                        .frame(width: 150, height: 150)
                        .blur(radius: 55)
                        .offset(x: -30, y: -50)
                }
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: WCTheme.heroTop.opacity(0.25), radius: 12, x: 0, y: 6)
    }

    // MARK: متابعة التنبيهات

    /// زر متابعة تنبيهات المنتخب + اختصار لاختيار أنواع الأحداث (هدف/كرت/فار…)
    /// حين يكون متابِعًا. غير المسجّل يُوجَّه لتسجيل الدخول.
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
                            .tint(isFollowing ? .white : WCTheme.emeraldDeep)
                    } else {
                        Image(systemName: isFollowing ? "bell.fill" : "bell")
                            .font(SabqFonts.app(size: 14, weight: .semibold))
                    }
                    Text(isFollowing ? "تتابع التنبيهات" : "تابع التنبيهات")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                }
                .foregroundStyle(isFollowing ? .white : WCTheme.emeraldDeep)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(
                    Capsule().fill(isFollowing ? WCTheme.emeraldDeep : WCTheme.emerald.opacity(0.14))
                )
            }
            .buttonStyle(.plain)
            .disabled(followBusy)

            if isFollowing {
                Button { showAlertPrefs = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "slider.horizontal.3")
                            .font(SabqFonts.app(size: 12, weight: .medium))
                        Text("نوع التنبيهات")
                            .font(SabqFonts.app(size: 11, weight: .medium))
                    }
                    .foregroundStyle(WCTheme.emeraldDeep)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(Capsule().stroke(WCTheme.emeraldDeep.opacity(0.35), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }

    /// مزامنة حالة المتابعة من الخادم (للمسجّلين فقط). يُستدعى عند فتح/تبديل المنتخب.
    private func refreshFollowState() async {
        guard authStore.isLoggedIn else {
            await MainActor.run { isFollowing = false }
            return
        }
        if let follows = try? await APIClient.shared.fetchSportsFollows() {
            let following = follows.contains { $0.kind == "team" && $0.refId == String(teamId) }
            await MainActor.run { isFollowing = following }
        }
    }

    /// تفعيل/إلغاء متابعة المنتخب (يُفترض أنّ المستخدم مسجّل — الزرّ يتحقّق قبلها).
    private func toggleFollow() async {
        await MainActor.run { followBusy = true }
        do {
            if isFollowing {
                try await APIClient.shared.removeSportsFollow(kind: "team", refId: String(teamId))
                await MainActor.run { isFollowing = false; followBusy = false; SabqHaptics.medium() }
            } else {
                try await APIClient.shared.addSportsFollow(
                    kind: "team",
                    refId: String(teamId),
                    refName: headerTeam.name,
                    refLogo: headerTeam.logo
                )
                await MainActor.run { isFollowing = true; followBusy = false; SabqHaptics.medium() }
            }
        } catch {
            await MainActor.run { followBusy = false }
        }
    }

    // MARK: ترتيب المجموعة

    private func groupTable(_ group: WCGroup) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(group.group).font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(WCTheme.emeraldDeep)
                Spacer()
                HStack(spacing: 0) {
                    Text("لعب").frame(width: 28); Text("فارق").frame(width: 36); Text("نقاط").frame(width: 28)
                }
                .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
            }
            ForEach(group.rows) { row in groupRow(row) }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }

    @ViewBuilder private func groupRow(_ row: WCStandingRow) -> some View {
        let isCurrent = row.team.id == teamId
        let qualify: Color = row.qualifyStatus != nil
            ? row.qualifyColor
            : (row.rank <= 2 ? WCTheme.emeraldDeep : (row.rank == 3 ? WCTheme.gold : .clear))
        let content = HStack(spacing: 8) {
            Text("\(row.rank)").foregroundStyle(WCTheme.onDarkDim).frame(width: 16)
            WCTeamLogo(team: row.team, size: 20, ring: WCTheme.cardStroke)
            Text(row.team.name)
                .font(SabqFonts.app(size: 13, weight: isCurrent ? .black : .semibold))
                .foregroundStyle(WCTheme.onDark).lineLimit(1)
            if row.live == true {
                Circle().fill(WCTheme.liveRed).frame(width: 6, height: 6)
            }
            if let label = row.qualifyLabel {
                Text(label)
                    .font(SabqFonts.app(size: 9, weight: .medium)).foregroundStyle(.white)
                    .padding(.horizontal, 5).padding(.vertical, 1)
                    .background(Capsule().fill(row.qualifyColor))
            }
            Spacer()
            Text("\(row.played)").frame(width: 28)
            Text(row.goalsDiff > 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)").frame(width: 36)
                .environment(\.layoutDirection, .leftToRight)
            Text("\(row.points)").font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.onDark).frame(width: 28)
        }
        .font(SabqFonts.app(size: 12).monospacedDigit())
        .foregroundStyle(WCTheme.onDarkDim)
        .padding(.vertical, 5).padding(.horizontal, 6)
        .background(
            HStack { Rectangle().fill(qualify).frame(width: 3); Spacer() }
                .background(isCurrent ? WCTheme.emeraldDeep.opacity(0.16) : (qualify == .clear ? Color.clear : qualify.opacity(0.07)))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        )

        if isCurrent {
            content
        } else {
            Button { switchTeam(to: row.team) } label: { content }.buttonStyle(.plain)
        }
    }

    // MARK: حقائق سريعة (فيفا / قيمة / تأسيس / حجم القائمة)

    @ViewBuilder private var quickFacts: some View {
        let fifa = profile?.fifaRank
        let extra = profile?.extra
        let facts: [(value: String, label: String, accent: Color?)] = [
            fifa.map { ("#\($0.rank)", "تصنيف فيفا", WCTheme.emeraldDeep as Color?) },
            extra?.marketValue.map {
                (WCPlayerMarketSection.format($0, currency: extra?.marketValueCurrency ?? "€"), "القيمة السوقية", WCTheme.gold as Color?)
            },
            extra?.foundation.map { ("\($0)", "التأسيس", nil) },
            extra?.squadSize.map { ("\($0)", "حجم القائمة", nil) },
        ].compactMap { $0 }

        if !facts.isEmpty {
            VStack(spacing: 6) {
                HStack(spacing: 8) {
                    ForEach(facts, id: \.label) { f in
                        VStack(spacing: 2) {
                            Text(f.value)
                                .font(SabqFonts.app(size: 15, weight: .semibold).monospacedDigit())
                                .foregroundStyle(f.accent ?? WCTheme.onDark)
                                .lineLimit(1).minimumScaleFactor(0.7)
                                .environment(\.layoutDirection, .leftToRight)
                            Text(f.label)
                                .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9).padding(.horizontal, 6)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(WCTheme.card))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
                    }
                }
                if let change = fifa?.change, change != 0 {
                    HStack(spacing: 4) {
                        Image(systemName: change > 0 ? "arrow.up.right" : "arrow.down.right")
                            .font(.system(size: 9, weight: .medium))
                        Text("\(abs(change)) مركزًا عن التحديث السابق")
                            .font(SabqFonts.app(size: 10))
                    }
                    .foregroundStyle(change > 0 ? WCTheme.emerald : WCTheme.liveRed)
                    .frame(maxWidth: .infinity, alignment: .center)
                }
            }
        }
    }

    // MARK: المدرّب

    @ViewBuilder private var coachCard: some View {
        if let c = profile?.coachInfo {
            HStack(spacing: 12) {
                if c.photo.isEmpty {
                    Image(systemName: "person.crop.square.fill")
                        .font(.system(size: 34)).foregroundStyle(WCTheme.onDarkDim)
                        .frame(width: 52, height: 52)
                } else {
                    WCRemoteImage(url: c.photo, contentMode: .fill)
                        .frame(width: 52, height: 52).clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text("المدرّب").font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(WCTheme.emerald)
                    Text(c.name).font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                    HStack(spacing: 8) {
                        if let f = c.formation, !f.isEmpty {
                            chipText(f).environment(\.layoutDirection, .leftToRight)
                        }
                        if let nat = c.nationality, !nat.isEmpty {
                            Text(nat).font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                        }
                        if let age = c.age {
                            Text("\(age) سنة").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(WCTheme.card))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
        }
    }

    private func chipText(_ t: String) -> some View {
        Text(t)
            .font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit()).foregroundStyle(WCTheme.onDark)
            .padding(.horizontal, 8).padding(.vertical, 2)
            .background(Capsule().fill(WCTheme.chipFill))
    }

    // MARK: الملعب

    @ViewBuilder private var venueCard: some View {
        if let v = profile?.venue {
            HStack(spacing: 12) {
                Image(systemName: "sportscourt.fill")
                    .font(.system(size: 22)).foregroundStyle(WCTheme.emerald)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 12).fill(WCTheme.chipFill))
                VStack(alignment: .leading, spacing: 3) {
                    Text("الملعب").font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(WCTheme.emerald)
                    Text(v.name).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                    HStack(spacing: 8) {
                        let place = [v.city, v.country].compactMap { ($0 ?? "").isEmpty ? nil : $0 }.joined(separator: "، ")
                        if !place.isEmpty {
                            Text(place).font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                        }
                        if let cap = v.capacity {
                            HStack(spacing: 3) {
                                Image(systemName: "person.2.fill").font(.system(size: 9))
                                Text("\(cap.formatted())").environment(\.layoutDirection, .leftToRight)
                            }
                            .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(WCTheme.card))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
        }
    }

    // MARK: الإصابات والغيابات

    @ViewBuilder private var injuriesSection: some View {
        let injuries = profile?.injuries ?? []
        if !injuries.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "bandage.fill").font(.system(size: 13)).foregroundStyle(WCTheme.liveRed)
                    Text("الإصابات والغيابات").font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(WCTheme.liveRed)
                }
                ForEach(injuries) { inj in
                    HStack(spacing: 10) {
                        Circle().fill(WCTheme.liveRed.opacity(0.8)).frame(width: 7, height: 7)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(inj.player).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                            let detail = [inj.status, inj.reason].compactMap { ($0 ?? "").isEmpty ? nil : $0 }.joined(separator: " · ")
                            if !detail.isEmpty {
                                Text(detail).font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                            }
                        }
                        Spacer()
                        if let until = inj.until, !until.isEmpty {
                            Text("العودة: \(until)")
                                .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                        }
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
                }
            }
        }
    }

    // MARK: إحصاء المنتخب في البطولة

    @ViewBuilder private var seasonStatsSection: some View {
        if let s = profile?.seasonStats, s.available, !s.items.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "chart.bar.fill").font(.system(size: 13)).foregroundStyle(WCTheme.emerald)
                    Text("أرقام المنتخب في البطولة").font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(WCTheme.emerald)
                    Spacer()
                    if s.matches > 0 {
                        Text("\(s.matches) مباراة")
                            .font(SabqFonts.app(size: 10, weight: .medium)).foregroundStyle(WCTheme.onDarkDim)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Capsule().fill(WCTheme.chipFill))
                    }
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
                    ForEach(s.items) { item in
                        WCFactTile(value: item.display, label: item.label)
                    }
                }
            }
        }
    }

    // MARK: المباريات

    @ViewBuilder private var matchesSection: some View {
        let fixtures = profile?.fixtures ?? []
        let live = fixtures.filter { $0.status.live }
        let upcoming = fixtures.filter { !$0.status.live && !$0.status.finished }
        let finished = Array(fixtures.filter { $0.status.finished }.reversed())
        VStack(alignment: .leading, spacing: 12) {
            Text("المباريات").font(SabqFonts.app(size: 17, weight: .semibold)).foregroundStyle(WCTheme.onDark)
            if fixtures.isEmpty {
                Text("لا توجد مباريات معلنة لهذا المنتخب بعد")
                    .font(SabqFonts.app(size: 13)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 20)
            } else {
                matchGroup("مباشر الآن", live)
                matchGroup("المباريات القادمة", upcoming)
                matchGroup("النتائج", finished)
            }
        }
    }

    @ViewBuilder private func matchGroup(_ label: String, _ fixtures: [WCFixture]) -> some View {
        if !fixtures.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Circle().fill(WCTheme.emeraldDeep).frame(width: 7, height: 7)
                    Text(label).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                    Text("(\(fixtures.count))").font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
                }
                ForEach(fixtures) { f in
                    WCMatchCard(fixture: f) { route = .match(f.id) }
                }
            }
        }
    }

    // MARK: القائمة

    @ViewBuilder private var squadSection: some View {
        let squad = profile?.squad ?? []
        VStack(alignment: .leading, spacing: 12) {
            Text("القائمة").font(SabqFonts.app(size: 17, weight: .semibold)).foregroundStyle(WCTheme.onDark)
            if squad.isEmpty {
                Text("القائمة الرسمية لم تُعلن بعد")
                    .font(SabqFonts.app(size: 13)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 20)
            } else {
                ForEach(sections, id: \.en) { sec in
                    let players = squad.filter { $0.positionEn == sec.en }
                    if !players.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(sec.label).font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(WCTheme.emeraldDeep)
                            ForEach(players) { p in playerRow(p) }
                        }
                    }
                }
            }
        }
    }

    private func playerRow(_ p: WCSquadPlayer) -> some View {
        Button { if let sel = WCPlayerSelection(p.id) { route = .player(sel.id) } } label: {
            HStack(spacing: 10) {
                if p.photo.isEmpty {
                    Circle().fill(WCTheme.chipFill).frame(width: 36, height: 36)
                } else {
                    WCRemoteImage(url: p.photo, contentMode: .fill).frame(width: 36, height: 36).clipShape(Circle())
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(p.name).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                    HStack(spacing: 6) {
                        if let age = p.age {
                            Text("\(age) سنة").font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                        }
                        if let mv = p.marketValue, mv > 0 {
                            Text(WCPlayerMarketSection.format(mv, currency: p.marketValueCurrency ?? "€"))
                                .font(SabqFonts.app(size: 10, weight: .regular)).foregroundStyle(WCTheme.gold)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                }
                Spacer()
                Text(p.number.map { "\($0)" } ?? "—")
                    .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(WCTheme.onDarkDim)
                Image(systemName: "chevron.left")
                    .font(SabqFonts.app(size: 10, weight: .medium)).foregroundStyle(WCTheme.onDarkDim.opacity(0.6))
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
        }
        .buttonStyle(.plain)
    }
}
