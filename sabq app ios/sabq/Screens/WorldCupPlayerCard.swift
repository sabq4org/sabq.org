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
                    WCLoading().padding(.top, SabqLayout.space40)
                } else if let player {
                    VStack(alignment: .leading, spacing: SabqLayout.space24) {
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
                    .padding(SabqLayout.pageMargin)
                } else {
                    Text("ملف اللاعب غير متاح حاليًا")
                        .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                        .frame(maxWidth: .infinity).padding(.top, SabqLayout.space40)
                }
            }
            .background(SabqTheme.background.ignoresSafeArea())
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
        HStack(spacing: SabqLayout.space16) {
            photo(p)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(p.name)
                    .sabqText(SabqType.leadTitle).foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(2)
                if let full = p.fullName {
                    Text(full).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                }
                HStack(spacing: SabqLayout.space8) {
                    if !p.position.isEmpty {
                        chip(p.position, fill: SabqTheme.surfaceMuted, fg: WCTheme.emeraldDeep)
                    }
                    if let number = p.number {
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "tshirt.fill").font(SabqFonts.app(size: 12))
                            Text("\(number)").font(SabqFonts.app(size: 12, weight: .medium).monospacedDigit())
                        }
                        .foregroundStyle(SabqTheme.textPrimary)
                        .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                        .background(Capsule().fill(SabqTheme.surfaceMuted))
                    }
                    if p.injury != nil {
                        chip("مصاب حاليًا", fill: SabqTheme.surfaceMuted, fg: SabqTheme.warning)
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
                    .font(SabqFonts.app(size: 20, weight: .semibold)).foregroundStyle(SabqTheme.textSecondary)
                    .frame(width: 76, height: 76).background(Circle().fill(SabqTheme.surfaceMuted))
            } else {
                WCRemoteImage(url: p.photo, contentMode: .fill)
                    .frame(width: 76, height: 76).clipShape(Circle())
            }
        }
        .overlay(Circle().stroke(WCTheme.emeraldDeep, lineWidth: 2))
    }

    private func chip(_ text: String, fill: Color, fg: Color) -> some View {
        Text(text)
            .sabqText(SabqType.tag).foregroundStyle(fg)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
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
            HStack(spacing: SabqLayout.space8) {
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
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "birthday.cake").font(SabqFonts.app(size: 13)).accessibilityHidden(true)
                Text(parts.joined(separator: " — "))
            }
            .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
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
        VStack(alignment: .leading, spacing: 0) {
            sectionTitle(icon: "clock.arrow.circlepath", text: "المسيرة")
                .padding(.bottom, SabqLayout.space8)
            ForEach(career) { stop in
                WCRowSeparator()
                HStack(spacing: SabqLayout.space12) {
                    WCRemoteImage(url: stop.logo)
                        .padding(4)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(.white))
                        .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
                    Text(stop.team).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                    Spacer()
                    if !stop.seasons.isEmpty {
                        Text(stop.seasonsLabel)
                            .font(SabqFonts.app(size: 12, weight: .regular).monospacedDigit())
                            .foregroundStyle(SabqTheme.textSecondary)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                .padding(.vertical, SabqLayout.space12)
            }
        }
    }

    // MARK: الألقاب

    private func trophiesSection(_ trophies: [WCPlayerTrophy]) -> some View {
        let titles = trophies.filter(\.winner).count
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: SabqLayout.space8) {
                sectionTitle(icon: "trophy.fill", text: "الألقاب")
                if titles > 0 {
                    Text("\(titles) بطولة")
                        .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                        .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                        .background(Capsule().fill(SabqTheme.surfaceMuted))
                }
            }
            .padding(.bottom, SabqLayout.space8)
            ForEach(trophies) { trophy in
                WCRowSeparator()
                HStack(spacing: SabqLayout.space12) {
                    Image(systemName: "trophy.fill")
                        .font(SabqFonts.app(size: 13))
                        .foregroundStyle(trophy.winner ? SabqTheme.warning : SabqTheme.textTertiary)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(trophy.competition).font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                        if !trophy.country.isEmpty {
                            Text(trophy.country).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                        }
                    }
                    Spacer()
                    Text(trophy.place)
                        .sabqText(SabqType.tag).foregroundStyle(trophy.winner ? SabqTheme.onAction : SabqTheme.textSecondary)
                        .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                        .background(Capsule().fill(trophy.winner ? WCTheme.royal : SabqTheme.surfaceMuted))
                    Text(trophy.season)
                        .font(SabqFonts.app(size: 12, weight: .regular).monospacedDigit())
                        .foregroundStyle(SabqTheme.textSecondary)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .padding(.vertical, SabqLayout.space12)
            }
        }
    }

    private func sectionTitle(icon: String, text: String) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: icon).font(SabqFonts.app(size: 16)).foregroundStyle(WCTheme.emeraldDeep)
                .accessibilityHidden(true)
            Text(text).sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
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

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: SabqLayout.space8)]

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "chart.bar.fill").font(SabqFonts.app(size: 16)).foregroundStyle(WCTheme.emeraldDeep)
                    .accessibilityHidden(true)
                Text("أرقامه في مونديال 2026").sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                Spacer()
                if let rating = stats.rating {
                    Text(String(format: "%.1f", rating))
                        .font(SabqFonts.app(size: 13, weight: .semibold).monospacedDigit())
                        .foregroundStyle(ratingColor(rating))
                        .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                        .background(RoundedRectangle(cornerRadius: SabqRadius.small).fill(SabqTheme.surfaceMuted))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            LazyVGrid(columns: columns, spacing: SabqLayout.space8) {
                ForEach(tiles, id: \.label) { tile in
                    WCFactTile(value: tile.value, label: tile.label)
                }
            }
        }
    }

    private func ratingColor(_ r: Double) -> Color {
        if r >= 8 { return WCTheme.emeraldDeep }
        if r >= 7 { return SabqTheme.success }
        if r >= 6 { return SabqTheme.warning }
        return SabqTheme.danger
    }
}

/// بلاطة حقيقة: قيمة كبيرة فوق وصف صغير.
struct WCFactTile: View {
    let value: String
    let label: String

    var body: some View {
        VStack(spacing: 0) {
            Text(value)
                .font(SabqFonts.app(size: 16, weight: .semibold).monospacedDigit())
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(label)
                .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space12).padding(.horizontal, SabqLayout.space8)
        .wcQuietBlock()
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
                VStack(alignment: .leading, spacing: SabqLayout.space12) {
                    header
                    resultsStrip
                    if hasXg { xgChart }
                    VStack(spacing: 0) {
                        ForEach(matches) { m in
                            WCRowSeparator()
                            matchRow(m)
                        }
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
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: "chart.line.uptrend.xyaxis")
                .font(SabqFonts.app(size: 16)).foregroundStyle(WCTheme.emeraldDeep)
                .accessibilityHidden(true)
            Text(hasXg ? "الفورمة الأخيرة · xG" : "الفورمة الأخيرة")
                .sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
            Spacer()
            Text("آخر \(matches.count)")
                .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                .background(Capsule().fill(SabqTheme.surfaceMuted))
                .environment(\.layoutDirection, .leftToRight)
        }
    }

    // شريط نتائج W/D/L — الأحدث يمينًا (RTL يدوي معكوس)
    private var resultsStrip: some View {
        HStack(spacing: SabqLayout.space8) {
            ForEach(Array(matches.enumerated().reversed()), id: \.offset) { _, m in
                Text(resultAr(m.result))
                    .font(SabqFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(resultColor(m.result))
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(SabqTheme.surfaceMuted))
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
            .foregroundStyle(WCTheme.emeraldDeep)
            .cornerRadius(SabqRadius.small / 2)
        }
        .chartYAxis {
            AxisMarks(position: .leading) { value in
                AxisGridLine().foregroundStyle(SabqTheme.separator)
                AxisValueLabel() {
                    if let d = value.as(Double.self) {
                        Text(String(format: "%.1f", d))
                            .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks { value in
                AxisValueLabel() {
                    if let s = value.as(String.self) {
                        Text(s).font(SabqFonts.app(size: 12))
                            .foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                    }
                }
            }
        }
        .frame(height: 112)
        .padding(.top, SabqLayout.space4)
    }

    private func matchRow(_ m: WCFormMatch) -> some View {
        HStack(spacing: SabqLayout.space8) {
            // شارة النتيجة
            Text(resultAr(m.result))
                .font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(resultColor(m.result))
                .frame(width: 24, height: 24)
                .background(Circle().fill(SabqTheme.surfaceMuted))
            // شعار الخصم + اسمه
            if !m.opponentLogo.isEmpty {
                WCRemoteImage(url: m.opponentLogo)
                    .padding(2).frame(width: 24, height: 24)
                    .background(Circle().fill(.white))
                    .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(m.opponent.isEmpty ? "—" : m.opponent)
                    .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                HStack(spacing: SabqLayout.space4) {
                    Text(m.homeAway == "home" ? "أرضه" : "خارج أرضه")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    if !m.league.isEmpty {
                        Text("· \(m.league)")
                            .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 4)
            // أرقام: النتيجة + xG + الأهداف + التقييم
            HStack(spacing: SabqLayout.space8) {
                if let xg = m.xg {
                    statPill(label: "xG", value: String(format: "%.1f", xg), fg: WCTheme.emeraldDeep)
                }
                if m.goals > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "soccerball").font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.emeraldDeep)
                        Text("\(m.goals)").font(SabqFonts.app(size: 12, weight: .medium).monospacedDigit())
                            .foregroundStyle(SabqTheme.textPrimary)
                    }
                }
                Text("\(m.scoreFor)-\(m.scoreAgainst)")
                    .font(SabqFonts.app(size: 12, weight: .regular).monospacedDigit())
                    .foregroundStyle(SabqTheme.textPrimary)
                    .environment(\.layoutDirection, .leftToRight)
                if let r = m.rating {
                    Text(String(format: "%.1f", r))
                        .font(SabqFonts.app(size: 13, weight: .semibold).monospacedDigit())
                        .foregroundStyle(ratingColor(r))
                        .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: SabqRadius.small).fill(SabqTheme.surfaceMuted))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
        }
        .padding(.vertical, SabqLayout.space12)
    }

    private func statPill(label: String, value: String, fg: Color) -> some View {
        HStack(spacing: SabqLayout.space4) {
            Text(label).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            Text(value).font(SabqFonts.app(size: 12, weight: .medium).monospacedDigit()).foregroundStyle(fg)
                .environment(\.layoutDirection, .leftToRight)
        }
        .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
        .background(Capsule().fill(SabqTheme.surfaceMuted))
    }

    private func resultAr(_ r: String) -> String {
        switch r { case "W": return "ف"; case "L": return "خ"; default: return "ت" }
    }
    private func resultColor(_ r: String) -> Color {
        switch r { case "W": return WCTheme.emeraldDeep; case "L": return SabqTheme.danger; default: return SabqTheme.warning }
    }
    private func ratingColor(_ r: Double) -> Color {
        if r >= 8 { return WCTheme.emeraldDeep }
        if r >= 7 { return SabqTheme.success }
        if r >= 6 { return SabqTheme.warning }
        return SabqTheme.danger
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
                VStack(alignment: .leading, spacing: SabqLayout.space12) {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .font(SabqFonts.app(size: 16)).foregroundStyle(SabqTheme.warning)
                            .accessibilityHidden(true)
                        Text("القيمة السوقية").sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                        Spacer()
                        if let v = current {
                            Text(Self.format(v, currency: m.currency))
                                .font(SabqFonts.app(size: 15, weight: .semibold).monospacedDigit())
                                .foregroundStyle(SabqTheme.textPrimary)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                    if history.count >= 2 { chart(history, currency: m.currency) }
                }
                .padding(SabqLayout.space16)
                .wcQuietBlock()
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
                .foregroundStyle(SabqTheme.warning)
                .interpolationMethod(.monotone)
            AreaMark(x: .value("التاريخ", p.date), y: .value("القيمة", p.value))
                .foregroundStyle(SabqTheme.warning.opacity(0.12))
                .interpolationMethod(.monotone)
        }
        .chartYAxis {
            AxisMarks(position: .leading) { value in
                AxisGridLine().foregroundStyle(SabqTheme.separator)
                AxisValueLabel {
                    if let d = value.as(Double.self) {
                        Text(Self.compact(d)).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { value in
                AxisValueLabel {
                    if let d = value.as(Date.self) {
                        Text(Self.year.string(from: d)).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
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
