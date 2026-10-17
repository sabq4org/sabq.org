import SwiftUI

// MARK: - «مباريات اليوم» لكل البطولات — نقل /sports/matches و/sports/live
//
// أمس / اليوم / غدًا، مجمّعة بالبطولة (السعودية أولًا ثم الكبرى)، والجارية أولًا
// داخل كل بطولة. تتحدّث كل 30 ثانية أثناء وجود مباراة جارية. اللمس يفتح مركز
// المباراة العام (`/api/sports/match/:id`). وفي الذيل باب تطبيق VARA.

struct SportsTodayView: View {
    enum Day: Int, CaseIterable, Identifiable {
        case yesterday = -1, today = 0, tomorrow = 1
        var id: Int { rawValue }
        var label: String {
            switch self {
            case .yesterday: "أمس"
            case .today: "اليوم"
            case .tomorrow: "غدًا"
            }
        }
    }

    @State private var day: Day = .today
    @State private var fixtures: [SpTodayFixture] = []
    @State private var competitions: [SpCompetitionInfo] = []
    @State private var loaded = false
    @State private var loadError: String?
    @State private var matchSheetId = 0
    @State private var showMatch = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                Picker("اليوم", selection: $day) {
                    ForEach(Day.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)

                if !loaded {
                    SkeletonBox(height: 280, radius: SabqRadius.medium)
                } else if let loadError, fixtures.isEmpty {
                    EmptyStateView(icon: "sportscourt", tint: SabqTheme.textSecondary, title: "تعذّر تحميل المباريات",
                                   subtitle: loadError, action: { Task { await load() } }, actionTitle: "أعد المحاولة")
                } else if fixtures.isEmpty {
                    EmptyStateView(icon: "sportscourt", tint: SabqTheme.textSecondary, title: "لا مباريات \(day.label)",
                                   subtitle: "جرّب يومًا آخر، أو تابع البطولات من بطاقاتها في الرئيسية.", action: nil, actionTitle: nil)
                } else {
                    ForEach(groups, id: \.slug) { group in
                        competitionSection(group)
                    }
                }

                varaCard
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, 120)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .navigationTitle("مباريات \(day.label)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(SabqTheme.background, for: .navigationBar)
        .refreshable { await load() }
        .sabqRTL()
        .task(id: day) {
            loaded = false
            await load()
            // نبض أثناء وجود مباراة جارية فقط (الويب يتوقف عن النبض حين تخلو القائمة).
            while !Task.isCancelled, day == .today {
                let anyLive = fixtures.contains { $0.status.live }
                try? await Task.sleep(for: .seconds(anyLive ? 30 : 120))
                if Task.isCancelled { return }
                await load()
            }
        }
        .sheet(isPresented: $showMatch) {
            RoshnMatchCenterSheet(fixtureId: $matchSheetId)
        }
    }

    private func load() async {
        let date = day == .today ? nil : Self.isoDate(offset: day.rawValue)
        async let todayTask = APIClient.shared.fetchSportsToday(date: date)
        async let compsTask = try? APIClient.shared.fetchSportsCompetitions()
        do {
            fixtures = try await todayTask.today
            loadError = nil
        } catch {
            loadError = ReaderErrorMessage.message(for: error, fallback: "تعذّر الوصول إلى مصدر المباريات الآن")
        }
        if let comps = await compsTask, !comps.isEmpty { competitions = comps }
        loaded = true
    }

    private static func isoDate(offset: Int) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Riyadh")!
        let d = cal.date(byAdding: .day, value: offset, to: .now) ?? .now
        let c = cal.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    // MARK: Grouping

    private struct Group { let slug: String; let name: String; let logo: String?; let fixtures: [SpTodayFixture] }

    private var groups: [Group] {
        let saudi = SportsHeadline.saudiSlugs(competitions)
        let order = Dictionary(uniqueKeysWithValues: competitions.enumerated().map { ($1.slug, $0) })
        let bySlug = Dictionary(grouping: fixtures) { $0.competitionSlug ?? ($0.competition ?? "other") }
        return bySlug.map { slug, items in
            let sorted = items.sorted {
                ($0.status.live ? 0 : 1, $0.timestamp) < ($1.status.live ? 0 : 1, $1.timestamp)
            }
            let comp = competitions.first { $0.slug == slug }
            return Group(slug: slug, name: comp?.name ?? items.first?.competition ?? slug, logo: comp?.logo, fixtures: sorted)
        }
        .sorted { a, b in
            let aLive = a.fixtures.contains { $0.status.live } ? 0 : 1
            let bLive = b.fixtures.contains { $0.status.live } ? 0 : 1
            let aSaudi = saudi.contains(a.slug) ? 0 : 1
            let bSaudi = saudi.contains(b.slug) ? 0 : 1
            return (aLive, aSaudi, order[a.slug] ?? 999) < (bLive, bSaudi, order[b.slug] ?? 999)
        }
    }

    // MARK: Views

    private func competitionSection(_ group: Group) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                if let logo = group.logo, !logo.isEmpty {
                    WCRemoteImage(url: logo)
                        .frame(width: 22, height: 22)
                        .accessibilityHidden(true)
                }
                Text(group.name)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Text(verbatim: "\(group.fixtures.count)")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
            VStack(spacing: 0) {
                ForEach(group.fixtures) { f in
                    if f.id != group.fixtures.first?.id {
                        Rectangle().fill(SabqTheme.separator).frame(height: 1)
                    }
                    Button {
                        matchSheetId = f.id
                        showMatch = true
                    } label: { SportsFixtureRow(fixture: f) }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, SabqLayout.space12)
            .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        }
    }

    private var varaCard: some View {
        Button { openURL(VaraApp.appStoreURL) } label: {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "bell.badge")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                    .frame(width: 44, height: 44)
                    .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("تطبيق VARA الرياضي")
                        .font(SabqType.rowTitle.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text("تنبيهات الأهداف لفرقك، ومراكز المباريات الكاملة، والانتقالات والتوقعات.")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.left").font(SabqType.tag.font).foregroundStyle(SabqTheme.textTertiary)
            }
            .padding(SabqLayout.space12)
            .background(SabqTheme.skyTint, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).stroke(SabqTheme.skyOutline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .padding(.top, SabqLayout.space8)
    }
}

/// صف مباراة: المضيف يمينًا، والنتيجة داخل LTR بالضيف أولًا فيقع رقم المضيف يمينًا.
struct SportsFixtureRow: View {
    let fixture: SpTodayFixture

    var body: some View {
        HStack(spacing: SabqLayout.space8) {
            team(fixture.home, alignment: .leading)
            center.frame(minWidth: 76)
            team(fixture.away, alignment: .trailing)
        }
        .padding(.vertical, SabqLayout.space12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private func team(_ t: SpTodayTeam, alignment: Alignment) -> some View {
        HStack(spacing: 6) {
            if alignment == .trailing { Spacer(minLength: 0) }
            if alignment == .leading { logo(t) }
            Text(t.name)
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            if alignment == .trailing { logo(t) }
            if alignment == .leading { Spacer(minLength: 0) }
        }
        .frame(maxWidth: .infinity)
    }

    private func logo(_ t: SpTodayTeam) -> some View {
        RoshnTeamLogo(url: t.logo ?? "", size: 24)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private var center: some View {
        VStack(spacing: 2) {
            if fixture.started {
                Text(verbatim: "\(fixture.goals?.away ?? 0) - \(fixture.goals?.home ?? 0)")
                    .font(SabqFonts.app(size: 17, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.textPrimary)
                    .environment(\.layoutDirection, .leftToRight)
                if fixture.status.live {
                    HStack(spacing: 4) {
                        Circle().fill(SabqTheme.breaking).frame(width: 6, height: 6)
                        Text(fixture.status.minuteText ?? "مباشر")
                    }
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.breaking)
                } else {
                    Text(fixture.status.label ?? "انتهت")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            } else {
                Text(SportsHeadline.kickoffText(fixture.kickoff))
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(SabqTheme.primary)
                if let label = fixture.status.label, fixture.status.code != "NS" {
                    Text(label).font(SabqType.tag.font).foregroundStyle(SabqTheme.textTertiary)
                }
            }
        }
    }

    private var accessibilityText: String {
        if fixture.started {
            let state = fixture.status.live ? "مباشر \(fixture.status.minuteText ?? "")" : (fixture.status.label ?? "انتهت")
            return "\(fixture.home.name) \(fixture.goals?.home ?? 0)، \(fixture.away.name) \(fixture.goals?.away ?? 0)، \(state)"
        }
        return "\(fixture.home.name) ضد \(fixture.away.name)، \(SportsHeadline.kickoffText(fixture.kickoff))"
    }
}
