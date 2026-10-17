import SwiftUI

// MARK: - بطاقة لاعب كأس الملك (KcPlayerSheet)
//
// مرآة WCPlayerSheet بسياق الكأس: «أرقامه في كأس الملك» مُبرزة أولًا،
// ثم الهوية والحقائق والقيمة السوقية (TheSports) والفورمة (SportMonks) وأرقام
// بقية البطولات والمسيرة والانتقالات والإصابات والألقاب. الأساس يرسم فورًا
// (/kings-cup/player/:id) والإثراء يصل تباعًا (?with=extras + /form + /market).

struct KcPlayerSheet: View {
    let playerId: Int
    @Environment(\.dismiss) private var dismiss

    @State private var player: KcPlayerCard?
    @State private var extras: KcPlayerExtras?
    @State private var form: KcPlayerForm?
    @State private var market: KcPlayerMarket?
    @State private var loading = true

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                if loading {
                    KcLoading().padding(.top, SabqLayout.space40)
                } else if let player {
                    VStack(alignment: .leading, spacing: SabqLayout.space32) {
                        VStack(alignment: .leading, spacing: SabqLayout.space16) {
                            identityHeader(player)
                            factTiles(player)
                            birthLine(player)
                        }
                        if let kc = player.seasonStats.first(where: { $0.isKingsCup }) {
                            kcHighlight(kc, isGoalkeeper: isGoalkeeper(player))
                        }
                        if let market, market.available, let value = market.value {
                            marketCard(market, value: value)
                        }
                        if let form, form.available, !form.matches.isEmpty {
                            formCard(form)
                        }
                        otherSeasonStats(player)
                        if !player.career.isEmpty { careerSection(player.career) }
                        if let transfers = extras?.transfers, !transfers.isEmpty {
                            transfersSection(transfers)
                        }
                        if let injuries = extras?.injuries, !injuries.isEmpty {
                            injuriesSection(injuries)
                        }
                        if !player.trophies.isEmpty { trophiesSection(player.trophies) }
                    }
                    .padding(SabqLayout.pageMargin)
                } else {
                    Text("ملف اللاعب غير متاح حاليًا")
                        .sabqText(SabqType.excerpt).foregroundStyle(SabqTheme.textSecondary)
                        .frame(maxWidth: .infinity).padding(.top, SabqLayout.space40)
                }
            }
            .background(SabqTheme.background.ignoresSafeArea())
            .navigationTitle("بطاقة اللاعب")
            .navigationBarTitleDisplayMode(.inline)
            .kcSheetToolbar { dismiss() }
            .task {
                // الأساس أولًا فيرتسم فورًا (بمحاولتين للفشل العابر)، ثم الإثراء بالتوازي بلا حجب
                let base = await kcRetrying { try await APIClient.shared.fetchKingsCupPlayer(playerId: playerId) }
                await MainActor.run { player = base; loading = false }
                guard base != nil else { return }
                async let x = APIClient.shared.fetchKingsCupPlayerExtras(playerId: playerId)
                async let f = APIClient.shared.fetchKingsCupPlayerForm(playerId: playerId)
                async let m = APIClient.shared.fetchKingsCupPlayerMarket(playerId: playerId)
                let xr = try? await x
                let fr = try? await f
                let mr = try? await m
                await MainActor.run { extras = xr; form = fr; market = mr }
            }
        }
        .sabqRTL()
    }

    private func isGoalkeeper(_ p: KcPlayerCard) -> Bool {
        p.position.contains("حراسة") || p.position.contains("حارس")
    }

    // MARK: الهوية

    private func identityHeader(_ p: KcPlayerCard) -> some View {
        HStack(spacing: SabqLayout.space16) {
            KcAvatar(url: p.photo, size: 76)
                .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))

            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(p.name)
                    .sabqText(SabqType.leadTitle).foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(2)
                if let full = p.fullName {
                    Text(full).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                }
                if let team = p.currentTeam {
                    HStack(spacing: SabqLayout.space8) {
                        WCRemoteImage(url: team.logo)
                            .padding(2).frame(width: 20, height: 20)
                            .background(Circle().fill(.white))
                        Text(team.name)
                            .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                    }
                }
                HStack(spacing: SabqLayout.space8) {
                    if !p.position.isEmpty { chip(p.position, fg: KcTheme.accent) }
                    if let number = p.number {
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "tshirt.fill").accessibilityHidden(true)
                            Text("\(number)").monospacedDigit()
                        }
                        .sabqText(SabqType.tag)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                        .background(Capsule().fill(SabqTheme.surfaceMuted))
                    }
                    if let nat = p.nationality, !nat.isEmpty {
                        chip(nat, fg: SabqTheme.textPrimary)
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func chip(_ text: String, fg: Color) -> some View {
        Text(text)
            .sabqText(SabqType.tag).foregroundStyle(fg)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
            .background(Capsule().fill(SabqTheme.surfaceMuted))
    }

    // MARK: الحقائق

    @ViewBuilder private func factTiles(_ p: KcPlayerCard) -> some View {
        let facts: [(value: String, label: String)] = [
            p.age.map { ("\($0) سنة", "العمر") },
            p.height.map { ("\($0) سم", "الطول") },
            p.weight.map { ("\($0) كجم", "الوزن") },
        ].compactMap { $0 }
        if !facts.isEmpty {
            HStack(spacing: SabqLayout.space8) {
                ForEach(facts, id: \.label) { fact in
                    KcFactTile(value: fact.value, label: fact.label)
                }
            }
        }
    }

    @ViewBuilder private func birthLine(_ p: KcPlayerCard) -> some View {
        let date = p.birthDate.flatMap { SabqFormatters.parseISO8601($0) }
        let parts = [date.map { WCFormat.dayRiyadh.string(from: $0) } ?? p.birthDate, p.birthPlace].compactMap { $0 }
        if !parts.isEmpty {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "birthday.cake").accessibilityHidden(true)
                Text(parts.joined(separator: " — "))
            }
            .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
        }
    }

    /// عنوان كتلة بأيقونة ملوّنة مجرّدة.
    private func heading(_ title: String, icon: String? = nil, tint: Color = KcTheme.accent) -> some View {
        HStack(spacing: SabqLayout.space8) {
            if let icon {
                Image(systemName: icon).font(SabqType.metaEmphasis.font).foregroundStyle(tint)
                    .accessibilityHidden(true)
            }
            Text(title)
                .sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
        }
    }

    private func statTiles(_ s: KcPlayerSeasonStats, isGoalkeeper: Bool) -> some View {
        HStack(spacing: SabqLayout.space8) {
            KcFactTile(value: "\(s.matches)", label: "مباريات")
            if isGoalkeeper {
                KcFactTile(value: "\(s.saves)", label: "تصديات")
                KcFactTile(value: "\(s.conceded)", label: "استقبل")
            } else {
                KcFactTile(value: "\(s.goals)", label: "أهداف")
                KcFactTile(value: "\(s.assists)", label: "صناعة")
            }
            KcFactTile(value: "\(s.minutes)", label: "دقائق")
        }
    }

    // MARK: أرقامه في كأس الملك — الكتلة المُبرزة

    private func kcHighlight(_ s: KcPlayerSeasonStats, isGoalkeeper: Bool) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(alignment: .firstTextBaseline) {
                heading("أرقامه في كأس الملك", icon: "trophy.fill", tint: KcTheme.gold)
                Spacer()
                Text(s.team.name)
                    .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
            }
            statTiles(s, isGoalkeeper: isGoalkeeper)
            if let rating = s.rating {
                HStack(spacing: SabqLayout.space8) {
                    Text("التقييم في البطولة")
                        .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                    Text(String(format: "%.2f", rating))
                        .font(SabqType.metaEmphasis.font.monospacedDigit())
                        .foregroundStyle(KcTheme.accent)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: القيمة السوقية

    private func marketCard(_ m: KcPlayerMarket, value: Double) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(alignment: .firstTextBaseline) {
                heading("القيمة السوقية", icon: "chart.line.uptrend.xyaxis")
                Spacer()
                Text(money(value, m.currency))
                    .font(SabqType.rowTitle.font.monospacedDigit())
                    .foregroundStyle(KcTheme.accent)
                    .environment(\.layoutDirection, .leftToRight)
            }
            if let peak = m.peak, peak > value {
                Text("الذروة: \(money(peak, m.currency))")
                    .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                    .environment(\.layoutDirection, .leftToRight)
            }
            if m.history.count > 1 { marketChart(m.history) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func money(_ v: Double, _ currency: String) -> String {
        if v >= 1_000_000 {
            let m = v / 1_000_000
            return m == m.rounded() ? "\(Int(m)) مليون \(currency)" : String(format: "%.1f مليون %@", m, currency)
        }
        if v >= 1_000 { return "\(Int(v / 1_000)) ألف \(currency)" }
        return "\(Int(v)) \(currency)"
    }

    private func marketChart(_ history: [KcMarketPoint]) -> some View {
        let sorted = history.sorted { $0.time < $1.time }
        let values = sorted.map(\.value)
        let minV = values.min() ?? 0
        let maxV = max(values.max() ?? 1, minV + 1)
        return GeometryReader { geo in
            Path { path in
                for (i, point) in sorted.enumerated() {
                    let x = geo.size.width * CGFloat(i) / CGFloat(max(1, sorted.count - 1))
                    let y = geo.size.height * (1 - CGFloat((point.value - minV) / (maxV - minV)))
                    if i == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
                }
            }
            .stroke(KcTheme.accent, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        }
        .frame(height: 56)
        .environment(\.layoutDirection, .leftToRight)
    }

    // MARK: الفورمة الأخيرة

    private func formCard(_ form: KcPlayerForm) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            heading("الفورمة الأخيرة", icon: "flame.fill", tint: KcTheme.gold)
                .padding(.bottom, SabqLayout.space4)
            ForEach(Array(form.matches.prefix(6).enumerated()), id: \.element.id) { index, m in
                if index > 0 { KcRowSeparator() }
                formRow(m)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func formRow(_ m: KcFormMatch) -> some View {
        HStack(spacing: SabqLayout.space8) {
            resultBadge(m.result)
            if !m.opponentLogo.isEmpty {
                WCRemoteImage(url: m.opponentLogo)
                    .padding(2).frame(width: 24, height: 24)
                    .background(Circle().fill(.white))
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(m.opponent)
                    .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                Text(m.league)
                    .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
            }
            Spacer(minLength: SabqLayout.space4)
            Text("\(m.scoreAgainst) - \(m.scoreFor)")
                .font(SabqType.metaEmphasis.font.monospacedDigit()).foregroundStyle(SabqTheme.textPrimary)
                .environment(\.layoutDirection, .leftToRight)
            if m.goals > 0 {
                Text("⚽ \(m.goals)").sabqText(SabqType.tag).foregroundStyle(SabqTheme.textPrimary)
            }
            if let rating = m.rating {
                Text(String(format: "%.1f", rating))
                    .font(SabqType.tag.font.monospacedDigit())
                    .foregroundStyle(.white)
                    .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.small).fill(KcTheme.ratingFill(rating)))
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
        .padding(.vertical, SabqLayout.space12)
    }

    private func resultBadge(_ result: String) -> some View {
        let (label, color): (String, Color) = switch result {
        case "W": ("ف", KcTheme.accentFill)
        case "L": ("خ", KcTheme.liveFill)
        default: ("ت", KcTheme.ratingFill(6))
        }
        return Text(label)
            .sabqText(SabqType.tag).foregroundStyle(.white)
            .frame(width: 24, height: 24)
            .background(Circle().fill(color))
    }

    // MARK: أرقام بقية البطولات

    @ViewBuilder private func otherSeasonStats(_ p: KcPlayerCard) -> some View {
        let others = p.seasonStats.filter { !$0.isKingsCup }
        if !others.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                heading("أرقام الموسم في بقية البطولات")
                    .padding(.bottom, SabqLayout.space4)
                ForEach(Array(others.enumerated()), id: \.element.id) { index, s in
                    if index > 0 { KcRowSeparator() }
                    VStack(alignment: .leading, spacing: SabqLayout.space8) {
                        HStack(spacing: SabqLayout.space8) {
                            WCRemoteImage(url: s.team.logo).frame(width: 16, height: 16)
                            Text(s.team.name).sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                            Text("· \(s.competition)").sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                            Spacer(minLength: 0)
                            if let rating = s.rating {
                                Text(String(format: "%.2f", rating))
                                    .font(SabqType.metaEmphasis.font.monospacedDigit())
                                    .foregroundStyle(KcTheme.accent)
                                    .environment(\.layoutDirection, .leftToRight)
                            }
                        }
                        statTiles(s, isGoalkeeper: isGoalkeeper(p))
                    }
                    .padding(.vertical, SabqLayout.space12)
                }
            }
        }
    }

    // MARK: المسيرة

    private func careerSection(_ career: [KcPlayerCareerStop]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            heading("المسيرة")
                .padding(.bottom, SabqLayout.space4)
            ForEach(Array(career.enumerated()), id: \.element.id) { index, stop in
                if index > 0 { KcRowSeparator() }
                HStack(spacing: SabqLayout.space12) {
                    WCRemoteImage(url: stop.logo)
                        .padding(3).frame(width: 28, height: 28)
                        .background(Circle().fill(stop.logo.isEmpty ? SabqTheme.surfaceMuted : .white))
                    Text(stop.team)
                        .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(1)
                    Spacer(minLength: SabqLayout.space4)
                    Text(seasonsRange(stop.seasons))
                        .font(SabqType.meta.font.monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .padding(.vertical, SabqLayout.space12)
            }
        }
    }

    private func seasonsRange(_ seasons: [Int]) -> String {
        guard let minS = seasons.min(), let maxS = seasons.max() else { return "" }
        return minS == maxS ? String(minS) : "\(minS)–\(maxS)"
    }

    // MARK: الانتقالات

    private func transfersSection(_ transfers: [KcPlayerTransfer]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            heading("الانتقالات")
                .padding(.bottom, SabqLayout.space4)
            ForEach(Array(transfers.prefix(6).enumerated()), id: \.element.id) { index, t in
                if index > 0 { KcRowSeparator() }
                HStack(spacing: SabqLayout.space8) {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: SabqLayout.space4) {
                            Text(t.from).lineLimit(1)
                            Image(systemName: "arrow.left").font(SabqType.tag.font).accessibilityHidden(true)
                            Text(t.to).lineLimit(1)
                        }
                        .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                        Text(String(t.date.prefix(10)))
                            .font(SabqType.tag.font.monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    Spacer(minLength: SabqLayout.space4)
                    if !t.type.isEmpty {
                        Text(t.type)
                            .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                            .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                            .background(Capsule().fill(SabqTheme.surfaceMuted))
                    }
                }
                .padding(.vertical, SabqLayout.space12)
            }
        }
    }

    // MARK: الإصابات

    private func injuriesSection(_ injuries: [KcPlayerInjury]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            heading("سجل الإصابات", icon: "cross.case.fill", tint: KcTheme.liveText)
                .padding(.bottom, SabqLayout.space4)
            ForEach(Array(injuries.prefix(6).enumerated()), id: \.element.id) { index, injury in
                if index > 0 { KcRowSeparator() }
                VStack(alignment: .leading, spacing: 0) {
                    Text(injury.reason.isEmpty ? injury.type : injury.reason)
                        .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(1)
                    Text([injury.competition, String(injury.date.prefix(10))].filter { !$0.isEmpty }.joined(separator: " · "))
                        .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, SabqLayout.space12)
            }
        }
    }

    // MARK: الألقاب

    private func trophiesSection(_ trophies: [KcPlayerTrophy]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            heading("الألقاب", icon: "trophy.fill", tint: KcTheme.gold)
                .padding(.bottom, SabqLayout.space4)
            ForEach(Array(trophies.prefix(10).enumerated()), id: \.element.id) { index, t in
                if index > 0 { KcRowSeparator() }
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "trophy.fill")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(t.winner ? KcTheme.gold : SabqTheme.outline)
                        .accessibilityHidden(true)
                    Text(t.competition)
                        .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(1)
                    Spacer(minLength: SabqLayout.space4)
                    if !t.place.isEmpty {
                        Text(t.place)
                            .sabqText(SabqType.tag)
                            .foregroundStyle(t.winner ? KcTheme.accent : SabqTheme.textSecondary)
                            .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                            .background(Capsule().fill(SabqTheme.surfaceMuted))
                    }
                    Text(t.season)
                        .font(SabqType.tag.font.monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .padding(.vertical, SabqLayout.space12)
            }
        }
    }
}
