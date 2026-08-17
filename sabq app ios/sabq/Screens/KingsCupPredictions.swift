import SwiftUI

// MARK: - توقّعات كأس الملك — المنصة المركزية predictions-core
//
// تكافؤ مع الويب (/predictions?competition=kings-cup-2026) وأندرويد
// (KingsCupPredictionsScreen): اكتشاف slug بالبادئة "kings-cup" من
// /api/v1/predictions/competitions — لا ثابت مزروع — ثم المسابقات والحفظ
// واللوحة والدفتر على /api/v1/predictions/* بنماذج Pred* المشتركة
// (RoshnModels). قاعدة الكأس shared_pool: جائزة 500 نقطة تُقسم بالتساوي
// على أصحاب النتيجة الدقيقة — النص يُولَّد من ملف الاحتساب الفعّال
// (PredRule.summaryAr) لا من نص ثابت يتقادم.
//
// النسخة السابقة كانت تستدعي مسارات sports_pool المتقاعدة (#938) وتبتلع
// الفشل بـ try? — فلا حفظ ولا رسالة. الأخطاء الآن تُعرض نصًّا عربيًّا،
// و401 يرفع ورقة تسجيل الدخول.

/// بطاقة الدعوة في هب كأس الملك — مرآة WCPredictCTA بنص الكأس.
struct KcPredictCTA: View {
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
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(WCTheme.heroTop)
                }
                .shadow(color: WCTheme.gold.opacity(0.45), radius: 6, y: 2)

                VStack(alignment: .leading, spacing: 3) {
                    Text("توقّع وتنافس")
                        .font(SabqFonts.app(size: 16, weight: .semibold)).foregroundStyle(.white)
                    Text("أصِب نتيجة مباريات الكأس بدقة وتقاسم جائزة كل مباراة")
                        .font(SabqFonts.app(size: 11)).foregroundStyle(.white.opacity(0.85))
                        .lineLimit(2)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.left")
                    .font(SabqFonts.app(size: 14, weight: .semibold)).foregroundStyle(WCTheme.gold)
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

// MARK: المخزن

@Observable
@MainActor
final class KcPredictionsStore {
    var contests: [PredContest] = []
    var leaderboard: PredLeaderboardResponse?
    var rule: PredRule?
    var slug: String?
    var loading = false
    var error: String?
    var savingId: String?
    var savedId: String?
    private(set) var didLoad = false

    /// 401 عند الحفظ/الدفتر — يرفع ورقة تسجيل الدخول من الشاشة.
    var needsLogin = false

    // «نقاطي» — دفتر التسويات، كسول ويتطلب جلسة عضو.
    var ledger: [PredLedgerItem] = []
    var ledgerLoading = false
    var ledgerError: String?
    private(set) var didLoadLedger = false

    func load(force: Bool = false) async {
        if loading { return }
        if didLoad, !force { return }
        loading = true
        defer { loading = false }
        do {
            // اكتشاف المعرّف من الخادم لا ثابت مزروع — نفس نهج أندرويد والويب.
            if slug == nil {
                let comps = try await APIClient.shared.fetchPredCompetitions()
                slug = comps.first(where: { $0.slug.hasPrefix("kings-cup") })?.slug
                    ?? comps.first(where: { ($0.nameAr ?? "").contains("خادم الحرمين") })?.slug
            }
            guard let slug else {
                didLoad = true
                error = "مسابقة توقعات كأس الملك لم تُفعَّل بعد — عُد مع اقتراب انطلاق البطولة"
                return
            }
            async let contestsTask = APIClient.shared.fetchPredContests(slug: slug, ignoreCache: force)
            async let boardTask: PredLeaderboardResponse? = try? await APIClient.shared.fetchPredLeaderboard(slug: slug, ignoreCache: force)
            contests = try await contestsTask
            leaderboard = await boardTask
            error = nil
            didLoad = true
            // ملف الاحتساب لتبويب «الطريقة» — من أول مسابقة، ومرة واحدة.
            if rule == nil, let first = contests.first {
                rule = try? await APIClient.shared.fetchPredContestRule(contestId: first.id)
            }
        } catch {
            self.error = "تعذّر تحميل التوقعات حاليًا — أعد المحاولة بعد لحظات"
        }
    }

    func submit(contest: PredContest, home: Int, away: Int) async {
        guard savingId == nil else { return }
        savingId = contest.id
        defer { savingId = nil }
        do {
            _ = try await APIClient.shared.submitPredEntry(contestId: contest.id, home: home, away: away)
            // ثبّت التوقع محليًا بلا إعادة تحميل كاملة (لا وميض للقائمة).
            contests = contests.map { c in
                guard c.id == contest.id else { return c }
                return PredContest(
                    id: c.id, contestType: c.contestType, status: c.status, locksAt: c.locksAt,
                    metadata: c.metadata, result: c.result, entriesCount: c.entriesCount,
                    myEntry: PredMyEntry(id: c.myEntry?.id ?? "mine", payload: PredScorePayload(predHome: home, predAway: away))
                )
            }
            savedId = contest.id
            error = nil
        } catch APIError.unauthorized {
            needsLogin = true
        } catch {
            self.error = "تعذّر حفظ التوقع — أعد المحاولة"
        }
    }

    func loadLedger(force: Bool = false) async {
        if ledgerLoading { return }
        if didLoadLedger, !force { return }
        ledgerLoading = true
        defer { ledgerLoading = false }
        do {
            // المعرّف قد لا يكون مكتشفًا بعد إن فُتح التبويب قبل اكتمال load().
            if slug == nil { await load() }
            guard let slug else { return }
            ledger = try await APIClient.shared.fetchPredLedger(slug: slug, ignoreCache: force)
            ledgerError = nil
            didLoadLedger = true
        } catch APIError.unauthorized {
            ledgerError = "سجّل دخولك لعرض سجل توقعاتك ونقاطك"
        } catch {
            ledgerError = "تعذّر تحميل سجلك حاليًا — أعد المحاولة بعد لحظات"
        }
    }
}

// MARK: الشاشة

struct KcPredictionsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    @State private var store = KcPredictionsStore()
    @State private var tab: Tab = .matches
    @State private var drafts: [String: [Int]] = [:]
    @State private var showLogin = false

    enum Tab: String, CaseIterable {
        case matches = "المباريات"
        case ledger = "نقاطي"
        case leaders = "المتصدّرون"
        case how = "الطريقة"

        var icon: String {
            switch self {
            case .matches: "target"
            case .ledger: "star.circle"
            case .leaders: "medal.fill"
            case .how: "questionmark.circle"
            }
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 14) {
                    header
                    tabBar
                    switch tab {
                    case .matches: matchesTab
                    case .ledger: ledgerTab
                    case .leaders: leadersTab
                    case .how: howTab
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 28)
            }
            .background(WCTheme.sectionBackground.ignoresSafeArea())
            .navigationTitle("توقّعات كأس الملك")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(WCTheme.stadiumTop, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").foregroundStyle(.white) }
                }
            }
            .task {
                await store.load()
                // جلبة انتهازية للدفتر تغذي «دقّتي» في الترويسة — 401 يمر
                // بصمت وتظهر دعوة الدخول عند فتح «نقاطي».
                await store.loadLedger()
            }
            .task(id: authStore.isLoggedIn) {
                if authStore.isLoggedIn, store.didLoad {
                    await store.load(force: true)
                    await store.loadLedger(force: true)
                }
            }
            .onChange(of: store.needsLogin) { _, needs in
                if needs { showLogin = true; store.needsLogin = false }
            }
            .refreshable {
                await store.load(force: true)
                if store.didLoadLedger { await store.loadLedger(force: true) }
            }
            .sheet(isPresented: $showLogin) { LoginSheet() }
        }
        .sabqRTL()
        .environment(\.locale, RsFormat.latinLocale)
    }

    // MARK: الترويسة — ملعب داكن بخط ذهبي، مع حصاد العضو

    private var header: some View {
        VStack(spacing: 12) {
            HStack(spacing: 13) {
                Image(systemName: "target")
                    .font(SabqFonts.app(size: 26, weight: .medium))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(.white.opacity(0.16)))

                VStack(alignment: .leading, spacing: 4) {
                    Text("توقّع وتنافس")
                        .font(SabqFonts.app(size: 21, weight: .bold))
                        .foregroundStyle(.white)
                    Text("أصِب النتيجة الدقيقة وتقاسم جائزة كل مباراة")
                        .font(SabqFonts.app(size: 11))
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                Spacer(minLength: 0)
            }

            if authStore.isLoggedIn {
                // المسجّل يرى بطاقاته دائمًا — أصفار/شرطات قبل أول تسوية
                // (myRank لا يوجد إلا بعد تسويات، فلا يُشترط لعرض البطاقات).
                let my = store.leaderboard?.myRank
                HStack(spacing: 8) {
                    heroStat(value: RsFormat.latin(my?.points ?? 0), label: "نقطة حصدتها")
                    heroStat(value: my.map { RsFormat.latin($0.rank) } ?? "—", label: "مركزي")
                    heroStat(value: accuracyPercent.map { "\(RsFormat.latin($0))٪" } ?? "—", label: "دقّتي")
                }
            } else {
                Text("سجّل دخولك وتوقّع نتائج الكأس ونافس على الجوائز")
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(.white.opacity(0.16)))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(
            LinearGradient(colors: [WCTheme.stadiumTop, WCTheme.stadiumBottom],
                           startPoint: .top, endPoint: .bottom)
        )
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(alignment: .top) {
            RoundedRectangle(cornerRadius: 2)
                .fill(WCTheme.gold)
                .frame(height: 3)
                .padding(.horizontal, 40)
        }
    }

    private func heroStat(value: String, label: String) -> some View {
        HStack(spacing: 6) {
            Text(value).font(SabqFonts.app(size: 15, weight: .bold)).monospacedDigit()
            Text(label).font(SabqFonts.app(size: 10.5))
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(.white.opacity(0.16)))
    }

    private var tabBar: some View {
        HStack(spacing: 6) {
            ForEach(Tab.allCases, id: \.self) { item in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { tab = item }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: item.icon)
                            .font(SabqFonts.app(size: 10, weight: .medium))
                        Text(item.rawValue)
                            .font(SabqFonts.app(size: 12, weight: tab == item ? .semibold : .regular))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(tab == item ? .white : WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(
                        RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .fill(tab == item ? AnyShapeStyle(WCTheme.royal) : AnyShapeStyle(WCTheme.chipFill))
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: مشتقات الحصاد — من الدفتر ومباريات المسابقة (صفر تغيير خادم)

    /// قاعدة الكأس exact فقط — كل سطر إصابة في الدفتر سببه "exact".
    private var hitLedger: [PredLedgerItem] {
        store.ledger.filter { ["exact", "margin", "outcome"].contains($0.reasonCode) }
    }

    private var settledMineCount: Int {
        store.contests.filter { $0.myEntry != nil && $0.status == "settled" }.count
    }

    private var accuracyPercent: Int? {
        let settled = settledMineCount
        guard settled > 0 else { return nil }
        return Int((Double(hitLedger.count) / Double(settled) * 100).rounded())
    }

    // MARK: تبويب المباريات

    private var openContests: [PredContest] {
        store.contests.filter { $0.isMatchScore && $0.isOpen }
            .sorted { ($0.locksAtDate ?? .distantFuture) < ($1.locksAtDate ?? .distantFuture) }
    }

    private var settledContests: [PredContest] {
        store.contests.filter { $0.isMatchScore && ($0.status == "settled" || $0.status == "locked" || $0.status == "ready") }
            .sorted { ($0.locksAtDate ?? .distantPast) > ($1.locksAtDate ?? .distantPast) }
    }

    @ViewBuilder
    private var matchesTab: some View {
        VStack(spacing: 10) {
            if let error = store.error {
                errorBanner(error)
            }

            // تقدّم الدور: كم مباراة مفتوحة توقّعتها — يدفع لإكمالها.
            let openAll = openContests
            let openMine = openAll.filter { $0.myEntry?.payload != nil }.count
            if openAll.count > 1, authStore.isLoggedIn {
                HStack(spacing: 8) {
                    Image(systemName: "checklist")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(WCTheme.emeraldDeep)
                    Text("توقعاتك هذا الدور: \(RsFormat.latin(openMine)) من \(RsFormat.latin(openAll.count))")
                        .font(SabqFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(WCTheme.onDark)
                    Spacer()
                    Text(openMine < openAll.count ? "أكملها 👇" : "اكتملت ✓")
                        .font(SabqFonts.app(size: 10.5, weight: openMine < openAll.count ? .regular : .semibold))
                        .foregroundStyle(openMine < openAll.count ? WCTheme.onDarkDim : WCTheme.emeraldDeep)
                }
                .padding(11)
                .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(WCTheme.chipFill))
            }

            if store.loading, store.contests.isEmpty {
                KcLoading().padding(.top, 30)
            } else if openContests.isEmpty, settledContests.isEmpty, store.error == nil {
                WCEmptyState(icon: "calendar.badge.clock",
                             title: "لا مباريات متاحة للتوقّع حاليًا",
                             subtitle: "تُفتح التوقّعات مع إعلان جدول الدور القادم")
            }

            ForEach(openContests) { contest in
                openContestCard(contest)
            }

            if !settledContests.isEmpty {
                sectionLabel("آخر المباريات")
                ForEach(settledContests.prefix(8)) { contest in
                    settledContestRow(contest)
                }
            }
        }
    }

    private func openContestCard(_ contest: PredContest) -> some View {
        let draft = drafts[contest.id]
            ?? [contest.myEntry?.payload?.predHome ?? 0, contest.myEntry?.payload?.predAway ?? 0]
        return VStack(spacing: 10) {
            if let round = contest.metadata?.round, !round.isEmpty {
                HStack(spacing: 6) {
                    Text(round)
                    if let date = contest.locksAtDate {
                        Text("·")
                        Text(WCFormat.dayRiyadh.string(from: date))
                    }
                    Spacer()
                }
                .font(SabqFonts.app(size: 10.5))
                .foregroundStyle(WCTheme.onDarkDim)
            }

            HStack(spacing: 10) {
                teamSide(contest.metadata?.home)
                VStack(spacing: 3) {
                    // صف RTL طبيعي: أول عنصر يمينًا — عدّاد المضيف تحت اسمه دائمًا.
                    HStack(spacing: 8) {
                        stepper(value: draft[0]) { drafts[contest.id] = [$0, draft[1]] }
                        Text("-").foregroundStyle(WCTheme.onDarkDim)
                        stepper(value: draft[1]) { drafts[contest.id] = [draft[0], $0] }
                    }
                    if let date = contest.locksAtDate {
                        TimelineView(.periodic(from: .now, by: 60)) { _ in
                            Text(lockLabel(date))
                                .font(SabqFonts.app(size: 9.5)).foregroundStyle(WCTheme.onDarkDim)
                        }
                    }
                    // عدّاد المتوقّعين — إثبات اجتماعي، رقم بلا أسماء (عقد #1326).
                    if let count = contest.entriesCount, count > 0 {
                        HStack(spacing: 4) {
                            Image(systemName: "person.2.fill")
                                .font(SabqFonts.app(size: 8, weight: .medium))
                            Text(predictorsLabel(count))
                                .font(SabqFonts.app(size: 9.5, weight: .medium))
                        }
                        .foregroundStyle(WCTheme.emeraldDeep)
                    }
                }
                teamSide(contest.metadata?.away)
            }

            Button {
                guard authStore.isLoggedIn else { showLogin = true; return }
                Task { await store.submit(contest: contest, home: draft[0], away: draft[1]) }
            } label: {
                HStack(spacing: 6) {
                    if store.savingId == contest.id { ProgressView().tint(.white).scaleEffect(0.8) }
                    Text(buttonTitle(contest))
                        .font(SabqFonts.app(size: 12.5, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .fill(store.savedId == contest.id ? WCTheme.emerald : WCTheme.royal)
                )
            }
            .buttonStyle(.plain)
            .disabled(store.savingId != nil)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .wcElevatedCard(cornerRadius: 16)
    }

    private func buttonTitle(_ contest: PredContest) -> String {
        if store.savingId == contest.id { return "جارٍ الحفظ…" }
        if store.savedId == contest.id { return "تم حفظ توقعك ✓" }
        return contest.myEntry?.payload == nil ? "احفظ توقعك" : "عدّل توقعك"
    }

    private func predictorsLabel(_ count: Int) -> String {
        switch count {
        case 1: return "متوقّع واحد"
        case 2: return "متوقّعان"
        case 3...10: return "\(RsFormat.latin(count)) متوقّعين"
        default: return "\(RsFormat.latin(count)) متوقّعًا"
        }
    }

    private func lockLabel(_ date: Date) -> String {
        let seconds = Int(date.timeIntervalSinceNow)
        if seconds <= 0 { return "أُغلق التوقع" }
        let days = seconds / 86_400
        let hours = (seconds % 86_400) / 3_600
        let minutes = (seconds % 3_600) / 60
        if days > 0 { return "يُقفل بعد \(days)ي \(hours)س" }
        if hours > 0 { return "يُقفل بعد \(hours)س \(minutes)د" }
        return "يُقفل بعد \(max(minutes, 1))د"
    }

    private func teamSide(_ team: PredTeamMeta?) -> some View {
        VStack(spacing: 5) {
            WCRemoteImage(url: team?.logo ?? "")
                .padding(3).frame(width: 40, height: 40)
                .background(Circle().fill(.white))
                .overlay(Circle().stroke(WCTheme.cardStroke, lineWidth: 1))
            Text(team?.name ?? "—")
                .font(SabqFonts.app(size: 11.5, weight: .semibold))
                .foregroundStyle(WCTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    private func stepper(value: Int, onChange: @escaping (Int) -> Void) -> some View {
        HStack(spacing: 6) {
            Button { onChange(min(value + 1, 20)) } label: {
                Image(systemName: "plus")
                    .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(WCTheme.chipFill))
            }
            .buttonStyle(.plain)
            Text(RsFormat.latin(value))
                .font(SabqFonts.app(size: 20, weight: .bold)).foregroundStyle(WCTheme.onDark)
                .monospacedDigit().frame(minWidth: 26)
            Button { onChange(max(value - 1, 0)) } label: {
                Image(systemName: "minus")
                    .font(SabqFonts.app(size: 10, weight: .bold)).foregroundStyle(WCTheme.onDarkDim)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(WCTheme.chipFill))
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: نتيجة بأرقام مفصولة — درع الانقلاب
    //
    // كل رقم عنصر مستقل ملاصق لفريقه في صف RTL طبيعي (المضيف يمينًا دائمًا)
    // — لا زوج نصي داخل عزل LTR إطلاقًا، فلا يوجد ما ينقلب.

    private func scoreNumber(_ value: Int, emphasized: Bool) -> some View {
        Text(RsFormat.latin(value))
            .font(SabqFonts.app(size: emphasized ? 13 : 10, weight: .bold))
            .foregroundStyle(emphasized ? .white : WCTheme.onDarkDim)
            .monospacedDigit()
            .padding(.horizontal, emphasized ? 7 : 0).padding(.vertical, emphasized ? 2 : 0)
            .background(
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(emphasized ? WCTheme.royal : Color.clear)
            )
    }

    /// [مضيف][-][ضيف] في صف RTL: أول عنصر يظهر يمينًا — رقم المضيف تحت اسمه دائمًا.
    private func splitScore(home: Int, away: Int, emphasized: Bool = true) -> some View {
        HStack(spacing: 5) {
            scoreNumber(home, emphasized: emphasized)
            Text("-")
                .font(SabqFonts.app(size: emphasized ? 11 : 9))
                .foregroundStyle(WCTheme.onDarkDim)
            scoreNumber(away, emphasized: emphasized)
        }
    }

    private func settledContestRow(_ contest: PredContest) -> some View {
        HStack(spacing: 10) {
            Text(contest.metadata?.home?.name ?? "—")
                .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            VStack(spacing: 3) {
                if let r = contest.result, let fh = r.finalHome, let fa = r.finalAway {
                    splitScore(home: fh, away: fa)
                } else {
                    Text("بانتظار النتيجة")
                        .font(SabqFonts.app(size: 10)).foregroundStyle(WCTheme.onDarkDim)
                }
                if let p = contest.myEntry?.payload, let ph = p.predHome, let pa = p.predAway {
                    HStack(spacing: 4) {
                        Text("توقعت")
                            .font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim)
                        splitScore(home: ph, away: pa, emphasized: false)
                    }
                }
            }
            .frame(width: 104)
            Text(contest.metadata?.away?.name ?? "—")
                .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                .lineLimit(1).frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .wcElevatedCard(cornerRadius: 13)
    }

    // MARK: تبويب نقاطي — حصاد البطولة + سجلّ التسويات

    private func harvestTile(value: String, label: String, tint: Color) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(SabqFonts.app(size: 16, weight: .bold))
                .foregroundStyle(tint)
                .monospacedDigit()
            Text(label)
                .font(SabqFonts.app(size: 9))
                .foregroundStyle(WCTheme.onDarkDim)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9)
        .wcElevatedCard(cornerRadius: 14)
    }

    @ViewBuilder
    private var harvestGrid: some View {
        // قاعدة الكأس exact فقط — لا فارق/اتجاه كما في روشن.
        let exact = store.ledger.filter { $0.reasonCode == "exact" }.count
        let best = store.ledger.map(\.points).max() ?? 0
        HStack(spacing: 7) {
            harvestTile(value: RsFormat.latin(settledMineCount), label: "توقعًا مُسوّى", tint: WCTheme.onDark)
            harvestTile(value: RsFormat.latin(exact), label: "نتيجة دقيقة 🎯", tint: WCTheme.gold)
            harvestTile(value: accuracyPercent.map { "\(RsFormat.latin($0))٪" } ?? "—", label: "نسبة الإصابة", tint: WCTheme.emeraldDeep)
            harvestTile(value: RsFormat.latin(best), label: "أفضل تسوية", tint: WCTheme.gold)
        }
    }

    @ViewBuilder
    private var ledgerTab: some View {
        VStack(spacing: 10) {
            if let error = store.ledgerError {
                HStack(spacing: 9) {
                    Image(systemName: "person.crop.circle.badge.exclamationmark")
                        .foregroundStyle(WCTheme.gold)
                    Text(error)
                        .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button(authStore.isLoggedIn ? "إعادة" : "دخول") {
                        if authStore.isLoggedIn {
                            Task { await store.loadLedger(force: true) }
                        } else {
                            showLogin = true
                        }
                    }
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(WCTheme.emeraldDeep)
                }
                .padding(11)
                .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(WCTheme.chipFill))
            }

            if store.ledgerLoading, store.ledger.isEmpty {
                KcLoading().padding(.top, 30)
            } else if store.ledger.isEmpty, store.ledgerError == nil {
                WCEmptyState(icon: "list.bullet.clipboard",
                             title: "حصادك يبدأ مع أول تسوية",
                             subtitle: "توقّع مباريات الدور وعُد بعد صافرة النهاية")
            } else if !store.ledger.isEmpty {
                if let my = store.leaderboard?.myRank {
                    HStack(spacing: 8) {
                        Image(systemName: "sum").foregroundStyle(WCTheme.gold)
                        Text("مجموع ما حصدته في البطولة")
                            .font(SabqFonts.app(size: 12)).foregroundStyle(WCTheme.onDark)
                        Spacer()
                        Text("\(RsFormat.latin(my.points)) نقطة")
                            .font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                            .monospacedDigit()
                    }
                    .padding(12)
                    .wcElevatedCard(cornerRadius: 13)
                }

                sectionLabel("حصاد البطولة")
                harvestGrid

                sectionLabel("سجلّ التسويات")
                ForEach(store.ledger) { item in
                    ledgerRow(item)
                }
            }
        }
    }

    private func ledgerRow(_ item: PredLedgerItem) -> some View {
        // اسم الفريقين من مسابقات البطولة المحمّلة (ربط contestId)،
        // والنتيجة/التوقع من تفكيك التسوية — أرقام مفصولة لا نص خام.
        let contest = store.contests.first(where: { $0.id == item.contestId })
        let final = item.breakdown?.finalPair
        let predicted = item.breakdown?.predictionPair

        return HStack(spacing: 10) {
            Image(systemName: item.reasonCode == "exact" ? "target" : "star.fill")
                .font(SabqFonts.app(size: 14, weight: .medium))
                .foregroundStyle(item.reasonCode == "exact" ? WCTheme.gold : WCTheme.onDarkDim)
                .frame(width: 30, height: 30)
                .background(Circle().fill(WCTheme.chipFill))

            VStack(alignment: .leading, spacing: 3) {
                if let contest, let final {
                    // سطر المباراة: [مضيف][نتيجته]-[نتيجة الضيف][ضيف] — RTL طبيعي.
                    HStack(spacing: 5) {
                        Text(contest.metadata?.home?.name ?? "—")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                            .foregroundStyle(WCTheme.onDark)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        splitScore(home: final.home, away: final.away, emphasized: false)
                        Text(contest.metadata?.away?.name ?? "—")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                            .foregroundStyle(WCTheme.onDark)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                }
                HStack(spacing: 4) {
                    Text(item.reasonLabelAr.isEmpty ? "تسوية توقع" : item.reasonLabelAr)
                        .font(SabqFonts.app(size: contest != nil ? 10 : 12.5,
                                            weight: contest != nil ? .regular : .semibold))
                        .foregroundStyle(contest != nil ? WCTheme.onDarkDim : WCTheme.onDark)
                        .lineLimit(2)
                    if let predicted {
                        Text("· توقعت")
                            .font(SabqFonts.app(size: 9)).foregroundStyle(WCTheme.onDarkDim)
                        splitScore(home: predicted.home, away: predicted.away, emphasized: false)
                    }
                }
                if let date = item.createdAtDate {
                    Text(RsFormat.day(iso: item.createdAt) + " · " + WCFormat.timeRiyadh.string(from: date))
                        .font(SabqFonts.app(size: 9.5))
                        .foregroundStyle(WCTheme.onDarkDim)
                }
            }

            Spacer(minLength: 6)

            // نقاط التسوية — رقم واحد فلا التباس؛ علامة + قبله بعزل سليم.
            HStack(spacing: 1) {
                Text("+").font(SabqFonts.app(size: 12, weight: .bold))
                Text(RsFormat.latin(item.points))
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .monospacedDigit()
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(WCTheme.royal))
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .wcElevatedCard(cornerRadius: 13)
    }

    // MARK: تبويب المتصدّرين

    @ViewBuilder
    private var leadersTab: some View {
        VStack(spacing: 10) {
            if let error = store.error {
                errorBanner(error)
            }
            let entries = store.leaderboard?.entries ?? []
            if store.loading, entries.isEmpty {
                KcLoading().padding(.top, 30)
            } else if entries.isEmpty {
                WCEmptyState(icon: "list.number",
                             title: "الصدارة تتشكّل مع أول تسوية",
                             subtitle: "كن أول من يسجّل النقاط في مسابقة التوقّعات")
            } else {
                // مركزي أولًا إن كنت خارج العشرين الظاهرين.
                if let my = store.leaderboard?.myRank, !entries.prefix(20).contains(where: { $0.rank == my.rank }) {
                    HStack(spacing: 8) {
                        Text("مركزك: \(RsFormat.latin(my.rank))")
                            .font(SabqFonts.app(size: 12, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                        Spacer()
                        Text("\(RsFormat.latin(my.points)) نقطة")
                            .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                            .monospacedDigit()
                    }
                    .padding(.horizontal, 12).padding(.vertical, 10)
                    .wcElevatedCard(cornerRadius: 13)
                }
                ForEach(entries.prefix(20)) { entry in
                    leaderRow(entry)
                }
            }
        }
    }

    private func leaderRow(_ entry: PredLeaderEntry) -> some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(entry.rank <= 3 ? WCTheme.gold.opacity(0.18) : WCTheme.chipFill)
                Text(RsFormat.latin(entry.rank))
                    .font(SabqFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(entry.rank <= 3 ? WCTheme.gold : WCTheme.onDarkDim)
                    .monospacedDigit()
            }
            .frame(width: 24, height: 24)
            WCRemoteImage(url: entry.profileImageUrl ?? "")
                .frame(width: 30, height: 30)
                .background(Circle().fill(WCTheme.chipFill))
                .clipShape(Circle())
            Text(entry.name)
                .font(SabqFonts.app(size: 12.5, weight: .semibold)).foregroundStyle(WCTheme.onDark)
                .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            Text("\(RsFormat.latin(entry.points)) نقطة")
                .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(WCTheme.emeraldDeep)
                .monospacedDigit()
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .wcElevatedCard(cornerRadius: 13)
    }

    // MARK: تبويب طريقة التوقعات

    @ViewBuilder
    private var howTab: some View {
        VStack(spacing: 10) {
            // ملف الاحتساب الفعّال من الخادم — لا نص ثابت يتقادم.
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 7) {
                    Image(systemName: "star.circle.fill")
                        .font(SabqFonts.app(size: 15, weight: .medium))
                        .foregroundStyle(WCTheme.gold)
                    Text("نظام النقاط")
                        .font(SabqFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(WCTheme.onDark)
                }
                Text(store.rule?.summaryAr ?? "تُحتسب النقاط بعد صافرة نهاية كل مباراة وتُضاف لرصيدك تلقائيًا")
                    .font(SabqFonts.app(size: 13))
                    .foregroundStyle(WCTheme.onDark)
                    .lineSpacing(5)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WCTheme.gold.opacity(0.12)))

            VStack(alignment: .leading, spacing: 14) {
                howStep(number: 1, icon: "square.and.pencil",
                        title: "اختر نتيجة المباراة",
                        text: "حدد أهداف كل فريق قبل انطلاق المباراة — التوقع يُقفل عند صافرة البداية")
                howStep(number: 2, icon: "arrow.triangle.2.circlepath",
                        title: "عدّل توقعك متى شئت",
                        text: "يمكنك تعديل توقعك بلا حدود حتى لحظة الإقفال، ويُعتمد آخر توقع محفوظ")
                howStep(number: 3, icon: "checkmark.seal.fill",
                        title: "الجائزة تُقسم تلقائيًا",
                        text: "بعد صافرة النهاية تُقسم جائزة المباراة بالتساوي على أصحاب النتيجة الدقيقة")
                howStep(number: 4, icon: "trophy.fill",
                        title: "نافس حتى النهائي",
                        text: "رصيدك التراكمي يحدد مركزك بين المتنافسين في تبويب المتصدّرين")
            }
            .padding(14)
            .wcElevatedCard(cornerRadius: 16)

            HStack(spacing: 9) {
                Image(systemName: "person.crop.circle.badge.checkmark")
                    .foregroundStyle(WCTheme.emeraldDeep)
                Text("المشاركة تتطلب تسجيل الدخول بحسابك في سبق — التصفح متاح للجميع")
                    .font(SabqFonts.app(size: 11))
                    .foregroundStyle(WCTheme.onDarkDim)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(11)
            .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(WCTheme.chipFill))
        }
    }

    private func howStep(number: Int, icon: String, title: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 11) {
            ZStack {
                Circle().fill(WCTheme.chipFill)
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(WCTheme.emeraldDeep)
            }
            .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 3) {
                Text("\(RsFormat.latin(number)). \(title)")
                    .font(SabqFonts.app(size: 13.5, weight: .bold))
                    .foregroundStyle(WCTheme.onDark)
                Text(text)
                    .font(SabqFonts.app(size: 11.5))
                    .foregroundStyle(WCTheme.onDarkDim)
                    .lineSpacing(3)
            }
        }
    }

    // MARK: عناصر مشتركة

    private func sectionLabel(_ title: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(WCTheme.gold).frame(width: 6, height: 6)
            Text(title)
                .font(SabqFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(WCTheme.emeraldDeep)
            Spacer()
        }
        .padding(.top, 4)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 9) {
            Image(systemName: "info.circle").foregroundStyle(WCTheme.gold)
            Text(message)
                .font(SabqFonts.app(size: 11)).foregroundStyle(WCTheme.onDarkDim)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("إعادة") { Task { await store.load(force: true) } }
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(WCTheme.emeraldDeep)
        }
        .padding(11)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(WCTheme.chipFill))
    }
}
