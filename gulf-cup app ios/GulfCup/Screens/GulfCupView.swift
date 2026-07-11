import SwiftUI
import Combine
import UIKit

// تطبيق «خليجي 27» v4 — 5 تبويبات: الرئيسية · المباريات · التوقعات · البطولة · المزيد
// هوية مونديال سبق بصياغة خليجية (زمردي + ذهبي، بطاقات بيضاء على غسلة خضراء)
// وبنعومة VARA: أسطح مسطّحة، حدود شعرية، حركات ease قصيرة بلا springs.
struct GulfCupView: View {
    @State private var store = GcHubStore()
    @State private var selectedTab: GcTab = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                GcHomeScreen(store: store, onSelectTab: { selectedTab = $0 })
            }
            .tabItem { Label(L("tab.home"), systemImage: "house.fill") }
            .tag(GcTab.home)

            NavigationStack {
                GcMatchesScreen(store: store)
            }
            .tabItem { Label(L("tab.matches"), systemImage: "calendar") }
            .tag(GcTab.matches)

            NavigationStack {
                GcPredictionsHubScreen()
            }
            .tabItem { Label(L("tab.predictions"), systemImage: "sparkles") }
            .tag(GcTab.predictions)

            NavigationStack {
                GcTournamentScreen(store: store)
            }
            .tabItem { Label(L("tab.tournament"), systemImage: "trophy.fill") }
            .tag(GcTab.tournament)

            NavigationStack {
                GcAccountScreen(store: store, onSelectTab: { selectedTab = $0 })
            }
            .tabItem { Label(L("tab.more"), systemImage: "person.crop.circle.fill") }
            .tag(GcTab.more)
        }
        .tint(GcTheme.sky)
        .task { await store.loadAll() }
    }
}

enum GcTab: Hashable { case home, matches, predictions, tournament, more }

// MARK: - مخزن بيانات البطولة المشترك بين التبويبات

@MainActor
@Observable
final class GcHubStore {
    var overview: GcOverview?
    var fixtures: [GcFixture] = []
    var teams: [GcTeam] = []
    var groups: [GcGroup] = []
    var scorers: GcScorersBoard?
    var history: GcHistory?
    var loading = true
    var loadError: String?

    var live: [GcFixture] { fixtures.filter { $0.status.live } }
    var upcoming: [GcFixture] {
        fixtures.filter { !$0.status.finished && !$0.status.live }.sorted { $0.timestamp < $1.timestamp }
    }
    var todayFixtures: [GcFixture] {
        fixtures.filter { GcFormat.kickoffDay($0.date) == GcFormat.kickoffDay(GcNow.iso()) }
            .sorted { $0.timestamp < $1.timestamp }
    }

    func loadAll(force: Bool = false) async {
        if !force { loading = fixtures.isEmpty }
        async let o = APIClient.shared.fetchGcOverview(ignoreCache: force)
        async let f = APIClient.shared.fetchGcFixtures(ignoreCache: force)
        async let t = APIClient.shared.fetchGcTeams(ignoreCache: force)
        async let g = APIClient.shared.fetchGcStandings(ignoreCache: force)
        do {
            let (ov, fx, tm, gr) = try await (o, f, t, g)
            overview = ov; fixtures = fx; teams = tm; groups = gr
            loadError = nil
        } catch { loadError = LError(error) }
        loading = false
        // أفضل جهد — لا تُفشل الرئيسية إن غاب المزوّد
        async let sc: Void = loadScorers(force: force)
        async let hi: Void = loadHistory(force: force)
        _ = await (sc, hi)
        publishWidgetSnapshot()
    }

    /// يكتب لقطة الويدجت (المباراة المميّزة + ترتيب مجموعة السعودية) للحاوية
    /// المشتركة، ويطلب من WidgetKit إعادة التحميل. أفضل جهد.
    private func publishWidgetSnapshot() {
        let featured = live.first ?? overview?.nextMatch ?? upcoming.first
        let widgetMatch: GcWidgetMatch? = featured.map { fx in
            GcWidgetMatch(
                home: GcWidgetTeam(name: fx.home.name, code: GcWidgetCode.of(id: fx.home.id, name: fx.home.name)),
                away: GcWidgetTeam(name: fx.away.name, code: GcWidgetCode.of(id: fx.away.id, name: fx.away.name)),
                kickoff: TimeInterval(fx.timestamp),
                round: fx.round,
                live: fx.status.live,
                finished: fx.status.finished,
                elapsed: fx.status.elapsed,
                homeGoals: fx.goals.home,
                awayGoals: fx.goals.away
            )
        }

        let saudiGroup = overview?.saudi.group.flatMap { name in
            groups.first(where: { $0.name == name })
        } ?? groups.first
        let rows: [GcWidgetStandingRow] = (saudiGroup?.rows.prefix(4) ?? []).map { r in
            GcWidgetStandingRow(
                rank: r.rank,
                name: r.team.name,
                code: GcWidgetCode.of(id: r.team.id, name: r.team.name),
                played: r.played,
                points: r.points,
                isSaudi: r.team.id == GulfCupConstants.saudiTeamId
            )
        }

        GcWidgetStore.write(GcWidgetSnapshot(
            updatedAt: Date().timeIntervalSince1970,
            match: widgetMatch,
            groupName: saudiGroup?.name,
            rows: rows
        ))
        GcWidgetReload.reload()
    }

    func loadScorers(force: Bool = false) async {
        scorers = (try? await APIClient.shared.fetchGcScorers(ignoreCache: force)) ?? scorers
    }

    func loadHistory(force: Bool = false) async {
        history = (try? await APIClient.shared.fetchGcHistory(ignoreCache: force)) ?? history
    }
}

enum GcNow {
    static func iso() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}

// MARK: - الرئيسية (هوية مونديال سبق + نعومة VARA)

private struct GcHomeScreen: View {
    @Bindable var store: GcHubStore
    let onSelectTab: (GcTab) -> Void

    private var tabBarVis: GcTabBarVisibility { .shared }

    /// مجموعة السعودية أولًا للتيزر، وإلا أول مجموعة.
    private var teaserGroup: GcGroup? {
        if let name = store.overview?.saudi.group,
           let g = store.groups.first(where: { $0.name == name }) {
            return g
        }
        return store.groups.first
    }

    private var heroFixture: GcFixture? {
        store.live.first ?? store.overview?.nextMatch ?? store.upcoming.first
    }

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 18) {
                GcHomeTopBar(liveCount: store.live.count)
                    .gcReveal()

                GcHomeHeroBlock(store: store, featured: heroFixture, onSelectTab: onSelectTab)
                    .gcReveal(delay: 0.06)

                if let loadError = store.loadError {
                    GcErrorCard(message: loadError) { await store.loadAll(force: true) }
                }

                let railFixtures = store.live.filter { $0.id != heroFixture?.id }
                if !railFixtures.isEmpty {
                    GcLiveRail(fixtures: railFixtures)
                        .gcReveal(delay: 0.12)
                }

                if let saudi = store.overview?.saudi, saudi.team != nil || !saudi.fixtures.isEmpty {
                    GcSaudiSpotlight(saudi: saudi, history: store.history)
                        .gcReveal()
                }

                if let group = teaserGroup {
                    GcStandingsTeaser(group: group) { onSelectTab(.tournament) }
                        .gcReveal()
                }

                if !store.upcoming.isEmpty || store.loading {
                    GcGameweekBoard(
                        fixtures: Array(store.upcoming.prefix(12)),
                        loading: store.loading && store.upcoming.isEmpty
                    ) { onSelectTab(.matches) }
                        .gcReveal()
                }

                if let board = store.scorers, !board.scorers.isEmpty {
                    GcScorersPreview(board: board) { onSelectTab(.tournament) }
                        .gcReveal()
                }

                GcStarsPreview()
                    .gcReveal()

                if let history = store.history {
                    GcHistoryTeaser(history: history) { onSelectTab(.tournament) }
                        .gcReveal()
                }

                GcFooterSignature()
            }
        }
        .gcAutoHideTabBar()
        .toolbar(tabBarVis.hidden ? .hidden : .visible, for: .tabBar)
        .refreshable { await store.loadAll(force: true) }
        .navigationBarHidden(true)
    }
}

/// الشريط العلوي: شعار البطولة الرسمي + الهوية + شارة مباشر.
private struct GcHomeTopBar: View {
    let liveCount: Int

    var body: some View {
        HStack(spacing: 10) {
            Image("Emblem")
                .resizable()
                .scaledToFit()
                .frame(height: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(L("app.title"))
                    .font(GulfCupFonts.headline(size: 17))
                    .foregroundStyle(GcTheme.ink)
                Text(L("app.host"))
                    .font(GulfCupFonts.app(size: 10.5, weight: .semibold))
                    .foregroundStyle(GcTheme.skyDeep)
            }
            Spacer()
            if liveCount > 0 {
                HStack(spacing: 5) {
                    GcLiveDot()
                    Text(liveCount == 1 ? L("state.live") : "\(liveCount) \(L("state.live"))")
                        .font(GulfCupFonts.app(size: 11, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 11).padding(.vertical, 5)
                .background(Capsule().fill(GcTheme.liveRed))
            }
        }
        .padding(.top, 4)
        .padding(.bottom, 2)
    }
}

/// الهيرو — ملعب ليلي روشن: عدّاد اختياري + أزرار ثابتة خارجه (مثل الموقع).
private struct GcHomeHeroBlock: View {
    @Bindable var store: GcHubStore
    let featured: GcFixture?
    let onSelectTab: (GcTab) -> Void

    private var started: Bool { store.overview?.started == true }
    private var dateRange: String {
        store.overview.map { GcFormat.dateRange(startIso: $0.startsAt, endIso: $0.endsAt) } ?? ""
    }
    private var countdownActive: Bool {
        guard let iso = store.overview?.startsAt, !started else { return false }
        return GcCountdownMath.to(iso: iso).total > 0
    }

    var body: some View {
        VStack(spacing: 14) {
            VStack(spacing: 0) {
                heroPanel
                if let fx = featured {
                    GcHeroFloatCard(fixture: fx, showCountdown: false)
                        .padding(.horizontal, 14)
                        .padding(.top, -40)
                }
            }

            if store.todayFixtures.count >= 2 {
                GcHeroTodayStrip(matches: store.todayFixtures, activeId: featured?.id)
            }
        }
    }

    private var heroPanel: some View {
        VStack(alignment: .center, spacing: 10) {
            HStack(spacing: 7) {
                heroTag(L("hero.coverage"), sky: true)
                if started {
                    heroLiveTag
                } else {
                    heroTag(L("hero.hostedBy"), sky: false)
                }
            }

            HStack(spacing: 6) {
                Text("خليجي")
                    .font(GulfCupFonts.headline(size: 28))
                    .foregroundStyle(GcTheme.onHero)
                Text("27")
                    .font(GulfCupFonts.headline(size: 28))
                    .foregroundStyle(GcTheme.skyLite)
            }
            Text(L("hero.tagline"))
                .font(GulfCupFonts.app(size: 12.5))
                .foregroundStyle(GcTheme.onHeroDim)
                .multilineTextAlignment(.center)

            if !dateRange.isEmpty {
                Label(dateRange, systemImage: "calendar")
                    .font(GulfCupFonts.app(size: 11.5))
                    .foregroundStyle(GcTheme.onHeroDim.opacity(0.9))
            }

            if countdownActive {
                VStack(spacing: 10) {
                    Text(L("countdown.title"))
                        .font(GulfCupFonts.app(size: 11, weight: .bold))
                        .foregroundStyle(GcTheme.skyLite)
                    GcCountdownChips(iso: store.overview?.startsAt, onHero: true)
                }
                .padding(16)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(Color.white.opacity(0.06))
                        .overlay(
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .stroke(Color.white.opacity(0.10), lineWidth: 1)
                        )
                )
                .padding(.top, 6)
            }

            heroActions
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(18)
        .padding(.bottom, featured == nil ? 18 : 48)
        .background(
            RoundedRectangle(cornerRadius: GcTheme.heroRadius, style: .continuous)
                .fill(GcTheme.heroGradient)
                .overlay(
                    GcHeroDecor()
                        .clipShape(RoundedRectangle(cornerRadius: GcTheme.heroRadius, style: .continuous))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: GcTheme.heroRadius, style: .continuous)
                .stroke(Color.white.opacity(0.10), lineWidth: 1)
        )
        .shadow(color: GcTheme.heroShadow, radius: 18, y: 8)
    }

    private var heroActions: some View {
        HStack(spacing: 10) {
            Button { onSelectTab(.matches) } label: {
                Text(L("cta.schedule"))
                    .font(GulfCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(GcTheme.skyDeep)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Capsule().fill(GcTheme.skyLite))
            }
            .buttonStyle(GcPressStyle())

            Button { onSelectTab(.predictions) } label: {
                HStack(spacing: 5) {
                    Image(systemName: "sparkles")
                    Text(L("cta.predict"))
                }
                .font(GulfCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(GcTheme.skyDeep)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Capsule().fill(Color.white))
            }
            .buttonStyle(GcPressStyle())

            Button { onSelectTab(.tournament) } label: {
                Text(L("cta.teams"))
                    .font(GulfCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(Color.white.opacity(0.9))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        Capsule()
                            .stroke(Color.white.opacity(0.25), lineWidth: 1)
                            .background(Capsule().fill(Color.white.opacity(0.06)))
                    )
            }
            .buttonStyle(GcPressStyle())
        }
    }

    private var heroLiveTag: some View {
        HStack(spacing: 5) {
            GcLiveDot()
            Text(L("state.live"))
                .font(GulfCupFonts.app(size: 10.5, weight: .bold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 11).padding(.vertical, 4)
        .background(Capsule().fill(GcTheme.liveRed))
    }

    private func heroTag(_ text: String, sky: Bool) -> some View {
        Text(text)
            .font(GulfCupFonts.app(size: 10.5, weight: .bold))
            .foregroundStyle(sky ? GcTheme.skyLite : Color.white.opacity(0.85))
            .padding(.horizontal, 11).padding(.vertical, 4)
            .background(
                Capsule().fill(sky ? GcTheme.sky.opacity(0.18) : Color.white.opacity(0.10))
            )
            .overlay(
                Capsule().stroke(sky ? GcTheme.sky.opacity(0.28) : Color.white.opacity(0.12), lineWidth: 1)
            )
    }
}

/// عدّ تنازلي حي — شرائح LTR (يوم على اليسار)؛ نسخة فاتحة وأخرى فوق الهيرو.
private struct GcCountdownChips: View {
    let iso: String?
    var onHero: Bool = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            let c = GcCountdownMath.to(iso: iso)
            if c.total <= 0 {
                HStack(spacing: 6) {
                    Circle().fill(onHero ? GcTheme.skyLite : GcTheme.sky).frame(width: 8, height: 8)
                    Text("حان موعد الانطلاق — التغطية الحية تبدأ خلال لحظات")
                        .font(GulfCupFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(onHero ? GcTheme.onHero : GcTheme.ink)
                }
            } else {
                HStack(spacing: 8) {
                    chip(c.days, L("countdown.days"))
                    chip(c.hours, L("countdown.hours"))
                    chip(c.minutes, L("countdown.minutes"))
                    chip(c.seconds, L("countdown.seconds"))
                }
                .environment(\.layoutDirection, .leftToRight)
            }
        }
    }

    private func chip(_ value: Int, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text("\(value)")
                .font(GulfCupFonts.app(size: 20, weight: .bold))
                .foregroundStyle(onHero ? GcTheme.onHero : GcTheme.ink)
                .monospacedDigit()
            Text(label)
                .font(GulfCupFonts.app(size: 10, weight: .semibold))
                .foregroundStyle(onHero ? GcTheme.onHeroDim : GcTheme.emeraldDeep)
        }
        .frame(minWidth: 52)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(onHero ? Color.white.opacity(0.12) : GcTheme.chipFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(onHero ? Color.white.opacity(0.14) : Color.clear, lineWidth: 1)
        )
    }
}

/// البطاقة العائمة — المباراة المميزة فوق حافة الهيرو (الظلّ الوحيد في الشاشة).
private struct GcHeroFloatCard: View {
    let fixture: GcFixture
    var showCountdown: Bool = true

    private var matchStarted: Bool { fixture.status.live || fixture.status.finished }

    var body: some View {
        NavigationLink {
            GcMatchCenterScreen(fixture: fixture)
        } label: {
            VStack(spacing: 13) {
                HStack(spacing: 6) {
                    Text(eyebrow)
                        .font(GulfCupFonts.app(size: 10.5, weight: .semibold))
                        .foregroundStyle(GcTheme.inkDim)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    GcStatusPill(fixture: fixture)
                }

                HStack(alignment: .top, spacing: 8) {
                    teamColumn(fixture.home)
                    centerColumn
                    teamColumn(fixture.away)
                }

                if !matchStarted && showCountdown {
                    GcCountdownChips(iso: fixture.date)
                }

                HStack(spacing: 6) {
                    Text("مركز المباراة")
                        .font(GulfCupFonts.app(size: 12.5, weight: .bold))
                    Image(systemName: "chevron.left")
                        .font(.system(size: 10, weight: .bold))
                }
                .foregroundStyle(GcTheme.skyDeep)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(GcTheme.sky.opacity(0.12))
                )
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: GcTheme.floatRadius, style: .continuous).fill(GcTheme.cardBg))
            .overlay(RoundedRectangle(cornerRadius: GcTheme.floatRadius, style: .continuous).stroke(GcTheme.line, lineWidth: 1))
        }
        .buttonStyle(GcPressStyle())
    }

    private var eyebrow: String {
        var parts: [String] = []
        if !fixture.round.isEmpty { parts.append(fixture.round) }
        if !fixture.venue.name.isEmpty { parts.append(fixture.venue.name) }
        return parts.isEmpty ? L("app.title") : parts.joined(separator: " · ")
    }

    private func teamColumn(_ team: GcTeam) -> some View {
        VStack(spacing: 7) {
            GcTeamLogo(logo: team.logo, size: 52)
            Text(team.name)
                .font(GulfCupFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(GcTheme.ink)
                .multilineTextAlignment(.center)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }

    private var centerColumn: some View {
        VStack(spacing: 5) {
            if matchStarted {
                Text("\(fixture.goals.away ?? 0) - \(fixture.goals.home ?? 0)")
                    .font(GulfCupFonts.app(size: 30, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                if fixture.status.live, !fixture.status.label.isEmpty {
                    Text(fixture.status.label)
                        .font(GulfCupFonts.app(size: 10, weight: .bold))
                        .foregroundStyle(GcTheme.liveRed)
                        .lineLimit(1)
                }
            } else {
                Text(GcFormat.kickoffTime(fixture.date))
                    .font(GulfCupFonts.app(size: 24, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                Text(GcFormat.relativeKickoff(fixture.date))
                    .font(GulfCupFonts.app(size: 10.5))
                    .foregroundStyle(GcTheme.inkDim)
            }
        }
        .frame(minWidth: 96)
    }
}

/// شريط مباريات اليوم أسفل الهيرو.
private struct GcHeroTodayStrip: View {
    let matches: [GcFixture]
    let activeId: Int?

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 5) {
                Image(systemName: "calendar")
                    .font(.system(size: 11, weight: .semibold))
                Text(L("home.today.title"))
                    .font(GulfCupFonts.app(size: 11, weight: .semibold))
                Text("(\(matches.count))")
                    .font(GulfCupFonts.app(size: 12))
                    .foregroundStyle(GcTheme.inkDim)
            }
            .foregroundStyle(GcTheme.emerald)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(matches) { fx in
                        NavigationLink {
                            GcMatchCenterScreen(fixture: fx)
                        } label: {
                            HStack(spacing: 8) {
                                GcTeamLogo(logo: fx.home.logo, size: 22)
                                if fx.status.live || fx.status.finished {
                                    Text("\(fx.goals.away ?? 0)-\(fx.goals.home ?? 0)")
                                        .font(GulfCupFonts.app(size: 13, weight: .bold))
                                        .monospacedDigit()
                                        .environment(\.layoutDirection, .leftToRight)
                                } else {
                                    Text(GcFormat.kickoffTime(fx.date))
                                        .font(GulfCupFonts.app(size: 12, weight: .bold))
                                        .monospacedDigit()
                                        .environment(\.layoutDirection, .leftToRight)
                                }
                                GcTeamLogo(logo: fx.away.logo, size: 22)
                            }
                            .foregroundStyle(GcTheme.ink)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(fx.id == activeId ? GcTheme.sky.opacity(0.14) : GcTheme.cardBg)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(fx.id == activeId ? GcTheme.sky.opacity(0.40) : GcTheme.line, lineWidth: 1)
                            )
                        }
                        .buttonStyle(GcPressStyle())
                    }
                }
            }
        }
    }
}

/// شريط المباشر — بطاقات أفقية للمباريات الجارية غير المعروضة في الهيرو.
private struct GcLiveRail: View {
    let fixtures: [GcFixture]
    var body: some View {
        VStack(spacing: 12) {
            GcSectionHeader(icon: "dot.radiowaves.left.and.right", title: L("home.live.title"), tint: GcTheme.liveRed)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(fixtures) { fx in
                        NavigationLink {
                            GcMatchCenterScreen(fixture: fx)
                        } label: {
                            VStack(spacing: 10) {
                                HStack(spacing: 5) {
                                    GcLiveDot()
                                    Text(fx.status.elapsed.map { "\($0)'" } ?? L("state.live"))
                                        .font(GulfCupFonts.app(size: 10, weight: .bold))
                                }
                                .foregroundStyle(.white)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Capsule().fill(GcTheme.liveRed))

                                HStack(spacing: 10) {
                                    GcTeamLogo(logo: fx.home.logo, size: 26)
                                    Text("\(fx.goals.away ?? 0) - \(fx.goals.home ?? 0)")
                                        .font(GulfCupFonts.app(size: 17, weight: .bold))
                                        .foregroundStyle(GcTheme.ink)
                                        .monospacedDigit()
                                        .environment(\.layoutDirection, .leftToRight)
                                    GcTeamLogo(logo: fx.away.logo, size: 26)
                                }
                            }
                            .padding(14)
                            .frame(width: 148)
                            .gcCard(radius: GcTheme.cardRadius, stroke: GcTheme.liveRed.opacity(0.28))
                        }
                        .buttonStyle(GcPressStyle())
                    }
                }
            }
        }
    }
}

private struct GcSaudiSpotlight: View {
    let saudi: GcSaudi
    let history: GcHistory?

    private var saudiTitles: Int {
        history?.titles.first(where: { $0.team.id == GulfCupConstants.saudiTeamId })?.titles ?? 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                if let team = saudi.team {
                    GcTeamLogo(logo: team.logo, size: 56)
                }
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text(saudi.team?.name ?? L("saudi.title"))
                            .font(GulfCupFonts.headline(size: 20))
                            .foregroundStyle(GcTheme.ink)
                        GcChip(text: L("saudi.host"), icon: "star.fill", tint: GcTheme.skyDeep)
                    }
                    Text(saudi.group.map { "مباريات الأخضر · ضمن \($0)" } ?? L("saudi.title"))
                        .font(GulfCupFonts.app(size: 12.5))
                        .foregroundStyle(GcTheme.inkDim)
                    if saudiTitles > 0 {
                        Text("\(saudiTitles) \(L("history.titles.unit"))")
                            .font(GulfCupFonts.app(size: 11, weight: .semibold))
                            .foregroundStyle(GcTheme.sky)
                    }
                }
                Spacer(minLength: 0)
                if let team = saudi.team {
                    NavigationLink {
                        GcTeamProfileScreen(teamId: team.id, fallback: team)
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(GcTheme.inkFaint)
                    }
                    .buttonStyle(GcPressStyle())
                }
            }

            if !saudi.fixtures.isEmpty {
                GcMatchListCard(fixtures: Array(saudi.fixtures.prefix(4)))
            }
        }
    }
}

/// تيزر ترتيب المجموعة — نفس أعمدة الموقع: لعب / فارق / نقاط (من مصدر standings).
private struct GcStandingsTeaser: View {
    let group: GcGroup
    let onOpen: () -> Void

    private var rows: [GcStandingRow] { Array(group.rows.prefix(4)) }
    private var anyLive: Bool { rows.contains { $0.live == true } }

    var body: some View {
        VStack(spacing: 12) {
            GcSectionHeader(
                icon: "list.number",
                title: L("home.standings.title"),
                subtitle: group.name,
                tint: anyLive ? GcTheme.liveRed : GcTheme.sky,
                action: onOpen
            )
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    Text(L("standings.col.team"))
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(L("standings.col.played")).frame(width: 28)
                    Text(L("standings.col.diff")).frame(width: 36)
                    Text(L("standings.col.points")).frame(width: 32)
                }
                .font(GulfCupFonts.app(size: 10, weight: .bold))
                .foregroundStyle(GcTheme.inkFaint)
                .padding(.horizontal, 14)
                .padding(.top, 12)
                .padding(.bottom, 6)

                ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                    if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 16) }
                    NavigationLink {
                        GcTeamProfileScreen(teamId: row.team.id, fallback: row.team)
                    } label: {
                        standingRow(row)
                    }
                    .buttonStyle(.plain)
                    .disabled(row.team.id <= 0)
                }
            }
            .padding(.bottom, 6)
            .gcCard()
        }
    }

    private func standingRow(_ row: GcStandingRow) -> some View {
        let qualifies = row.rank <= 2
        let isLive = row.live == true
        let delta = row.liveDelta ?? 0
        return HStack(spacing: 0) {
            HStack(spacing: 8) {
                Text("\(row.rank)")
                    .font(GulfCupFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(qualifies ? GcTheme.skyDeep : GcTheme.inkFaint)
                    .frame(width: 18)
                if isLive {
                    Image(systemName: delta > 0 ? "arrow.up" : delta < 0 ? "arrow.down" : "minus")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(delta > 0 ? GcTheme.emerald : delta < 0 ? GcTheme.crimson : GcTheme.inkFaint)
                }
                GcTeamLogo(logo: row.team.logo, size: 26)
                Text(row.team.name)
                    .font(GulfCupFonts.app(size: 13, weight: qualifies ? .bold : .regular))
                    .foregroundStyle(GcTheme.ink)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text("\(row.played)")
                .font(GulfCupFonts.app(size: 12))
                .foregroundStyle(GcTheme.inkDim)
                .frame(width: 28)
                .monospacedDigit()

            Text(row.goalsDiff >= 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)")
                .font(GulfCupFonts.app(size: 12, weight: .bold))
                .foregroundStyle(
                    row.goalsDiff > 0 ? GcTheme.emerald
                        : row.goalsDiff < 0 ? GcTheme.crimson : GcTheme.inkDim
                )
                .frame(width: 36)
                .monospacedDigit()

            Text("\(row.points)")
                .font(GulfCupFonts.app(size: 15, weight: .bold))
                .foregroundStyle(GcTheme.ink)
                .frame(width: 32)
                .monospacedDigit()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            isLive ? GcTheme.liveRed.opacity(0.04)
                : row.team.id == GulfCupConstants.saudiTeamId ? GcTheme.emerald.opacity(0.05) : Color.clear
        )
        .contentShape(Rectangle())
    }
}

/// جولة المباريات — رقاقات أيام + صفوف اليوم المختار (بدل الشريط الأفقي).
private struct GcGameweekBoard: View {
    let fixtures: [GcFixture]
    let loading: Bool
    let onOpenAll: () -> Void
    @State private var selectedDay: String?

    var body: some View {
        let days = GcFixtureMath.groupByDay(fixtures, favoriteTeamId: GcUserPreferences.shared.favoriteTeamId)
        let active = days.first(where: { $0.label == selectedDay }) ?? days.first
        VStack(spacing: 12) {
            GcSectionHeader(
                icon: "calendar",
                title: L("home.next.title"),
                tint: GcTheme.sky,
                action: fixtures.isEmpty ? nil : onOpenAll
            )
            if loading {
                GcLoadingPanel(title: L("loading.matches"))
            } else if fixtures.isEmpty {
                GcEmptyState(icon: "calendar.badge.clock", title: L("home.next.empty.title"), subtitle: L("home.next.empty.subtitle"))
            } else {
                if days.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(days) { day in
                                let isOn = day.label == active?.label
                                Button {
                                    withAnimation(.easeOut(duration: 0.2)) { selectedDay = day.label }
                                } label: {
                                    Text(day.label)
                                        .font(GulfCupFonts.app(size: 12, weight: .semibold))
                                        .foregroundStyle(isOn ? GcTheme.skyDeep : GcTheme.inkDim)
                                        .padding(.horizontal, 14).padding(.vertical, 8)
                                        .background(
                                            Capsule().fill(isOn ? GcTheme.skyLite : GcTheme.cardBg)
                                        )
                                        .overlay(
                                            Capsule().stroke(isOn ? GcTheme.sky.opacity(0.45) : GcTheme.line, lineWidth: 1)
                                        )
                                }
                                .buttonStyle(GcPressStyle())
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
                if let active {
                    GcMatchListCard(fixtures: Array(active.items.prefix(4)))
                }
            }
        }
    }
}

/// أعلى 3 هدّافين — تمييز سكاي للأول.
private struct GcScorersPreview: View {
    let board: GcScorersBoard
    let onOpen: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            GcSectionHeader(
                icon: "soccerball",
                title: L("home.scorers.title"),
                subtitle: board.isCurrent ? nil : L("scorers.lastEdition"),
                tint: GcTheme.sky,
                action: onOpen
            )
            VStack(spacing: 0) {
                ForEach(Array(board.scorers.prefix(3).enumerated()), id: \.element.id) { idx, s in
                    if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                    HStack(spacing: 11) {
                        Text("\(s.rank)")
                            .font(GulfCupFonts.app(size: 12, weight: .bold))
                            .foregroundStyle(s.rank == 1 ? GcTheme.skyDeep : GcTheme.inkDim)
                            .frame(width: 26, height: 26)
                            .background(
                                RoundedRectangle(cornerRadius: 9, style: .continuous)
                                    .fill(s.rank == 1 ? AnyShapeStyle(GcTheme.skyFill) : AnyShapeStyle(GcTheme.chipFill))
                            )
                        GcPlayerPhoto(url: s.photo, size: 38)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.name).font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                            Text(s.team.name).font(GulfCupFonts.app(size: 10.5)).foregroundStyle(GcTheme.inkDim)
                        }
                        Spacer()
                        VStack(spacing: 1) {
                            Text("\(s.goals)").font(GulfCupFonts.app(size: 16, weight: .bold)).foregroundStyle(GcTheme.emeraldDeep).monospacedDigit()
                            Text(L("scorers.goals")).font(GulfCupFonts.app(size: 9)).foregroundStyle(GcTheme.inkFaint)
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                }
            }
            .gcCard()
        }
    }
}

/// «نجوم البطولة» — أغلى اللاعبين بالقيمة السوقية (TheSports)؛ يخفي نفسه
/// كليًّا قبل توفر بيانات الموسم لدى المزوّد.
private struct GcStarsPreview: View {
    @State private var stars: [GcStarPlayer] = []

    var body: some View {
        Group {
            if stars.isEmpty {
                EmptyView()
            } else {
                VStack(spacing: 12) {
                    GcSectionHeader(icon: "diamond.fill", title: "نجوم البطولة", subtitle: "الأغلى قيمة سوقية", tint: GcTheme.sky)
                    VStack(spacing: 0) {
                        ForEach(Array(stars.prefix(5).enumerated()), id: \.element.id) { idx, star in
                            if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                            HStack(spacing: 11) {
                                Text("\(star.rank)")
                                    .font(GulfCupFonts.app(size: 12, weight: .bold))
                                    .foregroundStyle(star.rank == 1 ? GcTheme.sky : GcTheme.inkFaint)
                                    .frame(width: 18)
                                GcPlayerPhoto(url: star.photo, size: 36)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(star.name)
                                        .font(GulfCupFonts.app(size: 13, weight: .bold))
                                        .foregroundStyle(GcTheme.ink)
                                        .lineLimit(1)
                                    HStack(spacing: 5) {
                                        if let team = star.team {
                                            GcTeamLogo(logo: team.logo, size: 14)
                                            Text(team.name).font(GulfCupFonts.app(size: 10)).foregroundStyle(GcTheme.inkDim)
                                        }
                                    }
                                }
                                Spacer()
                                Text(marketLabel(star))
                                    .font(GulfCupFonts.app(size: 12, weight: .bold))
                                    .foregroundStyle(GcTheme.skyDeep)
                                    .monospacedDigit()
                                    .padding(.horizontal, 9).padding(.vertical, 4)
                                    .background(Capsule().fill(GcTheme.sky.opacity(0.12)))
                            }
                            .padding(.horizontal, 14).padding(.vertical, 9)
                        }
                    }
                    .gcCard()
                }
            }
        }
        .task {
            stars = (try? await APIClient.shared.fetchGcStars()) ?? []
        }
    }

    private func marketLabel(_ star: GcStarPlayer) -> String {
        let symbol = star.currency == "EUR" ? "€" : star.currency == "USD" ? "$" : ""
        if star.marketValue >= 1_000_000 {
            return String(format: "%@%.1f م", symbol, star.marketValue / 1_000_000)
        }
        if star.marketValue >= 1_000 {
            return "\(symbol)\(Int(star.marketValue / 1_000)) ألف"
        }
        return "\(symbol)\(Int(star.marketValue))"
    }
}

/// حامل اللقب + الأكثر تتويجًا — بوّابة سجلّ البطولة.
private struct GcHistoryTeaser: View {
    let history: GcHistory
    let onOpen: () -> Void

    private var holder: GcEdition? {
        history.editions.first(where: { !$0.upcoming && $0.champion != nil })
    }
    private var mostTitled: GcTitleRow? { history.titles.first }

    var body: some View {
        Button(action: onOpen) {
            VStack(spacing: 12) {
                GcSectionHeader(icon: "crown.fill", title: L("home.history.title"), subtitle: L("home.history.subtitle"), tint: GcTheme.sky)
                HStack(spacing: 10) {
                    if let holder, let champ = holder.champion {
                        legacyTile(logo: champ.logo, title: champ.name, caption: "\(L("home.holder")) · \(holder.title)")
                    }
                    if let mostTitled {
                        legacyTile(logo: mostTitled.team.logo, title: mostTitled.team.name, caption: "\(L("home.mostTitles")) · \(mostTitled.titles) \(L("history.titles.unit"))")
                    }
                }
            }
            .padding(14)
            .gcCard()
        }
        .buttonStyle(GcPressStyle())
    }

    private func legacyTile(logo: String, title: String, caption: String) -> some View {
        VStack(spacing: 7) {
            GcTeamLogo(logo: logo, size: 40)
            Text(title)
                .font(GulfCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(GcTheme.ink)
                .lineLimit(1)
            Text(caption)
                .font(GulfCupFonts.app(size: 10))
                .foregroundStyle(GcTheme.inkDim)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14).padding(.horizontal, 10)
        .background(RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous).fill(GcTheme.cardBgSubtle))
        .overlay(RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous).stroke(GcTheme.line, lineWidth: 1))
    }
}

// MARK: - المباريات

private struct GcMatchesScreen: View {
    @Bindable var store: GcHubStore
    @State private var dayFilter: String?
    @State private var roundFilter: String?

    private var days: [(key: String, label: String)] {
        var seen = Set<String>()
        var result: [(String, String)] = []
        for f in store.fixtures.sorted(by: { $0.timestamp < $1.timestamp }) {
            let key = String(f.date.prefix(10))
            if seen.insert(key).inserted {
                result.append((key, GcFormat.kickoffDayShort(f.date)))
            }
        }
        return result
    }

    private var rounds: [String] {
        var seen = Set<String>()
        return store.fixtures
            .sorted { $0.timestamp < $1.timestamp }
            .compactMap { seen.insert($0.roundEn).inserted ? $0.roundEn : nil }
    }

    private var filtered: [GcFixture] {
        store.fixtures.filter { f in
            (dayFilter == nil || String(f.date.prefix(10)) == dayFilter)
                && (roundFilter == nil || f.roundEn == roundFilter)
        }
    }

    private func roundLabel(_ en: String) -> String {
        store.fixtures.first(where: { $0.roundEn == en })?.round ?? en
    }

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 14) {
                GcHeroPanel(radius: GcTheme.cardRadius) {
                    VStack(spacing: 10) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(L("tab.matches")).font(GulfCupFonts.headline(size: 22)).foregroundStyle(.white)
                                Text(L("matches.subtitle")).font(GulfCupFonts.app(size: 11.5)).foregroundStyle(GcTheme.onHeroDim)
                            }
                            Spacer()
                            Image(systemName: "calendar").font(.system(size: 26)).foregroundStyle(GcTheme.skyLite.opacity(0.85))
                        }
                        HStack(spacing: 14) {
                            heroMetric("\(store.fixtures.count)", L("matchesHero.matches"))
                            heroMetric("\(store.fixtures.filter { $0.status.finished }.count)", L("matchesHero.finished"))
                            heroMetric("\(store.live.count)", L("state.live"), highlight: !store.live.isEmpty)
                            Spacer()
                        }
                    }
                    .padding(16)
                }
                .padding(.top, 8)

                if days.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            dayChip(L("schedule.day.all"), nil)
                            ForEach(days, id: \.key) { d in dayChip(d.label, d.key) }
                        }
                    }
                }

                if rounds.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            roundChip(L("schedule.round.all"), nil)
                            ForEach(rounds, id: \.self) { r in roundChip(roundLabel(r), r) }
                        }
                    }
                }

                if filtered.isEmpty && !store.loading {
                    GcEmptyState(icon: "sportscourt", title: L("schedule.empty.title"), subtitle: L("schedule.empty.subtitle"))
                } else {
                    ForEach(GcFixtureMath.groupByDay(filtered, favoriteTeamId: GcUserPreferences.shared.favoriteTeamId)) { day in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 6) {
                                Circle().fill(GcTheme.emerald).frame(width: 6, height: 6)
                                Text(day.label).font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.emerald)
                            }
                            GcMatchListCard(fixtures: day.items)
                        }
                    }
                }
                if store.loading && store.fixtures.isEmpty {
                    GcLoadingPanel(title: L("loading.matches"))
                }
                GcFooterSignature()
            }
        }
        .refreshable { await store.loadAll(force: true) }
        .navigationBarHidden(true)
    }

    private func heroMetric(_ value: String, _ label: String, highlight: Bool = false) -> some View {
        HStack(spacing: 5) {
            Text(value).font(GulfCupFonts.app(size: 16, weight: .bold)).foregroundStyle(highlight ? GcTheme.skyLite : .white).monospacedDigit()
            Text(label).font(GulfCupFonts.app(size: 10.5)).foregroundStyle(GcTheme.onHeroFaint)
        }
    }

    private func dayChip(_ title: String, _ value: String?) -> some View {
        filterChip(title, selected: dayFilter == value) { dayFilter = value }
    }

    private func roundChip(_ title: String, _ value: String?) -> some View {
        filterChip(title, selected: roundFilter == value) { roundFilter = value }
    }

    private func filterChip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(GulfCupFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(selected ? .white : GcTheme.inkDim)
                .padding(.horizontal, 13).padding(.vertical, 7)
                .background(Capsule().fill(selected ? GcTheme.emerald : GcTheme.chipFill))
        }
        .buttonStyle(GcPressStyle())
    }
}
