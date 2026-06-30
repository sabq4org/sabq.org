import SwiftUI

struct GcTeamProfileScreen: View {
    let teamId: Int
    let fallback: GcTeam
    @State private var profile: GcTeamProfile?
    @State private var loading = true
    @State private var errorMessage: String?

    private var team: GcTeam { profile?.team ?? fallback }

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 18) {
                GcTeamHero(team: team, stats: profile?.stats)

                if let errorMessage {
                    Text(errorMessage)
                        .font(GulfCupFonts.app(size: 12))
                        .foregroundStyle(GcTheme.crimson)
                        .frame(maxWidth: .infinity)
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 12).fill(GcTheme.cardFill))
                } else if loading && profile == nil {
                    GcLoadingPanel(title: L("loading.team"))
                }

                if let profile {
                    GcTeamStatsCard(stats: profile.stats)

                    if let next = profile.nextMatch {
                        GcSectionHeader(icon: "clock.fill", title: L("team.nextMatch"), tint: GcTheme.gold)
                        GcMatchCard(fixture: next)
                    }

                    if !profile.fixtures.isEmpty {
                        GcSectionHeader(icon: "calendar", title: L("team.fixtures"), count: profile.fixtures.count, tint: GcTheme.emerald)
                        ForEach(profile.fixtures) { GcMatchCard(fixture: $0) }
                    }

                    if let group = profile.group {
                        GcSectionHeader(icon: "rectangle.3.group", title: L("team.group"), tint: GcTheme.teal)
                        GcGroupCard(group: group)
                    }
                }

                GcFooterSignature()
            }
        }
        .navigationBarHidden(true)
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    private func load(force: Bool = false) async {
        loading = true
        do {
            profile = try await APIClient.shared.fetchGcTeamProfile(teamId, ignoreCache: force)
            errorMessage = nil
        } catch {
            errorMessage = LError(error)
        }
        loading = false
    }
}

private struct GcTeamHero: View {
    let team: GcTeam
    let stats: GcTeamStats?

    var body: some View {
        VStack(spacing: 14) {
            GcTeamLogo(logo: team.logo, size: 72)
            Text(team.name)
                .font(GulfCupFonts.headline(size: 24))
                .foregroundStyle(GcTheme.onDark)
            if let rank = stats?.rank, let group = stats?.groupName {
                GcHeroBadge(icon: "number", text: "\(group) · #\(rank)", tint: GcTheme.goldDeep, onDark: false)
            }
            if team.id == GulfCupConstants.saudiTeamId {
                GcHeroBadge(icon: "star.fill", text: L("teams.host.badge"), tint: GcTheme.emerald)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(GcTheme.heroGradient)
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(GcTheme.gold.opacity(0.2), lineWidth: 1))
        )
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

    private func statTile(_ value: String, _ label: String, _ tint: Color = GcTheme.onDark) -> some View {
        VStack(spacing: 4) {
            Text(value).font(GulfCupFonts.app(size: 20, weight: .bold)).foregroundStyle(tint).monospacedDigit()
            Text(label).font(GulfCupFonts.app(size: 10, weight: .semibold)).foregroundStyle(GcTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 14).fill(GcTheme.cardFillStrong))
    }
}
