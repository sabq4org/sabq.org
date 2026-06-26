import SwiftUI

// مركز المباراة — يُفتح كـ sheet عند الضغط على أي بطاقة مباراة. ترويسة «ملعب»
// خضراء (الفريقان + النتيجة/التوقيت + الحالة + البطولة + الملعب)، ثم تبويبات:
// الأحداث · الإحصاءات · التشكيلة (تُخفى الفارغة). يبدأ بمعاينة فورية من البطاقة
// ثم يثري بالتفاصيل الكاملة من /sports/match/:id. نصوص الترويسة بيضاء على الأخضر.
struct SpMatchCenter: View {
    let fixtureId: Int
    /// معاينة من بطاقة المباراة لعرض الترويسة فورًا قبل اكتمال التحميل.
    var preview: SpFixture?

    @Environment(\.dismiss) private var dismiss
    @Environment(SpAuthStore.self) private var auth
    @Environment(SpMatchFollows.self) private var matchFollows
    @Environment(SpLiveActivityManager.self) private var liveActivity
    @State private var detail: SpMatchDetail?
    @State private var loading = true
    @State private var loadError: String?
    @State private var segment: Segment = .events
    @State private var selectedTeam: IDBox?

    // التوقّع (للمباريات القادمة، للأعضاء)
    @State private var predHome = 0
    @State private var predAway = 0
    @State private var myPrediction: SpPrediction?
    @State private var predicting = false
    @State private var predictError: String?

    // إثراء SportMonks (أفضل جهد) — يُفعّل تبويب «التحليل» عند توفّره.
    @State private var xg: SpXg?
    @State private var momentum: SpMomentum?
    @State private var pressure: SpPressure?
    @State private var facts: SpMatchFacts?

    // إثراء (المرحلة 1): تقييمات + مواجهات
    @State private var ratings: SpMatchPlayers?
    @State private var h2h: SpH2HResponse?
    @State private var selectedPlayer: IDBox?

    // إثراء (المرحلة 2): التعليق اللحظي المُعرَّب
    @State private var commentary: SpCommentary?

    private enum Segment: String, CaseIterable {
        case events, commentary, analysis, ratings, lineups, stats, h2h
        var label: String {
            switch self {
            case .events: return "الأحداث"
            case .commentary: return "التعليق"
            case .analysis: return "التحليل"
            case .ratings: return "التقييمات"
            case .lineups: return "التشكيلة"
            case .stats: return "الإحصاءات"
            case .h2h: return "المواجهات"
            }
        }
    }

    private var hasAnalysis: Bool {
        (xg?.available ?? false) || (momentum?.available ?? false)
            || (pressure?.available ?? false) || (facts?.available ?? false)
    }

    /// المباراة المعروضة: التفاصيل إن وصلت، وإلا المعاينة الفورية.
    private var fixture: SpFixture? { detail?.fixture ?? preview }

    /// عنوان المشاركة الاجتماعية — الفريقان + النتيجة/الموعد + البطولة عبر سبق الرياضي.
    private var shareTitle: String {
        guard let f = fixture else { return "مباراة عبر سبق الرياضي" }
        let middle: String
        if f.started {
            middle = "\(f.goals.home ?? 0) - \(f.goals.away ?? 0)"
        } else {
            middle = "×"
        }
        let comp = f.competition?.isEmpty == false ? f.competition! : "دوري روشن"
        return "\(f.home.name) \(middle) \(f.away.name) — \(comp) · عبر سبق الرياضي"
    }

    private var hasRatings: Bool { (ratings?.players.contains { ($0.rating ?? 0) > 0 }) ?? false }
    private var hasH2H: Bool { !(h2h?.meetings.isEmpty ?? true) }
    private var hasCommentary: Bool { !(commentary?.items.isEmpty ?? true) }

    private var segments: [Segment] {
        guard let d = detail else { return [] }
        var s: [Segment] = []
        if !d.events.isEmpty { s.append(.events) }
        if hasCommentary { s.append(.commentary) }
        if hasAnalysis { s.append(.analysis) }
        if hasRatings { s.append(.ratings) }
        if !d.lineups.isEmpty { s.append(.lineups) }
        if let st = d.statistics, !st.rows.isEmpty { s.append(.stats) }
        if hasH2H { s.append(.h2h) }
        return s
    }

    /// إن لم يكن القسم المختار متاحًا، نعرض أول متاح.
    private var effectiveSegment: Segment {
        segments.contains(segment) ? segment : (segments.first ?? .events)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                if let f = fixture { header(f) }

                preMatchCard

                if loading && detail == nil {
                    SpLoading()
                } else if let loadError, detail == nil {
                    SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: loadError)
                } else if let d = detail {
                    content(d)
                }
            }
            .padding(.vertical, 8)
            .padding(.bottom, 24)
        }
        .background(SpAmbientBackground())
        .navigationTitle("مركز المباراة")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let f = fixture {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        matchFollows.toggle(f)
                    } label: {
                        let following = matchFollows.isFollowing(f.id)
                        Image(systemName: following ? "star.fill" : "star")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(following ? SpTheme.gold : SpTheme.green)
                    }
                }
                // متابعة لحظية على شاشة القفل (Live Activity) — للمباريات الجارية فقط.
                if f.status.live && liveActivity.isSupported {
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            liveActivity.toggle(for: f)
                        } label: {
                            let on = liveActivity.isActive(f.id)
                            Image(systemName: on ? "lock.iphone" : "platter.filled.bottom.iphone")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(on ? SpTheme.green : SpTheme.onDarkDim)
                        }
                    }
                }
            }
            if let url = URLConstants.matchShareURL(fixtureId) {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: url, subject: Text(shareTitle), message: Text(shareTitle)) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(SpTheme.green)
                    }
                }
            }
        }
        .task { await load() }
        .navigationDestination(item: $selectedTeam) { box in SpTeamPage(teamId: box.id) }
        .navigationDestination(item: $selectedPlayer) { box in SpPlayerPage(playerId: box.id) }
    }

    // MARK: - الترويسة (مسطّحة بلا إطار — كمرجع كأس العالم)

    private func header(_ f: SpFixture) -> some View {
        VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                teamColumn(f.home)
                centerColumn(f)
                teamColumn(f.away)
            }
            let meta = headerMeta(f)
            if !meta.isEmpty {
                Text(meta)
                    .font(SportsFonts.app(size: 11))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    private func headerMeta(_ f: SpFixture) -> String {
        let comp = (f.competition?.isEmpty == false) ? f.competition! : f.round
        var parts: [String] = []
        if !comp.isEmpty { parts.append(comp) }
        if !f.round.isEmpty, f.round != comp { parts.append(f.round) }
        let day = SpFormat.kickoffDay(f.date)
        if !day.isEmpty { parts.append(day) }
        return parts.joined(separator: " · ")
    }

    private func teamColumn(_ t: SpTeam) -> some View {
        Button { selectedTeam = IDBox(id: t.id) } label: {
            VStack(spacing: 8) {
                SpTeamLogo(logo: t.logo, size: 58)
                Text(t.name)
                    .font(SportsFonts.app(size: 14, weight: .heavy))
                    .foregroundStyle(SpTheme.onDark)
                    .multilineTextAlignment(.center)
                    .lineLimit(2).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(SpPressStyle())
    }

    private func centerColumn(_ f: SpFixture) -> some View {
        VStack(spacing: 6) {
            if f.started {
                Text("\(f.goals.away ?? 0) - \(f.goals.home ?? 0)")
                    .font(SportsFonts.app(size: 38, weight: .heavy))
                    .foregroundStyle(SpTheme.onDarkStrong)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text(SpFormat.kickoffTime(f.date))
                    .font(SportsFonts.app(size: 28, weight: .heavy))
                    .foregroundStyle(SpTheme.green)
                    .environment(\.layoutDirection, .leftToRight)
            }
            SpStatusPill(fixture: f)
        }
        .frame(minWidth: 96)
    }

    // MARK: - ما قبل المباراة (للمباريات القادمة) — عدّاد تنازلي + الموعد
    //
    // يستكمل مركز المباراة القادمة كبقية المباريات: بطاقة «الوقت المتبقّي» بحبّات
    // يوم/ساعة/دقيقة/ثانية حيّة + سطر الموعد، بجانب تبويبات المواجهات/التحليل.

    @ViewBuilder private var preMatchCard: some View {
        if let f = fixture, !f.started {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    Image(systemName: "hourglass")
                        .font(.system(size: 14, weight: .bold)).foregroundStyle(SpTheme.green)
                    Text("الوقت المتبقّي على المباراة")
                        .font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark)
                    Spacer(minLength: 0)
                }
                SpCountdownChips(timestampMs: f.timestamp * 1000)
                    .frame(maxWidth: .infinity, alignment: .center)
                let when = headerMeta(f)
                if !when.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: "calendar")
                            .font(.system(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                        Text("\(when) · \(SpFormat.kickoffTime(f.date))")
                            .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
                    .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
                    .shadow(color: SpTheme.cardShadow, radius: 10, x: 0, y: 6)
            )
            .padding(.horizontal, 16)
        }
    }

    // MARK: - التوقّع (مُعطّل مؤقتًا — النظام غير مكتمل؛ يُعاد تفعيله لاحقًا)

    @ViewBuilder private var predictCard: some View {
        if let f = fixture, !f.started, auth.isLoggedIn {
            VStack(spacing: 14) {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles").font(.system(size: 14, weight: .bold)).foregroundStyle(SpTheme.green)
                    Text(myPrediction == nil ? "توقّع النتيجة" : "توقّعك")
                        .font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark)
                    Spacer(minLength: 0)
                    Text("٣ نقاط للمطابقة").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint)
                }
                HStack(alignment: .top, spacing: 8) {
                    scoreStepper(f.home, value: $predHome)
                    Text("-").font(SportsFonts.app(size: 22, weight: .heavy))
                        .foregroundStyle(SpTheme.onDarkFaint).padding(.top, 52)
                    scoreStepper(f.away, value: $predAway)
                }
                Button { Task { await submit(f) } } label: {
                    HStack(spacing: 8) {
                        if predicting { ProgressView().tint(.white) }
                        Text(myPrediction == nil ? "احفظ توقّعي" : "تعديل التوقّع")
                            .font(SportsFonts.app(size: 15, weight: .bold))
                    }
                    .foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 46)
                    .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous).fill(SpTheme.green))
                }
                .buttonStyle(.plain).disabled(predicting)
                if let predictError {
                    Text(predictError).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.crimson)
                } else if myPrediction != nil {
                    Text("يمكنك التعديل حتى انطلاق المباراة")
                        .font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
                    .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.green.opacity(0.30), lineWidth: 1))
                    .shadow(color: SpTheme.cardShadow, radius: 10, x: 0, y: 6)
            )
            .padding(.horizontal, 16)
        }
    }

    private func scoreStepper(_ team: SpTeam, value: Binding<Int>) -> some View {
        VStack(spacing: 8) {
            SpTeamLogo(logo: team.logo, size: 44)
            Text(team.name)
                .font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.8).frame(maxWidth: .infinity)
            HStack(spacing: 14) {
                stepButton("minus") { if value.wrappedValue > 0 { value.wrappedValue -= 1 } }
                Text("\(value.wrappedValue)")
                    .font(SportsFonts.app(size: 24, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                    .frame(minWidth: 30).monospacedDigit()
                stepButton("plus") { if value.wrappedValue < 20 { value.wrappedValue += 1 } }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func stepButton(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold)).foregroundStyle(SpTheme.green)
                .frame(width: 32, height: 32).background(Circle().fill(SpTheme.green.opacity(0.12)))
        }
        .buttonStyle(.plain)
    }

    private func submit(_ f: SpFixture) async {
        predicting = true; predictError = nil
        let body = SpPredictBody(
            predHome: predHome, predAway: predAway, kickoffTs: f.timestamp,
            competitionSlug: f.competitionSlug, homeId: f.home.id, awayId: f.away.id,
            homeName: f.home.name, awayName: f.away.name, homeLogo: f.home.logo, awayLogo: f.away.logo
        )
        do {
            myPrediction = try await APIClient.shared.submitPrediction(body, matchId: f.id)
        } catch {
            predictError = (error as? APIError)?.errorDescription ?? "تعذّر حفظ التوقّع"
        }
        predicting = false
    }

    // MARK: - المحتوى (تبويبات)

    @ViewBuilder private func content(_ d: SpMatchDetail) -> some View {
        if segments.isEmpty {
            SpEmptyState(icon: "hourglass",
                         title: "لا تفاصيل بعد",
                         subtitle: "ستظهر الأحداث والإحصاءات والتشكيلة فور توفّرها")
                .padding(.horizontal, 16)
        } else {
            VStack(spacing: 18) {
                if segments.count > 1 { tabBar }

                switch effectiveSegment {
                case .events: eventsView(d)
                case .commentary: commentaryView
                case .analysis: analysisView
                case .ratings: ratingsView
                case .lineups: lineupsView(d.lineups)
                case .stats: if let s = d.statistics { statsView(s) }
                case .h2h: h2hView
                }
            }
        }
    }

    // شريط تابات على شكل حبوب أفقية قابلة للتمرير — كمرجع كأس العالم.
    private var tabBar: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(segments, id: \.self) { s in
                        let active = effectiveSegment == s
                        Button { withAnimation(.easeOut(duration: 0.2)) { segment = s } } label: {
                            Text(s.label)
                                .font(SportsFonts.app(size: 13, weight: .semibold))
                                .foregroundStyle(active ? .white : SpTheme.onDarkDim)
                                .padding(.horizontal, 14).padding(.vertical, 8)
                                .background(Capsule().fill(active ? SpTheme.green : SpTheme.chipFill))
                        }
                        .buttonStyle(.plain)
                        .id(s)
                    }
                }
                .padding(.horizontal, 16)
            }
            .onChange(of: effectiveSegment) { _, s in
                withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(s, anchor: .center) }
            }
        }
    }

    // MARK: - الأحداث (خطّ زمني مرئي ثنائي المحور — كتصميم الويب)
    //
    // محور أخضر مركزي تتدلّى منه شارات الدقائق؛ كل حدث بطاقة بيضاء على جهة فريقه
    // (المضيف يمينًا، الضيف يسارًا) بأيقونة عند حافة المحور. الترتيب تنازليّ (الأحدث
    // أعلى)، ويُحقن فاصل «نتيجة الشوط الأول» عند حدّ الدقيقة 45. التخطيط مُثبَّت LTR
    // داخليًّا لضمان «اليمين يمين واليسار يسار» بصرف النظر عن RTL، مع إبقاء النصّ عربيًّا.

    private func eventsView(_ d: SpMatchDetail) -> some View {
        let homeId = d.fixture.home.id
        let items = timelineItems(d.events, homeId: homeId)
        return VStack(spacing: 14) {
            matchTimelineBar(d)
            eventsTeamsHeader(d.fixture)

            ZStack {
                // المحور الأخضر المركزي (تغطّيه شارات الدقائق فتبدو متّصلة).
                HStack(spacing: 0) {
                    Spacer(minLength: 0)
                    Capsule().fill(SpTheme.green.opacity(0.28)).frame(width: 2)
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 10)

                VStack(spacing: 12) {
                    ForEach(items) { item in
                        switch item {
                        case .event(let e): timelineRow(e, homeId: homeId)
                        case .halftime(let h, let a): halftimeMarker(home: h, away: a)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    // MARK: - خطّ زمن المباراة (شريط أفقي يلخّص الأهداف والكروت)
    //
    // محور أفقي: الدقيقة 0 يمينًا (RTL يدوي)، المضيف فوق المحور والضيف تحته.
    // الأهداف كرة خضراء، الكرت الأصفر/الأحمر مستطيل ملوّن — كتبويب الأحداث في الويب.

    private let barHeight: CGFloat = 96
    private let barAxisY: CGFloat = 42
    private let barTopRowY: CGFloat = 20
    private let barBottomRowY: CGFloat = 64
    private let barInset: CGFloat = 16

    @ViewBuilder private func matchTimelineBar(_ d: SpMatchDetail) -> some View {
        let evs = d.events.filter { $0.type == "goal" || $0.type == "yellow-card" || $0.type == "red-card" }
        if !evs.isEmpty {
            let homeId = d.fixture.home.id
            let maxMin = barMaxMinute(d.events)
            let marks: [Int] = maxMin > 95 ? [0, 45, 90, maxMin] : [0, 45, 90]
            VStack(alignment: .leading, spacing: 10) {
                Text("خطّ زمن المباراة")
                    .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)

                GeometryReader { geo in
                    let w = geo.size.width
                    ZStack(alignment: .topLeading) {
                        Rectangle().fill(SpTheme.green.opacity(0.22))
                            .frame(width: w - barInset * 2, height: 2)
                            .position(x: w / 2, y: barAxisY)
                        ForEach(marks, id: \.self) { m in
                            let x = barX(m, maxMin: maxMin, width: w)
                            Rectangle().fill(SpTheme.green.opacity(0.12))
                                .frame(width: 1, height: barHeight - 22)
                                .position(x: x, y: (barHeight - 22) / 2)
                            Text("\(m)'")
                                .font(SportsFonts.app(size: 8).monospacedDigit())
                                .foregroundStyle(SpTheme.onDarkFaint)
                                .position(x: x, y: barHeight - 6)
                        }
                        ForEach(evs) { ev in
                            let isHome = ev.teamId == homeId
                            let x = barX((ev.minute ?? 0) + (ev.extra ?? 0), maxMin: maxMin, width: w)
                            VStack(spacing: 1) {
                                if isHome { barMinuteTiny(ev); barMarker(ev) }
                                else { barMarker(ev); barMinuteTiny(ev) }
                            }
                            .position(x: x, y: isHome ? barTopRowY : barBottomRowY)
                        }
                    }
                    .frame(width: w, height: barHeight)
                    .environment(\.layoutDirection, .leftToRight)
                }
                .frame(height: barHeight)

                HStack(spacing: 10) {
                    HStack(spacing: 5) {
                        Circle().fill(SpTheme.green).frame(width: 7, height: 7)
                        Text("\(d.fixture.home.name) · أعلى")
                            .font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    HStack(spacing: 5) {
                        Text("\(d.fixture.away.name) · أسفل")
                            .font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                        Circle().fill(SpTheme.gold).frame(width: 7, height: 7)
                    }
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
                    .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            )
        }
    }

    private func barMaxMinute(_ events: [SpMatchEvent]) -> Int {
        max(90, events.map { ($0.minute ?? 0) + ($0.extra ?? 0) }.max() ?? 90)
    }

    /// إحداثي أفقي بـRTL يدوي: الدقيقة 0 يمينًا، الأكبر يسارًا (داخل هوامش barInset).
    private func barX(_ minute: Int, maxMin: Int, width w: CGFloat) -> CGFloat {
        let f = min(max(CGFloat(minute) / CGFloat(maxMin), 0), 1)
        let usable = max(w - barInset * 2, 1)
        return barInset + usable * (1 - f)
    }

    private func barMinuteTiny(_ ev: SpMatchEvent) -> some View {
        Text(pillMinute(ev))
            .font(SportsFonts.app(size: 8, weight: .semibold).monospacedDigit())
            .foregroundStyle(SpTheme.onDarkFaint)
            .environment(\.layoutDirection, .leftToRight)
    }

    @ViewBuilder private func barMarker(_ ev: SpMatchEvent) -> some View {
        switch ev.type {
        case "goal":
            Image(systemName: "soccerball")
                .font(.system(size: 12))
                .foregroundStyle(SpTheme.green)
                .padding(3)
                .background(Circle().fill(.white))
                .overlay(Circle().stroke(SpTheme.green.opacity(0.6), lineWidth: 1.5))
        case "yellow-card":
            RoundedRectangle(cornerRadius: 2).fill(Color(red: 0.95, green: 0.76, blue: 0.22)).frame(width: 9, height: 13)
        case "red-card":
            RoundedRectangle(cornerRadius: 2).fill(SpTheme.crimson).frame(width: 9, height: 13)
        default:
            EmptyView()
        }
    }

    // رأس الفريقين فوق الخطّ الزمني: الضيف يسارًا، المضيف يمينًا.
    private func eventsTeamsHeader(_ f: SpFixture) -> some View {
        HStack(spacing: 10) {
            teamMini(f.away, logoLeading: true)
            Spacer(minLength: 0)
            teamMini(f.home, logoLeading: false)
        }
        .environment(\.layoutDirection, .leftToRight)
        .padding(.bottom, 2)
    }

    private func teamMini(_ t: SpTeam, logoLeading: Bool) -> some View {
        HStack(spacing: 7) {
            if logoLeading { SpTeamLogo(logo: t.logo, size: 24) }
            Text(t.name)
                .font(SportsFonts.app(size: 13, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.8)
            if !logoLeading { SpTeamLogo(logo: t.logo, size: 24) }
        }
    }

    // صفّ حدث واحد: شارة الدقيقة **في الوسط دائمًا** وبطاقة الحدث على جهة فريقها.
    // نستخدم `Spacer(minLength: 0)` في كل جهة كي تتمدّد لنصف العرض بالكامل حتى لو خَلَت
    // من بطاقة — فتبقى الكبسولة المركزية مُتمركزة تمامًا (نظير `grid-cols-[1fr_auto_1fr]`).
    private func timelineRow(_ e: SpMatchEvent, homeId: Int) -> some View {
        let isHome = e.teamId == homeId
        return HStack(spacing: 8) {
            HStack(spacing: 0) {                       // الجهة اليسرى (الضيف)
                Spacer(minLength: 0)
                if !isHome { eventCard(e, isHome: false) }
            }
            .frame(maxWidth: .infinity)

            minutePill(e)                              // الوسط — ثابت

            HStack(spacing: 0) {                       // الجهة اليمنى (المضيف)
                if isHome { eventCard(e, isHome: true) }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity)
        }
        .environment(\.layoutDirection, .leftToRight)
    }

    // ألوان أيقونات الأحداث — مطابقة لمركز المباراة في سبق الويب (كأس العالم):
    // تبديل أزرق سماوي (sky-500)، الفار بنفسجي (purple-500).
    private let subSky = Color(red: 0.055, green: 0.647, blue: 0.914)
    private let varPurple = Color(red: 0.659, green: 0.333, blue: 0.969)

    // بطاقة حدث مدمجة (بحجم محتواها) تُلاصق العمود المركزي — كـ TimelineChip في الويب.
    private func eventCard(_ e: SpMatchEvent, isHome: Bool) -> some View {
        let isGoal = e.type == "goal"
        let title = e.player.isEmpty ? e.label : e.player
        let typeLine = goalTypeLine(e)        // سطر نوع الهدف بالأخضر (ركلة جزاء/عكسي…)
        let detailLine = detailSubtitle(e)    // «بديلًا عن:» / «صناعة:» / وصف البطاقة

        let text = VStack(alignment: .trailing, spacing: 1) {
            Text(title)
                .font(SportsFonts.app(size: 12.5, weight: .bold))
                .foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.75)
            if let typeLine {
                Text(typeLine)
                    .font(SportsFonts.app(size: 10))
                    .foregroundStyle(SpTheme.green)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            if let detailLine {
                Text(detailLine)
                    .font(SportsFonts.app(size: 10))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
        }
        .frame(maxWidth: 150, alignment: .trailing)   // يهبط لحجم المحتوى، ويقتطع الطويل
        .multilineTextAlignment(.trailing)

        return HStack(alignment: .top, spacing: 7) {
            if isHome {            // المضيف يمينًا: الأيقونة عند الحافة الداخلية (يسار البطاقة)
                eventBadge(e)
                text
            } else {               // الضيف يسارًا: الأيقونة عند الحافة الداخلية (يمين البطاقة)
                text
                eventBadge(e)
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(isGoal ? SpTheme.green.opacity(0.10) : SpTheme.chipFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(isGoal ? SpTheme.green.opacity(0.25) : Color.clear, lineWidth: 1)
        )
    }

    // شارة الدقيقة الخضراء (كبسولة) على المحور — كالويب (rounded-full bg-emerald-600).
    private func minutePill(_ e: SpMatchEvent) -> some View {
        Text(pillMinute(e))
            .font(SportsFonts.app(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .monospacedDigit()
            .padding(.horizontal, 8).padding(.vertical, 3)
            .frame(minWidth: 40)
            .background(Capsule().fill(SpTheme.green))
            .environment(\.layoutDirection, .leftToRight)
            .fixedSize()
    }

    // فاصل «نتيجة الشوط الأول H - A» يغطّي المحور في موضع الدقيقة 45.
    private func halftimeMarker(home: Int, away: Int) -> some View {
        HStack(spacing: 7) {
            Text("نتيجة الشوط الأول")
                .font(SportsFonts.app(size: 11, weight: .bold))
                .foregroundStyle(SpTheme.onDarkDim)
            Text("\(away) - \(home)")
                .font(SportsFonts.app(size: 12, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(Capsule().fill(SpTheme.chipFill))
        .overlay(Capsule().stroke(SpTheme.cardStroke, lineWidth: 1))
        .frame(maxWidth: .infinity)
    }

    // أيقونة الحدث المسطّحة الملوّنة (بلا دائرة) محاذاةً للأعلى — مطابقة لـ EventIcon في الويب:
    // هدف أخضر · إهدار جزاء درع أحمر · بطاقة مربّع أصفر/أحمر · تبديل سهمان أزرقان · فار شاشة بنفسجية.
    @ViewBuilder private func eventBadge(_ e: SpMatchEvent) -> some View {
        Group {
            switch e.type {
            case "goal":
                Image(systemName: "soccerball").foregroundStyle(SpTheme.green)
            case "missed-penalty":
                Image(systemName: "exclamationmark.shield.fill").foregroundStyle(SpTheme.crimson)
            case "var":
                Image(systemName: "play.tv.fill").foregroundStyle(varPurple)
            case "yellow-card":
                cardChip(Color(red: 0.95, green: 0.76, blue: 0.22))
            case "red-card":
                cardChip(SpTheme.crimson)
            case "substitution":
                Image(systemName: "arrow.left.arrow.right").foregroundStyle(subSky)
            default:
                Image(systemName: "dot.radiowaves.left.and.right").foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .font(.system(size: 15, weight: .bold))
        .frame(width: 18, height: 18)
        .padding(.top, 1)
    }

    private func cardChip(_ color: Color) -> some View {
        RoundedRectangle(cornerRadius: 2.5, style: .continuous)
            .fill(color)
            .frame(width: 11, height: 15)
            .frame(width: 18, height: 18)
    }

    // MARK: - مساعدات الخطّ الزمني

    private func eff(_ e: SpMatchEvent) -> Double {
        Double(e.minute ?? 0) + Double(e.extra ?? 0) / 100.0
    }

    private func isFirstHalf(_ e: SpMatchEvent) -> Bool { (e.minute ?? 0) <= 45 }

    private func pillMinute(_ e: SpMatchEvent) -> String {
        guard let m = e.minute else { return "—" }
        if let x = e.extra, x > 0 { return "\(m)'+\(x)" }
        return "\(m)'"
    }

    // سطر نوع الهدف بالأخضر: يُعرض فقط لِما يحمل معلومة إضافية (ركلة جزاء/عكسي/رأسية…)
    // لا نكرّر «هدف» العام تحت اسم المسجّل.
    private func goalTypeLine(_ e: SpMatchEvent) -> String? {
        guard e.type == "goal" else { return nil }
        let l = e.label
        guard !l.isEmpty, l != "هدف", l != e.player else { return nil }
        return l
    }

    // السطر الرمادي السفلي: «بديلًا عن:» للتبديل، «صناعة:» للهدف، وصف البطاقة/الفار للبقية.
    private func detailSubtitle(_ e: SpMatchEvent) -> String? {
        switch e.type {
        case "substitution":
            if let a = e.assist, !a.isEmpty { return "بديلًا عن: \(a)" }
            return nil
        case "goal":
            if let a = e.assist, !a.isEmpty { return "صناعة: \(a)" }
            return nil
        default:
            if !e.label.isEmpty, e.label != e.player { return e.label }
            return nil
        }
    }

    /// نتيجة الشوط الأول من أحداث الأهداف حتى الدقيقة 45 (الهدف العكسي يُحتسب للخصم).
    private func halftimeScore(_ events: [SpMatchEvent], homeId: Int) -> (Int, Int) {
        var home = 0, away = 0
        for e in events where e.type == "goal" && isFirstHalf(e) {
            let ownGoal = e.label.contains("عكسي")
            let scoredByHome = (e.teamId == homeId)
            let creditHome = ownGoal ? !scoredByHome : scoredByHome
            if creditHome { home += 1 } else { away += 1 }
        }
        return (home, away)
    }

    private func timelineItems(_ events: [SpMatchEvent], homeId: Int) -> [SpTimelineItem] {
        let sorted = events.sorted { eff($0) > eff($1) }
        let secondHalfReached = sorted.contains { !isFirstHalf($0) }
            || (fixture?.status.finished ?? false)
            || ((fixture?.status.elapsed ?? 0) > 45)
        let ht = halftimeScore(events, homeId: homeId)
        var items: [SpTimelineItem] = []
        var inserted = false
        for e in sorted {
            if secondHalfReached, !inserted, isFirstHalf(e) {
                items.append(.halftime(home: ht.0, away: ht.1))
                inserted = true
            }
            items.append(.event(e))
        }
        if secondHalfReached, !inserted {
            items.append(.halftime(home: ht.0, away: ht.1))
        }
        return items
    }

    // MARK: - التعليق اللحظي (أبرز اللحظات المُعرَّبة — كتبويب الويب)
    //
    // قائمة عمودية: شارة الدقيقة (يمين) + أيقونة نوع اللحظة + النصّ العربي. اللحظات
    // المهمّة (هدف/important) تُبرز بخلفية خضراء خفيفة وإطار أخضر. الترتيب الأحدث أولًا.

    @ViewBuilder private var commentaryView: some View {
        if let c = commentary, !c.items.isEmpty {
            VStack(spacing: 8) {
                if c.live {
                    HStack(spacing: 6) {
                        Circle().fill(SpTheme.crimson).frame(width: 7, height: 7)
                        Text("التعليق يتحدّث مباشرةً")
                            .font(SportsFonts.app(size: 11.5, weight: .bold))
                            .foregroundStyle(SpTheme.crimson)
                        Spacer(minLength: 0)
                    }
                    .padding(.bottom, 2)
                }
                ForEach(c.items) { commentaryRow($0) }
            }
            .padding(.horizontal, 16)
        }
    }

    private func commentaryRow(_ item: SpCommentaryItem) -> some View {
        let kind = commentaryKind(item)
        let highlight = kind == "goal" || item.important
        return HStack(alignment: .top, spacing: 10) {
            Text(commentaryMinute(item))
                .font(SportsFonts.app(size: 11.5, weight: .heavy))
                .foregroundStyle(highlight ? SpTheme.green : SpTheme.onDarkDim)
                .monospacedDigit()
                .frame(width: 42)
                .environment(\.layoutDirection, .leftToRight)
            commentaryIcon(kind)
                .frame(width: 20)
                .padding(.top, 1)
            Text(item.textAr)
                .font(SportsFonts.app(size: 13, weight: highlight ? .semibold : .regular))
                .foregroundStyle(SpTheme.onDark)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .multilineTextAlignment(.leading)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(highlight ? SpTheme.green.opacity(0.07) : SpTheme.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                        .stroke(highlight ? SpTheme.green.opacity(0.28) : SpTheme.cardStroke, lineWidth: 1)
                )
        )
    }

    private func commentaryMinute(_ item: SpCommentaryItem) -> String {
        guard item.minute > 0 else { return "—" }
        if let x = item.extraMinute, x > 0 { return "\(item.minute)'+\(x)" }
        return "\(item.minute)'"
    }

    // نوع اللحظة يُستنتج من النصّ العربي (الخادم لا يرسل نوعًا صريحًا دائمًا، وقد لا
    // يضبط is_goal لكل هدف) — نظير الويب مع كشف الأهداف من بداية النصّ أيضًا.
    private func commentaryKind(_ item: SpCommentaryItem) -> String {
        let t = item.textAr
        if item.goal || t.hasPrefix("هدف") { return "goal" }
        if t.contains("بطاقة حمراء") { return "red" }
        if t.contains("بطاقة صفراء") { return "yellow" }
        if t.contains("ضربة جزاء") || t.contains("ركلة جزاء") { return "penalty" }
        if t.contains("ركلة ركنية") { return "corner" }
        if t.contains("تبديل") { return "substitution" }
        if t.hasPrefix("تصدٍّ") || t.contains("تصدّى") { return "shot-saved" }
        if t.hasPrefix("تسديدة محالة") || t.hasPrefix("أهدر") { return "shot-missed" }
        if t.contains("صافرة النهاية") { return "fulltime" }
        if t.contains("الوقت بدل الضائع") { return "added-time" }
        if t.contains("بداية الشوط") || t.contains("نهاية الشوط") { return "period" }
        return "other"
    }

    @ViewBuilder private func commentaryIcon(_ kind: String) -> some View {
        switch kind {
        case "goal":
            Image(systemName: "soccerball").font(.system(size: 14, weight: .bold)).foregroundStyle(SpTheme.green)
        case "yellow":
            RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                .fill(Color(red: 0.95, green: 0.76, blue: 0.22)).frame(width: 12, height: 16)
        case "red":
            RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                .fill(SpTheme.crimson).frame(width: 12, height: 16)
        case "penalty":
            Image(systemName: "soccerball").font(.system(size: 14, weight: .bold)).foregroundStyle(SpTheme.teal)
        case "corner":
            Image(systemName: "arrow.turn.right.down").font(.system(size: 13, weight: .bold)).foregroundStyle(SpTheme.teal)
        case "substitution":
            Image(systemName: "arrow.left.arrow.right").font(.system(size: 13, weight: .bold)).foregroundStyle(SpTheme.teal)
        case "shot-saved":
            Image(systemName: "hand.raised.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(SpTheme.greenSoft)
        case "shot-missed":
            Image(systemName: "paperplane.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
        case "fulltime":
            Image(systemName: "flag.checkered").font(.system(size: 13, weight: .bold)).foregroundStyle(SpTheme.crimson)
        case "period", "added-time":
            Image(systemName: "timer").font(.system(size: 13, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
        default:
            Image(systemName: "dot.radiowaves.left.and.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
        }
    }

    // MARK: - الإحصاءات

    private func statsView(_ s: SpMatchStatistics) -> some View {
        VStack(spacing: 16) {
            ForEach(s.rows) { row in statRow(row) }
        }
        .padding(.horizontal, 16)
    }

    private func statRow(_ row: SpStatRow) -> some View {
        let h = max(0, row.home?.number ?? 0)
        let a = max(0, row.away?.number ?? 0)
        let total = max(h + a, 1)
        return VStack(spacing: 6) {
            HStack {
                Text(row.home?.text ?? "—")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.onDark)
                    .environment(\.layoutDirection, .leftToRight)
                Spacer()
                Text(row.label)
                    .font(SportsFonts.app(size: 11))
                    .foregroundStyle(SpTheme.onDarkDim)
                Spacer()
                Text(row.away?.text ?? "—")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.onDark)
                    .environment(\.layoutDirection, .leftToRight)
            }
            GeometryReader { geo in
                HStack(spacing: 3) {
                    Capsule().fill(SpTheme.greenSoft)
                        .frame(width: geo.size.width * CGFloat(h / total))
                    Capsule().fill(SpTheme.green.opacity(0.7))
                        .frame(width: geo.size.width * CGFloat(a / total))
                }
            }
            .frame(height: 6)
        }
    }

    // MARK: - التشكيلة (ملعب ثنائي الأبعاد + دكة البدلاء — كتبويب الويب)

    private var pitchTop: Color { Color(red: 0.14, green: 0.52, blue: 0.38) }
    private var pitchBottom: Color { Color(red: 0.07, green: 0.34, blue: 0.25) }

    private func lineupsView(_ lineups: [SpLineup]) -> some View {
        VStack(spacing: 16) {
            ForEach(Array(lineups.enumerated()), id: \.offset) { _, lu in lineupCard(lu) }
        }
        .padding(.horizontal, 16)
    }

    private func lineupCard(_ lu: SpLineup) -> some View {
        let rows = pitchRows(lu)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                SpTeamLogo(logo: lu.team.logo, size: 32)
                Text(lu.team.name)
                    .font(SportsFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(SpTheme.onDark).lineLimit(1)
                Spacer(minLength: 0)
                if let f = lu.formation, !f.isEmpty {
                    Text(f)
                        .font(SportsFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(SpTheme.emeraldDeep)
                        .padding(.horizontal, 10).padding(.vertical, 3)
                        .background(Capsule().fill(SpTheme.chipFill))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }

            if rows.isEmpty {
                // لا إحداثيات شبكة — نعود للقائمة النصّية.
                VStack(spacing: 2) {
                    ForEach(lu.startXI) { p in playerRow(p, starter: true) }
                }
            } else {
                pitchView(rows)
            }

            if let coach = lu.coach, !coach.isEmpty {
                Label("المدرب: \(coach)", systemImage: "person.fill")
                    .font(SportsFonts.app(size: 11))
                    .foregroundStyle(SpTheme.onDarkDim)
            }

            if !lu.substitutes.isEmpty { benchGrid(lu.substitutes) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// صفوف اللاعبين من الشبكة "صف:عمود" (الصف 1 = الحارس).
    private func pitchRows(_ lu: SpLineup) -> [[SpLineupPlayer]] {
        var byRow: [Int: [(col: Int, p: SpLineupPlayer)]] = [:]
        for p in lu.startXI {
            let parts = (p.grid ?? "0:0").split(separator: ":").map { Int($0) ?? 0 }
            let r = parts.first ?? 0
            let c = parts.count > 1 ? parts[1] : 0
            byRow[r, default: []].append((c, p))
        }
        return byRow.keys.filter { $0 > 0 }.sorted().map { r in
            byRow[r]!.sorted { $0.col < $1.col }.map { $0.p }
        }
    }

    private func pitchView(_ rows: [[SpLineupPlayer]]) -> some View {
        GeometryReader { geo in
            ZStack {
                LinearGradient(colors: [pitchTop, pitchBottom], startPoint: .top, endPoint: .bottom)
                RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.25), lineWidth: 1).padding(8)
                Rectangle().fill(.white.opacity(0.2)).frame(height: 1)
                Circle().stroke(.white.opacity(0.25), lineWidth: 1).frame(width: 64, height: 64)

                ForEach(Array(rows.enumerated()), id: \.offset) { ri, players in
                    let y = geo.size.height * (1 - (CGFloat(ri) + 0.6) / (CGFloat(rows.count) + 0.4))
                    HStack(spacing: 0) {
                        ForEach(Array(players.enumerated()), id: \.offset) { _, p in
                            pitchDot(p).frame(maxWidth: .infinity)
                        }
                    }
                    .environment(\.layoutDirection, .leftToRight)
                    .position(x: geo.size.width / 2, y: y)
                    .frame(width: geo.size.width)
                }
            }
        }
        .aspectRatio(3.0 / 4.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func pitchDot(_ p: SpLineupPlayer) -> some View {
        Button { selectedPlayer = IDBox(id: p.id) } label: {
            VStack(spacing: 2) {
                Text(p.number.map { "\($0)" } ?? "•")
                    .font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(pitchBottom)
                    .monospacedDigit()
                    .frame(width: 28, height: 28).background(Circle().fill(.white))
                    .environment(\.layoutDirection, .leftToRight)
                Text(p.name)
                    .font(SportsFonts.app(size: 9, weight: .semibold)).foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.7).frame(maxWidth: 60)
            }
        }
        .buttonStyle(.plain)
    }

    private func benchGrid(_ subs: [SpLineupPlayer]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "figure.seated.side").font(.system(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)
                Text("دكة البدلاء").font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.green)
                Text("(\(subs.count))").font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(Array(subs.enumerated()), id: \.offset) { _, p in
                    Button { selectedPlayer = IDBox(id: p.id) } label: { benchRow(p) }
                        .buttonStyle(.plain)
                }
            }
        }
        .padding(.top, 4)
    }

    private func benchRow(_ p: SpLineupPlayer) -> some View {
        HStack(spacing: 8) {
            Text(p.number.map { "\($0)" } ?? "•")
                .font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(SpTheme.emeraldDeep)
                .monospacedDigit()
                .frame(width: 22, height: 22)
                .background(Circle().fill(SpTheme.green.opacity(0.15)))
                .environment(\.layoutDirection, .leftToRight)
            Text(p.name)
                .font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8).padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(SpTheme.chipFill))
    }

    private func playerRow(_ p: SpLineupPlayer, starter: Bool) -> some View {
        HStack(spacing: 10) {
            Text(p.number.map { "\($0)" } ?? "—")
                .font(SportsFonts.app(size: 13, weight: .bold))
                .foregroundStyle(starter ? SpTheme.green : SpTheme.onDarkFaint)
                .frame(width: 26).monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
            Text(p.name)
                .font(SportsFonts.app(size: 13, weight: starter ? .semibold : .regular))
                .foregroundStyle(starter ? SpTheme.onDark : SpTheme.onDarkDim)
                .lineLimit(1)
            Spacer(minLength: 0)
            if !p.pos.isEmpty {
                Text(p.pos)
                    .font(SportsFonts.app(size: 10))
                    .foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .padding(.vertical, 5)
    }

    // MARK: - التحليل (إثراء SportMonks)

    @ViewBuilder private var analysisView: some View {
        VStack(spacing: 16) {
            if let x = xg, x.available { xgCard(x) }
            if let m = momentum, m.available { momentumCard(m) }
            if let p = pressure, p.available, !p.points.isEmpty { pressureCard(p) }
            if let f = facts, f.available { factsCard(f) }
        }
        .padding(.horizontal, 16)
    }

    private func xgCard(_ x: SpXg) -> some View {
        VStack(spacing: 12) {
            sectionTitle("الأهداف المتوقّعة (xG)", icon: "scope")
            compareRow("xG", home: x.home.xg, away: x.away.xg, fmt: "%.2f")
            compareRow("على المرمى (xGOT)", home: x.home.xgot, away: x.away.xgot, fmt: "%.2f")
            if !x.topPlayers.isEmpty {
                divider
                ForEach(Array(x.topPlayers.prefix(4).enumerated()), id: \.offset) { _, p in
                    HStack(spacing: 8) {
                        Circle().fill(p.location == "home" ? SpTheme.green : SpTheme.onDarkDim).frame(width: 7, height: 7)
                        Text(p.name).font(SportsFonts.app(size: 13, weight: .semibold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        Spacer(minLength: 0)
                        Text(String(format: "%.2f", p.xg)).font(SportsFonts.app(size: 13, weight: .bold))
                            .foregroundStyle(SpTheme.emeraldDeep).environment(\.layoutDirection, .leftToRight)
                    }
                }
            }
        }
        .padding(16).background(analysisCardBg)
    }

    private func momentumCard(_ m: SpMomentum) -> some View {
        VStack(spacing: 12) {
            sectionTitle("الزخم والاستحواذ", icon: "waveform.path.ecg")
            if let pos = m.possession {
                compareRow("الاستحواذ", home: Double(pos.home), away: Double(pos.away), fmt: "%.0f", suffix: "%")
            }
            if !m.points.isEmpty {
                SpFlowChart(points: m.points)
                chartLegend
            }
        }
    }

    private func pressureCard(_ p: SpPressure) -> some View {
        VStack(spacing: 12) {
            sectionTitle("مؤشّر الضغط", icon: "gauge.with.dots.needle.50percent")
            SpFlowChart(points: downsample(p.points, maxCount: 24))
            chartLegend
        }
    }

    private func factsCard(_ f: SpMatchFacts) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("وقائع المباراة", icon: "sparkles")
            if let ht = f.halftime, let h = ht.home, let a = ht.away {
                factRow("نتيجة الشوط الأول", "\(h) - \(a)", ltr: true)
            }
            if let w = f.weather {
                let txt = [w.temp.map { "\($0)°" }, w.description, w.humidity.map { "رطوبة \($0)" }]
                    .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if !txt.isEmpty { factRow("الطقس", txt) }
            }
            if !f.absentees.isEmpty {
                divider
                Text("الغيابات").font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.emeraldDeep)
                ForEach(Array(f.absentees.prefix(6).enumerated()), id: \.offset) { _, ab in
                    HStack(spacing: 8) {
                        Circle().fill(ab.location == "home" ? SpTheme.green : SpTheme.onDarkDim).frame(width: 7, height: 7)
                        Text(ab.name).font(SportsFonts.app(size: 13, weight: .semibold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        Spacer(minLength: 0)
                        Text(ab.reason).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkFaint).lineLimit(1)
                    }
                }
            }
        }
        .padding(16).background(analysisCardBg)
    }

    // عناصر التحليل المشتركة
    private func sectionTitle(_ title: String, icon: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 14, weight: .bold)).foregroundStyle(SpTheme.greenSoft)
            Text(title).font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark)
            Spacer(minLength: 0)
        }
    }

    private func compareRow(_ title: String, home: Double, away: Double, fmt: String, suffix: String = "") -> some View {
        let total = max(home + away, 0.0001)
        return VStack(spacing: 5) {
            HStack {
                Text(String(format: fmt, home) + suffix).font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.onDark).environment(\.layoutDirection, .leftToRight)
                Spacer()
                Text(title).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim)
                Spacer()
                Text(String(format: fmt, away) + suffix).font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.onDark).environment(\.layoutDirection, .leftToRight)
            }
            GeometryReader { geo in
                HStack(spacing: 3) {
                    Capsule().fill(SpTheme.green).frame(width: geo.size.width * CGFloat(home / total))
                    Capsule().fill(SpTheme.onDarkDim).frame(width: geo.size.width * CGFloat(away / total))
                }
            }
            .frame(height: 6)
        }
    }

    private func factRow(_ label: String, _ value: String, ltr: Bool = false) -> some View {
        HStack {
            Text(label).font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDarkDim)
            Spacer()
            Text(value).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark)
                .environment(\.layoutDirection, ltr ? .leftToRight : .rightToLeft)
        }
    }

    private var chartLegend: some View {
        HStack(spacing: 16) {
            legendDot(SpTheme.green, detail?.fixture.home.name ?? "المضيف")
            legendDot(SpTheme.onDarkDim, detail?.fixture.away.name ?? "الضيف")
            Spacer(minLength: 0)
        }
    }
    private func legendDot(_ color: Color, _ text: String) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(text).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
        }
    }

    private var divider: some View { Rectangle().fill(SpTheme.outline.opacity(0.6)).frame(height: 1) }
    private var analysisCardBg: some View {
        RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
            .shadow(color: SpTheme.cardShadow, radius: 10, x: 0, y: 6)
    }

    private func downsample(_ pts: [SpFlowPoint], maxCount: Int) -> [SpFlowPoint] {
        guard pts.count > maxCount else { return pts }
        let step = Int((Double(pts.count) / Double(maxCount)).rounded(.up))
        return pts.enumerated().filter { $0.offset % step == 0 }.map { $0.element }
    }

    // MARK: - التقييمات

    @ViewBuilder private var ratingsView: some View {
        if let r = ratings {
            let rated = r.players.filter { ($0.rating ?? 0) > 0 }.sorted { ($0.rating ?? 0) > ($1.rating ?? 0) }
            VStack(spacing: 14) {
                if let m = r.motm {
                    motmCard(m, photo: rated.first { $0.id == m.id }?.photo ?? "")
                }
                VStack(spacing: 0) {
                    ForEach(Array(rated.enumerated()), id: \.element.id) { idx, p in
                        if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.5)).frame(height: 1).padding(.leading, 14) }
                        ratingRow(p)
                    }
                }
                .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
                .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            }
            .padding(.horizontal, 16)
        }
    }

    private func motmCard(_ m: SpMotm, photo: String) -> some View {
        Button { selectedPlayer = IDBox(id: m.id) } label: {
            HStack(spacing: 13) {
                playerPhoto(photo, size: 52)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 5) {
                        Image(systemName: "star.fill").font(.system(size: 10, weight: .bold)).foregroundStyle(SpTheme.green)
                        Text("أفضل لاعب في المباراة").font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)
                    }
                    Text(m.name).font(SportsFonts.app(size: 16, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                    Text(m.team).font(SportsFonts.app(size: 11.5, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                }
                Spacer(minLength: 0)
                ratingBadge(m.rating)
            }
            .padding(13).frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.green.opacity(0.06)))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.green.opacity(0.30), lineWidth: 1))
        }
        .buttonStyle(SpPressStyle())
    }

    private func ratingRow(_ p: SpRatedPlayer) -> some View {
        Button { selectedPlayer = IDBox(id: p.id) } label: {
            HStack(spacing: 11) {
                playerPhoto(p.photo, size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 5) {
                        if let n = p.number { Text("\(n)").font(SportsFonts.app(size: 10, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint).monospacedDigit() }
                        Text(p.name).font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                        if p.captain == true { Image(systemName: "c.square.fill").font(.system(size: 11)).foregroundStyle(SpTheme.green) }
                    }
                    HStack(spacing: 5) {
                        Text(p.team).font(SportsFonts.app(size: 10.5, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                        if let pos = p.pos, !pos.isEmpty { Text("· \(pos)").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint) }
                        if let mins = p.minutes, mins > 0 { Text("· \(mins)′").font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint).environment(\.layoutDirection, .leftToRight) }
                    }
                }
                Spacer(minLength: 0)
                if (p.goals ?? 0) > 0 {
                    Label("\(p.goals!)", systemImage: "soccerball.inverse").labelStyle(.titleAndIcon)
                        .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.green)
                }
                if let r = p.rating, r > 0 { ratingBadge(r) }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    private func ratingBadge(_ r: Double) -> some View {
        Text(String(format: "%.1f", r))
            .font(SportsFonts.app(size: 13, weight: .heavy)).foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Capsule().fill(r >= 7 ? SpTheme.green : (r >= 6 ? SpTheme.onDarkDim : SpTheme.crimson)))
            .environment(\.layoutDirection, .leftToRight)
    }

    private func playerPhoto(_ url: String, size: CGFloat) -> some View {
        SpAvatarImage(url: url, size: size, ring: SpTheme.cardStroke,
                      placeholderFg: SpTheme.onDarkFaint, placeholderBg: SpTheme.chipFill)
    }

    // MARK: - المواجهات

    @ViewBuilder private var h2hView: some View {
        if let h = h2h, let s = h.summary {
            let f = fixture
            VStack(spacing: 14) {
                h2hSummaryCard(s, home: f?.home, away: f?.away)
                VStack(spacing: 0) {
                    ForEach(Array(h.meetings.enumerated()), id: \.element.id) { idx, m in
                        if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.5)).frame(height: 1) }
                        h2hMeetingRow(m)
                    }
                }
                .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
                .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            }
            .padding(.horizontal, 16)
        }
    }

    private func h2hSummaryCard(_ s: SpH2HSummary, home: SpTeam?, away: SpTeam?) -> some View {
        let total = max(1, s.total)
        return VStack(spacing: 12) {
            HStack(alignment: .top) {
                h2hStat("\(s.homeWins)", home?.name ?? "المضيف", SpTheme.green)
                h2hStat("\(s.draws)", "تعادل", SpTheme.onDarkDim)
                h2hStat("\(s.awayWins)", away?.name ?? "الضيف", SpTheme.onDark)
            }
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule().fill(SpTheme.green).frame(width: geo.size.width * CGFloat(s.homeWins) / CGFloat(total))
                    Capsule().fill(SpTheme.onDarkFaint.opacity(0.45)).frame(width: geo.size.width * CGFloat(s.draws) / CGFloat(total))
                    Capsule().fill(SpTheme.onDarkDim).frame(width: geo.size.width * CGFloat(s.awayWins) / CGFloat(total))
                }
            }.frame(height: 8)
            Text("آخر \(s.total) لقاءات بين الفريقين")
                .font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
        }
        .padding(15).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
        .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }

    private func h2hStat(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 3) {
            Text(value).font(SportsFonts.app(size: 24, weight: .heavy)).foregroundStyle(color).monospacedDigit()
            Text(label).font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                .lineLimit(1).minimumScaleFactor(0.7).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private func h2hMeetingRow(_ m: SpH2HMeeting) -> some View {
        NavigationLink {
            SpMatchCenter(fixtureId: m.id, preview: nil)
        } label: {
            VStack(spacing: 4) {
                HStack(spacing: 10) {
                    HStack(spacing: 7) {
                        Text(m.home.name).font(SportsFonts.app(size: 12.5, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                            .lineLimit(1).frame(maxWidth: .infinity, alignment: .trailing)
                        SpTeamLogo(logo: m.home.logo, size: 22)
                    }
                    Text("\(m.goals.away ?? 0) - \(m.goals.home ?? 0)")
                        .font(SportsFonts.app(size: 14, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                        .monospacedDigit().environment(\.layoutDirection, .leftToRight).frame(width: 46)
                    HStack(spacing: 7) {
                        SpTeamLogo(logo: m.away.logo, size: 22)
                        Text(m.away.name).font(SportsFonts.app(size: 12.5, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                            .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                Text(m.competition).font(SportsFonts.app(size: 10, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint).lineLimit(1)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: - التحميل

    private func load() async {
        // التفاصيل أساسية؛ إثراء SportMonks أفضل جهد بالتوازي.
        async let detailRes = APIClient.shared.fetchMatchDetail(id: fixtureId)
        async let xgOpt = (try? APIClient.shared.fetchXg(matchId: fixtureId))
        async let momOpt = (try? APIClient.shared.fetchMomentum(matchId: fixtureId))
        async let presOpt = (try? APIClient.shared.fetchPressure(matchId: fixtureId))
        async let factsOpt = (try? APIClient.shared.fetchMatchFacts(matchId: fixtureId))
        async let ratingsOpt = (try? APIClient.shared.fetchMatchPlayers(matchId: fixtureId))
        async let commentaryOpt = (try? APIClient.shared.fetchCommentary(matchId: fixtureId))
        do {
            self.detail = try await detailRes
            self.loadError = nil
            // حدّث نشاط شاشة القفل بأحدث نتيجة (no-op إن لم يكن قائمًا).
            if let f = self.detail?.fixture { liveActivity.update(with: f) }
        } catch {
            self.loadError = error.localizedDescription
        }
        self.xg = await xgOpt
        self.momentum = await momOpt
        self.pressure = await presOpt
        self.facts = await factsOpt
        self.ratings = await ratingsOpt
        self.commentary = await commentaryOpt
        // المواجهات المباشرة — تحتاج معرّفَي الفريقين.
        if let f = preview ?? detail?.fixture {
            self.h2h = try? await APIClient.shared.fetchH2H(home: f.home.id, away: f.away.id)
        }
        // توقّعي (إن كانت المباراة قادمة وأنا عضو) — لملء الستيبر.
        if auth.isLoggedIn, let f = preview ?? detail?.fixture, !f.started {
            if let p = try? await APIClient.shared.fetchMyPrediction(matchId: fixtureId) {
                myPrediction = p
                predHome = p.predHome
                predAway = p.predAway
            }
        }
        self.loading = false
    }
}

// عنصر الخطّ الزمني: حدث مباراة أو فاصل نتيجة الشوط الأول.
enum SpTimelineItem: Identifiable {
    case event(SpMatchEvent)
    case halftime(home: Int, away: Int)

    var id: String {
        switch self {
        case .event(let e): return "e-\(e.id)"
        case .halftime(let h, let a): return "ht-\(h)-\(a)"
        }
    }
}

// مخطّط تدفّق (زخم/ضغط) — أعمدة فوق/تحت خط منتصف: المضيف (أخضر) أعلى، الضيف
// (ذهبي) أسفل، بارتفاع متناسب مع صافي الأفضلية لكل فترة زمنية.
struct SpFlowChart: View {
    let points: [SpFlowPoint]
    var homeColor: Color = SpTheme.green
    var awayColor: Color = SpTheme.onDarkDim

    var body: some View {
        Canvas { ctx, size in
            guard !points.isEmpty else { return }
            let maxAbs = max(points.map { abs($0.net) }.max() ?? 1, 0.001)
            let mid = size.height / 2
            let slot = size.width / CGFloat(points.count)
            let barW = max(1.5, slot * 0.66)
            for (i, p) in points.enumerated() {
                let x = CGFloat(i) * slot + (slot - barW) / 2
                let h = CGFloat(abs(p.net) / maxAbs) * (mid - 2)
                let isHome = p.net >= 0
                let rect = CGRect(x: x, y: isHome ? mid - h : mid, width: barW, height: max(h, 0.5))
                ctx.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(isHome ? homeColor : awayColor))
            }
            var line = Path()
            line.move(to: CGPoint(x: 0, y: mid))
            line.addLine(to: CGPoint(x: size.width, y: mid))
            ctx.stroke(line, with: .color(SpTheme.outline), lineWidth: 1)
        }
        .frame(height: 92)
    }
}
