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
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            WCSectionHeader(icon: "trophy.fill", title: "سباقات البطولة",
                            subtitle: "الحذاء الذهبي، صنّاع الأهداف، والبطاقات", tint: SabqTheme.warning)
                .padding(.horizontal, SabqLayout.pageMargin)

            HStack(spacing: SabqLayout.space8) {
                ForEach(Tab.allCases, id: \.self) { t in
                    Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                        Text(t.rawValue)
                            .font(SabqFonts.app(size: 15, weight: .semibold))
                            .foregroundStyle(tab == t ? SabqTheme.onAction : SabqTheme.textPrimary)
                            .padding(.horizontal, SabqLayout.space16)
                            .frame(minHeight: SabqLayout.touchTarget)
                            .background(Capsule().fill(tab == t ? WCTheme.royal : SabqTheme.surfaceMuted))
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
            }
            .padding(.horizontal, SabqLayout.pageMargin)

            Group {
                switch tab {
                case .goals: goalsView
                case .assists: leadersView(assists, empty: tournamentStarted ? Self.pendingStats : "سباق صنّاع الأهداف ينطلق مع أول صافرة") { l in
                    metric("\(l.assists)", sub: "\(l.goals) أهداف")
                }
                case .cards: leadersView(cards, empty: tournamentStarted ? "البطاقات تُعتمد بعد المباريات بقليل — وعسى ألا تكثر" : "لا بطاقات بعد — وعسى ألا تكثر") { l in
                    HStack(spacing: SabqLayout.space8) {
                        cardCount(l.yellow, color: WCTheme.gold)
                        cardCount(l.red, color: SabqTheme.breaking)
                    }
                }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
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
            VStack(spacing: 0) {
                if showPodium {
                    HStack(alignment: .top, spacing: SabqLayout.space12) {
                        podiumButton(podium[1], place: 1)
                        podiumButton(podium[0], place: 0)
                        podiumButton(podium[2], place: 2)
                    }
                    .padding(.bottom, SabqLayout.space16)
                }
                ForEach(rest) { s in
                    WCRowSeparator()
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
            VStack(spacing: 0) {
                ForEach(leaders) { l in
                    WCRowSeparator()
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
            Text(sub).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            Text(value).font(SabqFonts.app(size: 16, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
        }
    }
    private func cardCount(_ n: Int, color: Color) -> some View {
        HStack(spacing: SabqLayout.space4) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 9, height: 12)
            Text("\(n)").font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
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
        VStack(spacing: SabqLayout.space8) {
            Image(systemName: "soccerball").font(SabqFonts.app(size: 28)).foregroundStyle(SabqTheme.warning)
                .accessibilityHidden(true)
            Text(message).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.center)
            Text("تابع هنا الترتيب أولًا بأول طوال البطولة")
                .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space24).padding(.horizontal, SabqLayout.space16)
        .wcQuietBlock()
    }
}

/// منصة تتويج هدّاف.
struct WCPodium: View {
    let scorer: WCScorer
    let place: Int

    // ذهبي/فضي/برونزي من رموز الألوان بدل قيم RGB الخام
    private var ring: Color { [WCTheme.gold, SabqTheme.outline, SabqTheme.warning][place] }
    private var size: CGFloat { place == 0 ? 84 : 64 }

    var body: some View {
        VStack(spacing: SabqLayout.space8) {
            ZStack(alignment: .bottom) {
                photo
                Text("\(place + 1)")
                    .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
                    .padding(.horizontal, SabqLayout.space8).padding(.vertical, 1)
                    .background(Capsule().fill(SabqTheme.surface))
                    .overlay(Capsule().stroke(ring, lineWidth: 1.5))
                    .offset(y: 8)
            }
            Text(scorer.name).font(SabqFonts.app(size: place == 0 ? 15 : 13, weight: .semibold))
                .foregroundStyle(SabqTheme.textPrimary).multilineTextAlignment(.center).lineLimit(1)
            HStack(spacing: 4) {
                WCRemoteImage(url: scorer.team.logo).frame(width: 14, height: 14)
                Text(scorer.team.name).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
            }
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text("\(scorer.goals)")
                    .font(SabqFonts.app(size: place == 0 ? 28 : 22, weight: .semibold))
                    .foregroundStyle(place == 0 ? SabqTheme.warning : SabqTheme.textPrimary)
                Text(scorer.goals == 1 ? "هدف" : "أهداف").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, place == 0 ? 0 : 24)
    }

    private var photo: some View {
        Group {
            if scorer.photo.isEmpty {
                Text(String(scorer.name.prefix(2)))
                    .font(SabqFonts.app(size: 16, weight: .semibold)).foregroundStyle(SabqTheme.textSecondary)
                    .frame(width: size, height: size).background(Circle().fill(SabqTheme.surfaceMuted))
            } else {
                WCRemoteImage(url: scorer.photo, contentMode: .fill)
                    .frame(width: size, height: size).clipShape(Circle())
            }
        }
        .overlay(Circle().stroke(ring, lineWidth: 3))
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
        HStack(spacing: SabqLayout.space12) {
            Text("\(rank)").font(SabqFonts.app(size: 13)).foregroundStyle(SabqTheme.textSecondary).frame(width: 20)
            photoView
            VStack(alignment: .leading, spacing: 0) {
                Text(name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                HStack(spacing: 4) {
                    WCRemoteImage(url: team.logo).frame(width: 12, height: 12)
                    Text(team.name).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                }
            }
            Spacer()
            trailing()
        }
        // صف غير مؤطّر؛ الفواصل الرفيعة يضعها الحاوي
        .padding(.vertical, SabqLayout.space12)
        .contentShape(Rectangle())
    }

    private var photoView: some View {
        Group {
            if photo.isEmpty {
                Circle().fill(SabqTheme.surfaceMuted).frame(width: 36, height: 36)
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

    private let columns = [GridItem(.adaptive(minimum: 92), spacing: SabqLayout.space8)]

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            WCSectionHeader(icon: "person.3.fill", title: "المنتخبات",
                            subtitle: "48 منتخبًا — اضغط على أي منتخب لعرض صفحته الكاملة")
                .padding(.horizontal, SabqLayout.pageMargin)

            if loading {
                WCLoading()
            } else {
                LazyVGrid(columns: columns, spacing: SabqLayout.space8) {
                    ForEach(teams) { team in
                        Button { selected = team } label: { teamTile(team) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
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
        return VStack(spacing: SabqLayout.space8) {
            ZStack(alignment: .topTrailing) {
                WCTeamLogo(team: team, size: 40, ring: SabqTheme.separator)
                if let rank = team.fifaRank {
                    Text("#\(rank)")
                        .font(SabqFonts.app(size: 12, weight: .medium).monospacedDigit())
                        .foregroundStyle(SabqTheme.onAction)
                        .padding(.horizontal, SabqLayout.space4).padding(.vertical, 1)
                        .background(Capsule().fill(WCTheme.royal))
                        .environment(\.layoutDirection, .leftToRight)
                        .offset(x: 8, y: -4)
                }
            }
            Text(team.name).font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).multilineTextAlignment(.center)
            if isSaudi {
                Text("الأخضر").sabqText(SabqType.tag).foregroundStyle(SabqTheme.onAction)
                    .padding(.horizontal, SabqLayout.space8).padding(.vertical, 1)
                    .background(Capsule().fill(WCTheme.royal))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space12).padding(.horizontal, SabqLayout.space8)
        .wcQuietBlock()
        .overlay(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .stroke(isSaudi ? WCTheme.royal : Color.clear, lineWidth: 2)
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
                    WCLoading().padding(.top, SabqLayout.space40)
                } else {
                    VStack(alignment: .leading, spacing: SabqLayout.space24) {
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
                    .padding(SabqLayout.pageMargin)
                }
            }
            .background(SabqTheme.background.ignoresSafeArea())
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
                    WCTeamLogo(team: headerTeam, size: 30, ring: SabqTheme.separator)
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
        // ترويسة بلون الهوية المسطّح (أخضر ثابت داكن): بلا تدرّج ولا توهّج ولا ظل
        return HStack(spacing: SabqLayout.space16) {
            WCTeamLogo(team: headerTeam, size: 72, ring: .clear)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                HStack(spacing: SabqLayout.space8) {
                    Text(headerTeam.name)
                        .sabqText(SabqType.leadTitle).foregroundStyle(.white).lineLimit(1)
                    if isSaudi {
                        Text("الأخضر")
                            .sabqText(SabqType.tag).foregroundStyle(WCTheme.heroTop)
                            .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                            .background(Capsule().fill(.white))
                    }
                }
                if let group = profile?.group {
                    Label(group.group, systemImage: "list.number")
                        .sabqText(SabqType.meta).foregroundStyle(WCTheme.gold)
                        .labelStyle(.titleAndIcon)
                }
                if let coach = profile?.coach, !coach.isEmpty {
                    Label("المدرّب: \(coach)", systemImage: "person.crop.square")
                        .sabqText(SabqType.meta).foregroundStyle(.white.opacity(0.82))
                        .labelStyle(.titleAndIcon)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(WCTheme.heroTop))
    }

    // MARK: متابعة التنبيهات

    /// زر متابعة تنبيهات المنتخب + اختصار لاختيار أنواع الأحداث (هدف/كرت/فار…)
    /// حين يكون متابِعًا. غير المسجّل يُوجَّه لتسجيل الدخول.
    private var followBar: some View {
        HStack(spacing: SabqLayout.space8) {
            Button {
                if authStore.isLoggedIn {
                    Task { await toggleFollow() }
                } else {
                    showLogin = true
                }
            } label: {
                HStack(spacing: SabqLayout.space8) {
                    if followBusy {
                        ProgressView().controlSize(.small)
                            .tint(isFollowing ? .white : WCTheme.emeraldDeep)
                    } else {
                        Image(systemName: isFollowing ? "star.fill" : "star")
                            .font(SabqFonts.app(size: 15, weight: .semibold))
                    }
                    Text(isFollowing ? "تتابع المنتخب" : "تابع المنتخب")
                        .sabqText(SabqType.button)
                }
                // متابِع: تعبئة الهوية ونص أبيض؛ غير متابِع: حدّ outline بنص الهوية
                .foregroundStyle(isFollowing ? SabqTheme.onAction : WCTheme.emeraldDeep)
                .padding(.horizontal, SabqLayout.space16)
                .frame(minHeight: SabqLayout.controlHeight)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(isFollowing ? WCTheme.royal : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .stroke(SabqTheme.outline, lineWidth: isFollowing ? 0 : 1)
                )
            }
            .buttonStyle(.plain)
            .disabled(followBusy)

            if isFollowing {
                Button { showAlertPrefs = true } label: {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "slider.horizontal.3")
                            .font(SabqFonts.app(size: 13))
                        Text("التنبيهات في فارا")
                            .sabqText(SabqType.button)
                    }
                    .foregroundStyle(WCTheme.emeraldDeep)
                    .padding(.horizontal, SabqLayout.space16)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
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
        // جدول غير مؤطّر بفواصل رفيعة
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(group.group).sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                Spacer()
                HStack(spacing: 0) {
                    Text("لعب").frame(width: 28); Text("فارق").frame(width: 36); Text("نقاط").frame(width: 28)
                }
                .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            }
            .padding(.bottom, SabqLayout.space8)
            ForEach(group.rows) { row in
                WCRowSeparator()
                groupRow(row)
            }
        }
    }

    @ViewBuilder private func groupRow(_ row: WCStandingRow) -> some View {
        let isCurrent = row.team.id == teamId
        let qualify: Color = row.qualifyStatus != nil
            ? row.qualifyColor
            : (row.rank <= 2 ? WCTheme.emeraldDeep : (row.rank == 3 ? WCTheme.gold : .clear))
        let isLive = row.live == true
        let delta = row.liveDelta ?? 0
        let content = HStack(spacing: 8) {
            HStack(spacing: 2) {
                Text("\(row.rank)").foregroundStyle(SabqTheme.textSecondary).frame(width: 16)
                if isLive {
                    Image(systemName: delta > 0 ? "arrow.up" : delta < 0 ? "arrow.down" : "minus")
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(delta > 0 ? WCTheme.emeraldDeep : delta < 0 ? SabqTheme.breaking : SabqTheme.textSecondary)
                }
            }
            WCTeamLogo(team: row.team, size: 20, ring: SabqTheme.separator)
            Text(row.team.name)
                .font(SabqFonts.app(size: 13, weight: isCurrent ? .semibold : .regular))
                .foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
            if isLive {
                Text("مباشر")
                    .sabqText(SabqType.tag)
                    .foregroundStyle(SabqTheme.breaking)
            }
            if let label = row.qualifyLabel {
                Text(label)
                    .sabqText(SabqType.tag)
                    .foregroundStyle(row.qualifyStatus == "qualified" ? WCTheme.emeraldDeep : SabqTheme.breaking)
            }
            Spacer()
            Text("\(row.played)").frame(width: 28)
            Text(row.goalsDiff > 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)").frame(width: 36)
                .environment(\.layoutDirection, .leftToRight)
            Text("\(row.points)").font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary).frame(width: 28)
        }
        .font(SabqFonts.app(size: 12).monospacedDigit())
        .foregroundStyle(SabqTheme.textSecondary)
        .padding(.vertical, SabqLayout.space8).padding(.leading, SabqLayout.space8)
        .frame(minHeight: SabqLayout.touchTarget)
        // شريط الحالة الرفيع يحمل اللون؛ المنتخب الحالي على سطح هادئ
        .background(
            HStack { Capsule().fill(qualify).frame(width: 3); Spacer() }
                .padding(.vertical, SabqLayout.space8)
                .background(isCurrent ? SabqTheme.surfaceMuted : Color.clear)
        )
        .contentShape(Rectangle())

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
                (WCPlayerMarketSection.format($0, currency: extra?.marketValueCurrency ?? "€"), "القيمة السوقية", SabqTheme.warning as Color?)
            },
            extra?.foundation.map { ("\($0)", "التأسيس", nil) },
            extra?.squadSize.map { ("\($0)", "حجم القائمة", nil) },
        ].compactMap { $0 }

        if !facts.isEmpty {
            VStack(spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space8) {
                    ForEach(facts, id: \.label) { f in
                        VStack(spacing: 0) {
                            Text(f.value)
                                .font(SabqFonts.app(size: 15, weight: .semibold).monospacedDigit())
                                .foregroundStyle(f.accent ?? SabqTheme.textPrimary)
                                .lineLimit(1).minimumScaleFactor(0.7)
                                .environment(\.layoutDirection, .leftToRight)
                            Text(f.label)
                                .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, SabqLayout.space12).padding(.horizontal, SabqLayout.space8)
                        .wcQuietBlock()
                    }
                }
                if let change = fifa?.change, change != 0 {
                    HStack(spacing: SabqLayout.space4) {
                        Image(systemName: change > 0 ? "arrow.up.right" : "arrow.down.right")
                            .font(SabqFonts.app(size: 12))
                        Text("\(abs(change)) مركزًا عن التحديث السابق")
                            .font(SabqFonts.app(size: 12))
                    }
                    .foregroundStyle(change > 0 ? WCTheme.emeraldDeep : SabqTheme.danger)
                    .frame(maxWidth: .infinity, alignment: .center)
                }
            }
        }
    }

    // MARK: المدرّب

    @ViewBuilder private var coachCard: some View {
        if let c = profile?.coachInfo {
            HStack(spacing: SabqLayout.space12) {
                if c.photo.isEmpty {
                    Image(systemName: "person.crop.square.fill")
                        .font(.system(size: 34)).foregroundStyle(SabqTheme.textSecondary)
                        .frame(width: 52, height: 52)
                } else {
                    WCRemoteImage(url: c.photo, contentMode: .fill)
                        .frame(width: 52, height: 52).clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("المدرّب").sabqText(SabqType.tag).foregroundStyle(WCTheme.emeraldDeep)
                    Text(c.name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                    HStack(spacing: SabqLayout.space8) {
                        if let f = c.formation, !f.isEmpty {
                            chipText(f).environment(\.layoutDirection, .leftToRight)
                        }
                        if let nat = c.nationality, !nat.isEmpty {
                            Text(nat).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                        }
                        if let age = c.age {
                            Text("\(age) سنة").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(SabqLayout.space16)
            .wcQuietBlock()
        }
    }

    private func chipText(_ t: String) -> some View {
        Text(t)
            .font(SabqFonts.app(size: 12, weight: .medium).monospacedDigit()).foregroundStyle(SabqTheme.textPrimary)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
            .background(Capsule().fill(SabqTheme.surface))
    }

    // MARK: الملعب

    @ViewBuilder private var venueCard: some View {
        if let v = profile?.venue {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "sportscourt.fill")
                    .font(.system(size: 22)).foregroundStyle(WCTheme.emeraldDeep)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.small).fill(SabqTheme.surface))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("الملعب").sabqText(SabqType.tag).foregroundStyle(WCTheme.emeraldDeep)
                    Text(v.name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                    HStack(spacing: SabqLayout.space8) {
                        let place = [v.city, v.country].compactMap { ($0 ?? "").isEmpty ? nil : $0 }.joined(separator: "، ")
                        if !place.isEmpty {
                            Text(place).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                        }
                        if let cap = v.capacity {
                            HStack(spacing: 3) {
                                Image(systemName: "person.2.fill").font(SabqFonts.app(size: 12))
                                Text("\(cap.formatted())").environment(\.layoutDirection, .leftToRight)
                            }
                            .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(SabqLayout.space16)
            .wcQuietBlock()
        }
    }

    // MARK: الإصابات والغيابات

    @ViewBuilder private var injuriesSection: some View {
        let injuries = profile?.injuries ?? []
        if !injuries.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "bandage.fill").font(SabqFonts.app(size: 16)).foregroundStyle(SabqTheme.danger)
                        .accessibilityHidden(true)
                    Text("الإصابات والغيابات").sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                }
                .padding(.bottom, SabqLayout.space8)
                ForEach(injuries) { inj in
                    WCRowSeparator()
                    HStack(spacing: SabqLayout.space12) {
                        Circle().fill(SabqTheme.danger).frame(width: 8, height: 8)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(inj.player).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                            let detail = [inj.status, inj.reason].compactMap { ($0 ?? "").isEmpty ? nil : $0 }.joined(separator: " · ")
                            if !detail.isEmpty {
                                Text(detail).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                            }
                        }
                        Spacer()
                        if let until = inj.until, !until.isEmpty {
                            Text("العودة: \(until)")
                                .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                        }
                    }
                    .padding(.vertical, SabqLayout.space12)
                }
            }
        }
    }

    // MARK: إحصاء المنتخب في البطولة

    @ViewBuilder private var seasonStatsSection: some View {
        if let s = profile?.seasonStats, s.available, !s.items.isEmpty {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "chart.bar.fill").font(SabqFonts.app(size: 16)).foregroundStyle(WCTheme.emeraldDeep)
                        .accessibilityHidden(true)
                    Text("أرقام المنتخب في البطولة").sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                    Spacer()
                    if s.matches > 0 {
                        Text("\(s.matches) مباراة")
                            .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                            .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                            .background(Capsule().fill(SabqTheme.surfaceMuted))
                    }
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: SabqLayout.space8)], spacing: SabqLayout.space8) {
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
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            Text("المباريات").sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
            if fixtures.isEmpty {
                Text("لا توجد مباريات معلنة لهذا المنتخب بعد")
                    .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space24)
            } else {
                matchGroup("مباشر الآن", live)
                matchGroup("المباريات القادمة", upcoming)
                matchGroup("النتائج", finished)
            }
        }
    }

    @ViewBuilder private func matchGroup(_ label: String, _ fixtures: [WCFixture]) -> some View {
        if !fixtures.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: SabqLayout.space8) {
                    Text(label).sabqText(SabqType.rowTitle).foregroundStyle(WCTheme.emeraldDeep)
                    Text("(\(fixtures.count))").sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                }
                .padding(.bottom, SabqLayout.space8)
                ForEach(fixtures) { f in
                    WCRowSeparator()
                    WCMatchCard(fixture: f) { route = .match(f.id) }
                }
            }
        }
    }

    // MARK: القائمة

    @ViewBuilder private var squadSection: some View {
        let squad = profile?.squad ?? []
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            Text("القائمة").sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
            if squad.isEmpty {
                Text("القائمة الرسمية لم تُعلن بعد")
                    .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space24)
            } else {
                ForEach(sections, id: \.en) { sec in
                    let players = squad.filter { $0.positionEn == sec.en }
                    if !players.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(sec.label).sabqText(SabqType.rowTitle).foregroundStyle(WCTheme.emeraldDeep)
                                .padding(.bottom, SabqLayout.space8)
                            ForEach(players) { p in
                                WCRowSeparator()
                                playerRow(p)
                            }
                        }
                    }
                }
            }
        }
    }

    private func playerRow(_ p: WCSquadPlayer) -> some View {
        Button { if let sel = WCPlayerSelection(p.id) { route = .player(sel.id) } } label: {
            HStack(spacing: SabqLayout.space12) {
                if p.photo.isEmpty {
                    Circle().fill(SabqTheme.surfaceMuted).frame(width: 36, height: 36)
                } else {
                    WCRemoteImage(url: p.photo, contentMode: .fill).frame(width: 36, height: 36).clipShape(Circle())
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text(p.name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                    HStack(spacing: SabqLayout.space8) {
                        if let age = p.age {
                            Text("\(age) سنة").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                        }
                        if let mv = p.marketValue, mv > 0 {
                            Text(WCPlayerMarketSection.format(mv, currency: p.marketValueCurrency ?? "€"))
                                .font(SabqFonts.app(size: 12, weight: .regular)).foregroundStyle(SabqTheme.warning)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                }
                Spacer()
                Text(p.number.map { "\($0)" } ?? "—")
                    .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textSecondary)
                Image(systemName: "chevron.left")
                    .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textTertiary)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, SabqLayout.space12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
