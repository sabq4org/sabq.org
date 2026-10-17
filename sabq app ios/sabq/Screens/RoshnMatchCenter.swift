import SwiftUI

// MARK: - مركز مباراة دوري روشن
//
// ورقة تفاصيل المباراة: ترويسة النتيجة بتحديث لحظي (8 ثوانٍ للحية — وتيرة
// المونديال)، وتبويبات الأحداث/الإحصائيات/التشكيلات/التقييمات. البيانات من
// /api/sports/match/:id (نداء واحد يجمع المباراة والأحداث والأرقام
// والتشكيلات) + /players للتقييمات عند فتح تبويبها. تصميم فاتح بهوية روشن.

struct RoshnMatchCenter: View {
    let fixtureId: Int

    @Environment(\.dismiss) private var dismiss
    @State private var detail: RsMatchDetail?
    @State private var ratings: RsMatchRatings?
    @State private var ratingsRequested = false
    @State private var ratingsError: String?
    @State private var tab: Tab = .events
    @State private var loadError: String?
    @State private var retryToken = 0
    @State private var selectedTeam: RsTeam?

    enum Tab: String, CaseIterable {
        case events = "الأحداث"
        case stats = "الإحصائيات"
        case lineups = "التشكيلات"
        case ratings = "التقييمات"
    }

    var body: some View {
        NavigationStack {
            DuoMatchLayout(
                hasDetail: detail != nil,
                isLive: detail?.fixture.status.live == true,
                standard: { standardLayout },
                header: { scale in
                    if let d = detail { header(d, scale: scale) }
                },
                events: {
                    if let d = detail { eventsTab(d) }
                },
                side: {
                    if let d = detail {
                        tabBar(Self.columnTabs)
                        content(d, tab: columnTab)
                    }
                },
                bottom: {
                    if let d = detail {
                        tabBar(Tab.allCases)
                            .padding(.horizontal, SabqLayout.pageMargin)
                        ScrollView {
                            content(d, tab: tab)
                                .padding(.horizontal, SabqLayout.pageMargin)
                                .padding(.bottom, SabqLayout.space24)
                        }
                    }
                },
                titleColor: SabqTheme.textPrimary,
                dividerColor: SabqTheme.separator
            )
            .background(SabqTheme.background)
            .environment(\.layoutDirection, .rightToLeft)
            .environment(\.locale, RsFormat.latinLocale)
            .navigationTitle("مركز المباراة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(SabqType.rowTitle.font)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .frame(minWidth: SabqLayout.touchTarget, minHeight: SabqLayout.touchTarget)
                    }
                }
            }
            .navigationDestination(item: $selectedTeam) { team in
                RoshnTeamView(teamId: team.id, previewName: team.name, previewLogo: team.logo)
            }
        }
        .task(id: retryToken) {
            loadError = nil
            do {
                detail = try await APIClient.shared.fetchRoshnMatch(
                    fixtureId: fixtureId,
                    ignoreCache: retryToken > 0
                )
            } catch {
                loadError = (error as? APIError)?.errorDescription ?? "تعذّر الاتصال بمصدر المباراة"
                return
            }
            // نبض لحظي أثناء اللعب — 8 ثوانٍ (وتيرة مركز المونديال).
            while !Task.isCancelled {
                guard let d = detail else { return }
                if d.fixture.status.finished { return }
                let untilKickoff = TimeInterval(d.fixture.timestamp) - Date().timeIntervalSince1970
                let interval: UInt64 = d.fixture.status.live ? 8_000_000_000
                    : (untilKickoff <= 1800 && untilKickoff > -7200 ? 25_000_000_000 : 60_000_000_000)
                try? await Task.sleep(nanoseconds: interval)
                if Task.isCancelled { return }
                if let fresh = try? await APIClient.shared.fetchRoshnMatch(fixtureId: fixtureId, ignoreCache: true) {
                    detail = fresh
                }
            }
        }
    }

    // MARK: التخطيط

    /// الهاتف والشاشة الخارجية: الترويسة ثم التبويبات، كما كان دائمًا. على
    /// iPhone Duo مفتوحًا أو على الطاولة يرتّب `DuoMatchLayout` القطع نفسها.
    private var standardLayout: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                if let d = detail {
                    header(d)
                    tabBar(Tab.allCases)
                    content(d, tab: tab)
                } else if let loadError {
                    errorBlock(loadError)
                } else {
                    loadingBlock
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space8)
            .padding(.bottom, SabqLayout.space24)
        }
    }

    /// تبويبات العمود الأيسر مفتوحًا — «الأحداث» في العمود الأيمن دائمًا.
    private static let columnTabs: [Tab] = [.stats, .lineups, .ratings]

    /// التبويب نفسه يبقى عند تغيير الوضعية؛ «الأحداث» ظاهرة أصلًا يمينًا.
    private var columnTab: Tab { tab == .events ? .stats : tab }

    // MARK: الترويسة

    private func header(_ d: RsMatchDetail, scale: CGFloat = 1) -> some View {
        // شريط هوية زمردي مسطّح — بلا زخرفة ولا ظل (نموذج سبق).
        VStack(spacing: SabqLayout.space12) {
            HStack(alignment: .top, spacing: SabqLayout.space8) {
                teamColumn(d.fixture.home, scale: scale)
                VStack(spacing: SabqLayout.space8) {
                    if d.fixture.started {
                        Text("\(d.fixture.goals.away ?? 0) - \(d.fixture.goals.home ?? 0)")
                            .font(.custom(SabqFonts.bold, size: 30 * scale, relativeTo: .largeTitle))
                            .foregroundStyle(RoshnTheme.heroOn)
                            .monospacedDigit()
                            .environment(\.layoutDirection, .leftToRight)
                    } else {
                        Text(RsFormat.time(d.fixture))
                            .font(.custom(SabqFonts.bold, size: 22 * scale, relativeTo: .title2))
                            .foregroundStyle(RoshnTheme.heroOn)
                            .monospacedDigit()
                    }
                    statusChip(d.fixture)
                }
                .frame(minWidth: 96 * scale)
                teamColumn(d.fixture.away, scale: scale)
            }

            VStack(spacing: SabqLayout.space4) {
                Text("\(RsFormat.day(d.fixture)) · \(RsFormat.time(d.fixture))")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(RoshnTheme.heroOn)
                if !d.fixture.round.isEmpty || !d.fixture.venue.name.isEmpty {
                    Text([d.fixture.round, d.fixture.venue.name].filter { !$0.isEmpty }.joined(separator: " · "))
                        .sabqText(SabqType.meta)
                        .foregroundStyle(RoshnTheme.heroOn)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
            }
        }
        .padding(.vertical, SabqLayout.space16).padding(.horizontal, SabqLayout.space12)
        .frame(maxWidth: .infinity)
        .background(RoshnTheme.accentFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private func teamColumn(_ team: RsTeam, scale: CGFloat = 1) -> some View {
        Button { selectedTeam = team } label: { VStack(spacing: SabqLayout.space8) {
            RoshnTeamLogo(url: team.logo, size: 56 * scale)
            Text(team.name)
                .font(.custom(SabqFonts.semibold, size: 16 * min(scale, 1.15), relativeTo: .headline))
                .foregroundStyle(RoshnTheme.heroOn)
                .lineLimit(2).minimumScaleFactor(0.7)
                .multilineTextAlignment(.center)
        } }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
    }

    private func statusChip(_ f: RsFixture) -> some View {
        Group {
            if f.status.live {
                HStack(spacing: SabqLayout.space4) {
                    Circle().fill(.white).frame(width: 5, height: 5)
                    Text(liveLabel(f)).monospacedDigit()
                }
                .sabqText(SabqType.tag)
                .foregroundStyle(.white)
                .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space4)
                .background(Capsule().fill(RoshnTheme.liveFill))
            } else {
                Text(f.status.label.isEmpty ? "قادمة" : f.status.label)
                    .sabqText(SabqType.tag)
                    .foregroundStyle(.white)
                    .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space4)
                    .overlay(Capsule().stroke(.white.opacity(0.6), lineWidth: 1))
            }
        }
    }

    private func liveLabel(_ f: RsFixture) -> String {
        guard let elapsed = f.status.elapsed, elapsed > 0 else { return f.status.label }
        let extra = (f.status.extra ?? 0) > 0 ? "+\(f.status.extra!)" : ""
        return "\(elapsed)\(extra)'"
    }

    // MARK: التبويبات

    private func tabBar(_ items: [Tab]) -> some View {
        // في العمود الأيسر مفتوحًا لا تظهر «الأحداث»؛ يُبرز أول تبويب حينها.
        let current = items.contains(tab) ? tab : (items.first ?? tab)
        return HStack(spacing: SabqLayout.space8) {
            ForEach(items, id: \.self) { item in
                Button {
                    tab = item
                    if item == .ratings, !ratingsRequested {
                        ratingsRequested = true
                        Task { await loadRatings() }
                    }
                } label: {
                    Text(item.rawValue)
                        .sabqText(current == item ? SabqType.metaEmphasis : SabqType.meta)
                        .lineLimit(1).minimumScaleFactor(0.85)
                        .foregroundStyle(current == item ? Color.white : SabqTheme.textPrimary)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: SabqLayout.touchTarget)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                .fill(current == item ? RoshnTheme.accentFill : SabqTheme.surfaceMuted)
                        )
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(current == item ? .isSelected : [])
            }
        }
    }

    @ViewBuilder
    private func content(_ d: RsMatchDetail, tab: Tab) -> some View {
        switch tab {
        case .events: eventsTab(d)
        case .stats: statsTab(d)
        case .lineups: lineupsTab(d)
        case .ratings: ratingsTab(d)
        }
    }

    // MARK: الأحداث

    @ViewBuilder
    private func eventsTab(_ d: RsMatchDetail) -> some View {
        if d.events.isEmpty {
            emptyState(
                icon: "clock",
                text: d.fixture.started ? "لا أحداث مسجّلة لهذه المباراة" : "الأحداث تتوالى هنا لحظة بلحظة مع الانطلاقة"
            )
        } else {
            LazyVStack(spacing: 0) {
                ForEach(Array(sortedEvents(d).enumerated()), id: \.element) { index, ev in
                    if index > 0 { RoshnRowSeparator() }
                    eventRow(ev, d: d)
                }
            }
        }
    }

    private func sortedEvents(_ d: RsMatchDetail) -> [RsMatchEvent] {
        d.events.sorted { a, b in
            (a.minute ?? 0, a.extra ?? 0) > (b.minute ?? 0, b.extra ?? 0)
        }
    }

    private func eventRow(_ ev: RsMatchEvent, d: RsMatchDetail) -> some View {
        let isHome = ev.teamId == d.fixture.home.id
        let isGoal = ev.type == "goal"
        return HStack(spacing: SabqLayout.space12) {
            Text(ev.minuteLabel)
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(isGoal ? RoshnTheme.accentInk : SabqTheme.textSecondary)
                .monospacedDigit()
                .frame(width: 44)
                .environment(\.layoutDirection, .leftToRight)

            eventIcon(ev.type)

            VStack(alignment: .leading, spacing: 2) {
                Text(ev.player)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1).minimumScaleFactor(0.75)
                HStack(spacing: SabqLayout.space4) {
                    Text(ev.label)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                    if let assist = ev.assist, !assist.isEmpty {
                        Text("· بمساعدة \(assist)")
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .lineLimit(1)
                    }
                }
            }

            Spacer()

            Text(isHome ? d.fixture.home.name : d.fixture.away.name)
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: 80, alignment: .trailing)
        }
        .padding(.vertical, SabqLayout.space12)
        .accessibilityElement(children: .combine)
    }

    private func eventIcon(_ type: String) -> some View {
        Group {
            switch type {
            case "goal":
                Image(systemName: "soccerball.inverse").foregroundStyle(RoshnTheme.accentInk)
            case "yellow-card":
                RoundedRectangle(cornerRadius: 2).fill(RoshnTheme.gold).frame(width: 10, height: 14)
            case "red-card":
                RoundedRectangle(cornerRadius: 2).fill(SabqTheme.danger).frame(width: 10, height: 14)
            case "substitution":
                Image(systemName: "arrow.left.arrow.right").foregroundStyle(SabqTheme.textSecondary)
            default:
                Image(systemName: type.lowercased().contains("var") ? "tv" : "circle.fill")
                    .foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .font(SabqType.metaEmphasis.font)
        .frame(width: 20)
        .accessibilityHidden(true)
    }

    // MARK: الإحصائيات

    @ViewBuilder
    private func statsTab(_ d: RsMatchDetail) -> some View {
        let rows = d.statistics?.rows ?? []
        if rows.isEmpty {
            emptyState(
                icon: "chart.bar",
                text: d.fixture.status.live
                    ? "أرقام المباراة تتجمّع الآن — تظهر تباعًا خلال الشوط الأول"
                    : "لا تتوفّر إحصاءات لهذه المباراة بعد"
            )
        } else {
            VStack(spacing: SabqLayout.space16) {
                ForEach(rows) { row in
                    statBar(row)
                }
            }
            .padding(.vertical, SabqLayout.space8)
        }
    }

    private func statBar(_ row: RsStatRow) -> some View {
        let h = numeric(row.homeText)
        let a = numeric(row.awayText)
        let total = max(h + a, 0.001)
        return VStack(spacing: SabqLayout.space8) {
            HStack {
                Text(row.homeText).sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary).monospacedDigit()
                Spacer()
                Text(row.label).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                Spacer()
                Text(row.awayText).sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary).monospacedDigit()
            }
            // بلا قلب اتجاه: صفّ القيم أعلاه RTL (المضيف يمينًا) والشريط يتبعه —
            // فرضُ LTR كان يعكس عمودَي المضيف والضيف تحت رقميهما (قاعدة المالك).
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule().fill(RoshnTheme.accentFill)
                        .frame(width: max(geo.size.width * h / total - 1, 2))
                    Capsule().fill(SabqTheme.surfaceStrong)
                }
            }
            .frame(height: 6)
            .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
    }

    private func numeric(_ text: String) -> Double {
        Double(text.replacingOccurrences(of: "%", with: "")) ?? 0
    }

    // MARK: التشكيلات

    @ViewBuilder
    private func lineupsTab(_ d: RsMatchDetail) -> some View {
        if d.lineups.isEmpty {
            emptyState(icon: "person.3", text: "التشكيلات تُعلن قبل انطلاق المباراة بنحو ساعة عادةً")
        } else {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(d.lineups.enumerated()), id: \.element.id) { index, lineup in
                    if index > 0 { SabqSectionBand().padding(.vertical, SabqLayout.space16) }
                    lineupCard(lineup)
                }
            }
            .padding(.top, SabqLayout.space8)
        }
    }

    private func lineupCard(_ lineup: RsLineup) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                RoshnTeamLogo(url: lineup.team.logo, size: 32)
                Text(lineup.team.name)
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                Spacer()
                if let formation = lineup.formation {
                    Text(formation)
                        .sabqText(SabqType.tag)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .monospacedDigit()
                        .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }

            if let coach = lineup.coach, !coach.isEmpty {
                Text("المدرب: \(coach)")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
            }

            playerGroup(title: "التشكيلة الأساسية", players: lineup.startXI, accent: RoshnTheme.accentInk)
            if !lineup.substitutes.isEmpty {
                playerGroup(title: "البدلاء", players: lineup.substitutes, accent: SabqTheme.textSecondary)
            }
        }
    }

    private func playerGroup(title: String, players: [RsLineupPlayer], accent: Color) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text(title)
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(accent)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: SabqLayout.space8)], alignment: .leading, spacing: SabqLayout.space8) {
                ForEach(players) { p in
                    HStack(spacing: SabqLayout.space8) {
                        Text(p.number.map(String.init) ?? "–")
                            .sabqText(SabqType.tag)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .monospacedDigit()
                            .frame(width: 28, height: 28)
                            .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                        Text(p.name)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                }
            }
        }
    }

    // MARK: التقييمات

    @ViewBuilder
    private func ratingsTab(_ d: RsMatchDetail) -> some View {
        if let r = ratings {
            if r.players.isEmpty {
                emptyState(icon: "star", text: "لا تتوفّر تقييمات لهذه المباراة")
            } else {
                VStack(alignment: .leading, spacing: SabqLayout.space12) {
                    if let motm = r.motm {
                        HStack(spacing: SabqLayout.space12) {
                            Image(systemName: "crown.fill")
                                .font(SabqType.rowTitle.font)
                                .foregroundStyle(RoshnTheme.gold)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("رجل المباراة")
                                    .sabqText(SabqType.tag)
                                    .foregroundStyle(SabqTheme.textSecondary)
                                Text(motm.name)
                                    .sabqText(SabqType.rowTitle)
                                    .foregroundStyle(SabqTheme.textPrimary)
                            }
                            Spacer()
                            ratingBadge(motm.rating)
                        }
                        .padding(SabqLayout.space12)
                        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                        .accessibilityElement(children: .combine)
                    }

                    LazyVStack(spacing: 0) {
                        ForEach(Array(r.players.enumerated()), id: \.element.id) { index, p in
                            if index > 0 { RoshnRowSeparator() }
                            HStack(spacing: SabqLayout.space12) {
                                RoshnAvatar(url: p.photo, size: 36)
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: SabqLayout.space4) {
                                        Text(p.name)
                                            .sabqText(SabqType.rowTitle)
                                            .foregroundStyle(SabqTheme.textPrimary)
                                            .lineLimit(1).minimumScaleFactor(0.75)
                                        if p.captain {
                                            Text("(ق)")
                                                .sabqText(SabqType.tag)
                                                .foregroundStyle(SabqTheme.textSecondary)
                                        }
                                    }
                                    Text(meta(p))
                                        .sabqText(SabqType.meta)
                                        .foregroundStyle(SabqTheme.textSecondary)
                                        .lineLimit(1)
                                }
                                Spacer()
                                if let rating = p.rating {
                                    ratingBadge(rating)
                                }
                            }
                            .padding(.vertical, SabqLayout.space12)
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
            }
        } else if let ratingsError {
            VStack(spacing: SabqLayout.space12) {
                RoshnEmptyState(icon: "star.slash", text: ratingsError)
                Button("إعادة المحاولة") { Task { await loadRatings(force: true) } }
                    .sabqText(SabqType.button)
                    .foregroundStyle(.white)
                    .padding(.horizontal, SabqLayout.space24)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .background(RoshnTheme.accentFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            }
            .frame(maxWidth: .infinity)
        } else if ratingsRequested {
            loadingBlock
        } else {
            emptyState(icon: "star", text: "التقييمات تظهر بعد انطلاق المباراة")
        }
    }

    private func meta(_ p: RsRatedPlayer) -> String {
        var parts: [String] = [p.team]
        if !p.pos.isEmpty { parts.append(p.pos) }
        if p.minutes > 0 { parts.append("\(p.minutes)′") }
        if p.goals > 0 { parts.append("⚽ \(p.goals)") }
        if p.assists > 0 { parts.append("🅰 \(p.assists)") }
        return parts.joined(separator: " · ")
    }

    /// شارة التقييم: تعبئات مسطّحة تحت نص أبيض بتباين آمن في النمطين.
    private func ratingBadge(_ rating: Double) -> some View {
        Text(String(format: "%.1f", rating))
            .sabqText(SabqType.metaEmphasis)
            .foregroundStyle(rating >= 7.5 || rating < 6 ? Color.white : rating >= 6.5 ? SabqTheme.textPrimary : RoshnTheme.navy)
            .monospacedDigit()
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                    .fill(rating >= 7.5 ? RoshnTheme.accentFill : rating >= 6.5 ? SabqTheme.surfaceStrong : rating >= 6 ? RoshnTheme.gold : RoshnTheme.liveFill)
            )
            .environment(\.layoutDirection, .leftToRight)
    }

    // MARK: مساعدات

    private var loadingBlock: some View {
        RoshnLoadingRows(count: 4, height: 64)
            .padding(.top, SabqLayout.space8)
    }

    private func errorBlock(_ message: String) -> some View {
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 28, weight: .regular))
                .foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
            Text("تعذّر فتح مركز المباراة")
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
            Text(message)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
            RoshnPrimaryButton(title: "إعادة المحاولة", systemImage: "arrow.clockwise") {
                retryToken += 1
            }
            .frame(maxWidth: 240)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space40)
    }

    @MainActor
    private func loadRatings(force: Bool = false) async {
        ratingsError = nil
        do {
            ratings = try await APIClient.shared.fetchRoshnMatchRatings(
                fixtureId: fixtureId,
                ignoreCache: force
            )
        } catch {
            ratingsError = (error as? APIError)?.errorDescription ?? "تعذّر تحميل تقييمات اللاعبين"
        }
    }

    private func emptyState(icon: String, text: String) -> some View {
        RoshnEmptyState(icon: icon, text: text)
    }
}


/// غلاف عرض مركز المباراة كورقة — يقرأ المعرّف عبر `Binding` حي لأن iOS 26
/// قد يلتقط قيمة `@State` القديمة داخل closure الورقة عند أول فتح، فكان
/// التمرير بالقيمة الاختيارية يفتح ورقة بيضاء فارغة (العلاج الموثق في
/// docs/systems/sports-tournaments/SYSTEM.md).
struct RoshnMatchCenterSheet: View {
    @Binding var fixtureId: Int

    var body: some View {
        if fixtureId > 0 {
            RoshnMatchCenter(fixtureId: fixtureId)
        }
    }
}
