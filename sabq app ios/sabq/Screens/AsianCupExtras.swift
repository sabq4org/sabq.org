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

// MARK: - صفحة المنتخب

struct AcTeamSheet: View {
    let teamId: Int
    let teamName: String
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    @State private var profile: AcTeamProfile?
    @State private var loading = true
    @State private var openPlayer: AcPlayerSelection?
    @State private var openMatch: Int?
    @State private var isFollowing = false
    @State private var followBusy = false
    @State private var showLogin = false
    @State private var showAlertPrefs = false

    private struct MatchSel: Identifiable { let id: Int }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    if loading {
                        AcLoading().padding(.top, 30)
                    } else if let p = profile {
                        header(p)
                        followBar
                        statsRow(p)
                        if !p.fixtures.isEmpty {
                            fixturesBlock(p.fixtures)
                        }
                        if !p.squad.isEmpty {
                            squadBlock(p.squad)
                        }
                    } else {
                        acEmptyText("تعذر جلب صفحة المنتخب").padding(.top, 50)
                    }
                }
                .padding(16)
            }
            .background(AcTheme.sectionBackground.ignoresSafeArea())
            .navigationTitle(teamName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(AcTheme.stadiumTop, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white) }
                }
            }
            .task {
                let r = try? await APIClient.shared.fetchAsianCupTeamProfile(teamId: teamId)
                await MainActor.run { profile = r; loading = false }
                await refreshFollow()
            }
            .sheet(item: $openPlayer) { sel in
                AcPlayerSheet(playerId: sel.id).presentationDetents([.large])
            }
            .sheet(item: Binding(
                get: { openMatch.map { MatchSel(id: $0) } },
                set: { openMatch = $0?.id }
            )) { sel in
                AsianCupMatchCenter(fixtureId: sel.id)
            }
            .sheet(isPresented: $showLogin) { LoginSheet() }
            .sheet(isPresented: $showAlertPrefs) {
                NavigationStack { WCMatchEventNotificationsView() }
            }
        }
        .sabqRTL()
    }

    private func header(_ p: AcTeamProfile) -> some View {
        HStack(spacing: 14) {
            AcTeamLogo(team: p.team, size: 64)
            VStack(alignment: .leading, spacing: 4) {
                Text(p.team.name)
                    .font(SabqFonts.app(size: 20, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                if let coach = p.coach, !coach.isEmpty {
                    Text("المدرّب: \(coach)")
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(AcTheme.onDarkDim)
                }
                if let g = p.stats.groupName {
                    Text(g)
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(AcTheme.emeraldDeep)
                }
            }
            Spacer()
        }
        .padding(14)
        .acElevatedCard()
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

    private func statsRow(_ p: AcTeamProfile) -> some View {
        let s = p.stats
        return HStack(spacing: 8) {
            AcFactTile(value: "\(s.played)", label: "لعب")
            AcFactTile(value: "\(s.win)", label: "فوز")
            AcFactTile(value: "\(s.draw)", label: "تعادل")
            AcFactTile(value: "\(s.lose)", label: "خسارة")
            AcFactTile(value: "\(s.points)", label: "نقاط")
        }
    }

    private func fixturesBlock(_ fixtures: [AcFixture]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("المباريات")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(AcTheme.onDark)
            ForEach(fixtures) { fx in
                Button { openMatch = fx.id } label: {
                    HStack {
                        Text(fx.home.name).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                        if fx.started {
                            Text("\(fx.goals.home ?? 0)–\(fx.goals.away ?? 0)")
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

    private func squadBlock(_ squad: [AcSquadPlayer]) -> some View {
        let grouped = Dictionary(grouping: squad, by: \.position)
        let order = ["حارس", "مدافع", "وسط", "مهاجم", "GK", "DF", "MF", "FW"]
        let keys = grouped.keys.sorted { a, b in
            (order.firstIndex(of: a) ?? 99) < (order.firstIndex(of: b) ?? 99)
        }
        return VStack(alignment: .leading, spacing: 10) {
            Text("القائمة")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(AcTheme.onDark)
            ForEach(keys, id: \.self) { pos in
                Text(pos)
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(AcTheme.onDarkDim)
                ForEach(grouped[pos] ?? []) { p in
                    Button {
                        if let sel = AcPlayerSelection(p.id) { openPlayer = sel }
                    } label: {
                        HStack(spacing: 8) {
                            if let n = p.number {
                                Text("\(n)")
                                    .font(SabqFonts.app(size: 11, weight: .bold).monospacedDigit())
                                    .frame(width: 22)
                                    .foregroundStyle(AcTheme.emeraldDeep)
                            }
                            AcRemoteImage(url: p.photo, contentMode: .fill)
                                .frame(width: 28, height: 28).clipShape(Circle())
                            Text(p.name)
                                .font(SabqFonts.app(size: 13, weight: .medium))
                                .foregroundStyle(AcTheme.onDark)
                            Spacer()
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func refreshFollow() async {
        guard authStore.isLoggedIn else {
            await MainActor.run { isFollowing = false }
            return
        }
        if let follows = try? await APIClient.shared.fetchSportsFollows() {
            let following = follows.contains { $0.kind == "team" && $0.refId == String(teamId) }
            await MainActor.run { isFollowing = following }
        }
    }

    private func toggleFollow() async {
        await MainActor.run { followBusy = true }
        do {
            if isFollowing {
                try await APIClient.shared.removeSportsFollow(kind: "team", refId: String(teamId))
                await MainActor.run { isFollowing = false }
            } else {
                let name = profile?.team.name ?? teamName
                let logo = profile?.team.logo
                try await APIClient.shared.addSportsFollow(
                    kind: "team", refId: String(teamId), refName: name, refLogo: logo
                )
                await MainActor.run { isFollowing = true }
            }
        } catch { }
        await MainActor.run { followBusy = false }
    }
}
