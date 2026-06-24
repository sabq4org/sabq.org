import SwiftUI

// تفاصيل بطولة — ثلاثة مقاطع: المباريات (مباشر/اليوم/قادمة/نتائج) · الترتيب ·
// الهدّافون. تُخفى التبويبات غير المدعومة (كؤوس بلا ترتيب/هدّافين).
struct CompetitionDetailView: View {
    let comp: SpCompetition

    private enum Segment: String, CaseIterable { case matches, standings, scorers
        var label: String {
            switch self {
            case .matches: return "المباريات"
            case .standings: return "الترتيب"
            case .scorers: return "الهدّافون"
            }
        }
    }

    @State private var segment: Segment = .matches
    @State private var matches: SpMatchesResponse?
    @State private var standings: [SpStandingRow] = []
    @State private var scorers: [SpScorer] = []
    @State private var loading = true
    @State private var loadError: String?

    private var segments: [Segment] {
        var s: [Segment] = [.matches]
        if comp.hasStandings { s.append(.standings) }
        if comp.hasScorers { s.append(.scorers) }
        return s
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if segments.count > 1 { picker }

                if loading {
                    SpLoading()
                } else if let loadError {
                    SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                } else {
                    switch segment {
                    case .matches: matchesContent
                    case .standings: standingsContent
                    case .scorers: scorersContent
                    }
                }
            }
            .padding(16)
        }
        .background(SpAmbientBackground())
        .navigationTitle(comp.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task { await loadAll() }
        .refreshable { await loadAll(force: true) }
    }

    private var picker: some View {
        Picker("", selection: $segment) {
            ForEach(segments, id: \.self) { s in Text(s.label).tag(s) }
        }
        .pickerStyle(.segmented)
    }

    // MARK: - المباريات

    @ViewBuilder private var matchesContent: some View {
        if let m = matches {
            let hasAny = !(m.live.isEmpty && m.today.isEmpty && m.upcoming.isEmpty && m.results.isEmpty)
            if hasAny {
                VStack(alignment: .leading, spacing: 18) {
                    matchBucket("مباشر", m.live, tint: SpTheme.crimson, icon: "dot.radiowaves.left.and.right")
                    matchBucket("اليوم", m.today, tint: SpTheme.gold, icon: "calendar")
                    matchBucket("قادمة", m.upcoming, tint: SpTheme.greenSoft, icon: "clock")
                    matchBucket("نتائج", m.results, tint: SpTheme.onDarkDim, icon: "checkmark.seal")
                }
            } else {
                SpEmptyState(icon: "sportscourt", title: "لا مباريات", subtitle: "لا توجد مباريات متاحة حاليًا لهذه البطولة")
            }
        }
    }

    @ViewBuilder private func matchBucket(_ title: String, _ items: [SpFixture], tint: Color, icon: String) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SpSectionHeader(icon: icon, title: title, count: items.count, tint: tint)
                ForEach(items) { f in SpMatchCard(fixture: f) }
            }
        }
    }

    // MARK: - الترتيب

    @ViewBuilder private var standingsContent: some View {
        if standings.isEmpty {
            SpEmptyState(icon: "list.number", title: "لا يتوفّر ترتيب", subtitle: "قد يكون الموسم لم يبدأ بعد")
        } else {
            VStack(spacing: 0) {
                standingsHeader
                ForEach(Array(standings.enumerated()), id: \.element.id) { idx, row in
                    if idx > 0 {
                        Rectangle().fill(SpTheme.outline.opacity(0.5)).frame(height: 1).padding(.leading, 16)
                    }
                    standingRow(row)
                }
            }
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                    .fill(SpTheme.surfaceRaised)
                    .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
            )
        }
    }

    private var standingsHeader: some View {
        HStack(spacing: 0) {
            Text("#").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint).frame(width: 28)
            Text("النادي").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("لعب").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint).frame(width: 38)
            Text("+/-").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint).frame(width: 42)
            Text("نقاط").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint).frame(width: 42)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
    }

    private func standingRow(_ row: SpStandingRow) -> some View {
        HStack(spacing: 0) {
            Text("\(row.rank)")
                .font(SportsFonts.app(size: 12, weight: .bold))
                .foregroundStyle(row.rank <= 3 ? SpTheme.greenSoft : SpTheme.onDarkFaint)
                .monospacedDigit().frame(width: 28)
            HStack(spacing: 10) {
                SpTeamLogo(logo: row.team.logo, size: 26)
                Text(row.team.name)
                    .font(SportsFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(row.played)").font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDarkDim).monospacedDigit().frame(width: 38)
            Text(diff(row)).font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDarkDim).monospacedDigit().frame(width: 42)
                .environment(\.layoutDirection, .leftToRight)
            Text("\(row.points)").font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark).monospacedDigit().frame(width: 42)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private func diff(_ row: SpStandingRow) -> String {
        row.goalsDiff > 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)"
    }

    // MARK: - الهدّافون

    @ViewBuilder private var scorersContent: some View {
        if scorers.isEmpty {
            SpEmptyState(icon: "soccerball", title: "لا يتوفّر هدّافون", subtitle: "قد يكون الموسم لم يبدأ بعد")
        } else {
            VStack(spacing: 10) {
                ForEach(scorers) { s in scorerRow(s) }
            }
        }
    }

    private func scorerRow(_ s: SpScorer) -> some View {
        HStack(spacing: 12) {
            Text("\(s.rank)")
                .font(SportsFonts.app(size: 13, weight: .bold))
                .foregroundStyle(s.rank <= 3 ? SpTheme.gold : SpTheme.onDarkFaint)
                .frame(width: 22)
            SpTeamLogo(logo: s.team.logo, size: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(s.name).font(SportsFonts.app(size: 14, weight: .semibold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                Text(s.team.name).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
            }
            Spacer(minLength: 0)
            VStack(spacing: 1) {
                Text("\(s.goals)").font(SportsFonts.app(size: 18, weight: .bold)).foregroundStyle(SpTheme.gold).monospacedDigit()
                Text("هدف").font(SportsFonts.app(size: 9)).foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(SpTheme.cardFill)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
        )
    }

    // MARK: - التحميل

    private func loadAll(force: Bool = false) async {
        if !force { loading = true }
        do {
            self.matches = try await APIClient.shared.fetchMatches(comp: comp.slug, ignoreCache: force)
            if comp.hasStandings {
                self.standings = (try? await APIClient.shared.fetchStandings(comp: comp.slug, ignoreCache: force))?.standings ?? []
            }
            if comp.hasScorers {
                self.scorers = (try? await APIClient.shared.fetchScorers(comp: comp.slug, ignoreCache: force))?.scorers ?? []
            }
            self.loadError = nil
        } catch {
            self.loadError = error.localizedDescription
        }
        self.loading = false
    }
}
