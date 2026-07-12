import SwiftUI
import Charts

// MARK: - بطاقة لاعب كأس آسيا (تكافؤ WCPlayerSheet)

struct AcPlayerSheet: View {
    let playerId: Int
    @Environment(\.dismiss) private var dismiss

    @State private var card: AcPlayerCard?
    @State private var loading = true

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                if loading {
                    AcLoading().padding(.top, 40)
                } else if let card {
                    VStack(alignment: .leading, spacing: 18) {
                        identityHeader(card)
                        factTiles(card)
                        birthLine(card)
                        AcPlayerMarketSection(playerId: playerId, embedded: card.market)
                        if let stats = card.stats {
                            AcPlayerStatsGrid(stats: stats, isGoalkeeper: card.positionEn == "Goalkeeper")
                        }
                        AcPlayerFormSection(playerId: playerId)
                        if !card.career.isEmpty {
                            careerSection(card.career)
                        }
                        if !card.trophies.isEmpty {
                            trophiesSection(card.trophies)
                        }
                    }
                    .padding(16)
                } else {
                    Text("ملف اللاعب غير متاح حاليًا")
                        .font(SabqFonts.app(size: 13)).foregroundStyle(AcTheme.onDarkDim)
                        .frame(maxWidth: .infinity).padding(.top, 50)
                }
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
            .task {
                if let r = try? await APIClient.shared.fetchAsianCupPlayer(playerId: playerId) {
                    await MainActor.run { card = r; loading = false }
                } else {
                    await MainActor.run { loading = false }
                }
            }
        }
        .sabqRTL()
    }

    private func identityHeader(_ p: AcPlayerCard) -> some View {
        HStack(spacing: 14) {
            photo(p)
            VStack(alignment: .leading, spacing: 4) {
                Text(p.name)
                    .font(SabqFonts.headline(size: 20)).foregroundStyle(AcTheme.onDark)
                    .lineLimit(2)
                if let full = p.fullName {
                    Text(full).font(SabqFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim).lineLimit(1)
                }
                HStack(spacing: 6) {
                    if !p.position.isEmpty {
                        chip(p.position, fill: AcTheme.emerald.opacity(0.15), fg: AcTheme.emeraldDeep)
                    }
                    if let number = p.number {
                        HStack(spacing: 3) {
                            Image(systemName: "tshirt.fill").font(SabqFonts.app(size: 9))
                            Text("\(number)").font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit())
                        }
                        .foregroundStyle(AcTheme.onDark)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Capsule().fill(AcTheme.chipFill))
                    }
                    if p.injury != nil {
                        chip("مصاب حاليًا", fill: AcTheme.gold.opacity(0.2), fg: AcTheme.gold)
                    }
                }
                if let team = p.currentTeam {
                    HStack(spacing: 6) {
                        AcTeamLogo(team: team, size: 18)
                        Text(team.name).font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(AcTheme.onDark)
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func photo(_ p: AcPlayerCard) -> some View {
        Group {
            if p.photo.isEmpty {
                Text(String(p.name.prefix(2)))
                    .font(SabqFonts.app(size: 20, weight: .semibold)).foregroundStyle(AcTheme.onDarkDim)
                    .frame(width: 76, height: 76).background(Circle().fill(AcTheme.chipFill))
            } else {
                AcRemoteImage(url: p.photo, contentMode: .fill)
                    .frame(width: 76, height: 76).clipShape(Circle())
            }
        }
        .overlay(Circle().stroke(AcTheme.emeraldDeep, lineWidth: 3))
    }

    private func chip(_ text: String, fill: Color, fg: Color) -> some View {
        Text(text)
            .font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(fg)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(fill))
    }

    @ViewBuilder private func factTiles(_ p: AcPlayerCard) -> some View {
        let facts: [(value: String, label: String)] = [
            p.age.map { ("\($0) سنة", "العمر") },
            p.height.map { ("\($0) سم", "الطول") },
            p.weight.map { ("\($0) كجم", "الوزن") },
        ].compactMap { $0 }
        if !facts.isEmpty {
            HStack(spacing: 8) {
                ForEach(facts, id: \.label) { fact in
                    AcFactTile(value: fact.value, label: fact.label)
                }
            }
        }
    }

    @ViewBuilder private func birthLine(_ p: AcPlayerCard) -> some View {
        let date = p.birthDate.flatMap { SabqFormatters.parseISO8601($0) ?? Self.birthParser.date(from: $0) }
        let parts = [date.map { Self.birthFormatter.string(from: $0) }, p.birthPlace].compactMap { $0 }
        if !parts.isEmpty {
            HStack(spacing: 6) {
                Image(systemName: "birthday.cake").font(SabqFonts.app(size: 11))
                Text(parts.joined(separator: " — "))
            }
            .font(SabqFonts.app(size: 12)).foregroundStyle(AcTheme.onDarkDim)
        }
    }

    private static let birthParser: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let birthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA-u-ca-gregory-nu-latn")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "d MMMM yyyy"
        return f
    }()

    private func careerSection(_ career: [AcPlayerCareerStop]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle(icon: "clock.arrow.circlepath", text: "المسيرة")
            ForEach(career) { stop in
                HStack(spacing: 10) {
                    AcRemoteImage(url: stop.logo)
                        .padding(4)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(.white))
                    Text(stop.team).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.onDark).lineLimit(1)
                    Spacer()
                    if !stop.seasons.isEmpty {
                        Text(stop.seasonsLabel)
                            .font(SabqFonts.app(size: 11, weight: .regular).monospacedDigit())
                            .foregroundStyle(AcTheme.onDarkDim)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .acElevatedCard()
            }
        }
    }

    private func trophiesSection(_ trophies: [AcPlayerTrophy]) -> some View {
        let titles = trophies.filter(\.winner).count
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                sectionTitle(icon: "trophy.fill", text: "الألقاب")
                if titles > 0 {
                    Text("\(titles) بطولة")
                        .font(SabqFonts.app(size: 10, weight: .medium)).foregroundStyle(AcTheme.onDarkDim)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Capsule().fill(AcTheme.chipFill))
                }
            }
            ForEach(trophies) { trophy in
                HStack(spacing: 10) {
                    Image(systemName: "trophy.fill")
                        .font(SabqFonts.app(size: 13))
                        .foregroundStyle(trophy.winner ? AcTheme.gold : AcTheme.onDarkDim.opacity(0.5))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(trophy.competition).font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(AcTheme.onDark).lineLimit(1)
                        if !trophy.country.isEmpty {
                            Text(trophy.country).font(SabqFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim)
                        }
                    }
                    Spacer()
                    Text(trophy.place)
                        .font(SabqFonts.app(size: 10, weight: .medium)).foregroundStyle(trophy.winner ? .white : AcTheme.onDarkDim)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Capsule().fill(trophy.winner ? AcTheme.emeraldDeep : AcTheme.chipFill))
                    Text(trophy.season)
                        .font(SabqFonts.app(size: 11, weight: .regular).monospacedDigit())
                        .foregroundStyle(AcTheme.onDarkDim)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .acElevatedCard()
            }
        }
    }

    private func sectionTitle(icon: String, text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(SabqFonts.app(size: 11, weight: .regular)).foregroundStyle(AcTheme.emerald)
            Text(text).font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.emerald)
        }
    }
}

// MARK: - شبكة إحصاءات البطولة

struct AcPlayerStatsGrid: View {
    let stats: AcPlayerTournamentStats
    let isGoalkeeper: Bool

    private var tiles: [(label: String, value: String)] {
        var t: [(String, String)] = [
            ("مباريات", "\(stats.matches)"),
            ("دقائق اللعب", "\(stats.minutes)"),
            ("أساسي", "\(stats.lineups)"),
            ("أهداف", "\(stats.goals)"),
            ("صناعة", "\(stats.assists)"),
        ]
        if isGoalkeeper {
            t.append(("تصديات", "\(stats.saves)"))
            t.append(("أهداف استقبلها", "\(stats.conceded)"))
        } else {
            t.append(("تسديدات (على المرمى)", "\(stats.shots) (\(stats.shotsOn))"))
            t.append(("تمريرات مفتاحية", "\(stats.keyPasses)"))
            t.append(("تدخلات", "\(stats.tackles)"))
        }
        if stats.penaltiesScored + stats.penaltiesMissed > 0 {
            t.append(("ركلات جزاء", "\(stats.penaltiesScored)/\(stats.penaltiesScored + stats.penaltiesMissed)"))
        }
        if stats.yellow + stats.red > 0 {
            t.append(("بطاقات (صفراء/حمراء)", "\(stats.yellow)/\(stats.red)"))
        }
        return t
    }

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 8)]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "chart.bar.fill").font(SabqFonts.app(size: 11, weight: .regular)).foregroundStyle(AcTheme.emerald)
                Text("أرقامه في كأس آسيا").font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.emerald)
                Spacer()
                if let rating = stats.rating {
                    Text(String(format: "%.1f", rating))
                        .font(SabqFonts.app(size: 11, weight: .regular).monospacedDigit())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(RoundedRectangle(cornerRadius: 8).fill(ratingColor(rating)))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(tiles, id: \.label) { tile in
                    AcFactTile(value: tile.value, label: tile.label)
                }
            }
        }
    }

    private func ratingColor(_ r: Double) -> Color {
        if r >= 8 { return AcTheme.emeraldDeep }
        if r >= 7 { return AcTheme.leaf }
        if r >= 6 { return AcTheme.gold }
        return AcTheme.liveRed
    }
}

// MARK: - الفورمة

struct AcPlayerFormSection: View {
    let playerId: Int
    @State private var form: AcPlayerForm?
    @State private var loaded = false

    private var matches: [AcFormMatch] { form?.matches ?? [] }
    private var hasXg: Bool { matches.contains { $0.xg != nil } }

    var body: some View {
        ZStack {
            Color.clear.frame(height: 0)
            if let form, form.available, !form.matches.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .font(SabqFonts.app(size: 11, weight: .regular)).foregroundStyle(AcTheme.emerald)
                        Text(hasXg ? "الفورمة الأخيرة · xG" : "الفورمة الأخيرة")
                            .font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.emerald)
                        Spacer()
                        Text("آخر \(matches.count)")
                            .font(SabqFonts.app(size: 10, weight: .medium)).foregroundStyle(AcTheme.onDarkDim)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Capsule().fill(AcTheme.chipFill))
                    }
                    if hasXg {
                        Chart(matches) { m in
                            BarMark(
                                x: .value("الخصم", m.opponent),
                                y: .value("xG", m.xg ?? 0)
                            )
                            .foregroundStyle(AcTheme.emerald.gradient)
                            .cornerRadius(3)
                        }
                        .frame(height: 96)
                    }
                    ForEach(matches.prefix(5)) { m in
                        HStack(spacing: 10) {
                            Text(m.opponent.isEmpty ? "—" : m.opponent)
                                .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(AcTheme.onDark).lineLimit(1)
                            Spacer()
                            if let xg = m.xg {
                                Text(String(format: "xG %.1f", xg))
                                    .font(SabqFonts.app(size: 11).monospacedDigit()).foregroundStyle(AcTheme.emerald)
                            }
                            if m.goals > 0 {
                                Text("\(m.goals)G")
                                    .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(AcTheme.emeraldDeep)
                            }
                            if let r = m.rating {
                                Text(String(format: "%.1f", r))
                                    .font(SabqFonts.app(size: 11, weight: .medium).monospacedDigit())
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(RoundedRectangle(cornerRadius: 7).fill(ratingColor(r)))
                            }
                        }
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .acElevatedCard()
                    }
                }
            }
        }
        .task(id: playerId) {
            guard !loaded else { return }
            loaded = true
            form = try? await APIClient.shared.fetchAsianCupPlayerForm(playerId: playerId)
        }
    }

    private func ratingColor(_ r: Double) -> Color {
        if r >= 8 { return AcTheme.emeraldDeep }
        if r >= 7 { return AcTheme.leaf }
        if r >= 6 { return AcTheme.gold }
        return AcTheme.liveRed
    }
}

// MARK: - القيمة السوقية

struct AcPlayerMarketSection: View {
    let playerId: Int
    var embedded: AcPlayerMarket? = nil
    @State private var market: AcPlayerMarketPublic?
    @State private var loaded = false

    private var history: [AcMarketPoint] {
        if let h = market?.history, !h.isEmpty { return h }
        return embedded?.history ?? []
    }
    private var current: Double? {
        if let v = market?.marketValue { return v }
        if let v = embedded?.value { return Double(v) }
        return history.last?.value
    }
    private var currency: String {
        market?.currency ?? embedded?.currency ?? "€"
    }
    private var available: Bool {
        (market?.available == true) || (embedded?.available == true)
    }

    var body: some View {
        ZStack {
            Color.clear.frame(height: 0)
            if available, current != nil || history.count >= 2 {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .font(SabqFonts.app(size: 11, weight: .regular)).foregroundStyle(AcTheme.gold)
                        Text("القيمة السوقية").font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(AcTheme.gold)
                        Spacer()
                        if let current {
                            Text(Self.format(current, currency: currency))
                                .font(SabqFonts.app(size: 16, weight: .bold))
                                .foregroundStyle(AcTheme.gold)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                    if history.count >= 2 {
                        Chart(history) { pt in
                            LineMark(
                                x: .value("ت", pt.date),
                                y: .value("ق", pt.value)
                            )
                            .foregroundStyle(AcTheme.gold)
                            .interpolationMethod(.catmullRom)
                        }
                        .chartXAxis(.hidden)
                        .chartYAxis(.hidden)
                        .frame(height: 72)
                    }
                }
                .padding(14)
                .acElevatedCard()
            }
        }
        .task(id: playerId) {
            guard !loaded else { return }
            loaded = true
            market = try? await APIClient.shared.fetchAsianCupPlayerMarket(playerId: playerId)
        }
    }

    static func format(_ value: Double, currency: String) -> String {
        if value >= 1_000_000 {
            return String(format: "%.1f م%@", value / 1_000_000, currency)
        }
        if value >= 1_000 {
            return String(format: "%.0f أ%@", value / 1_000, currency)
        }
        return "\(Int(value)) \(currency)"
    }
}
