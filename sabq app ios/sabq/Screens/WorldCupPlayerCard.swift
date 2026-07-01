import SwiftUI
import Charts

// MARK: - بطاقة اللاعب الشاملة
//
// تُفتح بالضغط على أي لاعب في قسم المونديال (قائمة المنتخب، السباقات،
// التشكيلات، التقييمات، أحداث المباراة، شريط الأخضر). تجمع كل ما يوفره
// المزود: الملف الشخصي، المسيرة، الألقاب، وأرقام البطولة فور اعتمادها.
// تكافؤ مع PlayerCardDialog على الويب وبثيم الملعب الليلي للقسم.

/// هوية فتح بطاقة لاعب عبر .sheet(item:) — يتجاهل المعرّفات غير الصالحة (0).
nonisolated struct WCPlayerSelection: Identifiable {
    let id: Int

    /// nil عندما لا يملك المصدر معرّفًا صالحًا (تجميع الأحداث قبل لوحات المزود)
    init?(_ playerId: Int?) {
        guard let playerId, playerId > 0 else { return nil }
        self.id = playerId
    }
}

struct WCPlayerSheet: View {
    let playerId: Int
    @Environment(\.dismiss) private var dismiss

    @State private var player: WCPlayerCard?
    @State private var loading = true

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                if loading {
                    WCLoading().padding(.top, 40)
                } else if let player {
                    VStack(alignment: .leading, spacing: 18) {
                        identityHeader(player)
                        factTiles(player)
                        birthLine(player)
                        WCPlayerMarketSection(playerId: playerId)
                        if let stats = player.stats {
                            WCPlayerStatsGrid(stats: stats, isGoalkeeper: player.positionEn == "Goalkeeper")
                        }
                        WCPlayerFormSection(playerId: playerId)
                        if !player.career.isEmpty {
                            careerSection(player.career)
                        }
                        if !player.trophies.isEmpty {
                            trophiesSection(player.trophies)
                        }
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
                if let r = try? await APIClient.shared.fetchWorldCupPlayer(playerId: playerId) {
                    await MainActor.run { player = r; loading = false }
                } else { await MainActor.run { loading = false } }
            }
        }
        .sabqRTL()
    }

    // MARK: الهوية

    private func identityHeader(_ p: WCPlayerCard) -> some View {
        HStack(spacing: 14) {
            photo(p)
            VStack(alignment: .leading, spacing: 4) {
                Text(p.name)
                    .font(SabqFonts.headline(size: 20)).foregroundStyle(WCTheme.onDark)
                    .lineLimit(2)
                if let full = p.fullName {
                    Text(full).font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                }
                HStack(spacing: 6) {
                    if !p.position.isEmpty {
                        chip(p.position, fill: WCTheme.emerald.opacity(0.15), fg: WCTheme.emeraldDeep)
                    }
                    if let number = p.number {
                        HStack(spacing: 3) {
                            Image(systemName: "tshirt.fill").font(SabqFonts.app(size: 9))
                            Text("\(number)").font(SabqFonts.app(size: 11, weight: .black).monospacedDigit())
                        }
                        .foregroundStyle(WCTheme.onDark)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Capsule().fill(WCTheme.chipFill))
                    }
                    if p.injury != nil {
                        chip("مصاب حاليًا", fill: WCTheme.gold.opacity(0.2), fg: WCTheme.gold)
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func photo(_ p: WCPlayerCard) -> some View {
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
        .overlay(Circle().stroke(WCTheme.emeraldDeep, lineWidth: 3))
    }

    private func chip(_ text: String, fill: Color, fg: Color) -> some View {
        Text(text)
            .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(fg)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(fill))
    }

    // MARK: شريط الحقائق

    @ViewBuilder private func factTiles(_ p: WCPlayerCard) -> some View {
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

    @ViewBuilder private func birthLine(_ p: WCPlayerCard) -> some View {
        let date = p.birthDate.flatMap { SabqFormatters.parseISO8601($0) ?? Self.birthParser.date(from: $0) }
        let parts = [date.map { Self.birthFormatter.string(from: $0) }, p.birthPlace].compactMap { $0 }
        if !parts.isEmpty {
            HStack(spacing: 6) {
                Image(systemName: "birthday.cake").font(SabqFonts.app(size: 11))
                Text(parts.joined(separator: " — "))
            }
            .font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
        }
    }

    /// تاريخ الميلاد يصل "yyyy-MM-dd" بلا وقت — ISO8601 الكامل لا يحلّله
    private static let birthParser: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// "10 مايو 2000" — ca-gregory ضروري: ar_SA يفترض الهجري افتراضيًا
    private static let birthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA-u-ca-gregory-nu-latn")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "d MMMM yyyy"
        return f
    }()

    // MARK: المسيرة

    private func careerSection(_ career: [WCPlayerCareerStop]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle(icon: "clock.arrow.circlepath", text: "المسيرة")
            ForEach(career) { stop in
                HStack(spacing: 10) {
                    WCRemoteImage(url: stop.logo)
                        .padding(4)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(.white))
                    Text(stop.team).font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                    Spacer()
                    if !stop.seasons.isEmpty {
                        Text(stop.seasonsLabel)
                            .font(SabqFonts.app(size: 12, weight: .semibold).monospacedDigit())
                            .foregroundStyle(WCTheme.onDarkDim)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
            }
        }
    }

    // MARK: الألقاب

    private func trophiesSection(_ trophies: [WCPlayerTrophy]) -> some View {
        let titles = trophies.filter(\.winner).count
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                sectionTitle(icon: "trophy.fill", text: "الألقاب")
                if titles > 0 {
                    Text("\(titles) بطولة")
                        .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Capsule().fill(WCTheme.chipFill))
                }
            }
            ForEach(trophies) { trophy in
                HStack(spacing: 10) {
                    Image(systemName: "trophy.fill")
                        .font(SabqFonts.app(size: 13))
                        .foregroundStyle(trophy.winner ? WCTheme.gold : WCTheme.onDarkDim.opacity(0.5))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(trophy.competition).font(SabqFonts.app(size: 13, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                        if !trophy.country.isEmpty {
                            Text(trophy.country).font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                        }
                    }
                    Spacer()
                    Text(trophy.place)
                        .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(trophy.winner ? .white : WCTheme.onDarkDim)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Capsule().fill(trophy.winner ? WCTheme.emeraldDeep : WCTheme.chipFill))
                    Text(trophy.season)
                        .font(SabqFonts.app(size: 11, weight: .semibold).monospacedDigit())
                        .foregroundStyle(WCTheme.onDarkDim)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
            }
        }
    }

    private func sectionTitle(icon: String, text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(WCTheme.emerald)
            Text(text).font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.emerald)
        }
    }
}

// MARK: - أرقام البطولة (شبكة بلاطات حسب المركز)

struct WCPlayerStatsGrid: View {
    let stats: WCPlayerTournamentStats
    let isGoalkeeper: Bool

    private var tiles: [(label: String, value: String)] {
        // البلاطات تُبنى حسب المركز — لا «تصديات» لمهاجم ولا «مراوغات» لحارس
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
            t.append(("مراوغات ناجحة", "\(stats.dribblesSuccess)/\(stats.dribblesAttempts)"))
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
                Image(systemName: "chart.bar.fill").font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(WCTheme.emerald)
                Text("أرقامه في مونديال 2026").font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.emerald)
                Spacer()
                if let rating = stats.rating {
                    Text(String(format: "%.1f", rating))
                        .font(SabqFonts.app(size: 12, weight: .black).monospacedDigit())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(RoundedRectangle(cornerRadius: 8).fill(ratingColor(rating)))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(tiles, id: \.label) { tile in
                    WCFactTile(value: tile.value, label: tile.label)
                }
            }
        }
    }

    private func ratingColor(_ r: Double) -> Color {
        if r >= 8 { return WCTheme.emeraldDeep }
        if r >= 7 { return WCTheme.leaf }
        if r >= 6 { return WCTheme.gold }
        return WCTheme.liveRed
    }
}

/// بلاطة حقيقة: قيمة كبيرة فوق وصف صغير.
struct WCFactTile: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(SabqFonts.app(size: 15, weight: .black).monospacedDigit())
                .foregroundStyle(WCTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(label)
                .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9).padding(.horizontal, 6)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }
}

// MARK: - الفورمة الأخيرة + xG (/world-cup/player/:id/form)
//
// تكافؤ مع قسم #435 على الويب: آخر ٥ مباريات للاعب — شريط نتائج W/D/L ملوّن،
// رسم أعمدة xG (SwiftUI Charts، يظهر فقط حين يوفّر المزود xG)، ثم صفوف لكل
// مباراة (الخصم/النتيجة/أهداف/تقييم). نقطة منفصلة فتُجلب ذاتيًا؛ تُخفى بهدوء
// إن رجعت available=false أو فشل النداء (503 قبل تفعيل SportMonks).

struct WCPlayerFormSection: View {
    let playerId: Int
    @State private var form: WCPlayerForm?
    @State private var loaded = false

    private var matches: [WCFormMatch] { form?.matches ?? [] }
    private var hasXg: Bool { matches.contains { $0.xg != nil } }

    var body: some View {
        // ZStack+Color.clear وليس Group+EmptyView: الحالة الفارغة تُسقط .task فلا يبدأ الجلب أبدًا
        ZStack {
            Color.clear.frame(height: 0)
            if let form, form.available, !form.matches.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    header
                    resultsStrip
                    if hasXg { xgChart }
                    VStack(spacing: 6) {
                        ForEach(matches) { m in matchRow(m) }
                    }
                }
            }
        }
        .task(id: playerId) {
            guard !loaded else { return }
            loaded = true
            form = try? await APIClient.shared.fetchWorldCupPlayerForm(playerId: playerId)
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: "chart.line.uptrend.xyaxis")
                .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(WCTheme.emerald)
            Text(hasXg ? "الفورمة الأخيرة · xG" : "الفورمة الأخيرة")
                .font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.emerald)
            Spacer()
            Text("آخر \(matches.count)")
                .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
                .padding(.horizontal, 7).padding(.vertical, 2)
                .background(Capsule().fill(WCTheme.chipFill))
                .environment(\.layoutDirection, .leftToRight)
        }
    }

    // شريط نتائج W/D/L — الأحدث يمينًا (RTL يدوي معكوس)
    private var resultsStrip: some View {
        HStack(spacing: 6) {
            ForEach(Array(matches.enumerated().reversed()), id: \.offset) { _, m in
                Text(resultAr(m.result))
                    .font(SabqFonts.app(size: 11, weight: .black))
                    .foregroundStyle(.white)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(resultColor(m.result)))
            }
            Spacer(minLength: 0)
        }
    }

    private var xgChart: some View {
        Chart(matches) { m in
            BarMark(
                x: .value("الخصم", m.opponent),
                y: .value("xG", m.xg ?? 0)
            )
            .foregroundStyle(WCTheme.emerald.gradient)
            .cornerRadius(3)
        }
        .chartYAxis {
            AxisMarks(position: .leading) { value in
                AxisGridLine().foregroundStyle(WCTheme.cardStroke)
                AxisValueLabel() {
                    if let d = value.as(Double.self) {
                        Text(String(format: "%.1f", d))
                            .font(SabqFonts.app(size: 8)).foregroundStyle(WCTheme.onDarkDim)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks { value in
                AxisValueLabel() {
                    if let s = value.as(String.self) {
                        Text(s).font(SabqFonts.app(size: 7))
                            .foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                    }
                }
            }
        }
        .frame(height: 96)
        .padding(.top, 2)
    }

    private func matchRow(_ m: WCFormMatch) -> some View {
        HStack(spacing: 10) {
            // شارة النتيجة
            Text(resultAr(m.result))
                .font(SabqFonts.app(size: 11, weight: .black)).foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(Circle().fill(resultColor(m.result)))
            // شعار الخصم + اسمه
            if !m.opponentLogo.isEmpty {
                WCRemoteImage(url: m.opponentLogo)
                    .padding(2).frame(width: 24, height: 24)
                    .background(Circle().fill(.white))
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(m.opponent.isEmpty ? "—" : m.opponent)
                    .font(SabqFonts.app(size: 13, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                HStack(spacing: 6) {
                    Text(m.homeAway == "home" ? "أرضه" : "خارج أرضه")
                        .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                    if !m.league.isEmpty {
                        Text("· \(m.league)")
                            .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 4)
            // أرقام: النتيجة + xG + الأهداف + التقييم
            HStack(spacing: 8) {
                if let xg = m.xg {
                    statPill(label: "xG", value: String(format: "%.1f", xg), fg: WCTheme.emerald)
                }
                if m.goals > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "soccerball").font(.system(size: 9)).foregroundStyle(WCTheme.emeraldDeep)
                        Text("\(m.goals)").font(SabqFonts.app(size: 11, weight: .black).monospacedDigit())
                            .foregroundStyle(WCTheme.onDark)
                    }
                }
                Text("\(m.scoreFor)-\(m.scoreAgainst)")
                    .font(SabqFonts.app(size: 12, weight: .black).monospacedDigit())
                    .foregroundStyle(WCTheme.onDark)
                    .environment(\.layoutDirection, .leftToRight)
                if let r = m.rating {
                    Text(String(format: "%.1f", r))
                        .font(SabqFonts.app(size: 11, weight: .black).monospacedDigit())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 7).fill(ratingColor(r)))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
    }

    private func statPill(label: String, value: String, fg: Color) -> some View {
        HStack(spacing: 3) {
            Text(label).font(SabqFonts.app(size: 8, weight: .bold)).foregroundStyle(fg.opacity(0.8))
            Text(value).font(SabqFonts.app(size: 11, weight: .black).monospacedDigit()).foregroundStyle(fg)
                .environment(\.layoutDirection, .leftToRight)
        }
        .padding(.horizontal, 6).padding(.vertical, 2)
        .background(Capsule().fill(fg.opacity(0.12)))
    }

    private func resultAr(_ r: String) -> String {
        switch r { case "W": return "ف"; case "L": return "خ"; default: return "ت" }
    }
    private func resultColor(_ r: String) -> Color {
        switch r { case "W": return WCTheme.emeraldDeep; case "L": return WCTheme.liveRed; default: return WCTheme.gold }
    }
    private func ratingColor(_ r: Double) -> Color {
        if r >= 8 { return WCTheme.emeraldDeep }
        if r >= 7 { return WCTheme.leaf }
        if r >= 6 { return WCTheme.gold }
        return WCTheme.liveRed
    }
}

// MARK: - القيمة السوقية + مخطّط تاريخها (/world-cup/player/:id/market)
//
// تكافؤ مع PlayerCardDialog على الويب: القيمة الحاليّة بارزة + مخطّط خطّي
// لتطوّرها عبر السنوات (TheSports). نقطة منفصلة تُجلب ذاتيًا وتُخفى بهدوء
// إن رجعت available=false (503 قبل تفعيل TheSports).

struct WCPlayerMarketSection: View {
    let playerId: Int
    @State private var market: WCPlayerMarket?
    @State private var loaded = false

    private var history: [WCMarketPoint] { market?.history ?? [] }

    // القيمة الحالية: القيمة المعتمدة، وإلا آخر نقطة في السجل (مطابقة للويب)
    private var current: Double? { market?.marketValue ?? history.last?.value }

    var body: some View {
        // ZStack+Color.clear وليس Group+EmptyView: الحالة الفارغة تُسقط .task فلا يبدأ الجلب أبدًا
        ZStack {
            Color.clear.frame(height: 0)
            if let m = market, m.available, (current != nil || history.count >= 2) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(WCTheme.gold)
                        Text("القيمة السوقية").font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.gold)
                        Spacer()
                        if let v = current {
                            Text(Self.format(v, currency: m.currency))
                                .font(SabqFonts.app(size: 15, weight: .black).monospacedDigit())
                                .foregroundStyle(WCTheme.onDark)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                    if history.count >= 2 { chart(history, currency: m.currency) }
                }
                .padding(14)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WCTheme.card))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(WCTheme.gold.opacity(0.25), lineWidth: 1))
            }
        }
        .task(id: playerId) {
            guard !loaded else { return }
            loaded = true
            market = try? await APIClient.shared.fetchWorldCupPlayerMarket(playerId: playerId)
        }
    }

    private func chart(_ points: [WCMarketPoint], currency: String) -> some View {
        Chart(points) { p in
            LineMark(x: .value("التاريخ", p.date), y: .value("القيمة", p.value))
                .foregroundStyle(WCTheme.gold)
                .interpolationMethod(.monotone)
            AreaMark(x: .value("التاريخ", p.date), y: .value("القيمة", p.value))
                .foregroundStyle(WCTheme.gold.opacity(0.15))
                .interpolationMethod(.monotone)
        }
        .chartYAxis {
            AxisMarks(position: .leading) { value in
                AxisGridLine().foregroundStyle(WCTheme.cardStroke)
                AxisValueLabel {
                    if let d = value.as(Double.self) {
                        Text(Self.compact(d)).font(SabqFonts.app(size: 8)).foregroundStyle(WCTheme.onDarkDim)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { value in
                AxisValueLabel {
                    if let d = value.as(Date.self) {
                        Text(Self.year.string(from: d)).font(SabqFonts.app(size: 8)).foregroundStyle(WCTheme.onDarkDim)
                    }
                }
            }
        }
        .frame(height: 120)
        .environment(\.layoutDirection, .leftToRight)
    }

    // "80.0 مليون €" / "750 ألف €"
    static func format(_ value: Double, currency: String) -> String {
        if value >= 1_000_000 {
            return String(format: "%.1f مليون %@", value / 1_000_000, currency)
        }
        if value >= 1_000 {
            return String(format: "%.0f ألف %@", value / 1_000, currency)
        }
        return String(format: "%.0f %@", value, currency)
    }

    // مختصر لمحور الرسم: 80م / 750ك
    static func compact(_ value: Double) -> String {
        if value >= 1_000_000 { return String(format: "%.0fم", value / 1_000_000) }
        if value >= 1_000 { return String(format: "%.0fك", value / 1_000) }
        return String(format: "%.0f", value)
    }

    static let year: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy"
        return f
    }()
}
