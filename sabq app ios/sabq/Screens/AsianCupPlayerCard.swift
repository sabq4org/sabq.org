import SwiftUI

// MARK: - بطاقة لاعب كأس آسيا

struct AcPlayerSheet: View {
    let playerId: Int
    @Environment(\.dismiss) private var dismiss

    @State private var card: AcPlayerCard?
    @State private var form: AcPlayerForm?
    @State private var market: AcPlayerMarketPublic?
    @State private var loading = true

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    if loading {
                        AcLoading().padding(.top, 30)
                    } else if let card {
                        identity(card)
                        if let stats = card.stats {
                            tournamentStats(stats)
                        }
                        if let market, market.available, let value = market.marketValue {
                            marketBlock(value: value, currency: market.currency)
                        }
                        if let form, form.available, !form.matches.isEmpty {
                            formBlock(form.matches)
                        }
                        if !card.career.isEmpty {
                            careerBlock(card.career)
                        }
                        if !card.trophies.isEmpty {
                            trophiesBlock(card.trophies)
                        }
                    } else {
                        acEmptyText("ملف اللاعب غير متاح").padding(.top, 50)
                    }
                }
                .padding(16)
            }
            .background(AcTheme.sectionBackground.ignoresSafeArea())
            .navigationTitle("بطاقة اللاعب")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(AcTheme.stadiumTop, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white) }
                }
            }
            .task { await load() }
        }
        .sabqRTL()
    }

    private func identity(_ c: AcPlayerCard) -> some View {
        HStack(spacing: 14) {
            AcRemoteImage(url: c.photo, contentMode: .fill)
                .frame(width: 72, height: 72)
                .clipShape(Circle())
                .overlay(Circle().stroke(AcTheme.emeraldDeep.opacity(0.4), lineWidth: 2))
            VStack(alignment: .leading, spacing: 4) {
                Text(c.name)
                    .font(SabqFonts.app(size: 20, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                HStack(spacing: 8) {
                    if let n = c.number {
                        Text("#\(n)")
                            .font(SabqFonts.app(size: 12, weight: .bold))
                            .foregroundStyle(AcTheme.emeraldDeep)
                    }
                    Text(c.position)
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(AcTheme.onDarkDim)
                    if let age = c.age {
                        Text("· \(age) سنة")
                            .font(SabqFonts.app(size: 12))
                            .foregroundStyle(AcTheme.onDarkDim)
                    }
                }
                if let team = c.currentTeam {
                    HStack(spacing: 6) {
                        AcTeamLogo(team: team, size: 18)
                        Text(team.name)
                            .font(SabqFonts.app(size: 12, weight: .medium))
                            .foregroundStyle(AcTheme.onDark)
                    }
                }
            }
            Spacer()
        }
        .padding(14)
        .acElevatedCard()
    }

    private func tournamentStats(_ s: AcPlayerTournamentStats) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("إحصاءات البطولة")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(AcTheme.onDark)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                AcFactTile(value: "\(s.goals)", label: "أهداف")
                AcFactTile(value: "\(s.assists)", label: "صناعات")
                AcFactTile(value: "\(s.matches)", label: "مباريات")
                AcFactTile(value: "\(s.minutes)", label: "دقائق")
                AcFactTile(value: "\(s.yellow)", label: "صفراء")
                AcFactTile(value: "\(s.red)", label: "حمراء")
            }
        }
    }

    private func marketBlock(value: Int, currency: String) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("القيمة السوقية")
                    .font(SabqFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkDim)
                Text(formatMarket(value, currency: currency))
                    .font(SabqFonts.app(size: 18, weight: .bold))
                    .foregroundStyle(AcTheme.gold)
            }
            Spacer()
            Image(systemName: "chart.line.uptrend.xyaxis")
                .foregroundStyle(AcTheme.gold)
        }
        .padding(14)
        .acElevatedCard()
    }

    private func formBlock(_ matches: [AcFormMatch]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("الفورمة الأخيرة")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(AcTheme.onDark)
            ForEach(matches.prefix(5)) { m in
                HStack {
                    Text(m.opponent)
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(AcTheme.onDark)
                        .lineLimit(1)
                    Spacer()
                    if let xg = m.xg {
                        Text(String(format: "xG %.2f", xg))
                            .font(SabqFonts.app(size: 11).monospacedDigit())
                            .foregroundStyle(AcTheme.onDarkDim)
                    }
                    Text("\(m.goals)G")
                        .font(SabqFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(AcTheme.emeraldDeep)
                    if let r = m.rating {
                        Text(String(format: "%.1f", r))
                            .font(SabqFonts.app(size: 12, weight: .bold).monospacedDigit())
                            .foregroundStyle(AcTheme.gold)
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .padding(12)
        .acElevatedCard()
    }

    private func careerBlock(_ career: [AcPlayerCareerStop]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("المسيرة")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(AcTheme.onDark)
            ForEach(career.prefix(8)) { stop in
                HStack(spacing: 8) {
                    AcRemoteImage(url: stop.logo).frame(width: 22, height: 22)
                    Text(stop.team)
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(AcTheme.onDark)
                        .lineLimit(1)
                    Spacer()
                    if let first = stop.seasons.first, let last = stop.seasons.last {
                        Text(first == last ? "\(first)" : "\(first)–\(last)")
                            .font(SabqFonts.app(size: 11).monospacedDigit())
                            .foregroundStyle(AcTheme.onDarkDim)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
            }
        }
        .padding(12)
        .acElevatedCard()
    }

    private func trophiesBlock(_ trophies: [AcPlayerTrophy]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("الألقاب")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(AcTheme.onDark)
            ForEach(trophies.prefix(8)) { t in
                HStack {
                    Image(systemName: t.winner ? "trophy.fill" : "medal.fill")
                        .foregroundStyle(t.winner ? AcTheme.gold : AcTheme.onDarkDim)
                        .font(.system(size: 12))
                    Text(t.competition)
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(AcTheme.onDark)
                        .lineLimit(1)
                    Spacer()
                    Text(t.season)
                        .font(SabqFonts.app(size: 11))
                        .foregroundStyle(AcTheme.onDarkDim)
                }
            }
        }
        .padding(12)
        .acElevatedCard()
    }

    private func formatMarket(_ value: Int, currency: String) -> String {
        if value >= 1_000_000 {
            return String(format: "%.1f م%@", Double(value) / 1_000_000, currency)
        }
        if value >= 1_000 {
            return String(format: "%.0f أ%@", Double(value) / 1_000, currency)
        }
        return "\(value) \(currency)"
    }

    private func load() async {
        async let c = try? APIClient.shared.fetchAsianCupPlayer(playerId: playerId)
        async let f = try? APIClient.shared.fetchAsianCupPlayerForm(playerId: playerId)
        async let m = try? APIClient.shared.fetchAsianCupPlayerMarket(playerId: playerId)
        let (cardR, formR, marketR) = await (c, f, m)
        await MainActor.run {
            card = cardR
            form = formR
            market = marketR
            loading = false
        }
    }
}
