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

/// بطاقة الدعوة في هب كأس الملك — بلوك هادئ بلمسة الهوية.
struct KcPredictCTA: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "target")
                    .font(SabqType.sectionHeading.font)
                    .foregroundStyle(KcTheme.accent)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surface))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text("توقّع وتنافس")
                        .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                    Text("أصِب نتيجة مباريات الكأس بدقة وتقاسم جائزة كل مباراة")
                        .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(2)
                }
                Spacer(minLength: SabqLayout.space4)
                Image(systemName: "chevron.left")
                    .font(SabqType.metaEmphasis.font).foregroundStyle(SabqTheme.textTertiary)
                    .accessibilityHidden(true)
            }
            .padding(SabqLayout.space16)
            .sabqBlockSurface()
            .contentShape(Rectangle())
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
                VStack(spacing: SabqLayout.space16) {
                    header
                    tabBar
                    switch tab {
                    case .matches: matchesTab
                    case .ledger: ledgerTab
                    case .leaders: leadersTab
                    case .how: howTab
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.top, SabqLayout.space8)
                .padding(.bottom, SabqLayout.space32)
            }
            .background(SabqTheme.background.ignoresSafeArea())
            .navigationTitle("توقّعات كأس الملك")
            .navigationBarTitleDisplayMode(.inline)
            .kcSheetToolbar { dismiss() }
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

    // MARK: الترويسة — شريط هوية مسطح بلون الكأس، مع حصاد العضو

    private var header: some View {
        VStack(spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "target")
                    .font(SabqType.leadTitle.font)
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(Color.black.opacity(0.18)))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text("توقّع وتنافس")
                        .sabqText(SabqType.sectionHeading)
                        .foregroundStyle(.white)
                    Text("أصِب النتيجة الدقيقة وتقاسم جائزة كل مباراة")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(.white)
                        .lineLimit(2).minimumScaleFactor(0.8)
                }
                Spacer(minLength: 0)
            }

            if authStore.isLoggedIn {
                // المسجّل يرى بطاقاته دائمًا — أصفار/شرطات قبل أول تسوية
                // (myRank لا يوجد إلا بعد تسويات، فلا يُشترط لعرض البطاقات).
                let my = store.leaderboard?.myRank
                HStack(spacing: SabqLayout.space8) {
                    heroStat(value: RsFormat.latin(my?.points ?? 0), label: "نقطة حصدتها")
                    heroStat(value: my.map { RsFormat.latin($0.rank) } ?? "—", label: "مركزي")
                    heroStat(value: accuracyPercent.map { "\(RsFormat.latin($0))٪" } ?? "—", label: "دقّتي")
                }
            } else {
                Text("سجّل دخولك وتوقّع نتائج الكأس ونافس على الجوائز")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, SabqLayout.space8)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(Color.black.opacity(0.18)))
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(KcTheme.accentFill))
    }

    private func heroStat(value: String, label: String) -> some View {
        VStack(spacing: 0) {
            Text(value).sabqText(SabqType.rowTitle).monospacedDigit()
            Text(label).sabqText(SabqType.tag).lineLimit(1).minimumScaleFactor(0.8)
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space8)
        .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(Color.black.opacity(0.18)))
    }

    private var tabBar: some View {
        HStack(spacing: SabqLayout.space8) {
            ForEach(Tab.allCases, id: \.self) { item in
                KcChip(title: item.rawValue, selected: tab == item, fillWidth: true) {
                    withAnimation(.easeInOut(duration: 0.2)) { tab = item }
                }
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
        VStack(spacing: SabqLayout.space12) {
            if let error = store.error {
                errorBanner(error)
            }

            // تقدّم الدور: كم مباراة مفتوحة توقّعتها — يدفع لإكمالها.
            let openAll = openContests
            let openMine = openAll.filter { $0.myEntry?.payload != nil }.count
            if openAll.count > 1, authStore.isLoggedIn {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "checklist")
                        .foregroundStyle(KcTheme.accent)
                        .accessibilityHidden(true)
                    Text("توقعاتك هذا الدور: \(RsFormat.latin(openMine)) من \(RsFormat.latin(openAll.count))")
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Spacer()
                    Text(openMine < openAll.count ? "أكملها 👇" : "اكتملت ✓")
                        .sabqText(openMine < openAll.count ? SabqType.meta : SabqType.metaEmphasis)
                        .foregroundStyle(openMine < openAll.count ? SabqTheme.textSecondary : KcTheme.accent)
                }
                .padding(SabqLayout.space12)
                .sabqBlockSurface()
            }

            if store.loading, store.contests.isEmpty {
                KcLoading().padding(.top, SabqLayout.space32)
            } else if openContests.isEmpty, settledContests.isEmpty, store.error == nil {
                EmptyStateView(icon: "calendar.badge.clock", tint: KcTheme.accent,
                               title: "لا مباريات متاحة للتوقّع حاليًا",
                               subtitle: "تُفتح التوقّعات مع إعلان جدول الدور القادم")
                    .padding(.vertical, SabqLayout.space24)
            }

            VStack(spacing: 0) {
                ForEach(Array(openContests.enumerated()), id: \.element.id) { index, contest in
                    if index > 0 { KcRowSeparator() }
                    openContestCard(contest)
                }
            }

            if !settledContests.isEmpty {
                sectionLabel("آخر المباريات")
                VStack(spacing: 0) {
                    ForEach(Array(settledContests.prefix(8).enumerated()), id: \.element.id) { index, contest in
                        if index > 0 { KcRowSeparator() }
                        settledContestRow(contest)
                    }
                }
            }
        }
    }

    private func openContestCard(_ contest: PredContest) -> some View {
        let draft = drafts[contest.id]
            ?? [contest.myEntry?.payload?.predHome ?? 0, contest.myEntry?.payload?.predAway ?? 0]
        return VStack(spacing: SabqLayout.space12) {
            if let round = contest.metadata?.round, !round.isEmpty {
                HStack(spacing: SabqLayout.space4) {
                    Text(round)
                    if let date = contest.locksAtDate {
                        Text("·")
                        Text(WCFormat.dayRiyadh.string(from: date))
                    }
                    Spacer()
                }
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
            }

            HStack(spacing: SabqLayout.space8) {
                teamSide(contest.metadata?.home)
                VStack(spacing: SabqLayout.space4) {
                    // صف RTL طبيعي: أول عنصر يمينًا — عدّاد المضيف تحت اسمه دائمًا.
                    HStack(spacing: SabqLayout.space8) {
                        stepper(value: draft[0]) { drafts[contest.id] = [$0, draft[1]] }
                        Text("-").foregroundStyle(SabqTheme.textSecondary)
                        stepper(value: draft[1]) { drafts[contest.id] = [draft[0], $0] }
                    }
                    if let date = contest.locksAtDate {
                        TimelineView(.periodic(from: .now, by: 60)) { _ in
                            Text(lockLabel(date))
                                .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                        }
                    }
                    // عدّاد المتوقّعين — إثبات اجتماعي، رقم بلا أسماء (عقد #1326).
                    if let count = contest.entriesCount, count > 0 {
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "person.2.fill").accessibilityHidden(true)
                            Text(predictorsLabel(count))
                        }
                        .sabqText(SabqType.tag)
                        .foregroundStyle(KcTheme.accent)
                    }
                }
                teamSide(contest.metadata?.away)
            }

            Button {
                guard authStore.isLoggedIn else { showLogin = true; return }
                Task { await store.submit(contest: contest, home: draft[0], away: draft[1]) }
            } label: {
                HStack(spacing: SabqLayout.space8) {
                    if store.savingId == contest.id { ProgressView().tint(.white).scaleEffect(0.8) }
                    Text(buttonTitle(contest))
                        .font(SabqType.button.font)
                        .foregroundStyle(SabqTheme.onAction)
                }
                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(store.savedId == contest.id ? KcTheme.ratingFill(7) : KcTheme.accentFill)
                )
            }
            .buttonStyle(.plain)
            .disabled(store.savingId != nil)
        }
        .padding(.vertical, SabqLayout.space16)
        .frame(maxWidth: .infinity)
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
        VStack(spacing: SabqLayout.space4) {
            WCRemoteImage(url: team?.logo ?? "")
                .padding(3).frame(width: 40, height: 40)
                .background(Circle().fill(.white))
                .overlay(Circle().stroke(SabqTheme.separator, lineWidth: 1))
            Text(team?.name ?? "—")
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    private func stepper(value: Int, onChange: @escaping (Int) -> Void) -> some View {
        HStack(spacing: SabqLayout.space4) {
            Button { onChange(min(value + 1, 20)) } label: {
                Image(systemName: "plus")
                    .font(SabqType.metaEmphasis.font).foregroundStyle(KcTheme.accent)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(SabqTheme.surfaceMuted))
            }
            .buttonStyle(.plain)
            Text(RsFormat.latin(value))
                .sabqText(SabqType.sectionHeading).foregroundStyle(SabqTheme.textPrimary)
                .monospacedDigit().frame(minWidth: 26)
            Button { onChange(max(value - 1, 0)) } label: {
                Image(systemName: "minus")
                    .font(SabqType.metaEmphasis.font).foregroundStyle(SabqTheme.textSecondary)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(SabqTheme.surfaceMuted))
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
            .sabqText(emphasized ? SabqType.metaEmphasis : SabqType.tag)
            .foregroundStyle(emphasized ? SabqTheme.onAction : SabqTheme.textSecondary)
            .monospacedDigit()
            .padding(.horizontal, emphasized ? SabqLayout.space8 : 0).padding(.vertical, emphasized ? 2 : 0)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                    .fill(emphasized ? KcTheme.accentFill : Color.clear)
            )
    }

    /// [مضيف][-][ضيف] في صف RTL: أول عنصر يظهر يمينًا — رقم المضيف تحت اسمه دائمًا.
    private func splitScore(home: Int, away: Int, emphasized: Bool = true) -> some View {
        HStack(spacing: SabqLayout.space4) {
            scoreNumber(home, emphasized: emphasized)
            Text("-")
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.textSecondary)
            scoreNumber(away, emphasized: emphasized)
        }
    }

    private func settledContestRow(_ contest: PredContest) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Text(contest.metadata?.home?.name ?? "—")
                .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            VStack(spacing: SabqLayout.space4) {
                if let r = contest.result, let fh = r.finalHome, let fa = r.finalAway {
                    splitScore(home: fh, away: fa)
                    // ركلات الترجيح تحت النتيجة النهائية (نقل الويب #1439)
                    if let pen = PredScoreResult.penaltiesLabel(r.penalties ?? contest.metadata?.penalties) {
                        Text(pen)
                            .sabqText(SabqType.tag)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .monospacedDigit()
                            .environment(\.layoutDirection, .leftToRight)
                    }
                } else {
                    Text("بانتظار النتيجة")
                        .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                }
                if let p = contest.myEntry?.payload, let ph = p.predHome, let pa = p.predAway {
                    HStack(spacing: SabqLayout.space4) {
                        Text("توقعت")
                            .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                        splitScore(home: ph, away: pa, emphasized: false)
                    }
                }
            }
            .frame(width: 112)
            Text(contest.metadata?.away?.name ?? "—")
                .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.vertical, SabqLayout.space12)
    }

    // MARK: تبويب نقاطي — حصاد البطولة + سجلّ التسويات

    private func harvestTile(value: String, label: String, tint: Color) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(tint)
                .monospacedDigit()
            Text(label)
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space8)
        .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
    }

    @ViewBuilder
    private var harvestGrid: some View {
        // قاعدة الكأس exact فقط — لا فارق/اتجاه كما في روشن.
        let exact = store.ledger.filter { $0.reasonCode == "exact" }.count
        let best = store.ledger.map(\.points).max() ?? 0
        HStack(spacing: SabqLayout.space8) {
            harvestTile(value: RsFormat.latin(settledMineCount), label: "توقعًا مُسوّى", tint: SabqTheme.textPrimary)
            harvestTile(value: RsFormat.latin(exact), label: "نتيجة دقيقة 🎯", tint: SabqTheme.warning)
            harvestTile(value: accuracyPercent.map { "\(RsFormat.latin($0))٪" } ?? "—", label: "نسبة الإصابة", tint: KcTheme.accent)
            harvestTile(value: RsFormat.latin(best), label: "أفضل تسوية", tint: SabqTheme.warning)
        }
    }

    @ViewBuilder
    private var ledgerTab: some View {
        VStack(spacing: SabqLayout.space12) {
            if let error = store.ledgerError {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "person.crop.circle.badge.exclamationmark")
                        .foregroundStyle(SabqTheme.warning)
                        .accessibilityHidden(true)
                    Text(error)
                        .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button(authStore.isLoggedIn ? "إعادة" : "دخول") {
                        if authStore.isLoggedIn {
                            Task { await store.loadLedger(force: true) }
                        } else {
                            showLogin = true
                        }
                    }
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(KcTheme.accent)
                    .frame(minWidth: SabqLayout.touchTarget, minHeight: SabqLayout.touchTarget)
                }
                .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space4)
                .sabqBlockSurface()
            }

            if store.ledgerLoading, store.ledger.isEmpty {
                KcLoading().padding(.top, SabqLayout.space32)
            } else if store.ledger.isEmpty, store.ledgerError == nil {
                EmptyStateView(icon: "list.bullet.clipboard", tint: KcTheme.accent,
                               title: "حصادك يبدأ مع أول تسوية",
                               subtitle: "توقّع مباريات الدور وعُد بعد صافرة النهاية")
                    .padding(.vertical, SabqLayout.space24)
            } else if !store.ledger.isEmpty {
                if let my = store.leaderboard?.myRank {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "sum").foregroundStyle(KcTheme.accent).accessibilityHidden(true)
                        Text("مجموع ما حصدته في البطولة")
                            .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textPrimary)
                        Spacer()
                        Text("\(RsFormat.latin(my.points)) نقطة")
                            .sabqText(SabqType.rowTitle).foregroundStyle(KcTheme.accent)
                            .monospacedDigit()
                    }
                    .padding(SabqLayout.space12)
                    .sabqBlockSurface()
                }

                sectionLabel("حصاد البطولة")
                harvestGrid

                sectionLabel("سجلّ التسويات")
                VStack(spacing: 0) {
                    ForEach(Array(store.ledger.enumerated()), id: \.element.id) { index, item in
                        if index > 0 { KcRowSeparator() }
                        ledgerRow(item)
                    }
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

        return HStack(spacing: SabqLayout.space12) {
            Image(systemName: item.reasonCode == "exact" ? "target" : "star.fill")
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(item.reasonCode == "exact" ? KcTheme.accent : SabqTheme.textSecondary)
                .frame(width: 32, height: 32)
                .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                if let contest, let final {
                    // سطر المباراة: [مضيف][نتيجته]-[نتيجة الضيف][ضيف] — RTL طبيعي.
                    HStack(spacing: SabqLayout.space4) {
                        Text(contest.metadata?.home?.name ?? "—")
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        splitScore(home: final.home, away: final.away, emphasized: false)
                        Text(contest.metadata?.away?.name ?? "—")
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                }
                HStack(spacing: SabqLayout.space4) {
                    Text(item.reasonLabelAr.isEmpty ? "تسوية توقع" : item.reasonLabelAr)
                        .sabqText(contest != nil ? SabqType.tag : SabqType.metaEmphasis)
                        .foregroundStyle(contest != nil ? SabqTheme.textSecondary : SabqTheme.textPrimary)
                        .lineLimit(2)
                    if let predicted {
                        Text("· توقعت")
                            .sabqText(SabqType.tag).foregroundStyle(SabqTheme.textSecondary)
                        splitScore(home: predicted.home, away: predicted.away, emphasized: false)
                    }
                }
                if let date = item.createdAtDate {
                    Text(RsFormat.day(iso: item.createdAt) + " · " + WCFormat.timeRiyadh.string(from: date))
                        .sabqText(SabqType.tag)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            }

            Spacer(minLength: SabqLayout.space8)

            // نقاط التسوية — رقم واحد فلا التباس؛ علامة + قبله بعزل سليم.
            HStack(spacing: 1) {
                Text("+")
                Text(RsFormat.latin(item.points))
                    .monospacedDigit()
            }
            .sabqText(SabqType.metaEmphasis)
            .foregroundStyle(SabqTheme.onAction)
            .padding(.horizontal, SabqLayout.space8).padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(KcTheme.accentFill))
        }
        .padding(.vertical, SabqLayout.space12)
    }

    // MARK: تبويب المتصدّرين

    @ViewBuilder
    private var leadersTab: some View {
        VStack(spacing: SabqLayout.space12) {
            if let error = store.error {
                errorBanner(error)
            }
            let entries = store.leaderboard?.entries ?? []
            if store.loading, entries.isEmpty {
                KcLoading().padding(.top, SabqLayout.space32)
            } else if entries.isEmpty {
                EmptyStateView(icon: "list.number", tint: KcTheme.accent,
                               title: "الصدارة تتشكّل مع أول تسوية",
                               subtitle: "كن أول من يسجّل النقاط في مسابقة التوقّعات")
                    .padding(.vertical, SabqLayout.space24)
            } else {
                // مركزي أولًا إن كنت خارج العشرين الظاهرين.
                if let my = store.leaderboard?.myRank, !entries.prefix(20).contains(where: { $0.rank == my.rank }) {
                    HStack(spacing: SabqLayout.space8) {
                        Text("مركزك: \(RsFormat.latin(my.rank))")
                            .sabqText(SabqType.metaEmphasis).foregroundStyle(SabqTheme.textPrimary)
                        Spacer()
                        Text("\(RsFormat.latin(my.points)) نقطة")
                            .sabqText(SabqType.metaEmphasis).foregroundStyle(KcTheme.accent)
                            .monospacedDigit()
                    }
                    .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space12)
                    .sabqBlockSurface()
                }
                VStack(spacing: 0) {
                    ForEach(Array(entries.prefix(20).enumerated()), id: \.element.id) { index, entry in
                        if index > 0 { KcRowSeparator() }
                        leaderRow(entry)
                    }
                }
            }
        }
    }

    private func leaderRow(_ entry: PredLeaderEntry) -> some View {
        HStack(spacing: SabqLayout.space12) {
            Text(RsFormat.latin(entry.rank))
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(entry.rank <= 3 ? KcTheme.accent : SabqTheme.textSecondary)
                .monospacedDigit()
                .frame(width: 28, height: 28)
                .background(Circle().fill(SabqTheme.surfaceMuted))
            KcAvatar(url: entry.profileImageUrl ?? "", size: 32)
            Text(entry.name)
                .sabqText(SabqType.rowTitle).foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            Text("\(RsFormat.latin(entry.points)) نقطة")
                .sabqText(SabqType.metaEmphasis).foregroundStyle(KcTheme.accent)
                .monospacedDigit()
        }
        .padding(.vertical, SabqLayout.space12)
    }

    // MARK: تبويب طريقة التوقعات

    @ViewBuilder
    private var howTab: some View {
        VStack(spacing: SabqLayout.space16) {
            // ملف الاحتساب الفعّال من الخادم — لا نص ثابت يتقادم.
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "star.circle.fill")
                        .foregroundStyle(KcTheme.gold)
                        .accessibilityHidden(true)
                    Text("نظام النقاط")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                }
                Text(store.rule?.summaryAr ?? "تُحتسب النقاط بعد صافرة نهاية كل مباراة وتُضاف لرصيدك تلقائيًا")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textPrimary)
                // قاعدة الأدوار الإقصائية كما في بطاقة القواعد في الويب (#1439)
                Text("· في مباريات الكؤوس وخروج المغلوب: يُعتمد التوقّع على نتيجة الوقتين الأصلي والإضافي (قبل ركلات الترجيح).")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(SabqLayout.space16)
            .sabqBlockSurface()

            VStack(alignment: .leading, spacing: SabqLayout.space16) {
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
            .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "person.crop.circle.badge.checkmark")
                    .foregroundStyle(KcTheme.accent)
                    .accessibilityHidden(true)
                Text("المشاركة تتطلب تسجيل الدخول بحسابك في سبق — التصفح متاح للجميع")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(SabqLayout.space12)
            .sabqBlockSurface()
        }
    }

    private func howStep(number: Int, icon: String, title: String, text: String) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            Image(systemName: icon)
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(KcTheme.accent)
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text("\(RsFormat.latin(number)). \(title)")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text(text)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
            }
        }
    }

    // MARK: عناصر مشتركة

    private func sectionLabel(_ title: String) -> some View {
        kcSubheading(title)
            .padding(.top, SabqLayout.space8)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: "info.circle").foregroundStyle(SabqTheme.warning).accessibilityHidden(true)
            Text(message)
                .sabqText(SabqType.meta).foregroundStyle(SabqTheme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("إعادة") { Task { await store.load(force: true) } }
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(KcTheme.accent)
                .frame(minWidth: SabqLayout.touchTarget, minHeight: SabqLayout.touchTarget)
        }
        .padding(.horizontal, SabqLayout.space12).padding(.vertical, SabqLayout.space4)
        .sabqBlockSurface()
    }
}
