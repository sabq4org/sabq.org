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
                .padding(16)
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
            ForEach(worldGroups) { g in
                VStack(alignment: .leading, spacing: 12) {
                    worldGroupHeader(g)
                    ForEach(g.matches) { item in SpMatchCard(fixture: item.fixture) }
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "globe")
                .font(.system(size: 19, weight: .bold))
                .foregroundStyle(SpTheme.green)
            Text("عالمية")
                .font(SportsFonts.headline(size: 24))
                .foregroundStyle(SpTheme.onDark)
            Spacer(minLength: 0)
            if liveNowCount > 0 {
                HStack(spacing: 6) {
                    Circle().fill(SpTheme.crimson).frame(width: 7, height: 7)
                    Text("\(liveNowCount) مباشرة")
                        .font(SportsFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(SpTheme.crimson)
                }
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Capsule().fill(SpTheme.crimson.opacity(0.12)))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var liveNowCount: Int { world.filter { $0.fixture.status.live }.count }

    // MARK: - التجميع حسب البطولة (بطولاتنا أولًا ثم العالم)

    private struct LiveGroup: Identifiable {
        let leagueId: Int
        let name: String
        let country: String
        let flag: String?
        let logo: String?
        let rank: Int        // 0=سعودي، 1=بطولاتنا، 2=عالمي
        let matches: [SpWorldLiveItem]
        var id: Int { leagueId }
    }

    private var worldGroups: [LiveGroup] {
        let byLeague = Dictionary(grouping: world) { $0.leagueId }
        let mapped = byLeague.map { (leagueId, group) -> LiveGroup in
            let first = group.first
            let slug = first?.competitionSlug
            let rank = SportsConstants.isSaudi(slug) ? 0 : (slug != nil ? 1 : 2)
            return LiveGroup(
                leagueId: leagueId,
                name: first?.competition ?? first?.country ?? "—",
                country: first?.countryAr ?? "",
                flag: first?.flag,
                logo: first?.leagueLogo,
                rank: rank,
                matches: group.sorted { $0.fixture.timestamp < $1.fixture.timestamp }
            )
        }
        return mapped.sorted { a, b in
            if a.rank != b.rank { return a.rank < b.rank }
            if a.country != b.country { return a.country < b.country }
            return a.name < b.name
        }
    }

    private func worldGroupHeader(_ g: LiveGroup) -> some View {
        let isSaudi = g.rank == 0
        let tint: Color = isSaudi ? SpTheme.green : SpTheme.greenSoft
        return HStack(spacing: 12) {
            Group {
                if let url = g.logo ?? g.flag, !url.isEmpty {
                    SpRemoteImage(url: url)
                        .padding(5)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(.white))
                        .overlay(Circle().stroke(SpTheme.outline, lineWidth: 1))
                } else {
                    Image(systemName: isSaudi ? "star.fill" : "globe")
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
                if !g.country.isEmpty {
                    Text(g.country)
                        .font(SportsFonts.app(size: 11))
                        .foregroundStyle(SpTheme.onDarkDim)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            HStack(spacing: 4) {
                Circle().fill(SpTheme.crimson).frame(width: 6, height: 6)
                Text("\(g.matches.count)")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.crimson)
            }
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(Capsule().fill(SpTheme.crimson.opacity(0.12)))
        }
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
