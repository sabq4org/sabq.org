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
                        AcSaudiSpotlight(saudi: saudi).acReveal(delay: 0.05)
                    }

                    AcGroupsSection(groups: groups).acReveal(delay: 0.10)

                    AcScheduleSection(fixtures: fixtures).acReveal(delay: 0.15)

                    AcTeamsSection(teams: teams).acReveal(delay: 0.20)

                    if let ov = overview {
                        AcHostShowcase(overview: ov).acReveal(delay: 0.25)
                    }

                    footerBrand
                }
                .padding(.vertical, 16)
            }
            .background(AcAmbientBackground())
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
                if ov.started {
                    liveBanner
                }
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
        VStack(spacing: 12) {
            AcEmblem(height: 138)

            HStack(spacing: 8) {
                AcHeroBadge(icon: "trophy.fill", text: "تغطية خاصة", tint: AcTheme.gold)
                AcHeroBadge(icon: "mappin.circle.fill", text: "تستضيفها السعودية", tint: AcTheme.emeraldSoft)
            }

            AcTournamentTitle()

            if let ov = overview {
                HStack(spacing: 6) {
                    Image(systemName: "calendar")
                        .font(.system(size: 12))
                        .foregroundStyle(AcTheme.gold)
                    Text(AcFormat.dateRange(startIso: ov.startsAt, endIso: ov.endsAt))
                        .font(AsianCupFonts.app(size: 13))
                        .foregroundStyle(AcTheme.onDarkDim)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private var liveBanner: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let on = Int(ctx.date.timeIntervalSinceReferenceDate) % 2 == 0
            HStack(spacing: 8) {
                Circle()
                    .fill(AcTheme.crimson)
                    .frame(width: 9, height: 9)
                    .opacity(on ? 1 : 0.35)
                Text("البطولة جارية — التغطية الحيّة الآن")
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .background(Capsule().fill(AcTheme.crimson.opacity(0.18)))
            .overlay(Capsule().stroke(AcTheme.crimson.opacity(0.4), lineWidth: 1))
        }
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

// العدّ التنازلي — تصميم مسطّح عصري: خلايا زجاجية رفيعة + أرقام بتدرّج أبيض↔زمردي،
// بلا حشوة ذهبية أو خطوط تعطي إحساسًا ثري-دي/قديمًا.
struct AcCountdownCard: View {
    let iso: String

    private var numberGradient: LinearGradient {
        LinearGradient(colors: [.white, AcTheme.emeraldSoft.opacity(0.9)],
                       startPoint: .top, endPoint: .bottom)
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "timer").font(.system(size: 11, weight: .semibold))
                Text("الانطلاق بعد")
                    .font(AsianCupFonts.app(size: 12, weight: .semibold))
                    .tracking(1)
            }
            .foregroundStyle(AcTheme.onDarkDim)

            TimelineView(.periodic(from: .now, by: 1)) { _ in
                let c = AcCountdownMath.to(iso: iso)
                HStack(spacing: 10) {
                    cell(c.days, "يوم")
                    cell(c.hours, "ساعة")
                    cell(c.minutes, "دقيقة")
                    cell(c.seconds, "ثانية")
                }
                .environment(\.layoutDirection, .leftToRight)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func cell(_ n: Int, _ label: String) -> some View {
        VStack(spacing: 6) {
            Text(String(format: "%02d", n))
                .font(AsianCupFonts.app(size: 32, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(numberGradient)
                .contentTransition(.numericText(countsDown: true))
            Text(label)
                .font(AsianCupFonts.app(size: 10))
                .foregroundStyle(AcTheme.onDarkFaint)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.05))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
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

// MARK: - مشوار الأخضر (بطاقة مضيف أنيقة مسطّحة)
struct AcSaudiSpotlight: View {
    let saudi: AcSaudi

    var body: some View {
        VStack(spacing: 16) {
            header
            if !saudi.fixtures.isEmpty {
                fixturesBlock
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(AcTheme.surfaceRaised)
                .overlay(alignment: .topLeading) {
                    // وهج زمردي خفيف في الزاوية بدل التدرّج الثقيل
                    Circle()
                        .fill(AcTheme.emeraldSoft.opacity(0.18))
                        .frame(width: 200, height: 200)
                        .blur(radius: 70)
                        .offset(x: -40, y: -60)
                }
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(AcTheme.outline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .padding(.horizontal, 16)
    }

    private var header: some View {
        HStack(spacing: 14) {
            if let team = saudi.team {
                AcTeamLogo(logo: team.logo, size: 64)
            }
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 5) {
                    Image(systemName: "star.fill").font(.system(size: 10))
                    Text("المنتخب المضيف").font(AsianCupFonts.app(size: 11, weight: .bold))
                }
                .foregroundStyle(AcTheme.gold)

                Text(saudi.team?.name ?? "السعودية")
                    .font(AsianCupFonts.app(size: 22, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                Text(saudi.group.map { "ضمن \($0)" } ?? "يقود الحلم الآسيوي على أرضه")
                    .font(AsianCupFonts.app(size: 12))
                    .foregroundStyle(AcTheme.onDarkDim)
            }
            Spacer(minLength: 0)
        }
    }

    private var fixturesBlock: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Rectangle().fill(AcTheme.gold).frame(width: 3, height: 14).clipShape(Capsule())
                Text("مباريات الأخضر")
                    .font(AsianCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
            }
            ForEach(saudi.fixtures.prefix(6)) { f in
                AcMatchCard(fixture: f, highlightsSaudi: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - المجموعات والترتيب (جدول نظيف بـ4 أعمدة + رأس متدرّج + شارات رتبة)
struct AcGroupsSection: View {
    let groups: [AcGroup]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AcSectionHeader(icon: "rectangle.3.group", title: "المجموعات والترتيب", count: groups.isEmpty ? nil : groups.count, tint: AcTheme.teal)

            if groups.isEmpty {
                AcEmptyState(icon: "trophy", title: "ستُعلن المجموعات", subtitle: "عقب القرعة الرسمية")
            } else {
                VStack(spacing: 14) {
                    ForEach(groups) { g in AcGroupCard(group: g) }
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

struct AcGroupCard: View {
    let group: AcGroup

    private var started: Bool { group.rows.contains { $0.played > 0 } }

    var body: some View {
        VStack(spacing: 0) {
            // رأس نظيف: شريط زمردي صغير + اسم المجموعة + شارة «لم تبدأ» خفيفة
            HStack(spacing: 9) {
                Rectangle().fill(AcTheme.emeraldSoft).frame(width: 3, height: 16).clipShape(Capsule())
                Text(group.name.isEmpty ? "مجموعة" : group.name)
                    .font(AsianCupFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                Spacer()
                if !started {
                    Text("لم تبدأ")
                        .font(AsianCupFonts.app(size: 10, weight: .semibold))
                        .foregroundStyle(AcTheme.onDarkDim)
                        .padding(.horizontal, 9).padding(.vertical, 3)
                        .background(Capsule().fill(AcTheme.chipFill))
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 10)

            // رأس الأعمدة
            HStack(spacing: 0) {
                Text("المنتخب").font(AsianCupFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkFaint)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("لعب").font(AsianCupFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkFaint).frame(width: 38)
                Text("+/-").font(AsianCupFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkFaint).frame(width: 42)
                Text("نقاط").font(AsianCupFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkFaint).frame(width: 42)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 4)

            ForEach(Array(group.rows.enumerated()), id: \.element.id) { index, row in
                if index > 0 {
                    Rectangle().fill(AcTheme.outline.opacity(0.5)).frame(height: 1).padding(.leading, 16)
                }
                AcGroupRow(row: row, started: started)
            }
        }
        .padding(.bottom, 8)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(AcTheme.surfaceRaised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(AcTheme.outline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

// صفّ ترتيب واحد: شريط تأهّل زمردي رفيع + رتبة + شعار + اسم | لعب | +/- | نقاط.
struct AcGroupRow: View {
    let row: AcStandingRow
    let started: Bool

    private var isSaudi: Bool { row.team.id == AsianCupConstants.saudiTeamId }
    private var qualifying: Bool { started && row.rank <= 2 }

    var body: some View {
        HStack(spacing: 0) {
            // مؤشّر التأهّل (شريط زمردي رفيع على حافة الصفّ)
            Rectangle()
                .fill(qualifying ? AcTheme.emeraldSoft : Color.clear)
                .frame(width: 3)
                .clipShape(Capsule())
                .padding(.vertical, 4)

            HStack(spacing: 10) {
                Text("\(row.rank)")
                    .font(AsianCupFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(qualifying ? AcTheme.emeraldSoft : AcTheme.onDarkFaint)
                    .monospacedDigit()
                    .frame(width: 16)
                AcTeamLogo(logo: row.team.logo, size: 26)
                Text(row.team.name)
                    .font(AsianCupFonts.app(size: 13, weight: isSaudi ? .bold : .semibold))
                    .foregroundStyle(isSaudi ? AcTheme.gold : AcTheme.onDark)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text("\(row.played)")
                .font(AsianCupFonts.app(size: 13)).foregroundStyle(AcTheme.onDarkDim)
                .monospacedDigit().frame(width: 38)
            Text(diffText)
                .font(AsianCupFonts.app(size: 13)).foregroundStyle(AcTheme.onDarkDim)
                .monospacedDigit().frame(width: 42)
                .environment(\.layoutDirection, .leftToRight)
            Text("\(row.points)")
                .font(AsianCupFonts.app(size: 15, weight: .bold)).foregroundStyle(AcTheme.onDark)
                .monospacedDigit().frame(width: 42)
        }
        .padding(.trailing, 16)
        .padding(.vertical, 10)
        .background(isSaudi ? AcTheme.gold.opacity(0.06) : Color.clear)
    }

    private var diffText: String {
        row.goalsDiff > 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)"
    }
}

// MARK: - جدول المباريات (مرشّحات أدوار + تجميع باليوم — مطابق للويب)
struct AcScheduleSection: View {
    let fixtures: [AcFixture]
    @State private var activeRound: String? = nil

    private var rounds: [String] {
        var seen: [String] = []
        for f in fixtures where !f.round.isEmpty && !seen.contains(f.round) { seen.append(f.round) }
        return seen
    }

    private var filtered: [AcFixture] {
        guard let activeRound else { return fixtures }
        return fixtures.filter { $0.round == activeRound }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AcSectionHeader(icon: "calendar", title: "جدول المباريات", count: fixtures.isEmpty ? nil : fixtures.count, tint: AcTheme.gold)

            if rounds.count > 1 {
                roundFilter
            }

            if fixtures.isEmpty {
                AcEmptyState(icon: "sportscourt", title: "ستُعلن المباريات", subtitle: "الجدول الكامل قريبًا")
            } else {
                VStack(spacing: 18) {
                    ForEach(groupedByDay()) { day in
                        AcDayColumn(day: day)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private var roundFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                roundChip(title: "الكل", value: nil)
                ForEach(rounds, id: \.self) { r in
                    roundChip(title: r, value: r)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func roundChip(title: String, value: String?) -> some View {
        let active = activeRound == value
        return Button {
            withAnimation(.easeOut(duration: 0.2)) { activeRound = value }
        } label: {
            Text(title)
                .font(AsianCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(active ? AcTheme.emeraldDeep : AcTheme.onDarkDim)
                .padding(.horizontal, 16).padding(.vertical, 8)
                .background(
                    Capsule().fill(active ? AcTheme.gold : AcTheme.chipFill)
                )
        }
        .buttonStyle(.plain)
    }

    private func groupedByDay() -> [AcDayGroup] {
        let grouped = Dictionary(grouping: filtered) { AcFormat.kickoffDay($0.date) }
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

// عمود يوم واحد في الجدول — عنوان (نقطة + يوم + عدد) ثم بطاقات.
struct AcDayColumn: View {
    let day: AcDayGroup

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Circle().fill(AcTheme.gold).frame(width: 8, height: 8)
                Text(day.label)
                    .font(AsianCupFonts.subhead(size: 14))
                    .foregroundStyle(AcTheme.onDark)
                Text("(\(day.items.count))")
                    .font(AsianCupFonts.app(size: 12))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
            ForEach(day.items) { f in
                AcMatchCard(fixture: f, highlightsSaudi: f.involvesSaudi)
            }
        }
    }
}

// MARK: - المنتخبات المتأهّلة (بطاقات + شارة مضيف)
struct AcTeamsSection: View {
    let teams: [AcTeam]

    private let cols = [GridItem(.adaptive(minimum: 100), spacing: 12)]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AcSectionHeader(icon: "person.3.fill", title: "المنتخبات المتأهّلة", count: teams.isEmpty ? nil : teams.count, tint: AcTheme.emeraldSoft)

            if teams.isEmpty {
                AcEmptyState(icon: "person.3", title: "ستظهر المنتخبات", subtitle: "فور اكتمال التصفيات والقرعة")
            } else {
                LazyVGrid(columns: cols, spacing: 12) {
                    ForEach(teams) { t in AcTeamChip(team: t) }
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

struct AcTeamChip: View {
    let team: AcTeam

    private var isHost: Bool { team.id == AsianCupConstants.saudiTeamId }

    var body: some View {
        VStack(spacing: 10) {
            AcTeamLogo(logo: team.logo, size: 54)
            Text(team.name)
                .font(AsianCupFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(AcTheme.onDark)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(height: 30)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(isHost ? AcTheme.gold.opacity(0.08) : AcTheme.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(isHost ? AcTheme.gold.opacity(0.5) : AcTheme.outline, lineWidth: isHost ? 1.5 : 1)
                )
        )
        .overlay(alignment: .topTrailing) {
            if isHost {
                HStack(spacing: 3) {
                    Image(systemName: "star.fill").font(.system(size: 8))
                    Text("مضيف").font(AsianCupFonts.app(size: 9, weight: .bold))
                }
                .foregroundStyle(AcTheme.emeraldDeep)
                .padding(.horizontal, 7).padding(.vertical, 3)
                .background(Capsule().fill(AcTheme.gold))
                .padding(6)
            }
        }
    }
}

// MARK: - ملاعب الاستضافة
struct AcHostShowcase: View {
    let overview: AcOverview

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            AcSectionHeader(icon: "building.2.fill", title: "ملاعب الاستضافة", count: overview.venues.isEmpty ? nil : overview.venues.count, tint: AcTheme.gold)

            if overview.venues.isEmpty {
                AcEmptyState(icon: "building.2", title: "ستُعلن الملاعب", subtitle: "عند تأكيدها رسميًا")
            } else {
                VStack(spacing: 10) {
                    ForEach(overview.venues, id: \.name) { v in
                        HStack(spacing: 12) {
                            Image(systemName: "mappin.and.ellipse")
                                .font(.system(size: 18))
                                .foregroundStyle(AcTheme.gold)
                                .frame(width: 42, height: 42)
                                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(AcTheme.gold.opacity(0.12)))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(v.name).font(AsianCupFonts.app(size: 14, weight: .bold)).foregroundStyle(AcTheme.onDark)
                                if !v.city.isEmpty {
                                    Text(v.city).font(AsianCupFonts.app(size: 12)).foregroundStyle(AcTheme.onDarkDim)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(AcTheme.cardFill)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(AcTheme.outline, lineWidth: 1)
                                )
                        )
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }
}
