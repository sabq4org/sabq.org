import SwiftUI
import UIKit

// MARK: - مركز المباراة
//
// أحداث لحظة بلحظة، تشكيلات على ملعب 2D، إحصائيات، تقييمات اللاعبين +
// رجل المباراة، التوقعات وسجل المواجهات. يُعرض كـ sheet من أي بطاقة مباراة.

struct WorldCupMatchCenter: View {
    let fixtureId: Int
    @Environment(\.dismiss) private var dismiss

    @State private var detail: WCMatchDetail?
    @State private var loading = true
    @State private var selectedPlayer: WCPlayerSelection?
    @State private var showActivityDeniedAlert = false
    private let liveManager = LiveMatchActivityManager.shared

    enum Tab: String, CaseIterable { case events = "الأحداث", lineups = "التشكيلات", stats = "الإحصائيات", ratings = "التقييمات", prediction = "التوقعات" }
    @State private var tab: Tab = .events

    private var tabs: [Tab] {
        var t: [Tab] = [.events, .lineups, .stats]
        if let d = detail, !d.ratings.isEmpty { t.append(.ratings) }
        t.append(.prediction)
        return t
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 16) {
                    if loading {
                        WCLoading().padding(.top, 30)
                    } else if let detail {
                        header(detail.fixture)
                        if liveActivityEligible(detail.fixture) {
                            liveFollowButton(detail)
                        }
                        tabBar
                        content(detail)
                    } else {
                        Text("تعذر جلب تفاصيل المباراة")
                            .font(SabqFonts.app(size: 14)).foregroundStyle(WCTheme.onDarkDim)
                            .padding(.top, 50)
                    }
                }
                .padding(16)
            }
            .background(WCTheme.sectionBackground.ignoresSafeArea())
            .navigationTitle("مركز المباراة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(WCTheme.stadiumTop, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white) }
                }
            }
            .task { await load() }
            .refreshable { await load(force: true) }
            .sheet(item: $selectedPlayer) { sel in
                WCPlayerSheet(playerId: sel.id)
                    .presentationDetents([.large])
            }
            .alert("النشاطات المباشرة معطّلة", isPresented: $showActivityDeniedAlert) {
                Button("الإعدادات") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                Button("إلغاء", role: .cancel) {}
            } message: {
                Text("لمتابعة المباراة على شاشة القفل، فعّل «النشاطات المباشرة» لتطبيق سبق من الإعدادات.")
            }
        }
        .sabqRTL()
    }

    // MARK: زر المتابعة المباشرة (Live Activity)

    /// يظهر الزر للمباراة الجارية، أو القادمة خلال ساعة من انطلاقها.
    private func liveActivityEligible(_ f: WCFixture) -> Bool {
        if f.status.live { return true }
        if f.status.finished { return false }
        let secondsToKickoff = Double(f.timestamp) - Date().timeIntervalSince1970
        return secondsToKickoff <= 3600 && secondsToKickoff > -120
    }

    @ViewBuilder
    private func liveFollowButton(_ detail: WCMatchDetail) -> some View {
        let running = liveManager.isRunning(for: detail.fixture.id)
        let upcoming = !detail.fixture.status.live && !detail.fixture.status.finished
        let title = running
            ? "إيقاف المتابعة المباشرة"
            : (upcoming ? "ذكّرني على شاشة القفل" : "تابع على شاشة القفل")
        let icon = running
            ? "stop.circle.fill"
            : (upcoming ? "clock.badge.fill" : "bolt.horizontal.circle.fill")
        Button {
            if running {
                liveManager.stop()
            } else if !liveManager.start(for: detail) {
                showActivityDeniedAlert = true
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                Text(title)
                    .font(SabqFonts.app(size: 14, weight: .bold))
            }
            .foregroundStyle(running ? WCTheme.onDark : .white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(running ? WCTheme.chipFill : WCTheme.emeraldDeep)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(WCTheme.cardStroke, lineWidth: running ? 1 : 0)
            )
        }
        .buttonStyle(.plain)
    }

    private func load(force: Bool = false) async {
        if let r = try? await APIClient.shared.fetchWorldCupMatch(fixtureId: fixtureId, ignoreCache: force) {
            await MainActor.run { detail = r; loading = false }
        } else { await MainActor.run { loading = false } }
    }

    // MARK: ترويسة

    private func header(_ f: WCFixture) -> some View {
        VStack(spacing: 8) {
            HStack(alignment: .top) {
                teamHead(f.home)
                VStack(spacing: 4) {
                    if f.started {
                        // المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR
                        Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                            .font(SabqFonts.app(size: 30, weight: .black))
                            .foregroundStyle(WCTheme.onDark)
                            .environment(\.layoutDirection, .leftToRight)
                    } else {
                        Text(WCFormat.time(f)).font(SabqFonts.app(size: 22, weight: .black)).foregroundStyle(WCTheme.onDark)
                    }
                    WCStatusPill(fixture: f)
                }
                .frame(minWidth: 90)
                teamHead(f.away)
            }
            Text("\(f.round) · \(f.venue.name) — \(f.venue.city) · \(WCFormat.day(f))")
                .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
    }

    private func teamHead(_ team: WCTeam) -> some View {
        VStack(spacing: 6) {
            WCTeamLogo(team: team, size: 48, ring: WCTheme.cardStroke)
            Text(team.name).font(SabqFonts.app(size: 13, weight: .heavy)).foregroundStyle(WCTheme.onDark)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: التبويبات

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(tabs, id: \.self) { t in
                    Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                        Text(t.rawValue)
                            .font(SabqFonts.app(size: 13, weight: .semibold))
                            .foregroundStyle(tab == t ? .white : WCTheme.onDarkDim)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Capsule().fill(tab == t ? WCTheme.emeraldDeep : WCTheme.chipFill))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder private func content(_ d: WCMatchDetail) -> some View {
        let openPlayer: (Int?) -> Void = { selectedPlayer = WCPlayerSelection($0) }
        switch tab {
        case .events: WCEventsTimeline(detail: d, onOpenPlayer: openPlayer)
        case .lineups: WCLineupsView(detail: d, onOpenPlayer: openPlayer)
        case .stats: WCStatsView(detail: d)
        case .ratings: WCRatingsView(detail: d, onOpenPlayer: openPlayer)
        case .prediction: WCPredictionView(detail: d)
        }
    }
}

// MARK: - الأحداث

struct WCEventsTimeline: View {
    let detail: WCMatchDetail
    let onOpenPlayer: (Int?) -> Void

    var body: some View {
        if detail.events.isEmpty {
            emptyText("الأحداث تظهر هنا لحظة بلحظة مع انطلاق المباراة")
        } else {
            VStack(spacing: 8) {
                ForEach(sorted) { ev in
                    Button { onOpenPlayer(ev.playerId) } label: { row(ev) }
                        .buttonStyle(.plain)
                }
            }
        }
    }

    private var sorted: [WCMatchEvent] {
        detail.events.sorted { ($0.minute, $0.extraMinute ?? 0) > ($1.minute, $1.extraMinute ?? 0) }
    }

    private func row(_ ev: WCMatchEvent) -> some View {
        let isHome = ev.teamId == detail.fixture.home.id
        let team = isHome ? detail.fixture.home : detail.fixture.away
        return HStack(spacing: 12) {
            Text("\(ev.minute)'\(ev.extraMinute.map { "+\($0)" } ?? "")")
                .font(SabqFonts.app(size: 12, weight: .bold).monospacedDigit())
                .foregroundStyle(WCTheme.onDarkDim)
                .frame(minWidth: 44)
                .environment(\.layoutDirection, .leftToRight)
            icon(ev.type)
            VStack(alignment: .leading, spacing: 1) {
                Text("\(ev.label)\(ev.player.isEmpty ? "" : " — \(ev.player)")")
                    .font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                if let assist = ev.assist, ev.type == "goal" {
                    Text("صناعة: \(assist)").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                } else if let assist = ev.assist, ev.type == "substitution" {
                    Text("بديلًا عن: \(assist)").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                }
            }
            Spacer()
            WCRemoteImage(url: team.logo).frame(width: 20, height: 20)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.chipFill))
    }

    @ViewBuilder private func icon(_ type: String) -> some View {
        switch type {
        case "goal": Image(systemName: "soccerball").foregroundStyle(WCTheme.emeraldDeep)
        case "missed-penalty": Image(systemName: "xmark.circle.fill").foregroundStyle(WCTheme.liveRed)
        case "yellow-card": RoundedRectangle(cornerRadius: 2).fill(WCTheme.gold).frame(width: 11, height: 15)
        case "red-card": RoundedRectangle(cornerRadius: 2).fill(WCTheme.liveRed).frame(width: 11, height: 15)
        case "substitution": Image(systemName: "arrow.left.arrow.right").foregroundStyle(WCTheme.sky)
        case "var": Image(systemName: "tv").foregroundStyle(.purple)
        default: Image(systemName: "circle.fill").foregroundStyle(WCTheme.onDarkDim)
        }
    }
}

// MARK: - التشكيلات (ملعب 2D)

struct WCLineupsView: View {
    let detail: WCMatchDetail
    let onOpenPlayer: (Int?) -> Void

    var body: some View {
        if detail.lineups.isEmpty {
            emptyText("التشكيلات تُعلن قبل انطلاق المباراة بنحو 20–40 دقيقة")
        } else {
            VStack(spacing: 18) {
                ForEach(detail.lineups) { lineup in
                    WCPitch(lineup: lineup, onOpenPlayer: onOpenPlayer)
                }
            }
        }
    }
}

struct WCPitch: View {
    let lineup: WCLineup
    let onOpenPlayer: (Int?) -> Void

    // صفوف اللاعبين من الشبكة "صف:عمود" (الصف 1 = الحارس)
    private var rows: [[WCLineupPlayer]] {
        var byRow: [Int: [(col: Int, p: WCLineupPlayer)]] = [:]
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
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(lineup.teamName).font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark)
                Spacer()
                if let f = lineup.formation {
                    Text(f).font(SabqFonts.app(size: 12, weight: .bold).monospacedDigit())
                        .foregroundStyle(WCTheme.onDarkDim)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Capsule().fill(WCTheme.chipFill))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            pitch
            if !lineup.coach.isEmpty {
                Text("المدرب: \(lineup.coach)").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
            }
        }
    }

    private var pitch: some View {
        GeometryReader { geo in
            let r = rows
            ZStack {
                LinearGradient(colors: [WCTheme.pitchTop, WCTheme.pitchBottom], startPoint: .top, endPoint: .bottom)
                RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.25), lineWidth: 1).padding(8)
                Rectangle().fill(.white.opacity(0.2)).frame(height: 1)
                Circle().stroke(.white.opacity(0.25), lineWidth: 1).frame(width: 64, height: 64)

                if r.isEmpty {
                    Text("التشكيلة غير متاحة بعد").font(SabqFonts.app(size: 12)).foregroundStyle(.white.opacity(0.8))
                } else {
                    ForEach(Array(r.enumerated()), id: \.offset) { ri, players in
                        let y = geo.size.height * (1 - (CGFloat(ri) + 0.6) / (CGFloat(r.count) + 0.4))
                        HStack(spacing: 0) {
                            ForEach(players) { p in
                                playerDot(p).frame(maxWidth: .infinity)
                            }
                        }
                        .environment(\.layoutDirection, .leftToRight)
                        .position(x: geo.size.width / 2, y: y)
                        .frame(width: geo.size.width)
                    }
                }
            }
        }
        .aspectRatio(3.0 / 4.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func playerDot(_ p: WCLineupPlayer) -> some View {
        Button { onOpenPlayer(p.id) } label: {
            VStack(spacing: 2) {
                Text(p.number.map { "\($0)" } ?? "•")
                    .font(SabqFonts.app(size: 11, weight: .black).monospacedDigit()).foregroundStyle(WCTheme.pitchBottom)
                    .frame(width: 28, height: 28).background(Circle().fill(.white))
                Text(p.name).font(SabqFonts.app(size: 9, weight: .semibold)).foregroundStyle(.white)
                    .lineLimit(1).frame(maxWidth: 56)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - الإحصائيات

struct WCStatsView: View {
    let detail: WCMatchDetail

    var body: some View {
        if detail.statistics.isEmpty {
            emptyText("الإحصائيات تظهر هنا أثناء المباراة")
        } else {
            VStack(spacing: 14) {
                ForEach(detail.statistics) { stat in
                    statRow(stat)
                }
            }
        }
    }

    private func statRow(_ s: WCStatistic) -> some View {
        let h = Double(s.home.replacingOccurrences(of: "%", with: "")) ?? 0
        let a = Double(s.away.replacingOccurrences(of: "%", with: "")) ?? 0
        let max = (h + a) == 0 ? 1 : (h + a)
        return VStack(spacing: 5) {
            HStack {
                Text(s.home).font(SabqFonts.app(size: 14, weight: .black)).frame(width: 48, alignment: .leading)
                Spacer()
                Text(s.label).font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
                Spacer()
                Text(s.away).font(SabqFonts.app(size: 14, weight: .black)).frame(width: 48, alignment: .trailing)
            }
            .foregroundStyle(WCTheme.onDark)
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule().fill(WCTheme.emeraldDeep)
                        .frame(width: geo.size.width / 2 * CGFloat(h / max))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    Capsule().fill(WCTheme.sky)
                        .frame(width: geo.size.width / 2 * CGFloat(a / max))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .environment(\.layoutDirection, .leftToRight)
            }
            .frame(height: 6)
        }
    }
}

// MARK: - التقييمات

struct WCRatingsView: View {
    let detail: WCMatchDetail
    let onOpenPlayer: (Int?) -> Void

    var body: some View {
        if detail.ratings.isEmpty {
            emptyText("تقييمات اللاعبين تظهر هنا بعد انطلاق المباراة")
        } else {
            VStack(spacing: 8) {
                if let motm = detail.manOfTheMatch {
                    Button { onOpenPlayer(motm.id) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "crown.fill").foregroundStyle(WCTheme.gold)
                            VStack(alignment: .leading, spacing: 1) {
                                Text("رجل المباراة").font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.gold)
                                Text(motm.name).font(SabqFonts.app(size: 14, weight: .black)).foregroundStyle(WCTheme.onDark)
                            }
                            Spacer()
                            ratingBadge(motm.rating)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WCTheme.gold.opacity(0.12)))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(WCTheme.gold.opacity(0.3), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
                ForEach(detail.ratings) { p in
                    Button { onOpenPlayer(p.id) } label: { playerRow(p) }
                        .buttonStyle(.plain)
                }
            }
        }
    }

    private func playerRow(_ p: WCPlayerRating) -> some View {
        let teamLogo = p.teamId == detail.fixture.home.id ? detail.fixture.home.logo : detail.fixture.away.logo
        return HStack(spacing: 10) {
            if p.photo.isEmpty {
                Circle().fill(WCTheme.chipFill).frame(width: 32, height: 32)
            } else {
                WCRemoteImage(url: p.photo, contentMode: .fill).frame(width: 32, height: 32).clipShape(Circle())
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("\(p.name)\(p.captain ? " (ك)" : "")").font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                Text(subtitle(p)).font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
            }
            Spacer()
            WCRemoteImage(url: teamLogo).frame(width: 16, height: 16)
            ratingBadge(p.rating)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.chipFill))
    }

    private func subtitle(_ p: WCPlayerRating) -> String {
        var parts = [p.position]
        if p.minutes > 0 { parts.append("\(p.minutes) د") }
        if p.goals > 0 { parts.append("\(p.goals) ⚽") }
        if p.assists > 0 { parts.append("\(p.assists) صناعة") }
        return parts.joined(separator: " · ")
    }

    private func ratingBadge(_ rating: Double) -> some View {
        Text(String(format: "%.1f", rating))
            .font(SabqFonts.app(size: 13, weight: .black).monospacedDigit())
            .foregroundStyle(.white)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(RoundedRectangle(cornerRadius: 8).fill(ratingColor(rating)))
            .environment(\.layoutDirection, .leftToRight)
    }

    private func ratingColor(_ r: Double) -> Color {
        if r >= 8 { return WCTheme.emeraldDeep }
        if r >= 7 { return WCTheme.leaf }
        if r >= 6 { return WCTheme.gold }
        return WCTheme.liveRed
    }
}

// MARK: - التوقعات + سجل المواجهات

struct WCPredictionView: View {
    let detail: WCMatchDetail

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let p = detail.prediction {
                VStack(spacing: 10) {
                    bar("فوز \(detail.fixture.home.name)", p.home, WCTheme.emeraldDeep)
                    bar("التعادل", p.draw, WCTheme.onDarkDim)
                    bar("فوز \(detail.fixture.away.name)", p.away, WCTheme.sky)
                }
                Text("توقعات خوارزمية من مزود البيانات الرياضية — للاستئناس وليست ترجيحًا تحريريًا")
                    .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity, alignment: .center)
            } else {
                Text("لا تتوفر توقعات لهذه المباراة")
                    .font(SabqFonts.app(size: 13)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 4)
            }

            Divider().overlay(WCTheme.cardStroke)
            Text("سجل المواجهات").font(SabqFonts.app(size: 13, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
            if detail.headToHead.isEmpty {
                Text("أول مواجهة رسمية بين المنتخبين — التاريخ يبدأ من هنا")
                    .font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 6)
            } else {
                ForEach(detail.headToHead) { m in
                    h2hRow(m)
                }
            }
        }
    }

    private func bar(_ label: String, _ value: Int, _ color: Color) -> some View {
        VStack(spacing: 4) {
            HStack {
                Text(label).font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                Spacer()
                Text("\(value)%").font(SabqFonts.app(size: 13, weight: .black)).foregroundStyle(WCTheme.onDark)
            }
            GeometryReader { geo in
                Capsule().fill(color).frame(width: geo.size.width * CGFloat(value) / 100)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: 8)
            .background(Capsule().fill(WCTheme.chipFill))
        }
    }

    private func h2hRow(_ m: WCFixture) -> some View {
        HStack(spacing: 8) {
            Text(String(m.date.prefix(4)))
                .font(SabqFonts.app(size: 12, weight: .bold).monospacedDigit()).foregroundStyle(WCTheme.onDarkDim)
                .padding(.horizontal, 7).padding(.vertical, 3)
                .background(Capsule().fill(WCTheme.chipFill))
                .environment(\.layoutDirection, .leftToRight)
            Text(m.home.name).font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
            // اسم المضيف على اليمين — الضيف أولًا داخل LTR
            Text("\(m.goals.away ?? 0) - \(m.goals.home ?? 0)")
                .font(SabqFonts.app(size: 13, weight: .black)).foregroundStyle(WCTheme.onDark)
                .environment(\.layoutDirection, .leftToRight)
            Text(m.away.name).font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(WCTheme.chipFill))
    }
}

// MARK: - مساعد مشترك

@ViewBuilder
func emptyText(_ message: String) -> some View {
    Text(message)
        .font(SabqFonts.app(size: 13))
        .foregroundStyle(WCTheme.onDarkDim)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
}
