import SwiftUI

// «عالمية» — كل مباريات العالم الجارية الآن (/sports/world-live) مجمّعة حسب
// البطولة/الدولة: بطولاتنا السعودية أولًا (rank0) ثم بطولاتنا (rank1) ثم بقية
// العالم حسب الدولة. كان سابقًا تبويب «مباشر العالم» داخل «المباشر»؛ أُفرد كتبويب
// مستقل باسم «عالمية» (تبويب «المباريات» الجديد يغطّي جدول المونديال بالتواريخ).
// (اسم البنية `LiveView` محفوظ لتفادي مساس pbxproj — دلالته الآن «عالمية».)
struct LiveView: View {
    @Environment(\.scenePhase) private var scenePhase
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
        // عودة التطبيق للمقدّمة = تحديث فوري (لا انتظار دورة الاستطلاع التالية).
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await load(force: true) } }
        }
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
        }
        .padding(.top, 6)
    }

    // مجموعة بطولة على طراز شاشة «المباريات»: ترويسة البطولة + خطّ فاصل + صفوف
    // مسطّحة (SpFlatMatchRow) مفصولة بخطوط رفيعة — بلا إطارات/بطاقات.
    private func worldGroupSection(_ g: LiveGroup) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            worldGroupHeader(g)
            Rectangle().fill(SpTheme.outline).frame(height: 1).padding(.top, 8)
            ForEach(Array(g.matches.enumerated()), id: \.element.id) { idx, item in
                if idx > 0 {
                    Rectangle().fill(SpTheme.outline.opacity(0.6)).frame(height: 1)
                        .padding(.horizontal, 10)
                }
                SpFlatMatchRow(fixture: item.fixture)
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

    // تحديث صامت أثناء العرض — السياسة الموحّدة: حيّ = 10ث، ويتباطأ (30ث) حين لا مباريات.
    private func pollLive() async {
        while !Task.isCancelled {
            let delay: UInt64 = world.isEmpty ? 30_000_000_000 : 10_000_000_000
            try? await Task.sleep(nanoseconds: delay)
            if Task.isCancelled { break }
            await load(force: true)
        }
    }
}
