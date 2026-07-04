import SwiftUI

// MARK: - أقسام صفحة نادي كأس الملك (المرحلة الثانية)
//
// بطاقات الإثراء التي تظهر تباعًا بعد الأساس: المدرب بمسيرته، نبض الأرقام
// (كأس/دوري) بمخطط توزيع الأهداف، حركة الانتقالات، خزينة ألقاب الكأس،
// ومباريات النادي بنسختيها. كلها بمفردات المونديال (WCTheme + بطاقات مرتفعة).

// MARK: بطاقة المدرب بمسيرته

struct KcCoachCard: View {
    let coach: KcCoach

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                if coach.photo.isEmpty {
                    Circle().fill(WCTheme.chipFill).frame(width: 44, height: 44)
                        .overlay(Image(systemName: "person.fill").foregroundStyle(WCTheme.onDarkDim))
                } else {
                    WCRemoteImage(url: coach.photo, contentMode: .fill)
                        .frame(width: 44, height: 44).clipShape(Circle())
                        .overlay(Circle().stroke(WCTheme.emeraldDeep.opacity(0.4), lineWidth: 2))
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text("المدرّب").font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                    Text(coach.name).font(SabqFonts.app(size: 15, weight: .black)).foregroundStyle(WCTheme.onDark)
                    HStack(spacing: 6) {
                        if let nat = coach.nationality, !nat.isEmpty {
                            Text(nat)
                        }
                        if let age = coach.age {
                            Text("\(age) سنة")
                        }
                    }
                    .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                }
                Spacer(minLength: 0)
            }

            if let career = coach.career, career.count > 1 {
                VStack(alignment: .leading, spacing: 5) {
                    Text("المسيرة التدريبية")
                        .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
                    ForEach(Array(career.prefix(5).enumerated()), id: \.offset) { _, stop in
                        HStack(spacing: 6) {
                            Circle().fill(WCTheme.emerald.opacity(0.5)).frame(width: 5, height: 5)
                            Text(stop.team)
                                .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                                .lineLimit(1)
                            Spacer(minLength: 4)
                            Text(periodLabel(stop))
                                .font(SabqFonts.app(size: 10).monospacedDigit()).foregroundStyle(WCTheme.onDarkDim)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }

    private func periodLabel(_ stop: KcCoachStop) -> String {
        let start = stop.start.map { String($0.prefix(7)) } ?? "—"
        let end = stop.end.map { String($0.prefix(7)) } ?? "الآن"
        return "\(start) – \(end)"
    }
}

// MARK: نبض الأرقام (إحصائيات موسمية — كأس أو دوري)

struct KcTeamStatsCard: View {
    let title: String
    let subtitle: String
    let stats: KcTeamStats

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "waveform.path.ecg")
                    .font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(WCTheme.onDark)
                    Text(subtitle).font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                }
                Spacer(minLength: 0)
            }

            // البلاطات الرئيسة
            HStack(spacing: 8) {
                WCFactTile(value: "\(stats.fixtures.played.total)", label: "مباريات")
                WCFactTile(value: wdl, label: "ف-ت-خ")
                WCFactTile(value: "\(stats.goals.scored.total)/\(stats.goals.against.total)", label: "له/عليه")
                WCFactTile(value: "\(stats.summary.cleanSheets.total)", label: "نظافة شباك")
            }

            // أكبر النتائج + السلاسل + التشكيلة
            let chips = badgeChips
            if !chips.isEmpty {
                KcStatChips(chips: chips)
            }

            if !stats.timing.isEmpty { timingChart }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }

    private var wdl: String {
        "\(stats.fixtures.wins.total)-\(stats.fixtures.draws.total)-\(stats.fixtures.loses.total)"
    }

    private var badgeChips: [String] {
        var chips: [String] = []
        if let w = stats.biggest.winsHome { chips.append("أكبر فوز بالأرض \(w)") }
        if let w = stats.biggest.winsAway { chips.append("أكبر فوز خارجًا \(w)") }
        if let streak = stats.biggest.streakWin, streak > 1 { chips.append("سلسلة فوز \(streak)") }
        if let formation = stats.summary.mostUsedFormation { chips.append("التشكيلة \(formation)") }
        chips.append("🟨 \(stats.summary.cards.yellowTotal) · 🟥 \(stats.summary.cards.redTotal)")
        return chips
    }

    /// توزيع الأهداف حسب فترات الدقائق — شريطا سجّل/استقبل لكل فترة.
    private var timingChart: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("توزيع الأهداف حسب الدقائق")
                    .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
                Spacer()
                HStack(spacing: 8) {
                    legend(color: WCTheme.emeraldDeep, label: "سجّل")
                    legend(color: WCTheme.liveRed, label: "استقبل")
                }
            }
            let maxVal = max(1, stats.timing.map { max($0.scored, $0.against) }.max() ?? 1)
            HStack(alignment: .bottom, spacing: 4) {
                ForEach(stats.timing) { t in
                    VStack(spacing: 2) {
                        HStack(alignment: .bottom, spacing: 1) {
                            Capsule().fill(WCTheme.emeraldDeep.opacity(0.85))
                                .frame(width: 6, height: max(3, 52 * CGFloat(t.scored) / CGFloat(maxVal)))
                            Capsule().fill(WCTheme.liveRed.opacity(0.7))
                                .frame(width: 6, height: max(3, 52 * CGFloat(t.against) / CGFloat(maxVal)))
                        }
                        Text(t.bucket)
                            .font(SabqFonts.app(size: 7).monospacedDigit()).foregroundStyle(WCTheme.onDarkDim)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .environment(\.layoutDirection, .leftToRight)
        }
        .padding(.top, 2)
    }

    private func legend(color: Color, label: String) -> some View {
        HStack(spacing: 3) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 8, height: 8)
            Text(label).font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim)
        }
    }
}

/// رقائق ملتفّة بسيطة (بلا تمرير أفقي).
struct KcStatChips: View {
    let chips: [String]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 6)], alignment: .leading, spacing: 6) {
            ForEach(chips, id: \.self) { chip in
                Text(chip)
                    .font(SabqFonts.app(size: 10, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.8)
                    .padding(.horizontal, 8).padding(.vertical, 5)
                    .frame(maxWidth: .infinity)
                    .background(Capsule().fill(WCTheme.chipFill))
            }
        }
    }
}

// MARK: مباريات النادي في الكأس (نسختان)

struct KcTeamMatchesBlock: View {
    let matches: KcTeamMatches

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("مباريات النادي في كأس الملك")
                .font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(WCTheme.emeraldDeep)

            if !matches.fixtures.isEmpty {
                if let season = matches.season {
                    seasonLabel("نسخة \(KcFormat.seasonLabel(season))")
                }
                ForEach(matches.fixtures) { f in KcTeamFixtureRow(fixture: f) }
            }

            if let prev = matches.previous {
                seasonLabel("مشواره في نسخة \(KcFormat.seasonLabel(prev.season))")
                    .padding(.top, matches.fixtures.isEmpty ? 0 : 6)
                ForEach(prev.fixtures) { f in KcTeamFixtureRow(fixture: f) }
            }
        }
    }

    private func seasonLabel(_ text: String) -> some View {
        Text(text)
            .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
    }
}

struct KcTeamFixtureRow: View {
    let fixture: KcFixture

    var body: some View {
        HStack(spacing: 8) {
            KcTeamLogo(team: fixture.home, size: 24, ring: WCTheme.cardStroke)
            Text(fixture.started ? "\(fixture.goals.away ?? 0) - \(fixture.goals.home ?? 0)" : KcFormat.time(fixture))
                .font(SabqFonts.app(size: 13, weight: .black)).foregroundStyle(WCTheme.onDark)
                .environment(\.layoutDirection, .leftToRight).frame(minWidth: 44)
            KcTeamLogo(team: fixture.away, size: 24, ring: WCTheme.cardStroke)
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 1) {
                Text(fixture.round).font(SabqFonts.app(size: 10, weight: .semibold)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                Text(KcFormat.day(fixture)).font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .wcElevatedCard(cornerRadius: 12)
    }
}

// MARK: حركة الانتقالات

struct KcTransfersBlock: View {
    let transfers: KcTeamTransfers

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("حركة الانتقالات")
                .font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(WCTheme.emeraldDeep)
            if !transfers.arrivals.isEmpty {
                column(title: "وصل", tint: WCTheme.emeraldDeep, items: transfers.arrivals, incoming: true)
            }
            if !transfers.departures.isEmpty {
                column(title: "غادر", tint: WCTheme.liveRed, items: transfers.departures, incoming: false)
            }
        }
    }

    private func column(title: String, tint: Color, items: [KcTeamTransfer], incoming: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: incoming ? "arrow.down.left" : "arrow.up.right")
                    .font(.system(size: 10, weight: .bold))
                Text(title)
                Text("(\(items.count))").foregroundStyle(WCTheme.onDarkDim)
            }
            .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(tint)

            ForEach(items.prefix(5)) { t in
                HStack(spacing: 8) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(t.player)
                            .font(SabqFonts.app(size: 13, weight: .bold)).foregroundStyle(WCTheme.onDark)
                            .lineLimit(1)
                        HStack(spacing: 4) {
                            Text(incoming ? "من" : "إلى")
                            if !t.teamLogo.isEmpty {
                                WCRemoteImage(url: t.teamLogo).frame(width: 14, height: 14)
                            }
                            Text(t.team).lineLimit(1)
                        }
                        .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
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
}

// MARK: خزينة ألقاب النادي في الكأس

struct KcTeamTitlesBlock: View {
    let teamId: Int
    let record: KcRecord

    private var editions: [KcRecordEdition] {
        record.editions.filter { $0.champion?.id == teamId }
    }

    var body: some View {
        if !editions.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "trophy.fill").font(.system(size: 13)).foregroundStyle(WCTheme.gold)
                    Text("ألقابه في كأس الملك")
                        .font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(WCTheme.emeraldDeep)
                    if let since = record.sinceSeason {
                        Text("ضمن المدى المتاح منذ \(KcFormat.seasonLabel(since))")
                            .font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim)
                    }
                }
                ForEach(editions) { e in
                    HStack(spacing: 10) {
                        Image(systemName: "trophy.fill").font(.system(size: 15)).foregroundStyle(WCTheme.gold)
                        VStack(alignment: .leading, spacing: 1) {
                            Text("نسخة \(KcFormat.seasonLabel(e.season))")
                                .font(SabqFonts.app(size: 13, weight: .black)).foregroundStyle(WCTheme.onDark)
                            if let runnerUp = e.runnerUp {
                                HStack(spacing: 4) {
                                    Text("على حساب \(runnerUp.name)")
                                    if let score = e.score {
                                        Text(score).fontWeight(.bold)
                                            .environment(\.layoutDirection, .leftToRight)
                                    }
                                    if let pens = e.penalties {
                                        Text("(\(pens) ر.ت)")
                                            .environment(\.layoutDirection, .leftToRight)
                                    }
                                }
                                .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.gold.opacity(0.08)))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(WCTheme.gold.opacity(0.3), lineWidth: 0.5))
                }
            }
        }
    }
}
