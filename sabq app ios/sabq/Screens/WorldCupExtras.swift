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

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            WCSectionHeader(icon: "trophy.fill", title: "سباقات البطولة",
                            subtitle: "الحذاء الذهبي، صنّاع الأهداف، والبطاقات", tint: WCTheme.gold)
                .padding(.horizontal, 16)

            HStack(spacing: 8) {
                ForEach(Tab.allCases, id: \.self) { t in
                    Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                        Text(t.rawValue)
                            .font(.system(size: 13, weight: .semibold))
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
                        WCPodium(scorer: podium[1], place: 1)
                        WCPodium(scorer: podium[0], place: 0)
                        WCPodium(scorer: podium[2], place: 2)
                    }
                }
                ForEach(rest) { s in
                    WCLeaderRow(rank: s.rank, name: s.name, photo: s.photo, team: s.team, minutes: s.minutes) {
                        metric("\(s.goals)", sub: "\(s.assists) صناعة")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func leadersView<Trailing: View>(_ leaders: [WCLeader], empty: String, @ViewBuilder trailing: @escaping (WCLeader) -> Trailing) -> some View {
        if leaders.isEmpty {
            WCRaceEmpty(message: empty)
        } else {
            VStack(spacing: 8) {
                ForEach(leaders) { l in
                    WCLeaderRow(rank: l.rank, name: l.name, photo: l.photo, team: l.team, minutes: l.minutes) {
                        trailing(l)
                    }
                }
            }
        }
    }

    private func metric(_ value: String, sub: String) -> some View {
        HStack(spacing: 8) {
            Text(sub).font(.system(size: 12)).foregroundStyle(WCTheme.onDarkDim)
            Text(value).font(.system(size: 18, weight: .black, design: .rounded)).foregroundStyle(WCTheme.onDark)
        }
    }
    private func cardCount(_ n: Int, color: Color) -> some View {
        HStack(spacing: 3) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 9, height: 12)
            Text("\(n)").font(.system(size: 14, weight: .black)).foregroundStyle(WCTheme.onDark)
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
            Image(systemName: "soccerball").font(.system(size: 28)).foregroundStyle(WCTheme.gold)
            Text(message).font(SabqFonts.subhead(size: 14)).foregroundStyle(WCTheme.onDark)
            Text("تابع هنا الترتيب أولًا بأول طوال البطولة")
                .font(.system(size: 12)).foregroundStyle(WCTheme.onDarkDim)
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
                    .font(.system(size: 10, weight: .black)).foregroundStyle(.white)
                    .padding(.horizontal, 7).padding(.vertical, 1)
                    .background(Capsule().fill(ring))
                    .offset(y: 6)
            }
            Text(scorer.name).font(.system(size: place == 0 ? 15 : 13, weight: .heavy))
                .foregroundStyle(WCTheme.onDark).multilineTextAlignment(.center).lineLimit(1)
            HStack(spacing: 4) {
                WCRemoteImage(url: scorer.team.logo).frame(width: 14, height: 14)
                Text(scorer.team.name).font(.system(size: 11)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
            }
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text("\(scorer.goals)")
                    .font(.system(size: place == 0 ? 28 : 22, weight: .black, design: .rounded))
                    .foregroundStyle(place == 0 ? WCTheme.gold : WCTheme.onDark)
                Text(scorer.goals == 1 ? "هدف" : "أهداف").font(.system(size: 11)).foregroundStyle(WCTheme.onDarkDim)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, place == 0 ? 0 : 24)
    }

    private var photo: some View {
        Group {
            if scorer.photo.isEmpty {
                Text(String(scorer.name.prefix(2)))
                    .font(.system(size: 18, weight: .black)).foregroundStyle(WCTheme.onDarkDim)
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
            Text("\(rank)").font(.system(size: 13)).foregroundStyle(WCTheme.onDarkDim).frame(width: 20)
            photoView
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.system(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                HStack(spacing: 4) {
                    WCRemoteImage(url: team.logo).frame(width: 12, height: 12)
                    Text(team.name).font(.system(size: 11)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
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
                            subtitle: "48 منتخبًا — اضغط على أي منتخب لعرض قائمته")
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
            WCSquadSheet(team: team)
                .presentationDetents([.large])
        }
    }

    private func teamTile(_ team: WCTeam) -> some View {
        let isSaudi = team.id == WCTheme.saudiId
        return VStack(spacing: 6) {
            WCTeamLogo(team: team, size: 38, ring: WCTheme.cardStroke)
            Text(team.name).font(.system(size: 11, weight: .bold)).foregroundStyle(WCTheme.onDark)
                .lineLimit(1).multilineTextAlignment(.center)
            if isSaudi {
                Text("الأخضر").font(.system(size: 9, weight: .bold)).foregroundStyle(.white)
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

/// قائمة المنتخب — تُعرض كـsheet مجمعة بالمراكز.
struct WCSquadSheet: View {
    let team: WCTeam
    @Environment(\.dismiss) private var dismiss
    @State private var squad: WCSquad?
    @State private var loading = true

    private let sections: [(en: String, label: String)] = [
        ("Goalkeeper", "حراسة المرمى"), ("Defender", "الدفاع"),
        ("Midfielder", "الوسط"), ("Attacker", "الهجوم")
    ]

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                if loading {
                    WCLoading().padding(.top, 40)
                } else if let squad, !squad.players.isEmpty {
                    VStack(alignment: .leading, spacing: 18) {
                        ForEach(sections, id: \.en) { sec in
                            let players = squad.players.filter { $0.positionEn == sec.en }
                            if !players.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(sec.label).font(.system(size: 13, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                                    ForEach(players) { p in playerRow(p) }
                                }
                            }
                        }
                    }
                    .padding(16)
                } else {
                    Text("القائمة الرسمية لم تُعلن بعد")
                        .font(.system(size: 13)).foregroundStyle(WCTheme.onDarkDim)
                        .frame(maxWidth: .infinity).padding(.top, 50)
                }
            }
            .background(WCTheme.sectionBackground.ignoresSafeArea())
            .navigationTitle("قائمة \(team.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(WCTheme.stadiumTop, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    WCTeamLogo(team: team, size: 30, ring: WCTheme.cardStroke)
                }
            }
            .task {
                if let r = try? await APIClient.shared.fetchWorldCupSquad(teamId: team.id) {
                    await MainActor.run { squad = r; loading = false }
                } else { await MainActor.run { loading = false } }
            }
        }
        .sabqRTL()
    }

    private func playerRow(_ p: WCSquadPlayer) -> some View {
        HStack(spacing: 10) {
            if p.photo.isEmpty {
                Circle().fill(WCTheme.chipFill).frame(width: 36, height: 36)
            } else {
                WCRemoteImage(url: p.photo, contentMode: .fill).frame(width: 36, height: 36).clipShape(Circle())
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(p.name).font(.system(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                if let age = p.age {
                    Text("\(age) سنة").font(.system(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                }
            }
            Spacer()
            Text(p.number.map { "\($0)" } ?? "—")
                .font(.system(size: 15, weight: .black)).foregroundStyle(WCTheme.onDarkDim)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
    }
}
