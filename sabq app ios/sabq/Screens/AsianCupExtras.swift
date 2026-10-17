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
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            AcSectionHeader(icon: "chart.bar.fill", title: "السباقات الفردية", subtitle: "أهداف · صناعات · بطاقات")

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SabqLayout.space8) {
                    ForEach(Tab.allCases, id: \.self) { t in
                        Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                            Text(t.rawValue).acChip(selected: tab == t)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(tab == t ? .isSelected : [])
                    }
                }
            }

            if isLoading {
                AcLoading()
            } else {
                content
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
                VStack(spacing: 0) {
                    ForEach(Array(scorers.prefix(15))) { s in
                        if s.id != scorers.first?.id { AcRowDivider() }
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
                VStack(spacing: 0) {
                    ForEach(Array(assists.prefix(15))) { l in
                        if l.id != assists.first?.id { AcRowDivider() }
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
                VStack(spacing: 0) {
                    ForEach(Array(cards.prefix(15))) { l in
                        if l.id != cards.first?.id { AcRowDivider() }
                        Button {
                            if let sel = AcPlayerSelection(l.playerId) { openPlayer = sel }
                        } label: {
                            raceRow(
                                rank: l.rank, name: l.name, photo: l.photo, team: l.team,
                                value: l.red > 0 ? "\(l.red)" : "\(l.yellow)",
                                valueLabel: l.red > 0 ? "حمراء" : "صفراء",
                                sub: l.red > 0 && l.yellow > 0 ? "\(l.yellow) صفراء" : nil,
                                valueColor: l.red > 0 ? SabqTheme.danger : SabqTheme.warning
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
        valueColor: Color = AcStyle.accent
    ) -> some View {
        HStack(spacing: SabqLayout.space12) {
            Text("\(rank)")
                .font(SabqType.meta.font.monospacedDigit())
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(width: 20)
            AcPlayerAvatar(photo: photo, size: 40, initials: String(name.prefix(1)))
            VStack(alignment: .leading, spacing: 2) {
                Text(name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                HStack(spacing: SabqLayout.space4) {
                    AcRemoteImage(url: team.logo).frame(width: 16, height: 16)
                    Text(team.name).font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                    if let sub { Text("· \(sub)").font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary) }
                }
            }
            Spacer()
            VStack(spacing: 0) {
                Text(value)
                    .font(SabqType.sectionHeading.font.monospacedDigit())
                    .foregroundStyle(valueColor)
                    .environment(\.layoutDirection, .leftToRight)
                Text(valueLabel).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .padding(.vertical, SabqLayout.space12)
        .contentShape(Rectangle())
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
                    VStack(alignment: .leading, spacing: SabqLayout.space24) {
                        headerCard
                        followBar
                        quickFacts
                        if let group = profile?.group, !group.rows.isEmpty {
                            SabqSectionBand()
                            groupTable(group)
                        }
                        coachCard
                        seasonStatsSection
                        SabqSectionBand()
                        matchesSection
                        SabqSectionBand()
                        squadSection
                    }
                    .padding(.horizontal, SabqLayout.pageMargin)
                    .padding(.top, SabqLayout.space16)
                    .padding(.bottom, SabqLayout.space40)
                }
            }
            .background(SabqTheme.background.ignoresSafeArea())
            .navigationTitle(headerTeam.name.isEmpty ? teamName : headerTeam.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(SabqTheme.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .foregroundStyle(SabqTheme.textPrimary)
                            .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    }
                    .accessibilityLabel("إغلاق")
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
        return HStack(spacing: SabqLayout.space16) {
            AcTeamLogo(team: headerTeam, size: 72, ring: .clear)
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space8) {
                    Text(headerTeam.name)
                        .sabqText(SabqType.leadTitle).foregroundStyle(.white).lineLimit(1)
                    if isSaudi {
                        Text("الأخضر")
                            .font(SabqType.tag.font).foregroundStyle(.white)
                            .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                            .background(Capsule().fill(.white.opacity(0.18)))
                    }
                }
                if let group = profile?.group {
                    Label(group.name, systemImage: "list.number")
                        .font(SabqType.meta.font).foregroundStyle(.white.opacity(0.9))
                        .labelStyle(.titleAndIcon)
                } else if let g = profile?.stats?.groupName {
                    Label(g, systemImage: "list.number")
                        .font(SabqType.meta.font).foregroundStyle(.white.opacity(0.9))
                }
                if let coach = profile?.coach, !coach.isEmpty {
                    Label("المدرّب: \(coach)", systemImage: "person.crop.square")
                        .font(SabqType.meta.font).foregroundStyle(.white.opacity(0.9))
                        .labelStyle(.titleAndIcon)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AcStyle.accentFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

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
                            .tint(isFollowing ? SabqTheme.onAction : AcStyle.accent)
                    } else {
                        Image(systemName: isFollowing ? "bell.fill" : "bell")
                    }
                    Text(isFollowing ? "تتابع التنبيهات" : "تابع التنبيهات")
                        .font(SabqType.button.font)
                }
                .foregroundStyle(isFollowing ? SabqTheme.onAction : AcStyle.accent)
                .padding(.horizontal, SabqLayout.space16)
                .frame(minHeight: SabqLayout.controlHeight)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(isFollowing ? AcStyle.accentFill : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .stroke(isFollowing ? Color.clear : SabqTheme.outline, lineWidth: 1)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(followBusy)

            if isFollowing {
                Button { showAlertPrefs = true } label: {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "slider.horizontal.3")
                        Text("نوع التنبيهات")
                            .font(SabqType.button.font)
                    }
                    .foregroundStyle(AcStyle.accent)
                    .padding(.horizontal, SabqLayout.space16)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .stroke(SabqTheme.outline, lineWidth: 1)
                    )
                    .contentShape(Rectangle())
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
            fifa.map { ("#\($0.rank)", "تصنيف فيفا", AcStyle.accent as Color?) },
            stats.map { ("\($0.played)", "لعب", nil) },
            stats.map { ("\($0.points)", "نقاط", AcStyle.accent as Color?) },
            stats.map { ($0.goalsDiff > 0 ? "+\($0.goalsDiff)" : "\($0.goalsDiff)", "فارق", nil) },
        ].compactMap { $0 }

        if !facts.isEmpty {
            VStack(spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space8) {
                    ForEach(facts, id: \.label) { f in
                        VStack(spacing: SabqLayout.space4) {
                            Text(f.value)
                                .font(SabqType.rowTitle.font.monospacedDigit())
                                .foregroundStyle(f.accent ?? SabqTheme.textPrimary)
                                .lineLimit(1).minimumScaleFactor(0.75)
                                .environment(\.layoutDirection, .leftToRight)
                            Text(f.label)
                                .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, SabqLayout.space12).padding(.horizontal, SabqLayout.space8)
                        .acQuietBlock()
                    }
                }
                if let change = fifa?.change, change != 0 {
                    HStack(spacing: SabqLayout.space4) {
                        Image(systemName: change > 0 ? "arrow.up.right" : "arrow.down.right")
                            .font(SabqFonts.app(size: 12))
                        Text("\(abs(change)) مركزًا عن التحديث السابق")
                            .font(SabqFonts.app(size: 12))
                    }
                    .foregroundStyle(change > 0 ? SabqTheme.success : SabqTheme.danger)
                    .frame(maxWidth: .infinity, alignment: .center)
                }
            }
        }
    }

    private func groupTable(_ group: AcGroup) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(group.name).sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                HStack(spacing: 0) {
                    Text("لعب").frame(width: 32); Text("فارق").frame(width: 40); Text("نقاط").frame(width: 32)
                }
                .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            }
            .padding(.bottom, SabqLayout.space8)
            ForEach(Array(group.rows.enumerated()), id: \.element.id) { index, row in
                if index > 0 { AcRowDivider() }
                groupRow(row)
            }
        }
    }

    @ViewBuilder private func groupRow(_ row: AcStandingRow) -> some View {
        let isCurrent = row.team.id == activeTeamId
        let isLive = row.live == true
        let delta = row.liveDelta ?? 0
        let content = HStack(spacing: SabqLayout.space8) {
            HStack(spacing: 2) {
                Text("\(row.rank)").foregroundStyle(SabqTheme.textSecondary).frame(width: 20)
                if isLive {
                    Image(systemName: delta > 0 ? "arrow.up" : delta < 0 ? "arrow.down" : "minus")
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(delta > 0 ? SabqTheme.success : delta < 0 ? SabqTheme.danger : SabqTheme.textTertiary)
                }
            }
            AcTeamLogo(team: row.team, size: 24)
            Text(row.team.name)
                .font(isCurrent ? SabqType.rowTitle.font : SabqType.excerpt.font)
                .foregroundStyle(isCurrent ? AcStyle.accent : SabqTheme.textPrimary).lineLimit(1)
            if isLive {
                Text("مباشر")
                    .font(SabqType.tag.font).foregroundStyle(SabqTheme.danger)
                    .padding(.horizontal, SabqLayout.space4).padding(.vertical, 2)
                    .background(Capsule().fill(SabqTheme.surfaceMuted))
            }
            Spacer()
            Text("\(row.played)").frame(width: 32)
            Text(row.goalsDiff > 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)").frame(width: 40)
                .environment(\.layoutDirection, .leftToRight)
            Text("\(row.points)").font(SabqType.rowTitle.font.monospacedDigit()).foregroundStyle(SabqTheme.textPrimary).frame(width: 32)
        }
        .font(SabqType.meta.font.monospacedDigit())
        .foregroundStyle(SabqTheme.textSecondary)
        .padding(.vertical, SabqLayout.space8)
        .frame(minHeight: SabqLayout.touchTarget)
        .contentShape(Rectangle())

        if isCurrent {
            content
        } else {
            Button { switchTeam(to: row.team) } label: { content }.buttonStyle(.plain)
        }
    }

    @ViewBuilder private var coachCard: some View {
        if let coach = profile?.coach, !coach.isEmpty {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "person.crop.square.fill")
                    .font(SabqType.sectionHeading.font).foregroundStyle(SabqTheme.textTertiary)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surface))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("المدرّب").font(SabqType.tag.font).foregroundStyle(AcStyle.accent)
                    Text(coach).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                }
                Spacer(minLength: 0)
            }
            .padding(SabqLayout.space12)
            .acQuietBlock()
        }
    }

    @ViewBuilder private var seasonStatsSection: some View {
        if let s = profile?.seasonStats, s.available, !s.items.isEmpty {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                HStack(spacing: SabqLayout.space8) {
                    AcSectionHeader(icon: "chart.bar.fill", title: "أرقام المنتخب في البطولة", subtitle: "")
                    if s.matches > 0 {
                        AcTag(text: "\(s.matches) مباراة")
                    }
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: SabqLayout.space8)], spacing: SabqLayout.space8) {
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
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            Text("المباريات").sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            if fixtures.isEmpty {
                acEmptyText("لا توجد مباريات معلنة لهذا المنتخب بعد")
            } else {
                matchGroup("مباشر الآن", live)
                matchGroup("المباريات القادمة", upcoming)
                matchGroup("النتائج", finished)
            }
        }
    }

    @ViewBuilder private func matchGroup(_ label: String, _ fixtures: [AcFixture]) -> some View {
        if !fixtures.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: SabqLayout.space8) {
                    Text(label).font(SabqType.metaEmphasis.font).foregroundStyle(AcStyle.accent)
                    Text("(\(fixtures.count))").font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                }
                .padding(.bottom, SabqLayout.space4)
                ForEach(Array(fixtures.enumerated()), id: \.element.id) { index, fx in
                    if index > 0 { AcRowDivider() }
                    Button { route = .match(fx.id) } label: {
                        HStack(spacing: SabqLayout.space8) {
                            Text(fx.home.name).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                            if fx.started {
                                Text("\(fx.goals.away ?? 0) - \(fx.goals.home ?? 0)")
                                    .font(SabqType.rowTitle.font.monospacedDigit())
                                    .environment(\.layoutDirection, .leftToRight)
                            } else {
                                Text(AcFormat.time(fx))
                                    .font(SabqType.metaEmphasis.font)
                                    .foregroundStyle(AcStyle.accent)
                            }
                            Text(fx.away.name).lineLimit(1).frame(maxWidth: .infinity, alignment: .trailing)
                        }
                        .font(SabqType.excerpt.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .padding(.vertical, SabqLayout.space12)
                        .frame(minHeight: SabqLayout.touchTarget)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder private var squadSection: some View {
        let squad = profile?.squad ?? []
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            Text("القائمة").sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            if squad.isEmpty {
                acEmptyText("القائمة الرسمية لم تُعلن بعد")
            } else {
                ForEach(sections, id: \.en) { sec in
                    let players = squad.filter { $0.positionEn == sec.en }
                    if !players.isEmpty {
                        squadGroup(sec.label, players)
                    }
                }
                // أي مركز غير قياسي
                let known = Set(sections.map(\.en))
                let other = squad.filter { !known.contains($0.positionEn) }
                if !other.isEmpty {
                    squadGroup("آخرون", other)
                }
            }
        }
    }

    private func squadGroup(_ label: String, _ players: [AcSquadPlayer]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label).font(SabqType.metaEmphasis.font).foregroundStyle(AcStyle.accent)
                .padding(.bottom, SabqLayout.space4)
            ForEach(Array(players.enumerated()), id: \.element.id) { index, p in
                if index > 0 { AcRowDivider() }
                playerRow(p)
            }
        }
    }

    private func playerRow(_ p: AcSquadPlayer) -> some View {
        Button { if let sel = AcPlayerSelection(p.id) { route = .player(sel.id) } } label: {
            HStack(spacing: SabqLayout.space12) {
                AcPlayerAvatar(photo: p.photo, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                    if let age = p.age {
                        Text("\(age) سنة").font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                    }
                }
                Spacer()
                Text(p.number.map { "\($0)" } ?? "—")
                    .font(SabqType.rowTitle.font.monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                Image(systemName: "chevron.left")
                    .font(SabqType.tag.font).foregroundStyle(SabqTheme.textTertiary)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, SabqLayout.space12)
            .contentShape(Rectangle())
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
