import SwiftUI

// «عالمية» — كل مباريات العالم الجارية الآن (/sports/world-live) مجمّعة حسب
// البطولة/الدولة: بطولاتنا السعودية أولًا (rank0) ثم بطولاتنا (rank1) ثم بقية
// العالم حسب الدولة. كان سابقًا تبويب «مباشر العالم» داخل «المباشر»؛ أُفرد كتبويب
// مستقل باسم «عالمية» (تبويب «المباريات» الجديد يغطّي جدول المونديال بالتواريخ).
// (اسم البنية `LiveView` محفوظ لتفادي مساس pbxproj — دلالته الآن «عالمية».)
struct LiveView: View {
    @State private var world: [SpWorldLiveItem] = []
    @State private var catBySlug: [String: String] = [:]
    @State private var loading = true
    @State private var loadError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 28)
            }
            .autoHideTabBar()
            .background(SpAmbientBackground())
            .navigationTitle("")
            .toolbar(.hidden, for: .navigationBar)
        }
        .task { await load() }
        .task { await pollLive() }
        .refreshable { await load(force: true) }
    }

    @ViewBuilder private var content: some View {
        if loading {
            SpLoading()
        } else if let loadError {
            SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
        } else if world.isEmpty {
            SpEmptyState(icon: "globe",
                         title: "لا مباريات مباشرة عالميًا الآن",
                         subtitle: "ستظهر هنا أي مباراة جارية الآن حول العالم")
        } else {
            overviewStrip
            ForEach(worldCategorySections) { section in
                VStack(alignment: .leading, spacing: 12) {
                    categoryHeader(section)
                    ForEach(section.groups) { g in
                        worldGroupSection(g)
                    }
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: "globe")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(SpTheme.green)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(SpTheme.green.opacity(0.10)))
                VStack(alignment: .leading, spacing: 2) {
                    Text("عالمية")
                        .font(SportsFonts.headline(size: 24))
                        .foregroundStyle(SpTheme.onDark)
                    Text("المباريات الجارية حول العالم مرتبة حسب الأهمية والمنطقة")
                        .font(SportsFonts.app(size: 11.5, weight: .semibold))
                        .foregroundStyle(SpTheme.onDarkDim)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                if liveNowCount > 0 { quietLiveBadge("\(liveNowCount)") }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var liveNowCount: Int { world.filter { $0.fixture.status.live }.count }

    private var overviewStrip: some View {
        HStack(spacing: 8) {
            summaryChip(icon: "dot.radiowaves.left.and.right", title: "مباشرة", value: "\(liveNowCount)", tint: SpTheme.green)
            summaryChip(icon: "trophy", title: "بطولات", value: "\(worldGroups.count)", tint: SpTheme.gold)
            summaryChip(icon: "map", title: "دول", value: "\(countryCount)", tint: SpTheme.greenSoft)
        }
    }

    private var countryCount: Int {
        Set(world.map { $0.countryAr.isEmpty ? $0.country : $0.countryAr }.filter { !$0.isEmpty }).count
    }

    private func summaryChip(icon: String, title: String, value: String, tint: Color) -> some View {
        HStack(spacing: 7) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(SportsFonts.app(size: 10, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
                Text(value)
                    .font(SportsFonts.app(size: 14, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                    .monospacedDigit()
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .frame(height: 48)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SpTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
    }

    // MARK: - التجميع حسب البطولة (بطولاتنا أولًا ثم العالم)

    private struct LiveGroup: Identifiable {
        let leagueId: Int
        let name: String
        let country: String
        let flag: String?
        let logo: String?
        let category: String
        let rank: Int
        let matches: [SpWorldLiveItem]
        var id: Int { leagueId }
    }

    private struct LiveCategorySection: Identifiable {
        let category: String
        let rank: Int
        let groups: [LiveGroup]
        var id: String { category }
        var matchCount: Int { groups.reduce(0) { $0 + $1.matches.count } }
    }

    private var worldGroups: [LiveGroup] {
        let byLeague = Dictionary(grouping: world) { $0.leagueId }
        let mapped = byLeague.map { (leagueId, group) -> LiveGroup in
            let first = group.first
            let category = category(for: first)
            let rank = SportsConstants.categoryRank(category)
            return LiveGroup(
                leagueId: leagueId,
                name: first?.competition ?? first?.country ?? "—",
                country: first?.countryAr ?? "",
                flag: first?.flag,
                logo: first?.leagueLogo,
                category: category,
                rank: rank,
                matches: group.sorted { a, b in
                    let al = a.fixture.status.live ? 1 : 0
                    let bl = b.fixture.status.live ? 1 : 0
                    if al != bl { return al > bl }
                    return (a.fixture.status.elapsed ?? 0) > (b.fixture.status.elapsed ?? 0)
                }
            )
        }
        return mapped.sorted { a, b in
            if a.rank != b.rank { return a.rank < b.rank }
            if a.matches.count != b.matches.count { return a.matches.count > b.matches.count }
            if a.country != b.country { return a.country < b.country }
            return a.name < b.name
        }
    }

    private var worldCategorySections: [LiveCategorySection] {
        let byCategory = Dictionary(grouping: worldGroups) { $0.category }
        return byCategory.map { category, groups in
            LiveCategorySection(
                category: category,
                rank: SportsConstants.categoryRank(category),
                groups: groups
            )
        }
        .sorted { a, b in
            if a.rank != b.rank { return a.rank < b.rank }
            if a.matchCount != b.matchCount { return a.matchCount > b.matchCount }
            return categoryTitle(a.category) < categoryTitle(b.category)
        }
    }

    private func category(for item: SpWorldLiveItem?) -> String {
        guard let item else { return "other" }
        if SportsConstants.isSaudiFixture(item.fixture) { return "saudi" }
        if let slug = item.competitionSlug, let cat = catBySlug[slug] { return cat }
        if item.country == "Saudi-Arabia" || item.countryAr == "السعودية" { return "saudi" }
        return "other"
    }

    private func categoryHeader(_ section: LiveCategorySection) -> some View {
        let tint = categoryTint(section.category)
        return HStack(spacing: 8) {
            Rectangle()
                .fill(tint)
                .frame(width: 4, height: 22)
                .clipShape(Capsule())
            Text(categoryTitle(section.category))
                .font(SportsFonts.headline(size: 17))
                .foregroundStyle(SpTheme.onDark)
            Spacer(minLength: 0)
            Text("\(section.matchCount)")
                .font(SportsFonts.app(size: 12, weight: .heavy))
                .foregroundStyle(tint)
                .monospacedDigit()
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background(Capsule().fill(tint.opacity(0.12)))
        }
        .padding(.top, 6)
    }

    private func worldGroupSection(_ g: LiveGroup) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            worldGroupHeader(g)
            VStack(spacing: 9) {
                ForEach(g.matches) { item in
                    SpWorldMatchRow(item: item)
                }
            }
        }
        .padding(.top, 2)
    }

    private func worldGroupHeader(_ g: LiveGroup) -> some View {
        let tint = categoryTint(g.category)
        return HStack(spacing: 12) {
            Group {
                if let url = g.logo ?? g.flag, !url.isEmpty {
                    SpRemoteImage(url: url)
                        .padding(5)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(.white))
                        .overlay(Circle().stroke(SpTheme.outline, lineWidth: 1))
                } else {
                    Image(systemName: g.category == "saudi" ? "star.fill" : "globe")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(tint)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(tint.opacity(0.14)))
                }
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(g.name)
                    .font(SportsFonts.headline(size: 16))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.8)
                Text(groupSubtitle(g))
                    .font(SportsFonts.app(size: 11))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            HStack(spacing: 4) {
                Circle().fill(tint).frame(width: 6, height: 6)
                Text("\(g.matches.count)")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(tint)
            }
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(Capsule().fill(tint.opacity(0.12)))
        }
        .padding(.top, 4)
    }

    private func groupSubtitle(_ g: LiveGroup) -> String {
        let cat = categoryTitle(g.category)
        guard !g.country.isEmpty else { return cat }
        return "\(cat) · \(g.country)"
    }

    private func categoryTitle(_ category: String) -> String {
        category == "other" ? "بطولات أخرى" : SportsConstants.categoryLabel(category)
    }

    private func categoryTint(_ category: String) -> Color {
        switch category {
        case "saudi": return SpTheme.green
        case "gulf", "arab": return SpTheme.gold
        case "european", "world": return SpTheme.greenSoft
        default: return SpTheme.onDarkDim
        }
    }

    private func quietLiveBadge(_ value: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(SpTheme.green).frame(width: 7, height: 7)
            Text("\(value) مباشرة")
                .font(SportsFonts.app(size: 12.5, weight: .bold))
                .foregroundStyle(SpTheme.green)
        }
        .padding(.horizontal, 11).padding(.vertical, 6)
        .background(Capsule().fill(SpTheme.green.opacity(0.12)))
    }

    // MARK: - التحميل + التحديث اللحظي

    private func load(force: Bool = false) async {
        if !force { loading = true }
        async let worldOpt = try? APIClient.shared.fetchWorldLive(ignoreCache: force)
        async let compsOpt = try? APIClient.shared.fetchCompetitions(ignoreCache: force)
        if let comps = (await compsOpt)?.competitions {
            self.catBySlug = Dictionary(comps.map { ($0.slug, $0.category) }, uniquingKeysWith: { a, _ in a })
        }
        let worldResp = await worldOpt
        self.world = worldResp?.matches ?? []
        self.loadError = worldResp == nil ? "تعذّر الاتصال بخادم البيانات" : nil
        self.loading = false
    }

    // تحديث صامت أثناء العرض — يتسارع (15ث) عند وجود مباراة جارية، ويتباطأ (40ث) عداها.
    private func pollLive() async {
        while !Task.isCancelled {
            let delay: UInt64 = world.isEmpty ? 40_000_000_000 : 15_000_000_000
            try? await Task.sleep(nanoseconds: delay)
            if Task.isCancelled { break }
            await load(force: true)
        }
    }
}

private struct SpWorldMatchRow: View {
    let item: SpWorldLiveItem

    @Environment(SpMatchFollows.self) private var matchFollows

    private var fixture: SpFixture { item.fixture }

    var body: some View {
        ZStack(alignment: .topLeading) {
            NavigationLink {
                SpMatchCenter(fixtureId: fixture.id, preview: fixture)
            } label: {
                cardBody
            }
            .buttonStyle(SpPressStyle())

            followButton
                .padding(.top, 12)
                .padding(.leading, 12)
        }
    }

    private var cardBody: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Color.clear.frame(width: 26, height: 26)
                Text(topLabel)
                    .font(SportsFonts.app(size: 10.5, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .lineLimit(1)
                Spacer(minLength: 6)
                livePill
            }

            HStack(spacing: 8) {
                teamSide(fixture.home, leading: true)
                scoreBox
                teamSide(fixture.away, leading: false)
            }
        }
        .padding(13)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(SpTheme.cardGradient)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(SpTheme.cardStroke, lineWidth: 1)
        )
        .shadow(color: SpTheme.cardShadow.opacity(0.75), radius: 8, x: 0, y: 5)
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var topLabel: String {
        let country = item.countryAr.isEmpty ? item.country : item.countryAr
        if !fixture.round.isEmpty, !country.isEmpty { return "\(country) · \(fixture.round)" }
        if !country.isEmpty { return country }
        return fixture.round
    }

    private var livePill: some View {
        HStack(spacing: 5) {
            Circle().fill(SpTheme.green).frame(width: 6, height: 6)
            Text(liveText)
                .font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(SpTheme.green)
                .monospacedDigit()
        }
        .padding(.horizontal, 8).padding(.vertical, 4)
        .background(Capsule().fill(SpTheme.green.opacity(0.11)))
    }

    private var liveText: String {
        if fixture.status.code == "HT" { return "استراحة" }
        if let e = fixture.status.elapsed {
            if let x = fixture.status.extra, x > 0 { return "\(e)+\(x)′" }
            return "\(e)′"
        }
        return fixture.status.label.isEmpty ? "مباشر" : fixture.status.label
    }

    private func teamSide(_ team: SpTeam, leading: Bool) -> some View {
        HStack(spacing: 8) {
            if leading {
                teamName(team, align: .leading)
                SpTeamLogo(logo: team.logo, size: 28)
            } else {
                SpTeamLogo(logo: team.logo, size: 28)
                teamName(team, align: .trailing)
            }
        }
        .frame(maxWidth: .infinity, alignment: leading ? .leading : .trailing)
    }

    private func teamName(_ team: SpTeam, align: TextAlignment) -> some View {
        Text(team.name)
            .font(SportsFonts.app(size: 14, weight: .bold))
            .foregroundStyle(SpTheme.onDark)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .multilineTextAlignment(align)
    }


    private var scoreBox: some View {
        HStack(spacing: 5) {
            Text("\(fixture.goals.away ?? 0)")
            Text("-").foregroundStyle(SpTheme.onDarkFaint)
            Text("\(fixture.goals.home ?? 0)")
        }
        .font(SportsFonts.app(size: 21, weight: .heavy))
        .foregroundStyle(SpTheme.onDark)
        .monospacedDigit()
        .environment(\.layoutDirection, .leftToRight)
        .frame(minWidth: 58)
    }

    private var followButton: some View {
        let following = matchFollows.isFollowing(fixture.id)
        return Button {
            matchFollows.toggle(fixture)
        } label: {
            Image(systemName: following ? "star.fill" : "star")
                .font(.system(size: 12.5, weight: .bold))
                .foregroundStyle(following ? SpTheme.gold : SpTheme.onDarkFaint)
                .frame(width: 26, height: 26)
                .background(Circle().fill(following ? SpTheme.gold.opacity(0.12) : SpTheme.chipFill))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
    }
}
