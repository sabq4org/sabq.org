import SwiftUI
import UIKit

// تبويب «البطولة» — مجموعات · إقصائية · هدّافون · دليل · سجلّ.
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
                        Image(systemName: "trophy.fill").font(.system(size: 28)).foregroundStyle(GcTheme.skyFill)
                    }
                    .padding(16)
                }
                .padding(.top, 8)

                segmentBar

                switch segment {
                case .groups: groupsSection
                case .bracket: bracketSection
                case .scorers: scorersSection
                case .guide: guideSection
                case .history: historySection
                }

                GcFooterSignature()
            }
        }
        .refreshable { await store.loadAll(force: true) }
        .navigationBarHidden(true)
    }

    private var segmentBar: some View {
        HStack(spacing: 4) {
            ForEach(GcTournamentSegment.allCases) { seg in
                Button {
                    withAnimation(.easeOut(duration: 0.2)) { segment = seg }
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: seg.icon).font(.system(size: 13, weight: .semibold))
                        Text(seg.title).font(GulfCupFonts.app(size: 9.5, weight: .bold)).lineLimit(1)
                    }
                    .foregroundStyle(segment == seg ? GcTheme.skyDeep : GcTheme.inkDim)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(
                        RoundedRectangle(cornerRadius: GcTheme.chipRadius, style: .continuous)
                            .fill(segment == seg ? GcTheme.skyLite : Color.clear)
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
            GcSectionHeader(icon: "flag.checkered", title: L("bracket.title"), subtitle: L("bracket.subtitle"), tint: GcTheme.sky)

            if !semis.isEmpty {
                VStack(spacing: 10) {
                    Text(L("bracket.semis"))
                        .font(GulfCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(GcTheme.inkDim)
                        .frame(maxWidth: .infinity)

                    // عمودي على الموبايل — جنبًا لجنب يقصّ الأسماء والملاعب
                    ForEach(Array(semis.prefix(2).enumerated()), id: \.element.id) { idx, fx in
                        NavigationLink {
                            GcMatchCenterScreen(fixture: fx)
                        } label: {
                            bracketMatchCard(fx, featured: false, badge: idx == 0 ? "SF1" : "SF2")
                        }
                        .buttonStyle(GcPressStyle())
                    }
                }
            }

            if !semis.isEmpty && final != nil {
                GcBracketDownArrow()
                    .frame(height: 36)
                    .padding(.vertical, 2)
            }

            if let final {
                VStack(spacing: 10) {
                    HStack(spacing: 6) {
                        Image(systemName: "trophy.fill").font(.system(size: 12, weight: .bold))
                        Text(L("bracket.final")).font(GulfCupFonts.app(size: 12, weight: .black))
                    }
                    .foregroundStyle(GcTheme.sky)
                    .frame(maxWidth: .infinity)

                    NavigationLink {
                        GcMatchCenterScreen(fixture: final)
                    } label: {
                        bracketMatchCard(final, featured: true, badge: nil)
                    }
                    .buttonStyle(GcPressStyle())
                }
            }
        }
    }

    private func bracketMatchCard(_ fx: GcFixture, featured: Bool, badge: String?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let badge {
                    Text(badge)
                        .font(GulfCupFonts.app(size: 10, weight: .bold))
                        .foregroundStyle(GcTheme.skyDeep)
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(Capsule().fill(GcTheme.sky.opacity(0.14)))
                }
                Text(fx.matchNo.map { "#\($0)" } ?? "#—")
                    .font(GulfCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(GcTheme.sky)
                Spacer(minLength: 0)
                GcStatusPill(fixture: fx)
            }

            bracketTeams(fx)

            if !fx.venue.name.isEmpty || !fx.date.isEmpty {
                HStack(alignment: .top, spacing: 5) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 10, weight: .semibold))
                        .padding(.top, 1)
                    Text(venueLine(fx))
                        .font(GulfCupFonts.app(size: 11))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .foregroundStyle(GcTheme.inkDim)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .gcCard(stroke: featured ? GcTheme.sky.opacity(0.40) : GcTheme.line)
        .overlay(
            RoundedRectangle(cornerRadius: GcTheme.cardRadius, style: .continuous)
                .stroke(featured ? GcTheme.sky.opacity(0.22) : Color.clear, lineWidth: 1.5)
        )
    }

    private func venueLine(_ fx: GcFixture) -> String {
        let day = GcFormat.kickoffDay(fx.date)
        if fx.venue.name.isEmpty { return day }
        if day.isEmpty { return fx.venue.name }
        return "\(fx.venue.name) · \(day)"
    }

    private func bracketTeams(_ fx: GcFixture) -> some View {
        let started = fx.status.live || fx.status.finished
        return VStack(spacing: 8) {
            bracketTeamRow(fx.home, score: started ? fx.goals.home : nil)
            HStack {
                Rectangle().fill(GcTheme.line).frame(height: 1)
                Group {
                    if started {
                        Text("\(fx.goals.away ?? 0) - \(fx.goals.home ?? 0)")
                            .font(GulfCupFonts.app(size: 15, weight: .bold))
                            .foregroundStyle(fx.status.live ? GcTheme.liveRed : GcTheme.ink)
                            .monospacedDigit()
                            .environment(\.layoutDirection, .leftToRight)
                    } else {
                        Text(GcFormat.kickoffTime(fx.date))
                            .font(GulfCupFonts.app(size: 13, weight: .bold))
                            .foregroundStyle(GcTheme.ink)
                            .monospacedDigit()
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                .padding(.horizontal, 8)
                Rectangle().fill(GcTheme.line).frame(height: 1)
            }
            bracketTeamRow(fx.away, score: started ? fx.goals.away : nil)
        }
    }

    private func bracketTeamRow(_ team: GcTeam, score: Int?) -> some View {
        HStack(spacing: 10) {
            GcTeamLogo(logo: team.logo, size: 36)
            Text(team.name)
                .font(GulfCupFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(GcTheme.ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 4)
            if let score {
                Text("\(score)")
                    .font(GulfCupFonts.app(size: 18, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                    .monospacedDigit()
            }
        }
    }

    /// سهم سكاي بسيط من أنصاف النهائي إلى النهائي.
    private struct GcBracketDownArrow: View {
        var body: some View {
            VStack(spacing: 0) {
                Rectangle()
                    .fill(GcTheme.sky)
                    .frame(width: 3, height: 22)
                Image(systemName: "arrowtriangle.down.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(GcTheme.sky)
            }
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
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

    // MARK: الدليل — منتخبات + ملاعب

    @ViewBuilder private var guideSection: some View {
        GcSectionHeader(icon: "person.3.fill", title: L("teams.section.title"), count: store.teams.count, tint: GcTheme.sky)
        if store.teams.isEmpty && !store.loading {
            GcEmptyState(icon: "person.3", title: L("teams.empty.title"), subtitle: L("teams.empty.subtitle"))
        } else {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 10)], spacing: 10) {
                ForEach(store.teams) { t in
                    NavigationLink {
                        GcTeamProfileScreen(teamId: t.id, fallback: t)
                    } label: {
                        VStack(spacing: 8) {
                            GcTeamLogo(logo: t.logo, size: 46)
                            Text(t.name)
                                .font(GulfCupFonts.app(size: 11.5, weight: .bold))
                                .foregroundStyle(GcTheme.ink)
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
                                .frame(minHeight: 32, alignment: .top)
                            if t.id == GulfCupConstants.saudiTeamId {
                                Text(L("teams.host.badge"))
                                    .font(GulfCupFonts.app(size: 10, weight: .bold))
                                    .foregroundStyle(GcTheme.skyDeep)
                                    .padding(.horizontal, 8).padding(.vertical, 3)
                                    .background(Capsule().fill(GcTheme.sky.opacity(0.15)))
                            } else {
                                Color.clear.frame(height: 20)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(12)
                        .gcCard(radius: GcTheme.tileRadius)
                    }
                    .buttonStyle(GcPressStyle())
                }
            }
        }

        if let ov = store.overview, !ov.venues.isEmpty {
            GcSectionHeader(icon: "building.2.fill", title: L("venues.guide.title"), count: ov.venues.count, tint: GcTheme.sky)
            ForEach(Array(ov.venues.enumerated()), id: \.offset) { _, v in
                GcVenueGuideCard(venue: v)
            }
            VStack(alignment: .leading, spacing: 10) {
                tipRow(icon: "ticket.fill", text: "احجز تذاكرك مبكرًا عبر المنصات الرسمية — مباريات الأخضر تنفد أولًا")
                tipRow(icon: "clock.fill", text: "اوصل قبل الانطلاق بساعة ونصف — البوابات تزدحم قرب الصافرة")
                tipRow(icon: "car.fill", text: "استخدم المواقف المخصصة أو التوصيل — لا تعتمد على مواقف الشارع")
            }
            .padding(14)
            .gcCard()
        }
    }

    private func tipRow(icon: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(GcTheme.sky)
                .frame(width: 20)
            Text(text)
                .font(GulfCupFonts.app(size: 12))
                .foregroundStyle(GcTheme.inkDim)
                .frame(maxWidth: .infinity, alignment: .leading)
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
    case groups, bracket, scorers, guide, history
    var id: String { rawValue }
    var title: String {
        switch self {
        case .groups: return L("tournament.seg.groups")
        case .bracket: return L("tournament.seg.bracket")
        case .scorers: return L("tournament.seg.scorers")
        case .guide: return L("tournament.seg.guide")
        case .history: return L("tournament.seg.history")
        }
    }
    var icon: String {
        switch self {
        case .groups: return "rectangle.3.group"
        case .bracket: return "flag.checkered"
        case .scorers: return "soccerball"
        case .guide: return "map.fill"
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

/// بطاقة ملعب — سعة/افتتاح/وصف/خرائط مطابَقة بالاسم فوق بيانات الـ API.
struct GcVenueGuideCard: View {
    let venue: GcVenue

    private struct Guide {
        let match: String
        let nickname: String?
        let capacity: String
        let opened: String
        let blurb: String
        let mapsQuery: String
    }

    private static let guides: [Guide] = [
        Guide(
            match: "الملك عبدالله",
            nickname: "«الجوهرة المشعّة»",
            capacity: "62,345 مقعدًا",
            opened: "افتُتح 2014",
            blurb: "درّة الملاعب السعودية ومسرح الافتتاح والنهائي — تجربة حضور عالمية.",
            mapsQuery: "King Abdullah Sports City Jeddah"
        ),
        Guide(
            match: "الأمير عبدالله الفيصل",
            nickname: nil,
            capacity: "27,000 مقعد تقريبًا",
            opened: "أُعيد افتتاحه 2023 بعد تطوير شامل",
            blurb: "معقل الكرة الجداوية العريق في قلب المدينة — أجواء قريبة من المدرجات.",
            mapsQuery: "Prince Abdullah Al Faisal Stadium Jeddah"
        ),
    ]

    private var guide: Guide? {
        Self.guides.first { venue.name.contains($0.match) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(venue.name + (guide?.nickname.map { " \($0)" } ?? ""))
                        .font(GulfCupFonts.app(size: 14, weight: .bold))
                        .foregroundStyle(GcTheme.ink)
                        .lineLimit(2)
                    Text(venue.city)
                        .font(GulfCupFonts.app(size: 11))
                        .foregroundStyle(GcTheme.inkDim)
                }
                Spacer()
                Image(systemName: "sportscourt.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(GcTheme.sky)
                    .frame(width: 40, height: 40)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(GcTheme.sky.opacity(0.12)))
            }
            .padding(14)

            if let guide {
                Text(guide.blurb)
                    .font(GulfCupFonts.app(size: 12))
                    .foregroundStyle(GcTheme.inkDim)
                    .lineSpacing(3)
                    .padding(.horizontal, 14)
                HStack(spacing: 7) {
                    GcChip(text: guide.capacity, icon: "person.3.fill", tint: GcTheme.sky)
                    GcChip(text: guide.opened, icon: "clock.fill", tint: GcTheme.teal)
                }
                .padding(.horizontal, 14)
                .padding(.top, 10)
            }

            Button {
                let query = (guide?.mapsQuery ?? "\(venue.name) \(venue.city)")
                    .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
                if let url = URL(string: "https://maps.apple.com/?q=\(query)") {
                    UIApplication.shared.open(url)
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                        .font(.system(size: 12, weight: .semibold))
                    Text("الاتجاهات على الخرائط")
                        .font(GulfCupFonts.app(size: 12.5, weight: .bold))
                    Spacer()
                }
                .foregroundStyle(GcTheme.skyDeep)
                .padding(14)
            }
            .buttonStyle(GcPressStyle())
        }
        .gcCard()
    }
}
