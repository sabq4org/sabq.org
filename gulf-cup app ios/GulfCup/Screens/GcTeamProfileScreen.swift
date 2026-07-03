import SwiftUI

// ملف المنتخب v3 — ترويسة ليلية بالإرث الخليجي (ألقاب/وصافات/استضافات)، المدرّب،
// آخر النتائج، إحصاءات البطولة، قائمة اللاعبين مقسّمة بالمراكز (صور وأرقام
// وأعمار من المزوّد)، جدول المنتخب، ومجموعته.
struct GcTeamProfileScreen: View {
    let teamId: Int
    let fallback: GcTeam
    @State private var profile: GcTeamProfile?
    @State private var loading = true
    @State private var errorMessage: String?

    private var team: GcTeam { profile?.team ?? fallback }

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 16) {
                GcTeamHero(team: team, profile: profile)

                if let errorMessage {
                    GcErrorCard(message: errorMessage) { await load(force: true) }
                } else if loading && profile == nil {
                    GcLoadingPanel(title: L("loading.team"))
                }

                if let profile {
                    if !profile.stats.form.isEmpty {
                        HStack {
                            Text(L("team.form")).font(GulfCupFonts.app(size: 12, weight: .bold)).foregroundStyle(GcTheme.inkDim)
                            Spacer()
                            GcFormDots(form: profile.stats.form)
                        }
                        .padding(13)
                        .gcCard(radius: GcTheme.tileRadius)
                    }

                    GcTeamStatsCard(stats: profile.stats)

                    if let legacy = profile.legacy, legacy.titles > 0 || legacy.runnerUps > 0 {
                        GcTeamLegacyCard(legacy: legacy)
                    }

                    if let next = profile.nextMatch {
                        GcSectionHeader(icon: "clock.fill", title: L("team.nextMatch"), tint: GcTheme.gold)
                        GcMatchCard(fixture: next)
                    }

                    if !profile.squad.isEmpty {
                        GcSectionHeader(icon: "person.3.fill", title: L("team.squad"), subtitle: profile.coach.map { "\(L("team.coach")): \($0)" }, count: profile.squad.count, tint: GcTheme.emerald)
                        GcSquadCard(squad: profile.squad)
                    }

                    if !profile.fixtures.isEmpty {
                        GcSectionHeader(icon: "calendar", title: L("team.fixtures"), count: profile.fixtures.count, tint: GcTheme.emerald)
                        GcMatchListCard(fixtures: profile.fixtures)
                    }

                    if let group = profile.group {
                        GcSectionHeader(icon: "rectangle.3.group", title: L("team.group"), tint: GcTheme.teal)
                        GcGroupCard(group: group, highlightTeamId: teamId)
                    }
                }

                GcFooterSignature()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private func load(force: Bool = false) async {
        if profile == nil { loading = true }
        do {
            profile = try await APIClient.shared.fetchGcTeamProfile(teamId, ignoreCache: force)
            errorMessage = nil
        } catch {
            errorMessage = LError(error)
        }
        loading = false
    }
}

/// ترويسة المنتخب — لوحة ليلية بشعار كبير وشارات الإرث.
private struct GcTeamHero: View {
    let team: GcTeam
    let profile: GcTeamProfile?

    var body: some View {
        GcHeroPanel {
            VStack(spacing: 12) {
                GcTeamLogo(logo: team.logo, size: 68)
                Text(team.name)
                    .font(GulfCupFonts.headline(size: 22))
                    .foregroundStyle(.white)

                HStack(spacing: 6) {
                    if let rank = profile?.stats.rank, let group = profile?.stats.groupName {
                        GcHeroBadge(icon: "number", text: "\(group) · #\(rank)", tint: GcTheme.goldLite)
                    }
                    if team.id == GulfCupConstants.saudiTeamId {
                        GcHeroBadge(icon: "star.fill", text: L("teams.host.badge"), tint: GcTheme.goldLite)
                    }
                    if let titles = profile?.legacy?.titles, titles > 0 {
                        GcHeroBadge(icon: "trophy.fill", text: "\(titles) \(L("history.titles.unit"))", tint: GcTheme.goldLite)
                    }
                }

                if let coach = profile?.coach {
                    HStack(spacing: 5) {
                        Image(systemName: "person.text.rectangle").font(.system(size: 10))
                        Text("\(L("team.coach")): \(coach)")
                    }
                    .font(GulfCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(GcTheme.onHeroDim)
                }
            }
            .padding(20)
        }
        .padding(.top, 8)
    }
}

private struct GcTeamStatsCard: View {
    let stats: GcTeamStats

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            statTile("\(stats.played)", L("stats.played"))
            statTile("\(stats.points)", L("stats.points"), GcTheme.goldDeep)
            statTile("\(stats.goalsDiff >= 0 ? "+\(stats.goalsDiff)" : "\(stats.goalsDiff)")", L("stats.diff"))
            statTile("\(stats.win)", L("stats.win"), GcTheme.emerald)
            statTile("\(stats.draw)", L("stats.draw"))
            statTile("\(stats.lose)", L("stats.lose"), GcTheme.crimson)
        }
    }

    private func statTile(_ value: String, _ label: String, _ tint: Color = GcTheme.ink) -> some View {
        VStack(spacing: 4) {
            Text(value).font(GulfCupFonts.app(size: 20, weight: .bold)).foregroundStyle(tint).monospacedDigit()
            Text(label).font(GulfCupFonts.app(size: 10, weight: .semibold)).foregroundStyle(GcTheme.inkDim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .gcCard(radius: GcTheme.tileRadius)
    }
}

/// الإرث الخليجي — الألقاب والوصافات والاستضافات وسنوات التتويج.
private struct GcTeamLegacyCard: View {
    let legacy: GcTeamLegacy

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            GcSectionHeader(icon: "crown.fill", title: L("team.legacy.title"), tint: GcTheme.goldDeep)
            HStack(spacing: 0) {
                legacyStat("\(legacy.titles)", L("history.titles.unit"), "trophy.fill", GcTheme.goldDeep)
                divider
                legacyStat("\(legacy.runnerUps)", L("history.runnerUp.unit"), "medal.fill", GcTheme.inkDim)
                divider
                legacyStat("\(legacy.hosted)", L("history.hosted.unit"), "mappin.circle.fill", GcTheme.teal)
            }
            if !legacy.titleYears.isEmpty {
                Text(L("team.legacy.years")).font(GulfCupFonts.app(size: 11, weight: .bold)).foregroundStyle(GcTheme.inkDim)
                FlowChips(items: legacy.titleYears)
            }
        }
        .padding(14)
        .gcCard(stroke: GcTheme.gold.opacity(0.25))
    }

    private var divider: some View {
        Rectangle().fill(GcTheme.outline).frame(width: 1, height: 34)
    }

    private func legacyStat(_ v: String, _ l: String, _ icon: String, _ tint: Color) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 13)).foregroundStyle(tint)
            Text(v).font(GulfCupFonts.app(size: 18, weight: .bold)).foregroundStyle(GcTheme.ink).monospacedDigit()
            Text(l).font(GulfCupFonts.app(size: 10)).foregroundStyle(GcTheme.inkDim)
        }
        .frame(maxWidth: .infinity)
    }
}

/// رقائق سنوات التتويج — صفوف تلتف تلقائيًّا.
private struct FlowChips: View {
    let items: [String]
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 64))], spacing: 6) {
            ForEach(items, id: \.self) { year in
                Text(year)
                    .font(GulfCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(GcTheme.goldDeep)
                    .monospacedDigit()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(GcTheme.gold.opacity(0.10)))
            }
        }
    }
}

/// قائمة اللاعبين مقسّمة بالمراكز.
private struct GcSquadCard: View {
    let squad: [GcSquadPlayer]

    private static let sections: [(en: String, key: String)] = [
        ("Goalkeeper", "position.Goalkeeper"),
        ("Defender", "position.Defender"),
        ("Midfielder", "position.Midfielder"),
        ("Attacker", "position.Attacker"),
    ]

    private func players(for en: String) -> [GcSquadPlayer] {
        squad.filter { ($0.positionEn ?? "") == en }
    }

    private var others: [GcSquadPlayer] {
        let known = Set(Self.sections.map(\.en))
        return squad.filter { !known.contains($0.positionEn ?? "") }
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(Self.sections.enumerated()), id: \.offset) { _, section in
                let rows = players(for: section.en)
                if !rows.isEmpty {
                    sectionHeader(L(section.key), count: rows.count)
                    ForEach(rows) { playerRow($0) }
                }
            }
            if !others.isEmpty {
                ForEach(others) { playerRow($0) }
            }
        }
        .gcCard()
    }

    private func sectionHeader(_ title: String, count: Int) -> some View {
        HStack {
            Text(title).font(GulfCupFonts.app(size: 11.5, weight: .bold)).foregroundStyle(GcTheme.emerald)
            Spacer()
            Text("\(count)").font(GulfCupFonts.app(size: 10.5, weight: .bold)).foregroundStyle(GcTheme.inkFaint).monospacedDigit()
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(GcTheme.cardBgSubtle)
    }

    private func playerRow(_ p: GcSquadPlayer) -> some View {
        HStack(spacing: 11) {
            Text(p.number.map(String.init) ?? "–")
                .font(GulfCupFonts.app(size: 11.5, weight: .bold))
                .foregroundStyle(GcTheme.emerald)
                .monospacedDigit()
                .frame(width: 26, height: 26)
                .background(Circle().fill(GcTheme.emerald.opacity(0.09)))
            GcPlayerPhoto(url: p.photo, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(p.name).font(GulfCupFonts.app(size: 13, weight: .semibold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                HStack(spacing: 5) {
                    Text(p.position).font(GulfCupFonts.app(size: 10)).foregroundStyle(GcTheme.inkDim)
                    if let age = p.age {
                        Text("· \(age) سنة").font(GulfCupFonts.app(size: 10)).foregroundStyle(GcTheme.inkFaint)
                    }
                }
            }
            Spacer()
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
    }
}
