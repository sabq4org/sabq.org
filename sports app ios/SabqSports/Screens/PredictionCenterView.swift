import SwiftUI

// مركز التوقّعات — الواجهة الموحّدة للمنصة المركزية (كل البطولات ما عدا
// مونديال 2026). المرجع البصري المعتمد 2026-07-17: بطاقة بطولة تفصل نقاط
// الترتيب عن كل ما سواها، تبويبات (المباريات/سجلّي/المتصدرون)، وحالة واحدة
// واضحة لكل مباراة. الهوية هوية التطبيق نفسه (SpTheme) — لا ألوان مستقلة.

struct PredictionCenterView: View {
    @State private var competitions: [PredCompetitionSummary] = []
    @State private var selectedSlug: String?
    @State private var contests: [PredContest] = []
    @State private var leaderboard: PredLeaderboardResponse?
    @State private var ledgerItems: [PredLedgerItem] = []
    @State private var tab: CenterTab = .matches
    @State private var loading = true
    @State private var loadFailed = false

    private enum CenterTab: CaseIterable {
        case matches, ledger, leaderboard
        var titleAr: String {
            switch self {
            case .matches: return "المباريات"
            case .ledger: return "سجلّي"
            case .leaderboard: return "المتصدرون"
            }
        }
    }

    private var selected: PredCompetitionSummary? {
        competitions.first { $0.slug == selectedSlug } ?? competitions.first
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if loading {
                    SpLoading()
                } else if loadFailed {
                    SpEmptyState(icon: "wifi.exclamationmark",
                                 title: L("تعذّر تحميل التوقّعات"),
                                 subtitle: L("تحقق من اتصالك ثم حاول مجددًا"),
                                 retry: { Task { await reloadSelected() } })
                } else if competitions.isEmpty {
                    SpEmptyState(icon: "sportscourt",
                                 title: L("لا بطولات متاحة حاليًا"),
                                 subtitle: L("ستظهر بطولات التوقّعات هنا فور انطلاقها"))
                } else {
                    if competitions.count > 1 { competitionChips }
                    if let comp = selected { PredHeroCard(competition: comp, myRank: leaderboard?.myRank) }
                    tabsBar
                    tabContent
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 28)
        }
        .background(SpTheme.screenGradient.ignoresSafeArea())
        .navigationTitle(L("التوقّعات"))
        .navigationBarTitleDisplayMode(.large)
        .task { await initialLoad() }
        .refreshable { await reloadSelected() }
    }

    // MARK: - اختيار البطولة

    private var competitionChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(competitions) { comp in
                    Button {
                        selectedSlug = comp.slug
                        Task { await reloadSelected() }
                    } label: {
                        Text(comp.nameAr)
                            .font(SportsFonts.app(size: 12.5, weight: .bold))
                            .foregroundStyle(comp.slug == selected?.slug ? Color.white : SpTheme.onDarkDim)
                            .padding(.horizontal, 14).padding(.vertical, 7)
                            .background(
                                Capsule().fill(comp.slug == selected?.slug ? SpTheme.green : SpTheme.chipFill)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - التبويبات

    private var tabsBar: some View {
        HStack(spacing: 6) {
            ForEach(CenterTab.allCases, id: \.self) { item in
                Button {
                    tab = item
                    Task { await loadTabIfNeeded(item) }
                } label: {
                    Text(L(item.titleAr))
                        .font(SportsFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(tab == item ? Color.white : SpTheme.onDarkDim)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(
                            RoundedRectangle(cornerRadius: SpTheme.chipRadius, style: .continuous)
                                .fill(tab == item ? SpTheme.green : SpTheme.chipFill)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private var tabContent: some View {
        switch tab {
        case .matches: matchesList
        case .ledger: PredLedgerListView(items: ledgerItems)
        case .leaderboard: PredLeaderboardListView(board: leaderboard)
        }
    }

    // MARK: - المباريات

    private var openContests: [PredContest] {
        contests.filter { $0.status == "open" && $0.isMatchScore }
    }
    private var lockedContests: [PredContest] {
        contests.filter { ($0.status == "locked" || $0.status == "ready") && $0.isMatchScore }
    }
    private var finishedContests: [PredContest] {
        Array(contests.filter { ($0.status == "settled" || $0.status == "void") && $0.isMatchScore }
            .sorted { ($0.settledAt ?? "") > ($1.settledAt ?? "") }
            .prefix(10))
    }

    @ViewBuilder
    private var matchesList: some View {
        if openContests.isEmpty && lockedContests.isEmpty && finishedContests.isEmpty {
            SpEmptyState(icon: "calendar.badge.clock",
                         title: L("لا مباريات متاحة للتوقّع الآن"),
                         subtitle: L("تُفتح التوقّعات فور إعلان جدول المباريات"))
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(openContests) { contest in matchLink(contest) }
                ForEach(lockedContests) { contest in matchLink(contest) }
                if !finishedContests.isEmpty {
                    Text(L("انتهت"))
                        .font(SportsFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(SpTheme.onDarkFaint)
                        .padding(.top, 6)
                    ForEach(finishedContests) { contest in matchLink(contest) }
                }
            }
        }
    }

    private func matchLink(_ contest: PredContest) -> some View {
        NavigationLink {
            PredictionContestDetailView(contestId: contest.id)
        } label: {
            PredMatchRowView(contest: contest)
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: - التحميل

    private func initialLoad() async {
        guard competitions.isEmpty else { return }
        loading = true
        loadFailed = false
        do {
            let response = try await APIClient.shared.fetchPredCompetitions()
            competitions = response.competitions
            selectedSlug = competitions.first?.slug
            await reloadSelected()
        } catch {
            loadFailed = true
        }
        loading = false
    }

    private func reloadSelected() async {
        guard let slug = selected?.slug else { return }
        async let detail = APIClient.shared.fetchPredCompetition(slug: slug)
        async let board = APIClient.shared.fetchPredLeaderboard(competitionSlug: slug)
        contests = (try? await detail)?.contests ?? []
        leaderboard = try? await board
        if tab == .ledger { await loadTabIfNeeded(.ledger) }
    }

    private func loadTabIfNeeded(_ item: CenterTab) async {
        guard let slug = selected?.slug else { return }
        switch item {
        case .ledger:
            let response = try? await APIClient.shared.fetchPredLedger(competitionSlug: slug, cursor: nil)
            ledgerItems = response?.items ?? []
        case .leaderboard:
            leaderboard = try? await APIClient.shared.fetchPredLeaderboard(competitionSlug: slug)
        case .matches:
            break
        }
    }
}

// MARK: - بطاقة البطولة (نقاط الترتيب بلون التميّز — منفصلة عن المحفظة)

private struct PredHeroCard: View {
    let competition: PredCompetitionSummary
    let myRank: PredMyRank?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 19, weight: .bold))
                    .foregroundStyle(SpTheme.gold)
                    .frame(width: 40, height: 40)
                    .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(.white.opacity(0.12)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(competition.nameAr)
                        .font(SportsFonts.app(size: 17, weight: .heavy))
                        .foregroundStyle(.white)
                    Text(competition.seasonKey)
                        .font(SportsFonts.app(size: 11.5))
                        .foregroundStyle(.white.opacity(0.72))
                }
            }
            HStack(spacing: 8) {
                stat(value: "\(competition.myPoints ?? 0)", label: L("نقاطي في البطولة"), gold: true)
                stat(value: myRank.map { "#\($0.rank)" } ?? "—", label: L("ترتيبي"), gold: false)
                stat(value: "\(competition.openContests)", label: L("توقّعات مفتوحة"), gold: false)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.heroGradient)
        )
    }

    private func stat(value: String, label: String, gold: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(SportsFonts.app(size: 17, weight: .heavy))
                .foregroundStyle(gold ? SpTheme.gold : .white)
                .monospacedDigit()
            Text(label)
                .font(SportsFonts.app(size: 10.5))
                .foregroundStyle(.white.opacity(0.75))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 11).padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(.white.opacity(0.10)))
    }
}

// MARK: - صف المباراة

struct PredMatchRowView: View {
    let contest: PredContest

    var body: some View {
        VStack(spacing: 9) {
            HStack(spacing: 8) {
                teamSide(contest.metadata?.home, alignTrailing: false)
                centerBlock
                teamSide(contest.metadata?.away, alignTrailing: true)
            }
            // يمين (RTL): الجولة/العدّاد + عدد المتوقّعين رقمًا فقط — بلا أسماء أشخاص.
            HStack(alignment: .bottom, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(subtitleText)
                        .font(SportsFonts.app(size: 10.5))
                        .foregroundStyle(SpTheme.onDarkFaint)
                    Text(predictorsLabel)
                        .font(SportsFonts.app(size: 10.5, weight: .semibold))
                        .foregroundStyle(SpTheme.onDarkDim)
                        .monospacedDigit()
                }
                Spacer(minLength: 0)
                statusChip
            }
        }
        .padding(13)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(SpTheme.cardFill)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
        )
    }

    private var predictorsLabel: String {
        let count = contest.predictorsCount
        return count > 0 ? Lf("%d متوقّع", count) : L("كن أول المتوقّعين")
    }

    private func teamSide(_ team: PredTeamMeta?, alignTrailing: Bool) -> some View {
        HStack(spacing: 7) {
            if alignTrailing { Spacer(minLength: 0) }
            if !alignTrailing { teamLogo(team?.logo) }
            Text(team?.name ?? L("يُحدد لاحقًا"))
                .font(SportsFonts.app(size: 12.5, weight: .bold))
                .foregroundStyle(SpTheme.onDark)
                .lineLimit(1)
            if alignTrailing { teamLogo(team?.logo) }
            if !alignTrailing { Spacer(minLength: 0) }
        }
        .frame(maxWidth: .infinity)
    }

    private func teamLogo(_ url: String?) -> some View {
        AsyncImage(url: url.flatMap(URL.init(string:))) { image in
            image.resizable().scaledToFit()
        } placeholder: {
            Image(systemName: "shield.fill").foregroundStyle(SpTheme.onDarkFaint.opacity(0.4))
        }
        .frame(width: 26, height: 26)
    }

    @ViewBuilder
    private var centerBlock: some View {
        if contest.status == "settled", let result = contest.result,
           let home = result.finalHome, let away = result.finalAway {
            // عزل الأرقام كي تثبت «مضيف–ضيف» في سياق RTL
            Text("\u{2066}\(home)–\(away)\u{2069}")
                .font(SportsFonts.app(size: 17, weight: .heavy))
                .foregroundStyle(SpTheme.onDark)
                .monospacedDigit()
        } else if let date = contest.locksAtDate {
            Text(date, format: .dateTime.hour().minute())
                .font(SportsFonts.app(size: 13, weight: .bold))
                .foregroundStyle(SpTheme.onDarkDim)
                .monospacedDigit()
        } else {
            Text("—").foregroundStyle(SpTheme.onDarkFaint)
        }
    }

    private var subtitleText: String {
        var parts: [String] = []
        if let round = contest.metadata?.round, !round.isEmpty { parts.append(round) }
        if contest.status == "open", let date = contest.locksAtDate,
           let countdown = PredDates.countdown(to: date) {
            parts.append(countdown)
        }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder
    private var statusChip: some View {
        switch contest.status {
        case "open":
            if let payload = contest.myEntry?.payload, let h = payload.predHome, let a = payload.predAway {
                chip(text: Lf("توقّعتَ %d–%d", h, a), color: SpTheme.green)
            } else {
                chip(text: L("توقّع الآن"), color: SpTheme.green, filled: true)
            }
        case "locked", "ready":
            chip(text: L("مقفل — بانتظار النتيجة"), color: SpTheme.crimson)
        case "settled":
            chip(text: L("احتُسبت — التفاصيل"), color: SpTheme.gold)
        case "void":
            chip(text: L("أُلغيت"), color: SpTheme.onDarkFaint)
        default:
            EmptyView()
        }
    }

    private func chip(text: String, color: Color, filled: Bool = false) -> some View {
        Text(text)
            .font(SportsFonts.app(size: 10.5, weight: .bold))
            .foregroundStyle(filled ? Color.white : color)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(Capsule().fill(filled ? color : color.opacity(0.14)))
    }
}

// MARK: - سجل النقاط

private struct PredLedgerListView: View {
    let items: [PredLedgerItem]

    var body: some View {
        if items.isEmpty {
            SpEmptyState(icon: "list.number",
                         title: L("لا قيود نقاط بعد"),
                         subtitle: L("ستظهر نقاطك هنا فور تسوية أول مباراة توقّعتها"))
        } else {
            VStack(spacing: 8) {
                ForEach(items) { item in
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.reasonLabelAr)
                                .font(SportsFonts.app(size: 12.5, weight: .bold))
                                .foregroundStyle(SpTheme.onDark)
                            if let date = item.createdAtDate {
                                Text(date, format: .dateTime.day().month(.wide))
                                    .font(SportsFonts.app(size: 10.5))
                                    .foregroundStyle(SpTheme.onDarkFaint)
                            }
                        }
                        Spacer()
                        Text(item.points >= 0 ? "+\(item.points)" : "\(item.points)")
                            .font(SportsFonts.app(size: 14, weight: .heavy))
                            .foregroundStyle(item.points >= 0 ? SpTheme.green : SpTheme.crimson)
                            .monospacedDigit()
                    }
                    .padding(.horizontal, 13).padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                            .fill(SpTheme.cardFill)
                            .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
                    )
                }
            }
        }
    }
}

// MARK: - لوحة المتصدرين

private struct PredLeaderboardListView: View {
    let board: PredLeaderboardResponse?

    var body: some View {
        if let board, !board.entries.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(board.nameAr)
                        .font(SportsFonts.app(size: 13.5, weight: .heavy))
                        .foregroundStyle(SpTheme.onDark)
                    Text(L("توقّعات المباريات · النقاط الأساسية دون مضاعف العضوية"))
                        .font(SportsFonts.app(size: 10.5))
                        .foregroundStyle(SpTheme.onDarkFaint)
                }
                .padding(.horizontal, 2)

                if let mine = board.myRank {
                    HStack {
                        Text(L("ترتيبك الحالي"))
                            .font(SportsFonts.app(size: 12.5, weight: .bold))
                            .foregroundStyle(.white)
                        Spacer()
                        Text("#\(mine.rank) · \(mine.points)")
                            .font(SportsFonts.app(size: 14, weight: .heavy))
                            .foregroundStyle(.white)
                            .monospacedDigit()
                    }
                    .padding(.horizontal, 13).padding(.vertical, 11)
                    .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.heroGradient))
                }

                ForEach(board.entries) { entry in
                    HStack(spacing: 10) {
                        Text("\(entry.rank)")
                            .font(SportsFonts.app(size: 12.5, weight: .heavy))
                            .foregroundStyle(entry.rank <= 3 ? SpTheme.gold : SpTheme.onDarkFaint)
                            .frame(width: 22)
                            .monospacedDigit()
                        Text(String(entry.name.prefix(1)))
                            .font(SportsFonts.app(size: 12, weight: .heavy))
                            .foregroundStyle(SpTheme.green)
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(SpTheme.green.opacity(0.13)))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(entry.name)
                                .font(SportsFonts.app(size: 12.5, weight: .bold))
                                .foregroundStyle(SpTheme.onDark)
                                .lineLimit(1)
                            Text(Lf("%d نتيجة دقيقة", entry.exactCount))
                                .font(SportsFonts.app(size: 10))
                                .foregroundStyle(SpTheme.onDarkFaint)
                        }
                        Spacer()
                        Text("\(entry.points)")
                            .font(SportsFonts.app(size: 13.5, weight: .heavy))
                            .foregroundStyle(SpTheme.green)
                            .monospacedDigit()
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                            .fill(SpTheme.cardFill)
                            .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
                    )
                }
            }
        } else {
            SpEmptyState(icon: "chart.bar",
                         title: L("لا ترتيب بعد"),
                         subtitle: L("تُبنى اللوحة بعد تسوية أول مباريات البطولة"))
        }
    }
}
