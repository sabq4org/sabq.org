import SwiftUI

// MARK: - بطاقة لاعب كأس الملك (KcPlayerSheet)
//
// مرآة WCPlayerSheet بسياق الكأس: «أرقامه في كأس الملك» مُبرزة بالذهبي أولًا،
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
                    KcLoading().padding(.top, 40)
                } else if let player {
                    VStack(alignment: .leading, spacing: 18) {
                        identityHeader(player)
                        factTiles(player)
                        birthLine(player)
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
                    .padding(16)
                } else {
                    Text("ملف اللاعب غير متاح حاليًا")
                        .font(SabqFonts.app(size: 13)).foregroundStyle(WCTheme.onDarkDim)
                        .frame(maxWidth: .infinity).padding(.top, 50)
                }
            }
            .background(WCTheme.sectionBackground.ignoresSafeArea())
            .navigationTitle("بطاقة اللاعب")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(WCTheme.stadiumTop, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white) }
                }
            }
            .task {
                // الأساس أولًا فيرتسم فورًا، ثم الإثراء بالتوازي بلا حجب
                let base = try? await APIClient.shared.fetchKingsCupPlayer(playerId: playerId)
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
        HStack(spacing: 14) {
            Group {
                if p.photo.isEmpty {
                    Text(String(p.name.prefix(2)))
                        .font(SabqFonts.app(size: 22, weight: .black)).foregroundStyle(WCTheme.onDarkDim)
                        .frame(width: 76, height: 76).background(Circle().fill(WCTheme.chipFill))
                } else {
                    WCRemoteImage(url: p.photo, contentMode: .fill)
                        .frame(width: 76, height: 76).clipShape(Circle())
                }
            }
            .overlay(Circle().stroke(WCTheme.gold, lineWidth: 3))

            VStack(alignment: .leading, spacing: 4) {
                Text(p.name)
                    .font(SabqFonts.headline(size: 20)).foregroundStyle(WCTheme.onDark)
                    .lineLimit(2)
                if let full = p.fullName {
                    Text(full).font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                }
                if let team = p.currentTeam {
                    HStack(spacing: 6) {
                        WCRemoteImage(url: team.logo)
                            .padding(2).frame(width: 20, height: 20)
                            .background(Circle().fill(.white))
                        Text(team.name)
                            .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDark)
                    }
                }
                HStack(spacing: 6) {
                    if !p.position.isEmpty { chip(p.position, fill: WCTheme.emerald.opacity(0.15), fg: WCTheme.emeraldDeep) }
                    if let number = p.number {
                        HStack(spacing: 3) {
                            Image(systemName: "tshirt.fill").font(SabqFonts.app(size: 9))
                            Text("\(number)").font(SabqFonts.app(size: 11, weight: .black).monospacedDigit())
                        }
                        .foregroundStyle(WCTheme.onDark)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Capsule().fill(WCTheme.chipFill))
                    }
                    if let nat = p.nationality, !nat.isEmpty {
                        chip(nat, fill: WCTheme.chipFill, fg: WCTheme.onDark)
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func chip(_ text: String, fill: Color, fg: Color) -> some View {
        Text(text)
            .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(fg)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(fill))
    }

    // MARK: الحقائق

    @ViewBuilder private func factTiles(_ p: KcPlayerCard) -> some View {
        let facts: [(value: String, label: String)] = [
            p.age.map { ("\($0) سنة", "العمر") },
            p.height.map { ("\($0) سم", "الطول") },
            p.weight.map { ("\($0) كجم", "الوزن") },
        ].compactMap { $0 }
        if !facts.isEmpty {
            HStack(spacing: 8) {
                ForEach(facts, id: \.label) { fact in
                    WCFactTile(value: fact.value, label: fact.label)
                }
            }
        }
    }

    @ViewBuilder private func birthLine(_ p: KcPlayerCard) -> some View {
        let date = p.birthDate.flatMap { SabqFormatters.parseISO8601($0) }
        let parts = [date.map { WCFormat.dayRiyadh.string(from: $0) } ?? p.birthDate, p.birthPlace].compactMap { $0 }
        if !parts.isEmpty {
            HStack(spacing: 6) {
                Image(systemName: "birthday.cake").font(SabqFonts.app(size: 11))
                Text(parts.joined(separator: " — "))
            }
            .font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
        }
    }

    // MARK: أرقامه في كأس الملك — البطاقة الذهبية المُبرزة

    private func kcHighlight(_ s: KcPlayerSeasonStats, isGoalkeeper: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "trophy.fill").font(.system(size: 13)).foregroundStyle(WCTheme.gold)
                Text("أرقامه في كأس الملك")
                    .font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(WCTheme.onDark)
                Spacer()
                Text(s.team.name)
                    .font(SabqFonts.app(size: 10, weight: .semibold)).foregroundStyle(WCTheme.onDarkDim)
            }
            HStack(spacing: 8) {
                WCFactTile(value: "\(s.matches)", label: "مباريات")
                if isGoalkeeper {
                    WCFactTile(value: "\(s.saves)", label: "تصديات")
                    WCFactTile(value: "\(s.conceded)", label: "استقبل")
                } else {
                    WCFactTile(value: "\(s.goals)", label: "أهداف")
                    WCFactTile(value: "\(s.assists)", label: "صناعة")
                }
                WCFactTile(value: "\(s.minutes)", label: "دقائق")
            }
            if let rating = s.rating {
                HStack(spacing: 6) {
                    Text("التقييم في البطولة")
                        .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                    Text(String(format: "%.2f", rating))
                        .font(SabqFonts.app(size: 13, weight: .black).monospacedDigit())
                        .foregroundStyle(WCTheme.gold)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(WCTheme.gold.opacity(0.08)))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(WCTheme.gold.opacity(0.35), lineWidth: 1))
    }

    // MARK: القيمة السوقية

    private func marketCard(_ m: KcPlayerMarket, value: Double) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: 13, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                Text("القيمة السوقية")
                    .font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(WCTheme.onDark)
                Spacer()
                Text(money(value, m.currency))
                    .font(SabqFonts.app(size: 16, weight: .black).monospacedDigit())
                    .foregroundStyle(WCTheme.emeraldDeep)
                    .environment(\.layoutDirection, .leftToRight)
            }
            if let peak = m.peak, peak > value {
                Text("الذروة: \(money(peak, m.currency))")
                    .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                    .environment(\.layoutDirection, .leftToRight)
            }
            if m.history.count > 1 { marketChart(m.history) }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
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
            .stroke(WCTheme.emeraldDeep, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        }
        .frame(height: 56)
        .environment(\.layoutDirection, .leftToRight)
    }

    // MARK: الفورمة الأخيرة

    private func formCard(_ form: KcPlayerForm) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "flame.fill").font(.system(size: 13)).foregroundStyle(WCTheme.gold)
                Text("الفورمة الأخيرة")
                    .font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(WCTheme.onDark)
            }
            ForEach(form.matches.prefix(6)) { m in formRow(m) }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }

    private func formRow(_ m: KcFormMatch) -> some View {
        HStack(spacing: 8) {
            resultBadge(m.result)
            if !m.opponentLogo.isEmpty {
                WCRemoteImage(url: m.opponentLogo)
                    .padding(2).frame(width: 22, height: 22)
                    .background(Circle().fill(.white))
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(m.opponent)
                    .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                Text(m.league)
                    .font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
            }
            Spacer(minLength: 4)
            Text("\(m.scoreAgainst) - \(m.scoreFor)")
                .font(SabqFonts.app(size: 12, weight: .black).monospacedDigit()).foregroundStyle(WCTheme.onDark)
                .environment(\.layoutDirection, .leftToRight)
            if m.goals > 0 {
                Text("⚽ \(m.goals)").font(SabqFonts.app(size: 10))
            }
            if let rating = m.rating {
                Text(String(format: "%.1f", rating))
                    .font(SabqFonts.app(size: 11, weight: .black).monospacedDigit())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: 6).fill(rating >= 7 ? WCTheme.leaf : (rating >= 6 ? WCTheme.gold : WCTheme.liveRed)))
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(WCTheme.chipFill))
    }

    private func resultBadge(_ result: String) -> some View {
        let (label, color): (String, Color) = switch result {
        case "W": ("ف", WCTheme.emeraldDeep)
        case "L": ("خ", WCTheme.liveRed)
        default: ("ت", WCTheme.gold)
        }
        return Text(label)
            .font(SabqFonts.app(size: 11, weight: .black)).foregroundStyle(.white)
            .frame(width: 22, height: 22)
            .background(Circle().fill(color))
    }

    // MARK: أرقام بقية البطولات

    @ViewBuilder private func otherSeasonStats(_ p: KcPlayerCard) -> some View {
        let others = p.seasonStats.filter { !$0.isKingsCup }
        if !others.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("أرقام الموسم في بقية البطولات")
                    .font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(WCTheme.emeraldDeep)
                ForEach(others) { s in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            WCRemoteImage(url: s.team.logo).frame(width: 16, height: 16)
                            Text(s.team.name).font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDark)
                            Text("· \(s.competition)").font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                            Spacer(minLength: 0)
                            if let rating = s.rating {
                                Text(String(format: "%.2f", rating))
                                    .font(SabqFonts.app(size: 11, weight: .black).monospacedDigit())
                                    .foregroundStyle(WCTheme.emeraldDeep)
                                    .environment(\.layoutDirection, .leftToRight)
                            }
                        }
                        HStack(spacing: 8) {
                            WCFactTile(value: "\(s.matches)", label: "مباريات")
                            if isGoalkeeper(p) {
                                WCFactTile(value: "\(s.saves)", label: "تصديات")
                                WCFactTile(value: "\(s.conceded)", label: "استقبل")
                            } else {
                                WCFactTile(value: "\(s.goals)", label: "أهداف")
                                WCFactTile(value: "\(s.assists)", label: "صناعة")
                            }
                            WCFactTile(value: "\(s.minutes)", label: "دقائق")
                        }
                    }
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
                }
            }
        }
    }

    // MARK: المسيرة

    private func careerSection(_ career: [KcPlayerCareerStop]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("المسيرة")
                .font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(WCTheme.emeraldDeep)
            ForEach(career) { stop in
                HStack(spacing: 10) {
                    if stop.logo.isEmpty {
                        Circle().fill(WCTheme.chipFill).frame(width: 28, height: 28)
                    } else {
                        WCRemoteImage(url: stop.logo)
                            .padding(3).frame(width: 28, height: 28)
                            .background(Circle().fill(.white))
                    }
                    Text(stop.team)
                        .font(SabqFonts.app(size: 13, weight: .bold)).foregroundStyle(WCTheme.onDark)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(seasonsRange(stop.seasons))
                        .font(SabqFonts.app(size: 11).monospacedDigit()).foregroundStyle(WCTheme.onDarkDim)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .padding(.horizontal, 10).padding(.vertical, 7)
                .wcElevatedCard(cornerRadius: 12)
            }
        }
    }

    private func seasonsRange(_ seasons: [Int]) -> String {
        guard let minS = seasons.min(), let maxS = seasons.max() else { return "" }
        return minS == maxS ? String(minS) : "\(minS)–\(maxS)"
    }

    // MARK: الانتقالات

    private func transfersSection(_ transfers: [KcPlayerTransfer]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("الانتقالات")
                .font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(WCTheme.emeraldDeep)
            ForEach(transfers.prefix(6)) { t in
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 4) {
                            Text(t.from).lineLimit(1)
                            Image(systemName: "arrow.left").font(.system(size: 9, weight: .bold))
                            Text(t.to).lineLimit(1)
                        }
                        .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDark)
                        Text(String(t.date.prefix(10)))
                            .font(SabqFonts.app(size: 9).monospacedDigit()).foregroundStyle(WCTheme.onDarkDim)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    Spacer(minLength: 4)
                    if !t.type.isEmpty {
                        Text(t.type)
                            .font(SabqFonts.app(size: 9, weight: .semibold)).foregroundStyle(WCTheme.onDarkDim)
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(Capsule().fill(WCTheme.chipFill))
                    }
                }
                .padding(.horizontal, 10).padding(.vertical, 7)
                .wcElevatedCard(cornerRadius: 12)
            }
        }
    }

    // MARK: الإصابات

    private func injuriesSection(_ injuries: [KcPlayerInjury]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "cross.case.fill").font(.system(size: 12)).foregroundStyle(WCTheme.liveRed)
                Text("سجل الإصابات")
                    .font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(WCTheme.emeraldDeep)
            }
            ForEach(injuries.prefix(6)) { injury in
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(injury.reason.isEmpty ? injury.type : injury.reason)
                            .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDark)
                            .lineLimit(1)
                        Text([injury.competition, String(injury.date.prefix(10))].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 10).padding(.vertical, 7)
                .wcElevatedCard(cornerRadius: 12)
            }
        }
    }

    // MARK: الألقاب

    private func trophiesSection(_ trophies: [KcPlayerTrophy]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "trophy.fill").font(.system(size: 12)).foregroundStyle(WCTheme.gold)
                Text("الألقاب")
                    .font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(WCTheme.emeraldDeep)
            }
            ForEach(trophies.prefix(10)) { t in
                HStack(spacing: 8) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(t.winner ? WCTheme.gold : WCTheme.onDarkDim.opacity(0.5))
                    Text(t.competition)
                        .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    if !t.place.isEmpty {
                        Text(t.place)
                            .font(SabqFonts.app(size: 9, weight: .bold))
                            .foregroundStyle(t.winner ? WCTheme.gold : WCTheme.onDarkDim)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Capsule().fill(t.winner ? WCTheme.gold.opacity(0.15) : WCTheme.chipFill))
                    }
                    Text(t.season)
                        .font(SabqFonts.app(size: 10).monospacedDigit()).foregroundStyle(WCTheme.onDarkDim)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(WCTheme.chipFill))
            }
        }
    }
}
