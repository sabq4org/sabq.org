import SwiftUI

// مركز التوقعات — إعادة بناء كاملة: ترويسة نقاطي + الجائزة المتراكمة، وأربعة
// أقسام: المباريات (بطاقات توقّع غنية) · المتصدرون (منصّة تتويج + قائمة) ·
// البطل والهدّاف (طويلة المدى) · سجلّي (كل توقّعاتي ونتائجها).
struct GcPredictionsHubScreen: View {
    @Environment(GcAuthStore.self) private var auth
    @State private var today: GcPredictionsTodayResponse?
    @State private var leaders: [GcPredictionLeader] = []
    @State private var longData: GcLongData?
    @State private var mine: [GcMyPredictionRow] = []
    @State private var loading = true
    @State private var errorMessage: String?
    @State private var segment: GcPredSegment = .matches

    var body: some View {
        GcScreenScaffold {
            VStack(spacing: 14) {
                GcPredictionsHero(me: today?.me, jackpot: today?.jackpot ?? 0, myRank: myRank)

                segmentBar

                if let errorMessage {
                    GcPredUnavailable(message: errorMessage)
                } else if loading && today == nil {
                    GcLoadingPanel(title: L("loading.predictions"))
                } else {
                    switch segment {
                    case .matches: matchesSection
                    case .leaderboard: GcPredLeaderboard(leaders: leaders, myUserId: auth.member?.id)
                    case .long: GcLongPredictionsView(data: longData, reload: { await load(force: true) })
                    case .mine: mineSection
                    }
                }
                GcFooterSignature()
            }
        }
        .task { await load() }
        .refreshable { await load(force: true) }
        .navigationBarHidden(true)
    }

    private var myRank: Int? {
        guard let id = auth.member?.id else { return nil }
        return leaders.first(where: { $0.userId == id })?.rank
    }

    private var segmentBar: some View {
        HStack(spacing: 6) {
            ForEach(GcPredSegment.allCases) { seg in
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { segment = seg }
                } label: {
                    Text(seg.title)
                        .font(GulfCupFonts.app(size: 11.5, weight: .bold))
                        .foregroundStyle(segment == seg ? .white : GcTheme.inkDim)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(
                            RoundedRectangle(cornerRadius: GcTheme.chipRadius, style: .continuous)
                                .fill(segment == seg ? GcTheme.emerald : Color.clear)
                        )
                }
                .buttonStyle(GcPressStyle())
            }
        }
        .padding(4)
        .gcCard(radius: GcTheme.tileRadius)
    }

    @ViewBuilder private var matchesSection: some View {
        let matches = today?.matches ?? []
        if matches.isEmpty {
            GcEmptyState(icon: "sparkles.rectangle.stack", title: L("predictions.empty.title"), subtitle: L("predictions.empty.subtitle"))
        } else {
            ForEach(matches) { match in
                GcPredictionMatchCard(match: match, onSubmitted: { await load(force: true) })
            }
        }
    }

    @ViewBuilder private var mineSection: some View {
        if !auth.isLoggedIn {
            VStack(spacing: 12) {
                Text(L("predictions.signin.note"))
                    .font(GulfCupFonts.app(size: 12.5))
                    .foregroundStyle(GcTheme.inkDim)
                    .multilineTextAlignment(.center)
                GcAppleSignInButton()
            }
            .padding(16)
            .gcCard()
        } else if mine.isEmpty {
            GcEmptyState(icon: "tray", title: L("mine.empty.title"), subtitle: L("mine.empty.subtitle"))
        } else {
            VStack(spacing: 0) {
                ForEach(Array(mine.enumerated()), id: \.element.id) { idx, row in
                    if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                    GcMineRow(row: row)
                }
            }
            .gcCard()
        }
    }

    private func load(force: Bool = false) async {
        if today == nil { loading = true }
        do {
            async let t = APIClient.shared.fetchGcPredictionsToday(ignoreCache: force)
            async let l = APIClient.shared.fetchGcPredictionsLeaderboard(ignoreCache: force)
            async let lg = APIClient.shared.fetchGcLongPredictions(ignoreCache: force)
            today = try await t
            leaders = try await l
            longData = try await lg
            errorMessage = nil
            if auth.isLoggedIn {
                mine = (try? await APIClient.shared.fetchGcMyPredictions(ignoreCache: force)) ?? mine
            }
        } catch let err as APIError {
            if case .server(503, _) = err { errorMessage = L("predictions.unavailable") }
            else { errorMessage = LError(err) }
        } catch { errorMessage = LError(error) }
        loading = false
    }
}

enum GcPredSegment: String, CaseIterable, Identifiable {
    case matches, leaderboard, long, mine
    var id: String { rawValue }
    var title: String {
        switch self {
        case .matches: return L("predictions.seg.matches")
        case .leaderboard: return L("predictions.seg.leaders")
        case .long: return L("predictions.seg.long")
        case .mine: return L("predictions.seg.mine")
        }
    }
}

// MARK: - ترويسة التوقعات (نقاطي + الجائزة)

private struct GcPredictionsHero: View {
    let me: GcPredictionMeStats?
    let jackpot: Int
    let myRank: Int?

    var body: some View {
        GcHeroPanel(radius: GcTheme.cardRadius) {
            VStack(spacing: 13) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L("predictions.hero.title")).font(GulfCupFonts.headline(size: 20)).foregroundStyle(.white)
                        Text(L("predictions.hero.subtitle"))
                            .font(GulfCupFonts.app(size: 10.5))
                            .foregroundStyle(GcTheme.onHeroDim)
                            .lineSpacing(2)
                    }
                    Spacer()
                    VStack(spacing: 2) {
                        Image(systemName: "gift.fill").font(.system(size: 15)).foregroundStyle(GcTheme.goldLite)
                        Text("\(jackpot)")
                            .font(GulfCupFonts.app(size: 17, weight: .bold))
                            .foregroundStyle(GcTheme.goldTitleGradient)
                            .monospacedDigit()
                        Text(L("predictions.jackpot")).font(GulfCupFonts.app(size: 8.5)).foregroundStyle(GcTheme.onHeroFaint)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(.white.opacity(0.08)))
                    .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(GcTheme.goldLite.opacity(0.22), lineWidth: 1))
                }
                HStack(spacing: 0) {
                    heroStat("\(me?.points ?? 0)", L("predictions.stat.points"))
                    heroDivider
                    heroStat("\(me?.exact ?? 0)", L("predictions.stat.exact"))
                    heroDivider
                    heroStat("\(me?.currentStreak ?? 0)", L("predictions.stat.streak"))
                    heroDivider
                    heroStat(myRank.map { "#\($0)" } ?? "—", "ترتيبي")
                }
            }
            .padding(16)
        }
        .padding(.top, 8)
    }

    private var heroDivider: some View {
        Rectangle().fill(.white.opacity(0.12)).frame(width: 1, height: 26)
    }

    private func heroStat(_ v: String, _ l: String) -> some View {
        VStack(spacing: 2) {
            Text(v).font(GulfCupFonts.app(size: 16, weight: .bold)).foregroundStyle(.white).monospacedDigit()
            Text(l).font(GulfCupFonts.app(size: 9.5)).foregroundStyle(GcTheme.onHeroFaint)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - المتصدرون (منصّة + قائمة)

private struct GcPredLeaderboard: View {
    let leaders: [GcPredictionLeader]
    let myUserId: String?

    var body: some View {
        if leaders.isEmpty {
            GcEmptyState(icon: "list.number", title: L("leaderboard.empty.title"), subtitle: L("leaderboard.empty.subtitle"))
        } else {
            VStack(spacing: 12) {
                if leaders.count >= 3 {
                    podium
                }
                list
            }
        }
    }

    /// منصّة التتويج — الأول في الوسط مرفوعًا.
    private var podium: some View {
        let top3 = Array(leaders.prefix(3))
        return HStack(alignment: .bottom, spacing: 8) {
            if top3.count > 1 { podiumCol(top3[1], height: 68, tint: GcTheme.inkFaint) }
            podiumCol(top3[0], height: 92, tint: GcTheme.goldDeep, crowned: true)
            if top3.count > 2 { podiumCol(top3[2], height: 52, tint: GcTheme.amber) }
        }
        .padding(.horizontal, 8)
    }

    private func podiumCol(_ leader: GcPredictionLeader, height: CGFloat, tint: Color, crowned: Bool = false) -> some View {
        VStack(spacing: 6) {
            if crowned {
                Image(systemName: "crown.fill").font(.system(size: 15)).foregroundStyle(GcTheme.gold)
            }
            ZStack {
                Circle().fill(tint.opacity(0.15)).frame(width: 46, height: 46)
                Text(String(leader.name.prefix(2)))
                    .font(GulfCupFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(tint)
            }
            Text(leader.name)
                .font(GulfCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(GcTheme.ink)
                .lineLimit(1)
            Text("\(leader.totalPoints)")
                .font(GulfCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(tint)
                .monospacedDigit()
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(tint.opacity(0.18))
                .frame(height: height)
                .overlay(
                    Text("\(leader.rank)")
                        .font(GulfCupFonts.app(size: 21, weight: .bold))
                        .foregroundStyle(tint)
                )
        }
        .frame(maxWidth: .infinity)
    }

    private var list: some View {
        VStack(spacing: 0) {
            ForEach(Array(leaders.prefix(30).enumerated()), id: \.element.id) { idx, row in
                if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                HStack(spacing: 12) {
                    Text("\(row.rank)").font(GulfCupFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(row.rank <= 3 ? GcTheme.goldDeep : GcTheme.inkDim)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(row.rank <= 3 ? GcTheme.gold.opacity(0.14) : GcTheme.chipFill))
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 5) {
                            Text(row.name).font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                            if row.userId == myUserId {
                                GcChip(text: "أنا", tint: GcTheme.emerald, filled: true)
                            }
                        }
                        Text("\(row.exactCount) \(L("predictions.stat.exact")) · \(Int(row.accuracy * 100))% \(L("leaderboard.accuracy"))")
                            .font(GulfCupFonts.app(size: 10)).foregroundStyle(GcTheme.inkDim)
                    }
                    Spacer()
                    Text("\(row.totalPoints)").font(GulfCupFonts.app(size: 15, weight: .bold)).foregroundStyle(GcTheme.goldDeep).monospacedDigit()
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(row.userId == myUserId ? GcTheme.emerald.opacity(0.05) : Color.clear)
            }
        }
        .gcCard()
    }
}

// MARK: - التوقعات طويلة المدى (البطل + الهدّاف)

private struct GcLongPredictionsView: View {
    let data: GcLongData?
    let reload: () async -> Void
    @Environment(GcAuthStore.self) private var auth
    @State private var submitting = false
    @State private var message: String?
    @State private var scorerName = ""

    private var myChampion: GcLongMine? { data?.mine.first(where: { $0.kind == "champion" }) }
    private var myScorer: GcLongMine? { data?.mine.first(where: { $0.kind == "top_scorer" }) }

    var body: some View {
        VStack(spacing: 14) {
            if let data {
                championCard(data)
                scorerCard
                if !auth.isLoggedIn {
                    VStack(spacing: 10) {
                        Text(L("predictions.signin.note"))
                            .font(GulfCupFonts.app(size: 12))
                            .foregroundStyle(GcTheme.inkDim)
                            .multilineTextAlignment(.center)
                        GcAppleSignInButton()
                    }
                    .padding(14)
                    .gcCard()
                }
                if let message {
                    Text(message).font(GulfCupFonts.app(size: 12, weight: .semibold)).foregroundStyle(GcTheme.emerald)
                }
            } else {
                GcEmptyState(icon: "trophy", title: L("long.champion.title"), subtitle: L("predictions.unavailable"))
            }
        }
        .onAppear {
            if let name = myScorer?.playerName { scorerName = name }
        }
    }

    // بطاقة توقّع البطل — شبكة منتخبات + توزيع أصوات
    private func championCard(_ data: GcLongData) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            GcSectionHeader(icon: "crown.fill", title: L("long.champion.title"), subtitle: L("long.champion.subtitle"), tint: GcTheme.goldDeep)

            if let mine = myChampion, let name = mine.teamName {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(GcTheme.emerald)
                    Text("\(L("long.mine")): \(name)").font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.emerald)
                    Spacer()
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: GcTheme.chipRadius, style: .continuous).fill(GcTheme.emerald.opacity(0.08)))
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 82))], spacing: 9) {
                ForEach(data.teams) { t in
                    Button {
                        Task { await pickChampion(t.id) }
                    } label: {
                        VStack(spacing: 6) {
                            GcTeamLogo(logo: t.logo, size: 38)
                            Text(t.name)
                                .font(GulfCupFonts.app(size: 10, weight: .semibold))
                                .foregroundStyle(GcTheme.ink)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(
                            RoundedRectangle(cornerRadius: GcTheme.chipRadius, style: .continuous)
                                .fill(myChampion?.teamId == t.id ? GcTheme.emerald.opacity(0.12) : GcTheme.cardBgSubtle)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: GcTheme.chipRadius, style: .continuous)
                                .stroke(myChampion?.teamId == t.id ? GcTheme.emerald : GcTheme.outline, lineWidth: myChampion?.teamId == t.id ? 1.5 : 1)
                        )
                    }
                    .buttonStyle(GcPressStyle())
                    .disabled(!auth.isLoggedIn || submitting)
                }
            }

            if !data.championVotes.isEmpty {
                Text(L("long.votes")).font(GulfCupFonts.app(size: 12, weight: .bold)).foregroundStyle(GcTheme.inkDim)
                votesBars(data)
            }
        }
        .padding(14)
        .gcCard()
    }

    private func votesBars(_ data: GcLongData) -> some View {
        let votes = data.championVotes.filter { $0.kind == "champion" && $0.teamId != nil }.sorted { $0.n > $1.n }
        let maxVotes = max(votes.first?.n ?? 1, 1)
        return VStack(spacing: 7) {
            ForEach(Array(votes.prefix(5).enumerated()), id: \.offset) { _, v in
                if let team = data.teams.first(where: { $0.id == v.teamId }) {
                    HStack(spacing: 8) {
                        GcTeamLogo(logo: team.logo, size: 20)
                        Text(team.name).font(GulfCupFonts.app(size: 11.5)).foregroundStyle(GcTheme.ink).frame(width: 64, alignment: .leading).lineLimit(1)
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(GcTheme.chipFill)
                                Capsule().fill(GcTheme.emeraldGradient)
                                    .frame(width: max(geo.size.width * CGFloat(v.n) / CGFloat(maxVotes), 6))
                            }
                        }
                        .frame(height: 8)
                        Text("\(v.n)").font(GulfCupFonts.app(size: 11.5, weight: .bold)).foregroundStyle(GcTheme.inkDim).monospacedDigit().frame(width: 26)
                    }
                }
            }
        }
    }

    // بطاقة توقّع الهدّاف — إدخال حرّ
    private var scorerCard: some View {
        VStack(alignment: .leading, spacing: 11) {
            GcSectionHeader(icon: "soccerball", title: L("long.scorer.title"), subtitle: L("long.scorer.subtitle"), tint: GcTheme.emerald)
            if let mine = myScorer, let name = mine.playerName, !name.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(GcTheme.emerald)
                    Text("\(L("long.mine")): \(name)").font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.emerald)
                    Spacer()
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: GcTheme.chipRadius, style: .continuous).fill(GcTheme.emerald.opacity(0.08)))
            }
            HStack(spacing: 8) {
                TextField(L("long.scorer.placeholder"), text: $scorerName)
                    .font(GulfCupFonts.app(size: 13))
                    .padding(.horizontal, 12).padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: GcTheme.chipRadius, style: .continuous).fill(GcTheme.chipFill))
                Button {
                    Task { await saveScorer() }
                } label: {
                    Text(L("long.scorer.save"))
                        .font(GulfCupFonts.app(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: GcTheme.chipRadius, style: .continuous).fill(GcTheme.emerald))
                }
                .buttonStyle(GcPressStyle())
                .disabled(!auth.isLoggedIn || submitting || scorerName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(14)
        .gcCard()
    }

    private func pickChampion(_ teamId: Int) async {
        submitting = true
        message = nil
        do {
            try await APIClient.shared.submitGcLongPrediction(kind: "champion", teamId: teamId)
            message = "تم حفظ توقّع البطل"
            await reload()
        } catch let e as APIError {
            message = e.errorDescription
        } catch {
            message = "تعذّر الحفظ"
        }
        submitting = false
    }

    private func saveScorer() async {
        submitting = true
        message = nil
        do {
            try await APIClient.shared.submitGcLongPrediction(
                kind: "top_scorer",
                teamId: nil,
                playerName: scorerName.trimmingCharacters(in: .whitespaces)
            )
            message = "تم حفظ توقّع الهدّاف"
            await reload()
        } catch let e as APIError {
            message = e.errorDescription
        } catch {
            message = "تعذّر الحفظ"
        }
        submitting = false
    }
}

// MARK: - صفّ سجلّ توقّعاتي

private struct GcMineRow: View {
    let row: GcMyPredictionRow

    private var tierText: String? {
        switch row.tier {
        case "exact": return L("predictions.tier.exact")
        case "margin": return L("predictions.tier.margin")
        case "outcome": return L("predictions.tier.outcome")
        case "none": return L("predictions.tier.none")
        default: return nil
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    if let logo = row.homeTeamLogo { GcTeamLogo(logo: logo, size: 18) }
                    Text(row.homeTeamName ?? "؟").font(GulfCupFonts.app(size: 11.5, weight: .semibold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                    Text("×").font(GulfCupFonts.app(size: 10)).foregroundStyle(GcTheme.inkFaint)
                    Text(row.awayTeamName ?? "؟").font(GulfCupFonts.app(size: 11.5, weight: .semibold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                    if let logo = row.awayTeamLogo { GcTeamLogo(logo: logo, size: 18) }
                }
                HStack(spacing: 6) {
                    Text("توقّعي \(row.predAway)-\(row.predHome)")
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                    if let fh = row.finalHome, let fa = row.finalAway {
                        Text("· النتيجة \(fa)-\(fh)")
                            .monospacedDigit()
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                .font(GulfCupFonts.app(size: 10.5))
                .foregroundStyle(GcTheme.inkDim)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                if row.status == "pending" {
                    GcChip(text: L("mine.pending"), tint: GcTheme.amber)
                } else if let pts = row.pointsAwarded, pts > 0 {
                    Text("+\(pts)")
                        .font(GulfCupFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(GcTheme.goldDeep)
                        .monospacedDigit()
                }
                if let tierText, row.status != "pending" {
                    Text(tierText).font(GulfCupFonts.app(size: 9.5)).foregroundStyle(GcTheme.inkDim)
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }
}

private struct GcPredUnavailable: View {
    let message: String
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "sparkles.rectangle.stack").font(.system(size: 28)).foregroundStyle(GcTheme.gold)
            Text(L("predictions.unavailable")).font(GulfCupFonts.app(size: 15, weight: .bold)).foregroundStyle(GcTheme.ink)
            Text(message).font(GulfCupFonts.app(size: 12)).foregroundStyle(GcTheme.inkDim).multilineTextAlignment(.center)
        }
        .padding(20).frame(maxWidth: .infinity)
        .gcCard()
    }
}
