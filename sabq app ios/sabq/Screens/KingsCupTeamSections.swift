import SwiftUI

// MARK: - أقسام صفحة نادي كأس الملك (المرحلة الثانية)
//
// كتل الإثراء التي تظهر تباعًا بعد الأساس: المدرب بمسيرته، نبض الأرقام
// (كأس/دوري) بمخطط توزيع الأهداف، حركة الانتقالات، خزينة ألقاب الكأس،
// ومباريات النادي بنسختيها. بنموذج سبق: عناوين على الصفحة وصفوف بفواصل رفيعة.

// MARK: بطاقة المدرب بمسيرته

struct KcCoachCard: View {
    let coach: KcCoach

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space12) {
                KcAvatar(url: coach.photo, size: 48)
                VStack(alignment: .leading, spacing: 0) {
                    Text("المدرّب").sabqText(SabqType.tag).foregroundStyle(KcTheme.accent)
                    Text(coach.name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                    HStack(spacing: SabqLayout.space8) {
                        if let nat = coach.nationality, !nat.isEmpty {
                            Text(nat)
                        }
                        if let age = coach.age {
                            Text("\(age) سنة")
                        }
                    }
                    .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                }
                Spacer(minLength: 0)
            }

            if let career = coach.career, career.count > 1 {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    Text("المسيرة التدريبية")
                        .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textSecondary)
                    ForEach(Array(career.prefix(5).enumerated()), id: \.offset) { _, stop in
                        HStack(spacing: SabqLayout.space8) {
                            Circle().fill(KcTheme.accent).frame(width: 5, height: 5).accessibilityHidden(true)
                            Text(stop.team)
                                .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textPrimary)
                                .lineLimit(1)
                            Spacer(minLength: SabqLayout.space4)
                            Text(periodLabel(stop))
                                .font(SabqType.tag.font.monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            KcSectionHeader(icon: "waveform.path.ecg", title: title, subtitle: subtitle)

            // البلاطات الرئيسة
            HStack(spacing: SabqLayout.space8) {
                KcFactTile(value: "\(stats.fixtures.played.total)", label: "مباريات")
                KcFactTile(value: wdl, label: "ف-ت-خ")
                KcFactTile(value: "\(stats.goals.scored.total)/\(stats.goals.against.total)", label: "له/عليه")
                KcFactTile(value: "\(stats.summary.cleanSheets.total)", label: "نظافة شباك")
            }

            // أكبر النتائج + السلاسل + التشكيلة
            let chips = badgeChips
            if !chips.isEmpty {
                KcStatChips(chips: chips)
            }

            if !stats.timing.isEmpty { timingChart }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack {
                Text("توزيع الأهداف حسب الدقائق")
                    .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textSecondary)
                Spacer()
                HStack(spacing: SabqLayout.space8) {
                    legend(color: KcTheme.accentFill, label: "سجّل")
                    legend(color: KcTheme.liveFill, label: "استقبل")
                }
            }
            let maxVal = max(1, stats.timing.map { max($0.scored, $0.against) }.max() ?? 1)
            HStack(alignment: .bottom, spacing: SabqLayout.space4) {
                ForEach(stats.timing) { t in
                    VStack(spacing: SabqLayout.space4) {
                        HStack(alignment: .bottom, spacing: 2) {
                            Capsule().fill(KcTheme.accentFill)
                                .frame(width: 6, height: max(3, 52 * CGFloat(t.scored) / CGFloat(maxVal)))
                            Capsule().fill(KcTheme.liveFill)
                                .frame(width: 6, height: max(3, 52 * CGFloat(t.against) / CGFloat(maxVal)))
                        }
                        Text(t.bucket)
                            .font(SabqType.tag.font.monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                            .lineLimit(1).minimumScaleFactor(0.6)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .environment(\.layoutDirection, .leftToRight)
        }
        .padding(.top, SabqLayout.space4)
    }

    private func legend(color: Color, label: String) -> some View {
        HStack(spacing: SabqLayout.space4) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 8, height: 8)
            Text(label).sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
        }
    }
}

/// رقائق ملتفّة بسيطة (بلا تمرير أفقي).
struct KcStatChips: View {
    let chips: [String]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 128), spacing: SabqLayout.space8)], alignment: .leading, spacing: SabqLayout.space8) {
            ForEach(chips, id: \.self) { chip in
                Text(chip)
                    .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1).minimumScaleFactor(0.8)
                    .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                    .frame(maxWidth: .infinity)
                    .background(Capsule().fill(SabqTheme.surfaceMuted))
            }
        }
    }
}

// MARK: مباريات النادي في الكأس (نسختان)

struct KcTeamMatchesBlock: View {
    let matches: KcTeamMatches

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            kcBlockHeading("مباريات النادي في كأس الملك")

            if !matches.fixtures.isEmpty {
                if let season = matches.season {
                    seasonLabel("نسخة \(KcFormat.seasonLabel(season))")
                }
                rows(matches.fixtures)
            }

            if let prev = matches.previous {
                seasonLabel("مشواره في نسخة \(KcFormat.seasonLabel(prev.season))")
                    .padding(.top, matches.fixtures.isEmpty ? 0 : SabqLayout.space16)
                rows(prev.fixtures)
            }
        }
    }

    private func rows(_ fixtures: [KcFixture]) -> some View {
        ForEach(Array(fixtures.enumerated()), id: \.element.id) { index, f in
            if index > 0 { KcRowSeparator() }
            KcTeamFixtureRow(fixture: f)
        }
    }

    private func seasonLabel(_ text: String) -> some View {
        Text(text)
            .sabqText(SabqType.metaEmphasis).foregroundStyle(KcTheme.accent)
            .padding(.top, SabqLayout.space4)
    }
}

/// صف مباراة نادٍ: بلا صندوق؛ النتيجة LTR والمضيف يمينًا.
struct KcTeamFixtureRow: View {
    let fixture: KcFixture

    var body: some View {
        HStack(spacing: SabqLayout.space8) {
            KcTeamLogo(team: fixture.home, size: 28)
            Text(fixture.started ? "\(fixture.goals.away ?? 0) - \(fixture.goals.home ?? 0)" : KcFormat.time(fixture))
                .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight).frame(minWidth: 48)
            KcTeamLogo(team: fixture.away, size: 28)
            Spacer(minLength: SabqLayout.space4)
            VStack(alignment: .trailing, spacing: 0) {
                Text(fixture.round).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                Text(KcFormat.day(fixture)).sabqText(SabqType.tag).foregroundStyle(SabqTheme.textTertiary).lineLimit(1)
            }
        }
        .padding(.vertical, SabqLayout.space12)
    }
}

// MARK: حركة الانتقالات

struct KcTransfersBlock: View {
    let transfers: KcTeamTransfers

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            kcBlockHeading("حركة الانتقالات")
            if !transfers.arrivals.isEmpty {
                column(title: "وصل", tint: KcTheme.accent, items: transfers.arrivals, incoming: true)
            }
            if !transfers.departures.isEmpty {
                column(title: "غادر", tint: KcTheme.liveText, items: transfers.departures, incoming: false)
                    .padding(.top, SabqLayout.space8)
            }
        }
    }

    private func column(title: String, tint: Color, items: [KcTeamTransfer], incoming: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: SabqLayout.space4) {
                Image(systemName: incoming ? "arrow.down.left" : "arrow.up.right").accessibilityHidden(true)
                Text(title)
                Text("(\(items.count))").foregroundStyle(SabqTheme.textSecondary)
            }
            .sabqText(SabqType.metaEmphasis).foregroundStyle(tint)

            ForEach(Array(items.prefix(5).enumerated()), id: \.element.id) { index, t in
                if index > 0 { KcRowSeparator() }
                HStack(spacing: SabqLayout.space8) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(t.player)
                            .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(1)
                        HStack(spacing: SabqLayout.space4) {
                            Text(incoming ? "من" : "إلى")
                            if !t.teamLogo.isEmpty {
                                WCRemoteImage(url: t.teamLogo).frame(width: 16, height: 16)
                            }
                            Text(t.team).lineLimit(1)
                        }
                        .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
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
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "trophy.fill").foregroundStyle(KcTheme.gold).accessibilityHidden(true)
                    Text("ألقابه في كأس الملك")
                        .sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                }
                if let since = record.sinceSeason {
                    Text("ضمن المدى المتاح منذ \(KcFormat.seasonLabel(since))")
                        .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                }
                ForEach(Array(editions.enumerated()), id: \.element.id) { index, e in
                    if index > 0 { KcRowSeparator() }
                    HStack(spacing: SabqLayout.space12) {
                        Image(systemName: "trophy.fill").foregroundStyle(KcTheme.gold).accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("نسخة \(KcFormat.seasonLabel(e.season))")
                                .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                            if let runnerUp = e.runnerUp {
                                HStack(spacing: SabqLayout.space4) {
                                    Text("على حساب \(runnerUp.name)")
                                    if let score = e.score {
                                        Text(score).fontWeight(.semibold)
                                            .environment(\.layoutDirection, .leftToRight)
                                    }
                                    if let pens = e.penalties {
                                        Text("(\(pens) ر.ت)")
                                            .environment(\.layoutDirection, .leftToRight)
                                    }
                                }
                                .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, SabqLayout.space12)
                }
            }
        }
    }
}
