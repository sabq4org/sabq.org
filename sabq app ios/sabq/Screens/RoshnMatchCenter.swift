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
    @State private var tab: Tab = .events

    enum Tab: String, CaseIterable {
        case events = "الأحداث"
        case stats = "الإحصائيات"
        case lineups = "التشكيلات"
        case ratings = "التقييمات"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    if let d = detail {
                        header(d)
                        tabBar
                        content(d)
                    } else {
                        loadingBlock
                    }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 24)
            }
            .background(Color.white)
            .environment(\.layoutDirection, .rightToLeft)
            .navigationTitle("مركز المباراة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(RoshnTheme.inkSoft.opacity(0.5))
                    }
                }
            }
        }
        .task {
            detail = try? await APIClient.shared.fetchRoshnMatch(fixtureId: fixtureId)
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

    // MARK: الترويسة

    private func header(_ d: RsMatchDetail) -> some View {
        VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                teamColumn(d.fixture.home)
                VStack(spacing: 5) {
                    if d.fixture.started {
                        Text("\(d.fixture.goals.away ?? 0) - \(d.fixture.goals.home ?? 0)")
                            .font(SabqFonts.app(size: 30, weight: .bold))
                            .foregroundStyle(RoshnTheme.ink)
                            .monospacedDigit()
                            .environment(\.layoutDirection, .leftToRight)
                    } else {
                        Text(RsFormat.time(d.fixture))
                            .font(SabqFonts.app(size: 22, weight: .bold))
                            .foregroundStyle(RoshnTheme.sky)
                    }
                    statusChip(d.fixture)
                }
                .frame(minWidth: 96)
                teamColumn(d.fixture.away)
            }

            VStack(spacing: 3) {
                Text("\(RsFormat.day(d.fixture)) · \(RsFormat.time(d.fixture))")
                    .font(SabqFonts.app(size: 10.5))
                    .foregroundStyle(RoshnTheme.inkSoft)
                if !d.fixture.round.isEmpty || !d.fixture.venue.name.isEmpty {
                    Text([d.fixture.round, d.fixture.venue.name].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(SabqFonts.app(size: 10.5))
                        .foregroundStyle(RoshnTheme.inkSoft)
                        .lineLimit(1).minimumScaleFactor(0.75)
                }
            }
        }
        .padding(.vertical, 16).padding(.horizontal, 12)
        .frame(maxWidth: .infinity)
        .background(RoshnTheme.stripGradient)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(RoshnTheme.line, lineWidth: 1)
        )
        .overlay(alignment: .top) {
            // خط الهوية السماوي أعلى البطاقة — لمسة روشن المميزة.
            RoundedRectangle(cornerRadius: 2)
                .fill(LinearGradient(colors: [RoshnTheme.sky, RoshnTheme.pitch],
                                     startPoint: .trailing, endPoint: .leading))
                .frame(height: 3)
                .padding(.horizontal, 40)
        }
    }

    private func teamColumn(_ team: RsTeam) -> some View {
        VStack(spacing: 7) {
            WCRemoteImage(url: team.logo)
                .padding(5).frame(width: 58, height: 58)
                .background(Circle().fill(.white))
                .overlay(Circle().stroke(RoshnTheme.line, lineWidth: 1))
                .shadow(color: RoshnTheme.ink.opacity(0.06), radius: 5, y: 2)
            Text(team.name)
                .font(SabqFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(RoshnTheme.ink)
                .lineLimit(2).minimumScaleFactor(0.7)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private func statusChip(_ f: RsFixture) -> some View {
        Group {
            if f.status.live {
                HStack(spacing: 5) {
                    Circle().fill(.white).frame(width: 5, height: 5)
                    Text(liveLabel(f)).monospacedDigit()
                }
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 11).padding(.vertical, 5)
                .background(Capsule().fill(RoshnTheme.liveRed))
            } else {
                Text(f.status.label.isEmpty ? "قادمة" : f.status.label)
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(RoshnTheme.inkSoft)
                    .padding(.horizontal, 11).padding(.vertical, 5)
                    .background(Capsule().fill(RoshnTheme.skySoft))
            }
        }
    }

    private func liveLabel(_ f: RsFixture) -> String {
        guard let elapsed = f.status.elapsed, elapsed > 0 else { return f.status.label }
        let extra = (f.status.extra ?? 0) > 0 ? "+\(f.status.extra!)" : ""
        return "\(elapsed)\(extra)'"
    }

    // MARK: التبويبات

    private var tabBar: some View {
        HStack(spacing: 6) {
            ForEach(Tab.allCases, id: \.self) { item in
                Button {
                    tab = item
                    if item == .ratings, !ratingsRequested {
                        ratingsRequested = true
                        Task { ratings = try? await APIClient.shared.fetchRoshnMatchRatings(fixtureId: fixtureId) }
                    }
                } label: {
                    Text(item.rawValue)
                        .font(SabqFonts.app(size: 12.5, weight: tab == item ? .semibold : .regular))
                        .foregroundStyle(tab == item ? .white : RoshnTheme.inkSoft)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 11, style: .continuous)
                                .fill(tab == item ? RoshnTheme.sky : RoshnTheme.skySoft.opacity(0.6))
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func content(_ d: RsMatchDetail) -> some View {
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
            LazyVStack(spacing: 6) {
                ForEach(sortedEvents(d), id: \.self) { ev in
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
        return HStack(spacing: 10) {
            Text(ev.minuteLabel)
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(RoshnTheme.inkSoft)
                .monospacedDigit()
                .frame(width: 42)
                .environment(\.layoutDirection, .leftToRight)

            eventIcon(ev.type)

            VStack(alignment: .leading, spacing: 2) {
                Text(ev.player)
                    .font(SabqFonts.app(size: 13, weight: isGoal ? .bold : .semibold))
                    .foregroundStyle(RoshnTheme.ink)
                    .lineLimit(1).minimumScaleFactor(0.75)
                HStack(spacing: 4) {
                    Text(ev.label)
                        .font(SabqFonts.app(size: 10))
                        .foregroundStyle(RoshnTheme.inkSoft)
                    if let assist = ev.assist, !assist.isEmpty {
                        Text("· بمساعدة \(assist)")
                            .font(SabqFonts.app(size: 10))
                            .foregroundStyle(RoshnTheme.inkSoft)
                            .lineLimit(1)
                    }
                }
            }

            Spacer()

            Text(isHome ? d.fixture.home.name : d.fixture.away.name)
                .font(SabqFonts.app(size: 10))
                .foregroundStyle(RoshnTheme.inkSoft)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(maxWidth: 76, alignment: .trailing)
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .fill(isGoal ? RoshnTheme.pitchSoft : .white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(isGoal ? RoshnTheme.pitch.opacity(0.3) : RoshnTheme.line, lineWidth: 1)
        )
    }

    private func eventIcon(_ type: String) -> some View {
        Group {
            switch type {
            case "goal":
                Image(systemName: "soccerball.inverse").foregroundStyle(RoshnTheme.pitch)
            case "yellow-card":
                RoundedRectangle(cornerRadius: 2).fill(.yellow).frame(width: 10, height: 14)
            case "red-card":
                RoundedRectangle(cornerRadius: 2).fill(RoshnTheme.liveRed).frame(width: 10, height: 14)
            case "substitution":
                Image(systemName: "arrow.left.arrow.right").foregroundStyle(RoshnTheme.sky)
            default:
                Image(systemName: type.lowercased().contains("var") ? "tv" : "circle.fill")
                    .foregroundStyle(RoshnTheme.inkSoft)
            }
        }
        .font(SabqFonts.app(size: 14, weight: .medium))
        .frame(width: 20)
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
            VStack(spacing: 12) {
                ForEach(rows) { row in
                    statBar(row)
                }
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
        }
    }

    private func statBar(_ row: RsStatRow) -> some View {
        let h = numeric(row.homeText)
        let a = numeric(row.awayText)
        let total = max(h + a, 0.001)
        return VStack(spacing: 5) {
            HStack {
                Text(row.homeText).font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(RoshnTheme.ink).monospacedDigit()
                Spacer()
                Text(row.label).font(SabqFonts.app(size: 11)).foregroundStyle(RoshnTheme.inkSoft)
                Spacer()
                Text(row.awayText).font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(RoshnTheme.ink).monospacedDigit()
            }
            // بلا قلب اتجاه: صفّ القيم أعلاه RTL (المضيف يمينًا) والشريط يتبعه —
            // فرضُ LTR كان يعكس عمودَي المضيف والضيف تحت رقميهما (قاعدة المالك).
            GeometryReader { geo in
                HStack(spacing: 2) {
                    RoundedRectangle(cornerRadius: 2).fill(RoshnTheme.sky)
                        .frame(width: max(geo.size.width * h / total - 1, 2))
                    RoundedRectangle(cornerRadius: 2).fill(RoshnTheme.gold.opacity(0.75))
                }
            }
            .frame(height: 5)
        }
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
            VStack(spacing: 12) {
                ForEach(d.lineups) { lineup in
                    lineupCard(lineup)
                }
            }
        }
    }

    private func lineupCard(_ lineup: RsLineup) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                WCRemoteImage(url: lineup.team.logo)
                    .padding(2).frame(width: 28, height: 28)
                    .background(Circle().fill(.white))
                    .overlay(Circle().stroke(RoshnTheme.line, lineWidth: 1))
                Text(lineup.team.name)
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(RoshnTheme.ink)
                Spacer()
                if let formation = lineup.formation {
                    Text(formation)
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(RoshnTheme.sky)
                        .monospacedDigit()
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Capsule().fill(RoshnTheme.skySoft))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }

            if let coach = lineup.coach, !coach.isEmpty {
                Text("المدرب: \(coach)")
                    .font(SabqFonts.app(size: 11))
                    .foregroundStyle(RoshnTheme.inkSoft)
            }

            playerGroup(title: "التشكيلة الأساسية", players: lineup.startXI, accent: RoshnTheme.pitch)
            if !lineup.substitutes.isEmpty {
                playerGroup(title: "البدلاء", players: lineup.substitutes, accent: RoshnTheme.inkSoft)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
    }

    private func playerGroup(title: String, players: [RsLineupPlayer], accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(accent)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 6)], alignment: .leading, spacing: 6) {
                ForEach(players) { p in
                    HStack(spacing: 6) {
                        Text(p.number.map(String.init) ?? "–")
                            .font(SabqFonts.app(size: 10, weight: .semibold))
                            .foregroundStyle(RoshnTheme.sky)
                            .monospacedDigit()
                            .frame(width: 22, height: 22)
                            .background(Circle().fill(RoshnTheme.skySoft))
                        Text(p.name)
                            .font(SabqFonts.app(size: 11.5))
                            .foregroundStyle(RoshnTheme.ink)
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
                VStack(spacing: 8) {
                    if let motm = r.motm {
                        HStack(spacing: 10) {
                            Image(systemName: "crown.fill")
                                .font(SabqFonts.app(size: 16, weight: .medium))
                                .foregroundStyle(RoshnTheme.gold)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("رجل المباراة")
                                    .font(SabqFonts.app(size: 10, weight: .semibold))
                                    .foregroundStyle(RoshnTheme.gold)
                                Text(motm.name)
                                    .font(SabqFonts.app(size: 14, weight: .bold))
                                    .foregroundStyle(RoshnTheme.ink)
                            }
                            Spacer()
                            ratingBadge(motm.rating)
                        }
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(RoshnTheme.goldSoft))
                    }

                    LazyVStack(spacing: 6) {
                        ForEach(r.players) { p in
                            HStack(spacing: 10) {
                                WCRemoteImage(url: p.photo)
                                    .frame(width: 32, height: 32)
                                    .background(Circle().fill(RoshnTheme.skySoft))
                                    .clipShape(Circle())
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 4) {
                                        Text(p.name)
                                            .font(SabqFonts.app(size: 12.5, weight: .semibold))
                                            .foregroundStyle(RoshnTheme.ink)
                                            .lineLimit(1).minimumScaleFactor(0.75)
                                        if p.captain {
                                            Text("(ق)")
                                                .font(SabqFonts.app(size: 9, weight: .semibold))
                                                .foregroundStyle(RoshnTheme.gold)
                                        }
                                    }
                                    Text(meta(p))
                                        .font(SabqFonts.app(size: 9.5))
                                        .foregroundStyle(RoshnTheme.inkSoft)
                                        .lineLimit(1)
                                }
                                Spacer()
                                if let rating = p.rating {
                                    ratingBadge(rating)
                                }
                            }
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(.white))
                            .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(RoshnTheme.line, lineWidth: 1))
                        }
                    }
                }
            }
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

    private func ratingBadge(_ rating: Double) -> some View {
        Text(String(format: "%.1f", rating))
            .font(SabqFonts.app(size: 12, weight: .bold))
            .foregroundStyle(.white)
            .monospacedDigit()
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(rating >= 7.5 ? RoshnTheme.pitch : rating >= 6.5 ? RoshnTheme.sky : rating >= 6 ? RoshnTheme.gold : RoshnTheme.liveRed)
            )
            .environment(\.layoutDirection, .leftToRight)
    }

    // MARK: مساعدات

    private var loadingBlock: some View {
        VStack(spacing: 10) {
            ForEach(0..<4, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(RoshnTheme.skySoft.opacity(0.5))
                    .frame(height: 72)
            }
        }
        .padding(.top, 8)
    }

    private func emptyState(icon: String, text: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 26, weight: .light))
                .foregroundStyle(RoshnTheme.sky.opacity(0.6))
            Text(text)
                .font(SabqFonts.app(size: 12.5))
                .foregroundStyle(RoshnTheme.inkSoft)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}
