import SwiftUI

// مركز المباراة — يُفتح كـ sheet عند الضغط على أي بطاقة مباراة. ترويسة مسطّحة
// (الفريقان + النتيجة/التوقيت + الحالة + الدور/التاريخ + الملعب)، ثم تبويبات:
// الأحداث · الإحصاءات · التشكيلة (تُخفى الفارغة). يبدأ بمعاينة فورية من البطاقة
// ثم يثري بالتفاصيل الكاملة من /sports/match/:id. نصوص الترويسة بيضاء على الأخضر.
extension VaraTeamStrength {
    /// قوّة فريق من صفّ ترتيب بطولة (روشن/الدوريات).
    nonisolated init(row r: SpStandingRow) {
        self.init(played: r.played, points: r.points,
                  goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
                  form: r.form, rank: r.rank)
    }
}

// حكم المباراة وصرامته بالأرقام — من نقطة المونديال /world-cup/match/:id/referee
// (SportMonks). أفضل جهد: بطولات بلا حكم معلن → available=false فتختفي البطاقة.
nonisolated struct SpRefereeStats: Decodable {
    let matches: Int
    let yellowAvg: Double?
    let yellowCount: Int?
    let redCount: Int
    let penaltiesAvg: Double?
    let penaltiesCount: Int?
    let varMoments: Int?
}

nonisolated struct SpMatchReferee: Decodable {
    let available: Bool
    let name: String
    let photo: String?
    let countryName: String?
    let stats: SpRefereeStats?
}

// MARK: - نماذج «تقديم» (المرحلة 2) — أفضل جهد للمباريات القادمة

/// رؤية VARA — نص عربي ذكي يلخّص المباراة (/sports/match/:id/preview).
nonisolated struct SpMatchPreview: Decodable {
    let text: String
    let generatedAt: Double?
}

/// القنوات الناقلة (/sports/match/:id/tv).
nonisolated struct SpTvChannel: Decodable {
    let name: String
    let url: String?
}
nonisolated struct SpMatchTv: Decodable {
    let available: Bool
    let channels: [SpTvChannel]
}

/// هدّافو النادي (/sports/team/:id/scorers) — الغلاف بلا حقل configured.
nonisolated struct SpTeamScorersResponse: Decodable {
    let scorers: [SpScorer]
}

struct SpMatchCenter: View {
    /// صبغة بطولة المباراة — تصبغ المركز كاملًا بلونها في نمط «ألوان VARA».
    private var acc: Color { SpTheme.compAccent((detail?.fixture ?? preview)?.competitionSlug) }

    let fixtureId: Int
    /// معاينة من بطاقة المباراة لعرض الترويسة فورًا قبل اكتمال التحميل.
    var preview: SpFixture?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(SpAuthStore.self) private var auth
    @Environment(SpMatchFollows.self) private var matchFollows
    @Environment(SpLiveActivityManager.self) private var liveActivity
    @Environment(SpLiveStream.self) private var liveStream
    @State private var detail: SpMatchDetail?
    @State private var loading = true
    @State private var loadError: String?
    @State private var segment: Segment = .events
    @State private var selectedTeam: IDBox?

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
    @State private var referee: SpMatchReferee?
    // التشكيلة المتوقعة (SportMonks) — تُجلب فقط قبل صدور الرسمية ولغير المنتهية
    @State private var expectedLineup: SpExpectedLineups?
    // قوّة الفريقين من ترتيب البطولة — تغذّي «توقّع VARA» الديناميكي (أفضل جهد).
    @State private var strength: [Int: VaraTeamStrength] = [:]
    // إثراء «تقديم» (المرحلة 2) — رؤية VARA + القنوات + هدّافو الفريقين (أفضل جهد).
    @State private var previewNote: SpMatchPreview?
    @State private var tv: SpMatchTv?
    @State private var homeScorers: [SpScorer] = []
    @State private var awayScorers: [SpScorer] = []
    @State private var recordedMatchView = false
    /// جلبة لحظية واحدة في كل لحظة — ختم الموجز + حلقة الاستطلاع + عودة المقدمة
    /// كانت تتراكب فتتضاعف جلبات التفاصيل/التعليق للمباراة نفسها في آنٍ واحد.
    @State private var refreshInFlight = false
    /// آخر تحديث لحظي ناجح — يحوّل حلقة الاستطلاع وعودة المقدمة إلى شبكة أمان
    /// صرفة ما دام البث الحيّ متصلًا ويغذّي الشاشة عبر ختم الموجز.
    @State private var lastLiveRefresh: Date = .distantPast

    private enum Segment: String, CaseIterable {
        case preview, events, commentary, analysis, ratings, lineups, stats, h2h
        var label: String {
            switch self {
            case .preview: return L("تقديم")
            case .events: return L("الأحداث")
            case .commentary: return L("التعليق")
            case .analysis: return L("التحليل")
            case .ratings: return L("التقييمات")
            case .lineups: return L("التشكيلة")
            case .stats: return L("الإحصاءات")
            case .h2h: return L("المواجهات")
            }
        }
    }

    private var hasAnalysis: Bool {
        // للمباريات التي بدأت: أظهر التبويب فورًا وحمّل الإثراء عند الدخول
        // (سابقًا كان ينتظر 4–5 طلبات SportMonks متوازية قبل ظهور التبويب).
        if fixture?.started == true { return true }
        return (xg?.available ?? false) || (momentum?.available ?? false)
            || (pressure?.available ?? false) || (facts?.available ?? false)
    }

    /// المباراة المعروضة: التفاصيل إن وصلت، وإلا المعاينة الفورية.
    private var fixture: SpFixture? { detail?.fixture ?? preview }

    /// أهلية المتابعة اللحظية: جارية، أو قادمة باقٍ على انطلاقها ساعة أو أقل.
    private func liveFollowEligible(_ f: SpFixture) -> Bool {
        if f.status.live { return true }
        if f.status.finished { return false }
        let secs = f.kickoff.timeIntervalSinceNow
        return secs <= 3600 && secs > -120
    }

    /// آخر هدف/بطاقة لعرضه أسفل بطاقة شاشة القفل (يطابق صياغة الخادم).
    private func lastEventText(_ events: [SpMatchEvent]) -> String? {
        let ranked = events.enumerated()
            .sorted { a, b in
                let ka = (a.element.minute ?? 0, a.element.extra ?? 0)
                let kb = (b.element.minute ?? 0, b.element.extra ?? 0)
                if ka != kb { return ka > kb }
                return a.offset > b.offset   // نفس الدقيقة: الأحدث بتسلسل المزوّد.
            }
            .map(\.element)
        let kinds = ["goal", "yellow-card", "red-card", "missed-penalty"]
        guard let ev = ranked.first(where: { kinds.contains($0.type) }) else { return nil }
        let icon = ev.type == "goal" ? "⚽" : ev.type == "yellow-card" ? "🟨"
            : ev.type == "red-card" ? "🟥" : "❌"
        let extra = (ev.extra ?? 0) > 0 ? "+\(ev.extra!)" : ""
        let minute = "\(ev.minute ?? 0)\(extra)'"
        let who = ev.player.isEmpty ? ev.label : ev.player
        return "\(icon) \(minute) \(who)"
    }

    /// تفاصيل المباراة قد تصل بلا اسم بطولة، بينما المعاينة القادمة من البطاقات
    /// تحملها. نحفظها هنا حتى يظهر اسم البطولة داخل Live Activity دائماً.
    private func liveActivityFixture(_ f: SpFixture) -> SpFixture {
        let competition = f.competition?.isEmpty == false ? f.competition : preview?.competition
        let competitionSlug = f.competitionSlug?.isEmpty == false ? f.competitionSlug : preview?.competitionSlug
        guard competition != f.competition || competitionSlug != f.competitionSlug else { return f }
        return SpFixture(
            id: f.id,
            date: f.date,
            timestamp: f.timestamp,
            status: f.status,
            round: f.round,
            venue: f.venue,
            home: f.home,
            away: f.away,
            goals: f.goals,
            penalties: f.penalties,
            competition: competition,
            competitionSlug: competitionSlug
        )
    }

    /// عنوان المشاركة الاجتماعية — الفريقان + النتيجة/الموعد + البطولة عبر VARA.
    private var shareTitle: String {
        guard let f = fixture else { return L("مباراة عبر VARA") }
        let middle: String
        if f.started {
            var score = "\(f.goals.home ?? 0) - \(f.goals.away ?? 0)"
            if let p = f.penaltyScore, let h = p.home, let a = p.away {
                score += Lf(" (ترجيح %d-%d)", h, a)
            }
            middle = score
        } else {
            middle = "×"
        }
        let comp = f.competition?.isEmpty == false ? f.competition! : L("دوري روشن")
        return "\(f.home.name) \(middle) \(f.away.name) — \(comp) · \(L("عبر VARA"))"
    }

    private var hasRatings: Bool { (ratings?.players.contains { ($0.rating ?? 0) > 0 }) ?? false }
    private var hasH2H: Bool { !(h2h?.meetings.isEmpty ?? true) }
    private var hasCommentary: Bool { !(commentary?.items.isEmpty ?? true) }
    private var hasExpectedLineup: Bool {
        guard let e = expectedLineup, e.available else { return false }
        return e.home != nil || e.away != nil
    }

    private var segments: [Segment] {
        guard let d = detail else { return [] }
        var s: [Segment] = []
        // «تقديم» يتصدّر تبويبات المباراة القادمة (قبل الانطلاق).
        if let f = fixture, !f.started { s.append(.preview) }
        if !d.events.isEmpty { s.append(.events) }
        if hasCommentary { s.append(.commentary) }
        if hasAnalysis { s.append(.analysis) }
        if hasRatings { s.append(.ratings) }
        if !d.lineups.isEmpty || hasExpectedLineup { s.append(.lineups) }
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
                // حكم المباراة للقادمة يظهر مباشرةً تحت «الوقت المتبقّي» (قرار 2026-07-09).
                // للمباريات التي انطلقت يبقى ضمن تبويب التشكيلة (أدناه) بلا تكرار.
                if fixture?.started == false { refereeCard }

                if loading && detail == nil {
                    SpLoading()
                } else if let loadError, detail == nil {
                    SpEmptyState(icon: "wifi.exclamationmark", title: L("تعذّر التحميل"), subtitle: loadError,
                                 retry: { Task { await load() } })
                } else if let d = detail {
                    content(d)
                }
            }
            .padding(.vertical, 8)
            .padding(.bottom, 24)
        }
        .refreshable { await load() }
        .background(SpAmbientBackground())
        .navigationTitle(L("مركز المباراة"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let f = fixture {
                // زرّان في ToolbarItem واحد (HStack) بدل ToolbarItemَين منفصلين —
                // على iOS 26 Liquid Glass كان تجميع العنصرين في كبسولة مشتركة يوسّع
                // منطقة لمس النجمة فوق أيقونة الهاتف فيبدو زر شاشة القفل ميتًا.
                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: 2) {
                        Button {
                            matchFollows.toggle(f)
                        } label: {
                            let following = matchFollows.isFollowing(f.id)
                            Image(systemName: following ? "star.fill" : "star")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(following ? SpTheme.gold : acc)
                                .frame(width: 36, height: 36)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(L("متابعة المباراة"))

                        // متابعة لحظية على شاشة القفل (Live Activity) — جارية أو قريبة (≤ ساعة).
                        if liveActivity.isSupported && liveFollowEligible(f) {
                            Button {
                                liveActivity.toggle(for: liveActivityFixture(f))
                            } label: {
                                let on = liveActivity.isActive(f.id)
                                Image(systemName: on ? "lock.iphone" : "platter.filled.bottom.iphone")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(on ? acc : SpTheme.onDarkDim)
                                    .frame(width: 36, height: 36)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(L("شاشة القفل"))
                        }
                    }
                }
            }
            if let url = URLConstants.matchShareURL(fixtureId) {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: url, subject: Text(shareTitle), message: Text(shareTitle)) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(acc)
                    }
                }
            }
        }
        .task(id: fixtureId) { await load() }
        // الحكم بعد ظهور التفاصيل — لا يزاحم طلب التفاصيل الأساسي على الشبكة البطيئة.
        .task(id: detail?.fixture.id) { await loadReferee() }
        // إثراء ثقيل حسب التبويب فقط — يمنع عاصفة طلبات SportMonks عند الفتح.
        .onChange(of: segment) { _, s in
            Task { await ensureSegmentData(s) }
        }
        // تحديث لحظي تلقائي أثناء اللعب — الأهداف/الكروت/الدقيقة/النتيجة تتجدّد
        // ذاتيًّا كما في الويب دون سحب-لتحديث يدوي. يتوقّف عند الانتهاء/البُعد.
        .task(id: detail?.fixture.id) { await pollLive() }
        // عودة التطبيق للمقدّمة أثناء مباراة جارية = تحديث فوري.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, (detail?.fixture ?? preview)?.status.live == true {
                // بث متصل وتحديث عبر ختمه قبل لحظات؟ الشاشة طازجة — لا جلب مكرر.
                if liveStream.connected, Date().timeIntervalSince(lastLiveRefresh) < 10 { return }
                Task { await refreshLive() }
            }
        }
        // البث الحيّ (SSE): تغيّر ختم مباراتنا في الموجز = جلب التفاصيل فورًا (~2ث).
        .onChange(of: liveStream.stamps["s:\(fixtureId)"]) { _, _ in
            Task { await refreshLive() }
        }
        // مباريات كأس العالم تحمل مفتاح «w:» في الموجز لا «s:» — مراقبة «s:» وحدها
        // كانت تُفقِد مركز المونديال نبضة الثانيتين فيتأخر لدورة الاستطلاع (10ث).
        .onChange(of: liveStream.stamps["w:\(fixtureId)"]) { _, _ in
            Task { await refreshLive() }
        }
        .navigationDestination(item: $selectedTeam) { box in SpTeamPage(teamId: box.id) }
        .navigationDestination(item: $selectedPlayer) { box in SpPlayerPage(playerId: box.id) }
        .alert(
            L("تعذّر إضافة المباراة إلى شاشة القفل"),
            isPresented: Binding(
                get: { liveActivity.startErrorMessage != nil },
                set: { if !$0 { liveActivity.clearStartError() } }
            )
        ) {
            Button(L("حسنًا")) { liveActivity.clearStartError() }
        } message: {
            Text(liveActivity.startErrorMessage ?? "")
        }
    }

    // MARK: - الترويسة (مسطّحة بلا إطار — كمرجع كأس العالم)

    private func header(_ f: SpFixture) -> some View {
        VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                teamColumn(f.home)
                centerColumn(f)
                teamColumn(f.away)
            }
            // حسم الترجيح — الأرقام في Text مستقل LTR (دمجها بالجملة يقلبها بيديًّا).
            if f.status.finished, let p = f.penaltyScore,
               let h = p.home, let a = p.away, h != a {
                HStack(spacing: 4) {
                    Text(Lf("فاز %@ بركلات الترجيح", h > a ? f.home.name : f.away.name))
                    Text("\(max(h, a))-\(min(h, a))")
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                }
                .font(SportsFonts.app(size: 13, weight: .heavy))
                .foregroundStyle(acc)
            }
            let meta = headerMeta(f)
            if !meta.isEmpty {
                Text(meta)
                    .font(SportsFonts.app(size: 11))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            let stadium = headerStadium(f)
            if !stadium.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 10, weight: .semibold))
                    Text(stadium)
                        .font(SportsFonts.app(size: 11, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .foregroundStyle(SpTheme.onDarkDim)
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

    private func headerStadium(_ f: SpFixture) -> String {
        let name = f.venue.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let city = f.venue.city.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { return city }
        if city.isEmpty { return name }
        return "\(name) — \(city)"
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
                    .foregroundStyle(acc)
                    .environment(\.layoutDirection, .leftToRight)
            }
            // أثناء الترجيح فقط: النتيجة الجارية ركلةً بركلة. نستبدل شارة الحالة
            // بسطر واحد كي لا تظهر «ترجيح» فوق و«ركلات» تحت.
            if f.shootoutLive, let p = f.penaltyScore {
                HStack(spacing: 5) {
                    Text(L("ركلات الترجيح"))
                        .font(SportsFonts.app(size: 11, weight: .bold))
                    Text("\(p.away ?? 0) - \(p.home ?? 0)")
                        .font(SportsFonts.app(size: 16, weight: .heavy))
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                }
                .foregroundStyle(SpTheme.crimson)
            } else {
                SpStatusPill(fixture: f)
            }
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
                        .font(.system(size: 14, weight: .bold)).foregroundStyle(acc)
                    Text(L("الوقت المتبقّي على المباراة"))
                        .font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark)
                    Spacer(minLength: 0)
                }
                SpCountdownChips(timestampMs: f.timestamp * 1000)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
                    .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            )
            .padding(.horizontal, 16)
        }
    }

    // MARK: - حكم المباراة (كما في ويب المونديال — أعداد صحيحة لا متوسطات كسرية)

    @ViewBuilder private var refereeCard: some View {
        if let r = referee, r.available, !r.name.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 11) {
                    SpAvatarImage(url: r.photo ?? "", size: 40, ring: SpTheme.cardStroke)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L("حكم المباراة"))
                            .font(SportsFonts.app(size: 11, weight: .heavy))
                            .foregroundStyle(acc)
                        Text(r.name)
                            .font(SportsFonts.app(size: 15, weight: .heavy))
                            .foregroundStyle(SpTheme.onDark)
                            .lineLimit(1).minimumScaleFactor(0.8)
                        if let c = r.countryName, !c.isEmpty {
                            Text(c)
                                .font(SportsFonts.app(size: 11, weight: .semibold))
                                .foregroundStyle(SpTheme.onDarkDim)
                        }
                    }
                    Spacer(minLength: 0)
                    if let s = r.stats {
                        Text(SpLanguage.shared.isEnglish
                             ? Lf("%d مباراة بالبطولة", s.matches)
                             : "\(s.matches) \(s.matches == 1 ? "مباراة" : "مباريات") بالبطولة")
                            .font(SportsFonts.app(size: 10.5, weight: .semibold))
                            .foregroundStyle(SpTheme.onDarkDim)
                    }
                }
                if let s = r.stats {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 7) {
                            let yellow = s.yellowCount ?? s.yellowAvg.map { Int(($0 * Double(s.matches)).rounded()) }
                            let pens = s.penaltiesCount ?? s.penaltiesAvg.map { Int(($0 * Double(s.matches)).rounded()) }
                            if let yellow { refereeChip(Lf("🟨 %d صفراء", yellow)) }
                            refereeChip(Lf("🟥 %d حمراء", s.redCount))
                            if let pens {
                                refereeChip(SpLanguage.shared.isEnglish
                                    ? Lf("⚽ %d ركلة جزاء", pens)
                                    : "⚽ \(pens) \(pens == 1 ? "ركلة جزاء" : "ركلات جزاء")")
                            }
                            if let v = s.varMoments { refereeChip(Lf("فار ×%d", v)) }
                        }
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
                    .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            )
            .padding(.horizontal, 16)
        }
    }

    private func refereeChip(_ text: String) -> some View {
        Text(text)
            .font(SportsFonts.app(size: 11.5, weight: .bold))
            .foregroundStyle(SpTheme.onDark)
            .monospacedDigit()
            .padding(.horizontal, 9).padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(SpTheme.chipFill))
    }

    /// جلب حكم المباراة — أفضل جهد (لا يعطّل المركز إن غابت النقطة/الحكم).
    /// نجرّب نقطة الدوري/الخليج الموحّدة أولًا (تغطّي روشن وغيرها)، ثم المونديال.
    private func loadReferee() async {
        if let r = try? await APIClient.shared.get(
            SpMatchReferee.self,
            path: "/sports/match/\(fixtureId)/referee",
            apiRoot: URLConstants.publicAPI
        ), r.available {
            referee = r
            return
        }
        referee = try? await APIClient.shared.get(
            SpMatchReferee.self,
            path: "/world-cup/match/\(fixtureId)/referee",
            apiRoot: URLConstants.publicAPI
        )
    }

    // MARK: - تبويب «تقديم» (المباراة القادمة) — يجمع رؤية VARA + الفورمة
    // + المواجهات + هدّافي الفريقين + الأجواء (طقس/قنوات/حكم) في مكان واحد هادئ.
    // كل بطاقة تدير هامشها الأفقي بنفسها (16) كبقية التبويبات.

    @ViewBuilder private var previewView: some View {
        if let f = fixture {
            VStack(spacing: 16) {
                varaVisionCard
                formCompareCard(f)
                if let s = h2h?.summary, s.total > 0 {
                    h2hSummaryCard(s, home: f.home, away: f.away)
                        .padding(.horizontal, 16)
                }
                starVsStarCard
                broadcastInfoCard(f)
                // حكم المباراة انتقل أعلى المركز تحت «الوقت المتبقّي» (لم يعد هنا).
            }
        }
    }

    // حارس المراهنات — نص «تقديم» من الخادم قد يتضمّن مصطلحات مراهنة (من توصية
    // المزوّد). نشطب أي جملة تذكرها (حساسية أبل + غير لائق للسوق). إن أفرغت النص
    // كلّه، تختفي البطاقة (توقّع VARA النظيف يكفي).
    private func sanitizeVision(_ text: String) -> String {
        let banned = ["رهان", "مراهن", "الرهان", "الرهانات", "bet", "odds", "توصية المزوّد"]
        let kept = text.components(separatedBy: CharacterSet(charactersIn: ".\n"))
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { s in
                guard !s.isEmpty else { return false }
                let low = s.lowercased()
                return !banned.contains { low.contains($0) }
            }
        let joined = kept.joined(separator: ". ")
        return joined.isEmpty ? "" : joined + "."
    }

    // رؤية VARA — الجملة الذكية الافتتاحية (نص الخادم العربي، مُنقّى من المراهنات).
    @ViewBuilder private var varaVisionCard: some View {
        if let raw = previewNote?.text, case let text = sanitizeVision(raw), !text.isEmpty {
            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles").font(.system(size: 14, weight: .bold)).foregroundStyle(SpTheme.gold)
                    Text(L("رؤية VARA")).font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark)
                    Spacer(minLength: 0)
                }
                // 3 أسطر ثم «اقرأ المزيد» — يتوسّع محليًّا بلا مغادرة المركز.
                SpVisionText(text: text)
            }
            .padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.gold.opacity(0.06))
                    .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.gold.opacity(0.28), lineWidth: 1))
            )
            .padding(.horizontal, 16)
        }
    }

    // الفورمة الأخيرة — آخر 5 نتائج لكل فريق من سلسلة form في الترتيب (W/D/L).
    @ViewBuilder private func formCompareCard(_ f: SpFixture) -> some View {
        let homeForm = strength[f.home.id]?.form
        let awayForm = strength[f.away.id]?.form
        if (homeForm?.isEmpty == false) || (awayForm?.isEmpty == false) {
            VStack(spacing: 12) {
                sectionTitle(L("الفورمة الأخيرة"), icon: "chart.line.uptrend.xyaxis")
                formRow(f.home, homeForm)
                divider
                formRow(f.away, awayForm)
            }
            .padding(16).background(analysisCardBg).padding(.horizontal, 16)
        }
    }

    private func formRow(_ team: SpTeam, _ form: String?) -> some View {
        HStack(spacing: 10) {
            SpTeamLogo(logo: team.logo, size: 26)
            Text(team.name)
                .font(SportsFonts.app(size: 13, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 8)
            HStack(spacing: 4) {
                if let form, !form.isEmpty {
                    ForEach(Array(form.suffix(5).enumerated()), id: \.offset) { _, ch in formChip(ch) }
                } else {
                    Text("—").font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
                }
            }
            .environment(\.layoutDirection, .leftToRight)
        }
    }

    private func formChip(_ c: Character) -> some View {
        let up = Character(c.uppercased())
        let (t, col): (String, Color) = up == "W" ? (L("ف"), SpTheme.green)
            : up == "D" ? (L("ت"), SpTheme.onDarkDim)
            : up == "L" ? (L("خ"), SpTheme.crimson)
            : ("•", SpTheme.onDarkFaint)
        return Text(t)
            .font(SportsFonts.app(size: 10, weight: .heavy)).foregroundStyle(.white)
            .frame(width: 20, height: 20).background(Circle().fill(col))
    }

    // نجما الفريقين — هدّاف كل فريق ومقارنته (أهداف/صناعة الموسم).
    @ViewBuilder private var starVsStarCard: some View {
        if let f = fixture, (homeScorers.first != nil || awayScorers.first != nil) {
            let hs = homeScorers.first
            let av = awayScorers.first
            VStack(spacing: 12) {
                sectionTitle(L("هدّافو الفريقين"), icon: "star.circle.fill")
                HStack(alignment: .top, spacing: 8) {
                    scorerHead(hs, f.home)
                    scorerHead(av, f.away)
                }
                if let hs, let av {
                    divider
                    compareRow(L("أهداف الموسم"), home: Double(hs.goals), away: Double(av.goals), fmt: "%.0f")
                    if hs.assists + av.assists > 0 {
                        compareRow(L("صناعة"), home: Double(hs.assists), away: Double(av.assists), fmt: "%.0f")
                    }
                }
            }
            .padding(16).background(analysisCardBg).padding(.horizontal, 16)
        }
    }

    private func scorerHead(_ s: SpScorer?, _ team: SpTeam) -> some View {
        VStack(spacing: 6) {
            playerPhoto(s?.photo ?? "", size: 46)
            Text(s?.name ?? "—")
                .font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.75).multilineTextAlignment(.center)
            Text(team.name)
                .font(SportsFonts.app(size: 10.5, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                .lineLimit(1).minimumScaleFactor(0.75)
            if let g = s?.goals {
                Text("\(g) ⚽")
                    .font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(acc)
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
        .frame(maxWidth: .infinity)
    }

    // أجواء المباراة — الطقس + القنوات الناقلة (الحكم في بطاقته المستقلّة أسفلها).
    @ViewBuilder private func broadcastInfoCard(_ f: SpFixture) -> some View {
        let weatherText = weatherLine()
        let channels = (tv?.channels ?? []).map(\.name).filter { !$0.isEmpty }
        if weatherText != nil || !channels.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                sectionTitle(L("أجواء المباراة"), icon: "cloud.sun.fill")
                if let weatherText {
                    HStack(spacing: 10) {
                        Image(systemName: "thermometer.medium").font(.system(size: 14, weight: .semibold)).foregroundStyle(acc).frame(width: 22)
                        Text(L("الطقس")).font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDarkDim)
                        Spacer(minLength: 8)
                        Text(weatherText).font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.onDark)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                }
                if !channels.isEmpty {
                    if weatherText != nil { divider }
                    HStack(spacing: 8) {
                        Image(systemName: "tv.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(acc).frame(width: 22)
                        Text(L("القنوات الناقلة")).font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDarkDim)
                        Spacer(minLength: 0)
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(Array(channels.prefix(12).enumerated()), id: \.offset) { _, ch in
                                Text(ch)
                                    .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.onDark)
                                    .lineLimit(1).padding(.horizontal, 9).padding(.vertical, 5)
                                    .background(Capsule().fill(SpTheme.chipFill))
                            }
                        }
                    }
                }
            }
            .padding(16).frame(maxWidth: .infinity, alignment: .leading).background(analysisCardBg).padding(.horizontal, 16)
        }
    }

    private func weatherLine() -> String? {
        guard let w = facts?.weather else { return nil }
        let parts = [w.temp.map { "\($0)°" }, w.description, w.humidity.map { "\(L("رطوبة")) \($0)" }]
            .compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: - المحتوى (تبويبات)

    @ViewBuilder private func content(_ d: SpMatchDetail) -> some View {
        if segments.isEmpty {
            SpEmptyState(icon: "hourglass",
                         title: L("لا تفاصيل بعد"),
                         subtitle: L("ستظهر الأحداث والإحصاءات والتشكيلة فور توفّرها"))
                .padding(.horizontal, 16)
        } else {
            VStack(spacing: 18) {
                if segments.count > 1 { tabBar }

                switch effectiveSegment {
                case .preview: previewView
                case .events: eventsView(d)
                case .commentary: commentaryView
                case .analysis: analysisView
                case .ratings: ratingsView
                case .lineups: lineupsSection(d)
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
                                .background(Capsule().fill(active ? acc : SpTheme.chipFill))
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
                    Capsule().fill(acc.opacity(0.28)).frame(width: 2)
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
                Text(L("خطّ زمن المباراة"))
                    .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(acc)

                GeometryReader { geo in
                    let w = geo.size.width
                    ZStack(alignment: .topLeading) {
                        Rectangle().fill(acc.opacity(0.22))
                            .frame(width: w - barInset * 2, height: 2)
                            .position(x: w / 2, y: barAxisY)
                        ForEach(marks, id: \.self) { m in
                            let x = barX(m, maxMin: maxMin, width: w)
                            Rectangle().fill(acc.opacity(0.12))
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
                        Circle().fill(acc).frame(width: 7, height: 7)
                        Text("\(d.fixture.home.name) · \(L("أعلى"))")
                            .font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    HStack(spacing: 5) {
                        Text("\(d.fixture.away.name) · \(L("أسفل"))")
                            .font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                        Circle().fill(SpTheme.onDarkDim).frame(width: 7, height: 7)
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
                .foregroundStyle(acc)
                .padding(3)
                .background(Circle().fill(.white))
                .overlay(Circle().stroke(acc.opacity(0.6), lineWidth: 1.5))
        case "yellow-card":
            RoundedRectangle(cornerRadius: 2).fill(SpTheme.yellowCard).frame(width: 9, height: 13)
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
                    .foregroundStyle(acc)
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
                .fill(isGoal ? acc.opacity(0.10) : SpTheme.chipFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(isGoal ? acc.opacity(0.25) : Color.clear, lineWidth: 1)
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
            .background(Capsule().fill(acc))
            .environment(\.layoutDirection, .leftToRight)
            .fixedSize()
    }

    // فاصل «نتيجة الشوط الأول» (النص: ضيف - مضيف مع فرض LTR كبقية النتائج) يغطّي المحور في موضع الدقيقة 45.
    private func halftimeMarker(home: Int, away: Int) -> some View {
        HStack(spacing: 7) {
            Text(L("نتيجة الشوط الأول"))
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
                Image(systemName: "soccerball").foregroundStyle(acc)
            case "score-summary":
                Image(systemName: "soccerball").foregroundStyle(acc)
            case "shootout-summary":
                Image(systemName: "checkmark.seal.fill").foregroundStyle(SpTheme.gold)
            case "missed-penalty":
                Image(systemName: "exclamationmark.shield.fill").foregroundStyle(SpTheme.crimson)
            case "var":
                Image(systemName: "play.tv.fill").foregroundStyle(varPurple)
            case "yellow-card":
                cardChip(SpTheme.yellowCard)
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
            if let a = e.assist, !a.isEmpty { return Lf("بديلًا عن: %@", a) }
            return nil
        case "goal":
            if let a = e.assist, !a.isEmpty { return Lf("صناعة: %@", a) }
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
        // كسر تعادل الدقيقة بترتيب المزوّد الأصلي — بدونه تنقلب ركلات الترجيح
        // (كلها بالدقيقة نفسها) فتظهر ركلة لاحقة قبل سابقتها.
        let sorted = events.enumerated()
            .sorted { a, b in
                let ea = eff(a.element), eb = eff(b.element)
                if ea != eb { return ea > eb }
                return a.offset > b.offset
            }
            .map(\.element)
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
                        Text(L("التعليق يتحدّث مباشرةً"))
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
                .foregroundStyle(highlight ? acc : SpTheme.onDarkDim)
                .monospacedDigit()
                .frame(width: 42)
                .environment(\.layoutDirection, .leftToRight)
            commentaryIcon(kind)
                .frame(width: 20)
                .padding(.top, 1)
            Text(item.displayText)
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
                .fill(highlight ? acc.opacity(0.07) : SpTheme.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                        .stroke(highlight ? acc.opacity(0.28) : SpTheme.cardStroke, lineWidth: 1)
                )
        )
    }

    private func commentaryMinute(_ item: SpCommentaryItem) -> String {
        guard item.minute > 0 else { return "—" }
        if let x = item.extraMinute, x > 0 { return "\(item.minute)'+\(x)" }
        return "\(item.minute)'"
    }

    // نوع اللحظة من flags + نص العرض (عربي أو إنجليزي حسب اللغة).
    private func commentaryKind(_ item: SpCommentaryItem) -> String {
        let t = item.displayText.lowercased()
        if item.goal || t.hasPrefix("هدف") || t.hasPrefix("goal") { return "goal" }
        if t.contains("بطاقة حمراء") || t.contains("red card") { return "red" }
        if t.contains("بطاقة صفراء") || t.contains("yellow card") { return "yellow" }
        if t.contains("ضربة جزاء") || t.contains("ركلة جزاء") || t.contains("penalty") { return "penalty" }
        if t.contains("ركلة ركنية") || t.contains("corner") { return "corner" }
        if t.contains("تبديل") || t.contains("substitution") { return "substitution" }
        if t.hasPrefix("تصدٍّ") || t.contains("تصدّى") || t.contains("save") { return "shot-saved" }
        if t.hasPrefix("تسديدة محالة") || t.hasPrefix("أهدر") || t.contains("miss") { return "shot-missed" }
        if t.contains("صافرة النهاية") || t.contains("full time") || t.contains("full-time") { return "fulltime" }
        if t.contains("الوقت بدل الضائع") || t.contains("added time") || t.contains("stoppage") { return "added-time" }
        if t.contains("بداية الشوط") || t.contains("نهاية الشوط") || t.contains("half") || t.contains("kick-off") || t.contains("kick off") { return "period" }
        return "other"
    }

    @ViewBuilder private func commentaryIcon(_ kind: String) -> some View {
        switch kind {
        case "goal":
            Image(systemName: "soccerball").font(.system(size: 14, weight: .bold)).foregroundStyle(acc)
        case "yellow":
            RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                .fill(SpTheme.yellowCard).frame(width: 12, height: 16)
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
            Image(systemName: "hand.raised.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(acc)
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
                    Capsule().fill(acc)
                        .frame(width: geo.size.width * CGFloat(h / total))
                    Capsule().fill(acc.opacity(0.7))
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

    /// الرسمية إن كان فيها أساسيون؛ وإلا المتوقعة بشارة تحذيرية؛ وإلا ما توفّر.
    /// حكم المباراة ضمن التشكيلة للمباريات المنطلقة (قرار 2026-07-04). أمّا القادمة
    /// فحكمها يظهر أعلى المركز تحت «الوقت المتبقّي» (قرار 2026-07-09) — فلا نكرّره هنا.
    @ViewBuilder
    private func lineupsSection(_ d: SpMatchDetail) -> some View {
        VStack(spacing: 14) {
            if fixture?.started == true { refereeCard }
            if d.lineups.contains(where: { !$0.startXI.isEmpty }) {
                lineupsView(d.lineups)
            } else if hasExpectedLineup {
                VStack(spacing: 12) {
                    expectedBadge
                    lineupsView(expectedAsLineups(d))
                }
            } else {
                lineupsView(d.lineups)
            }
        }
    }

    private var expectedBadge: some View {
        // «تشكيلة متوقعة» — رقاقة محايدة بلا برتقالي (لون محوري واحد للتطبيق).
        HStack(spacing: 8) {
            Text(L("تشكيلة متوقعة"))
                .font(SportsFonts.app(size: 11, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)
                .padding(.horizontal, 10).padding(.vertical, 3)
                .background(Capsule().fill(SpTheme.chipFill))
            Text(L("ترشيح المزوّد قبل الإعلان الرسمي — قد تتغيّر"))
                .font(SportsFonts.app(size: 11))
                .foregroundStyle(SpTheme.onDarkDim)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8).padding(.horizontal, 12)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SpTheme.chipFill.opacity(0.5)))
        .padding(.horizontal, 16)
    }

    /// تحويل المتوقعة لشكل SpLineup لتُرسم بنفس الملعب. id=0 يعطّل فتح بطاقة اللاعب.
    private func expectedAsLineups(_ d: SpMatchDetail) -> [SpLineup] {
        guard let e = expectedLineup else { return [] }
        func convert(_ side: SpExpectedSide?, team: SpTeam) -> SpLineup? {
            guard let side else { return nil }
            return SpLineup(
                team: team,
                formation: side.formation,
                coach: nil,
                startXI: side.starters.map {
                    SpLineupPlayer(id: 0, number: $0.jersey, name: $0.name, pos: "", grid: $0.grid ?? "2:1")
                },
                substitutes: side.bench.map {
                    SpLineupPlayer(id: 0, number: $0.jersey, name: $0.name, pos: "", grid: nil)
                }
            )
        }
        return [convert(e.home, team: d.fixture.home), convert(e.away, team: d.fixture.away)].compactMap { $0 }
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
                Label(Lf("المدرب: %@", coach), systemImage: "person.fill")
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
        // id=0 (تشكيلة متوقعة) — لا صفحة لاعب لفتحها
        Button { if p.id > 0 { selectedPlayer = IDBox(id: p.id) } } label: {
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
                Image(systemName: "figure.seated.side").font(.system(size: 11, weight: .bold)).foregroundStyle(acc)
                Text(L("دكة البدلاء")).font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(acc)
                Text("(\(subs.count))").font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkDim)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(Array(subs.enumerated()), id: \.offset) { _, p in
                    Button { if p.id > 0 { selectedPlayer = IDBox(id: p.id) } } label: { benchRow(p) }
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
                .background(Circle().fill(acc.opacity(0.15)))
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
                .foregroundStyle(starter ? acc : SpTheme.onDarkFaint)
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
            sectionTitle(L("الأهداف المتوقّعة (xG)"), icon: "scope")
            compareRow("xG", home: x.home.xg, away: x.away.xg, fmt: "%.2f")
            compareRow(L("على المرمى (xGOT)"), home: x.home.xgot, away: x.away.xgot, fmt: "%.2f")
            if !x.topPlayers.isEmpty {
                divider
                ForEach(Array(x.topPlayers.prefix(4).enumerated()), id: \.offset) { _, p in
                    HStack(spacing: 8) {
                        Circle().fill(p.location == "home" ? acc : SpTheme.onDarkDim).frame(width: 7, height: 7)
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
        // الاستحواذ يُعرض في تبويب «الإحصاءات» — لا نكرّره هنا؛ الرسم للزخم وحده.
        VStack(spacing: 12) {
            sectionTitle(L("الزخم"), icon: "waveform.path.ecg")
            if !m.points.isEmpty {
                SpFlowChart(points: m.points, homeColor: acc)
                chartLegend
            }
        }
        .padding(16).background(analysisCardBg)
    }

    private func pressureCard(_ p: SpPressure) -> some View {
        VStack(spacing: 12) {
            sectionTitle(L("مؤشّر الضغط"), icon: "gauge.with.dots.needle.50percent")
            SpFlowChart(points: downsample(p.points, maxCount: 24), homeColor: acc)
            chartLegend
        }
        .padding(16).background(analysisCardBg)
    }

    private func factsCard(_ f: SpMatchFacts) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle(L("وقائع المباراة"), icon: "sparkles")
            if let ht = f.halftime, let h = ht.home, let a = ht.away {
                factRow(L("نتيجة الشوط الأول"), "\(h) - \(a)", ltr: true)
            }
            if let w = f.weather {
                let txt = [w.temp.map { "\($0)°" }, w.description, w.humidity.map { "\(L("رطوبة")) \($0)" }]
                    .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                if !txt.isEmpty { factRow(L("الطقس"), txt) }
            }
            if !f.absentees.isEmpty {
                divider
                Text(L("الغيابات")).font(SportsFonts.app(size: 12, weight: .bold)).foregroundStyle(SpTheme.emeraldDeep)
                ForEach(Array(f.absentees.prefix(6).enumerated()), id: \.offset) { _, ab in
                    HStack(spacing: 8) {
                        Circle().fill(ab.location == "home" ? acc : SpTheme.onDarkDim).frame(width: 7, height: 7)
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
            Image(systemName: icon).font(.system(size: 14, weight: .bold)).foregroundStyle(acc)
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
                    Capsule().fill(acc).frame(width: geo.size.width * CGFloat(home / total))
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
            legendDot(acc, detail?.fixture.home.name ?? L("المضيف"))
            legendDot(SpTheme.onDarkDim, detail?.fixture.away.name ?? L("الضيف"))
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
                    // «أفضل لاعب» تميّز — بذهبيّ التميّز لا اللون المحوري.
                    HStack(spacing: 5) {
                        Image(systemName: "star.fill").font(.system(size: 10, weight: .bold)).foregroundStyle(SpTheme.excellence)
                        Text(L("أفضل لاعب في المباراة")).font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(SpTheme.excellence)
                    }
                    Text(m.name).font(SportsFonts.app(size: 16, weight: .heavy)).foregroundStyle(SpTheme.onDark).lineLimit(1)
                    Text(m.team).font(SportsFonts.app(size: 11.5, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
                }
                Spacer(minLength: 0)
                ratingBadge(m.rating)
            }
            .padding(13).frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.excellence.opacity(0.07)))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
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
                        if p.captain == true { Image(systemName: "c.square.fill").font(.system(size: 11)).foregroundStyle(acc) }
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
                        .font(SportsFonts.app(size: 11, weight: .bold)).foregroundStyle(acc)
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
            // التقييم العالي (≥7) تميّز بذهبيّ التميّز؛ 6–7 محايد و<6 قرمزي.
            .background(Capsule().fill(r >= 7 ? SpTheme.excellence : (r >= 6 ? SpTheme.onDarkDim : SpTheme.crimson)))
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
                h2hStat("\(s.homeWins)", home?.name ?? L("المضيف"), acc)
                h2hStat("\(s.draws)", L("تعادل"), SpTheme.onDarkDim)
                h2hStat("\(s.awayWins)", away?.name ?? L("الضيف"), SpTheme.onDark)
            }
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule().fill(acc).frame(width: geo.size.width * CGFloat(s.homeWins) / CGFloat(total))
                    Capsule().fill(SpTheme.onDarkFaint.opacity(0.45)).frame(width: geo.size.width * CGFloat(s.draws) / CGFloat(total))
                    Capsule().fill(SpTheme.onDarkDim).frame(width: geo.size.width * CGFloat(s.awayWins) / CGFloat(total))
                }
            }.frame(height: 8)
            Text(Lf("آخر %d لقاءات بين الفريقين", s.total))
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

    // MARK: - الاستطلاع اللحظي

    /// استطلاع دوري أثناء جريان المباراة — يجلب التفاصيل الطازجة (الأهداف/الكروت/
    /// الدقيقة/النتيجة) تلقائيًّا كما يفعل الويب. يتوقّف عند انتهاء المباراة، ويبقى
    /// بإيقاع أبطأ للمباراة القادمة القريبة كي يلتقط لحظة الانطلاق.
    private func pollLive() async {
        while !Task.isCancelled {
            let f = detail?.fixture ?? preview
            // المباراة منتهية أو غير معروفة → لا حاجة للاستطلاع.
            if f == nil || f?.status.finished == true { return }
            let live = f?.status.live == true
            let secsToKickoff = f?.kickoff.timeIntervalSinceNow ?? .greatestFiniteMagnitude
            if !live && secsToKickoff > 1800 {
                // بعيدة: نَم حتى ما قبل النافذة (بدل الانسحاب — الشاشة قد تبقى مفتوحة).
                let wait = min(secsToKickoff - 1700, 3600)
                try? await Task.sleep(nanoseconds: UInt64(max(wait, 30)) * 1_000_000_000)
                continue
            }
            let seconds: UInt64 = live ? 10 : 25
            try? await Task.sleep(nanoseconds: seconds * 1_000_000_000)
            if Task.isCancelled { return }
            // شبكة أمان صرفة: البث الحيّ متصل وتحديث عبر ختمه قبل < 10ث → الجلب مكرر.
            if liveStream.connected, Date().timeIntervalSince(lastLiveRefresh) < 10 { continue }
            await refreshLive()
        }
    }

    /// إعادة جلب التفاصيل اللحظية فقط (طازجة بلا كاش) — خفيفة مقارنةً بـ load الكامل.
    /// جلبة واحدة في كل لحظة: نبضتا الختم «s:»/«w:» والاستطلاع تصل معًا أحيانًا.
    private func refreshLive() async {
        guard !refreshInFlight else { return }
        refreshInFlight = true
        defer { refreshInFlight = false }
        guard let fresh = try? await APIClient.shared.fetchMatchDetail(id: fixtureId, ignoreCache: true)
        else { return }
        lastLiveRefresh = Date()
        self.detail = fresh
        // حدّث نشاط شاشة القفل بأحدث نتيجة/حدث (no-op إن لم يكن قائمًا).
        liveActivity.update(with: liveActivityFixture(fresh.fixture), lastEvent: lastEventText(fresh.events))
        // التعليق اللحظي المُعرَّب — أفضل جهد دائمًا (لا نشترط وجوده سابقًا:
        // التعليق قد يبدأ بعد فتح الشاشة فيظهر تبويبه حال توفّره).
        if let c = try? await APIClient.shared.fetchCommentary(matchId: fixtureId, ignoreCache: true) {
            self.commentary = c
        }
    }

    // MARK: - التحميل

    private func load() async {
        // التفاصيل أساسية؛ نفتح المركز فور وصولها ثم نُثري على موجتين حتى لا
        // ينتظر المستخدم مخططات xG قبل أول إطار، ولا تُسلسل H2H بعد طلبات ثقيلة.
        do {
            self.detail = try await APIClient.shared.fetchMatchDetail(id: fixtureId)
            self.loadError = nil
            if let d = self.detail {
                liveActivity.update(with: liveActivityFixture(d.fixture), lastEvent: lastEventText(d.events))
            }
        } catch {
            if let preview {
                self.detail = SpMatchDetail(
                    fixture: preview,
                    events: [],
                    statistics: nil,
                    lineups: [],
                    leagueId: nil
                )
                self.loadError = nil
            } else {
                self.loadError = error.localizedDescription
            }
        }
        self.loading = false
        if Task.isCancelled { return }
        await recordMatchViewIfNeeded()
        await Task.yield()
        if Task.isCancelled { return }
        await loadPrimaryEnrichments()
        if Task.isCancelled { return }
        await loadSecondaryEnrichments()
    }

    /// موجة 1 — ما يظهر قرب الترويسة دون عاصفة طلبات ثقيلة.
    private func loadPrimaryEnrichments() async {
        let f = preview ?? detail?.fixture
        let needExpected = detail.map { d in
            !d.fixture.status.finished && !d.lineups.contains(where: { !$0.startXI.isEmpty })
        } ?? false
        let slug = f?.competitionSlug ?? ""

        async let commentaryOpt = (try? APIClient.shared.fetchCommentary(matchId: fixtureId))
        async let expectedOpt: SpExpectedLineups? = needExpected
            ? (try? await APIClient.shared.fetchExpectedLineup(matchId: fixtureId)) : nil
        async let h2hOpt: SpH2HResponse? = {
            guard let f else { return nil }
            return try? await APIClient.shared.fetchH2H(home: f.home.id, away: f.away.id)
        }()
        async let strengthOpt: [Int: VaraTeamStrength]? = {
            guard !slug.isEmpty else { return nil }
            if slug == "world-cup" {
                guard let wc = try? await APIClient.shared.fetchWorldCupStandings() else { return nil }
                var m: [Int: VaraTeamStrength] = [:]
                for g in wc.groups { for row in g.rows { m[row.team.id] = VaraTeamStrength(wcRow: row) } }
                return m.isEmpty ? nil : m
            }
            guard let st = try? await APIClient.shared.fetchStandings(comp: slug) else { return nil }
            var m: [Int: VaraTeamStrength] = [:]
            for row in st.standings { m[row.team.id] = VaraTeamStrength(row: row) }
            return m.isEmpty ? nil : m
        }()
        // tv خفيف؛ المعاينة الذكية/الهدافون تُؤجَّل لتبويب «تقديم» (كانت ~10ث)
        async let tvOpt: SpMatchTv? = (f.map { !$0.started } ?? false)
            ? (try? await APIClient.shared.get(
                SpMatchTv.self, path: "/sports/match/\(fixtureId)/tv", apiRoot: URLConstants.publicAPI))
            : nil

        self.commentary = await commentaryOpt
        self.expectedLineup = await expectedOpt
        self.h2h = await h2hOpt
        if let m = await strengthOpt { self.strength = m }
        self.tv = await tvOpt
    }

    /// موجة 2 — حقائق للأحداث فقط؛ بقية المخططات عند فتح تبويبها.
    private func loadSecondaryEnrichments() async {
        if facts == nil {
            self.facts = try? await APIClient.shared.fetchMatchFacts(matchId: fixtureId)
        }
        await ensureSegmentData(effectiveSegment)
    }

    /// جلب كسول لإثراء التبويب الحالي — يمنع 5+ طلبات SportMonks عند كل فتح.
    private func ensureSegmentData(_ s: Segment) async {
        switch s {
        case .preview:
            let f = preview ?? detail?.fixture
            guard let f, !f.started else { return }
            if previewNote == nil {
                previewNote = try? await APIClient.shared.get(
                    SpMatchPreview.self, path: "/sports/match/\(fixtureId)/preview", apiRoot: URLConstants.publicAPI)
            }
            if homeScorers.isEmpty {
                homeScorers = (try? await APIClient.shared.get(
                    SpTeamScorersResponse.self, path: "/sports/team/\(f.home.id)/scorers", apiRoot: URLConstants.publicAPI)
                )?.scorers ?? []
            }
            if awayScorers.isEmpty {
                awayScorers = (try? await APIClient.shared.get(
                    SpTeamScorersResponse.self, path: "/sports/team/\(f.away.id)/scorers", apiRoot: URLConstants.publicAPI)
                )?.scorers ?? []
            }
        case .analysis:
            async let xgOpt: SpXg? = {
                if let xg { return xg }
                return try? await APIClient.shared.fetchXg(matchId: fixtureId)
            }()
            async let momOpt: SpMomentum? = {
                if let momentum { return momentum }
                return try? await APIClient.shared.fetchMomentum(matchId: fixtureId)
            }()
            async let presOpt: SpPressure? = {
                if let pressure { return pressure }
                return try? await APIClient.shared.fetchPressure(matchId: fixtureId)
            }()
            self.xg = await xgOpt
            self.momentum = await momOpt
            self.pressure = await presOpt
            if facts == nil {
                self.facts = try? await APIClient.shared.fetchMatchFacts(matchId: fixtureId)
            }
        case .ratings:
            if ratings == nil {
                self.ratings = try? await APIClient.shared.fetchMatchPlayers(matchId: fixtureId)
            }
        case .stats:
            if xg == nil {
                self.xg = try? await APIClient.shared.fetchXg(matchId: fixtureId)
            }
            if facts == nil {
                self.facts = try? await APIClient.shared.fetchMatchFacts(matchId: fixtureId)
            }
        case .events:
            if facts == nil {
                self.facts = try? await APIClient.shared.fetchMatchFacts(matchId: fixtureId)
            }
        case .commentary, .lineups, .h2h:
            break
        }
    }

    private func recordMatchViewIfNeeded() async {
        guard auth.isLoggedIn, !recordedMatchView else { return }
        guard let f = detail?.fixture ?? preview else { return }
        recordedMatchView = true
        try? await APIClient.shared.recordMatchView(f)
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

// MARK: - نص رؤية VARA القابل للتوسّع (3 أسطر ثم «اقرأ المزيد»)
//
// نقصّ النص على 3 أسطر ونُظهر زر التوسّع فقط حين يتجاوزها فعلًا. كشف التجاوز
// بلا افتراضات: نقيس ارتفاع النص كاملًا مقابل ارتفاعه مقصوصًا على الحدّ عبر
// نصّين خفيّين في الخلفية (fixedSize يجعلهما يأخذان ارتفاعهما المثالي رغم قصّ
// النص الظاهر)، فيصحّ الكشف لأي طول/لغة/عرض شاشة.
private struct SpVisionText: View {
    let text: String
    var collapsedLimit: Int = 3

    @State private var expanded = false
    @State private var fullHeight: CGFloat = 0
    @State private var clampHeight: CGFloat = 0

    private var isTruncated: Bool { fullHeight > clampHeight + 1 }
    // الخطّ وتباعد الأسطر مشتركان بين النص الظاهر ونصّي القياس — أي تعديل هنا
    // يبقي كشف التجاوز متطابقًا (لا انحراف صامت).
    private let font = SportsFonts.app(size: 13.5)
    private let lineSpace: CGFloat = 4

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(text)
                .font(font).foregroundStyle(SpTheme.onDarkDim)
                .lineSpacing(lineSpace)
                .lineLimit(expanded ? nil : collapsedLimit)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(measurer)

            if isTruncated {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { expanded.toggle() }
                } label: {
                    Text(expanded ? L("عرض أقل") : L("اقرأ المزيد"))
                        .font(SportsFonts.app(size: 12.5, weight: .bold))
                        .foregroundStyle(SpTheme.gold)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // خلفية خفيّة تقيس ارتفاعين: النص كاملًا، والنص مقصوصًا على الحدّ.
    private var measurer: some View {
        ZStack {
            Text(text)
                .font(font).lineSpacing(lineSpace)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(GeometryReader { g in
                    Color.clear.preference(key: SpVisionFullHeightKey.self, value: g.size.height)
                })
            Text(text)
                .font(font).lineSpacing(lineSpace)
                .lineLimit(collapsedLimit)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(GeometryReader { g in
                    Color.clear.preference(key: SpVisionClampHeightKey.self, value: g.size.height)
                })
        }
        .hidden()
        .allowsHitTesting(false)
        .onPreferenceChange(SpVisionFullHeightKey.self) { fullHeight = $0 }
        .onPreferenceChange(SpVisionClampHeightKey.self) { clampHeight = $0 }
    }
}

private struct SpVisionFullHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

private struct SpVisionClampHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}
