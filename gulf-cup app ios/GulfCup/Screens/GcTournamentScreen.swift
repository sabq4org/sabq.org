import SwiftUI

// تبويب «البطولة» — أربعة أقسام: المجموعات · الأدوار الإقصائية · الهدّافون · السجلّ.
// يجمع عمق البيانات الجديد: لوحة هدّافين وصنّاع أهداف من المزوّد، وسجلّ 26 نسخة
// من 1970 بجدول ألقاب لكل منتخب.
struct GcTournamentScreen: View {
    @Bindable var store: GcHubStore
    @State private var segment: GcTournamentSegment = .groups

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 14) {
                GcHeroPanel(radius: GcTheme.cardRadius) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L("tab.tournament")).font(GulfCupFonts.headline(size: 22)).foregroundStyle(.white)
                            Text(L("tournament.subtitle")).font(GulfCupFonts.app(size: 11.5)).foregroundStyle(GcTheme.onHeroDim)
                        }
                        Spacer()
                        Image(systemName: "trophy.fill").font(.system(size: 28)).foregroundStyle(GcTheme.goldTitleGradient)
                    }
                    .padding(16)
                }
                .padding(.top, 8)

                segmentBar

                switch segment {
                case .groups: groupsSection
                case .bracket: bracketSection
                case .scorers: scorersSection
                case .history: historySection
                }

                GcFooterSignature()
            }
        }
        .refreshable { await store.loadAll(force: true) }
        .navigationBarHidden(true)
    }

    private var segmentBar: some View {
        HStack(spacing: 6) {
            ForEach(GcTournamentSegment.allCases) { seg in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { segment = seg }
                } label: {
                    VStack(spacing: 5) {
                        Image(systemName: seg.icon).font(.system(size: 14, weight: .semibold))
                        Text(seg.title).font(GulfCupFonts.app(size: 10.5, weight: .bold))
                    }
                    .foregroundStyle(segment == seg ? .white : GcTheme.inkDim)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: GcTheme.chipRadius, style: .continuous)
                            .fill(segment == seg ? GcTheme.emerald : Color.clear)
                    )
                }
                .buttonStyle(GcPressStyle())
            }
        }
        .padding(4)
        .gcCard(radius: GcTheme.tileRadius)
    }

    // MARK: المجموعات

    @ViewBuilder private var groupsSection: some View {
        if store.groups.isEmpty && !store.loading {
            GcEmptyState(icon: "tablecells", title: L("groups.empty.title"), subtitle: L("groups.empty.subtitle"))
        } else {
            GcSectionHeader(icon: "rectangle.3.group", title: L("standings.section.title"), subtitle: L("standings.section.subtitle"), tint: GcTheme.emerald)
            ForEach(store.groups) { GcGroupCard(group: $0) }
            if store.loading && store.groups.isEmpty {
                GcLoadingPanel(title: L("loading.standings"))
            }
        }
    }

    // MARK: الأدوار الإقصائية

    private var knockout: [GcFixture] { GcFixtureMath.knockout(from: store.fixtures) }
    private var semis: [GcFixture] { knockout.filter { $0.roundEn.lowercased().contains("semi") } }
    private var final: GcFixture? { knockout.first { $0.roundEn.lowercased() == "final" || ($0.roundEn.lowercased().contains("final") && !$0.roundEn.lowercased().contains("semi")) } }

    @ViewBuilder private var bracketSection: some View {
        if knockout.isEmpty {
            GcEmptyState(icon: "trophy", title: L("bracket.empty.title"), subtitle: L("bracket.empty.subtitle"))
        } else {
            GcSectionHeader(icon: "flag.checkered", title: L("bracket.title"), subtitle: L("bracket.subtitle"), tint: GcTheme.gold)

            if !semis.isEmpty {
                VStack(spacing: 10) {
                    bracketRoundLabel(L("bracket.semis"), icon: "arrow.triangle.branch")
                    GcMatchListCard(fixtures: semis)
                }
            }

            bracketConnector

            if let final {
                VStack(spacing: 10) {
                    bracketRoundLabel(L("bracket.final"), icon: "crown.fill", tint: GcTheme.goldDeep)
                    finalCard(final)
                }
            }
        }
    }

    private func bracketRoundLabel(_ title: String, icon: String, tint: Color = GcTheme.emerald) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 12, weight: .bold))
            Text(title).font(GulfCupFonts.app(size: 13, weight: .bold))
            Spacer()
        }
        .foregroundStyle(tint)
    }

    private var bracketConnector: some View {
        VStack(spacing: 2) {
            Rectangle().fill(GcTheme.gold.opacity(0.45)).frame(width: 2, height: 18)
            Image(systemName: "chevron.down").font(.system(size: 10, weight: .bold)).foregroundStyle(GcTheme.gold)
        }
    }

    /// بطاقة النهائي — إبراز ذهبي خاص.
    private func finalCard(_ fx: GcFixture) -> some View {
        NavigationLink {
            GcMatchCenterScreen(fixture: fx)
        } label: {
            VStack(spacing: 10) {
                HStack {
                    GcChip(text: fx.round, icon: "crown.fill", tint: GcTheme.goldDeep)
                    Spacer()
                    GcStatusPill(fixture: fx)
                }
                GcScoreRow(fixture: fx)
                HStack(spacing: 4) {
                    Image(systemName: "mappin.and.ellipse").font(.system(size: 9))
                    Text("\(fx.venue.name) · \(GcFormat.kickoffDay(fx.date))")
                }
                .font(GulfCupFonts.app(size: 10.5))
                .foregroundStyle(GcTheme.inkFaint)
            }
            .padding(14)
            .gcCard(stroke: GcTheme.gold.opacity(0.4))
        }
        .buttonStyle(GcPressStyle())
    }

    // MARK: الهدّافون

    @ViewBuilder private var scorersSection: some View {
        if let board = store.scorers, !board.scorers.isEmpty || !board.assists.isEmpty {
            if !board.isCurrent {
                HStack(spacing: 7) {
                    Image(systemName: "clock.arrow.circlepath").font(.system(size: 12, weight: .bold))
                    Text(L("scorers.lastEdition")).font(GulfCupFonts.app(size: 11.5, weight: .semibold))
                    Spacer()
                }
                .foregroundStyle(GcTheme.amber)
                .padding(11)
                .background(RoundedRectangle(cornerRadius: GcTheme.chipRadius, style: .continuous).fill(GcTheme.amber.opacity(0.10)))
            }

            if !board.scorers.isEmpty {
                GcSectionHeader(icon: "soccerball", title: L("scorers.title"), count: board.scorers.count, tint: GcTheme.emerald)
                GcScorerBoardCard(rows: board.scorers, metric: .goals)
            }

            if !board.assists.isEmpty {
                GcSectionHeader(icon: "arrow.up.forward.circle.fill", title: L("scorers.assists.title"), count: board.assists.count, tint: GcTheme.teal)
                GcScorerBoardCard(rows: board.assists, metric: .assists)
            }
        } else if store.scorers == nil {
            GcLoadingPanel(title: L("loading.scorers"))
                .task { await store.loadScorers() }
        } else {
            GcEmptyState(icon: "soccerball", title: L("scorers.empty.title"), subtitle: L("scorers.empty.subtitle"))
        }
    }

    // MARK: السجلّ

    @ViewBuilder private var historySection: some View {
        if let history = store.history {
            GcSectionHeader(icon: "crown.fill", title: L("history.titles.title"), tint: GcTheme.goldDeep)
            GcTitlesTableCard(rows: history.titles)

            GcSectionHeader(icon: "clock.arrow.circlepath", title: L("history.editions.title"), count: history.editions.count, tint: GcTheme.emerald)
            GcEditionsTimeline(editions: history.editions)
        } else {
            GcLoadingPanel(title: L("loading.history"))
                .task { await store.loadHistory() }
        }
    }
}

enum GcTournamentSegment: String, CaseIterable, Identifiable {
    case groups, bracket, scorers, history
    var id: String { rawValue }
    var title: String {
        switch self {
        case .groups: return L("tournament.seg.groups")
        case .bracket: return L("tournament.seg.bracket")
        case .scorers: return L("tournament.seg.scorers")
        case .history: return L("tournament.seg.history")
        }
    }
    var icon: String {
        switch self {
        case .groups: return "rectangle.3.group"
        case .bracket: return "flag.checkered"
        case .scorers: return "soccerball"
        case .history: return "crown.fill"
        }
    }
}

// MARK: - لوحة هدّافين

enum GcScorerMetric { case goals, assists }

struct GcScorerBoardCard: View {
    let rows: [GcScorer]
    let metric: GcScorerMetric

    private func value(_ s: GcScorer) -> Int { metric == .goals ? s.goals : s.assists }
    private var unit: String { metric == .goals ? L("scorers.goals") : L("scorers.assists") }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { idx, s in
                if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                HStack(spacing: 11) {
                    ZStack {
                        Circle()
                            .fill(s.rank <= 3 ? GcTheme.gold.opacity(0.16) : GcTheme.chipFill)
                            .frame(width: 26, height: 26)
                        Text("\(s.rank)")
                            .font(GulfCupFonts.app(size: 12, weight: .bold))
                            .foregroundStyle(s.rank <= 3 ? GcTheme.goldDeep : GcTheme.inkFaint)
                    }
                    GcPlayerPhoto(url: s.photo, size: 40)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(s.name).font(GulfCupFonts.app(size: 13.5, weight: .bold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                        HStack(spacing: 5) {
                            GcTeamLogo(logo: s.team.logo, size: 15)
                            Text(s.team.name).font(GulfCupFonts.app(size: 10.5)).foregroundStyle(GcTheme.inkDim)
                            if s.matches > 0 {
                                Text("· \(s.matches) \(L("scorers.matches"))").font(GulfCupFonts.app(size: 10)).foregroundStyle(GcTheme.inkFaint)
                            }
                        }
                    }
                    Spacer()
                    VStack(spacing: 1) {
                        Text("\(value(s))")
                            .font(GulfCupFonts.app(size: 18, weight: .bold))
                            .foregroundStyle(metric == .goals ? GcTheme.emerald : GcTheme.teal)
                            .monospacedDigit()
                        Text(unit).font(GulfCupFonts.app(size: 9)).foregroundStyle(GcTheme.inkFaint)
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
            }
        }
        .gcCard()
    }
}

// MARK: - جدول الألقاب

struct GcTitlesTableCard: View {
    let rows: [GcTitleRow]

    private var maxTitles: Int { max(rows.first?.titles ?? 1, 1) }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                NavigationLink {
                    GcTeamProfileScreen(teamId: row.team.id, fallback: row.team)
                } label: {
                    HStack(spacing: 11) {
                        GcTeamLogo(logo: row.team.logo, size: 32)
                        VStack(alignment: .leading, spacing: 5) {
                            HStack(spacing: 6) {
                                Text(row.team.name).font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.ink)
                                if let last = row.lastTitleYear {
                                    Text("آخر لقب \(last)").font(GulfCupFonts.app(size: 9.5)).foregroundStyle(GcTheme.inkFaint)
                                }
                            }
                            // شريط ألقاب نسبي
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(GcTheme.chipFill)
                                    if row.titles > 0 {
                                        Capsule()
                                            .fill(GcTheme.goldFill)
                                            .frame(width: max(geo.size.width * CGFloat(row.titles) / CGFloat(maxTitles), 8))
                                    }
                                }
                            }
                            .frame(height: 6)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            HStack(spacing: 3) {
                                Text("\(row.titles)").font(GulfCupFonts.app(size: 17, weight: .bold)).foregroundStyle(row.titles > 0 ? GcTheme.goldDeep : GcTheme.inkFaint).monospacedDigit()
                                Image(systemName: "trophy.fill").font(.system(size: 10)).foregroundStyle(row.titles > 0 ? GcTheme.gold : GcTheme.inkFaint)
                            }
                            Text("\(row.runnerUps) \(L("history.runnerUp.unit")) · \(row.hosted) \(L("history.hosted.unit"))")
                                .font(GulfCupFonts.app(size: 9))
                                .foregroundStyle(GcTheme.inkFaint)
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .gcCard()
    }
}

// MARK: - خطّ زمن النسخ

struct GcEditionsTimeline: View {
    let editions: [GcEdition]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(editions.enumerated()), id: \.element.id) { idx, e in
                if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                editionRow(e)
            }
        }
        .gcCard()
    }

    @ViewBuilder private func editionRow(_ e: GcEdition) -> some View {
        HStack(spacing: 12) {
            VStack(spacing: 2) {
                Text("\(e.edition)")
                    .font(GulfCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(e.upcoming ? GcTheme.emerald : GcTheme.goldDeep)
                Text(e.year)
                    .font(GulfCupFonts.app(size: 8.5, weight: .semibold))
                    .foregroundStyle(GcTheme.inkFaint)
            }
            .frame(width: 52)
            .padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(e.upcoming ? GcTheme.emerald.opacity(0.10) : GcTheme.gold.opacity(0.09)))

            if e.upcoming {
                VStack(alignment: .leading, spacing: 3) {
                    Text(L("history.upcoming")).font(GulfCupFonts.app(size: 12.5, weight: .bold)).foregroundStyle(GcTheme.emerald)
                    hostLine(e)
                }
                Spacer()
                GcChip(text: e.year, tint: GcTheme.emerald)
            } else if let champ = e.champion {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        GcTeamLogo(logo: champ.logo, size: 22)
                        Text(champ.name).font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.ink)
                        Image(systemName: "crown.fill").font(.system(size: 10)).foregroundStyle(GcTheme.gold)
                    }
                    if let ru = e.runnerUp {
                        HStack(spacing: 4) {
                            Text("\(L("history.runnerUp")): \(ru.name)")
                            if let note = e.finalNote { Text("(\(note))") }
                        }
                        .font(GulfCupFonts.app(size: 10.5))
                        .foregroundStyle(GcTheme.inkDim)
                    }
                    hostLine(e)
                }
                Spacer()
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private func hostLine(_ e: GcEdition) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "mappin.and.ellipse").font(.system(size: 8.5))
            Text("\(L("history.host")): \(e.host.name)\(e.hostCity.map { " · \($0)" } ?? "")")
        }
        .font(GulfCupFonts.app(size: 10))
        .foregroundStyle(GcTheme.inkFaint)
    }
}
