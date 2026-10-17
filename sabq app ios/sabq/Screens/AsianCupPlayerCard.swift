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
                    VStack(alignment: .leading, spacing: SabqLayout.space24) {
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
                    .padding(.horizontal, SabqLayout.pageMargin)
                    .padding(.top, SabqLayout.space16)
                    .padding(.bottom, SabqLayout.space40)
                } else {
                    Text("ملف اللاعب غير متاح حاليًا")
                        .font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                        .frame(maxWidth: .infinity).padding(.top, SabqLayout.space40)
                }
            }
            .background(SabqTheme.background.ignoresSafeArea())
            .navigationTitle("بطاقة اللاعب")
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
        HStack(spacing: SabqLayout.space16) {
            photo(p)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(p.name)
                    .sabqText(SabqType.leadTitle).foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(2)
                    .accessibilityAddTraits(.isHeader)
                if let full = p.fullName {
                    Text(full).font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                }
                HStack(spacing: SabqLayout.space8) {
                    if !p.position.isEmpty {
                        chip(p.position, fg: AcStyle.accent)
                    }
                    if let number = p.number {
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "tshirt.fill").font(SabqFonts.app(size: 12))
                            Text("\(number)").font(SabqType.tag.font.monospacedDigit())
                        }
                        .foregroundStyle(SabqTheme.textPrimary)
                        .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                        .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
                    }
                    if p.injury != nil {
                        chip("مصاب حاليًا", fg: SabqTheme.warning)
                    }
                }
                if let team = p.currentTeam {
                    HStack(spacing: SabqLayout.space8) {
                        AcTeamLogo(team: team, size: 20)
                        Text(team.name).font(SabqType.metaEmphasis.font).foregroundStyle(SabqTheme.textPrimary)
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func photo(_ p: AcPlayerCard) -> some View {
        AcPlayerAvatar(photo: p.photo, size: 80, initials: String(p.name.prefix(2)))
            .overlay(Circle().stroke(AcStyle.accent, lineWidth: 2))
    }

    private func chip(_ text: String, fg: Color) -> some View {
        Text(text)
            .font(SabqType.tag.font).foregroundStyle(fg)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
            .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
    }

    @ViewBuilder private func factTiles(_ p: AcPlayerCard) -> some View {
        let facts: [(value: String, label: String)] = [
            p.age.map { ("\($0) سنة", "العمر") },
            p.height.map { ("\($0) سم", "الطول") },
            p.weight.map { ("\($0) كجم", "الوزن") },
        ].compactMap { $0 }
        if !facts.isEmpty {
            HStack(spacing: SabqLayout.space8) {
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
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "birthday.cake").accessibilityHidden(true)
                Text(parts.joined(separator: " — "))
            }
            .font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
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
        VStack(alignment: .leading, spacing: 0) {
            sectionTitle(icon: "clock.arrow.circlepath", text: "المسيرة")
                .padding(.bottom, SabqLayout.space8)
            ForEach(Array(career.enumerated()), id: \.element.id) { index, stop in
                if index > 0 { AcRowDivider() }
                HStack(spacing: SabqLayout.space12) {
                    AcRemoteImage(url: stop.logo)
                        .padding(SabqLayout.space4)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(.white))
                        .clipShape(Circle())
                        .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
                    Text(stop.team).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                    Spacer()
                    if !stop.seasons.isEmpty {
                        Text(stop.seasonsLabel)
                            .font(SabqType.meta.font.monospacedDigit())
                            .foregroundStyle(SabqTheme.textSecondary)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                .padding(.vertical, SabqLayout.space12)
            }
        }
    }

    private func trophiesSection(_ trophies: [AcPlayerTrophy]) -> some View {
        let titles = trophies.filter(\.winner).count
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: SabqLayout.space8) {
                sectionTitle(icon: "trophy.fill", text: "الألقاب")
                if titles > 0 {
                    AcTag(text: "\(titles) بطولة")
                }
            }
            .padding(.bottom, SabqLayout.space8)
            ForEach(Array(trophies.enumerated()), id: \.element.id) { index, trophy in
                if index > 0 { AcRowDivider() }
                HStack(spacing: SabqLayout.space12) {
                    Image(systemName: "trophy.fill")
                        .font(SabqType.meta.font)
                        .foregroundStyle(trophy.winner ? AcTheme.gold : SabqTheme.outline)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(trophy.competition).font(SabqType.excerpt.font).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                        if !trophy.country.isEmpty {
                            Text(trophy.country).font(SabqType.meta.font).foregroundStyle(SabqTheme.textSecondary)
                        }
                    }
                    Spacer()
                    Text(trophy.place)
                        .font(SabqType.tag.font).foregroundStyle(trophy.winner ? SabqTheme.onAction : SabqTheme.textSecondary)
                        .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                .fill(trophy.winner ? AcStyle.accentFill : SabqTheme.surfaceMuted)
                        )
                    Text(trophy.season)
                        .font(SabqType.meta.font.monospacedDigit())
                        .foregroundStyle(SabqTheme.textSecondary)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .padding(.vertical, SabqLayout.space12)
            }
        }
    }

    private func sectionTitle(icon: String, text: String) -> some View {
        AcSectionHeader(icon: icon, title: text, subtitle: "")
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

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: SabqLayout.space8)]

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                AcSectionHeader(icon: "chart.bar.fill", title: "أرقامه في كأس آسيا", subtitle: "")
                if let rating = stats.rating {
                    AcRatingBadge(rating: rating)
                }
            }
            LazyVGrid(columns: columns, spacing: SabqLayout.space8) {
                ForEach(tiles, id: \.label) { tile in
                    AcFactTile(value: tile.value, label: tile.label)
                }
            }
        }
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
                VStack(alignment: .leading, spacing: SabqLayout.space12) {
                    HStack(spacing: SabqLayout.space8) {
                        AcSectionHeader(icon: "chart.line.uptrend.xyaxis",
                                        title: hasXg ? "الفورمة الأخيرة · xG" : "الفورمة الأخيرة", subtitle: "")
                        AcTag(text: "آخر \(matches.count)")
                    }
                    if hasXg {
                        Chart(matches) { m in
                            BarMark(
                                x: .value("الخصم", m.opponent),
                                y: .value("xG", m.xg ?? 0)
                            )
                            .foregroundStyle(AcStyle.accentFill)
                            .cornerRadius(2)
                        }
                        .frame(height: 96)
                    }
                    VStack(spacing: 0) {
                        ForEach(Array(matches.prefix(5).enumerated()), id: \.element.id) { index, m in
                            if index > 0 { AcRowDivider() }
                            HStack(spacing: SabqLayout.space12) {
                                Text(m.opponent.isEmpty ? "—" : m.opponent)
                                    .font(SabqType.excerpt.font).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                                Spacer()
                                if let xg = m.xg {
                                    Text(String(format: "xG %.1f", xg))
                                        .font(SabqType.meta.font.monospacedDigit()).foregroundStyle(AcStyle.accent)
                                }
                                if m.goals > 0 {
                                    Text("\(m.goals)G")
                                        .font(SabqType.metaEmphasis.font).foregroundStyle(SabqTheme.textPrimary)
                                }
                                if let r = m.rating {
                                    AcRatingBadge(rating: r)
                                }
                            }
                            .padding(.vertical, SabqLayout.space12)
                        }
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
                VStack(alignment: .leading, spacing: SabqLayout.space12) {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .font(SabqType.button.font).foregroundStyle(AcStyle.accent)
                            .accessibilityHidden(true)
                        Text("القيمة السوقية").sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                        Spacer()
                        if let current {
                            Text(Self.format(current, currency: currency))
                                .font(SabqType.sectionHeading.font)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                    if history.count >= 2 {
                        Chart(history) { pt in
                            LineMark(
                                x: .value("ت", pt.date),
                                y: .value("ق", pt.value)
                            )
                            .foregroundStyle(AcStyle.accent)
                            .interpolationMethod(.catmullRom)
                        }
                        .chartXAxis(.hidden)
                        .chartYAxis(.hidden)
                        .frame(height: 72)
                    }
                }
                .padding(SabqLayout.space16)
                .acQuietBlock()
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
