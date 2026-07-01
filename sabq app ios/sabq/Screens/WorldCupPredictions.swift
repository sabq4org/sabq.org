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
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(LinearGradient(colors: [WCTheme.gold, WCTheme.gold.opacity(0.7)],
                                             startPoint: .top, endPoint: .bottom))
                        .frame(width: 44, height: 44)
                    Image(systemName: "target")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(WCTheme.heroTop)
                }
                .shadow(color: WCTheme.gold.opacity(0.45), radius: 6, y: 2)

                VStack(alignment: .leading, spacing: 3) {
                    Text("توقّع واربح")
                        .font(SabqFonts.app(size: 16, weight: .black)).foregroundStyle(.white)
                    Text("أصِب النتيجة بالضبط واكسب من 500 نقطة لكل مباراة")
                        .font(SabqFonts.app(size: 11)).foregroundStyle(.white.opacity(0.85))
                        .lineLimit(2)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.left")
                    .font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.gold)
            }
            .padding(.horizontal, 16).padding(.vertical, 14)
            .background(
                LinearGradient(colors: [WCTheme.heroTop, WCTheme.royal, WCTheme.heroBottom],
                               startPoint: .topTrailing, endPoint: .bottomLeading)
            )
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(WCTheme.gold.opacity(0.30), lineWidth: 1)
            )
            .shadow(color: WCTheme.royal.opacity(0.30), radius: 12, x: 0, y: 6)
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
                    .padding(16)
                }
            }
            .background(WCTheme.sectionBackground.ignoresSafeArea())
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
        }
        // شريط حالة أبيض على الرأس الأخضر: نفرض تفضيل النمط الداكن (يبيّض ساعة/
        // بطارية النظام) مع تثبيت بيئة الألوان على «فاتح» للمحتوى داخليًا — فتبقى
        // البطاقات بيضاء كما هي ولا تتأثّر بألوان WCTheme الديناميكية.
        .environment(\.colorScheme, .light)
        .preferredColorScheme(.dark)
        .sabqRTL()
    }

    private var tabBar: some View {
        HStack(spacing: 8) {
            ForEach(Tab.allCases, id: \.self) { t in
                Button { withAnimation(.easeOut(duration: 0.2)) { tab = t } } label: {
                    Text(t.rawValue)
                        .font(SabqFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(tab == t ? .white : WCTheme.onDarkDim)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(Capsule().fill(tab == t ? WCTheme.emeraldDeep : WCTheme.chipFill))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 4)
        .background(WCTheme.stadiumTop)
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
        VStack(spacing: 14) {
            if let toast {
                Text(toast)
                    .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 12).fill(WCTheme.emeraldDeep))
            }
            if loading {
                WCLoading().padding(.top, 30)
            } else if matches.isEmpty {
                emptyText("لا توجد مباريات قابلة للتوقّع اليوم أو غدًا — تابع الجدول لاحقًا")
            } else {
                ForEach(matches) { m in card(m) }
            }
        }
        .task { await load() }
    }

    private func load() async {
        if let r = try? await APIClient.shared.fetchWCPredictionsToday(ignoreCache: true) {
            await MainActor.run {
                matches = r
                for m in r {
                    let seed = m.myPrediction
                    inputs[m.fixture.id] = ScoreInput(home: seed?.predHome ?? 0, away: seed?.predAway ?? 0)
                }
                loading = false
            }
        } else { await MainActor.run { loading = false } }
    }

    @ViewBuilder private func card(_ m: WCPredictableMatch) -> some View {
        let f = m.fixture
        VStack(spacing: 12) {
            // الترويسة: المنتخبان + الموعد
            HStack {
                teamSide(f.home)
                VStack(spacing: 3) {
                    Text(WCFormat.time(f))
                        .font(SabqFonts.app(size: 13, weight: .black)).foregroundStyle(WCTheme.onDark)
                    Text(f.round).font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                }
                .frame(minWidth: 70)
                teamSide(f.away)
            }

            if m.locked {
                lockedView(m)
            } else if authStore.isLoggedIn {
                inputView(m)
            } else {
                Button { showLogin = true } label: {
                    Text("سجّل الدخول للتوقّع")
                        .font(SabqFonts.app(size: 13, weight: .heavy)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity).padding(.vertical, 11)
                        .background(Capsule().fill(WCTheme.emeraldDeep))
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 6) {
                Image(systemName: "person.2.fill").font(.system(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                Text("\(m.predictionsCount) مشارك").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                Spacer()
                Text("الجائزة 500 نقطة").font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.gold)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }

    private func teamSide(_ team: WCTeam) -> some View {
        VStack(spacing: 6) {
            WCTeamLogo(team: team, size: 42, ring: WCTheme.cardStroke)
            Text(team.name).font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDark)
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
        VStack(spacing: 10) {
            // المضيف يمينًا (تحت شعاره) والضيف يسارًا — مطابقةً لترتيب الشعارات في
            // الترويسة (RTL) ولعرض النتيجة/التوقّع (ضيف-مضيف). نُبقي فرض LTR لثبات
            // تخطيط الأرقام، لكن نرتّب الضيف أولًا ثم المضيف كي يقع عدّاد كل فريق
            // تحت شعاره — وإلا خُزِّن التوقّع مقلوبًا فظهر «لم تُصب» لتوقّع صحيح.
            HStack(spacing: 16) {
                stepper(value: input.away) { setAway(id, $0) }
                Text("-").font(SabqFonts.app(size: 20, weight: .black)).foregroundStyle(WCTheme.onDarkDim)
                stepper(value: input.home) { setHome(id, $0) }
            }
            .environment(\.layoutDirection, .leftToRight)

            if drawNotAllowed {
                Text(WC_DRAW_NOT_ALLOWED_MESSAGE)
                    .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity).padding(.vertical, 8).padding(.horizontal, 8)
                    .background(RoundedRectangle(cornerRadius: 10).fill(WCTheme.liveRed))
            }

            if dirty {
                Button { Task { await submit(m) } } label: {
                    HStack(spacing: 6) {
                        if submitting.contains(id) {
                            ProgressView().controlSize(.small).tint(.white)
                        } else {
                            Image(systemName: saved != nil ? "checkmark.circle.fill" : "paperplane.fill")
                                .font(.system(size: 12))
                        }
                        Text(saved != nil ? "تحديث التوقّع" : "حفظ التوقّع")
                            .font(SabqFonts.app(size: 13, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 9)
                    .background(Capsule().fill(drawNotAllowed ? WCTheme.onDarkDim : WCTheme.emeraldDeep))
                }
                .buttonStyle(.plain)
                .disabled(submitting.contains(id) || drawNotAllowed)
            } else if !drawNotAllowed {
                HStack(spacing: 5) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 12)).foregroundStyle(WCTheme.emerald)
                    Text("تم حفظ توقّعك")
                        .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(WCTheme.onDarkDim)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 7)
            }
        }
    }

    private func stepper(value: Int, set: @escaping (Int) -> Void) -> some View {
        HStack(spacing: 10) {
            stepBtn("minus") { if value > 0 { set(value - 1) } }
            Text("\(value)")
                .font(SabqFonts.app(size: 22, weight: .black).monospacedDigit())
                .foregroundStyle(WCTheme.onDark).frame(minWidth: 30)
            stepBtn("plus") { if value < 20 { set(value + 1) } }
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.chipFill))
    }

    private func stepBtn(_ icon: String, _ action: @escaping () -> Void) -> some View {
        // خلفية خضراء فاتحة بأيقونة خضراء داكنة بدل الدائرة الصلبة + الظل —
        // واضحة وقابلة للّمس لكن هادئة (تقلّل ازدحام الأخضر في كل بطاقة).
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                .frame(width: 32, height: 32)
                .background(Circle().fill(WCTheme.emerald.opacity(0.14)))
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
        VStack(spacing: 8) {
            if let s = m.settlement, let fh = s.finalHome, let fa = s.finalAway {
                HStack(spacing: 6) {
                    Text("النتيجة").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                    Text("\(fa) - \(fh)")
                        .font(SabqFonts.app(size: 15, weight: .black).monospacedDigit()).foregroundStyle(WCTheme.onDark)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            // خروج المغلوب: «1-1» وحدها مضلِّلة — نوضّح من حُسمت له بالترجيح.
            if let po = m.fixture.penaltyOutcome {
                Text("فاز \(po.winnerName) بالترجيح (\(po.winnerScore)-\(po.loserScore))")
                    .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                    .multilineTextAlignment(.center)
            }
            if let mine = m.myPrediction {
                HStack(spacing: 8) {
                    Text("توقّعك: \(mine.predAway) - \(mine.predHome)")
                        .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDark)
                        .environment(\.layoutDirection, .leftToRight)
                    statusBadge(mine.status, points: mine.pointsAwarded)
                }
            } else {
                Text("أُغلق التوقّع — انطلقت المباراة")
                    .font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 12).fill(WCTheme.chipFill))
    }

    private func submit(_ m: WCPredictableMatch) async {
        let id = m.fixture.id
        guard let input = inputs[id] else { return }
        // حصانة خادمية مكرّرة على العميل: لا تعادل في خروج المغلوب.
        if input.home == input.away && wcIsKnockoutRound(m.fixture.roundEn) {
            await MainActor.run { showToast(WC_DRAW_NOT_ALLOWED_MESSAGE) }
            return
        }
        await MainActor.run { submitting.insert(id) }
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

// MARK: - شارة حالة التوقّع (مشتركة)

@ViewBuilder
func statusBadge(_ status: String, points: Int) -> some View {
    switch status {
    case "correct":
        Text("أصبت +\(points)")
            .font(SabqFonts.app(size: 10, weight: .black)).foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(WCTheme.emeraldDeep))
    case "incorrect":
        Text("لم تُصب")
            .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(WCTheme.liveRed))
    default:
        Text("بانتظار النتيجة")
            .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(WCTheme.chipFill))
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
        VStack(spacing: 14) {
            if let toast = toast {
                Text(toast)
                    .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 12).fill(WCTheme.emeraldDeep))
            }
            if loading {
                WCLoading().padding(.top, 30)
            } else if let data = data {
                howItWorksCard(data)
                championSection(data)
                scorerSection(data)
            } else {
                unavailableView
            }
        }
        .task { await load() }
    }

    private var unavailableView: some View {
        VStack(spacing: 10) {
            Image(systemName: "crown.fill").font(.system(size: 34)).foregroundStyle(WCTheme.onDarkDim.opacity(0.5))
            Text("توقّعات البطولة قيد الإطلاق")
                .font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark)
            Text("عُد قريبًا — توقّع البطل والهدّاف واربح آلاف النقاط.")
                .font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 40)
    }

    // MARK: كيف تعمل

    private func howItWorksCard(_ data: WCLongData) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "info.circle.fill").foregroundStyle(WCTheme.emeraldDeep)
                Text("كيف تعمل توقّعات البطولة؟")
                    .font(SabqFonts.app(size: 15, weight: .black)).foregroundStyle(WCTheme.onDark)
            }
            VStack(alignment: .leading, spacing: 8) {
                bullet("🏆", "البطل (\(data.pools.champion) نقطة): اختر من يرفع الكأس من المنتخبات المتأهّلة لدور الـ32. تُقسَّم الجائزة على كل من يصيب البطل مرجّحةً بوزن توقّعك — لا بالتساوي.")
                bullet("⏱️", "وزن المبادر: كلّما ثبّتَّ توقّعك أبكر كبُرت حصّتك — ×1.0 حتى دور الـ16، ×0.6 في دور الـ16، ×0.3 في ربع النهائي، ثم يُغلق عند انطلاق نصف النهائي.")
                bullet("⚽", "الهدّاف (\(data.pools.topScorer) نقطة): اختر متصدّر الهدّافين. تُقسَّم الجائزة بالتساوي على المصيبين، ويُغلق التوقّع عند انطلاق ربع النهائي.")
                bullet("🎯", "الاحتساب: تُمنَح النقاط تلقائيًّا بعد النهائي — البطل = الفائز باللقب، الهدّاف = متصدّر لائحة الهدّافين الرسمية.")
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(WCTheme.card))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(WCTheme.cardStroke.opacity(0.5), lineWidth: 0.5))
    }

    private func bullet(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(icon).font(.system(size: 13))
            Text(text).font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
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

        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "crown.fill").foregroundStyle(WCTheme.gold)
                Text("من يرفع كأس العالم 2026؟")
                    .font(SabqFonts.app(size: 15, weight: .black)).foregroundStyle(WCTheme.onDark)
                Spacer()
                Text("\(data.pools.champion) نقطة")
                    .font(SabqFonts.app(size: 11, weight: .black)).foregroundStyle(WCTheme.heroTop)
                    .padding(.horizontal, 9).padding(.vertical, 3)
                    .background(Capsule().fill(WCTheme.gold))
            }

            weightTimeline(data)

            if total > 0 {
                statsRow(count: total, leaderName: leader?.name, leaderPct: leader?.pct, tint: WCTheme.gold)
            }

            if let mine = mine, let name = mine.teamName {
                HStack(spacing: 6) {
                    Text("اخترت: \(name)").font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDark)
                    statusBadge(mine.status, points: mine.pointsAwarded)
                    if mine.status == "pending" && champOpen {
                        Text("بوزن ×\(String(format: "%.1f", Double(mine.weight) / 100))")
                            .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                    }
                }
            }

            if champOpen {
                VStack(alignment: .leading, spacing: 10) {
                    Text("اختر البطل من المتأهّلين لدور الـ32 (\(data.teams.count) منتخبًا)")
                        .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                        ForEach(data.teams) { t in
                            let selected = pickedId == t.id
                            let pct = total > 0 ? Int((Double(votes[t.id]?.n ?? 0) / Double(total) * 100).rounded()) : 0
                            Button {
                                if authStore.isLoggedIn { champPick = t.id } else { showLogin = true }
                            } label: {
                                VStack(spacing: 5) {
                                    teamLogo(t.logo, size: 38)
                                    Text(t.name)
                                        .font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.onDark)
                                        .lineLimit(1).multilineTextAlignment(.center)
                                    if total > 0 {
                                        Text("\(pct)%")
                                            .font(SabqFonts.app(size: 9).monospacedDigit()).foregroundStyle(WCTheme.onDarkDim)
                                            .environment(\.layoutDirection, .leftToRight)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8).padding(.horizontal, 4)
                                .background(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(selected ? WCTheme.gold.opacity(0.14) : WCTheme.card)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .stroke(selected ? WCTheme.gold : WCTheme.cardStroke.opacity(0.5), lineWidth: selected ? 1.5 : 0.5)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if pickedId != nil && estShare > 0 {
                        Text("إذا فاز اختيارك، حصّتك التقديرية ≈ \(estShare) نقطة")
                            .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.gold)
                            .multilineTextAlignment(.center).frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(RoundedRectangle(cornerRadius: 12).fill(WCTheme.gold.opacity(0.10)))
                    }

                    if authStore.isLoggedIn {
                        Button {
                            Task { await submitChampion() }
                        } label: {
                            HStack(spacing: 6) {
                                if submittingChamp {
                                    ProgressView().controlSize(.small).tint(.white)
                                } else {
                                    Image(systemName: "crown.fill").font(.system(size: 12))
                                }
                                Text(mine != nil
                                     ? "حدّث البطل (بوزن ×\(String(format: "%.1f", Double(liveWeight) / 100)))"
                                     : "احفظ البطل (بوزن ×\(String(format: "%.1f", Double(liveWeight) / 100)))")
                                    .font(SabqFonts.app(size: 13, weight: .bold))
                            }
                            .foregroundStyle(.white).frame(maxWidth: .infinity).padding(.vertical, 10)
                            .background(Capsule().fill(WCTheme.gold))
                        }
                        .buttonStyle(.plain)
                        .disabled(champPick == nil || champPick == mine?.teamId || submittingChamp)
                    } else {
                        Button { showLogin = true } label: {
                            Text("سجّل دخولك للتوقّع")
                                .font(SabqFonts.app(size: 13, weight: .heavy)).foregroundStyle(.white)
                                .frame(maxWidth: .infinity).padding(.vertical, 10)
                                .background(Capsule().fill(WCTheme.emeraldDeep))
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                lockedBanner("أُغلق توقّع البطل — انطلق نصف النهائي")
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(WCTheme.gold.opacity(0.05)))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(WCTheme.gold.opacity(0.25), lineWidth: 1))
    }

    private func weightTimeline(_ data: WCLongData) -> some View {
        let idx = Self.weightTiers.firstIndex { $0.id == data.champion.stage } ?? -1
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 11))
                Text("ثبّت مبكرًا = حصّة أكبر").font(SabqFonts.app(size: 11, weight: .bold))
            }
            .foregroundStyle(WCTheme.gold)

            HStack(spacing: 4) {
                ForEach(Self.weightTiers) { t in
                    let i = Self.weightTiers.firstIndex { $0.id == t.id } ?? 0
                    let active = data.champion.stage == t.id
                    let passed = idx > i || !data.champion.open
                    VStack(spacing: 1) {
                        Text(t.mult).font(SabqFonts.app(size: 12, weight: .black).monospacedDigit())
                        Text(t.label).font(SabqFonts.app(size: 8)).lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .foregroundStyle(active ? .white : (passed ? WCTheme.onDarkDim : WCTheme.onDark))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(active ? WCTheme.gold : (passed ? WCTheme.chipFill : WCTheme.card))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(WCTheme.gold.opacity(active || passed ? 0 : 0.25), lineWidth: 1)
                    )
                }
                VStack(spacing: 1) {
                    Image(systemName: "lock.fill").font(.system(size: 10))
                    Text("إغلاق").font(SabqFonts.app(size: 8))
                }
                .foregroundStyle(.white)
                .frame(width: 40)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(!data.champion.open ? WCTheme.liveRed : WCTheme.chipFill)
                )
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(WCTheme.gold.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(WCTheme.gold.opacity(0.20), lineWidth: 1))
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

        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "soccerball").foregroundStyle(WCTheme.emeraldDeep)
                Text("من هدّاف البطولة؟")
                    .font(SabqFonts.app(size: 15, weight: .black)).foregroundStyle(WCTheme.onDark)
                Spacer()
                Text("\(data.pools.topScorer) نقطة")
                    .font(SabqFonts.app(size: 11, weight: .black)).foregroundStyle(.white)
                    .padding(.horizontal, 9).padding(.vertical, 3)
                    .background(Capsule().fill(WCTheme.emeraldDeep))
            }

            HStack(spacing: 5) {
                Image(systemName: "clock").font(.system(size: 11))
                Text("تُقسَّم بالتساوي على المصيبين · يُغلق عند انطلاق ربع النهائي").font(SabqFonts.app(size: 11))
            }
            .foregroundStyle(WCTheme.onDarkDim)

            if total > 0 {
                statsRow(count: total, leaderName: leader?.name, leaderPct: leader?.pct, tint: WCTheme.emeraldDeep)
            }

            if let mine = mine, let name = mine.playerName {
                HStack(spacing: 6) {
                    Text("اخترت: \(name)").font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.onDark)
                    statusBadge(mine.status, points: mine.pointsAwarded)
                }
            }

            if !data.topScorer.open {
                lockedBanner("أُغلق توقّع الهدّاف — انطلق ربع النهائي")
            } else if data.scorers.isEmpty {
                Text("لم تُسجّل أهداف بعد — عُد بعد انطلاق المباريات.")
                    .font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity).multilineTextAlignment(.center).padding(.vertical, 10)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    VStack(spacing: 8) {
                        ForEach(data.scorers) { s in
                            let selected = pickedId == s.id
                            let pct = total > 0 ? Int((Double(votes[s.id] ?? 0) / Double(total) * 100).rounded()) : 0
                            Button {
                                if authStore.isLoggedIn { scorerPick = s.id } else { showLogin = true }
                            } label: {
                                HStack(spacing: 10) {
                                    scorerPhoto(s.photo, size: 40)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(s.name).font(SabqFonts.app(size: 13, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                                        HStack(spacing: 4) {
                                            teamLogo(s.team.logo, size: 12)
                                            Text(s.team.name).font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim).lineLimit(1)
                                        }
                                    }
                                    Spacer(minLength: 4)
                                    VStack(spacing: 1) {
                                        Text("\(s.goals)")
                                            .font(SabqFonts.app(size: 15, weight: .black).monospacedDigit())
                                            .foregroundStyle(WCTheme.emeraldDeep)
                                        Text(total > 0 ? "\(pct)%" : "هدف")
                                            .font(SabqFonts.app(size: 8)).foregroundStyle(WCTheme.onDarkDim)
                                    }
                                    .environment(\.layoutDirection, .leftToRight)
                                }
                                .padding(.horizontal, 10).padding(.vertical, 8)
                                .background(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(selected ? WCTheme.emerald.opacity(0.12) : WCTheme.card)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .stroke(selected ? WCTheme.emeraldDeep : WCTheme.cardStroke.opacity(0.5), lineWidth: selected ? 1.5 : 0.5)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if authStore.isLoggedIn {
                        Button {
                            Task { await submitScorer() }
                        } label: {
                            HStack(spacing: 6) {
                                if submittingScorer {
                                    ProgressView().controlSize(.small).tint(.white)
                                } else {
                                    Image(systemName: "soccerball").font(.system(size: 12))
                                }
                                Text(mine != nil ? "حدّث توقّع الهدّاف" : "احفظ توقّع الهدّاف")
                                    .font(SabqFonts.app(size: 13, weight: .bold))
                            }
                            .foregroundStyle(.white).frame(maxWidth: .infinity).padding(.vertical, 10)
                            .background(Capsule().fill(WCTheme.emeraldDeep))
                        }
                        .buttonStyle(.plain)
                        .disabled(scorerPick == nil || scorerPick == mine?.playerId || submittingScorer)
                    } else {
                        Button { showLogin = true } label: {
                            Text("سجّل دخولك للتوقّع")
                                .font(SabqFonts.app(size: 13, weight: .heavy)).foregroundStyle(.white)
                                .frame(maxWidth: .infinity).padding(.vertical, 10)
                                .background(Capsule().fill(WCTheme.emeraldDeep))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(WCTheme.emeraldDeep.opacity(0.05)))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(WCTheme.emeraldDeep.opacity(0.20), lineWidth: 1))
    }

    // MARK: مساعدات مشتركة

    private func teamLogo(_ url: String, size: CGFloat) -> some View {
        WCRemoteImage(url: url)
            .padding(size * 0.14)
            .frame(width: size, height: size)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(WCTheme.cardStroke, lineWidth: 1))
    }

    @ViewBuilder private func scorerPhoto(_ url: String, size: CGFloat) -> some View {
        if !url.isEmpty {
            WCRemoteImage(url: url, contentMode: .fill).frame(width: size, height: size).clipShape(Circle())
        } else {
            Circle().fill(WCTheme.chipFill).frame(width: size, height: size)
        }
    }

    private func statsRow(count: Int, leaderName: String?, leaderPct: Int?, tint: Color) -> some View {
        HStack(spacing: 14) {
            HStack(spacing: 5) {
                Image(systemName: "person.2.fill").font(.system(size: 11))
                Text("\(count) توقّعوا").font(SabqFonts.app(size: 11, weight: .bold))
            }
            .foregroundStyle(tint)

            if let leaderName = leaderName, let leaderPct = leaderPct {
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill").font(.system(size: 11)).foregroundStyle(tint)
                    Text("الأكثر توقّعًا:").font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                    Text(leaderName).font(SabqFonts.app(size: 11, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                    Text("(\(leaderPct)%)")
                        .font(SabqFonts.app(size: 11).monospacedDigit()).foregroundStyle(WCTheme.onDarkDim)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(tint.opacity(0.08)))
    }

    private func lockedBanner(_ text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "lock.fill").font(.system(size: 13))
            Text(text).font(SabqFonts.app(size: 13, weight: .bold))
        }
        .foregroundStyle(WCTheme.liveRed)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(WCTheme.liveRed.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [5, 3]))
        )
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
        VStack(spacing: 12) {
            if !authStore.isLoggedIn {
                loginPrompt
            } else if loading {
                WCLoading().padding(.top, 30)
            } else if items.isEmpty {
                emptyText("لم تضع أي توقّع بعد — ابدأ من تبويب «مباريات اليوم»")
            } else {
                summaryBar
                ForEach(items) { row($0) }
            }
        }
        .task(id: authStore.isLoggedIn) { if authStore.isLoggedIn { await load() } }
    }

    private var loginPrompt: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(.system(size: 40)).foregroundStyle(WCTheme.onDarkDim)
            Text("سجّل الدخول لعرض توقّعاتك ونقاطك")
                .font(SabqFonts.app(size: 14)).foregroundStyle(WCTheme.onDarkDim)
            Button { showLogin = true } label: {
                Text("تسجيل الدخول")
                    .font(SabqFonts.app(size: 13, weight: .heavy)).foregroundStyle(.white)
                    .padding(.horizontal, 24).padding(.vertical, 11)
                    .background(Capsule().fill(WCTheme.emeraldDeep))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 40)
    }

    private var summaryBar: some View {
        let total = items.reduce(0) { $0 + $1.pointsAwarded }
        let correct = items.filter { $0.status == "correct" }.count
        let played = items.filter { $0.status != "pending" }.count
        return HStack(spacing: 8) {
            tile("\(total)", "نقاطك", WCTheme.gold)
            tile("\(correct)", "إصابات", WCTheme.emeraldDeep)
            tile("\(played)", "مباريات", nil)
        }
    }

    private func tile(_ value: String, _ label: String, _ accent: Color?) -> some View {
        VStack(spacing: 2) {
            Text(value).font(SabqFonts.app(size: 18, weight: .black).monospacedDigit())
                .foregroundStyle(accent ?? WCTheme.onDark)
                .environment(\.layoutDirection, .leftToRight)
            Text(label).font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
    }

    private func row(_ item: WCPredictionHistoryItem) -> some View {
        // خروج المغلوب: «1-1» وحدها مضلِّلة — نوضّح من تأهّل بالترجيح.
        let penWin: (name: String, w: Int, l: Int)? = {
            guard let ph = item.finalPenHome, let pa = item.finalPenAway, ph != pa else { return nil }
            let homeWon = ph > pa
            return ((homeWon ? item.homeTeamName : item.awayTeamName) ?? "", max(ph, pa), min(ph, pa))
        }()
        return HStack(spacing: 10) {
            logo(item.homeTeamLogo)
            VStack(spacing: 2) {
                Text("\(item.predAway) - \(item.predHome)")
                    .font(SabqFonts.app(size: 14, weight: .black).monospacedDigit()).foregroundStyle(WCTheme.onDark)
                    .environment(\.layoutDirection, .leftToRight)
                if let fh = item.finalHome, let fa = item.finalAway {
                    Text("النتيجة \(fa)-\(fh)")
                        .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            .frame(minWidth: 64)
            logo(item.awayTeamLogo)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(item.homeTeamName ?? "") × \(item.awayTeamName ?? "")")
                    .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                if let pw = penWin {
                    Text("فاز \(pw.name) بالترجيح (\(pw.w)-\(pw.l))")
                        .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                statusBadge(item.status, points: item.pointsAwarded)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
    }

    @ViewBuilder private func logo(_ url: String?) -> some View {
        if let url, !url.isEmpty {
            WCRemoteImage(url: url).frame(width: 28, height: 28)
        } else {
            Circle().fill(WCTheme.chipFill).frame(width: 28, height: 28)
        }
    }

    private func load() async {
        if let r = try? await APIClient.shared.fetchWCMyPredictions() {
            await MainActor.run { items = r; loading = false }
        } else { await MainActor.run { loading = false } }
    }
}

// MARK: - تبويب: المتصدّرون

private struct WCPredLeaderboardTab: View {
    @State private var leaders: [WCPredLeader] = []
    @State private var loading = true

    var body: some View {
        VStack(spacing: 8) {
            if loading {
                WCLoading().padding(.top, 30)
            } else if leaders.isEmpty {
                emptyText("لا متصدّرين بعد — كن أول من يصيب نتيجة مباراة!")
            } else {
                ForEach(leaders) { row($0) }
            }
        }
        .task { await load() }
    }

    private func row(_ l: WCPredLeader) -> some View {
        HStack(spacing: 12) {
            rankBadge(l.rank)
            avatar(l.avatar)
            VStack(alignment: .leading, spacing: 2) {
                Text(l.name).font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.onDark).lineLimit(1)
                Text("\(l.correctCount) إصابة من \(l.playedCount)")
                    .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
            }
            Spacer()
            VStack(spacing: 1) {
                Text("\(l.totalPoints)")
                    .font(SabqFonts.app(size: 16, weight: .black).monospacedDigit()).foregroundStyle(WCTheme.gold)
                    .environment(\.layoutDirection, .leftToRight)
                Text("نقطة").font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(WCTheme.card))
    }

    private func rankBadge(_ rank: Int) -> some View {
        let color: Color = rank == 1 ? WCTheme.gold : (rank == 2 ? WCTheme.onDarkDim : (rank == 3 ? WCTheme.leaf : WCTheme.chipFill))
        let fg: Color = rank <= 3 ? .white : WCTheme.onDarkDim
        return Text("\(rank)")
            .font(SabqFonts.app(size: 13, weight: .black).monospacedDigit()).foregroundStyle(fg)
            .frame(width: 30, height: 30)
            .background(Circle().fill(rank <= 3 ? color : WCTheme.chipFill))
            .environment(\.layoutDirection, .leftToRight)
    }

    @ViewBuilder private func avatar(_ url: String?) -> some View {
        if let url, !url.isEmpty {
            WCRemoteImage(url: url, contentMode: .fill).frame(width: 34, height: 34).clipShape(Circle())
        } else {
            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: 30)).foregroundStyle(WCTheme.onDarkDim)
                .frame(width: 34, height: 34)
        }
    }

    private func load() async {
        if let r = try? await APIClient.shared.fetchWCLeaderboard() {
            await MainActor.run { leaders = r; loading = false }
        } else { await MainActor.run { loading = false } }
    }
}
