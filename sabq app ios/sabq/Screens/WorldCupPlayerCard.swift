import SwiftUI

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
                        if let stats = player.stats {
                            WCPlayerStatsGrid(stats: stats, isGoalkeeper: player.positionEn == "Goalkeeper")
                        }
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
                        .font(.system(size: 13)).foregroundStyle(WCTheme.onDarkDim)
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
                    Text(full).font(.system(size: 11)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                }
                HStack(spacing: 6) {
                    if !p.position.isEmpty {
                        chip(p.position, fill: WCTheme.emeraldDeep.opacity(0.35), fg: WCTheme.emerald)
                    }
                    if let number = p.number {
                        HStack(spacing: 3) {
                            Image(systemName: "tshirt.fill").font(.system(size: 9))
                            Text("\(number)").font(.system(size: 11, weight: .black).monospacedDigit())
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
                    .font(.system(size: 22, weight: .black)).foregroundStyle(WCTheme.onDarkDim)
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
            .font(.system(size: 11, weight: .bold)).foregroundStyle(fg)
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
                Image(systemName: "birthday.cake").font(.system(size: 11))
                Text(parts.joined(separator: " — "))
            }
            .font(.system(size: 12)).foregroundStyle(WCTheme.onDarkDim)
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
                    Text(stop.team).font(.system(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                    Spacer()
                    if !stop.seasons.isEmpty {
                        Text(stop.seasonsLabel)
                            .font(.system(size: 12, weight: .semibold).monospacedDigit())
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
                        .font(.system(size: 10, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Capsule().fill(WCTheme.chipFill))
                }
            }
            ForEach(trophies) { trophy in
                HStack(spacing: 10) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 13))
                        .foregroundStyle(trophy.winner ? WCTheme.gold : WCTheme.onDarkDim.opacity(0.5))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(trophy.competition).font(.system(size: 13, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                        if !trophy.country.isEmpty {
                            Text(trophy.country).font(.system(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                        }
                    }
                    Spacer()
                    Text(trophy.place)
                        .font(.system(size: 10, weight: .bold)).foregroundStyle(trophy.winner ? .white : WCTheme.onDarkDim)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Capsule().fill(trophy.winner ? WCTheme.emeraldDeep : WCTheme.chipFill))
                    Text(trophy.season)
                        .font(.system(size: 11, weight: .semibold).monospacedDigit())
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
            Image(systemName: icon).font(.system(size: 12, weight: .semibold)).foregroundStyle(WCTheme.emerald)
            Text(text).font(.system(size: 14, weight: .bold)).foregroundStyle(WCTheme.emerald)
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
                Image(systemName: "chart.bar.fill").font(.system(size: 12, weight: .semibold)).foregroundStyle(WCTheme.emerald)
                Text("أرقامه في مونديال 2026").font(.system(size: 14, weight: .bold)).foregroundStyle(WCTheme.emerald)
                Spacer()
                if let rating = stats.rating {
                    Text(String(format: "%.1f", rating))
                        .font(.system(size: 12, weight: .black).monospacedDigit())
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
                .font(.system(size: 15, weight: .black, design: .rounded).monospacedDigit())
                .foregroundStyle(WCTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(label)
                .font(.system(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9).padding(.horizontal, 6)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }
}
