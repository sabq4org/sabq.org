import SwiftUI

// الشاشة الرئيسية لتطبيق كأس آسيا — كل شيء في تمريرة تمرير واحدة، مطابق لبنية
// صفحة الويب (AcHero → AcSaudiSpotlight → AcGroups → AcSchedule → AcTeams →
// AcHostShowcase) لكن بهوية iOS. التحديث: .task أول ظهور + .refreshable للسحب.
struct AsianCupView: View {
    @State private var overview: AcOverview?
    @State private var fixtures: [AcFixture] = []
    @State private var teams: [AcTeam] = []
    @State private var groups: [AcGroup] = []
    @State private var loading = true
    @State private var loadError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    AcHero(overview: overview, loading: loading)

                    if let saudi = overview?.saudi, !saudi.fixtures.isEmpty || saudi.team != nil {
                        AcSaudiSpotlight(saudi: saudi)
                    }

                    AcGroupsSection(groups: groups)

                    AcScheduleSection(fixtures: fixtures)

                    AcTeamsSection(teams: teams)

                    if let ov = overview {
                        AcHostShowcase(overview: ov)
                    }

                    footerBrand
                }
                .padding(.vertical, 16)
            }
            .background(AcTheme.emeraldDeep.ignoresSafeArea())
            .navigationTitle("")
            .toolbar(.hidden, for: .navigationBar)
        }
        .task { await loadAll() }
        .refreshable { await loadAll(force: true) }
    }

    private var footerBrand: some View {
        VStack(spacing: 4) {
            Text("تغطية كاملة من السعودية")
                .font(AsianCupFonts.app(size: 12))
                .foregroundStyle(AcTheme.onDarkFaint)
            Text("sabq.org/asian-cup")
                .font(AsianCupFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(AcTheme.gold.opacity(0.7))
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private func loadAll(force: Bool = false) async {
        if !force { loading = true }
        async let o = APIClient.shared.fetchOverview(ignoreCache: force)
        async let f = APIClient.shared.fetchFixtures(ignoreCache: force)
        async let t = APIClient.shared.fetchTeams(ignoreCache: force)
        async let g = APIClient.shared.fetchStandings(ignoreCache: force)
        do {
            let (ov, fx, tm, gr) = try await (o, f, t, g)
            self.overview = ov
            self.fixtures = fx
            self.teams = tm
            self.groups = gr
            self.loadError = nil
        } catch {
            self.loadError = error.localizedDescription
        }
        self.loading = false
    }
}

// MARK: - Hero (العدّ التنازلي + مباراة اليوم)
struct AcHero: View {
    let overview: AcOverview?
    let loading: Bool

    var body: some View {
        VStack(spacing: 16) {
            headerStrip

            if let ov = overview {
                if !ov.started, let start = ov.startsAt {
                    AcCountdownCard(iso: start)
                } else if let next = ov.nextMatch {
                    AcNextMatchCard(fixture: next)
                }
                factsStrip(ov)
            } else if loading {
                AcLoading()
                    .frame(minHeight: 180)
            }
        }
        .padding(.horizontal, 16)
    }

    private var headerStrip: some View {
        VStack(spacing: 6) {
            Text("🏆")
                .font(.system(size: 56))
            Text(AsianCupConstants.tournamentName)
                .font(AsianCupFonts.app(size: 30, weight: .bold))
                .foregroundStyle(AcTheme.gold)
            if let ov = overview {
                Text(AcFormat.dateRange(startIso: ov.startsAt, endIso: ov.endsAt))
                    .font(AsianCupFonts.app(size: 13))
                    .foregroundStyle(AcTheme.onDarkDim)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private func factsStrip(_ ov: AcOverview) -> some View {
        HStack(spacing: 12) {
            fact("\(ov.teamsCount)", "منتخب")
            divider
            fact("\(ov.groupsCount)", "مجموعات")
            divider
            fact("\(ov.venues.count)", "ملاعب")
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                .fill(AcTheme.cardFill)
        )
    }

    private func fact(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(AsianCupFonts.app(size: 18, weight: .bold)).foregroundStyle(AcTheme.gold)
            Text(label).font(AsianCupFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity)
    }
    private var divider: some View { Rectangle().fill(AcTheme.outline).frame(width: 1, height: 28) }
}

// العدّ التنازلي الكبير — يُحدَّث كل ثانية.
struct AcCountdownCard: View {
    let iso: String

    var body: some View {
        VStack(spacing: 10) {
            Text("الانطلاق بعد")
                .font(AsianCupFonts.subhead(size: 14))
                .foregroundStyle(AcTheme.onDarkDim)

            TimelineView(.periodic(from: .now, by: 1)) { _ in
                let c = AcCountdownMath.to(iso: iso)
                HStack(spacing: 8) {
                    chip(c.days, "يوم")
                    chip(c.hours, "ساعة")
                    chip(c.minutes, "دقيقة")
                    chip(c.seconds, "ثانية")
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(AcTheme.heroGradient)
                .overlay(
                    RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                        .stroke(AcTheme.gold.opacity(0.25), lineWidth: 1)
                )
        )
    }

    private func chip(_ n: Int, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(String(format: "%02d", n))
                .font(AsianCupFonts.app(size: 26, weight: .bold))
                .foregroundStyle(AcTheme.onDark)
            Text(label)
                .font(AsianCupFonts.app(size: 10))
                .foregroundStyle(AcTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous)
                .fill(AcTheme.gold.opacity(0.10))
        )
    }
}

// مباراة اليوم / القادمة (قبل البطولة).
struct AcNextMatchCard: View {
    let fixture: AcFixture

    var body: some View {
        VStack(spacing: 12) {
            Text("المباراة القادمة")
                .font(AsianCupFonts.subhead(size: 13))
                .foregroundStyle(AcTheme.onDarkDim)

            HStack(spacing: 14) {
                teamSide(fixture.home)
                VStack(spacing: 2) {
                    Text(AcFormat.kickoffDay(fixture.date))
                        .font(AsianCupFonts.app(size: 11))
                        .foregroundStyle(AcTheme.onDarkDim)
                    Text(AcFormat.kickoffTime(fixture.date))
                        .font(AsianCupFonts.app(size: 20, weight: .bold))
                        .foregroundStyle(AcTheme.gold)
                }
                .frame(width: 90)
                teamSide(fixture.away)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(AcTheme.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                        .stroke(fixture.involvesSaudi ? AcTheme.gold.opacity(0.5) : AcTheme.outline, lineWidth: fixture.involvesSaudi ? 1.5 : 1)
                )
        )
    }

    private func teamSide(_ team: AcTeam) -> some View {
        VStack(spacing: 6) {
            AcTeamLogo(logo: team.logo, size: 48)
            Text(team.name)
                .font(AsianCupFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(AcTheme.onDark)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(height: 30)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - مشوار الأخضر (السعودية)
struct AcSaudiSpotlight: View {
    let saudi: AcSaudi

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "shield.fill", title: "مشوار الأخضر", subtitle: saudi.group ?? "المجموعة", tint: AcTheme.emeraldSoft)

            if let team = saudi.team {
                HStack(spacing: 12) {
                    AcTeamLogo(logo: team.logo, size: 56)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(team.name)
                            .font(AsianCupFonts.headline(size: 19))
                            .foregroundStyle(AcTheme.onDark)
                        if let g = saudi.group {
                            Text(g)
                                .font(AsianCupFonts.app(size: 12))
                                .foregroundStyle(AcTheme.onDarkDim)
                        }
                    }
                    Spacer()
                }
            }

            if saudi.fixtures.isEmpty {
                AcEmptyState(icon: "calendar.badge.exclamationmark", title: "ستُعلن مباريات الأخضر", subtitle: "عند تأكيد الجدول النهائي")
            } else {
                VStack(spacing: 10) {
                    ForEach(saudi.fixtures.prefix(3)) { f in
                        AcMatchCard(fixture: f, highlightsSaudi: true)
                    }
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(AcTheme.cardFill)
        )
        .padding(.horizontal, 16)
    }
}

// MARK: - المجموعات
struct AcGroupsSection: View {
    let groups: [AcGroup]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "rectangle.3.group", title: "المجموعات", subtitle: "\(groups.count) مجموعات — تأهّل الأول والثاني", tint: AcTheme.teal)

            if groups.isEmpty {
                AcEmptyState(icon: "trophy", title: "ستُعلن المجموعات", subtitle: "عقب القرعة الرسمية")
            } else {
                VStack(spacing: 12) {
                    ForEach(groups) { g in AcGroupCard(group: g) }
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

struct AcGroupCard: View {
    let group: AcGroup

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(group.name)
                .font(AsianCupFonts.headline(size: 16))
                .foregroundStyle(AcTheme.gold)
                .padding(.horizontal, 8)

            // رأس الجدول
            HStack(spacing: 10) {
                Text("#").font(AsianCupFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkFaint).frame(width: 20)
                Text("المنتخب").font(AsianCupFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkFaint)
                Spacer()
                Text("ف-ت-خ").font(AsianCupFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkFaint).frame(width: 52)
                Text("له:عليه").font(AsianCupFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkFaint).frame(width: 52)
                Text("ن").font(AsianCupFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkFaint).frame(width: 28)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 4)

            VStack(spacing: 2) {
                ForEach(group.rows) { row in
                    AcStandingRowView(row: row, highlightsSaudi: row.team.id == AsianCupConstants.saudiTeamId)
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(AcTheme.cardFill)
        )
    }
}

// MARK: - جدول المباريات
struct AcScheduleSection: View {
    let fixtures: [AcFixture]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "calendar", title: "المباريات", subtitle: "\(fixtures.count) مباراة في البطولة", tint: AcTheme.gold)

            if fixtures.isEmpty {
                AcEmptyState(icon: "sportscourt", title: "ستُعلن المباريات", subtitle: "الجدول الكامل قريبًا")
            } else {
                VStack(spacing: 14) {
                    ForEach(groupedByDay()) { day in
                        AcDayColumn(day: day)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private func groupedByDay() -> [AcDayGroup] {
        let grouped = Dictionary(grouping: fixtures) { AcFormat.kickoffDay($0.date) }
        return grouped.map { (day, items) in
            AcDayGroup(
                key: day,
                label: day,
                items: items.sorted {
                    let aSaudi = $0.involvesSaudi ? 0 : 1
                    let bSaudi = $1.involvesSaudi ? 0 : 1
                    return (aSaudi, $0.timestamp) < (bSaudi, $1.timestamp)
                }
            )
        }
        .sorted { ($0.items.first?.timestamp ?? 0) < ($1.items.first?.timestamp ?? 0) }
    }
}

// عمود يوم واحد في الجدول (مفصول لتسهيل type-checking).
struct AcDayColumn: View {
    let day: AcDayGroup

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(day.label)
                .font(AsianCupFonts.subhead(size: 14))
                .foregroundStyle(AcTheme.gold)
            ForEach(day.items) { f in
                AcMatchCard(fixture: f, highlightsSaudi: f.involvesSaudi)
            }
        }
    }
}

// MARK: - المنتخبات
struct AcTeamsSection: View {
    let teams: [AcTeam]

    private let cols = [GridItem(.adaptive(minimum: 76), spacing: 14)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "person.3.fill", title: "المنتخبات", subtitle: "\(teams.count) منتخبًا", tint: AcTheme.emeraldSoft)

            if teams.isEmpty {
                AcLoading()
            } else {
                LazyVGrid(columns: cols, spacing: 14) {
                    ForEach(teams) { t in AcTeamChip(team: t) }
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

struct AcTeamChip: View {
    let team: AcTeam

    var body: some View {
        VStack(spacing: 6) {
            AcTeamLogo(logo: team.logo, size: 50)
            Text(team.name)
                .font(AsianCupFonts.app(size: 11, weight: .medium))
                .foregroundStyle(AcTheme.onDark)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(height: 28)
        }
        .frame(width: 76)
    }
}

// MARK: - الدول المضيفة (الملاعب)
struct AcHostShowcase: View {
    let overview: AcOverview

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AcSectionHeader(icon: "mappin.and.ellipse", title: "المضيف: \(overview.host)", subtitle: "\(overview.venues.count) ملاعب", tint: AcTheme.gold)

            if overview.venues.isEmpty {
                AcEmptyState(icon: "building.2", title: "ستُعلن الملاعب", subtitle: "عند تأكيدها رسميًا")
            } else {
                VStack(spacing: 8) {
                    ForEach(overview.venues, id: \.name) { v in
                        HStack(spacing: 10) {
                            Image(systemName: "location.fill")
                                .foregroundStyle(AcTheme.gold)
                                .font(.system(size: 13))
                            VStack(alignment: .leading, spacing: 1) {
                                Text(v.name).font(AsianCupFonts.app(size: 13, weight: .semibold)).foregroundStyle(AcTheme.onDark)
                                Text(v.city).font(AsianCupFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 6)
                        .padding(.horizontal, 12)
                        .background(RoundedRectangle(cornerRadius: 10).fill(AcTheme.cardFill))
                    }
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius).fill(AcTheme.cardFill))
        .padding(.horizontal, 16)
    }
}
