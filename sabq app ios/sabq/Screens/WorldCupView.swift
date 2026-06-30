import SwiftUI

// MARK: - قسم كأس العالم 2026 — الشاشة الرئيسية
//
// تستهلك /api/world-cup/* العامة. تطابق صفحة الويب /world-cup: هيرو مباراة
// اليوم، مشوار الأخضر، المباريات بتبويبات، ترتيب المجموعات، السباقات،
// والمنتخبات. الضغط على أي مباراة يفتح مركز المباراة (WorldCupMatchCenter).

private struct WCMatchSelection: Identifiable { let id: Int }

struct WorldCupView: View {
    @State private var overview: WCOverview?
    @State private var fixtures: [WCFixture] = []
    @State private var standings: [WCGroup] = []
    @State private var scorers: [WCScorer] = []

    @State private var overviewLoading = true
    @State private var fixturesLoading = true
    @State private var standingsLoading = true
    @State private var scorersLoading = true

    @State private var selectedMatch: WCMatchSelection?
    @State private var showPredictions = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 22) {
                WCHeroSection(overview: overview, isLoading: overviewLoading) { open($0) }

                WCPredictCTA { showPredictions = true }
                    .padding(.horizontal, 16)

                WCFactsSection()

                if let pid = pulseFixtureId {
                    WCPulseCard(fixtureId: pid) { open($0) }
                        .padding(.horizontal, 16)
                }

                if let saudi = overview?.saudi, !saudi.fixtures.isEmpty {
                    WCSaudiSpotlight(saudi: saudi) { open($0) }
                }

                WCMatchesSection(fixtures: fixtures, isLoading: fixturesLoading) { open($0) }

                WCStandingsSection(groups: standings, isLoading: standingsLoading)

                WCKnockoutSection(fixtures: fixtures, groups: standings) { open($0) }

                WCRacesSection(
                    scorers: scorers,
                    scorersLoading: scorersLoading,
                    tournamentStarted: fixtures.contains { $0.status.live || $0.status.finished }
                )

                WCTeamsSection()

                WCNewsSection()
            }
            .padding(.bottom, 36)
        }
        .sabqAutoHideTabBar()
        .background(WCTheme.sectionBackground.ignoresSafeArea())
        .navigationTitle("مونديال 2026")
        .navigationBarTitleDisplayMode(.inline)
        // لا خلفية صلبة لشريط التنقّل — يبقى شفّافًا فتظهر خلفية الصفحة الخفيفة خلف
        // العنوان. لون العنوان يتبع النظام (داكن على الفاتح، أبيض في الليلي).
        .task { await loadAll() }
        // متابعة لحظية: استطلاع كل 8ث أثناء وجود مباراة جارية فتتحدّث النتيجة
        // والدقيقة تلقائيًّا (كما في مركز المباراة). بدونه كانت الشاشة تُحمّل مرة
        // واحدة فلا يتغيّر الوقت إلا بسحب يدوي. force=true لتجاوز الكاش.
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                if Task.isCancelled { return }
                if isAnyLive { await loadAll(force: true) }
            }
        }
        .refreshable { await loadAll(force: true) }
        .sheet(item: $selectedMatch) { sel in
            WorldCupMatchCenter(fixtureId: sel.id)
        }
        // ملء الشاشة (لا sheet): الرأس الأخضر «الملعب» يمتد حتى الحافة العليا بلا
        // فجوة فاتحة فوقه (الـ sheet بنمط large يترك شريطًا علويًا يكشف الصفحة خلفها).
        // الإغلاق عبر زر X في الرأس.
        .fullScreenCover(isPresented: $showPredictions) {
            WCPredictionsView()
        }
        .sabqRTL()
    }

    private func open(_ fixtureId: Int) { selectedMatch = WCMatchSelection(id: fixtureId) }

    /// هل توجد مباراة جارية الآن؟ (لتقرير الحاجة للاستطلاع الدوري اللحظي).
    private var isAnyLive: Bool {
        (overview?.live.contains { $0.status.live } ?? false)
            || fixtures.contains { $0.status.live }
    }

    /// مباراة ودجت النبض: حيّة أولًا → أقرب قادمة → أحدث منتهية (مطابق اختيار الويب #434)
    private var pulseFixtureId: Int? {
        if let live = fixtures.first(where: { $0.status.live }) { return live.id }
        let nowTs = Int(Date().timeIntervalSince1970)
        if let next = fixtures
            .filter({ !$0.status.finished && !$0.status.live && $0.timestamp >= nowTs })
            .min(by: { $0.timestamp < $1.timestamp }) {
            return next.id
        }
        if let last = fixtures.filter({ $0.status.finished }).max(by: { $0.timestamp < $1.timestamp }) {
            return last.id
        }
        return overview?.matchOfTheDay?.fixture.id
    }

    // عند السحب للتحديث (force=true) نمرّر تجاوز الكاش لكل النقاط، وإلا
    // بقيت النتائج/الجدول/الترتيب من URLCache (الخادم يضع max-age=30/120/300)
    // فلا تتغيّر النتائج الحيّة إلا بعد انتهاء المهلة → «لازم سحبتين أو ثلاث».
    private func loadAll(force: Bool = false) async {
        async let a: Void = loadOverview(force: force)
        async let b: Void = loadFixtures(force: force)
        async let c: Void = loadStandings(force: force)
        async let d: Void = loadScorers(force: force)
        _ = await (a, b, c, d)
    }

    private func loadOverview(force: Bool) async {
        do {
            let r = try await APIClient.shared.fetchWorldCupOverview(ignoreCache: force)
            await MainActor.run { overview = r; overviewLoading = false }
        } catch { await MainActor.run { overviewLoading = false } }
    }
    private func loadFixtures(force: Bool = false) async {
        do {
            let r = try await APIClient.shared.fetchWorldCupFixtures(ignoreCache: force)
            await MainActor.run { fixtures = r; fixturesLoading = false }
        } catch { await MainActor.run { fixturesLoading = false } }
    }
    private func loadStandings(force: Bool = false) async {
        do {
            let r = try await APIClient.shared.fetchWorldCupStandings(ignoreCache: force)
            await MainActor.run { standings = r; standingsLoading = false }
        } catch { await MainActor.run { standingsLoading = false } }
    }
    private func loadScorers(force: Bool = false) async {
        do {
            let r = try await APIClient.shared.fetchWorldCupScorers(ignoreCache: force)
            await MainActor.run { scorers = r; scorersLoading = false }
        } catch { await MainActor.run { scorersLoading = false } }
    }
}

// MARK: - الهيرو (مباراة اليوم)

struct WCHeroSection: View {
    let overview: WCOverview?
    let isLoading: Bool
    let onOpenMatch: (Int) -> Void

    @State private var selectedTeam: WCTeam?

    private var motd: WCMatchOfDay? { overview?.matchOfTheDay }
    private var featured: WCFixture? { motd?.fixture }
    private var today: [WCFixture] { overview?.today ?? [] }
    private var liveMatches: [WCFixture] { (overview?.live ?? []).filter { $0.status.live } }
    private var liveCount: Int { liveMatches.count }

    // مباريات قادمة تنطلق في التوقيت نفسه للمباراة المميّزة (لم تبدأ بعد) — ختام
    // دور المجموعات تحديدًا. الشقيقات تأتي من الخادم (matchOfDayPeers) لا من today
    // فقط، لأن المباراة قد تنطلق بعد منتصف الليل (يوم تالٍ) فلا تكون في مباريات
    // اليوم. مطابق منطق الويب HeroSection.
    private var peers: [WCFixture] { overview?.matchOfDayPeers ?? [] }
    private var upcomingPeers: [WCFixture] {
        guard let f = featured, !f.status.live, !f.status.finished else { return [] }
        return [f] + peers.filter {
            $0.id != f.id && !$0.status.live && !$0.status.finished && $0.timestamp == f.timestamp
        }
    }

    // نُبرز كل المباريات المتزامنة ببطاقات كبيرة بدل إبراز واحدة وحشر الباقي:
    //  • مباراتان (أو أكثر) تجريان الآن، أو
    //  • مباراتان قادمتان تنطلقان في التوقيت نفسه.
    private var multiHero: Bool { liveCount >= 2 || upcomingPeers.count >= 2 }

    private var heroFixtures: [WCFixture] {
        if !multiHero { return featured.map { [$0] } ?? [] }
        return liveCount >= 2 ? liveMatches : upcomingPeers
    }

    private var heroIds: Set<Int> { Set(heroFixtures.map(\.id)) }

    // الشريط: في الوضع المتعدد يعرض بقية مباريات اليوم فقط (لا تكرار للبطاقات
    // الكبيرة)؛ في المفرد يعرض كل مباريات اليوم مع إبراز المميّزة.
    private var stripMatches: [WCFixture] { multiHero ? today.filter { !heroIds.contains($0.id) } : today }
    private var showStrip: Bool { multiHero ? stripMatches.count >= 1 : today.count >= 2 }

    // توقع كل بطاقة من خريطة overview.predictions؛ والمميّزة تتراجع لتوقعها
    // الجاهز في matchOfTheDay عند غيابه من الخريطة.
    private func prediction(for f: WCFixture) -> WCPrediction? {
        overview?.prediction(for: f.id) ?? (f.id == featured?.id ? motd?.prediction : nil)
    }

    var body: some View {
        VStack(spacing: 18) {
            header
            card
            if !isLoading, showStrip {
                WCHeroTodayStrip(
                    matches: stripMatches,
                    activeId: multiHero ? nil : featured?.id,
                    onOpenMatch: onOpenMatch
                )
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 52) // يُنزِل المحتوى أسفل شريط التنقّل الشفّاف (لا تداخل مع العنوان/الزر)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .sheet(item: $selectedTeam) { team in
            WCTeamSheet(team: team).presentationDetents([.large])
        }
        // لا كتلة خلفية للهيرو — يجلس مباشرة على خلفية الصفحة الزرقاء الخفيفة جدًا
        // (sectionBackground). النصوص والبطاقة تكيّفية تُقرأ على الفاتح والليلي.
    }

    private var header: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                pill(icon: "trophy.fill", text: "تغطية خاصة",
                     bg: WCTheme.gold.opacity(0.18), fg: WCTheme.gold)
                if liveCount > 0 {
                    pill(icon: "dot.radiowaves.left.and.right",
                         text: liveCount == 1 ? "مباراة مباشرة" : "\(liveCount) مباريات مباشرة",
                         bg: WCTheme.liveRed, fg: .white)
                }
            }
            Text("مونديال 2026")
                .font(SabqFonts.app(size: 40, weight: .black))
                .foregroundStyle(WCTheme.emeraldDeep)
            Text("48 منتخبًا · 16 ملعبًا · تغطية حية بتوقيت الرياض")
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(WCTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
    }

    @ViewBuilder private var card: some View {
        if isLoading {
            VStack(spacing: 14) {
                ProgressView().tint(WCTheme.emerald)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 30)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(WCTheme.card))
        } else if heroFixtures.isEmpty {
            WCEmptyDark(icon: "sparkles", title: "تغطية المونديال تنطلق قريبًا",
                        subtitle: "جدول المباريات والنتائج الحية ستجدها هنا أولًا بأول")
        } else if heroFixtures.count == 1 {
            matchCard(heroFixtures[0], compact: false)
        } else {
            // بطاقة كبيرة لكل مباراة متزامنة — تتراصّ عموديًّا (نمط الموبايل)
            VStack(spacing: 14) {
                ForEach(heroFixtures) { f in
                    matchCard(f, compact: true)
                }
            }
        }
    }

    private func matchCard(_ f: WCFixture, compact: Bool) -> some View {
        VStack(spacing: compact ? 13 : 16) {
            HStack(spacing: 6) {
                Text(f.status.live ? "تجري الآن" : (WCFormat.dayKey(f.date) == WCFormat.todayKey() ? "مباراة اليوم" : "المباراة القادمة"))
                    .foregroundStyle(WCTheme.emeraldDeep)
                Text("·").foregroundStyle(WCTheme.onDarkDim)
                Text(f.round).foregroundStyle(WCTheme.onDarkDim)
            }
            .font(SabqFonts.app(size: 12, weight: .semibold))

            HStack(alignment: .top, spacing: 8) {
                teamColumn(f.home, compact: compact)
                centerColumn(f, compact: compact)
                teamColumn(f.away, compact: compact)
            }

            if !f.started {
                WCCountdownChips(timestamp: f.timestamp)
            }
            if !f.status.finished {
                WCHeroPrediction(fixture: f, prediction: prediction(for: f))
            }

            Button { onOpenMatch(f.id) } label: {
                Text("مركز المباراة")
                    .font(SabqFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 24).padding(.vertical, 10)
                    .background(Capsule().fill(WCTheme.royal))
            }
        }
        .padding(compact ? 16 : 20)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(WCTheme.cardStroke, lineWidth: 1))
        .shadow(color: WCTheme.royal.opacity(0.10), radius: 16, x: 0, y: 8)
    }

    private func teamColumn(_ team: WCTeam, compact: Bool) -> some View {
        Button { selectedTeam = team } label: {
            VStack(spacing: 8) {
                WCTeamLogo(team: team, size: compact ? 52 : 64, ring: WCTheme.cardStroke)
                Text(team.name)
                    .font(SabqFonts.app(size: compact ? 14 : 16, weight: .heavy))
                    .foregroundStyle(WCTheme.onDark)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private func centerColumn(_ f: WCFixture, compact: Bool) -> some View {
        VStack(spacing: 6) {
            if f.started {
                // المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR ليلاصق كل رقم منتخبه
                Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                    .font(SabqFonts.app(size: compact ? 34 : 40, weight: .black))
                    .foregroundStyle(WCTheme.onDark)
                    .environment(\.layoutDirection, .leftToRight)
                if let po = f.penaltyOutcome {
                    Text("فاز \(po.winnerName) بالترجيح (\(po.winnerScore)-\(po.loserScore))")
                        .font(SabqFonts.app(size: 11, weight: .bold))
                        .foregroundStyle(WCTheme.emeraldDeep)
                        .multilineTextAlignment(.center)
                }
                WCStatusPill(fixture: f, onDark: false)
            } else {
                Text(WCFormat.time(f))
                    .font(SabqFonts.app(size: compact ? 22 : 26, weight: .black))
                    .foregroundStyle(WCTheme.onDark)
                Label(WCFormat.day(f), systemImage: "calendar")
                    .font(SabqFonts.app(size: 11))
                    .foregroundStyle(WCTheme.onDarkDim)
                    .labelStyle(.titleAndIcon)
            }
        }
        .frame(minWidth: compact ? 92 : 110)
    }

    private func pill(icon: String, text: String, bg: Color, fg: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon).font(SabqFonts.app(size: 11, weight: .bold))
            Text(text).font(SabqFonts.app(size: 12, weight: .bold))
        }
        .foregroundStyle(fg)
        .padding(.horizontal, 12).padding(.vertical, 5)
        .background(Capsule().fill(bg))
    }
}

/// شريط «مباريات اليوم» أسفل الهيرو — بقية مباريات اليوم غير المعروضة كبطاقات
/// كبيرة (الوضع المتعدد)، أو كل مباريات اليوم مع إبراز المميّزة (الوضع المفرد).
/// مطابق TodayStrip في الويب: شارة لكل مباراة بالشعارين والنتيجة/الموعد والحالة.
struct WCHeroTodayStrip: View {
    let matches: [WCFixture]
    let activeId: Int?
    let onOpenMatch: (Int) -> Void

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 5) {
                Image(systemName: "calendar").font(SabqFonts.app(size: 11, weight: .bold))
                Text("مباريات اليوم").font(SabqFonts.app(size: 12, weight: .bold))
                Text("(\(matches.count))").font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
            }
            .foregroundStyle(WCTheme.emeraldDeep)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(matches) { f in
                        chip(f)
                    }
                }
                .padding(.horizontal, 2)
            }
        }
        .padding(.top, 4)
    }

    private func chip(_ f: WCFixture) -> some View {
        let active = f.id == activeId
        return Button { onOpenMatch(f.id) } label: {
            VStack(spacing: 4) {
                HStack(spacing: 6) {
                    WCTeamLogo(team: f.home, size: 22, ring: WCTheme.cardStroke)
                    // الضيف أولًا داخل LTR ليلاصق كل رقم منتخبه — كبطاقة المباراة المميّزة
                    Text(f.started ? "\(f.goals.away ?? 0) - \(f.goals.home ?? 0)" : WCFormat.time(f))
                        .font(SabqFonts.app(size: 13, weight: .black))
                        .foregroundStyle(WCTheme.onDark)
                        .environment(\.layoutDirection, .leftToRight)
                        .frame(minWidth: 44)
                    WCTeamLogo(team: f.away, size: 22, ring: WCTheme.cardStroke)
                }
                Group {
                    if f.status.live {
                        HStack(spacing: 3) {
                            Circle().fill(WCTheme.liveRed).frame(width: 5, height: 5)
                            Text(chipLiveText(f.status))
                        }
                        .foregroundStyle(WCTheme.liveRed)
                    } else {
                        Text(f.status.finished ? "انتهت" : "لم تبدأ")
                            .foregroundStyle(WCTheme.onDarkDim)
                    }
                }
                .font(SabqFonts.app(size: 10, weight: .semibold))
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(active ? WCTheme.emerald.opacity(0.15) : WCTheme.chipFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(active ? WCTheme.emerald.opacity(0.5) : WCTheme.cardStroke.opacity(0.4), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    /// نص الحالة الحيّة للشارة المختصرة: الدقيقة أثناء اللعب، وإلا نص الحالة
    /// («استراحة الشوطين»/«ركلات الترجيح») بدل دقيقة مجمّدة. يبقى مختصرًا بلا اسم الشوط.
    private func chipLiveText(_ s: WCStatus) -> String {
        let running = ["1H", "2H", "ET", "LIVE"].contains(s.code) && s.elapsed != nil
        if running, let e = s.elapsed {
            return (s.extra ?? 0) > 0 ? "\(e)+\(s.extra!)'" : "\(e)'"
        }
        return s.label.isEmpty ? "مباشر" : s.label
    }
}

/// حالة فارغة داخل الهيرو الداكن.
struct WCEmptyDark: View {
    let icon: String; let title: String; let subtitle: String
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(SabqFonts.app(size: 30)).foregroundStyle(WCTheme.emerald)
            Text(title).font(SabqFonts.app(size: 16, weight: .bold)).foregroundStyle(WCTheme.onDark)
            Text(subtitle).font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 24)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(WCTheme.card))
    }
}

// MARK: - مشوار الأخضر

struct WCSaudiSpotlight: View {
    let saudi: WCSaudi
    let onOpenMatch: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Text("مشوار الأخضر")
                    .font(SabqFonts.headline(size: 24)).foregroundStyle(.white)
                if let g = saudi.group {
                    Text(g.group)
                        .font(SabqFonts.app(size: 11, weight: .semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Capsule().fill(.white.opacity(0.15)))
                }
                Spacer()
            }
            if let next = saudi.next {
                Label("\(next.venue.name) — \(next.venue.city)", systemImage: "mappin.and.ellipse")
                    .font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.emerald.opacity(0.85))
            }
            ForEach(saudi.fixtures) { f in
                saudiRow(f)
            }
            WCSaudiSquadStrip()
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [WCTheme.emeraldDeep, WCTheme.stadiumTop],
                           startPoint: .topTrailing, endPoint: .bottomLeading)
        )
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .padding(.horizontal, 16)
    }

    private func saudiRow(_ f: WCFixture) -> some View {
        let opp = f.home.id == WCTheme.saudiId ? f.away : f.home
        let saudiGoals = f.home.id == WCTheme.saudiId ? f.goals.home : f.goals.away
        let oppGoals = f.home.id == WCTheme.saudiId ? f.goals.away : f.goals.home
        return Button { onOpenMatch(f.id) } label: {
            HStack(spacing: 10) {
                WCTeamLogo(team: opp, size: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text("ضد \(opp.name)").font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(.white)
                    Text("\(f.round) · \(WCFormat.day(f))")
                        .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.emerald.opacity(0.7))
                }
                Spacer()
                if f.started {
                    Text("\(saudiGoals ?? 0) - \(oppGoals ?? 0)")
                        .font(SabqFonts.app(size: 17, weight: .black)).foregroundStyle(.white)
                        .environment(\.layoutDirection, .leftToRight)
                } else {
                    Text(WCFormat.time(f)).font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.emerald)
                }
                WCStatusPill(fixture: f, onDark: true)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white.opacity(0.08)))
        }
        .buttonStyle(.plain)
    }
}

/// شريط تشكيلة الأخضر — كل لاعب يفتح بطاقته الشاملة.
/// ZStack + Color.clear وليس Group/if: الحاوية يجب أن تبقى حية وإلا
/// أسقط EmptyView معدِّل task ولن تُجلب القائمة أبدًا (فخ موثّق).
struct WCSaudiSquadStrip: View {
    @State private var players: [WCSquadPlayer] = []
    @State private var selectedPlayer: WCPlayerSelection?

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(width: 0, height: 0)
            if !players.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("تشكيلة الأخضر — اضغط على اللاعب لملفه الكامل")
                        .font(SabqFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(WCTheme.emerald.opacity(0.85))
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(players) { p in
                                playerChip(p)
                            }
                        }
                    }
                }
            }
        }
        .task {
            if let r = try? await APIClient.shared.fetchWorldCupSquad(teamId: WCTheme.saudiId) {
                await MainActor.run { players = r.players }
            }
        }
        .sheet(item: $selectedPlayer) { sel in
            WCPlayerSheet(playerId: sel.id)
                .presentationDetents([.large])
        }
    }

    private func playerChip(_ p: WCSquadPlayer) -> some View {
        Button { selectedPlayer = WCPlayerSelection(p.id) } label: {
            VStack(spacing: 4) {
                Group {
                    if p.photo.isEmpty {
                        Text(String(p.name.prefix(2)))
                            .font(SabqFonts.app(size: 13, weight: .black)).foregroundStyle(.white.opacity(0.7))
                            .frame(width: 46, height: 46).background(Circle().fill(.white.opacity(0.12)))
                    } else {
                        WCRemoteImage(url: p.photo, contentMode: .fill)
                            .frame(width: 46, height: 46).clipShape(Circle())
                    }
                }
                .overlay(Circle().stroke(.white.opacity(0.25), lineWidth: 2))
                Text(p.name)
                    .font(SabqFonts.app(size: 9, weight: .semibold)).foregroundStyle(.white.opacity(0.9))
                    .lineLimit(2).multilineTextAlignment(.center)
                    .frame(width: 58, height: 24, alignment: .top)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - المباريات (تبويبات)

struct WCMatchesSection: View {
    let fixtures: [WCFixture]
    let isLoading: Bool
    let onOpenMatch: (Int) -> Void

    enum Tab: String, CaseIterable { case live = "مباشر", today = "اليوم", upcoming = "القادمة", finished = "النتائج" }
    // nil = اتبع الافتراضي المحسوب؛ بمجرد اختيار المستخدم يثبت اختياره
    @State private var userTab: Tab?

    private var live: [WCFixture] { fixtures.filter { $0.status.live } }
    private var today: [WCFixture] {
        // المنتهية تنزل أسفل غير المنتهية (مباشرة ثم قادمة)، وداخل كل مجموعة بترتيب
        // توقيت الانطلاق تصاعديًا — حتى لا تتصدّر نتائجُ مباريات سبق أن انتهت القائمةَ.
        func rank(_ f: WCFixture) -> Int { f.status.live ? 0 : (f.status.finished ? 2 : 1) }
        return fixtures
            .filter { WCFormat.dayKey($0.date) == WCFormat.todayKey() }
            .sorted { a, b in
                let (ra, rb) = (rank(a), rank(b))
                return ra != rb ? ra < rb : a.timestamp < b.timestamp
            }
    }
    private var upcoming: [WCFixture] { fixtures.filter { !$0.status.live && !$0.status.finished } }
    private var finished: [WCFixture] { fixtures.filter { $0.status.finished }.reversed() }

    // الافتراضي «اليوم» إذا كان فيه مباريات (لتقليل الازدحام)، وإلا مباشر ثم القادمة
    private var defaultTab: Tab {
        if !today.isEmpty { return .today }
        if !live.isEmpty { return .live }
        return .upcoming
    }
    private var tab: Tab { userTab ?? defaultTab }

    private var current: [WCFixture] {
        switch tab {
        case .live: return live
        case .today: return today
        case .upcoming: return upcoming
        case .finished: return finished
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            WCSectionHeader(icon: "calendar", title: "المباريات",
                            subtitle: "جدول مونديال 2026 بتوقيت الرياض")
                .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Tab.allCases, id: \.self) { t in
                        let count = t == .live ? live.count : 0
                        Button { withAnimation(.easeOut(duration: 0.2)) { userTab = t } } label: {
                            HStack(spacing: 5) {
                                Text(t.rawValue)
                                if t == .live && count > 0 {
                                    Text("\(count)").font(SabqFonts.app(size: 10, weight: .bold))
                                        .padding(.horizontal, 5).padding(.vertical, 1)
                                        .background(Capsule().fill(WCTheme.liveRed)).foregroundStyle(.white)
                                }
                            }
                            .font(SabqFonts.app(size: 14, weight: .semibold))
                            .foregroundStyle(tab == t ? .white : WCTheme.onDarkDim)
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(Capsule().fill(tab == t ? WCTheme.emeraldDeep : WCTheme.chipFill))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
            }

            if isLoading {
                WCLoading()
            } else if current.isEmpty {
                Text(emptyText)
                    .font(SabqFonts.app(size: 13)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 30)
            } else {
                LazyVStack(spacing: 16) {
                    ForEach(groupedByDay(current), id: \.key) { day in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 6) {
                                Circle().fill(WCTheme.emeraldDeep).frame(width: 7, height: 7)
                                Text(day.label).font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark)
                                Text("(\(day.items.count))").font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
                            }
                            ForEach(day.items) { f in
                                WCMatchCard(fixture: f) { onOpenMatch(f.id) }
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private var emptyText: String {
        switch tab {
        case .live: return "لا توجد مباريات مباشرة الآن — عُد عند صافرة البداية"
        case .today: return "لا توجد مباريات اليوم"
        case .upcoming: return "لا توجد مباريات قادمة معلنة بعد"
        case .finished:
            // «الانطلاقة قريبًا» تصبح خاطئة لحظة انطلاق البطولة — الرسالة تتبع الحالة
            return live.isEmpty
                ? "النتائج تظهر هنا فور انتهاء أول مباراة"
                : "مباراة جارية الآن — نتيجتها تظهر هنا فور صافرة النهاية"
        }
    }

    private struct DayBucket { let key: String; let label: String; let items: [WCFixture] }
    private func groupedByDay(_ items: [WCFixture]) -> [DayBucket] {
        var buckets: [DayBucket] = []
        for f in items {
            let key = WCFormat.dayKey(f.date)
            if let last = buckets.last, last.key == key {
                buckets[buckets.count - 1] = DayBucket(key: key, label: last.label, items: last.items + [f])
            } else {
                buckets.append(DayBucket(key: key, label: WCFormat.day(f), items: [f]))
            }
        }
        return buckets
    }
}

/// بطاقة مباراة.
struct WCMatchCard: View {
    let fixture: WCFixture
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 10) {
                HStack {
                    Text(fixture.round).font(SabqFonts.app(size: 11, weight: .semibold)).foregroundStyle(WCTheme.onDarkDim)
                    Spacer()
                    WCStatusPill(fixture: fixture)
                }
                teamRow(fixture.home, goals: fixture.started ? fixture.goals.home ?? 0 : nil, win: fixture.home.winner == true)
                teamRow(fixture.away, goals: fixture.started ? fixture.goals.away ?? 0 : nil, win: fixture.away.winner == true)
                if let po = fixture.penaltyOutcome {
                    HStack {
                        Text("فاز \(po.winnerName) بركلات الترجيح (\(po.winnerScore)-\(po.loserScore))")
                            .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                        Spacer()
                    }
                }
                Divider().overlay(WCTheme.cardStroke)
                HStack(spacing: 5) {
                    Image(systemName: "mappin.and.ellipse").font(SabqFonts.app(size: 10))
                    Text("\(fixture.venue.name) — \(fixture.venue.city)").lineLimit(1)
                    Spacer()
                }
                .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(WCTheme.card))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
        }
        .buttonStyle(.plain)
    }

    private func teamRow(_ team: WCTeam, goals: Int?, win: Bool) -> some View {
        HStack(spacing: 8) {
            WCTeamLogo(team: team, size: 28, ring: WCTheme.cardStroke)
            Text(team.name)
                .font(SabqFonts.app(size: 14, weight: win ? .heavy : .semibold))
                .foregroundStyle(WCTheme.onDark)
            Spacer()
            if let goals {
                Text("\(goals)")
                    .font(SabqFonts.app(size: 16, weight: .heavy))
                    .foregroundStyle(win ? WCTheme.emeraldDeep : WCTheme.onDark)
            }
        }
    }
}

// MARK: - ترتيب المجموعات

struct WCStandingsSection: View {
    let groups: [WCGroup]
    let isLoading: Bool
    @State private var selectedTeam: WCTeam?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            WCSectionHeader(icon: "list.number", title: "ترتيب المجموعات",
                            subtitle: "يتأهل الأول والثاني وأفضل 8 من أصحاب المركز الثالث")
                .padding(.horizontal, 16)

            if isLoading {
                WCLoading()
            } else if groups.isEmpty {
                Text("جداول الترتيب تظهر هنا فور انطلاق البطولة")
                    .font(SabqFonts.app(size: 13)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 28)
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(groups) { group in
                        groupCard(group)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
        .sheet(item: $selectedTeam) { team in
            WCTeamSheet(team: team).presentationDetents([.large])
        }
    }

    private func groupCard(_ group: WCGroup) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(group.group).font(SabqFonts.app(size: 15, weight: .heavy)).foregroundStyle(WCTheme.emeraldDeep)
                Spacer()
                HStack(spacing: 10) {
                    Text("لعب"); Text("فارق"); Text("نقاط")
                }
                .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
            }
            ForEach(group.rows) { row in
                Button { selectedTeam = row.team } label: { standingRow(row) }
                    .buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }

    private func standingRow(_ row: WCStandingRow) -> some View {
        // حالة التأهّل من الخادم إن توفّرت، وإلا تقدير بالمركز (الأول/الثاني تأهّل، الثالث منافِس)
        let highlight: Color = row.qualifyStatus != nil
            ? row.qualifyColor
            : (row.rank <= 2 ? WCTheme.emeraldDeep : (row.rank == 3 ? WCTheme.gold : .clear))
        return HStack(spacing: 8) {
            Text("\(row.rank)").font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim).frame(width: 16)
            WCTeamLogo(team: row.team, size: 20, ring: WCTheme.cardStroke)
            Text(row.team.name).font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
            if row.live == true {
                Circle().fill(WCTheme.liveRed).frame(width: 6, height: 6)
            }
            if let label = row.qualifyLabel {
                Text(label)
                    .font(SabqFonts.app(size: 9, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 5).padding(.vertical, 1)
                    .background(Capsule().fill(row.qualifyColor))
            }
            if let form = row.form { WCFormDots(form: form) }
            Spacer()
            Text("\(row.played)").frame(width: 28)
            Text(row.goalsDiff > 0 ? "+\(row.goalsDiff)" : "\(row.goalsDiff)").frame(width: 36)
                .environment(\.layoutDirection, .leftToRight)
            Text("\(row.points)").font(SabqFonts.app(size: 14, weight: .black)).foregroundStyle(WCTheme.onDark).frame(width: 28)
        }
        .font(SabqFonts.app(size: 12).monospacedDigit())
        .foregroundStyle(WCTheme.onDarkDim)
        .padding(.vertical, 5).padding(.horizontal, 6)
        .background(
            HStack { Rectangle().fill(highlight).frame(width: 3); Spacer() }
                .background(highlight == .clear ? Color.clear : highlight.opacity(0.07))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        )
    }
}

/// نقاط شكل آخر 5 مباريات.
struct WCFormDots: View {
    let form: String
    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(form.suffix(5).enumerated()), id: \.offset) { _, ch in
                Circle().fill(color(ch)).frame(width: 6, height: 6)
            }
        }
        .environment(\.layoutDirection, .leftToRight)
    }
    private func color(_ ch: Character) -> Color {
        switch ch { case "W": return WCTheme.emeraldDeep; case "D": return WCTheme.onDarkDim; case "L": return WCTheme.liveRed; default: return WCTheme.cardStroke }
    }
}

// MARK: - نبض المباراة (ودجت حيّ — /world-cup/pulse/:id)
//
// تكافؤ مع WorldCupPulse على الويب (#434): نتيجة/دقيقة لحظية بنداء خفيف يتجدّد
// كل ١٢ث أثناء البث، شريط زخم هجومي، توهّج نبض عند زخم>70، رادار VAR، وفلاش
// هدف ٥ث عند تغيّر النتيجة. يختار الخادم/الواجهة المباراة (حيّة→قادمة→منتهية).

struct WCPulseCard: View {
    let fixtureId: Int
    let onOpen: (Int) -> Void

    @State private var pulse: WCPulse?
    @State private var goalFlash = false
    @State private var glow = false   // نبضة دائمة للتوهّج والنقطة الحيّة

    private var highPulse: Bool { (pulse?.momentum.value ?? 0) > 70 && (pulse?.status.live ?? false) }

    var body: some View {
        Group {
            if let p = pulse {
                card(p)
                    .onTapGesture { onOpen(fixtureId) }
            } else {
                EmptyView()
            }
        }
        .task(id: fixtureId) {
            glow = true
            await loop()
        }
    }

    // MARK: البطاقة
    private func card(_ p: WCPulse) -> some View {
        VStack(spacing: 14) {
            topRow(p)
            HStack(alignment: .top, spacing: 8) {
                teamCol(p.home)
                centerScore(p)
                teamCol(p.away)
            }
            if p.status.live, p.momentum.home + p.momentum.away > 0 {
                momentumBar(p)
            }
            if let v = p.lastVar { varChip(p, v) }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(LinearGradient(colors: [WCTheme.pitchTop, WCTheme.pitchBottom],
                                     startPoint: .topTrailing, endPoint: .bottomLeading))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(WCTheme.emerald.opacity(highPulse && glow ? 0.85 : 0.4), lineWidth: 1)
        )
        .overlay(alignment: .top) { if goalFlash { goalBanner } }
        .shadow(color: WCTheme.emerald.opacity(highPulse ? (glow ? 0.55 : 0.18) : 0),
                radius: highPulse ? (glow ? 22 : 9) : 0)
        .animation(.easeInOut(duration: 0.95).repeatForever(autoreverses: true), value: glow)
        .animation(.spring(response: 0.4), value: goalFlash)
    }

    private func topRow(_ p: WCPulse) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "dot.radiowaves.left.and.right")
                .font(.system(size: 11)).foregroundStyle(WCTheme.emerald)
            Text(p.round.isEmpty ? "نبض المباراة" : p.round)
                .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(.white.opacity(0.8))
                .lineLimit(1)
            Spacer(minLength: 6)
            statusPill(p)
        }
    }

    @ViewBuilder private func statusPill(_ p: WCPulse) -> some View {
        if p.status.live {
            HStack(spacing: 5) {
                Circle().fill(WCTheme.liveRed).frame(width: 7, height: 7)
                    .opacity(glow ? 0.35 : 1)
                Text(liveMinute(p))
                    .font(SabqFonts.app(size: 12, weight: .black))
                    .foregroundStyle(.white)
                    .environment(\.layoutDirection, .leftToRight)
            }
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(WCTheme.liveRed.opacity(0.25)))
        } else if p.status.finished {
            Text(p.status.label.isEmpty ? "انتهت" : p.status.label)
                .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.liveRed)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(WCTheme.liveRed.opacity(0.20)))
        } else {
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                Text("تبدأ بعد \(WCFormat.countdown(to: p.timestamp))")
                    .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.emerald)
                    .environment(\.layoutDirection, .leftToRight)
            }
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(WCTheme.emerald.opacity(0.15)))
        }
    }

    private func teamCol(_ side: WCPulseSide) -> some View {
        VStack(spacing: 8) {
            WCRemoteImage(url: side.logo).frame(width: 46, height: 46)
            Text(side.name)
                .font(SabqFonts.app(size: 13, weight: .bold)).foregroundStyle(.white)
                .lineLimit(1).minimumScaleFactor(0.75).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private func centerScore(_ p: WCPulse) -> some View {
        Text("\(p.score.home) - \(p.score.away)")
            .font(SabqFonts.app(size: 30, weight: .black).monospacedDigit())
            .foregroundStyle(.white)
            .environment(\.layoutDirection, .leftToRight)
            .padding(.top, 6)
    }

    private func momentumBar(_ p: WCPulse) -> some View {
        let m = p.momentum
        let total = max(m.home + m.away, 1)
        let homeFrac = CGFloat(m.home) / CGFloat(total)
        return VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Text("الزخم الهجومي")
                    .font(SabqFonts.app(size: 10, weight: .semibold)).foregroundStyle(WCTheme.emerald)
                Spacer()
                if let leader = m.leader, m.value > 0 {
                    Text("\(leader == "home" ? p.home.name : p.away.name) +\(m.value)")
                        .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(.white.opacity(0.85))
                        .lineLimit(1)
                }
            }
            // RTL: المضيف (زمردي) يمينًا، الضيف (ذهبي) يسارًا
            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle().fill(WCTheme.emerald).frame(width: geo.size.width * homeFrac)
                    Rectangle().fill(WCTheme.gold.opacity(0.85))
                }
            }
            .frame(height: 8)
            .clipShape(Capsule())
        }
    }

    private func varChip(_ p: WCPulse, _ v: WCPulseVar) -> some View {
        HStack(spacing: 5) {
            Image(systemName: "tv").font(.system(size: 10))
            Text("مراجعة الفيديو (VAR) · د.\(v.minute) · \(v.team == "home" ? p.home.name : p.away.name)")
                .font(SabqFonts.app(size: 10, weight: .semibold)).lineLimit(1)
        }
        .foregroundStyle(Color(red: 0.72, green: 0.55, blue: 0.98))
        .padding(.horizontal, 9).padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.purple.opacity(0.18)))
    }

    private var goalBanner: some View {
        HStack(spacing: 6) {
            Image(systemName: "soccerball").font(.system(size: 13))
            Text("هدف!").font(SabqFonts.app(size: 14, weight: .black))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 14).padding(.vertical, 6)
        .background(Capsule().fill(WCTheme.emeraldDeep))
        .shadow(color: WCTheme.emerald.opacity(0.6), radius: 10)
        .offset(y: -12)
        .transition(.scale.combined(with: .opacity))
    }

    private func liveMinute(_ p: WCPulse) -> String {
        let s = p.status
        // حالة النبض بلا code — نكتشف توقّف العدّاد من النص المعرّب
        // (استراحة الشوطين/استراحة الوقت الإضافي/ركلات الترجيح/موقوفة)
        let stopped = s.label.contains("استراحة") || s.label.contains("ترجيح") || s.label.contains("موقوف")
        guard !stopped, let e = s.elapsed else { return s.label.isEmpty ? "مباشر" : s.label }
        let x = (s.extra ?? 0) > 0 ? "+\(s.extra!)" : ""
        return "د. \(e)\(x)"
    }

    // MARK: التحديث الحيّ
    private func loop() async {
        while !Task.isCancelled {
            let prevTotal = (pulse?.score.home ?? 0) + (pulse?.score.away ?? 0)
            if let p = try? await APIClient.shared.fetchWorldCupPulse(
                fixtureId: fixtureId, ignoreCache: pulse?.status.live ?? false) {
                let increased = pulse != nil && (p.score.home + p.score.away) > prevTotal
                await MainActor.run {
                    pulse = p
                    if increased { triggerGoalFlash() }
                }
            }
            let live = pulse?.status.live ?? false
            try? await Task.sleep(nanoseconds: live ? 12_000_000_000 : 60_000_000_000)
        }
    }

    private func triggerGoalFlash() {
        goalFlash = true
        Task {
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            await MainActor.run { goalFlash = false }
        }
    }
}
