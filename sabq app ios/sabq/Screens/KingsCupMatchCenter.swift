import SwiftUI

// MARK: - مركز مباراة كأس الملك
//
// أحداث لحظة بلحظة، التشكيلات على ملعب 2D، والإحصائيات. يُعرض كـ sheet من أي
// بطاقة مباراة. أبسط من مركز مباراة المونديال (لا زخم/ضغط/تعليق حي/تقييمات —
// هذه غير متاحة في بيانات كأس الملك من API-Football).

struct KingsCupMatchCenter: View {
    let fixtureId: Int
    /// المباراة الممرَّرة من البطاقة الفاتحة — ترسم الترويسة فورًا بلا انتظار
    /// نداء التفاصيل (كان الفتح البارد يحجب الشاشة كلها عدة ثوانٍ)
    var seed: KcFixture? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var detail: KcMatchDetail?
    @State private var loading = true

    enum Tab: String, CaseIterable {
        case events = "الأحداث", lineups = "التشكيلات", stats = "الإحصائيات", ratings = "التقييمات"
    }
    @State private var tab: Tab = .events
    @State private var openPlayer: KcPlayerSelection?

    var body: some View {
        NavigationStack {
            DuoMatchLayout(
                hasDetail: detail != nil,
                isLive: detail?.fixture.status.live == true,
                standard: { standardLayout },
                header: { scale in
                    if let f = detail?.fixture { header(f, scale: scale) }
                },
                events: {
                    if let detail { KcEventsTimeline(detail: detail) }
                },
                side: {
                    if let detail {
                        preMatchCards(detail.fixture)
                        tabBar(Self.columnTabs)
                        content(detail, tab: columnTab)
                    }
                },
                bottom: {
                    if let detail {
                        tabBar(Tab.allCases)
                            .padding(.horizontal, SabqLayout.pageMargin)
                        ScrollView(showsIndicators: false) {
                            VStack(spacing: SabqLayout.space16) {
                                preMatchCards(detail.fixture)
                                content(detail, tab: tab)
                            }
                            .padding(.horizontal, SabqLayout.pageMargin)
                            .padding(.bottom, SabqLayout.space24)
                        }
                    }
                },
                titleColor: SabqTheme.textPrimary,
                dividerColor: SabqTheme.separator
            )
            .background(SabqTheme.background.ignoresSafeArea())
            .navigationTitle("مركز المباراة")
            .navigationBarTitleDisplayMode(.inline)
            .kcSheetToolbar { dismiss() }
            .task { await load() }
            .task(id: detail?.fixture.id) {
                var tick = 0
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 8_000_000_000)
                    if Task.isCancelled { return }
                    tick += 1
                    guard let f = detail?.fixture else { continue }
                    if f.status.live {
                        await load(force: true)
                    } else if !f.status.finished, tick % 2 == 0 {
                        let dt = Double(f.timestamp) - Date().timeIntervalSince1970
                        if dt <= 600 && dt >= -900 { await load(force: true) }
                    }
                }
            }
            .sheet(item: $openPlayer) { sel in
                KcPlayerSheet(playerId: sel.id).presentationDetents([.large])
            }
        }
        .sabqRTL()
    }

    /// التوقع والقنوات الناقلة قبل التبويبات حتى صافرة النهاية — في كل
    /// تخطيطات المركز (الهاتف، وعمودا Duo، ووضع الطاولة).
    @ViewBuilder
    private func preMatchCards(_ f: KcFixture) -> some View {
        if !f.status.finished {
            KcFetchedPrediction(fixture: f)
            KcTvStrip(fixtureId: f.id)
        }
    }

    /// تبويبات العمود الأيسر على Duo مفتوحًا — «الأحداث» في العمود الأيمن دائمًا.
    private static let columnTabs: [Tab] = [.lineups, .stats, .ratings]
    private var columnTab: Tab { tab == .events ? .lineups : tab }

    /// الهاتف والشاشة الخارجية كما كان دائمًا؛ على Duo مفتوحًا أو على الطاولة
    /// يرتّب `DuoMatchLayout` القطع نفسها.
    private var standardLayout: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: SabqLayout.space16) {
                if let f = detail?.fixture ?? seed {
                    header(f)
                    preMatchCards(f)
                    tabBar(Tab.allCases)
                    if let detail {
                        content(detail, tab: tab)
                    } else if loading {
                        KcLoading()
                    } else {
                        retryBlock
                    }
                } else if loading {
                    KcLoading().padding(.top, SabqLayout.space32)
                } else {
                    retryBlock.padding(.top, SabqLayout.space40)
                }
            }
            .padding(SabqLayout.pageMargin)
        }
        .refreshable { await load(force: true) }
    }

    private var retryBlock: some View {
        VStack(spacing: SabqLayout.space12) {
            Text("تعذر جلب تفاصيل المباراة")
                .sabqText(SabqType.excerpt).foregroundStyle(SabqTheme.textSecondary)
            Button {
                loading = true
                Task { await load(force: true) }
            } label: {
                Text("إعادة المحاولة")
                    .font(SabqType.button.font).foregroundStyle(KcTheme.accent)
                    .padding(.horizontal, SabqLayout.space24)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .overlay(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .stroke(SabqTheme.outline, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space16)
    }

    private func load(force: Bool = false) async {
        // محاولتان (فشل حد الدقيقة العابر يُعاد تلقائيًا) قبل إظهار زر الإعادة
        let r = await kcRetrying { try await APIClient.shared.fetchKingsCupMatch(fixtureId: fixtureId, ignoreCache: force) }
        await MainActor.run {
            if let r { detail = r }
            loading = false
        }
    }

    // MARK: ترويسة

    private func header(_ f: KcFixture, scale: CGFloat = 1) -> some View {
        VStack(spacing: SabqLayout.space8) {
            HStack(alignment: .top) {
                teamHead(f.home, scale: scale)
                VStack(spacing: SabqLayout.space4) {
                    if f.started {
                        Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                            .font(.custom(SabqFonts.bold, size: 26 * scale, relativeTo: .title))
                            .foregroundStyle(SabqTheme.textPrimary)
                            .monospacedDigit()
                            .environment(\.layoutDirection, .leftToRight)
                    } else {
                        Text(KcFormat.time(f))
                            .font(.custom(SabqFonts.bold, size: 22 * scale, relativeTo: .title2))
                            .foregroundStyle(SabqTheme.textPrimary)
                    }
                    KcStatusPill(fixture: f)
                }
                .frame(minWidth: 90 * scale)
                teamHead(f.away, scale: scale)
            }
            if let po = f.penaltyOutcome {
                Text("فاز \(po.winnerName) بركلات الترجيح (\(po.winnerScore)-\(po.loserScore))")
                    .sabqText(SabqType.tag).foregroundStyle(KcTheme.accent)
            }
            Text(headerLine(f))
                .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
    }

    private func headerLine(_ f: KcFixture) -> String {
        var parts = [f.round]
        let venue = [f.venue.name, f.venue.city].filter { !$0.isEmpty }.joined(separator: " — ")
        if !venue.isEmpty { parts.append(venue) }
        parts.append(KcFormat.day(f))
        return parts.joined(separator: " · ")
    }

    private func teamHead(_ team: KcTeam, scale: CGFloat = 1) -> some View {
        VStack(spacing: SabqLayout.space8) {
            KcTeamLogo(team: team, size: 48 * scale)
            Text(team.name).sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: التبويبات

    private func tabBar(_ items: [Tab]) -> some View {
        // في العمود الأيسر على Duo لا تظهر «الأحداث»؛ يُبرز أول تبويب حينها.
        let current = items.contains(tab) ? tab : (items.first ?? tab)
        return HStack(spacing: SabqLayout.space8) {
            ForEach(items, id: \.self) { t in
                KcChip(title: t.rawValue, selected: current == t, fillWidth: true) {
                    withAnimation(.easeOut(duration: 0.2)) { tab = t }
                }
            }
        }
    }

    @ViewBuilder private func content(_ d: KcMatchDetail, tab: Tab) -> some View {
        switch tab {
        case .events: KcEventsTimeline(detail: d)
        case .lineups: KcLineupsView(detail: d)
        case .stats: KcStatsView(detail: d)
        case .ratings: KcRatingsView(detail: d) { openPlayer = KcPlayerSelection(id: $0) }
        }
    }
}

/// غلاف Identifiable لفتح بطاقة لاعب كـ sheet.
nonisolated struct KcPlayerSelection: Identifiable, Hashable { let id: Int }

// MARK: - الأحداث

struct KcEventsTimeline: View {
    let detail: KcMatchDetail

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if detail.events.isEmpty {
                kcEmptyText("الأحداث تظهر هنا لحظة بلحظة مع انطلاق المباراة")
            } else {
                Text("مجريات المباراة").sabqText(SabqType.metaEmphasis).foregroundStyle(KcTheme.accent)
                    .accessibilityAddTraits(.isHeader)
                ForEach(Array(sorted.enumerated()), id: \.element.id) { index, ev in
                    if index > 0 { KcRowSeparator() }
                    row(ev)
                }
            }
        }
    }

    private var sorted: [KcMatchEvent] {
        detail.events.sorted { ($0.minute ?? 0, $0.extra ?? 0) > ($1.minute ?? 0, $1.extra ?? 0) }
    }

    private func row(_ ev: KcMatchEvent) -> some View {
        let isHome = ev.teamId == detail.fixture.home.id
        let team = isHome ? detail.fixture.home : detail.fixture.away
        return HStack(spacing: SabqLayout.space8) {
            Circle().fill(isHome ? KcTheme.accentFill : KcTheme.gold).frame(width: 8, height: 8)
                .accessibilityHidden(true)
            Text(ev.minuteLabel)
                .font(SabqType.metaEmphasis.font.monospacedDigit())
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(minWidth: 40)
                .environment(\.layoutDirection, .leftToRight)
            icon(ev.type)
            VStack(alignment: .leading, spacing: 0) {
                Text(ev.player.isEmpty ? ev.label : "\(ev.player) (\(ev.label))")
                    .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                if let assist = ev.assist, !assist.isEmpty {
                    Text(ev.type == "substitution" ? "بديلًا عن: \(assist)" : "صناعة: \(assist)")
                        .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                }
            }
            Spacer()
            WCRemoteImage(url: team.logo).frame(width: 20, height: 20)
        }
        .padding(.vertical, SabqLayout.space12)
    }

    @ViewBuilder private func icon(_ type: String) -> some View {
        switch type {
        case "goal": Image(systemName: "soccerball").foregroundStyle(KcTheme.accent)
        case "missed-penalty": Image(systemName: "xmark.circle.fill").foregroundStyle(KcTheme.liveText)
        case "yellow-card": RoundedRectangle(cornerRadius: 2).fill(KcTheme.gold).frame(width: 11, height: 15)
        case "red-card": RoundedRectangle(cornerRadius: 2).fill(KcTheme.liveFill).frame(width: 11, height: 15)
        case "substitution": Image(systemName: "arrow.left.arrow.right").foregroundStyle(SabqTheme.textSecondary)
        case "var": Image(systemName: "tv").foregroundStyle(SabqTheme.textSecondary)
        default: Image(systemName: "circle.fill").foregroundStyle(SabqTheme.textTertiary)
        }
    }
}

// MARK: - التشكيلات (ملعب 2D)

struct KcLineupsView: View {
    let detail: KcMatchDetail

    var body: some View {
        if detail.lineups.isEmpty {
            kcEmptyText("التشكيلات تُعلن قبل انطلاق المباراة بنحو 20–40 دقيقة")
        } else {
            VStack(spacing: SabqLayout.space32) {
                ForEach(detail.lineups) { lineup in KcPitch(lineup: lineup) }
            }
        }
    }
}

struct KcPitch: View {
    let lineup: KcLineup

    private var rows: [[KcLineupPlayer]] {
        var byRow: [Int: [(col: Int, p: KcLineupPlayer)]] = [:]
        for p in lineup.startXI {
            let parts = (p.grid ?? "0:0").split(separator: ":").map { Int($0) ?? 0 }
            let r = parts.first ?? 0, c = parts.count > 1 ? parts[1] : 0
            byRow[r, default: []].append((c, p))
        }
        return byRow.keys.filter { $0 > 0 }.sorted().map { r in
            byRow[r]!.sorted { $0.col < $1.col }.map { $0.p }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack {
                Text(lineup.team.name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                Spacer()
                if let f = lineup.formation {
                    Text(f).font(SabqType.tag.font.monospacedDigit())
                        .foregroundStyle(SabqTheme.textSecondary)
                        .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                        .background(Capsule().fill(SabqTheme.surfaceMuted))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            pitch
            if let coach = lineup.coach, !coach.isEmpty {
                Text("المدرب: \(coach)").sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
            }
            if !lineup.substitutes.isEmpty { bench }
        }
    }

    private var bench: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space4) {
                Image(systemName: "figure.seated.side").foregroundStyle(KcTheme.accent).accessibilityHidden(true)
                Text("دكة البدلاء").foregroundStyle(SabqTheme.textPrimary)
                Text("(\(lineup.substitutes.count))").foregroundStyle(SabqTheme.textSecondary)
            }
            .sabqText(SabqType.metaEmphasis)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: SabqLayout.space8)], alignment: .leading, spacing: SabqLayout.space8) {
                ForEach(lineup.substitutes) { p in benchRow(p) }
            }
        }
        .padding(.top, SabqLayout.space4)
    }

    private func benchRow(_ p: KcLineupPlayer) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Text(p.number.map { "\($0)" } ?? "•")
                .font(SabqType.tag.font.monospacedDigit()).foregroundStyle(KcTheme.accent)
                .frame(width: 24, height: 24)
                .background(Circle().fill(SabqTheme.surface))
                .environment(\.layoutDirection, .leftToRight)
            Text(p.name).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space8)
        .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
    }

    private var pitch: some View {
        GeometryReader { geo in
            let r = rows
            ZStack {
                KcTheme.pitch
                RoundedRectangle(cornerRadius: SabqRadius.small).stroke(.white.opacity(0.25), lineWidth: 1).padding(8)
                Rectangle().fill(.white.opacity(0.2)).frame(height: 1)
                Circle().stroke(.white.opacity(0.25), lineWidth: 1).frame(width: 64, height: 64)

                if r.isEmpty {
                    Text("التشكيلة غير متاحة بعد").sabqText(SabqType.meta).foregroundStyle(.white)
                } else {
                    ForEach(Array(r.enumerated()), id: \.offset) { ri, players in
                        let y = geo.size.height * (1 - (CGFloat(ri) + 0.6) / (CGFloat(r.count) + 0.4))
                        HStack(spacing: 0) {
                            ForEach(players) { p in playerDot(p).frame(maxWidth: .infinity) }
                        }
                        .environment(\.layoutDirection, .leftToRight)
                        .position(x: geo.size.width / 2, y: y)
                        .frame(width: geo.size.width)
                    }
                }
            }
        }
        .aspectRatio(3.0 / 4.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private func playerDot(_ p: KcLineupPlayer) -> some View {
        VStack(spacing: 2) {
            Text(p.number.map { "\($0)" } ?? "•")
                .font(SabqType.tag.font.monospacedDigit()).foregroundStyle(KcTheme.pitch)
                .frame(width: 28, height: 28).background(Circle().fill(.white))
            Text(p.name).font(.custom(SabqFonts.regular, size: 12, relativeTo: .caption)).foregroundStyle(.white)
                .lineLimit(1).minimumScaleFactor(0.75).frame(maxWidth: 64)
        }
    }
}

// MARK: - الإحصائيات

struct KcStatsView: View {
    let detail: KcMatchDetail

    var body: some View {
        if let stats = detail.statistics, !stats.rows.isEmpty {
            VStack(spacing: SabqLayout.space16) {
                ForEach(stats.rows) { statRow($0) }
            }
        } else {
            kcEmptyText("الإحصائيات تظهر هنا أثناء المباراة")
        }
    }

    private func statRow(_ s: KcStatRow) -> some View {
        let h = Double(s.homeText.replacingOccurrences(of: "%", with: "")) ?? 0
        let a = Double(s.awayText.replacingOccurrences(of: "%", with: "")) ?? 0
        let total = (h + a) == 0 ? 1 : (h + a)
        return VStack(spacing: SabqLayout.space4) {
            HStack {
                Text(s.homeText).sabqText(SabqType.rowTitle).monospacedDigit().frame(width: 52, alignment: .leading)
                Spacer()
                Text(s.label).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                Spacer()
                Text(s.awayText).sabqText(SabqType.rowTitle).monospacedDigit().frame(width: 52, alignment: .trailing)
            }
            .foregroundStyle(SabqTheme.textPrimary)
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule().fill(KcTheme.accentFill)
                        .frame(width: geo.size.width / 2 * CGFloat(h / total))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    Capsule().fill(KcTheme.gold)
                        .frame(width: geo.size.width / 2 * CGFloat(a / total))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .environment(\.layoutDirection, .leftToRight)
            }
            .frame(height: 6)
        }
    }
}

// MARK: - التقييمات (رجل المباراة + تقييمات اللاعبين)
//
// مرآة WCRatingsView — المصدر /kings-cup/match/:id/player-stats (تقييمات
// API-Football). جلب ذاتي مع تحديث دوري أثناء البث، وكل صف يفتح بطاقة اللاعب.

struct KcRatingsView: View {
    let detail: KcMatchDetail
    let onOpenPlayer: (Int) -> Void

    @State private var ratings: KcMatchRatings?
    @State private var loaded = false

    private var players: [KcMatchRating] {
        (ratings?.players ?? [])
            .filter { $0.rating != nil }
            .sorted { ($0.rating ?? 0) > ($1.rating ?? 0) }
    }

    var body: some View {
        Group {
            if !loaded {
                KcLoading()
            } else if players.isEmpty {
                kcEmptyText("تقييمات اللاعبين تظهر هنا بعد انطلاق المباراة")
            } else {
                VStack(spacing: 0) {
                    if let motm = ratings?.motm {
                        Button { onOpenPlayer(motm.id) } label: {
                            HStack(spacing: SabqLayout.space12) {
                                Image(systemName: "crown.fill").foregroundStyle(KcTheme.gold).accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 0) {
                                    Text("رجل المباراة").sabqText(SabqType.tag).foregroundStyle(KcTheme.accent)
                                    Text(motm.name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                                }
                                Spacer()
                                ratingBadge(motm.rating)
                            }
                            .padding(.horizontal, SabqLayout.space16).padding(.vertical, SabqLayout.space12)
                            .sabqBlockSurface()
                        }
                        .buttonStyle(.plain)
                        .padding(.bottom, SabqLayout.space8)
                    }
                    ForEach(Array(players.enumerated()), id: \.element.id) { index, p in
                        if index > 0 { KcRowSeparator() }
                        Button { onOpenPlayer(p.id) } label: { playerRow(p) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
        .task(id: detail.fixture.id) {
            await load()
            while !Task.isCancelled, detail.fixture.status.live {
                try? await Task.sleep(nanoseconds: 60_000_000_000)
                if Task.isCancelled { return }
                await load(force: true)
            }
        }
    }

    private func load(force: Bool = false) async {
        let r = try? await APIClient.shared.fetchKingsCupMatchRatings(fixtureId: detail.fixture.id, ignoreCache: force)
        await MainActor.run {
            if let r { ratings = r }
            loaded = true
        }
    }

    private func playerRow(_ p: KcMatchRating) -> some View {
        let teamLogo = p.teamId == detail.fixture.home.id ? detail.fixture.home.logo : detail.fixture.away.logo
        return HStack(spacing: SabqLayout.space12) {
            KcAvatar(url: p.photo, size: 36)
            VStack(alignment: .leading, spacing: 0) {
                Text("\(p.name)\(p.captain ? " (ك)" : "")")
                    .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                Text(subtitle(p)).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
            }
            Spacer()
            WCRemoteImage(url: teamLogo).frame(width: 16, height: 16)
            ratingBadge(p.rating ?? 0)
        }
        .padding(.vertical, SabqLayout.space12)
        .contentShape(Rectangle())
    }

    private func subtitle(_ p: KcMatchRating) -> String {
        var parts = [p.pos]
        if p.minutes > 0 { parts.append("\(p.minutes) د") }
        if p.goals > 0 { parts.append("\(p.goals) ⚽") }
        if p.assists > 0 { parts.append("\(p.assists) صناعة") }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func ratingBadge(_ rating: Double) -> some View {
        Text(String(format: "%.1f", rating))
            .font(SabqType.tag.font.monospacedDigit())
            .foregroundStyle(.white)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: SabqRadius.small).fill(KcTheme.ratingFill(rating)))
            .environment(\.layoutDirection, .leftToRight)
    }
}

// MARK: - قنوات البث

struct KcTvStrip: View {
    let fixtureId: Int
    @State private var channels: [KcTvChannel] = []
    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(width: 0, height: 0)
            if !channels.isEmpty {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    HStack(spacing: SabqLayout.space4) {
                        Image(systemName: "tv.fill").foregroundStyle(KcTheme.accent).accessibilityHidden(true)
                        Text("القنوات الناقلة").foregroundStyle(SabqTheme.textPrimary)
                    }
                    .sabqText(SabqType.metaEmphasis)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: SabqLayout.space8) {
                            ForEach(channels) { ch in chip(ch) }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .task(id: fixtureId) {
            if let r = try? await APIClient.shared.fetchKingsCupTv(fixtureId: fixtureId), r.available {
                await MainActor.run { channels = r.channels }
            }
        }
    }

    @ViewBuilder private func chip(_ ch: KcTvChannel) -> some View {
        let content = HStack(spacing: SabqLayout.space8) {
            if let logo = ch.logo, !logo.isEmpty {
                WCRemoteImage(url: logo).frame(width: 20, height: 20)
            } else {
                Image(systemName: "play.tv").foregroundStyle(SabqTheme.textSecondary)
            }
            Text(ch.name).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
            if let c = ch.country, !c.isEmpty {
                Text(c).sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
            }
        }
        .padding(.horizontal, SabqLayout.space12)
        .frame(minHeight: 36)
        .background(Capsule().fill(SabqTheme.surfaceMuted))

        if let urlString = ch.url, let url = URL(string: urlString) {
            Button { openURL(url) } label: { content }.buttonStyle(.plain)
        } else {
            content
        }
    }
}

// MARK: - صفحة النادي (sheet)

struct KcTeamSheet: View {
    let teamId: Int
    let teamName: String
    @Environment(\.dismiss) private var dismiss

    @State private var profile: KcTeamProfile?
    @State private var loading = true
    /// الإثراء الثقيل (?with=stats): إحصائيات الدوري والكأس + مسيرة المدرب +
    /// الهدّافون + الانتقالات — غير حاجب: الأساس يرسم فورًا وبطاقاته تظهر تباعًا
    @State private var extras: KcTeamExtras?
    /// مباريات النادي في الكأس (الموسم الجاري + مشوار النسخة السابقة)
    @State private var teamMatches: KcTeamMatches?
    /// سجلّ الأبطال — منه ألقاب النادي وخزينتها
    @State private var record: KcRecord?
    @State private var openPlayer: KcPlayerSelection?

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: SabqLayout.space32) {
                    if loading {
                        KcLoading().padding(.top, SabqLayout.space32)
                    } else if let p = profile {
                        teamHeader(p)
                        if let coach = extras?.coach ?? p.coach { KcCoachCard(coach: coach) }
                        if let cup = extras?.kcStats {
                            KcTeamStatsCard(title: "مشوار النادي في كأس الملك",
                                            subtitle: "نسخة \(KcFormat.seasonLabel(cup.season))",
                                            stats: cup.stats)
                        }
                        if let league = extras?.stats {
                            KcTeamStatsCard(title: "نبض الأرقام",
                                            subtitle: p.competitionName ?? "بطولة النادي",
                                            stats: league)
                        }
                        if let m = teamMatches, !m.fixtures.isEmpty || m.previous != nil {
                            KcTeamMatchesBlock(matches: m)
                        } else if !p.fixtures.isEmpty {
                            fixturesBlock(p.fixtures)
                        }
                        if let scorers = extras?.topScorers ?? (p.topScorers.isEmpty ? nil : p.topScorers), !scorers.isEmpty {
                            scorersBlock(scorers)
                        }
                        if let transfers = extras?.transfers,
                           !transfers.arrivals.isEmpty || !transfers.departures.isEmpty {
                            KcTransfersBlock(transfers: transfers)
                        }
                        if let record {
                            KcTeamTitlesBlock(teamId: teamId, record: record)
                        }
                        if !p.squad.isEmpty { squadBlock(p.squad) }
                    } else {
                        Text("تعذر جلب صفحة النادي")
                            .sabqText(SabqType.excerpt).foregroundStyle(SabqTheme.textSecondary)
                            .frame(maxWidth: .infinity)
                            .padding(.top, SabqLayout.space40)
                    }
                }
                .padding(SabqLayout.pageMargin)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(SabqTheme.background.ignoresSafeArea())
            .navigationTitle(teamName)
            .navigationBarTitleDisplayMode(.inline)
            .kcSheetToolbar { dismiss() }
            .task {
                // الأساس أولًا (يرسم الصفحة فورًا)، والإثراء والمباريات والسجل
                // بالتوازي بلا حجب — نمط صفحة نادي الويب نفسه
                async let base = APIClient.shared.fetchKingsCupTeamProfile(teamId: teamId)
                async let x = APIClient.shared.fetchKingsCupTeamExtras(teamId: teamId)
                async let m = APIClient.shared.fetchKingsCupTeamMatches(teamId: teamId)
                async let rec = APIClient.shared.fetchKingsCupRecord()
                var baseResult = try? await base
                if baseResult == nil {
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                    baseResult = try? await APIClient.shared.fetchKingsCupTeamProfile(teamId: teamId)
                }
                await MainActor.run { profile = baseResult; loading = false }
                let extrasResult = try? await x
                let matchesResult = try? await m
                let recordResult = try? await rec
                await MainActor.run {
                    extras = extrasResult
                    teamMatches = matchesResult
                    record = recordResult
                }
            }
            .sheet(item: $openPlayer) { sel in
                KcPlayerSheet(playerId: sel.id).presentationDetents([.large])
            }
        }
        .sabqRTL()
    }

    private func teamHeader(_ p: KcTeamProfile) -> some View {
        HStack(spacing: SabqLayout.space16) {
            WCRemoteImage(url: p.team.logo)
                .padding(SabqLayout.space8).frame(width: 72, height: 72)
                .background(Circle().fill(.white))
                .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(p.team.name).sabqText(SabqType.leadTitle).foregroundStyle(SabqTheme.textPrimary)
                if let founded = p.team.founded {
                    Text("تأسّس \(String(founded))").sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                        .environment(\.layoutDirection, .leftToRight)
                }
                if let v = p.team.venue, !v.name.isEmpty {
                    Label("\(v.name)\(v.city.isEmpty ? "" : " — \(v.city)")", systemImage: "sportscourt")
                        .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                        .labelStyle(.titleAndIcon).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func fixturesBlock(_ fixtures: [KcFixture]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            kcBlockHeading("مباريات النادي")
            ForEach(Array(fixtures.enumerated()), id: \.element.id) { index, f in
                if index > 0 { KcRowSeparator() }
                KcTeamFixtureRow(fixture: f)
            }
        }
    }

    private func scorersBlock(_ scorers: [KcTeamTopScorer]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            kcBlockHeading("هدّافو النادي")
            ForEach(Array(scorers.enumerated()), id: \.element.id) { index, s in
                if index > 0 { KcRowSeparator() }
                Button { if s.id > 0 { openPlayer = KcPlayerSelection(id: s.id) } } label: {
                    HStack(spacing: SabqLayout.space12) {
                        KcAvatar(url: s.photo, size: 36)
                        Text(s.name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                        Spacer()
                        Text("\(s.goals)").sabqText(SabqType.sectionHeading).foregroundStyle(KcTheme.accent).monospacedDigit()
                        Text("هدف").sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                    }
                    .padding(.vertical, SabqLayout.space12)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func squadBlock(_ squad: [KcSquadPlayer]) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            kcBlockHeading("التشكيلة")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: SabqLayout.space8)], alignment: .leading, spacing: SabqLayout.space8) {
                ForEach(squad) { p in
                    Button { if p.id > 0 { openPlayer = KcPlayerSelection(id: p.id) } } label: {
                        HStack(spacing: SabqLayout.space8) {
                            Text(p.number.map { "\($0)" } ?? "•")
                                .font(SabqType.tag.font.monospacedDigit()).foregroundStyle(KcTheme.accent)
                                .frame(width: 24, height: 24).background(Circle().fill(SabqTheme.surface))
                                .environment(\.layoutDirection, .leftToRight)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(p.name).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                                Text(p.position).sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space8)
                        .frame(minHeight: SabqLayout.touchTarget)
                        .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

// MARK: - عناصر الأوراق المشتركة

/// عنوان كتلة داخل ورقة (نادٍ/لاعب): 20 عريض على الصفحة.
func kcBlockHeading(_ title: String) -> some View {
    Text(title)
        .sabqText(SabqType.sectionHeading)
        .foregroundStyle(SabqTheme.textPrimary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, SabqLayout.space4)
        .accessibilityAddTraits(.isHeader)
}

extension View {
    /// شريط تنقّل أوراق كأس الملك: سطح الصفحة وزر إغلاق بأيقونة مجرّدة.
    func kcSheetToolbar(onClose: @escaping () -> Void) -> some View {
        self
            .toolbarBackground(SabqTheme.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(SabqType.rowTitle.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .frame(minWidth: SabqLayout.touchTarget, minHeight: SabqLayout.touchTarget)
                    }
                    .accessibilityLabel("إغلاق")
                }
            }
    }
}
