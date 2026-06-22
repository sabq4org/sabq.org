import SwiftUI
import UIKit
import Charts

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

    enum Tab: String, CaseIterable { case events = "الأحداث", pressure = "الضغط", lineups = "التشكيلات", stats = "الإحصائيات", ratings = "التقييمات", prediction = "التوقعات" }
    @State private var tab: Tab = .events

    private var tabs: [Tab] {
        var t: [Tab] = [.events]
        if let d = detail, d.fixture.status.live || d.fixture.status.finished { t.append(.pressure) }
        t.append(contentsOf: [.lineups, .stats])
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
            // تحديث لحظي للنتيجة/الدقيقة أثناء اللعب (الخادم يركّب نتيجة SportMonks الحيّة)
            .task(id: detail?.fixture.id) {
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 8_000_000_000)
                    if Task.isCancelled { return }
                    if detail?.fixture.status.live == true { await load(force: true) }
                }
            }
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
        case .pressure:
            WCPressureView(fixtureId: d.fixture.id, live: d.fixture.status.live,
                           homeName: d.fixture.home.name, awayName: d.fixture.away.name)
        case .lineups: WCLineupsView(detail: d, onOpenPlayer: openPlayer)
        case .stats: WCStatsView(detail: d)
        case .ratings: WCRatingsView(detail: d, onOpenPlayer: openPlayer)
        case .prediction: WCPredictionView(detail: d)
        }
    }
}

// MARK: - الأحداث (خط زمن أفقي للأهداف/الكروت + مجريات عمودية أحدثها بالأعلى)
//
// تكافؤ مع MatchCenterDialog على الويب (#436): شريط أفقي يلخّص الأهداف والكروت
// (المضيف أعلى المحور/الضيف أسفله، RTL فالدقيقة 0 يمينًا)، يليه سرد عمودي لكل
// المجريات أحدثُها بالأعلى مع نقطة بلون الفريق (المضيف زمردي/الضيف ذهبي).

struct WCEventsTimeline: View {
    let detail: WCMatchDetail
    let onOpenPlayer: (Int?) -> Void
    // تفاصيل SportMonks المركّبة (طريقة الهدف/سبب البطاقة/VAR) + نتيجة الشوط الأول
    @State private var facts: WCMatchFacts?

    // أبعاد الشريط الأفقي
    private let barHeight: CGFloat = 96
    private let axisY: CGFloat = 42
    private let topRowY: CGFloat = 20
    private let bottomRowY: CGFloat = 64
    private let barInset: CGFloat = 16

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let ht = facts?.halftime { halftimeRow(ht) }

            if detail.events.isEmpty {
                emptyText("الأحداث تظهر هنا لحظة بلحظة مع انطلاق المباراة")
            } else {
                if !barEvents.isEmpty { horizontalBar }
                verticalFlow
            }
        }
        .task(id: detail.fixture.id) {
            facts = try? await APIClient.shared.fetchWorldCupMatchFacts(
                fixtureId: detail.fixture.id, ignoreCache: detail.fixture.status.live)
        }
    }

    // MARK: نتيجة الشوط الأول
    private func halftimeRow(_ ht: WCHalftime) -> some View {
        HStack(spacing: 8) {
            Text("نتيجة الشوط الأول").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
            // المضيف يمينًا في RTL — الضيف أولًا داخل LTR
            Text("\(ht.away) - \(ht.home)")
                .font(SabqFonts.app(size: 12, weight: .black).monospacedDigit())
                .foregroundStyle(WCTheme.onDark)
                .environment(\.layoutDirection, .leftToRight)
            Spacer(minLength: 0)
        }
    }

    // MARK: الشريط الأفقي (الأهداف والكروت)
    private var barEvents: [WCMatchEvent] {
        detail.events.filter { $0.type == "goal" || $0.type == "yellow-card" || $0.type == "red-card" }
    }
    private var maxMinute: Int {
        max(90, detail.events.map { $0.minute + ($0.extraMinute ?? 0) }.max() ?? 90)
    }
    private var refMarks: [Int] {
        maxMinute > 95 ? [0, 45, 90, maxMinute] : [0, 45, 90]
    }

    /// إحداثي أفقي يدوي بـRTL: الدقيقة 0 عند اليمين، الأكبر عند اليسار (داخل هوامش barInset).
    private func barX(_ minute: Int, width w: CGFloat) -> CGFloat {
        let f = min(max(CGFloat(minute) / CGFloat(maxMinute), 0), 1)
        let usable = max(w - barInset * 2, 1)
        return barInset + usable * (1 - f)
    }

    private var horizontalBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("خط زمن المباراة")
                .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.emerald)

            GeometryReader { geo in
                let w = geo.size.width
                ZStack(alignment: .topLeading) {
                    // المحور الأفقي
                    Rectangle().fill(WCTheme.emerald.opacity(0.22))
                        .frame(width: w - barInset * 2, height: 2)
                        .position(x: w / 2, y: axisY)
                    // علامات مرجعية + خطوط شبكية + بطاقة الدقيقة أسفلها
                    ForEach(refMarks, id: \.self) { m in
                        let x = barX(m, width: w)
                        Rectangle().fill(WCTheme.emerald.opacity(0.12))
                            .frame(width: 1, height: barHeight - 22)
                            .position(x: x, y: (barHeight - 22) / 2)
                        Text("\(m)'")
                            .font(SabqFonts.app(size: 8).monospacedDigit())
                            .foregroundStyle(WCTheme.onDarkDim)
                            .position(x: x, y: barHeight - 6)
                    }
                    // العلامات: المضيف فوق المحور، الضيف تحته
                    ForEach(barEvents) { ev in
                        let isHome = ev.teamId == detail.fixture.home.id
                        let x = barX(ev.minute + (ev.extraMinute ?? 0), width: w)
                        VStack(spacing: 1) {
                            if isHome { minuteTiny(ev); barMarker(ev) }
                            else { barMarker(ev); minuteTiny(ev) }
                        }
                        .position(x: x, y: isHome ? topRowY : bottomRowY)
                    }
                }
                .frame(width: w, height: barHeight)
                .environment(\.layoutDirection, .leftToRight) // إحداثيات يدوية: 0 يمينًا
            }
            .frame(height: barHeight)

            // مفتاح أعلى/أسفل
            HStack(spacing: 10) {
                HStack(spacing: 5) {
                    Circle().fill(WCTheme.emerald).frame(width: 7, height: 7)
                    Text("\(detail.fixture.home.name) · أعلى")
                        .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                }
                Spacer(minLength: 8)
                HStack(spacing: 5) {
                    Text("\(detail.fixture.away.name) · أسفل")
                        .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                    Circle().fill(WCTheme.gold).frame(width: 7, height: 7)
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.emerald.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(WCTheme.emerald.opacity(0.25), lineWidth: 1))
    }

    private func minuteTiny(_ ev: WCMatchEvent) -> some View {
        Text(minuteLabel(ev))
            .font(SabqFonts.app(size: 8, weight: .semibold).monospacedDigit())
            .foregroundStyle(WCTheme.onDarkDim)
            .environment(\.layoutDirection, .leftToRight)
    }

    @ViewBuilder private func barMarker(_ ev: WCMatchEvent) -> some View {
        switch ev.type {
        case "goal":
            Image(systemName: "soccerball")
                .font(.system(size: 12))
                .foregroundStyle(WCTheme.emeraldDeep)
                .padding(3)
                .background(Circle().fill(.white))
                .overlay(Circle().stroke(WCTheme.emerald.opacity(0.6), lineWidth: 1.5))
        case "yellow-card":
            RoundedRectangle(cornerRadius: 2).fill(WCTheme.gold).frame(width: 9, height: 13)
        case "red-card":
            RoundedRectangle(cornerRadius: 2).fill(WCTheme.liveRed).frame(width: 9, height: 13)
        default:
            EmptyView()
        }
    }

    // MARK: السرد العمودي (مجريات المباراة — أحدثها بالأعلى)
    private var verticalFlow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("مجريات المباراة")
                .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.emerald)
            ForEach(sorted) { ev in
                Button { onOpenPlayer(ev.playerId) } label: { row(ev) }
                    .buttonStyle(.plain)
            }
        }
    }

    private var sorted: [WCMatchEvent] {
        detail.events.sorted { ($0.minute, $0.extraMinute ?? 0) > ($1.minute, $1.extraMinute ?? 0) }
    }

    private func minuteLabel(_ ev: WCMatchEvent) -> String {
        "\(ev.minute)'\(ev.extraMinute.map { "+\($0)" } ?? "")"
    }

    // يطابق صنف حدث API-Football بصنف SportMonks للتركيب
    private func klassOf(_ type: String) -> String? {
        switch type {
        case "goal": return "goal"
        case "yellow-card", "red-card": return "card"
        case "var": return "var"
        default: return nil
        }
    }

    private func detailFor(_ ev: WCMatchEvent) -> String? {
        guard let klass = klassOf(ev.type), let list = facts?.eventDetails else { return nil }
        let loc = ev.teamId == detail.fixture.home.id ? "home" : "away"
        return list.first { $0.klass == klass && $0.location == loc && abs($0.minute - ev.minute) <= 1 }?.detail
    }

    private func row(_ ev: WCMatchEvent) -> some View {
        let isHome = ev.teamId == detail.fixture.home.id
        let team = isHome ? detail.fixture.home : detail.fixture.away
        let extra = detailFor(ev)
        return HStack(spacing: 10) {
            Circle().fill(isHome ? WCTheme.emerald : WCTheme.gold).frame(width: 8, height: 8)
            Text(minuteLabel(ev))
                .font(SabqFonts.app(size: 12, weight: .bold).monospacedDigit())
                .foregroundStyle(WCTheme.onDarkDim)
                .frame(minWidth: 40)
                .environment(\.layoutDirection, .leftToRight)
            icon(ev.type)
            VStack(alignment: .leading, spacing: 1) {
                Text("\(ev.label)\(ev.player.isEmpty ? "" : " — \(ev.player)")")
                    .font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                if let extra {
                    Text(extra).font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.sky).lineLimit(1)
                }
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

// MARK: - الضغط (Pressure Index)

struct WCPressureView: View {
    let fixtureId: Int
    let live: Bool
    let homeName: String
    let awayName: String
    @State private var data: WCPressure?

    var body: some View {
        VStack(spacing: 14) {
            if let d = data, !d.points.isEmpty {
                if live, let latest = d.latest, latest.side != "even" {
                    HStack(spacing: 8) {
                        Image(systemName: "gauge.medium").foregroundStyle(WCTheme.emerald)
                        Text("الأكثر سيطرة الآن:").font(SabqFonts.app(size: 13)).foregroundStyle(WCTheme.onDarkDim)
                        Text(latest.side == "home" ? homeName : awayName)
                            .font(SabqFonts.app(size: 13, weight: .heavy)).foregroundStyle(WCTheme.onDark)
                        Text("\(Int(latest.value))")
                            .font(SabqFonts.app(size: 13, weight: .black).monospacedDigit()).foregroundStyle(WCTheme.onDark)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Capsule().fill(WCTheme.chipFill))
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                Text("مؤشّر الضغط لحظة بلحظة — أعلى: \(homeName) · أسفل: \(awayName)")
                    .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                    .multilineTextAlignment(.center)
                chart(d.points)
            } else {
                emptyText("مؤشّر الضغط يظهر هنا أثناء المباراة")
            }
        }
        .task(id: fixtureId) {
            data = try? await APIClient.shared.fetchWorldCupPressure(fixtureId: fixtureId, ignoreCache: live)
        }
    }

    private func chart(_ points: [WCPressurePoint]) -> some View {
        Chart(points) { p in
            BarMark(
                x: .value("الدقيقة", p.minute),
                y: .value("الضغط", p.net)
            )
            .foregroundStyle(p.net >= 0 ? WCTheme.emeraldDeep : WCTheme.liveRed)
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 6)) { value in
                AxisValueLabel {
                    if let m = value.as(Int.self) {
                        Text("\(m)'").font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim)
                    }
                }
            }
        }
        .chartYAxis(.hidden)
        .frame(height: 180)
        .environment(\.layoutDirection, .leftToRight)
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
    // معطيات SportMonks الأعمق: إحصائيات (حتى 41) + طقس + غيابات + xG
    @State private var facts: WCMatchFacts?
    @State private var xg: WCXg?
    @State private var loaded = false

    // إحصائيات SportMonks أعمق؛ نعود لإحصائيات API-Football عند غيابها
    private var stats: [WCStatistic] {
        if let f = facts, !f.statistics.isEmpty { return f.statistics }
        return detail.statistics
    }

    private var nothing: Bool {
        stats.isEmpty && !(xg?.available ?? false) && facts?.weather == nil
            && (facts?.absentees.isEmpty ?? true)
    }

    var body: some View {
        VStack(spacing: 14) {
            if let xg, xg.available { xgCard(xg) }
            if let w = facts?.weather { weatherCard(w) }
            if let f = facts, !f.absentees.isEmpty { absenteesView(f.absentees) }
            if !stats.isEmpty {
                ForEach(stats) { statRow($0) }
            }
            if loaded && nothing {
                emptyText("الإحصائيات تظهر هنا أثناء المباراة")
            }
        }
        .task(id: detail.fixture.id) {
            async let f = APIClient.shared.fetchWorldCupMatchFacts(
                fixtureId: detail.fixture.id, ignoreCache: detail.fixture.status.live)
            async let x = APIClient.shared.fetchWorldCupXg(
                fixtureId: detail.fixture.id, ignoreCache: detail.fixture.status.live)
            facts = try? await f
            xg = try? await x
            loaded = true
        }
    }

    // MARK: xG

    private func xgCard(_ xg: WCXg) -> some View {
        VStack(spacing: 10) {
            statRow(WCStatistic(key: "xg", label: "الأهداف المتوقعة (xG)",
                                home: String(format: "%.2f", xg.home.xg),
                                away: String(format: "%.2f", xg.away.xg)))
            if xg.home.xgot > 0 || xg.away.xgot > 0 {
                HStack {
                    Text(String(format: "%.2f", xg.home.xgot))
                        .font(SabqFonts.app(size: 11).monospacedDigit()).foregroundStyle(WCTheme.onDarkDim)
                        .frame(width: 48, alignment: .leading)
                    Spacer()
                    Text("على المرمى (xGoT)").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                    Spacer()
                    Text(String(format: "%.2f", xg.away.xgot))
                        .font(SabqFonts.app(size: 11).monospacedDigit()).foregroundStyle(WCTheme.onDarkDim)
                        .frame(width: 48, alignment: .trailing)
                }
            }
            if !xg.topPlayers.isEmpty {
                Divider().overlay(WCTheme.cardStroke)
                VStack(alignment: .leading, spacing: 5) {
                    Text("الأعلى خطورة (xG)").font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                    ForEach(Array(xg.topPlayers.prefix(3))) { p in
                        HStack(spacing: 8) {
                            WCRemoteImage(url: p.location == "home" ? detail.fixture.home.logo : detail.fixture.away.logo)
                                .frame(width: 16, height: 16)
                            Text(p.name).font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                            Spacer()
                            Text(String(format: "%.2f", p.xg))
                                .font(SabqFonts.app(size: 12, weight: .bold).monospacedDigit()).foregroundStyle(WCTheme.onDark)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(WCTheme.cardStroke, lineWidth: 1))
    }

    // MARK: الطقس

    private func weatherCard(_ w: WCWeather) -> some View {
        HStack(spacing: 12) {
            if w.icon.isEmpty {
                Image(systemName: "cloud.fill").font(.system(size: 24)).foregroundStyle(WCTheme.sky)
            } else {
                WCRemoteImage(url: w.icon).frame(width: 34, height: 34)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(w.description).font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark)
                    if w.type == "forecast" {
                        Text("· توقّع").font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                    }
                }
                HStack(spacing: 12) {
                    if let t = w.temp {
                        Text("\(t)°م").font(SabqFonts.app(size: 11).monospacedDigit()).foregroundStyle(WCTheme.onDarkDim)
                    }
                    if let h = w.humidity, !h.isEmpty {
                        HStack(spacing: 2) {
                            Image(systemName: "drop.fill").font(.system(size: 9))
                            Text(h)
                        }
                        .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                    }
                }
            }
            Spacer()
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.chipFill))
    }

    // MARK: الغيابات

    private func absenteesView(_ list: [WCAbsentee]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "bandage.fill").font(.system(size: 12)).foregroundStyle(WCTheme.liveRed)
                Text("الغيابات").font(SabqFonts.app(size: 13, weight: .bold)).foregroundStyle(WCTheme.liveRed)
            }
            HStack(alignment: .top, spacing: 12) {
                absenteeCol(detail.fixture.home, list.filter { $0.location == "home" })
                absenteeCol(detail.fixture.away, list.filter { $0.location == "away" })
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.chipFill))
    }

    private func absenteeCol(_ team: WCTeam, _ players: [WCAbsentee]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                WCRemoteImage(url: team.logo).frame(width: 16, height: 16)
                Text(team.name).font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
            }
            if players.isEmpty {
                Text("—").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
            } else {
                ForEach(players) { p in
                    Text("\(p.name)\(p.reason.isEmpty ? "" : " — \(p.reason)")")
                        .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
    // توقعات SportMonks الاحتمالية (16 نوعًا) — أفضل جهد
    @State private var forecast: WCForecast?
    @State private var loaded = false

    // نتيجة المباراة: API-Football إن توفّر، وإلا احتمالات SportMonks
    private var ft: (home: Int, draw: Int, away: Int)? {
        if let p = detail.prediction { return (p.home, p.draw, p.away) }
        if let f = forecast?.fulltime { return (f.home, f.draw, f.away) }
        return nil
    }
    private var hasAnyPrediction: Bool { ft != nil || (forecast?.available ?? false) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let ft {
                VStack(spacing: 10) {
                    bar("فوز \(detail.fixture.home.name)", ft.home, WCTheme.emeraldDeep)
                    bar("التعادل", ft.draw, WCTheme.onDarkDim)
                    bar("فوز \(detail.fixture.away.name)", ft.away, WCTheme.sky)
                }
            } else if loaded {
                Text("لا تتوفر توقعات لهذه المباراة")
                    .font(SabqFonts.app(size: 13)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity).padding(.vertical, 4)
            }

            if let f = forecast, f.available { forecastBlocks(f) }

            if hasAnyPrediction {
                Text("توقعات خوارزمية من مزود البيانات الرياضية — للاستئناس وليست ترجيحًا تحريريًا")
                    .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity, alignment: .center)
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
        .task(id: detail.fixture.id) {
            forecast = try? await APIClient.shared.fetchWorldCupForecast(fixtureId: detail.fixture.id)
            loaded = true
        }
    }

    // MARK: توقعات متقدّمة (SportMonks)

    @ViewBuilder private func forecastBlocks(_ f: WCForecast) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider().overlay(WCTheme.cardStroke)
            Text("توقعات متقدّمة").font(SabqFonts.app(size: 13, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)

            if let dc = f.doubleChance {
                VStack(alignment: .leading, spacing: 6) {
                    Text("الفرصة المزدوجة").font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
                    HStack(spacing: 8) {
                        dcCell("\(detail.fixture.home.name) أو تعادل", dc.homeOrDraw)
                        dcCell("بلا تعادل", dc.homeOrAway)
                        dcCell("\(detail.fixture.away.name) أو تعادل", dc.awayOrDraw)
                    }
                }
            }

            if let b = f.btts {
                twoWay("الفريقان يسجلان", leftLabel: "نعم", left: b.yes, rightLabel: "لا", right: b.no)
            }

            if !f.goals.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("مجموع الأهداف — أكثر/أقل من").font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
                    ForEach(f.goals) { ou in
                        HStack(spacing: 8) {
                            Text(String(format: "%g", ou.line))
                                .font(SabqFonts.app(size: 12, weight: .bold).monospacedDigit()).foregroundStyle(WCTheme.onDark)
                                .frame(width: 32).environment(\.layoutDirection, .leftToRight)
                            twoWayBar(left: ou.over, right: ou.under)
                        }
                    }
                }
            }

            if !f.correctScores.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("أرجح النتائج (الرقم الأول للمضيف)").font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(f.correctScores) { cs in
                                VStack(spacing: 2) {
                                    Text(cs.score)
                                        .font(SabqFonts.app(size: 14, weight: .black).monospacedDigit()).foregroundStyle(WCTheme.onDark)
                                        .environment(\.layoutDirection, .leftToRight)
                                    Text(String(format: "%g%%", cs.prob))
                                        .font(SabqFonts.app(size: 10).monospacedDigit()).foregroundStyle(WCTheme.onDarkDim)
                                }
                                .padding(.horizontal, 12).padding(.vertical, 8)
                                .background(RoundedRectangle(cornerRadius: 12).fill(WCTheme.chipFill))
                            }
                        }
                    }
                }
            }
        }
    }

    private func dcCell(_ label: String, _ value: Int) -> some View {
        VStack(spacing: 3) {
            Text("\(value)%").font(SabqFonts.app(size: 16, weight: .black).monospacedDigit()).foregroundStyle(WCTheme.onDark)
            Text(label).font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                .multilineTextAlignment(.center).lineLimit(2)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 10).fill(WCTheme.chipFill))
    }

    private func twoWay(_ title: String, leftLabel: String, left: Int, rightLabel: String, right: Int) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
            twoWayBar(left: left, right: right)
            HStack {
                Text("\(leftLabel) \(left)%").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDark)
                Spacer()
                Text("\(rightLabel) \(right)%").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDark)
            }
        }
    }

    private func twoWayBar(left: Int, right: Int) -> some View {
        let total = CGFloat(max(1, left + right))
        return GeometryReader { geo in
            HStack(spacing: 2) {
                WCTheme.emeraldDeep.frame(width: geo.size.width * CGFloat(left) / total)
                WCTheme.sky.opacity(0.5).frame(maxWidth: .infinity)
            }
            .clipShape(Capsule())
            .environment(\.layoutDirection, .leftToRight)
        }
        .frame(height: 16)
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
