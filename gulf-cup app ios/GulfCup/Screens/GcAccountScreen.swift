import SwiftUI
import UIKit

// شاشة «حسابي» الغنية — هوية العضو + إحصائيات التوقعات + الفانتازي والمجالس
// + سجل التوقعات + المنتخب المفضل + أدوات (ويدجت / بطاقة الإنجاز) + الإعدادات.
// كل البيانات من نقاط API قائمة (predictions/today·mine·leaderboard، fantasy/mine،
// majlis/mine، long) — لا يعتمد على أي عمل خادم جديد.

// MARK: - مخزن بيانات الحساب

@MainActor
@Observable
final class GcAccountStore {
    var me: GcPredictionMeStats?
    var jackpot: Int?
    var leaders: [GcPredictionLeader] = []
    var mine: [GcMyPredictionRow] = []
    var longMine: [GcLongMine] = []
    var fantasy: GcFantasySquad?
    var fantasyLeaders: [GcFantasyLeader] = []
    var majalis: [GcMajlisSummary] = []
    var loading = false
    var loaded = false

    func load(loggedIn: Bool, force: Bool = false) async {
        if loading || (loaded && !force) { return }
        loading = true
        defer { loading = false; loaded = true }

        // عام — متاح للزائر أيضًا (بركة اليوم + المتصدرون كإغراء للتسجيل)
        async let todayTask = APIClient.shared.fetchGcPredictionsToday(ignoreCache: force)
        async let boardTask = APIClient.shared.fetchGcPredictionsLeaderboard(ignoreCache: force)
        if let today = try? await todayTask {
            jackpot = today.jackpot
            me = today.me
        }
        leaders = (try? await boardTask) ?? leaders

        guard loggedIn else {
            mine = []; longMine = []; fantasy = nil; majalis = []
            return
        }

        async let mineTask = APIClient.shared.fetchGcMyPredictions(ignoreCache: true)
        async let longTask = APIClient.shared.fetchGcLongPredictions(ignoreCache: true)
        async let squadTask = APIClient.shared.fetchGcMyFantasy()
        async let fBoardTask = APIClient.shared.fetchGcFantasyLeaderboard(ignoreCache: force)
        async let majalisTask = APIClient.shared.fetchGcMyMajalis()

        mine = (try? await mineTask) ?? []
        longMine = ((try? await longTask)?.mine) ?? []
        fantasy = ((try? await squadTask) ?? nil)
        fantasyLeaders = (try? await fBoardTask) ?? []
        majalis = (try? await majalisTask) ?? []
    }

    // MARK: مشتقات — تفضّل أرقام الخادم وتسقط إلى الحساب المحلي من السجل

    private var resolved: [GcMyPredictionRow] {
        mine.filter {
            !$0.isVoid && (($0.matchStatus ?? "") == "finished" || $0.pointsAwarded != nil)
        }
    }

    var totalPoints: Int {
        me?.points ?? resolved.compactMap(\.pointsAwarded).reduce(0, +)
    }

    var playedCount: Int { me?.played ?? resolved.count }

    var correctCount: Int {
        me?.correct ?? resolved.filter { ($0.pointsAwarded ?? 0) > 0 }.count
    }

    var accuracy: Int? {
        let played = me?.played ?? resolved.count
        let correct = correctCount
        guard played > 0 else { return nil }
        return Int((Double(correct) / Double(played) * 100).rounded())
    }

    var streak: Int {
        if let s = me?.currentStreak { return s }
        var count = 0
        for row in resolved.sorted(by: { ($0.kickoffAt ?? "") > ($1.kickoffAt ?? "") }) {
            if (row.pointsAwarded ?? 0) > 0 { count += 1 } else { break }
        }
        return count
    }

    func rank(of userId: String?) -> Int? {
        guard let userId else { return nil }
        return leaders.first(where: { $0.userId == userId })?.rank
    }

    func fantasyRank(of userId: String?) -> Int? {
        guard let userId else { return nil }
        return fantasyLeaders.first(where: { $0.userId == userId })?.rank
    }
}

private struct GcAccountBadge: Identifiable {
    let id: String
    let title: String
    let detail: String
    let icon: String
    let tint: Color
    let count: Int
}

// MARK: - الشاشة

@MainActor
struct GcAccountScreen: View {
    let store: GcHubStore

    @Environment(GcAuthStore.self) private var auth
    @Environment(GcAppRouter.self) private var router
    @Bindable private var prefs = GcUserPreferences.shared
    @State private var account = GcAccountStore()
    @State private var showAbout = false
    @State private var showTeamPicker = false
    @State private var showWidgetGuide = false
    @State private var shareCard: Image?

    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—"
        return "\(v) (\(b))"
    }

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 18) {
                if auth.isLoggedIn {
                    memberIdentity.gcReveal()
                } else {
                    guestIdentity.gcReveal()
                }

                if auth.isLoggedIn {
                    if !earnedBadges.isEmpty { badgesSection.gcReveal(delay: 0.03) }
                    if account.streak >= 2 { streakBanner.gcReveal(delay: 0.04) }
                    activityCards.gcReveal(delay: 0.06)
                    predictionsLog.gcReveal(delay: 0.08)
                }

                favoriteTeamCard.gcReveal(delay: 0.10)
                settingsSection.gcReveal(delay: 0.12)
                toolsSection.gcReveal(delay: 0.14)
                linksSection.gcReveal(delay: 0.16)
                aboutSection.gcReveal(delay: 0.18)

                if auth.isLoggedIn {
                    Button(L("account.signout")) { auth.signOut() }
                        .font(GulfCupFonts.app(size: 14, weight: .bold))
                        .foregroundStyle(GcTheme.crimson)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .gcCard()
                }

                Text("\(L("more.version")) \(appVersion)")
                    .font(GulfCupFonts.app(size: 11))
                    .foregroundStyle(GcTheme.inkFaint)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 4)

                GcFooterSignature()
            }
        }
        .navigationTitle(L("tab.more"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(GcTheme.appBg, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .refreshable { await account.load(loggedIn: auth.isLoggedIn, force: true) }
        .task(id: auth.isLoggedIn) {
            await account.load(loggedIn: auth.isLoggedIn, force: true)
            renderShareCard()
        }
        .sheet(isPresented: $showTeamPicker) {
            GcFavoriteTeamPicker(teams: store.teams, selectedId: $prefs.favoriteTeamId)
        }
        .sheet(isPresented: $showWidgetGuide) { GcWidgetGuideSheet() }
    }

    private var guestIdentity: some View {
        VStack(alignment: .leading, spacing: 12) {
            GcMembershipLogin()
        }
        .padding(16)
        .gcCard()
        .padding(.top, 4)
    }

    private var memberIdentity: some View {
        VStack(spacing: 14) {
            HStack(spacing: 14) {
                profileAvatar
                VStack(alignment: .leading, spacing: 4) {
                    Text(auth.member?.name ?? L("account.member.fallback"))
                        .font(GulfCupFonts.headline(size: 18))
                        .foregroundStyle(GcTheme.ink)
                        .lineLimit(1)
                    HStack(spacing: 5) {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(GcTheme.sky)
                        Text(L("account.verified.member"))
                            .font(GulfCupFonts.app(size: 11.5))
                            .foregroundStyle(GcTheme.inkDim)
                    }
                    if let email = auth.member?.email, !email.isEmpty, !email.contains("@phone.sabq.org") {
                        Text(email)
                            .font(GulfCupFonts.app(size: 11))
                            .foregroundStyle(GcTheme.inkFaint)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                if account.streak >= 2 {
                    HStack(spacing: 4) {
                        Image(systemName: "flame.fill").font(.system(size: 10, weight: .bold))
                        Text("\(account.streak)").font(GulfCupFonts.app(size: 12, weight: .bold)).monospacedDigit()
                    }
                    .foregroundStyle(GcTheme.skyDeep)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Capsule().fill(GcTheme.sky.opacity(0.14)))
                }
            }

            HStack(spacing: 8) {
                lightStat(value: "\(account.totalPoints)", label: L("account.stat.points"))
                lightStat(value: account.rank(of: auth.member?.id).map { "#\($0)" } ?? "—",
                          label: L("account.stat.rank"))
                lightStat(value: account.accuracy.map { "\($0)%" } ?? "—",
                          label: L("account.stat.accuracy"))
            }
        }
        .padding(16)
        .gcCard()
        .padding(.top, 6)
        .task {
            await auth.refreshProfile()
        }
    }

    // MARK: الأوسمة الدائمة

    private var earnedBadges: [GcAccountBadge] {
        var grouped: [String: Int] = [:]
        for rawCode in account.me?.badges ?? [] {
            let code: String
            if rawCode.hasPrefix("majlis_champion:") {
                code = "majlis_champion"
            } else if rawCode.hasPrefix("majlis_dean:") {
                code = "majlis_dean"
            } else {
                code = rawCode
            }
            grouped[code, default: 0] += 1
        }

        let preferredOrder = [
            "majlis_champion", "majlis_dean", "nostradamus",
            "lionheart", "hot_streak", "ever_present",
        ]
        let orderedCodes = preferredOrder.filter { grouped[$0] != nil }
            + grouped.keys.filter { !preferredOrder.contains($0) }.sorted()
        return orderedCodes.map { badge(for: $0, count: grouped[$0] ?? 1) }
    }

    private func badge(for code: String, count: Int) -> GcAccountBadge {
        switch code {
        case "majlis_champion":
            return GcAccountBadge(
                id: code,
                title: L("account.badge.majlisChampion"),
                detail: L("account.badge.majlisChampion.desc"),
                icon: "trophy.fill",
                tint: GcTheme.sky,
                count: count
            )
        case "majlis_dean":
            return GcAccountBadge(
                id: code,
                title: L("account.badge.majlisDean"),
                detail: L("account.badge.majlisDean.desc"),
                icon: "person.3.fill",
                tint: GcTheme.emerald,
                count: count
            )
        case "nostradamus":
            return GcAccountBadge(id: code, title: L("account.badge.nostradamus"), detail: L("account.badge.nostradamus.desc"), icon: "scope", tint: GcTheme.teal, count: count)
        case "lionheart":
            return GcAccountBadge(id: code, title: L("account.badge.lionheart"), detail: L("account.badge.lionheart.desc"), icon: "heart.fill", tint: GcTheme.crimson, count: count)
        case "hot_streak":
            return GcAccountBadge(id: code, title: L("account.badge.hotStreak"), detail: L("account.badge.hotStreak.desc"), icon: "flame.fill", tint: GcTheme.sky, count: count)
        case "ever_present":
            return GcAccountBadge(id: code, title: L("account.badge.everPresent"), detail: L("account.badge.everPresent.desc"), icon: "medal.fill", tint: GcTheme.emeraldSoft, count: count)
        default:
            return GcAccountBadge(id: code, title: L("account.badge.earned"), detail: code, icon: "checkmark.seal.fill", tint: GcTheme.inkDim, count: count)
        }
    }

    private var badgesSection: some View {
        VStack(spacing: 10) {
            GcSectionHeader(
                icon: "seal.fill",
                title: L("account.badges.title"),
                subtitle: L("account.badges.subtitle"),
                count: earnedBadges.count,
                tint: GcTheme.sky
            )
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible())], spacing: 8) {
                ForEach(earnedBadges) { badge in
                    badgeTile(badge)
                }
            }
        }
    }

    private func badgeTile(_ badge: GcAccountBadge) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: badge.icon)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(badge.tint)
                .frame(width: 38, height: 38)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(badge.tint.opacity(0.13))
                )
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(badge.title)
                        .font(GulfCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(GcTheme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                    if badge.count > 1 {
                        Text("×\(badge.count)")
                            .font(GulfCupFonts.app(size: 9.5, weight: .bold))
                            .foregroundStyle(badge.tint)
                            .monospacedDigit()
                    }
                }
                Text(badge.detail)
                    .font(GulfCupFonts.app(size: 9.5))
                    .foregroundStyle(GcTheme.inkDim)
                    .lineLimit(2)
                Label(L("account.badges.unlocked"), systemImage: "checkmark.circle.fill")
                    .font(GulfCupFonts.app(size: 9, weight: .semibold))
                    .foregroundStyle(badge.tint)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 94, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous)
                .fill(GcTheme.cardBg)
        )
        .overlay(
            RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous)
                .stroke(badge.tint.opacity(0.22), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }

    private var profileAvatar: some View {
        Group {
            if let url = auth.member?.avatar, !url.isEmpty {
                GcRemoteImage(url: url, contentMode: .fill)
            } else {
                let title = auth.member?.name ?? L("account.member.fallback")
                let initial = title.trimmingCharacters(in: .whitespaces).first.map(String.init) ?? "س"
                Text(initial)
                    .font(GulfCupFonts.headline(size: 22))
                    .foregroundStyle(GcTheme.skyDeep)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(GcTheme.sky.opacity(0.18))
            }
        }
        .frame(width: 60, height: 60)
        .clipShape(Circle())
        .overlay(Circle().stroke(GcTheme.sky.opacity(0.35), lineWidth: 1.5))
    }

    private func lightStat(value: String, label: String) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(GulfCupFonts.headline(size: 18))
                .foregroundStyle(GcTheme.ink)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(GulfCupFonts.app(size: 10.5))
                .foregroundStyle(GcTheme.inkDim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(GcTheme.sky.opacity(0.08)))
    }

    // MARK: شريط السلسلة

    private var streakBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "flame.fill")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(GcTheme.sky)
            Text(L("account.streak.text", ["n": "\(account.streak)"]))
                .font(GulfCupFonts.app(size: 12.5, weight: .semibold))
                .foregroundStyle(GcTheme.ink)
            Spacer(minLength: 0)
            ShareLink(item: L("account.streak.share", ["n": "\(account.streak)"])) {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(GcTheme.sky)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .background(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .fill(GcTheme.sky.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(GcTheme.sky.opacity(0.22), lineWidth: 1)
        )
    }

    // MARK: بطاقتا الفانتازي والمجالس

    private var activityCards: some View {
        HStack(spacing: 8) {
            Button {
                router.openPredictions(.fantasy)
            } label: {
                miniCard(
                    icon: "person.3.sequence.fill",
                    title: L("account.fantasy.title"),
                    value: account.fantasy.map { "\($0.totalPoints) \(L("account.pts"))" } ?? L("account.fantasy.empty"),
                    subtitle: fantasySubtitle
                )
            }
            .buttonStyle(GcPressStyle())

            Button {
                router.openPredictions(.majlis)
            } label: {
                miniCard(
                    icon: "bubble.left.and.bubble.right.fill",
                    title: L("account.majlis.title"),
                    value: account.majalis.isEmpty
                        ? L("account.majlis.empty")
                        : L("account.majlis.count", ["n": "\(account.majalis.count)"]),
                    subtitle: majlisSubtitle
                )
            }
            .buttonStyle(GcPressStyle())
        }
    }

    private var fantasySubtitle: String {
        if account.fantasy == nil { return L("account.fantasy.cta") }
        if let rank = account.fantasyRank(of: auth.member?.id) {
            return L("account.fantasy.rank", ["n": "\(rank)"])
        }
        return L("account.fantasy.manage")
    }

    private var majlisSubtitle: String {
        if let first = account.majalis.first {
            return first.isOwner ? L("account.majlis.owner", ["name": first.name]) : first.name
        }
        return L("account.majlis.cta")
    }

    private func miniCard(icon: String, title: String, value: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(GcTheme.sky)
                Text(title)
                    .font(GulfCupFonts.app(size: 11))
                    .foregroundStyle(GcTheme.inkDim)
                Spacer(minLength: 0)
            }
            Text(value)
                .font(GulfCupFonts.headline(size: 15))
                .foregroundStyle(GcTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(subtitle)
                .font(GulfCupFonts.app(size: 10.5))
                .foregroundStyle(GcTheme.inkDim)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .gcCard()
        .contentShape(Rectangle())
    }

    // MARK: سجل التوقعات

    private var predictionsLog: some View {
        VStack(spacing: 10) {
            GcSectionHeader(icon: "clock.arrow.circlepath", title: L("account.log.title"), tint: GcTheme.sky)

            VStack(spacing: 0) {
                if account.mine.isEmpty && account.longMine.isEmpty {
                    Button {
                        router.openPredictions(.mine)
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(GcTheme.sky)
                            Text(L("account.log.empty"))
                                .font(GulfCupFonts.app(size: 12.5))
                                .foregroundStyle(GcTheme.inkDim)
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.left")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(GcTheme.inkFaint)
                        }
                        .padding(14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(GcPressStyle())
                } else {
                    ForEach(Array(recentRows.enumerated()), id: \.element.id) { index, row in
                        if index > 0 { Divider().padding(.leading, 14) }
                        predictionRow(row)
                    }
                    ForEach(account.longMine, id: \.kind) { long in
                        Divider().padding(.leading, 14)
                        longRow(long)
                    }
                    Divider().padding(.leading, 14)
                    Button {
                        router.openPredictions(.mine)
                    } label: {
                        Text(L("account.log.all"))
                            .font(GulfCupFonts.app(size: 12.5, weight: .bold))
                            .foregroundStyle(GcTheme.sky)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(GcPressStyle())
                }
            }
            .gcCard()
        }
    }

    private var recentRows: [GcMyPredictionRow] {
        Array(account.mine
            .sorted { ($0.kickoffAt ?? "") > ($1.kickoffAt ?? "") }
            .prefix(3))
    }

    private func predictionRow(_ row: GcMyPredictionRow) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(row.homeTeamName ?? "؟") × \(row.awayTeamName ?? "؟")")
                        .font(GulfCupFonts.app(size: 12.5, weight: .semibold))
                        .foregroundStyle(GcTheme.ink)
                        .lineLimit(1)
                    Text(L("account.log.myPick", ["score": "\(row.predHome) - \(row.predAway)"]))
                        .font(GulfCupFonts.app(size: 10.5))
                        .foregroundStyle(GcTheme.inkDim)
                }
                Spacer(minLength: 0)
                if !row.isVoid {
                    predictionChip(row)
                }
            }
            if row.isVoid {
                GcVoidMatchNotice(compact: true)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private func predictionChip(_ row: GcMyPredictionRow) -> some View {
        if let points = row.pointsAwarded {
            if points > 0 {
                chip(text: "+\(points)", icon: "checkmark", color: GcTheme.emerald)
            } else {
                chip(text: L("account.log.miss"), icon: "xmark", color: GcTheme.crimson)
            }
        } else {
            chip(text: L("account.log.pending"), icon: "hourglass", color: GcTheme.inkFaint)
        }
    }

    private func longRow(_ long: GcLongMine) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(long.kind == "champion" ? L("account.log.champion") : L("account.log.topScorer"))
                    .font(GulfCupFonts.app(size: 10.5))
                    .foregroundStyle(GcTheme.inkDim)
                Text(long.teamName ?? long.playerName ?? "—")
                    .font(GulfCupFonts.app(size: 12.5, weight: .semibold))
                    .foregroundStyle(GcTheme.ink)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            if long.status == "pending" {
                chip(text: L("account.log.pending"), icon: "hourglass", color: GcTheme.inkFaint)
            } else if long.pointsAwarded > 0 {
                chip(text: "+\(long.pointsAwarded)", icon: "checkmark", color: GcTheme.emerald)
            } else {
                chip(text: L("account.log.miss"), icon: "xmark", color: GcTheme.crimson)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func chip(text: String, icon: String, color: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 9, weight: .bold))
            Text(text).font(GulfCupFonts.app(size: 11, weight: .bold)).monospacedDigit()
        }
        .foregroundStyle(color)
        .padding(.horizontal, 9).padding(.vertical, 4)
        .background(Capsule().fill(color.opacity(0.12)))
    }

    // MARK: المنتخب المفضل

    private var favoriteTeam: GcTeam? {
        guard let id = prefs.favoriteTeamId else { return nil }
        return store.teams.first(where: { $0.id == id })
    }

    private var favoriteTeamCard: some View {
        Button { showTeamPicker = true } label: {
            HStack(spacing: 12) {
                if let team = favoriteTeam, let url = URL(string: team.logo) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        Image(systemName: "heart.fill").foregroundStyle(GcTheme.sky)
                    }
                    .frame(width: 34, height: 34)
                    .padding(4)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(GcTheme.chipFill))
                } else {
                    Image(systemName: "heart")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(GcTheme.sky)
                        .frame(width: 42, height: 42)
                        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(GcTheme.sky.opacity(0.12)))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(favoriteTeam.map { L("account.fav.set", ["team": $0.name]) } ?? L("account.fav.title"))
                        .font(GulfCupFonts.app(size: 13.5, weight: .semibold))
                        .foregroundStyle(GcTheme.ink)
                    Text(L("account.fav.subtitle"))
                        .font(GulfCupFonts.app(size: 11))
                        .foregroundStyle(GcTheme.inkDim)
                }
                Spacer(minLength: 0)
                Text(favoriteTeam == nil ? L("account.fav.choose") : L("account.fav.change"))
                    .font(GulfCupFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(GcTheme.sky)
            }
            .padding(14)
            .gcCard()
            .contentShape(Rectangle())
        }
        .buttonStyle(GcPressStyle())
    }

    // MARK: الإعدادات

    private var settingsSection: some View {
        VStack(spacing: 10) {
            GcSectionHeader(icon: "slider.horizontal.3", title: L("more.section.settings"), tint: GcTheme.sky)
            VStack(spacing: 0) {
                toggleRow(icon: "dot.radiowaves.left.and.right",
                          title: L("more.settings.liveAlerts"),
                          subtitle: L("more.settings.liveAlerts.sub"),
                          isOn: $prefs.liveMatchAlerts)
                Divider().padding(.leading, 54)
                toggleRow(icon: "bell.badge",
                          title: L("more.settings.reminders"),
                          subtitle: L("more.settings.reminders.sub"),
                          isOn: Binding(
                            get: { prefs.predictionReminders },
                            set: { enabled in
                                prefs.predictionReminders = enabled
                                if enabled { Task { _ = await GcPushManager.shared.requestAuthorization() } }
                            }
                          ))
                Divider().padding(.leading, 54)
                toggleRow(icon: "hand.tap",
                          title: L("more.settings.haptics"),
                          subtitle: L("more.settings.haptics.sub"),
                          isOn: $prefs.hapticsEnabled)
            }
            .gcCard()
        }
    }

    private func toggleRow(icon: String, title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(GcTheme.sky)
                    .frame(width: 32, height: 32)
                    .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(GcTheme.sky.opacity(0.12)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(GulfCupFonts.app(size: 13.5, weight: .semibold)).foregroundStyle(GcTheme.ink)
                    Text(subtitle).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.inkDim)
                }
            }
        }
        .tint(GcTheme.sky)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    // MARK: أدوات

    private var toolsSection: some View {
        VStack(spacing: 10) {
            GcSectionHeader(icon: "wand.and.stars", title: L("account.tools.title"), tint: GcTheme.sky)
            VStack(spacing: 0) {
                Button { showWidgetGuide = true } label: {
                    toolRow(icon: "square.grid.2x2",
                            title: L("account.tools.widget"),
                            subtitle: L("account.tools.widget.sub"))
                }
                .buttonStyle(GcPressStyle())

                if auth.isLoggedIn {
                    Divider().padding(.leading, 54)
                    if let card = shareCard {
                        ShareLink(
                            item: card,
                            preview: SharePreview(L("account.tools.card"), image: card)
                        ) {
                            toolRow(icon: "person.crop.rectangle",
                                    title: L("account.tools.card"),
                                    subtitle: L("account.tools.card.sub"))
                        }
                        .buttonStyle(GcPressStyle())
                    } else {
                        Button { renderShareCard() } label: {
                            toolRow(icon: "person.crop.rectangle",
                                    title: L("account.tools.card"),
                                    subtitle: L("account.tools.card.sub"))
                        }
                        .buttonStyle(GcPressStyle())
                    }
                }
            }
            .gcCard()
        }
    }

    private func toolRow(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(GcTheme.sky)
                .frame(width: 32, height: 32)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(GcTheme.sky.opacity(0.12)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(GulfCupFonts.app(size: 13.5, weight: .semibold)).foregroundStyle(GcTheme.ink)
                Text(subtitle).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.inkDim)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.left")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(GcTheme.inkFaint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    // MARK: بطاقة الإنجاز

    private func renderShareCard() {
        guard auth.isLoggedIn else { shareCard = nil; return }
        let view = GcShareCardView(
            name: auth.member?.name ?? L("account.member.fallback"),
            points: account.totalPoints,
            rank: account.rank(of: auth.member?.id),
            accuracy: account.accuracy,
            streak: account.streak
        )
        .environment(\.layoutDirection, .rightToLeft)

        let renderer = ImageRenderer(content: view)
        renderer.scale = 3
        if let ui = renderer.uiImage {
            shareCard = Image(uiImage: ui)
        }
    }

    // MARK: روابط

    private var linksSection: some View {
        VStack(spacing: 10) {
            GcSectionHeader(icon: "link", title: L("more.section.links"), tint: GcTheme.sky)
            VStack(spacing: 0) {
                Button {
                    if let url = URL(string: "\(URLConstants.webOrigin)/gulf-cup") {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    linkLabel(icon: "globe", title: L("more.link.web"))
                }
                .buttonStyle(GcPressStyle())

                Divider().padding(.leading, 54)

                if let shareURL = URL(string: "\(URLConstants.webOrigin)/gulf-cup") {
                    ShareLink(item: shareURL,
                              subject: Text(L("app.title")),
                              message: Text(L("more.link.share.message"))) {
                        linkLabel(icon: "square.and.arrow.up", title: L("more.link.share"))
                    }
                    .buttonStyle(GcPressStyle())
                }
            }
            .gcCard()
        }
    }

    private func linkLabel(icon: String, title: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(GcTheme.sky)
                .frame(width: 32, height: 32)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(GcTheme.sky.opacity(0.12)))
            Text(title)
                .font(GulfCupFonts.app(size: 13.5, weight: .semibold))
                .foregroundStyle(GcTheme.ink)
            Spacer(minLength: 0)
            Image(systemName: "chevron.left")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(GcTheme.inkFaint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
    }

    // MARK: عن البطولة

    private var aboutSection: some View {
        VStack(spacing: 10) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) { showAbout.toggle() }
            } label: {
                HStack(spacing: 11) {
                    Image(systemName: "info.circle.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(GcTheme.sky)
                        .frame(width: 34, height: 34)
                        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(GcTheme.sky.opacity(0.12)))
                    Text(L("more.about.title"))
                        .font(GulfCupFonts.headline(size: 17))
                        .foregroundStyle(GcTheme.ink)
                    Spacer(minLength: 0)
                    Image(systemName: showAbout ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(GcTheme.inkFaint)
                }
            }
            .buttonStyle(.plain)

            if showAbout {
                Text(L("more.about.body"))
                    .font(GulfCupFonts.app(size: 12.5))
                    .foregroundStyle(GcTheme.inkDim)
                    .lineSpacing(4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .gcCard()
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }
}

// MARK: - منتقي المنتخب المفضل

private struct GcFavoriteTeamPicker: View {
    let teams: [GcTeam]
    @Binding var selectedId: Int?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Button {
                    selectedId = nil
                    dismiss()
                } label: {
                    HStack {
                        Image(systemName: "heart.slash")
                            .foregroundStyle(GcTheme.inkFaint)
                            .frame(width: 30)
                        Text(L("account.fav.none"))
                            .font(GulfCupFonts.app(size: 14))
                            .foregroundStyle(GcTheme.ink)
                        Spacer()
                        if selectedId == nil {
                            Image(systemName: "checkmark").foregroundStyle(GcTheme.sky)
                        }
                    }
                }

                ForEach(teams) { team in
                    Button {
                        selectedId = team.id
                        dismiss()
                    } label: {
                        HStack(spacing: 10) {
                            AsyncImage(url: URL(string: team.logo)) { image in
                                image.resizable().scaledToFit()
                            } placeholder: {
                                Circle().fill(GcTheme.chipFill)
                            }
                            .frame(width: 30, height: 30)
                            Text(team.name)
                                .font(GulfCupFonts.app(size: 14, weight: .semibold))
                                .foregroundStyle(GcTheme.ink)
                            Spacer()
                            if selectedId == team.id {
                                Image(systemName: "checkmark").foregroundStyle(GcTheme.sky)
                            }
                        }
                    }
                }
            }
            .navigationTitle(L("account.fav.title"))
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
        .environment(\.layoutDirection, .rightToLeft)
    }
}

// MARK: - دليل الويدجت

private struct GcWidgetGuideSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                Image(systemName: "square.grid.2x2.fill")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(GcTheme.sky)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 10)

                Text(L("account.widget.title"))
                    .font(GulfCupFonts.headline(size: 20))
                    .foregroundStyle(GcTheme.ink)
                    .frame(maxWidth: .infinity, alignment: .center)

                VStack(alignment: .leading, spacing: 14) {
                    widgetStep(1, L("account.widget.step1"))
                    widgetStep(2, L("account.widget.step2"))
                    widgetStep(3, L("account.widget.step3"))
                }
                .padding(16)
                .gcCard()

                HStack(spacing: 8) {
                    Image(systemName: "bolt.badge.clock")
                        .foregroundStyle(GcTheme.sky)
                    Text(L("account.widget.live"))
                        .font(GulfCupFonts.app(size: 12))
                        .foregroundStyle(GcTheme.inkDim)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(14)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(GcTheme.sky.opacity(0.08)))

                Spacer()
            }
            .padding(18)
            .background(GcTheme.appBg)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(L("account.widget.done")) { dismiss() }
                        .font(GulfCupFonts.app(size: 14, weight: .bold))
                }
            }
        }
        .presentationDetents([.medium])
        .environment(\.layoutDirection, .rightToLeft)
    }

    private func widgetStep(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(n)")
                .font(GulfCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(GcTheme.sky)
                .frame(width: 26, height: 26)
                .background(Circle().fill(GcTheme.sky.opacity(0.14)))
            Text(text)
                .font(GulfCupFonts.app(size: 13))
                .foregroundStyle(GcTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - بطاقة الإنجاز القابلة للمشاركة

private struct GcShareCardView: View {
    let name: String
    let points: Int
    let rank: Int?
    let accuracy: Int?
    let streak: Int

    var body: some View {
        VStack(spacing: 18) {
            HStack(spacing: 8) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(GcTheme.skyLite)
                Text(GulfCupConstants.tournamentName)
                    .font(GulfCupFonts.headline(size: 17))
                    .foregroundStyle(.white)
                Spacer()
                Text(L("brand.by"))
                    .font(GulfCupFonts.app(size: 11))
                    .foregroundStyle(.white.opacity(0.65))
            }

            VStack(spacing: 6) {
                Text(name)
                    .font(GulfCupFonts.headline(size: 26))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(L("account.card.tagline"))
                    .font(GulfCupFonts.app(size: 12))
                    .foregroundStyle(.white.opacity(0.7))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)

            HStack(spacing: 10) {
                cardStat("\(points)", L("account.stat.points"))
                cardStat(rank.map { "#\($0)" } ?? "—", L("account.stat.rank"))
                cardStat(accuracy.map { "\($0)%" } ?? "—", L("account.stat.accuracy"))
                if streak >= 2 { cardStat("\(streak)", L("account.card.streak")) }
            }

            Text(L("account.card.footer"))
                .font(GulfCupFonts.app(size: 11))
                .foregroundStyle(.white.opacity(0.6))
        }
        .padding(24)
        .frame(width: 360)
        .background(GcTheme.heroGradient)
    }

    private func cardStat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(GulfCupFonts.headline(size: 20))
                .foregroundStyle(.white)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(GulfCupFonts.app(size: 10))
                .foregroundStyle(.white.opacity(0.7))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.10)))
    }
}
