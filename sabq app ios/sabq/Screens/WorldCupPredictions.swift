import SwiftUI

// MARK: - مسابقة توقّعات كأس العالم 2026
//
// تكافؤ مع صفحة /world-cup/predictions على الويب: ثلاثة تبويبات —
// «مباريات اليوم» (إدخال التوقّع قبل القفل)، «توقّعاتي» (سجلّي ونتائجه)،
// و«المتصدّرون». المصادقة بجلسة العضو (Bearer) عبر /api/v1/world-cup/predictions/*.
// كل مباراة يُصيب نتيجتها بالضبط تمنح حصّة من 500 نقطة ولاء.

// أدوار خروج المغلوب لا تُحسم بتعادل، فنمنع توقّع التعادل فيها (نطابق roundEn
// الإنجليزي كما يفعل الخادم؛ المزوّد قد يُذيّل الاسم برقم مثل "Round of 16 - 1").
private let WC_KNOCKOUT_ROUND_PREFIXES = [
    "Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "3rd Place Final", "Final",
]
private let WC_DRAW_NOT_ALLOWED_MESSAGE = "لا يمكن توقع التعادل في خروج المغلوب — اختر فائزًا للمباراة"
private func wcIsKnockoutRound(_ roundEn: String) -> Bool {
    let r = roundEn.trimmingCharacters(in: .whitespaces)
    return WC_KNOCKOUT_ROUND_PREFIXES.contains { r == $0 || r.hasPrefix($0) }
}

// MARK: زر الدعوة في الهب

struct WCPredictCTA: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            // شريط هوية مسطّح (أخضر ثابت داكن): لا تدرّج ولا ظل ولا حدّ
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "target")
                    .font(SabqFonts.app(size: 20, weight: .semibold))
                    .foregroundStyle(WCTheme.heroTop)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(WCTheme.gold))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text("توقّع واربح")
                        .sabqText(SabqType.rowTitle).foregroundStyle(.white)
                    Text("أصِب النتيجة بالضبط واكسب من 500 نقطة لكل مباراة")
                        .sabqText(SabqType.meta).foregroundStyle(.white.opacity(0.85))
                        .lineLimit(2)
                }
                Spacer(minLength: SabqLayout.space4)
                Image(systemName: "chevron.left")
                    .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(WCTheme.gold)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, SabqLayout.space16).padding(.vertical, SabqLayout.space16)
            .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(WCTheme.heroTop))
        }
        .buttonStyle(.plain)
    }
}

// MARK: الشاشة الكاملة

struct WCPredictionsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    enum Tab: String, CaseIterable {
        case today = "مباريات اليوم", tournament = "توقّع البطل", mine = "توقّعاتي", board = "المتصدّرون"
    }
    @State private var tab: Tab = .today
    @State private var showLogin = false

    // احتفال الفوز (يُعرض مرّة واحدة لكل مباراة فائزة) — نتتبّع المعروضة محليًّا.
    @AppStorage("wc_seen_wins") private var seenWinsRaw = ""
    @State private var celebration: WCPredictionHistoryItem?
    /// آخر مباراة عُرض احتفالها — يقرؤها onDismiss لأن item يكون nil لحظتها.
    @State private var lastCelebratedFixtureId: String?

    private var seenWins: Set<String> {
        Set(seenWinsRaw.split(separator: ",").map(String.init))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                tabBar
                ScrollView(showsIndicators: false) {
                    Group {
                        switch tab {
                        case .today: WCPredTodayTab(showLogin: $showLogin)
                        case .tournament: WCPredTournamentTab(showLogin: $showLogin)
                        case .mine: WCPredMineTab(showLogin: $showLogin)
                        case .board: WCPredLeaderboardTab()
                        }
                    }
                    .padding(SabqLayout.pageMargin)
                }
            }
            .background(SabqTheme.background.ignoresSafeArea())
            .navigationTitle("مسابقة التوقّعات")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(WCTheme.stadiumTop, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white) }
                }
            }
            .sheet(isPresented: $showLogin) { LoginSheet() }
            .task(id: authStore.isLoggedIn) { await detectWin() }
            // onDismiss يسجّل «شوهد» أيضًا: السحب لأسفل كان يغلق الورقة دون
            // تسجيل فيتكرر الاحتفال ذاته في كل فتح لاحق للشاشة.
            .sheet(item: $celebration, onDismiss: {
                if let seen = lastCelebratedFixtureId { markWinSeen(seen) }
            }) { item in
                WCWinCelebration(item: item) { markWinSeen(item.fixtureId) }
                    .presentationDetents([.large])
                    .onAppear { lastCelebratedFixtureId = item.fixtureId }
            }
        }
        // شريط حالة أبيض على الرأس الأخضر: نفرض تفضيل النمط الداكن (يبيّض ساعة/
        // بطارية النظام) مع تثبيت بيئة الألوان على «فاتح» للمحتوى داخليًا — فتبقى
        // البطاقات بيضاء كما هي ولا تتأثّر بألوان WCTheme الديناميكية.
        .environment(\.colorScheme, .light)
        .preferredColorScheme(.dark)
        .sabqRTL()
    }

    private var tabBar: some View {
        // التبويبات على شريط الهوية الداكن: المختار أبيض بنص أخضر، والبقية شفافة بنص أبيض
        HStack(spacing: SabqLayout.space8) {
            ForEach(Tab.allCases, id: \.self) { t in
                Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                    Text(t.rawValue)
                        .sabqText(SabqType.tag)
                        .lineLimit(1).minimumScaleFactor(0.9)
                        .foregroundStyle(tab == t ? WCTheme.stadiumTop : .white)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: SabqLayout.touchTarget)
                        .background(Capsule().fill(tab == t ? Color.white : Color.white.opacity(0.12)))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, SabqLayout.pageMargin).padding(.top, SabqLayout.space12).padding(.bottom, SabqLayout.space12)
        .background(WCTheme.stadiumTop)
    }

    // MARK: - كشف الفوز

    // أول مباراة فائزة مُسوّاة لم نحتفل بها بعد — تُعرض بمجرّد فتح الشاشة.
    private func detectWin() async {
        guard authStore.isLoggedIn else { return }
        guard let mine = try? await APIClient.shared.fetchWCMyPredictions() else { return }
        let seen = seenWins
        if let row = mine.first(where: { $0.won && !seen.contains($0.fixtureId) }) {
            await MainActor.run { celebration = row }
        }
    }

    private func markWinSeen(_ fixtureId: String) {
        var s = seenWins
        s.insert(fixtureId)
        seenWinsRaw = s.joined(separator: ",")
        celebration = nil
    }
}

// MARK: - تبويب: مباريات اليوم

private struct WCPredTodayTab: View {
    @Binding var showLogin: Bool
    @Environment(AuthStore.self) private var authStore

    @State private var matches: [WCPredictableMatch] = []
    @State private var loading = true
    @State private var inputs: [Int: ScoreInput] = [:]
    @State private var submitting: Set<Int> = []
    @State private var toast: String?

    struct ScoreInput: Equatable { var home: Int; var away: Int }

    var body: some View {
        VStack(spacing: SabqLayout.space16) {
            if let toast {
                Text(toast)
                    .font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(SabqTheme.onAction)
                    .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space12)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium).fill(WCTheme.royal))
            }
            if loading {
                WCLoading().padding(.top, SabqLayout.space32)
            } else if matches.isEmpty {
                emptyText("لا توجد مباريات قابلة للتوقّع اليوم أو غدًا — تابع الجدول لاحقًا")
            } else {
                // بطاقات غير مؤطّرة تفصلها خطوط رفيعة
                VStack(spacing: 0) {
                    ForEach(Array(matches.enumerated()), id: \.element.id) { index, m in
                        if index > 0 { WCRowSeparator() }
                        card(m)
                    }
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        if let r = try? await APIClient.shared.fetchWCPredictionsToday(ignoreCache: true) {
            await MainActor.run {
                matches = r
                for m in r {
                    // بذر المدخل لمن لا مدخل محليًّا له فقط — إعادة البناء غير
                    // المشروطة كانت تمسح توقّعات المستخدم غير المُرسلة لبقية
                    // المباريات كلما أرسل توقّع مباراة واحدة (submit ينادي load).
                    guard inputs[m.fixture.id] == nil else { continue }
                    let seed = m.myPrediction
                    inputs[m.fixture.id] = ScoreInput(home: seed?.predHome ?? 0, away: seed?.predAway ?? 0)
                }
                loading = false
            }
        } else { await MainActor.run { loading = false } }
    }

    @ViewBuilder private func card(_ m: WCPredictableMatch) -> some View {
        let f = m.fixture
        VStack(spacing: SabqLayout.space12) {
            // الترويسة: المنتخبان + الموعد
            HStack {
                teamSide(f.home)
                VStack(spacing: SabqLayout.space4) {
                    Text(WCFormat.time(f))
                        .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
                    Text(f.round).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                }
                .frame(minWidth: 72)
                teamSide(f.away)
            }

            if m.locked {
                lockedView(m)
            } else if authStore.isLoggedIn {
                inputView(m)
            } else {
                Button { showLogin = true } label: {
                    Text("سجّل الدخول للتوقّع")
                        .sabqText(SabqType.button).foregroundStyle(SabqTheme.onAction)
                        .frame(maxWidth: .infinity).frame(minHeight: SabqLayout.controlHeight)
                        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(WCTheme.royal))
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "person.2.fill").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    .accessibilityHidden(true)
                Text("\(m.predictionsCount) مشارك").sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                Spacer()
                Text("الجائزة 500 نقطة").sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.warning)
            }
        }
        .padding(.vertical, SabqLayout.space16)
    }

    private func teamSide(_ team: WCTeam) -> some View {
        VStack(spacing: SabqLayout.space8) {
            WCTeamLogo(team: team, size: 44, ring: SabqTheme.separator)
            Text(team.name).font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // إدخال التوقّع (مضيف يمينًا في RTL — نعرض المضيف ثم الضيف)
    @ViewBuilder private func inputView(_ m: WCPredictableMatch) -> some View {
        let id = m.fixture.id
        let input = inputs[id] ?? ScoreInput(home: 0, away: 0)
        let saved = m.myPrediction
        // «غير محفوظ»: لا يوجد توقّع بعد، أو القيمة اختلفت عمّا حُفظ. نُظهر الزرّ
        // الأخضر الطويل في هذه الحالة فقط — وإلا سطر تأكيد هادئ، لتقليل ازدحام
        // الأخضر المتكرّر عبر البطاقات.
        let dirty = saved == nil || saved!.predHome != input.home || saved!.predAway != input.away
        // التعادل ممنوع في خروج المغلوب — نُظهر التنبيه فورًا (حتى لتوقّع محفوظ
        // مسبقًا بتعادل) ونُعطّل الحفظ حتى يختار المستخدم فائزًا.
        let drawNotAllowed = input.home == input.away && wcIsKnockoutRound(m.fixture.roundEn)
        VStack(spacing: SabqLayout.space12) {
            // المضيف يمينًا (تحت شعاره) والضيف يسارًا — مطابقةً لترتيب الشعارات في
            // الترويسة (RTL) ولعرض النتيجة/التوقّع (ضيف-مضيف). نُبقي فرض LTR لثبات
            // تخطيط الأرقام، لكن نرتّب الضيف أولًا ثم المضيف كي يقع عدّاد كل فريق
            // تحت شعاره — وإلا خُزِّن التوقّع مقلوبًا فظهر «لم تُصب» لتوقّع صحيح.
            HStack(spacing: 16) {
                stepper(value: input.away) { setAway(id, $0) }
                Text("-").font(SabqFonts.app(size: 18, weight: .semibold)).foregroundStyle(SabqTheme.textSecondary)
                stepper(value: input.home) { setHome(id, $0) }
            }
            .environment(\.layoutDirection, .leftToRight)

            if drawNotAllowed {
                Text(WC_DRAW_NOT_ALLOWED_MESSAGE)
                    .font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(SabqTheme.danger)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space8).padding(.horizontal, SabqLayout.space8)
                    .wcQuietBlock()
            }

            if dirty {
                Button { Task { await submit(m) } } label: {
                    HStack(spacing: SabqLayout.space8) {
                        if submitting.contains(id) {
                            ProgressView().controlSize(.small).tint(.white)
                        } else {
                            Image(systemName: saved != nil ? "checkmark.circle.fill" : "paperplane.fill")
                                .font(.system(size: 12))
                        }
                        Text(saved != nil ? "تحديث التوقّع" : "حفظ التوقّع")
                            .sabqText(SabqType.button)
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity).frame(minHeight: SabqLayout.controlHeight)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(drawNotAllowed ? SabqTheme.textSecondary : WCTheme.royal))
                }
                .buttonStyle(.plain)
                .disabled(submitting.contains(id) || drawNotAllowed)
            } else if !drawNotAllowed {
                HStack(spacing: SabqLayout.space4) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(SabqFonts.app(size: 13)).foregroundStyle(WCTheme.emeraldDeep)
                    Text("تم حفظ توقّعك")
                        .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                }
                .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space8)
            }
        }
    }

    private func stepper(value: Int, set: @escaping (Int) -> Void) -> some View {
        HStack(spacing: SabqLayout.space8) {
            stepBtn("minus") { if value > 0 { set(value - 1) } }
            Text("\(value)")
                .font(SabqFonts.app(size: 20, weight: .semibold).monospacedDigit())
                .foregroundStyle(SabqTheme.textPrimary).frame(minWidth: 30)
            stepBtn("plus") { if value < 20 { set(value + 1) } }
        }
        .padding(.horizontal, SabqLayout.space4).padding(.vertical, 2)
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
    }

    private func stepBtn(_ icon: String, _ action: @escaping () -> Void) -> some View {
        // خلفية خضراء فاتحة بأيقونة خضراء داكنة بدل الدائرة الصلبة + الظل —
        // واضحة وقابلة للّمس لكن هادئة (تقلّل ازدحام الأخضر في كل بطاقة).
        Button(action: action) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(WCTheme.emeraldDeep)
                .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func setHome(_ id: Int, _ v: Int) {
        var cur = inputs[id] ?? ScoreInput(home: 0, away: 0); cur.home = v; inputs[id] = cur
    }
    private func setAway(_ id: Int, _ v: Int) {
        var cur = inputs[id] ?? ScoreInput(home: 0, away: 0); cur.away = v; inputs[id] = cur
    }

    // عرض المباراة المقفلة: توقّعي + النتيجة النهائية إن سُوّيت
    @ViewBuilder private func lockedView(_ m: WCPredictableMatch) -> some View {
        VStack(spacing: SabqLayout.space8) {
            if let s = m.settlement, let fh = s.finalHome, let fa = s.finalAway {
                HStack(spacing: SabqLayout.space8) {
                    Text("النتيجة").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    wcScorePair(away: fa, home: fh, size: 15, color: SabqTheme.textPrimary)
                }
            }
            // خروج المغلوب: «1-1» وحدها مضلِّلة — نوضّح من حُسمت له بالترجيح.
            if let po = m.fixture.penaltyOutcome {
                Text("فاز \(po.winnerName) بالترجيح (\(po.winnerScore)-\(po.loserScore))")
                    .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(WCTheme.emeraldDeep)
                    .multilineTextAlignment(.center)
            }
            if let mine = m.myPrediction {
                HStack(spacing: 8) {
                    Text("توقّعك:").font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textPrimary)
                    wcScorePair(away: mine.predAway, home: mine.predHome, size: 12, color: SabqTheme.textPrimary)
                    statusBadge(mine.status, points: mine.pointsAwarded)
                }
            } else {
                Text("أُغلق التوقّع — انطلقت المباراة")
                    .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space12)
        .wcQuietBlock()
    }

    private func submit(_ m: WCPredictableMatch) async {
        let id = m.fixture.id
        guard let input = inputs[id] else { return }
        // حصانة خادمية مكرّرة على العميل: لا تعادل في خروج المغلوب.
        if input.home == input.away && wcIsKnockoutRound(m.fixture.roundEn) {
            await MainActor.run { showToast(WC_DRAW_NOT_ALLOWED_MESSAGE) }
            return
        }
        await MainActor.run { _ = submitting.insert(id) }
        do {
            _ = try await APIClient.shared.submitWCPrediction(fixtureId: id, predHome: input.home, predAway: input.away)
            await MainActor.run {
                submitting.remove(id)
                SabqHaptics.success()
                showToast("حُفظ توقّعك بنجاح")
            }
            await load()
        } catch {
            await MainActor.run {
                submitting.remove(id)
                showToast("تعذّر حفظ التوقّع — قد تكون المباراة أُغلقت")
            }
        }
    }

    private func showToast(_ msg: String) {
        toast = msg
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            await MainActor.run { if toast == msg { toast = nil } }
        }
    }
}

// MARK: - عرض النتيجة/التوقّع الموحّد (مشترك)
//
// مصدر واحد لعرض «ضيف - مضيف» عبر كل تبويبات التوقّع كي لا تتضارب الصفحات.
// نبني الرقم من ثلاثة عناصر Text منفصلة داخل HStack مفروض LTR بدل استيفاء نصّي
// مختلط (عربي + أرقام) — فالأخير يخضع لخوارزمية الاتجاه ثنائي الاتجاه (bidi)
// ويظهر مقلوبًا أحيانًا (سبب اختلاف «توقّعاتي» عن «مباريات اليوم»). هنا الترتيب
// حتميّ: الضيف يسارًا والمضيف يمينًا — مطابقةً لترتيب الشعارات (المضيف يمين في RTL)
// ولعدّادات إدخال التوقّع.
@ViewBuilder
func wcScorePair(away: Int, home: Int, size: CGFloat, color: Color) -> some View {
    HStack(spacing: 6) {
        Text("\(away)")
        Text("-")
        Text("\(home)")
    }
    .font(SabqFonts.app(size: size, weight: .semibold).monospacedDigit())
    .foregroundStyle(color)
    .environment(\.layoutDirection, .leftToRight)
}

// محلّل ISO مرن (بكسور ثانية أو بدونها) — لعرض يوم المباراة في سجلّ التوقّعات.
private let wcISOParserFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()
private let wcISOParserPlain = ISO8601DateFormatter()
func wcParseISODate(_ s: String) -> Date? {
    wcISOParserFractional.date(from: s) ?? wcISOParserPlain.date(from: s)
}

// MARK: - شارة حالة التوقّع (مشتركة)

@ViewBuilder
func statusBadge(_ status: String, points: Int) -> some View {
    switch status {
    case "correct":
        Text("أصبت +\(points)")
            .sabqText(SabqType.tag).foregroundStyle(SabqTheme.onAction)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
            .background(Capsule().fill(WCTheme.royal))
    case "incorrect":
        // نص بلون الحالة على سطح هادئ (الأبيض على الأحمر يسقط في الليلي)
        Text("لم تُصب")
            .sabqText(SabqType.tag).foregroundStyle(SabqTheme.danger)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
            .background(Capsule().fill(SabqTheme.surfaceMuted))
    default:
        Text("بانتظار النتيجة")
            .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
            .background(Capsule().fill(SabqTheme.surfaceMuted))
    }
}

// MARK: - تبويب: البطولة (البطل + الهدّاف)
//
// نظير WcLongPredictions.tsx على الويب: توقّع بطل المونديال (مرجّح بوزن
// المبادر — يكبر كلما بكّرت، ويُغلق عند نصف النهائي) وتوقّع هدّاف البطولة
// (يُقسَّم بالتساوي، يُغلق عند ربع النهائي). خلافًا للويب لا نُخفي هذه
// التبويبة أبدًا حتى لو عطّل الخادم الميزة (WC_LONG_PREDICTIONS_ENABLED) —
// نعرض بدلًا من ذلك بطاقة «قيد الإطلاق»، بدل تعقيد رفع حالة التوفّر لأعلى
// الشجرة.

private struct WCPredTournamentTab: View {
    @Binding var showLogin: Bool
    @Environment(AuthStore.self) private var authStore

    @State private var data: WCLongData?
    @State private var loading = true
    @State private var champPick: Int?
    @State private var scorerPick: Int?
    @State private var submittingChamp = false
    @State private var submittingScorer = false
    @State private var toast: String?

    private struct WeightTier: Identifiable {
        let id: String   // r32 | r16 | qf
        let label: String
        let mult: String
    }

    private static let weightTiers: [WeightTier] = [
        WeightTier(id: "r32", label: "حتى دور الـ16", mult: "×1.0"),
        WeightTier(id: "r16", label: "دور الـ16", mult: "×0.6"),
        WeightTier(id: "qf", label: "ربع النهائي", mult: "×0.3"),
    ]

    var body: some View {
        VStack(spacing: SabqLayout.space24) {
            if let toast = toast {
                Text(toast)
                    .font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(SabqTheme.onAction)
                    .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space12)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium).fill(WCTheme.royal))
            }
            if loading {
                WCLoading().padding(.top, SabqLayout.space32)
            } else if let data = data {
                howItWorksCard(data)
                championSection(data)
                WCRowSeparator()
                scorerSection(data)
            } else {
                unavailableView
            }
        }
        .task { await load() }
    }

    private var unavailableView: some View {
        VStack(spacing: SabqLayout.space8) {
            Image(systemName: "crown.fill").font(SabqFonts.app(size: 28)).foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
            Text("توقّعات البطولة قيد الإطلاق")
                .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
            Text("عُد قريبًا — توقّع البطل والهدّاف واربح آلاف النقاط.")
                .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space40)
    }

    // MARK: كيف تعمل

    private func howItWorksCard(_ data: WCLongData) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "info.circle.fill").foregroundStyle(WCTheme.emeraldDeep)
                    .accessibilityHidden(true)
                Text("كيف تعمل توقّعات البطولة؟")
                    .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
            }
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                bullet("🏆", "البطل (\(data.pools.champion) نقطة): اختر من يرفع الكأس من المنتخبات المتأهّلة لدور الـ32. تُقسَّم الجائزة على كل من يصيب البطل مرجّحةً بوزن توقّعك — لا بالتساوي.")
                bullet("⏱️", "وزن المبادر: كلّما ثبّتَّ توقّعك أبكر كبُرت حصّتك — ×1.0 حتى دور الـ16، ×0.6 في دور الـ16، ×0.3 في ربع النهائي، ثم يُغلق عند انطلاق نصف النهائي.")
                bullet("⚽", "الهدّاف (\(data.pools.topScorer) نقطة): اختر متصدّر الهدّافين. تُقسَّم الجائزة بالتساوي على المصيبين، ويُغلق التوقّع عند انطلاق ربع النهائي.")
                bullet("🎯", "الاحتساب: تُمنَح النقاط تلقائيًّا بعد النهائي — البطل = الفائز باللقب، الهدّاف = متصدّر لائحة الهدّافين الرسمية.")
            }
        }
        .padding(SabqLayout.space16)
        .wcQuietBlock()
    }

    private func bullet(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space8) {
            Text(icon).font(SabqFonts.app(size: 13))
            Text(text).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
        }
    }

    // MARK: البطل

    private func myMine(_ data: WCLongData, kind: String) -> WCLongMine? {
        data.mine.first { $0.kind == kind }
    }

    private func champVotes(_ data: WCLongData) -> [Int: (n: Int, w: Int)] {
        var m: [Int: (n: Int, w: Int)] = [:]
        for v in data.champion.votes { if let id = v.teamId { m[id] = (v.n, v.w) } }
        return m
    }

    private func champTotalVotes(_ data: WCLongData) -> Int {
        champVotes(data).values.reduce(0) { $0 + $1.n }
    }

    private func champLeader(_ data: WCLongData) -> (name: String, pct: Int)? {
        let votes = champVotes(data)
        let total = champTotalVotes(data)
        guard total > 0, let best = votes.max(by: { $0.value.n < $1.value.n }) else { return nil }
        guard let team = data.teams.first(where: { $0.id == best.key }) else { return nil }
        return (team.name, Int((Double(best.value.n) / Double(total) * 100).rounded()))
    }

    private func estimatedChampShare(_ data: WCLongData, mine: WCLongMine?, pickedId: Int?, votes: [Int: (n: Int, w: Int)]) -> Int {
        guard let pickedId = pickedId else { return 0 }
        let myWeight = mine?.weight ?? (data.champion.weight ?? 0)
        guard myWeight > 0 else { return 0 }
        let teamW = votes[pickedId]?.w ?? 0
        let alreadyOnTeam = mine?.teamId == pickedId
        let denom = teamW + (alreadyOnTeam ? 0 : myWeight)
        guard denom > 0 else { return 0 }
        return (data.pools.champion * myWeight) / denom
    }

    private func championSection(_ data: WCLongData) -> some View {
        let mine = myMine(data, kind: "champion")
        let votes = champVotes(data)
        let total = champTotalVotes(data)
        let leader = champLeader(data)
        let champOpen = data.champion.open
        let liveWeight = data.champion.weight ?? 0
        let pickedId = champPick ?? mine?.teamId
        let estShare = estimatedChampShare(data, mine: mine, pickedId: pickedId, votes: votes)

        return VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "crown.fill").foregroundStyle(SabqTheme.warning)
                    .accessibilityHidden(true)
                Text("من يرفع كأس العالم 2026؟")
                    .sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                Spacer()
                // شارة الجائزة بلون الهوية الذهبي ونص أخضر داكن (تباين كافٍ)
                Text("\(data.pools.champion) نقطة")
                    .sabqText(SabqType.tag).foregroundStyle(WCTheme.heroTop)
                    .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                    .background(Capsule().fill(WCTheme.gold))
            }

            weightTimeline(data)

            if total > 0 {
                statsRow(count: total, leaderName: leader?.name, leaderPct: leader?.pct, tint: SabqTheme.warning)
            }

            if let mine = mine, let name = mine.teamName {
                HStack(spacing: SabqLayout.space8) {
                    Text("اخترت: \(name)").font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
                    statusBadge(mine.status, points: mine.pointsAwarded)
                    if mine.status == "pending" && champOpen {
                        Text("بوزن ×\(String(format: "%.1f", Double(mine.weight) / 100))")
                            .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    }
                }
            }

            if champOpen {
                VStack(alignment: .leading, spacing: SabqLayout.space12) {
                    Text("اختر البطل من المتأهّلين لدور الـ32 (\(data.teams.filter { !$0.eliminated }.count) ما زال في المنافسة)")
                        .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textSecondary)

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: SabqLayout.space8), count: 3), spacing: SabqLayout.space8) {
                        ForEach(data.teams) { t in
                            let selected = pickedId == t.id
                            let pct = total > 0 ? Int((Double(votes[t.id]?.n ?? 0) / Double(total) * 100).rounded()) : 0
                            Button {
                                if authStore.isLoggedIn { champPick = t.id } else { showLogin = true }
                            } label: {
                                VStack(spacing: SabqLayout.space4) {
                                    teamLogo(t.logo, size: 40)
                                    Text(t.name)
                                        .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textPrimary)
                                        .lineLimit(1).multilineTextAlignment(.center)
                                    if t.eliminated {
                                        Text("خرج")
                                            .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.breaking)
                                    } else if total > 0 {
                                        Text("\(pct)%")
                                            .font(SabqFonts.app(size: 12).monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                                            .environment(\.layoutDirection, .leftToRight)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, SabqLayout.space8).padding(.horizontal, SabqLayout.space4)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                        .fill(SabqTheme.surfaceMuted)
                                )
                                // المختار يُعلَّم بحدّ بلون الهوية لا بتعبئة ملوّنة
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                        .stroke(selected ? WCTheme.royal : Color.clear, lineWidth: 2)
                                )
                                .opacity(t.eliminated ? 0.45 : 1)
                                .saturation(t.eliminated ? 0 : 1)
                            }
                            .buttonStyle(.plain)
                            .disabled(t.eliminated)
                        }
                    }

                    if pickedId != nil && estShare > 0 {
                        Text("إذا فاز اختيارك، حصّتك التقديرية ≈ \(estShare) نقطة")
                            .font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(SabqTheme.warning)
                            .multilineTextAlignment(.center).frame(maxWidth: .infinity)
                            .padding(.vertical, SabqLayout.space12)
                            .wcQuietBlock()
                    }

                    if authStore.isLoggedIn {
                        Button {
                            Task { await submitChampion() }
                        } label: {
                            HStack(spacing: SabqLayout.space8) {
                                if submittingChamp {
                                    ProgressView().controlSize(.small).tint(.white)
                                } else {
                                    Image(systemName: "crown.fill").font(.system(size: 12))
                                }
                                Text(mine != nil
                                     ? "حدّث البطل (بوزن ×\(String(format: "%.1f", Double(liveWeight) / 100)))"
                                     : "احفظ البطل (بوزن ×\(String(format: "%.1f", Double(liveWeight) / 100)))")
                                    .sabqText(SabqType.button)
                            }
                            .foregroundStyle(SabqTheme.onAction).frame(maxWidth: .infinity).frame(minHeight: SabqLayout.controlHeight)
                            .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(WCTheme.royal))
                        }
                        .buttonStyle(.plain)
                        .disabled(champPick == nil || champPick == mine?.teamId || submittingChamp)
                    } else {
                        Button { showLogin = true } label: {
                            Text("سجّل دخولك للتوقّع")
                                .sabqText(SabqType.button).foregroundStyle(SabqTheme.onAction)
                                .frame(maxWidth: .infinity).frame(minHeight: SabqLayout.controlHeight)
                                .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(WCTheme.royal))
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                lockedBanner("أُغلق توقّع البطل — انطلق نصف النهائي")
            }
        }
    }

    private func weightTimeline(_ data: WCLongData) -> some View {
        let idx = Self.weightTiers.firstIndex { $0.id == data.champion.stage } ?? -1
        return VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space4) {
                Image(systemName: "chart.line.uptrend.xyaxis").font(SabqFonts.app(size: 12)).accessibilityHidden(true)
                Text("ثبّت مبكرًا = حصّة أكبر").sabqText(SabqType.tag)
            }
            .foregroundStyle(SabqTheme.warning)

            HStack(spacing: SabqLayout.space4) {
                ForEach(Self.weightTiers) { t in
                    let i = Self.weightTiers.firstIndex { $0.id == t.id } ?? 0
                    let active = data.champion.stage == t.id
                    let passed = idx > i || !data.champion.open
                    VStack(spacing: 1) {
                        Text(t.mult).font(SabqFonts.app(size: 12, weight: .regular).monospacedDigit())
                        Text(t.label).font(SabqFonts.app(size: 12)).lineLimit(1).minimumScaleFactor(0.7)
                    }
                    // المرحلة الحالية: تعبئة الهوية ونص أبيض؛ البقية سطح هادئ
                    .foregroundStyle(active ? SabqTheme.onAction : (passed ? SabqTheme.textSecondary : SabqTheme.textPrimary))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, SabqLayout.space8)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                            .fill(active ? WCTheme.royal : (passed ? SabqTheme.surfaceStrong : SabqTheme.surface))
                    )
                }
                VStack(spacing: 1) {
                    Image(systemName: "lock.fill").font(SabqFonts.app(size: 12))
                    Text("إغلاق").font(SabqFonts.app(size: 12))
                }
                .foregroundStyle(!data.champion.open ? SabqTheme.danger : SabqTheme.textSecondary)
                .frame(width: 48)
                .padding(.vertical, SabqLayout.space8)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.surface)
                )
            }
        }
        .padding(SabqLayout.space12)
        .wcQuietBlock()
    }

    // MARK: الهدّاف

    private func scorerVotes(_ data: WCLongData) -> [Int: Int] {
        var m: [Int: Int] = [:]
        for v in data.topScorer.votes { if let id = v.playerId { m[id] = v.n } }
        return m
    }

    private func scorerTotalVotes(_ data: WCLongData) -> Int { scorerVotes(data).values.reduce(0, +) }

    private func scorerLeader(_ data: WCLongData) -> (name: String, pct: Int)? {
        let votes = scorerVotes(data)
        let total = scorerTotalVotes(data)
        guard total > 0, let best = votes.max(by: { $0.value < $1.value }) else { return nil }
        guard let scorer = data.scorers.first(where: { $0.id == best.key }) else { return nil }
        return (scorer.name, Int((Double(best.value) / Double(total) * 100).rounded()))
    }

    private func scorerSection(_ data: WCLongData) -> some View {
        let mine = myMine(data, kind: "top_scorer")
        let votes = scorerVotes(data)
        let total = scorerTotalVotes(data)
        let leader = scorerLeader(data)
        let pickedId = scorerPick ?? mine?.playerId

        return VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "soccerball").foregroundStyle(WCTheme.emeraldDeep)
                    .accessibilityHidden(true)
                Text("من هدّاف البطولة؟")
                    .sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                Spacer()
                Text("\(data.pools.topScorer) نقطة")
                    .sabqText(SabqType.tag).foregroundStyle(SabqTheme.onAction)
                    .padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                    .background(Capsule().fill(WCTheme.royal))
            }

            HStack(spacing: SabqLayout.space4) {
                Image(systemName: "clock").font(SabqFonts.app(size: 12)).accessibilityHidden(true)
                Text("تُقسَّم بالتساوي على المصيبين · يُغلق عند انطلاق ربع النهائي").sabqText(SabqType.meta)
            }
            .foregroundStyle(SabqTheme.textSecondary)

            if total > 0 {
                statsRow(count: total, leaderName: leader?.name, leaderPct: leader?.pct, tint: WCTheme.emeraldDeep)
            }

            if let mine = mine, let name = mine.playerName {
                HStack(spacing: SabqLayout.space8) {
                    Text("اخترت: \(name)").font(SabqFonts.app(size: 13, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
                    statusBadge(mine.status, points: mine.pointsAwarded)
                }
            }

            if !data.topScorer.open {
                lockedBanner("أُغلق توقّع الهدّاف — انطلق ربع النهائي")
            } else if data.scorers.isEmpty {
                Text("لم تُسجّل أهداف بعد — عُد بعد انطلاق المباريات.")
                    .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity).multilineTextAlignment(.center).padding(.vertical, SabqLayout.space12)
            } else {
                VStack(alignment: .leading, spacing: SabqLayout.space12) {
                    VStack(spacing: SabqLayout.space8) {
                        ForEach(data.scorers) { s in
                            let selected = pickedId == s.id
                            let pct = total > 0 ? Int((Double(votes[s.id] ?? 0) / Double(total) * 100).rounded()) : 0
                            Button {
                                if authStore.isLoggedIn { scorerPick = s.id } else { showLogin = true }
                            } label: {
                                HStack(spacing: SabqLayout.space12) {
                                    scorerPhoto(s.photo, size: 40)
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack(spacing: SabqLayout.space4) {
                                            Text(s.name).font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                                            if s.eliminated {
                                                Text("خرج فريقه")
                                                    .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.breaking)
                                            }
                                        }
                                        HStack(spacing: 4) {
                                            teamLogo(s.team.logo, size: 12)
                                            Text(s.team.name).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary).lineLimit(1)
                                        }
                                    }
                                    Spacer(minLength: 4)
                                    VStack(spacing: 1) {
                                        Text("\(s.goals)")
                                            .font(SabqFonts.app(size: 15, weight: .semibold).monospacedDigit())
                                            .foregroundStyle(WCTheme.emeraldDeep)
                                        Text(total > 0 ? "\(pct)%" : "هدف")
                                            .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                                    }
                                    .environment(\.layoutDirection, .leftToRight)
                                }
                                .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space8)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                        .fill(SabqTheme.surfaceMuted)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                        .stroke(selected ? WCTheme.royal : Color.clear, lineWidth: 2)
                                )
                                .opacity(s.eliminated ? 0.45 : 1)
                                .saturation(s.eliminated ? 0 : 1)
                            }
                            .buttonStyle(.plain)
                            .disabled(s.eliminated)
                        }
                    }

                    if authStore.isLoggedIn {
                        Button {
                            Task { await submitScorer() }
                        } label: {
                            HStack(spacing: SabqLayout.space8) {
                                if submittingScorer {
                                    ProgressView().controlSize(.small).tint(.white)
                                } else {
                                    Image(systemName: "soccerball").font(.system(size: 12))
                                }
                                Text(mine != nil ? "حدّث توقّع الهدّاف" : "احفظ توقّع الهدّاف")
                                    .sabqText(SabqType.button)
                            }
                            .foregroundStyle(SabqTheme.onAction).frame(maxWidth: .infinity).frame(minHeight: SabqLayout.controlHeight)
                            .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(WCTheme.royal))
                        }
                        .buttonStyle(.plain)
                        .disabled(scorerPick == nil || scorerPick == mine?.playerId || submittingScorer)
                    } else {
                        Button { showLogin = true } label: {
                            Text("سجّل دخولك للتوقّع")
                                .sabqText(SabqType.button).foregroundStyle(SabqTheme.onAction)
                                .frame(maxWidth: .infinity).frame(minHeight: SabqLayout.controlHeight)
                                .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(WCTheme.royal))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: مساعدات مشتركة

    private func teamLogo(_ url: String, size: CGFloat) -> some View {
        WCRemoteImage(url: url)
            .padding(size * 0.14)
            .frame(width: size, height: size)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
    }

    @ViewBuilder private func scorerPhoto(_ url: String, size: CGFloat) -> some View {
        if !url.isEmpty {
            WCRemoteImage(url: url, contentMode: .fill).frame(width: size, height: size).clipShape(Circle())
        } else {
            Circle().fill(SabqTheme.surfaceMuted).frame(width: size, height: size)
        }
    }

    private func statsRow(count: Int, leaderName: String?, leaderPct: Int?, tint: Color) -> some View {
        HStack(spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space4) {
                Image(systemName: "person.2.fill").font(SabqFonts.app(size: 12)).accessibilityHidden(true)
                Text("\(count) توقّعوا").sabqText(SabqType.tag)
            }
            .foregroundStyle(tint)

            if let leaderName = leaderName, let leaderPct = leaderPct {
                HStack(spacing: SabqLayout.space4) {
                    Image(systemName: "flame.fill").font(SabqFonts.app(size: 12)).foregroundStyle(tint).accessibilityHidden(true)
                    Text("الأكثر توقّعًا:").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    Text(leaderName).font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                    Text("(\(leaderPct)%)")
                        .font(SabqFonts.app(size: 12).monospacedDigit()).foregroundStyle(SabqTheme.textSecondary)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space8)
        .wcQuietBlock()
    }

    private func lockedBanner(_ text: String) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: "lock.fill").font(SabqFonts.app(size: 13)).accessibilityHidden(true)
            Text(text).font(SabqFonts.app(size: 13, weight: .semibold))
        }
        .foregroundStyle(SabqTheme.danger)
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space16)
        .wcQuietBlock()
    }

    // MARK: شبكة

    private func load() async {
        if let r = try? await APIClient.shared.fetchWCLongPredictions(ignoreCache: true) {
            await MainActor.run { data = r; loading = false }
        } else {
            await MainActor.run { data = nil; loading = false }
        }
    }

    private func submitChampion() async {
        guard let picked = champPick else { return }
        await MainActor.run { submittingChamp = true }
        do {
            try await APIClient.shared.submitWCLongPrediction(kind: "champion", teamId: picked, playerId: nil)
            await MainActor.run {
                submittingChamp = false
                SabqHaptics.success()
                showToast("تم حفظ توقّع البطل 👑")
            }
            await load()
        } catch {
            await MainActor.run {
                submittingChamp = false
                showToast("تعذّر الحفظ — حاول مجددًا")
            }
        }
    }

    private func submitScorer() async {
        guard let picked = scorerPick else { return }
        await MainActor.run { submittingScorer = true }
        do {
            try await APIClient.shared.submitWCLongPrediction(kind: "top_scorer", teamId: nil, playerId: picked)
            await MainActor.run {
                submittingScorer = false
                SabqHaptics.success()
                showToast("تم حفظ توقّع الهدّاف ⚽")
            }
            await load()
        } catch {
            await MainActor.run {
                submittingScorer = false
                showToast("تعذّر الحفظ — حاول مجددًا")
            }
        }
    }

    private func showToast(_ msg: String) {
        toast = msg
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            await MainActor.run { if toast == msg { toast = nil } }
        }
    }
}

// MARK: - تبويب: توقّعاتي

private struct WCPredMineTab: View {
    @Binding var showLogin: Bool
    @Environment(AuthStore.self) private var authStore

    @State private var items: [WCPredictionHistoryItem] = []
    @State private var loading = true

    var body: some View {
        VStack(spacing: SabqLayout.space16) {
            if !authStore.isLoggedIn {
                loginPrompt
            } else if loading {
                WCLoading().padding(.top, SabqLayout.space32)
            } else if items.isEmpty {
                emptyText("لم تضع أي توقّع بعد — ابدأ من تبويب «مباريات اليوم»")
            } else {
                summaryBar
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        if index > 0 { WCRowSeparator() }
                        row(item)
                    }
                }
            }
        }
        .task(id: authStore.isLoggedIn) { if authStore.isLoggedIn { await load() } }
    }

    private var loginPrompt: some View {
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(.system(size: 40)).foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
            Text("سجّل الدخول لعرض توقّعاتك ونقاطك")
                .font(SabqFonts.app(size: 15)).foregroundStyle(SabqTheme.textSecondary)
            Button { showLogin = true } label: {
                Text("تسجيل الدخول")
                    .sabqText(SabqType.button).foregroundStyle(SabqTheme.onAction)
                    .padding(.horizontal, SabqLayout.space24)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(WCTheme.royal))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space40)
    }

    private var summaryBar: some View {
        let total = items.reduce(0) { $0 + $1.pointsAwarded }
        let correct = items.filter { $0.status == "correct" }.count
        let played = items.filter { $0.status != "pending" }.count
        return HStack(spacing: SabqLayout.space8) {
            tile("\(total)", "نقاطك", SabqTheme.warning)
            tile("\(correct)", "إصابات", WCTheme.emeraldDeep)
            tile("\(played)", "مباريات", nil)
        }
    }

    private func tile(_ value: String, _ label: String, _ accent: Color?) -> some View {
        VStack(spacing: 0) {
            Text(value).font(SabqFonts.app(size: 20, weight: .semibold).monospacedDigit())
                .foregroundStyle(accent ?? SabqTheme.textPrimary)
                .environment(\.layoutDirection, .leftToRight)
            Text(label).sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, SabqLayout.space12)
        .wcQuietBlock()
    }

    // بطاقة توقّع احترافية مطابقة لتصميم الويب (MyPredictionsList): شريط علوي
    // (اليوم + حالة)، ثم الشعارات (المضيف يمينًا) وكتلتا «توقّعي/النتيجة»، وتذييل
    // للترجيح إن وُجد. توحيد بصري كامل بين الويب و iOS و Android.
    private func row(_ item: WCPredictionHistoryItem) -> some View {
        let settled = item.matchStatus == "settled" && item.finalHome != nil && item.finalAway != nil
        let isWin = settled && item.status == "correct"
        // خروج المغلوب: «1-1» وحدها مضلِّلة — نوضّح من تأهّل بالترجيح.
        let penWin: (name: String, w: Int, l: Int)? = {
            guard let ph = item.finalPenHome, let pa = item.finalPenAway, ph != pa else { return nil }
            let homeWon = ph > pa
            return ((homeWon ? item.homeTeamName : item.awayTeamName) ?? "", max(ph, pa), min(ph, pa))
        }()
        return VStack(spacing: 0) {
            // شريط علوي: اليوم + شارة الحالة
            HStack {
                Text(kickoffDayLabel(item.kickoffAt))
                    .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                Spacer()
                statusPill(settled: settled, isWin: isWin, points: item.pointsAwarded)
            }
            .padding(.top, SabqLayout.space12)

            // الشعارات + توقّعي/النتيجة
            HStack(spacing: SabqLayout.space8) {
                crest(name: item.homeTeamName, logo: item.homeTeamLogo)
                HStack(spacing: SabqLayout.space16) {
                    scoreBlock("توقّعي", away: item.predAway, home: item.predHome,
                               tint: isWin ? WCTheme.emeraldDeep : SabqTheme.textPrimary)
                    if settled, let fh = item.finalHome, let fa = item.finalAway {
                        Rectangle().fill(SabqTheme.separator).frame(width: 1, height: 34)
                        scoreBlock("النتيجة", away: fa, home: fh, tint: SabqTheme.textSecondary)
                    }
                }
                .frame(maxWidth: .infinity)
                crest(name: item.awayTeamName, logo: item.awayTeamLogo)
            }
            .padding(.vertical, SabqLayout.space12)

            // تذييل: الفائز بركلات الترجيح
            if let pw = penWin {
                Text("فاز \(pw.name) بالترجيح (\(pw.w)-\(pw.l))")
                    .sabqText(SabqType.metaEmphasis).foregroundStyle(WCTheme.emeraldDeep)
                    .frame(maxWidth: .infinity).multilineTextAlignment(.center)
                    .padding(.bottom, SabqLayout.space12)
            }
        }
    }

    // شعار + اسم منتخب — عمود متمركز بعرض ثابت (المضيف يمينًا في RTL)
    private func crest(name: String?, logo url: String?) -> some View {
        VStack(spacing: SabqLayout.space8) {
            ZStack {
                Circle().fill(.white)
                if let url, !url.isEmpty {
                    WCRemoteImage(url: url).padding(7)
                }
            }
            .frame(width: 44, height: 44)
            .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
            Text(name ?? "—")
                .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(2).multilineTextAlignment(.center).frame(width: 62)
        }
    }

    // كتلة نتيجة (توقّعي/النتيجة): عنوان صغير + رقم كبير موحّد الاتجاه
    private func scoreBlock(_ label: String, away: Int, home: Int, tint: Color) -> some View {
        VStack(spacing: 2) {
            Text(label).font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            wcScorePair(away: away, home: home, size: 22, color: tint)
        }
    }

    @ViewBuilder private func statusPill(settled: Bool, isWin: Bool, points: Int) -> some View {
        if settled {
            if isWin {
                HStack(spacing: SabqLayout.space4) {
                    Image(systemName: "trophy.fill").font(SabqFonts.app(size: 12))
                    Text("+\(points) نقطة").sabqText(SabqType.tag)
                }
                .foregroundStyle(SabqTheme.onAction).padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                .background(Capsule().fill(WCTheme.royal))
            } else {
                HStack(spacing: SabqLayout.space4) {
                    Image(systemName: "xmark").font(SabqFonts.app(size: 12))
                    Text("لم تُصب").sabqText(SabqType.tag)
                }
                .foregroundStyle(SabqTheme.textSecondary).padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
                .background(Capsule().fill(SabqTheme.surfaceMuted))
            }
        } else {
            HStack(spacing: SabqLayout.space4) {
                Image(systemName: "clock").font(SabqFonts.app(size: 12))
                Text("قيد الانتظار").sabqText(SabqType.tag)
            }
            .foregroundStyle(SabqTheme.warning).padding(.horizontal, SabqLayout.space8).padding(.vertical, SabqLayout.space4)
            .background(Capsule().fill(SabqTheme.surfaceMuted))
        }
    }

    // يوم انطلاق المباراة من سلسلة ISO (kickoffAt) بتوقيت الرياض
    private func kickoffDayLabel(_ iso: String?) -> String {
        guard let iso, let d = wcParseISODate(iso) else { return "كأس العالم 2026" }
        return WCFormat.dayRiyadh.string(from: d)
    }

    private func load() async {
        if let r = try? await APIClient.shared.fetchWCMyPredictions() {
            await MainActor.run { items = r; loading = false }
        } else { await MainActor.run { loading = false } }
    }
}

// MARK: - احتفال الفوز (modal + confetti + تفاصيل التوقّع)
//
// يظهر مرّة واحدة لكل مباراة فائزة عند فتح شاشة التوقّعات. يعرض المباراة،
// وتفاصيل التوقّع (توقّعي مقابل النتيجة مع الشعارات)، والنقاط المكتسبة —
// مطابقةً لفكرة SpWinCelebration في تطبيق الرياضة وGcWinCelebration في الويب.

struct WCWinCelebration: View {
    let item: WCPredictionHistoryItem
    var onClose: () -> Void

    var body: some View {
        ZStack {
            SabqTheme.surface.ignoresSafeArea()
            WCConfettiView().allowsHitTesting(false)
            VStack(spacing: SabqLayout.space16) {
                Text("🎯").font(.system(size: 60))
                Text("توقّع موفّق! 🎉")
                    .sabqText(SabqType.leadTitle).foregroundStyle(SabqTheme.textPrimary)
                Text("\(item.homeTeamName ?? "") ضد \(item.awayTeamName ?? "")")
                    .font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.center)

                detailsCard

                VStack(spacing: 2) {
                    Text("+\(item.pointsAwarded)")
                        .font(SabqFonts.app(size: 28, weight: .semibold).monospacedDigit())
                        .foregroundStyle(WCTheme.emeraldDeep)
                        .environment(\.layoutDirection, .leftToRight)
                    Text("نقطة من إصابة النتيجة الدقيقة")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                }
                .padding(.top, SabqLayout.space4)

                Button(action: onClose) {
                    Text("رائع!")
                        .sabqText(SabqType.button).foregroundStyle(SabqTheme.onAction)
                        .frame(maxWidth: .infinity).frame(minHeight: SabqLayout.controlHeight)
                        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(WCTheme.royal))
                }
                .buttonStyle(.plain).padding(.horizontal, SabqLayout.space24).padding(.top, SabqLayout.space4)
            }
            .padding(SabqLayout.space24)
        }
    }

    // تفاصيل التوقّع: الشعارات + توقّعي/النتيجة
    private var detailsCard: some View {
        HStack(spacing: SabqLayout.space12) {
            celebCrest(name: item.homeTeamName, logo: item.homeTeamLogo)
            HStack(spacing: SabqLayout.space16) {
                VStack(spacing: 2) {
                    Text("توقّعي").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                    wcScorePair(away: item.predAway, home: item.predHome, size: 20, color: WCTheme.emeraldDeep)
                }
                if let fh = item.finalHome, let fa = item.finalAway {
                    Rectangle().fill(SabqTheme.separator).frame(width: 1, height: 32)
                    VStack(spacing: 2) {
                        Text("النتيجة").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                        wcScorePair(away: fa, home: fh, size: 20, color: SabqTheme.textPrimary)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            celebCrest(name: item.awayTeamName, logo: item.awayTeamLogo)
        }
        .padding(.horizontal, SabqLayout.space16).padding(.vertical, SabqLayout.space12)
        .wcQuietBlock()
    }

    private func celebCrest(name: String?, logo url: String?) -> some View {
        VStack(spacing: 6) {
            ZStack {
                Circle().fill(.white)
                if let url, !url.isEmpty { WCRemoteImage(url: url).padding(7) }
            }
            .frame(width: 44, height: 44)
            .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
            Text(name ?? "—")
                .font(SabqFonts.app(size: 12, weight: .medium)).foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(2).multilineTextAlignment(.center).frame(width: 58)
        }
    }
}

// confetti خفيف بـ Canvas + TimelineView — قطع ملوّنة تتساقط وتدور لِـ ~4 ثوانٍ.
struct WCConfettiView: View {
    private struct Piece {
        let x: CGFloat
        let delay: Double
        let duration: Double
        let color: Color
        let size: CGFloat
        let spin: Double
        let drift: CGFloat
    }

    private let pieces: [Piece]
    private let start = Date()

    init(count: Int = 80) {
        let palette: [Color] = [WCTheme.emeraldDeep, WCTheme.gold, SabqTheme.success, WCTheme.emerald]
        pieces = (0..<count).map { _ in
            Piece(
                x: .random(in: 0...1),
                delay: .random(in: 0...0.8),
                duration: .random(in: 2.2...3.6),
                color: palette.randomElement() ?? WCTheme.emeraldDeep,
                size: .random(in: 6...11),
                spin: .random(in: -4...4),
                drift: .random(in: -40...40)
            )
        }
    }

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { ctx, size in
                let t = timeline.date.timeIntervalSince(start)
                for p in pieces {
                    let local = t - p.delay
                    guard local > 0 else { continue }
                    let progress = min(1, local / p.duration)
                    let y = -20 + (size.height + 40) * CGFloat(progress)
                    let x = p.x * size.width + p.drift * CGFloat(progress)
                    let angle = Angle(radians: p.spin * local)
                    let opacity = progress < 0.85 ? 1.0 : max(0, (1 - progress) / 0.15)

                    var rect = Path(CGRect(x: -p.size / 2, y: -p.size / 2, width: p.size, height: p.size * 0.6))
                    rect = rect.applying(CGAffineTransform(rotationAngle: CGFloat(angle.radians)))
                    rect = rect.applying(CGAffineTransform(translationX: x, y: y))
                    ctx.fill(rect, with: .color(p.color.opacity(opacity)))
                }
            }
        }
    }
}

// MARK: - تبويب: المتصدّرون

private struct WCPredLeaderboardTab: View {
    @State private var leaders: [WCPredLeader] = []
    /// العدد الكلي للمشاركين المؤهّلين — nil قبل نشر توسعة الخادم (تدهور سلس).
    @State private var total: Int?
    /// صف صاحب الجلسة ورتبته الحقيقية — يُثبَّت أسفل القائمة متى كان خارجها.
    @State private var viewer: WCPredViewer?
    @State private var limit = 100
    @State private var loading = true
    @State private var loadingMore = false

    /// سقف الخادم لعدد الصفوف (parseLeaderboardLimit في المسار).
    private let serverLimitCap = 500

    var body: some View {
        VStack(spacing: 0) {
            if loading {
                WCLoading().padding(.top, SabqLayout.space32)
            } else if leaders.isEmpty {
                emptyText("لا متصدّرين بعد — كن أول من يصيب نتيجة مباراة!")
            } else {
                if let total, total > 0 {
                    Text("\(total) مشاركًا في المسابقة")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, SabqLayout.space8)
                }
                ForEach(Array(leaders.enumerated()), id: \.element.id) { index, l in
                    if index > 0 { WCRowSeparator() }
                    row(l)
                }
                if let viewer, !leaders.contains(where: { $0.userId == viewer.userId }) {
                    viewerRow(viewer)
                }
                if canLoadMore {
                    loadMoreButton
                }
            }
        }
        .task { await load() }
    }

    private var canLoadMore: Bool {
        guard let total else { return false }
        return leaders.count < min(total, serverLimitCap)
    }

    private func row(_ l: WCPredLeader) -> some View {
        HStack(spacing: SabqLayout.space12) {
            rankBadge(l.rank)
            avatar(l.avatar)
            VStack(alignment: .leading, spacing: 0) {
                Text(l.name).sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary).lineLimit(1)
                Text("\(l.correctCount) إصابة من \(l.playedCount)")
                    .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            }
            Spacer()
            VStack(spacing: 1) {
                Text("\(l.totalPoints)")
                    .font(SabqFonts.app(size: 16, weight: .semibold).monospacedDigit()).foregroundStyle(SabqTheme.warning)
                    .environment(\.layoutDirection, .leftToRight)
                Text("نقطة").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .padding(.vertical, SabqLayout.space12)
    }

    private func rankBadge(_ rank: Int) -> some View {
        // المراكز الثلاثة الأولى: رقم ملوّن على سطح هادئ (لا أبيض على الذهبي)
        let fg: Color = rank == 1 ? SabqTheme.warning : (rank == 2 ? SabqTheme.textPrimary : (rank == 3 ? SabqTheme.success : SabqTheme.textSecondary))
        return Text("\(rank)")
            .font(SabqFonts.app(size: 13, weight: rank <= 3 ? .semibold : .regular).monospacedDigit()).foregroundStyle(fg)
            .frame(width: 32, height: 32)
            .background(Circle().fill(SabqTheme.surfaceMuted))
            .environment(\.layoutDirection, .leftToRight)
    }

    @ViewBuilder private func avatar(_ url: String?) -> some View {
        if let url, !url.isEmpty {
            WCRemoteImage(url: url, contentMode: .fill).frame(width: 34, height: 34).clipShape(Circle())
        } else {
            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: 30)).foregroundStyle(SabqTheme.textSecondary)
                .frame(width: 34, height: 34)
        }
    }

    /// صف «أنت» المثبَّت — رتبة صاحب الجلسة الحقيقية وهو خارج الصفحة المعروضة.
    private func viewerRow(_ v: WCPredViewer) -> some View {
        VStack(spacing: SabqLayout.space8) {
            WCRowSeparator()
            HStack(spacing: SabqLayout.space12) {
                Text("\(v.rank)")
                    .font(SabqFonts.app(size: 13, weight: .semibold).monospacedDigit()).foregroundStyle(SabqTheme.warning)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(SabqTheme.surface))
                    .environment(\.layoutDirection, .leftToRight)
                Image(systemName: "person.crop.circle.fill")
                    .font(.system(size: 30)).foregroundStyle(SabqTheme.warning)
                    .frame(width: 34, height: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text("أنت").font(SabqFonts.app(size: 15, weight: .semibold)).foregroundStyle(SabqTheme.textPrimary)
                    Text("\(v.correctCount) إصابة من \(v.playedCount)")
                        .font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                }
                Spacer()
                VStack(spacing: 1) {
                    Text("\(v.totalPoints)")
                        .font(SabqFonts.app(size: 16, weight: .semibold).monospacedDigit()).foregroundStyle(SabqTheme.warning)
                        .environment(\.layoutDirection, .leftToRight)
                    Text("نقطة").font(SabqFonts.app(size: 12)).foregroundStyle(SabqTheme.textSecondary)
                }
            }
            .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space12)
            .wcQuietBlock()
        }
    }

    private var loadMoreButton: some View {
        Button {
            Task { await loadMore() }
        } label: {
            HStack(spacing: SabqLayout.space8) {
                if loadingMore {
                    ProgressView().tint(SabqTheme.textSecondary).scaleEffect(0.8)
                }
                Text(loadingMore ? "جارٍ التحميل…" : "عرض المزيد (\(leaders.count) من \(total ?? 0))")
                    .sabqText(SabqType.button).foregroundStyle(WCTheme.emeraldDeep)
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: SabqLayout.controlHeight)
            // زر ثانوي: حدّ outline بزاوية 12
            .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).stroke(SabqTheme.outline, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(loadingMore)
    }

    private func load() async {
        if let r = try? await APIClient.shared.fetchWCLeaderboard(limit: limit) {
            await MainActor.run {
                leaders = r.leaders
                total = r.total
                viewer = r.viewer
                loading = false
            }
        } else { await MainActor.run { loading = false } }
    }

    private func loadMore() async {
        guard !loadingMore else { return }
        let next = min(limit + 100, serverLimitCap)
        await MainActor.run { loadingMore = true }
        // فشل جلب الدفعة الأكبر يُبقي القائمة الحالية كما هي بلا وميض.
        if let r = try? await APIClient.shared.fetchWCLeaderboard(limit: next) {
            await MainActor.run {
                leaders = r.leaders
                total = r.total
                viewer = r.viewer
                limit = next
            }
        }
        await MainActor.run { loadingMore = false }
    }
}
