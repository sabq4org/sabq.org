import SwiftUI

// مركز التوقّعات — نظام بركة متدرّجة مشتركة (pari-mutuel) معمّم على كل البطولات.
// لكل مباراة بركة 1000 نقطة (+ جاكبوت متراكم للبطولة) تُقسَّم 50/30/20 على
// طبقات: النتيجة الدقيقة / الفارق الصحيح / النتيجة الصحيحة، وتُوزَّع بالتساوي
// على فائزي كل طبقة. خمسة تبويبات: المباريات · توقّعاتي · المتصدّرون · البطل
// والهدّاف · الإنجازات. يُخفى التبويب عند تعطيل المسابقة في الخادم (503).
struct PredictionsHubView: View {
    @Environment(SpAuthStore.self) private var auth

    enum Tab: String, CaseIterable {
        case matches, mine, leaders, long, badges, howto
        var label: String {
            switch self {
            case .matches: return "المباريات"
            case .mine: return "توقّعاتي"
            case .leaders: return "المتصدّرون"
            case .long: return "البطل والهدّاف"
            case .badges: return "الإنجازات"
            case .howto: return "كيف تلعب؟"
            }
        }
    }

    @State private var tab: Tab = .matches

    // المباريات + إحصاءاتي + الجاكبوت
    @State private var matches: [SpPredictableMatch] = []
    @State private var me: SpMeStats?
    @State private var jackpot = 0
    @State private var loadingToday = true
    @State private var todayError: String?

    // توقّعاتي
    @State private var mine: [SpMyPredictionRow] = []
    @State private var loadingMine = false
    @State private var mineLoaded = false
    @State private var mineError: String?

    // المتصدّرون
    @State private var leaders: [SpPoolLeader] = []
    @State private var loadingLeaders = false
    @State private var leadersLoaded = false
    @State private var leadersError: String?

    // الميزة معطّلة في الخادم؟
    @State private var featureOff = false

    // احتفال الفوز (يُعرض مرّة لكل مباراة فائزة) — نتتبّع المعروضة محليًّا.
    @AppStorage("sp_seen_wins") private var seenWinsRaw = ""
    @State private var celebration: SpMyPredictionRow?

    private var seenWins: Set<Int> {
        Set(seenWinsRaw.split(separator: ",").compactMap { Int($0) })
    }

    // تُعرَض مدفوعةً داخل ستاك «حسابي» (لا NavigationStack داخليّ هنا تفاديًا للتداخل).
    var body: some View {
        Group {
            if featureOff {
                SpEmptyState(icon: "hourglass",
                             title: "المسابقة قريبًا",
                             subtitle: "نظام التوقّعات المتطوّر سيُفتح قريبًا — ترقّبه!")
                    .padding(16)
            } else {
                ScrollView {
                    VStack(spacing: 18) {
                        hero
                        segmented
                        tabContent
                    }
                    .padding(16)
                }
            }
        }
        .background(SpAmbientBackground())
        .navigationTitle("التوقّعات")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadToday() }
        .refreshable { await reloadCurrent(force: true) }
        .sheet(item: $celebration) { row in
            SpWinCelebration(row: row) { markSeen(row.fixtureId) }
                .presentationDetents([.medium, .large])
        }
    }

    // MARK: - الترويسة (الجاكبوت + إحصاءاتي + شرح النقاط)

    private var hero: some View {
        VStack(spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: "rosette")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(SpTheme.gold)
                    .frame(width: 48, height: 48)
                    .background(Circle().fill(SpTheme.gold.opacity(0.12)))
                VStack(alignment: .leading, spacing: 2) {
                    Text("الجائزة المتراكمة")
                        .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("\(jackpot + 1000)")
                            .font(SportsFonts.app(size: 26, weight: .heavy)).foregroundStyle(SpTheme.green)
                            .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                        Text("نقطة").font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                    }
                }
                Spacer(minLength: 0)
            }

            if auth.isLoggedIn, let me {
                HStack(spacing: 0) {
                    heroStat("\(me.points)", "نقطة")
                    divider
                    heroStat("\(me.exact)", "دقيقة")
                    divider
                    heroStat("\(me.correct)", "صحيحة")
                    divider
                    heroStat(me.currentStreak > 0 ? "🔥\(me.currentStreak)" : "0", "سلسلة")
                    divider
                    heroStat(me.rank != nil ? "#\(me.rank!)" : "—", "ترتيبك")
                }
                streakMeter(me)
            } else if !auth.isLoggedIn {
                Text("سجّل الدخول من «حسابي» للمنافسة وجمع النقاط.")
                    .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            scoringExplainer
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.card)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
        )
    }

    private var divider: some View {
        Rectangle().fill(SpTheme.outline).frame(width: 1, height: 30)
    }

    // عدّاد السلسلة المرئي — تقدّم نحو المعلم التالي: ٣ (شارة 🔥 «سلسلة ملتهبة») ثم ٥ ثم ١٠.
    @ViewBuilder private func streakMeter(_ me: SpMeStats) -> some View {
        if me.currentStreak < 10 {
            let target = me.currentStreak < 3 ? 3 : (me.currentStreak < 5 ? 5 : 10)
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text("🔥").font(.system(size: 11))
                    Text(me.currentStreak >= 3
                         ? "سلسلة ملتهبة! واصل نحو \(target) متتالية"
                         : "سلسلتك \(me.currentStreak)/\(target) نحو شارة «سلسلة ملتهبة»")
                        .font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                    Spacer(minLength: 0)
                }
                HStack(spacing: 4) {
                    ForEach(0..<target, id: \.self) { i in
                        Capsule()
                            .fill(i < me.currentStreak ? SpTheme.green : SpTheme.chipFill)
                            .frame(height: 6)
                    }
                }
            }
        }
    }

    private func heroStat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(SportsFonts.app(size: 17, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                .monospacedDigit().environment(\.layoutDirection, .leftToRight)
            Text(label).font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint)
        }
        .frame(maxWidth: .infinity)
    }

    private var scoringExplainer: some View {
        HStack(spacing: 6) {
            explainerPill("🎯", "دقيقة", "50٪", SpTheme.green)
            explainerPill("📏", "فارق", "30٪", SpTheme.greenSoft)
            explainerPill("✅", "نتيجة", "20٪", SpTheme.teal)
        }
    }

    private func explainerPill(_ emoji: String, _ title: String, _ pct: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text("\(emoji) \(title)").font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDark)
            Text("\(pct) من البركة").font(SportsFonts.app(size: 9)).foregroundStyle(SpTheme.onDarkFaint)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: SpTheme.chipRadius, style: .continuous).fill(color.opacity(0.10)))
    }

    // MARK: - شريط التبويبات

    private var segmented: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Tab.allCases, id: \.self) { t in
                    let active = tab == t
                    Button {
                        withAnimation(.easeOut(duration: 0.2)) { tab = t }
                        Task { await reloadCurrent(force: false) }
                    } label: {
                        Text(t.label)
                            .font(SportsFonts.app(size: 13, weight: active ? .bold : .semibold))
                            .foregroundStyle(active ? .white : SpTheme.onDarkDim)
                            .padding(.horizontal, 14).padding(.vertical, 9)
                            .background(
                                Capsule().fill(active ? SpTheme.green : SpTheme.chipFill)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    // MARK: - محتوى التبويب

    @ViewBuilder private var tabContent: some View {
        switch tab {
        case .matches: matchesTab
        case .mine: mineTab
        case .leaders: leadersTab
        case .long: SpLongPredictionsView()
        case .badges: badgesTab
        case .howto: howToTab
        }
    }

    @ViewBuilder private var matchesTab: some View {
        if loadingToday {
            SpLoading()
        } else if let todayError {
            SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: todayError)
        } else if matches.isEmpty {
            SpEmptyState(icon: "calendar", title: "لا مباريات للتوقّع الآن",
                         subtitle: "تظهر هنا مباريات اليوم والغد القابلة للتوقّع")
        } else {
            VStack(spacing: 14) {
                ForEach(matches) { match in
                    SpPredictionMatchCard(match: match) { await loadToday(silent: true) }
                }
            }
        }
    }

    @ViewBuilder private var mineTab: some View {
        if !auth.isLoggedIn {
            loginPrompt
        } else if loadingMine {
            SpLoading()
        } else if let mineError {
            SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: mineError)
        } else if mine.isEmpty {
            SpEmptyState(icon: "soccerball", title: "لم تتوقّع بعد",
                         subtitle: "ابدأ من تبويب «المباريات» وستظهر توقّعاتك هنا")
        } else {
            SpMyPredictionsList(rows: mine)
        }
    }

    @ViewBuilder private var leadersTab: some View {
        if loadingLeaders {
            SpLoading()
        } else if let leadersError {
            SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: leadersError)
        } else if leaders.isEmpty {
            SpEmptyState(icon: "trophy", title: "لا متصدّرين بعد",
                         subtitle: "كن أول من يتصدّر بتوقّعاتك")
        } else {
            SpPoolLeaderboardList(leaders: leaders, myId: auth.member?.id)
        }
    }

    @ViewBuilder private var badgesTab: some View {
        if !auth.isLoggedIn {
            loginPrompt
        } else {
            SpBadgesGrid(earned: Set(me?.badges ?? []))
        }
    }

    private var loginPrompt: some View {
        SpEmptyState(icon: "person.crop.circle.badge.plus", title: "سجّل الدخول",
                     subtitle: "ادخل من تبويب «حسابي» للتوقّع والمنافسة على النقاط")
    }

    // MARK: - كيف تلعب؟ (شرح الفكرة وتوزيع النقاط — مطابق لخليجي 27)

    @ViewBuilder private var howToTab: some View {
        VStack(spacing: 14) {
            // الخطوات الثلاث
            howToCard(
                title: "الفكرة باختصار",
                rows: [
                    ("1.circle.fill", "توقّع النتيجة", "اختر نتيجة المباراة قبل انطلاقها — لكل مباراة بركة نقاط تُقتسم بين المصيبين."),
                    ("2.circle.fill", "تُسوّى تلقائيًا", "فور انتهاء المباراة تُوزَّع البركة على المصيبين كلٌّ حسب دقّة توقّعه."),
                    ("3.circle.fill", "اجمع وتصدّر", "نقاطك تُضاف لرصيدك وترفعك في لوحة المتصدّرين وتفتح لك الإنجازات."),
                ],
                tint: SpTheme.green)

            // طبقات البركة 50/30/20
            howToCard(
                title: "توزيع النقاط — بركة 1000",
                rows: [
                    ("target", "🎯 النتيجة الدقيقة — 50٪", "500 نقطة لمن أصاب النتيجة بالضبط (مثال 2-1)."),
                    ("ruler", "📏 الفارق الصحيح — 30٪", "300 نقطة لمن أصاب فارق الأهداف واتجاه النتيجة."),
                    ("checkmark.seal", "✅ النتيجة الصحيحة — 20٪", "200 نقطة لمن أصاب الفائز أو التعادل فقط."),
                ],
                tint: SpTheme.teal)

            // قواعد البركة المتدرّجة
            howToCard(
                title: "قواعد البركة المتدرّجة",
                rows: [
                    ("person.2.fill", "كلّما قلّوا زدت", "نصيب كل طبقة يُقسَّم بالتساوي على فائزيها — فكلّما قلّ المصيبون زاد نصيبك."),
                    ("crown.fill", "جائزة متراكمة (جاكبوت)", "إن لم يُصب أحدٌ طبقةً تراكمت نقاطها وأُضيفت لبركة المباراة التالية في البطولة."),
                    ("arrow.triangle.2.circlepath", "النتيجة المقلوبة لا تفوز", "يُحتسب الفائز حسب اتجاه النتيجة؛ توقّع 1-2 لا يُكافأ على مباراة انتهت 2-1."),
                ],
                tint: SpTheme.gold)

            // البطل والهدّاف
            howToCard(
                title: "البطل والهدّاف",
                rows: [
                    ("trophy.fill", "بركة منفصلة 5000", "لكل بطولة بركة مستقلّة للبطل وأخرى للهدّاف، تُقسَّم على المصيبين عند ختام البطولة."),
                    ("lock.open.fill", "مفتوحة حتى دور الثمانية", "توقّع البطل والهدّاف يبقى متاحًا حتى انطلاق ربع النهائي (دور الثمانية) ثم يُقفل."),
                ],
                tint: SpTheme.greenSoft)

            Text("التوقّعات للمتعة والمنافسة فقط — لا رهان ولا مقابل مادّي.")
                .font(SportsFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkFaint)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, 2)
        }
    }

    private func howToCard(title: String, rows: [(String, String, String)], tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(SportsFonts.subhead(size: 16))
                .foregroundStyle(SpTheme.onDark)
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: row.0)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(tint)
                        .frame(width: 30, height: 30)
                        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(tint.opacity(0.12)))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(row.1)
                            .font(SportsFonts.app(size: 13.5, weight: .bold))
                            .foregroundStyle(SpTheme.onDark)
                        Text(row.2)
                            .font(SportsFonts.app(size: 11.5, weight: .semibold))
                            .foregroundStyle(SpTheme.onDarkDim)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.card)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                    .stroke(SpTheme.cardStroke, lineWidth: 1))
        )
    }

    // MARK: - التحميل

    private func loadToday(silent: Bool = false) async {
        if !silent { loadingToday = true }
        do {
            let r = try await APIClient.shared.fetchPoolToday()
            matches = r.matches
            me = r.me
            jackpot = r.jackpot
            todayError = nil
            featureOff = false
            detectWin()
        } catch {
            if case APIError.server(503, _) = error { featureOff = true }
            else { todayError = (error as? APIError)?.errorDescription ?? "تعذّر التحميل" }
        }
        loadingToday = false
    }

    private func reloadCurrent(force: Bool) async {
        switch tab {
        case .matches:
            await loadToday(silent: !force && !matches.isEmpty)
        case .mine:
            if auth.isLoggedIn && (force || !mineLoaded) { await loadMine() }
        case .leaders:
            if force || !leadersLoaded { await loadLeaders() }
        case .long, .badges, .howto:
            break
        }
    }

    private func loadMine() async {
        loadingMine = true
        do {
            let r = try await APIClient.shared.fetchPoolMine()
            mine = r.predictions
            if let m = r.me { me = m }
            mineLoaded = true
            mineError = nil
            detectWin()
        } catch {
            // لا نتظاهر بقائمة فارغة — نعرض حالة خطأ (السحب للأسفل يعيد المحاولة).
            mineError = (error as? APIError)?.errorDescription ?? "تعذّر التحميل"
        }
        loadingMine = false
    }

    private func loadLeaders() async {
        loadingLeaders = true
        do {
            leaders = try await APIClient.shared.fetchPoolLeaderboard(ignoreCache: true)
            leadersLoaded = true
            leadersError = nil
        } catch {
            // لا نتظاهر بقائمة فارغة — نعرض حالة خطأ (السحب للأسفل يعيد المحاولة).
            leadersError = (error as? APIError)?.errorDescription ?? "تعذّر التحميل"
        }
        loadingLeaders = false
    }

    // MARK: - اكتشاف الفوز

    private func detectWin() {
        guard auth.isLoggedIn else { return }
        let seen = seenWins
        // أول مباراة فائزة مُسوّاة لم نحتفل بها بعد (من توقّعاتي أو من بطاقات اليوم).
        let fromMine = mine.first { $0.won && !seen.contains($0.fixtureId) }
        if let row = fromMine {
            celebration = row
        }
    }

    private func markSeen(_ fixtureId: Int) {
        var s = seenWins
        s.insert(fixtureId)
        seenWinsRaw = s.map(String.init).joined(separator: ",")
        celebration = nil
    }
}
