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
    @Environment(SabqLiveStream.self) private var liveStream

    @State private var detail: WCMatchDetail?
    @State private var loading = true
    @State private var selectedPlayer: WCPlayerSelection?
    @State private var showActivityDeniedAlert = false
    private let liveManager = LiveMatchActivityManager.shared

    enum Tab: String, CaseIterable { case commentary = "التعليق", events = "الأحداث", momentum = "الزخم", pressure = "الضغط", lineups = "التشكيلات", stats = "الإحصائيات", ratings = "التقييمات", prediction = "التوقعات" }
    @State private var tab: Tab = .events
    // ضبط افتراضي مرّة واحدة: التعليق الحي يتصدّر عند بثّ المباراة (كالويب)
    @State private var didPickDefaultTab = false

    private var tabs: [Tab] {
        let started = (detail?.fixture.status.live ?? false) || (detail?.fixture.status.finished ?? false)
        var t: [Tab] = []
        if started { t.append(.commentary) }   // مباشر/التعليق أولًا
        t.append(.events)
        if started { t.append(contentsOf: [.momentum, .pressure]) }
        t.append(contentsOf: [.lineups, .stats])
        if let d = detail, !d.ratings.isEmpty { t.append(.ratings) }
        t.append(.prediction)
        return t
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: SabqLayout.space16) {
                    if loading {
                        WCLoading().padding(.top, SabqLayout.space32)
                    } else if let detail {
                        header(detail.fixture)
                        if !detail.fixture.status.finished {
                            WCTvStrip(fixtureId: detail.fixture.id)
                        }
                        if liveActivityEligible(detail.fixture) {
                            liveFollowButton(detail)
                        }
                        tabBar
                        content(detail)
                    } else {
                        Text("تعذر جلب تفاصيل المباراة")
                            .font(SabqFonts.app(size: 15)).foregroundStyle(SabqTheme.textSecondary)
                            .padding(.top, SabqLayout.space40)
                    }
                }
                .padding(SabqLayout.pageMargin)
            }
            .background(SabqTheme.background.ignoresSafeArea())
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
            // شبكة أمان: استطلاع أبطأ عند انقطاع SSE؛ مع البث الحي يكفي ~20ث.
            .task(id: detail?.fixture.id) {
                liveStream.acquire()
                defer { liveStream.release() }
                var tick = 0
                while !Task.isCancelled {
                    let interval: UInt64 = liveStream.connected ? 20_000_000_000 : 8_000_000_000
                    try? await Task.sleep(nanoseconds: interval)
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
            // البث الحي (SSE): تغيّر ختم المباراة ≈ جلب فوري (~2ث من الخادم).
            .onChange(of: liveStream.stamps["w:\(fixtureId)"]) { _, _ in
                Task { await load(force: true) }
            }
            .onChange(of: liveStream.stamps["s:\(fixtureId)"]) { _, _ in
                Task { await load(force: true) }
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
        .environment(liveStream)
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
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: icon).accessibilityHidden(true)
                Text(title)
                    .sabqText(SabqType.button)
            }
            // أساسي: تعبئة بلون الهوية ونص أبيض؛ ثانوي (الإيقاف): حدّ outline
            .foregroundStyle(running ? SabqTheme.textPrimary : SabqTheme.onAction)
            .frame(maxWidth: .infinity)
            .frame(minHeight: SabqLayout.controlHeight)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(running ? Color.clear : WCTheme.royal)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .stroke(SabqTheme.outline, lineWidth: running ? 1 : 0)
            )
        }
        .buttonStyle(.plain)
    }

    private func load(force: Bool = false) async {
        if let r = try? await APIClient.shared.fetchWorldCupMatch(fixtureId: fixtureId, ignoreCache: force) {
            await MainActor.run {
                detail = r
                loading = false
                // أول تحميل لمباراة جارية: ابدأ على «التعليق» الحي كالويب
                if !didPickDefaultTab {
                    didPickDefaultTab = true
                    if r.fixture.status.live { tab = .commentary }
                }
            }
        } else { await MainActor.run { loading = false } }
    }

    // MARK: ترويسة

    private func header(_ f: WCFixture) -> some View {
        VStack(spacing: SabqLayout.space8) {
            HStack(alignment: .top) {
                teamHead(f.home)
                VStack(spacing: SabqLayout.space4) {
                    if f.started {
                        // المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR
                        Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                            .font(SabqFonts.app(size: 24, weight: .semibold))
                            .foregroundStyle(SabqTheme.textPrimary)
                            .environment(\.layoutDirection, .leftToRight)
                    } else {
                        Text(WCFormat.time(f)).font(SabqFonts.app(size: 20, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
                    }
                    WCStatusPill(fixture: f)
                }
                .frame(minWidth: 90)
                teamHead(f.away)
            }
            Text("\(f.round) · \(f.venue.name) — \(f.venue.city) · \(WCFormat.day(f))")
                .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
    }

    private func teamHead(_ team: WCTeam) -> some View {
        VStack(spacing: SabqLayout.space8) {
            WCTeamLogo(team: team, size: 48, ring: SabqTheme.separator)
            Text(team.name).font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: التبويبات

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SabqLayout.space8) {
                ForEach(tabs, id: \.self) { t in
                    Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                        Text(t.rawValue)
                            .font(SabqFonts.app(size: 15, weight: .semibold))
                            .foregroundStyle(tab == t ? SabqTheme.onAction : SabqTheme.textPrimary)
                            .padding(.horizontal, SabqLayout.space16)
                            .frame(minHeight: SabqLayout.touchTarget)
                            .background(Capsule().fill(tab == t ? WCTheme.royal : SabqTheme.surfaceMuted))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder private func content(_ d: WCMatchDetail) -> some View {
        let openPlayer: (Int?) -> Void = { selectedPlayer = WCPlayerSelection($0) }
        switch tab {
        case .commentary:
            WCCommentaryView(fixtureId: d.fixture.id, live: d.fixture.status.live)
        case .events: WCEventsTimeline(detail: d, onOpenPlayer: openPlayer)
        case .momentum:
            WCMomentumView(fixtureId: d.fixture.id, live: d.fixture.status.live,
                           homeName: d.fixture.home.name, awayName: d.fixture.away.name)
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
    private let barHeight: CGFloat = 108
    private let axisY: CGFloat = 44
    private let topRowY: CGFloat = 20
    private let bottomRowY: CGFloat = 68
    private let barInset: CGFloat = 16

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
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
            Text("نتيجة الشوط الأول").sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
            // المضيف يمينًا في RTL — الضيف أولًا داخل LTR
            Text("\(ht.away) - \(ht.home)")
                .font(SabqFonts.app(size: 13, weight: .semibold).monospacedDigit())
                .foregroundStyle(SabqTheme.textPrimary)
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
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text("خط زمن المباراة")
                .sabqText(SabqType.tag).foregroundStyle(WCTheme.emeraldDeep)

            GeometryReader { geo in
                let w = geo.size.width
                ZStack(alignment: .topLeading) {
                    // المحور الأفقي
                    Rectangle().fill(SabqTheme.outline)
                        .frame(width: w - barInset * 2, height: 2)
                        .position(x: w / 2, y: axisY)
                    // علامات مرجعية + خطوط شبكية + بطاقة الدقيقة أسفلها
                    ForEach(refMarks, id: \.self) { m in
                        let x = barX(m, width: w)
                        Rectangle().fill(SabqTheme.separator)
                            .frame(width: 1, height: barHeight - 22)
                            .position(x: x, y: (barHeight - 22) / 2)
                        Text("\(m)'")
                            .font(SabqFonts.app(size: 12).monospacedDigit())
                            .foregroundStyle(SabqTheme.textSecondary)
                            .position(x: x, y: barHeight - 8)
                    }
                    // العلامات: المضيف فوق المحور، الضيف تحته
                    ForEach(barEvents) { ev in
                        let isHome = ev.teamId == detail.fixture.home.id
                        let x = barX(ev.minute + (ev.extraMinute ?? 0), width: w)
                        VStack(spacing: 0) {
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
            HStack(spacing: SabqLayout.space12) {
                HStack(spacing: SabqLayout.space4) {
                    Circle().fill(WCTheme.emeraldDeep).frame(width: 8, height: 8)
                    Text("\(detail.fixture.home.name) · أعلى")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                }
                Spacer(minLength: SabqLayout.space8)
                HStack(spacing: SabqLayout.space4) {
                    Text("\(detail.fixture.away.name) · أسفل")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                    Circle().fill(WCTheme.gold).frame(width: 8, height: 8)
                }
            }
        }
        .padding(SabqLayout.space12)
        .wcQuietBlock()
    }

    private func minuteTiny(_ ev: WCMatchEvent) -> some View {
        Text(minuteLabel(ev))
            .font(SabqFonts.app(size: 12).monospacedDigit())
            .foregroundStyle(SabqTheme.textSecondary)
            .environment(\.layoutDirection, .leftToRight)
    }

    @ViewBuilder private func barMarker(_ ev: WCMatchEvent) -> some View {
        switch ev.type {
        case "goal":
            Image(systemName: "soccerball")
                .font(.system(size: 12))
                .foregroundStyle(WCTheme.emeraldDeep)
                .padding(3)
                .background(Circle().fill(SabqTheme.surface))
                .overlay(Circle().stroke(WCTheme.emeraldDeep, lineWidth: 1))
        case "yellow-card":
            RoundedRectangle(cornerRadius: 2).fill(WCTheme.gold).frame(width: 9, height: 13)
        case "red-card":
            RoundedRectangle(cornerRadius: 2).fill(SabqTheme.breaking).frame(width: 9, height: 13)
        default:
            EmptyView()
        }
    }

    // MARK: السرد العمودي (مجريات المباراة — أحدثها بالأعلى)
    private var verticalFlow: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("مجريات المباراة")
                .sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                .padding(.bottom, SabqLayout.space8)
            // سرد غير مؤطّر بفواصل رفيعة
            ForEach(sorted) { ev in
                WCRowSeparator()
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
        return HStack(spacing: SabqLayout.space8) {
            Circle().fill(isHome ? WCTheme.emeraldDeep : WCTheme.gold).frame(width: 8, height: 8)
            Text(minuteLabel(ev))
                .font(SabqFonts.app(size: 12, weight: .medium).monospacedDigit())
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(minWidth: 40)
                .environment(\.layoutDirection, .leftToRight)
            icon(ev.type)
            VStack(alignment: .leading, spacing: 0) {
                Text(ev.player.isEmpty ? ev.label : "\(ev.player) (\(ev.label))")
                    .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                if let extra {
                    Text(extra).sabqText(SabqType.meta).foregroundStyle(WCTheme.emeraldDeep).lineLimit(1)
                }
                if let assist = ev.assist, ev.type == "goal" {
                    Text("صناعة: \(assist)").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                } else if let assist = ev.assist, ev.type == "substitution" {
                    Text("بديلًا عن: \(assist)").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                }
            }
            Spacer()
            WCRemoteImage(url: team.logo).frame(width: 24, height: 24)
        }
        .padding(.vertical, SabqLayout.space12)
        .frame(minHeight: SabqLayout.touchTarget)
        .contentShape(Rectangle())
    }

    @ViewBuilder private func icon(_ type: String) -> some View {
        switch type {
        case "goal": Image(systemName: "soccerball").foregroundStyle(WCTheme.emeraldDeep)
        case "missed-penalty": Image(systemName: "xmark.circle.fill").foregroundStyle(SabqTheme.breaking)
        case "yellow-card": RoundedRectangle(cornerRadius: 2).fill(WCTheme.gold).frame(width: 11, height: 15)
        case "red-card": RoundedRectangle(cornerRadius: 2).fill(SabqTheme.breaking).frame(width: 11, height: 15)
        case "substitution": Image(systemName: "arrow.left.arrow.right").foregroundStyle(SabqTheme.textSecondary)
        case "var": Image(systemName: "tv").foregroundStyle(SabqTheme.textSecondary)
        default: Image(systemName: "circle.fill").foregroundStyle(SabqTheme.textSecondary)
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
        VStack(spacing: SabqLayout.space16) {
            if let d = data, !d.points.isEmpty {
                if live, let latest = d.latest, latest.side != "even" {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "gauge.medium").foregroundStyle(WCTheme.emeraldDeep)
                        Text("الأكثر سيطرة الآن:").font(SabqFonts.app(size: 13)).foregroundStyle(SabqTheme.textSecondary)
                        Text(latest.side == "home" ? homeName : awayName)
                            .font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
                        Text("\(Int(latest.value))")
                            .font(SabqFonts.app(size: 12, weight: .regular).monospacedDigit()).foregroundStyle(SabqTheme.textPrimary)
                            .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                            .background(Capsule().fill(SabqTheme.surfaceMuted))
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                Text("مؤشّر الضغط لحظة بلحظة — أعلى: \(homeName) · أسفل: \(awayName)")
                    .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
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
            .foregroundStyle(p.net >= 0 ? WCTheme.emeraldDeep : SabqTheme.breaking)
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 6)) { value in
                AxisValueLabel {
                    if let m = value.as(Int.self) {
                        Text("\(m)'").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
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
            VStack(spacing: SabqLayout.space24) {
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
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack {
                Text(lineup.teamName).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                Spacer()
                if let f = lineup.formation {
                    Text(f).font(SabqFonts.app(size: 12, weight: .medium).monospacedDigit())
                        .foregroundStyle(SabqTheme.textSecondary)
                        .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
                        .background(Capsule().fill(SabqTheme.surfaceMuted))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            pitch
            if !lineup.coach.isEmpty {
                Text("المدرب: \(lineup.coach)").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            }
            if !lineup.substitutes.isEmpty {
                bench
            }
        }
    }

    // دكة البدلاء — شبكة مدمجة (رقم + اسم) قابلة للنقر لفتح بطاقة اللاعب
    private var bench: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "figure.seated.side").font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.emeraldDeep)
                    .accessibilityHidden(true)
                Text("دكة البدلاء").sabqText(SabqType.tag).foregroundStyle(WCTheme.emeraldDeep)
                Text("(\(lineup.substitutes.count))").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(lineup.substitutes) { p in
                    Button { onOpenPlayer(p.id) } label: { benchRow(p) }
                        .buttonStyle(.plain)
                }
            }
        }
        .padding(.top, SabqLayout.space4)
    }

    private func benchRow(_ p: WCLineupPlayer) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Text(p.number.map { "\($0)" } ?? "•")
                .font(SabqFonts.app(size: 12, weight: .medium).monospacedDigit()).foregroundStyle(WCTheme.emeraldDeep)
                .frame(width: 24, height: 24)
                .background(Circle().fill(SabqTheme.surface))
                .environment(\.layoutDirection, .leftToRight)
            Text(p.name)
                .font(SabqFonts.app(size: 12, weight: .regular)).foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space8)
        .frame(minHeight: SabqLayout.touchTarget)
        .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
    }

    private var pitch: some View {
        GeometryReader { geo in
            let r = rows
            ZStack {
                // أرضية الملعب بلون واحد مسطّح (رسم بياني، لا بطاقة)
                WCTheme.pitchBottom
                RoundedRectangle(cornerRadius: SabqRadius.small).stroke(.white.opacity(0.25), lineWidth: 1).padding(8)
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
        .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private func playerDot(_ p: WCLineupPlayer) -> some View {
        Button { onOpenPlayer(p.id) } label: {
            VStack(spacing: 2) {
                Text(p.number.map { "\($0)" } ?? "•")
                    .font(SabqFonts.app(size: 12, weight: .medium).monospacedDigit()).foregroundStyle(WCTheme.pitchBottom)
                    .frame(width: 28, height: 28).background(Circle().fill(.white))
                Text(p.name).font(SabqFonts.app(size: 12, weight: .regular)).foregroundStyle(.white)
                    .lineLimit(1).frame(maxWidth: 64)
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

    // أثناء اللعب نُفضّل إحصاءات detail اللحظية (TheSports — أسرع) إن توفّرت؛ وإلا
    // إحصائيات SportMonks الأعمق؛ ثم API-Football عند غيابها.
    private var stats: [WCStatistic] {
        if detail.fixture.status.live, !detail.statistics.isEmpty { return detail.statistics }
        if let f = facts, !f.statistics.isEmpty { return f.statistics }
        return detail.statistics
    }

    private var nothing: Bool {
        stats.isEmpty && !(xg?.available ?? false) && facts?.weather == nil
            && (facts?.absentees.isEmpty ?? true)
    }

    var body: some View {
        VStack(spacing: SabqLayout.space16) {
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
        VStack(spacing: SabqLayout.space12) {
            statRow(WCStatistic(key: "xg", label: "الأهداف المتوقعة (xG)",
                                home: String(format: "%.2f", xg.home.xg),
                                away: String(format: "%.2f", xg.away.xg)))
            if xg.home.xgot > 0 || xg.away.xgot > 0 {
                HStack {
                    Text(String(format: "%.2f", xg.home.xgot))
                        .font(SabqFonts.app(size: 12).monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                        .frame(width: 48, alignment: .leading)
                    Spacer()
                    Text("على المرمى (xGoT)").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    Spacer()
                    Text(String(format: "%.2f", xg.away.xgot))
                        .font(SabqFonts.app(size: 12).monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                        .frame(width: 48, alignment: .trailing)
                }
            }
            if !xg.topPlayers.isEmpty {
                WCRowSeparator()
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    Text("الأعلى خطورة (xG)").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    ForEach(Array(xg.topPlayers.prefix(3))) { p in
                        HStack(spacing: 8) {
                            WCRemoteImage(url: p.location == "home" ? detail.fixture.home.logo : detail.fixture.away.logo)
                                .frame(width: 16, height: 16)
                            Text(p.name).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                            Spacer()
                            Text(String(format: "%.2f", p.xg))
                                .font(SabqFonts.app(size: 12, weight: .medium).monospacedDigit()).foregroundStyle(SabqTheme.textPrimary)
                                .environment(\.layoutDirection, .leftToRight)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(SabqLayout.space16)
        .wcQuietBlock()
    }

    // MARK: الطقس

    private func weatherCard(_ w: WCWeather) -> some View {
        HStack(spacing: 12) {
            if w.icon.isEmpty {
                Image(systemName: "cloud.fill").font(.system(size: 24)).foregroundStyle(SabqTheme.textSecondary)
            } else {
                WCRemoteImage(url: w.icon).frame(width: 34, height: 34)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(w.description).font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
                    if w.type == "forecast" {
                        Text("· توقّع").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    }
                }
                HStack(spacing: 12) {
                    if let t = w.temp {
                        Text("\(t)°م").font(SabqFonts.app(size: 12).monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                    }
                    if let h = w.humidity, !h.isEmpty {
                        HStack(spacing: 2) {
                            Image(systemName: "drop.fill").font(SabqFonts.app(size: 12))
                            Text(h)
                        }
                        .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    }
                }
            }
            Spacer()
        }
        .padding(SabqLayout.space12)
        .wcQuietBlock()
    }

    // MARK: الغيابات

    private func absenteesView(_ list: [WCAbsentee]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "bandage.fill").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.danger)
                    .accessibilityHidden(true)
                Text("الغيابات").sabqText(SabqType.tag).foregroundStyle(SabqTheme.danger)
            }
            HStack(alignment: .top, spacing: 12) {
                absenteeCol(detail.fixture.home, list.filter { $0.location == "home" })
                absenteeCol(detail.fixture.away, list.filter { $0.location == "away" })
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(SabqLayout.space12)
        .wcQuietBlock()
    }

    private func absenteeCol(_ team: WCTeam, _ players: [WCAbsentee]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                WCRemoteImage(url: team.logo).frame(width: 16, height: 16)
                Text(team.name).font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
            }
            if players.isEmpty {
                Text("—").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            } else {
                ForEach(players) { p in
                    Text("\(p.name)\(p.reason.isEmpty ? "" : " — \(p.reason)")")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func statRow(_ s: WCStatistic) -> some View {
        let h = Double(s.home.replacingOccurrences(of: "%", with: "")) ?? 0
        let a = Double(s.away.replacingOccurrences(of: "%", with: "")) ?? 0
        let max = (h + a) == 0 ? 1 : (h + a)
        return VStack(spacing: SabqLayout.space8) {
            HStack {
                Text(s.home).font(SabqFonts.app(size: 15, weight: .semibold)).frame(width: 48, alignment: .leading)
                Spacer()
                Text(s.label).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                Spacer()
                Text(s.away).font(SabqFonts.app(size: 15, weight: .semibold)).frame(width: 48, alignment: .trailing)
            }
            .foregroundStyle(SabqTheme.textPrimary)
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
            VStack(spacing: 0) {
                if let motm = detail.manOfTheMatch {
                    Button { onOpenPlayer(motm.id) } label: {
                        HStack(spacing: SabqLayout.space12) {
                            Image(systemName: "crown.fill").foregroundStyle(SabqTheme.warning)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 0) {
                                Text("رجل المباراة").sabqText(SabqType.tag).foregroundStyle(SabqTheme.warning)
                                Text(motm.name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                            }
                            Spacer()
                            ratingBadge(motm.rating)
                        }
                        .padding(.horizontal, SabqLayout.space16).padding(.vertical, SabqLayout.space12)
                        .wcQuietBlock()
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, SabqLayout.space8)
                }
                ForEach(detail.ratings) { p in
                    WCRowSeparator()
                    Button { onOpenPlayer(p.id) } label: { playerRow(p) }
                        .buttonStyle(.plain)
                }
            }
        }
    }

    private func playerRow(_ p: WCPlayerRating) -> some View {
        let teamLogo = p.teamId == detail.fixture.home.id ? detail.fixture.home.logo : detail.fixture.away.logo
        return HStack(spacing: SabqLayout.space12) {
            if p.photo.isEmpty {
                Circle().fill(SabqTheme.surfaceMuted).frame(width: 32, height: 32)
            } else {
                WCRemoteImage(url: p.photo, contentMode: .fill).frame(width: 32, height: 32).clipShape(Circle())
            }
            VStack(alignment: .leading, spacing: 0) {
                Text("\(p.name)\(p.captain ? " (ك)" : "")").sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                Text(subtitle(p)).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
            }
            Spacer()
            WCRemoteImage(url: teamLogo).frame(width: 16, height: 16)
            ratingBadge(p.rating)
        }
        .padding(.vertical, SabqLayout.space8)
        .frame(minHeight: SabqLayout.touchTarget)
        .contentShape(Rectangle())
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
            .font(SabqFonts.app(size: 13, weight: .semibold).monospacedDigit())
            // رقم بلون الدرجة على سطح هادئ: الأبيض على الذهبي/الأخضر الفاتح لا يحقق التباين
            .foregroundStyle(ratingColor(rating))
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
            .background(RoundedRectangle(cornerRadius: SabqRadius.small).fill(SabqTheme.surfaceMuted))
            .environment(\.layoutDirection, .leftToRight)
    }

    private func ratingColor(_ r: Double) -> Color {
        if r >= 8 { return WCTheme.emeraldDeep }
        if r >= 7 { return SabqTheme.success }
        if r >= 6 { return SabqTheme.warning }
        return SabqTheme.danger
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
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            if let ft {
                VStack(spacing: SabqLayout.space12) {
                    bar("فوز \(detail.fixture.home.name)", ft.home, WCTheme.emeraldDeep)
                    bar("التعادل", ft.draw, SabqTheme.textSecondary)
                    bar("فوز \(detail.fixture.away.name)", ft.away, WCTheme.sky)
                }
            } else if loaded {
                Text("لا تتوفر توقعات لهذه المباراة")
                    .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space4)
            }

            if let f = forecast, f.available { forecastBlocks(f) }

            if hasAnyPrediction {
                Text("توقعات خوارزمية من مزود البيانات الرياضية — للاستئناس وليست ترجيحًا تحريريًا")
                    .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center)
            }

            WCRowSeparator()
            Text("سجل المواجهات").sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
            if detail.headToHead.isEmpty {
                Text("أول مواجهة رسمية بين المنتخبين — التاريخ يبدأ من هنا")
                    .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space8)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(detail.headToHead.enumerated()), id: \.element.id) { index, m in
                        if index > 0 { WCRowSeparator() }
                        h2hRow(m)
                    }
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
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            WCRowSeparator()
            Text("توقعات متقدّمة").sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)

            if let dc = f.doubleChance {
                VStack(alignment: .leading, spacing: 6) {
                    Text("الفرصة المزدوجة").font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textSecondary)
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
                    Text("مجموع الأهداف — أكثر/أقل من").font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textSecondary)
                    ForEach(f.goals) { ou in
                        HStack(spacing: 8) {
                            Text(String(format: "%g", ou.line))
                                .font(SabqFonts.app(size: 12, weight: .medium).monospacedDigit()).foregroundStyle(SabqTheme.textPrimary)
                                .frame(width: 32).environment(\.layoutDirection, .leftToRight)
                            twoWayBar(left: ou.over, right: ou.under)
                        }
                    }
                }
            }

            if !f.correctScores.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("أرجح النتائج (الرقم الأول للمضيف)").font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textSecondary)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(f.correctScores) { cs in
                                VStack(spacing: 2) {
                                    Text(cs.score)
                                        .font(SabqFonts.app(size: 15, weight: .semibold).monospacedDigit()).foregroundStyle(SabqTheme.textPrimary)
                                        .environment(\.layoutDirection, .leftToRight)
                                    Text(String(format: "%g%%", cs.prob))
                                        .font(SabqFonts.app(size: 12).monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                                }
                                .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space8)
                                .background(RoundedRectangle(cornerRadius: SabqRadius.small).fill(SabqTheme.surfaceMuted))
                            }
                        }
                    }
                }
            }
        }
    }

    private func dcCell(_ label: String, _ value: Int) -> some View {
        VStack(spacing: SabqLayout.space4) {
            Text("\(value)%").font(SabqFonts.app(size: 16, weight: .semibold).monospacedDigit()).foregroundStyle(SabqTheme.textPrimary)
            Text(label).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center).lineLimit(2)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: SabqRadius.small).fill(SabqTheme.surfaceMuted))
    }

    private func twoWay(_ title: String, leftLabel: String, left: Int, rightLabel: String, right: Int) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textSecondary)
            twoWayBar(left: left, right: right)
            HStack {
                Text("\(leftLabel) \(left)%").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textPrimary)
                Spacer()
                Text("\(rightLabel) \(right)%").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textPrimary)
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
                Text(label).font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textPrimary)
                Spacer()
                Text("\(value)%").font(SabqFonts.app(size: 12, weight: .regular)).foregroundStyle(SabqTheme.textPrimary)
            }
            GeometryReader { geo in
                Capsule().fill(color).frame(width: geo.size.width * CGFloat(value) / 100)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: 8)
            .background(Capsule().fill(SabqTheme.surfaceMuted))
        }
    }

    private func h2hRow(_ m: WCFixture) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Text(String(m.date.prefix(4)))
                .font(SabqFonts.app(size: 12, weight: .medium).monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                .background(Capsule().fill(SabqTheme.surfaceMuted))
                .environment(\.layoutDirection, .leftToRight)
            Text(m.home.name).font(SabqFonts.app(size: 15)).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
            // اسم المضيف على اليمين — الضيف أولًا داخل LTR
            Text("\(m.goals.away ?? 0) - \(m.goals.home ?? 0)")
                .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
                .environment(\.layoutDirection, .leftToRight)
            Text(m.away.name).font(SabqFonts.app(size: 15)).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
            Spacer()
        }
        .padding(.vertical, SabqLayout.space12)
    }
}

// MARK: - قنوات البث (شريط أعلى مركز المباراة)

struct WCTvStrip: View {
    let fixtureId: Int
    @State private var channels: [WCTvChannel] = []
    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.frame(width: 0, height: 0)
            if !channels.isEmpty {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "tv.fill").font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.emeraldDeep)
                            .accessibilityHidden(true)
                        Text("القنوات الناقلة").sabqText(SabqType.tag).foregroundStyle(WCTheme.emeraldDeep)
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: SabqLayout.space8) {
                            ForEach(channels) { ch in
                                chip(ch)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .task(id: fixtureId) {
            if let r = try? await APIClient.shared.fetchWorldCupTv(fixtureId: fixtureId), r.available {
                await MainActor.run { channels = r.channels }
            }
        }
    }

    @ViewBuilder private func chip(_ ch: WCTvChannel) -> some View {
        let content = HStack(spacing: SabqLayout.space8) {
            if let logo = ch.logo, !logo.isEmpty {
                WCRemoteImage(url: logo).frame(width: 18, height: 18)
            } else {
                Image(systemName: "play.tv").font(.system(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            }
            Text(ch.name).font(SabqFonts.app(size: 12, weight: .regular)).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
            if let c = ch.country, !c.isEmpty {
                Text(c).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
            }
        }
        .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space8)
        .frame(minHeight: SabqLayout.touchTarget)
        .background(Capsule().fill(SabqTheme.surfaceMuted))

        if let urlString = ch.url, let url = URL(string: urlString) {
            Button { openURL(url) } label: { content }.buttonStyle(.plain)
        } else {
            content
        }
    }
}

// MARK: - التعليق الحي (/world-cup/commentary/:id)
//
// تعليق نصّي أحدثُه بالأعلى، يتجدّد كل ١٥ث أثناء البث. الأهداف واللحظات
// المهمّة مُبرَزة بلون العلامة وأيقونة.

struct WCCommentaryView: View {
    let fixtureId: Int
    let live: Bool
    @State private var data: WCCommentary?

    private var items: [WCCommentaryItem] {
        (data?.items ?? []).sorted { $0.order > $1.order }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if items.isEmpty {
                emptyText("التعليق الحي يبدأ مع صافرة الانطلاق")
            } else {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { WCRowSeparator() }
                    row(item)
                }
            }
        }
        // الهوية تشمل live: من فتح المركز قبل الصافرة كانت الحلقة تخرج نهائيًا
        // بعد أول جلبة (غير حيّة) ولا يبدأ التعليق أبدًا؛ الآن انقلاب live من
        // الأب (الذي يستطلع حول الانطلاق) يعيد تشغيل الحلقة.
        .task(id: "\(fixtureId)-\(live)") { await loop() }
    }

    private func row(_ item: WCCommentaryItem) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space8) {
            Text(item.minuteLabel)
                .font(SabqFonts.app(size: 12, weight: .medium).monospacedDigit())
                .foregroundStyle(item.goal ? WCTheme.emeraldDeep : SabqTheme.textSecondary)
                .frame(minWidth: 40, alignment: .leading)
                .environment(\.layoutDirection, .leftToRight)
            if item.goal {
                Image(systemName: "soccerball").font(SabqFonts.app(size: 13)).foregroundStyle(WCTheme.emeraldDeep)
            } else if item.important {
                Image(systemName: "star.fill").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.warning)
            }
            Text(item.textAr.isEmpty ? item.textEn : item.textAr)
                .font(SabqFonts.app(size: 15, weight: item.goal || item.important ? .semibold : .regular))
                .lineSpacing(SabqType.excerpt.lineSpacing)
                .foregroundStyle(SabqTheme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
            Spacer(minLength: 0)
        }
        // صف غير مؤطّر؛ الهدف يُبرَز بشريط رفيع بلون الهوية لا بتعبئة ملوّنة
        .padding(.vertical, SabqLayout.space12)
        .padding(.leading, item.goal ? SabqLayout.space8 : 0)
        .background(alignment: .leading) {
            if item.goal {
                Capsule().fill(WCTheme.emeraldDeep).frame(width: 3)
                    .padding(.vertical, SabqLayout.space8)
            }
        }
    }

    private func loop() async {
        while !Task.isCancelled {
            if let r = try? await APIClient.shared.fetchWorldCupCommentary(fixtureId: fixtureId, ignoreCache: live), r.available {
                await MainActor.run { data = r }
            }
            let isLive = data?.live ?? live
            if !isLive { return }   // مباراة منتهية/لم تبدأ — لا داعي للاستطلاع
            try? await Task.sleep(nanoseconds: 15_000_000_000)
        }
    }
}

// MARK: - الزخم/الاستحواذ (/world-cup/momentum/:id)

struct WCMomentumView: View {
    let fixtureId: Int
    let live: Bool
    let homeName: String
    let awayName: String
    @State private var data: WCMomentum?

    var body: some View {
        VStack(spacing: SabqLayout.space16) {
            if let d = data, (d.possession != nil || !d.points.isEmpty) {
                if let pos = d.possession { possessionBar(pos) }
                if !d.points.isEmpty {
                    Text("الزخم الهجومي عبر دقائق المباراة — أعلى: \(homeName) · أسفل: \(awayName)")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                        .multilineTextAlignment(.center)
                    chart(d.points)
                }
            } else {
                emptyText("مؤشّر الزخم والاستحواذ يظهر هنا أثناء المباراة")
            }
        }
        .task(id: fixtureId) {
            if let r = try? await APIClient.shared.fetchWorldCupMomentum(fixtureId: fixtureId, ignoreCache: live), r.available {
                await MainActor.run { data = r }
            }
        }
    }

    private func possessionBar(_ pos: WCPossession) -> some View {
        let total = CGFloat(max(1, pos.home + pos.away))
        return VStack(spacing: SabqLayout.space8) {
            HStack {
                Text("\(homeName) \(pos.home)%")
                    .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textPrimary)
                Spacer()
                Text("الاستحواذ").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                Spacer()
                Text("\(awayName) \(pos.away)%")
                    .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textPrimary)
            }
            // RTL: المضيف (زمردي) يمينًا، الضيف (سماوي) يسارًا
            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle().fill(WCTheme.emeraldDeep).frame(width: geo.size.width * CGFloat(pos.home) / total)
                    Rectangle().fill(WCTheme.sky)
                }
            }
            .frame(height: 10)
            .clipShape(Capsule())
        }
        .padding(SabqLayout.space12)
        .wcQuietBlock()
    }

    private func chart(_ points: [WCMomentumPoint]) -> some View {
        Chart(points) { p in
            BarMark(
                x: .value("الدقيقة", p.minute),
                y: .value("الزخم", p.net)
            )
            .foregroundStyle(p.net >= 0 ? WCTheme.emeraldDeep : WCTheme.sky)
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 6)) { value in
                AxisValueLabel {
                    if let m = value.as(Int.self) {
                        Text("\(m)'").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    }
                }
            }
        }
        .chartYAxis(.hidden)
        .frame(height: 180)
        .environment(\.layoutDirection, .leftToRight)
    }
}

// MARK: - مساعد مشترك

@ViewBuilder
func emptyText(_ message: String) -> some View {
    Text(message)
        .sabqText(SabqType.meta)
        .foregroundStyle(SabqTheme.textSecondary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space32)
}
