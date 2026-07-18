import SwiftUI

// «عالمية» — كل مباريات العالم الجارية الآن (/sports/world-live) مجمّعة حسب
// البطولة/الدولة: بطولاتنا السعودية أولًا (rank0) ثم بطولاتنا (rank1) ثم بقية
// العالم حسب الدولة. كان سابقًا تبويب «مباشر العالم» داخل «المباشر»؛ أُفرد كتبويب
// مستقل باسم «عالمية» (تبويب «المباريات» الجديد يغطّي جدول المونديال بالتواريخ).
// (اسم البنية `LiveView` محفوظ لتفادي مساس pbxproj — دلالته الآن «عالمية».)
struct LiveView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(SpLiveStream.self) private var liveStream
    @Environment(SpAppRouter.self) private var router
    @State private var world: [SpWorldLiveItem] = []
    @State private var catBySlug: [String: String] = [:]
    @State private var loading = true
    @State private var loadError: String?
    /// تحديث مؤجَّل وصل والتبويب مخفي — يُصرف بتحميل واحد عند العودة.
    @State private var pendingLiveReload = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
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
            if phase == .active, router.selectedTab == .world { Task { await load(force: true) } }
        }
        // البث الحيّ (SSE): تحديث صامت بالكاش — لا force مع كل نبضة (وميض + عاصفة شبكة).
        .onChange(of: liveStream.sportsVersion) { _, _ in
            guard router.selectedTab == .world else { pendingLiveReload = true; return }
            Task { await load(force: false) }
        }
        .onChange(of: router.selectedTab) { _, tab in
            guard tab == .world, pendingLiveReload else { return }
            pendingLiveReload = false
            Task { await load(force: false) }
        }
    }

    @ViewBuilder private var content: some View {
        // أبقِ القائمة السابقة أثناء التحديث الصامت — لا شاشة دوران كاملة.
        if loading && world.isEmpty {
            SpLoading()
        } else if let loadError, world.isEmpty {
            SpEmptyState(icon: "wifi.exclamationmark", title: L("تعذّر التحميل"), subtitle: loadError)
        } else if world.isEmpty {
            SpEmptyState(icon: "globe",
                         title: L("لا مباريات مباشرة عالميًا الآن"),
                         subtitle: L("ستظهر هنا أي مباراة جارية الآن حول العالم"))
        } else {
            VStack(spacing: 12) {
                ForEach(worldCategorySections) { section in
                    worldCategoryCard(section)
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "globe")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(SpTheme.green)
                .frame(width: 48, height: 48)
                .background(Circle().fill(SpTheme.green.opacity(0.12)))

            VStack(alignment: .leading, spacing: 4) {
                Text(L("عالمية"))
                    .font(SportsFonts.headline(size: 25))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(L("المباريات الجارية حول العالم"))
                    .font(SportsFonts.app(size: 12.5, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            if liveNowCount > 0 { liveBadge("\(liveNowCount)") }
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.card)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .stroke(SpTheme.cardStroke, lineWidth: 1)
        )
    }

    private var liveNowCount: Int { world.filter { $0.fixture.status.live }.count }

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

    private func worldCategoryCard(_ section: LiveCategorySection) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            categoryHeader(section)
                .padding(.horizontal, 14)
                .padding(.top, 14)
                .padding(.bottom, 8)

            ForEach(Array(section.groups.enumerated()), id: \.element.id) { idx, group in
                if idx > 0 {
                    Rectangle().fill(SpTheme.outline.opacity(0.72)).frame(height: 1)
                        .padding(.horizontal, 14)
                }
                worldGroupSection(group)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.card)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .stroke(SpTheme.cardStroke, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous))
    }

    private func categoryHeader(_ section: LiveCategorySection) -> some View {
        let tint = categoryTint(section.category)
        return HStack(spacing: 8) {
            Rectangle()
                .fill(tint)
                .frame(width: 4, height: 20)
                .clipShape(Capsule())
            Text(categoryTitle(section.category))
                .font(SportsFonts.headline(size: 17))
                .foregroundStyle(SpTheme.onDark)
            Spacer(minLength: 0)
            HStack(spacing: 5) {
                Circle().fill(SpTheme.crimson).frame(width: 6, height: 6)
                Text(Lf("%d مباشرة", section.matchCount))
                    .font(SportsFonts.app(size: 11.5, weight: .bold))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .monospacedDigit()
            }
        }
    }

    // مجموعة بطولة على طراز شاشة «المباريات»: ترويسة البطولة + صفوف مسطّحة مفصولة
    // بخطوط رفيعة داخل بطاقة القسم.
    private func worldGroupSection(_ g: LiveGroup) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            worldGroupHeader(g)
            Rectangle().fill(SpTheme.outline.opacity(0.72)).frame(height: 1)
                .padding(.horizontal, 14)
                .padding(.top, 8)
            ForEach(Array(g.matches.enumerated()), id: \.element.id) { idx, item in
                if idx > 0 {
                    Rectangle().fill(SpTheme.outline.opacity(0.52)).frame(height: 1)
                        .padding(.horizontal, 14)
                }
                SpFlatMatchRow(fixture: item.fixture)
                    .padding(.horizontal, 6)
            }
        }
        .padding(.top, 2)
        .padding(.bottom, 4)
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
                Text(cleanLeagueName(g.name, country: g.country))
                    .font(SportsFonts.headline(size: 15.5))
                    .foregroundStyle(SpTheme.onDark)
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)
                Text(groupSubtitle(g))
                    .font(SportsFonts.app(size: 11.5, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
    }

    private func cleanLeagueName(_ name: String, country: String) -> String {
        let country = country.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !country.isEmpty else { return name }
        var cleaned = name.trimmingCharacters(in: .whitespacesAndNewlines)
        for suffix in [" (\(country))", " - \(country)", " – \(country)", " — \(country)", " · \(country)"] {
            if cleaned.hasSuffix(suffix) {
                cleaned.removeLast(suffix.count)
                return cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
        return cleaned
    }

    private func groupSubtitle(_ g: LiveGroup) -> String {
        // الفئة معروضة في ترويسة القسم فوق المجموعة — نكتفي بالدولة هنا (لا تكرار).
        g.country.isEmpty ? categoryTitle(g.category) : g.country
    }

    private func categoryTitle(_ category: String) -> String {
        category == "other" ? L("بطولات أخرى") : SportsConstants.categoryLabel(category)
    }

    private func categoryTint(_ category: String) -> Color {
        // لون محوري واحد للفئات — الذهبي محجوز للتميّز لا لتلوين فئة خليجية/عربية.
        switch category {
        case "saudi": return SpTheme.green
        case "european", "world", "gulf", "arab": return SpTheme.greenSoft
        default: return SpTheme.onDarkDim
        }
    }

    private func liveBadge(_ value: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(SpTheme.crimson).frame(width: 6, height: 6)
            Text(Lf("%@ مباشرة", value))
                .font(SportsFonts.app(size: 12, weight: .heavy))
                .foregroundStyle(SpTheme.crimson)
                .monospacedDigit()
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(Capsule().fill(SpTheme.crimson.opacity(0.09)))
    }

    // MARK: - التحميل + التحديث اللحظي

    private func load(force: Bool = false) async {
        if world.isEmpty { loading = true }
        async let worldOpt = try? APIClient.shared.fetchWorldLive(ignoreCache: force)
        async let compsOpt = try? APIClient.shared.fetchCompetitions(ignoreCache: force)
        if let comps = (await compsOpt)?.competitions {
            self.catBySlug = Dictionary(comps.map { ($0.slug, $0.category) }, uniquingKeysWith: { a, _ in a })
        }
        let worldResp = await worldOpt
        if let matches = worldResp?.matches {
            self.world = matches
            self.loadError = nil
        } else if world.isEmpty {
            self.loadError = L("تعذّر الاتصال بخادم البيانات")
        }
        self.loading = false
    }

    // تحديث صامت أثناء العرض — حيّ = 10ث، ويتباطأ (30ث) حين لا مباريات.
    // بلا ignoreCache في الاستطلاع: السحب للتحديث / عودة المقدّمة يكسران الكاش.
    private func pollLive() async {
        while !Task.isCancelled {
            let delay: UInt64 = world.isEmpty ? 30_000_000_000 : 10_000_000_000
            try? await Task.sleep(nanoseconds: delay)
            if Task.isCancelled { break }
            guard router.selectedTab == .world else {
                pendingLiveReload = true
                continue
            }
            await load(force: false)
        }
    }
}
