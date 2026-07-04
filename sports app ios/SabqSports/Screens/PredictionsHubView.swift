import SwiftUI

// مركز التوقّعات — نظام بركة متدرّجة مشتركة (pari-mutuel) معمّم على كل البطولات.
// لكل مباراة بركة 1000 نقطة (+ جاكبوت متراكم للبطولة) تُقسَّم 50/30/20 على
// طبقات: النتيجة الدقيقة / الفارق الصحيح / النتيجة الصحيحة، وتُوزَّع بالتساوي
// على فائزي كل طبقة. خمسة تبويبات: المباريات · توقّعاتي · المتصدّرون · البطل
// والهدّاف · الإنجازات. يُخفى التبويب عند تعطيل المسابقة في الخادم (503).
struct PredictionsHubView: View {
    @Environment(SpAuthStore.self) private var auth

    enum Tab: String, CaseIterable {
        case matches, mine, scorers, leaders, long, badges, howto
        var label: String {
            switch self {
            case .matches: return "المباريات"
            case .mine: return "توقّعاتي"
            case .scorers: return "الهدافون"
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

    // توقّعات الهدافين — تُحمّل مع المباريات وتمرَّر لكل بطاقة.
    @State private var scorerPicks: [Int: SpMyPickRow] = [:]
    @State private var scorerPicksLoaded = false

    // تبويب «الهدافون» — قائمة كل توقّعات الهدافين (match_scorer + first_scorer).
    @State private var myScorerPicks: [SpMyPickRow] = []
    @State private var loadingScorerPicks = false
    @State private var scorerPicksLoadedTab = false
    @State private var scorerPicksError: String?

    // قسمي الأسبوعي — يظهر كـ banner فوق القائمة.
    @State private var myDivision: SpMyDivision?
    @State private var divisionMeta: [String: SpDivisionMeta]?

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
            if let div = myDivision {
                divisionBanner(div)
            }
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

    // MARK: - بانر القسم الأسبوعي

    /// يعرض قسم المستخدم هذا الأسبوع: الاسم، الإيموجي، النقاط الأسبوعية،
    /// وموسميّة. لون البانر يطابق لون القسم من الـ backend.
    @ViewBuilder private func divisionBanner(_ div: SpMyDivision) -> some View {
        let info = divisionInfo(div.division)
        let colorHex = info.color
        HStack(spacing: 10) {
            Text(info.emoji).font(.system(size: 22))
            VStack(alignment: .leading, spacing: 2) {
                Text("قسمك هذا الأسبوع: \(info.name)")
                    .font(SportsFonts.app(size: 12.5, weight: .bold)).foregroundStyle(SpTheme.onDark)
                HStack(spacing: 8) {
                    Text("\(div.weekPoints) نقطة الأسبوع")
                        .font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkDim)
                    Text("·").foregroundStyle(SpTheme.onDarkFaint)
                    Text("\(div.seasonPoints) للموسم")
                        .font(SportsFonts.app(size: 10.5)).foregroundStyle(SpTheme.onDarkDim)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.left")
                .font(.system(size: 11, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
            .fill(colorHex.opacity(0.10))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .stroke(colorHex.opacity(0.35), lineWidth: 1)))
    }

    /// معلومات القسم — نُسخة iOS من DIVISION_META في الخادم.
    private func divisionInfo(_ d: Int) -> (name: String, emoji: String, color: Color) {
        switch d {
        case 1: return ("النوّاحة", "🔮", Color(red: 0.486, green: 0.227, blue: 0.922))
        case 2: return ("المحلّلون", "⭐", SpTheme.gold)
        case 3: return ("المتابعون", "🎯", SpTheme.teal)
        default: return ("الجمهور", "👀", SpTheme.onDarkDim)
        }
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
        case .scorers: scorersTab
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
                    SpPredictionMatchCard(
                        match: match,
                        scorerPick: scorerPicks[match.id],
                        onSubmitted: { await loadToday(silent: true) }
                    )
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

    @ViewBuilder private var scorersTab: some View {
        if !auth.isLoggedIn {
            loginPrompt
        } else if loadingScorerPicks {
            SpLoading()
        } else if let scorerPicksError {
            SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: scorerPicksError)
        } else if myScorerPicks.isEmpty {
            SpEmptyState(icon: "soccerball", title: "لم تتوقّع هدّافًا بعد",
                         subtitle: "اختر هدّاف كل مباراة من بطاقتها — ستظهر توقّعاتك هنا")
        } else {
            SpMyScorerPicksList(rows: myScorerPicks)
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
            // (1) الفكرة الجوهرية — ما هو النظام ولماذا ليس رهانًا.
            howToCard(
                title: "الفكرة من الألف للياء",
                rows: [
                    ("questionmark.circle.fill", "ما هذا؟", "لعبة توقّع مجانيّة بالكامل — لا تدفع شيئًا للمشاركة، والمكافآت كلّها نقاط ولاء قابلة للاستبدال داخل التطبيق."),
                    ("1.circle.fill", "توقّع ثم انتظر", "اختر نتيجة كل مباراة (وهدافها) قبل انطلاقها، ثم تُسوّى تلقائيًا فور انتهائها."),
                    ("2.circle.fill", "كلّما قلّ المصيبون زاد نصيبك", "النقاط لا تُمنح من رأس مال — بل تُقتسم بين المصيبين. فلو أصبت وحدك، أخذت البركة كاملة."),
                    ("3.circle.fill", "ارفع طبقتك وتصدّر", "نقاطك تُضاف لرصيد ولائك وتُرقّيك بين 5 طبقات، وفي الأسبوع تُرتّب في 4 أقسام متفاوتة."),
                ],
                tint: SpTheme.green)

            // (2) لماذا ليس رهانًا — توضيح قانوني صريح.
            howToCard(
                title: "ليست رهانًا — كيف؟",
                rows: [
                    ("hand.raised.fill", "دخول مجّاني", "لا تدفع مبلغًا ولا تخاطر بشيء. المشاركة مفتوحة لكل المستخدمين بلا مقابل."),
                    ("banknote", "سبق تموّل الجوائز", "بركة كل مباراة يدفعها تطبيق سبق من ميزانيته التسويقية، لا من خسائر المستخدمين."),
                    ("equal.circle", "توزيع عادل شفّاف", "البركة تُقسَّم بالتساوي بين المصيبين وفق قواعد معلنة — لا احتمالات يعدّلها أحد لصالحه."),
                    ("gift.fill", "مكافآت داخل التطبيق", "النقاط تُستبدل مزايا وجوائز داخل سبق، لا يمكن سحبها نقدًا."),
                ],
                tint: SpTheme.teal)

            // (3) طبقات توقّع النتيجة — تفصيل 50/30/20.
            howToCard(
                title: "طبقات النتيجة — بركة 1000",
                rows: [
                    ("target", "🎯 النتيجة الدقيقة — 50٪", "أصبت الرقمين بالضبط (مثال 2-1). نصيبك من البركة = 500 نقطة تُقسَّم على المصيبين."),
                    ("ruler", "📏 الفارق الصحيح — 30٪", "أصبت الفارق والاتجاه لا الرقمين (مثال توقّعت 3-1 وانتهت 2-0). نصيبك = 300 نقطة تُقسَّم."),
                    ("checkmark.seal", "✅ النتيجة الصحيحة — 20٪", "أصبت الفائز أو التعادل فقط. نصيبك = 200 نقطة تُقسَّم على المصيبين."),
                    ("arrow.triangle.2.circlepath", "النتيجة المقلوبة لا تفوز", "من أصاب الفائز لكن قلب الرقمين (توقّع 1-2 وانتهت 2-1) لا يُكافأ."),
                ],
                tint: SpTheme.greenSoft)

            // (4) الجاكبوت — كيف يتراكم ولماذا.
            howToCard(
                title: "الجائزة المتراكمة (الجاكبوت)",
                rows: [
                    ("crown.fill", "متى يتراكم؟", "عندما لا يُصب أحدٌ طبقةً (مثلاً نتيجة مفاجئة)، تترحّل نقاط تلك الطبقة للمباراة التالية في البطولة نفسها."),
                    ("flame.fill", "لماذا يكبر؟", "كل مباراة بلا فائز تُضيف نقاطها للتي بعدها، فتتضخّم الجائزة حتى يأتي من يصيبها."),
                    ("scope", "لكل بطولة جاكبوتها", "الجاكبوت مستقلّ لكل بطولة — كأس العالم له جاكبوت، ودوري روشن له آخر، وهكذا."),
                ],
                tint: SpTheme.gold)

            // (5) الهدافون — طبقة جديدة فوق النتيجة.
            howToCard(
                title: "توقّع الهداف ⚽",
                rows: [
                    ("soccerball", "هداف المباراة — بركة 300", "إضافةً لتوقّع النتيجة، اختر من سيسجّل. أصبت؟ تأخذ حصّتك من بركة 300 نقطة تُقسَّم على المصيبين."),
                    ("1.circle", "أول هدّاف — بركة 200", "اختر من سيفتتح التسجيل. بركة أصغر لكن مكافأة أعلى لأنّ التحدّي أصعب."),
                    ("person.2.crop.square.stack", "من قائمة اللاعبين الفعليّين", "تختار من تشكيلتي الفريقين اللتين تنزلان قبل المباراة. الأساسيّون والاحتياط ظاهرون."),
                    ("clock.fill", "قبل الانطلاق فقط", "يُقفل توقّع الهداف مع بداية المباراة تمامًا كتوقّع النتيجة."),
                ],
                tint: SpTheme.crimson)

            // (6) مضاعف طبقة الولاء — لماذا الولاء يرفع مكافأتك.
            howToCard(
                title: "مضاعف الولاء 🔮",
                rows: [
                    ("rosette", "كلّما ارتفع ولاؤك زاد نصيبك", "حصّتك من البركة تُضرب بمضاعف حسب طبقة ولائك: من 1.0× للقارئ الجديد إلى 1.5× لسفير سبق."),
                    ("chart.bar.fill", "مثال محسوب", "أصبت النتيجة الدقيقة ونصيبك 100 نقطة، وطبقتك «العضو الذهبي» (1.2×) → تحصل على 120 نقطة فعلية."),
                    ("arrow.up.circle.fill", "كيف أرفع طبقتي؟", "بالقراءة والتفاعل اليومي والمشاركة المنتظمة — لا بتوقّع واحد كبير. ولاؤك تراكمي طويل المدى."),
                ],
                tint: SpTheme.gold)

            // (7) الأقسام الأسبوعية — إحساس الدوري.
            howToCard(
                title: "الأقسام الأسبوعية 🏆",
                rows: [
                    ("person.3.sequence", "4 أقسام متفاوتة", "كل يوم سبت يُوزَّع المتنافسون على 4 أقسام حسب نقاطهم في الأسبوع: النوّاحة 🔮 · المحلّلون ⭐ · المتابعون 🎯 · الجمهور 👀."),
                    ("arrow.up.arrow.down.circle", "ترقية وهبوط كل أسبوع", "تُحسب نقاطك يوم السبت، فإن تحسّنت صعدت قسمًا أعلى، وإن تراجعت هبطت. إشعار يصلك بالتغيّر."),
                    ("1.lane", "أعلى 1٪ في النوّاحة", "القسم الأعلى يضمّ نخبة المتنبّئين في الأسبوع — شرفٌ ومكانة تظهر في ملفّك."),
                    ("calendar", "في أيّ يوم؟", "تُحسب الأقسام فجر كل سبت (00:00 بتوقيت الرياض) من نقاط الأسبوع المنتهي."),
                ],
                tint: SpTheme.teal)

            // (8) البطل والهداف طويل المدى.
            howToCard(
                title: "البطل والهداف — توقّعات البطولة",
                rows: [
                    ("trophy.fill", "بركة 5000 لكل نوع", "توقّع من سيفوز بالبطولة ومن سيكون هدّافها. بركة منفصلة 5000 لكل نوع تُسوّى عند ختام البطولة."),
                    ("lock.open.fill", "مفتوحة حتى دور الثمانية", "تبقى هذه التوقّعات متاحة حتى انطلاق ربع النهائي ثم تُقفل نهائيًا."),
                    ("hourglass", "مكافأة متأخّرة", "هذه التوقّعات لا تُسوّى إلا في نهاية البطولة — صبرك فيها يُكافأ بنقاط كبيرة."),
                ],
                tint: SpTheme.leaf)

            // (9) الإنجازات والشارات.
            howToCard(
                title: "الإنجازات والشارات 🏅",
                rows: [
                    ("star.fill", "شارات دائمة", "أصبت 5 نتائج دقيقة متتالية؟ تنال شارة «نوستراداموس». هذه الشارات تظهر في ملفّك للأبد."),
                    ("bolt.fill", "أنواع متعدّدة", "هناك شارات للدقّة، وللجرأة (توقّعت المفاجأة وأصبت)، وللاستمرار، وللهدافين — كلٌّ بقواعدها."),
                    ("gift", "مكافأة فورية", "كلّ شارة جديدة تمنحك نقاط ولاء إضافية لحظة نيلها."),
                ],
                tint: SpTheme.gold)

            // إخلاء المسؤولية الأخير.
            Text("🔒 التوقّعات للمتعة والمنافسة فقط — لا رهان ولا مقابل مادّي. كل المكافآت نقاط ولاء داخل تطبيق سبق.")
                .font(SportsFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(SpTheme.onDarkFaint)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, 6)
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
            if auth.isLoggedIn { await loadScorerPicks() }
            if auth.isLoggedIn { await loadDivision() }
        } catch {
            if case APIError.server(503, _) = error { featureOff = true }
            else { todayError = (error as? APIError)?.errorDescription ?? "تعذّر التحميل" }
        }
        loadingToday = false
    }

    /// يحمّل توقّعات الهدافين ويبني خريطة fixtureId → pick لتمريرها لكل بطاقة.
    private func loadScorerPicks() async {
        do {
            let r = try await APIClient.shared.fetchPoolMyPicks()
            var map: [Int: SpMyPickRow] = [:]
            for p in r.picks where p.kind == SpPickKind.matchScorer.rawValue {
                map[p.fixtureId] = p
            }
            scorerPicks = map
            scorerPicksLoaded = true
        } catch {
            // أخطاء الهدافين لا تُفشل المباريات — نُبقي القائمة تعمل.
        }
    }

    /// يحمّل قسم المستخدم الأسبوعي + ميتاداتا الأقسام لعرض الـ banner.
    private func loadDivision() async {
        do {
            let r = try await APIClient.shared.fetchMyDivision()
            myDivision = r.division
            divisionMeta = r.meta
        } catch {
            // غياب القسم ليس خطأً — المستخدم قد يكون جديداً لم يُصنَّف بعد.
        }
    }

    /// يحمّل قائمة توقّعات الهدافين الكاملة لتبويب «الهدافون».
    private func loadMyScorerPicks() async {
        loadingScorerPicks = true
        do {
            let r = try await APIClient.shared.fetchPoolMyPicks()
            myScorerPicks = r.picks.sorted(by: { (l, r) in
                (l.kickoffTs ?? 0) > (r.kickoffTs ?? 0)
            })
            scorerPicksLoadedTab = true
            scorerPicksError = nil
        } catch {
            scorerPicksError = (error as? APIError)?.errorDescription ?? "تعذّر التحميل"
        }
        loadingScorerPicks = false
    }

    private func reloadCurrent(force: Bool) async {
        switch tab {
        case .matches:
            await loadToday(silent: !force && !matches.isEmpty)
        case .mine:
            if auth.isLoggedIn && (force || !mineLoaded) { await loadMine() }
        case .scorers:
            if auth.isLoggedIn && (force || !scorerPicksLoadedTab) { await loadMyScorerPicks() }
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
