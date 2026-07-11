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
                    case .majlis: GcMajlisSection()
                    case .fantasy: GcFantasySection()
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
    case matches, leaderboard, majlis, fantasy, long, mine
    var id: String { rawValue }
    var title: String {
        switch self {
        case .matches: return L("predictions.seg.matches")
        case .leaderboard: return L("predictions.seg.leaders")
        case .majlis: return "المجالس"
        case .fantasy: return "الفانتازي"
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

// MARK: - «مجالس التوقعات» — دوريات خاصة برمز دعوة

/// أنشئ مجلسك، شارك رمزه، ونافس أهلك وزملاءك في ترتيب خاص يقرأ نقاط
/// المسابقة العامة. نظير تبويب الويب نفسه عبر مرايا /api/v1.
struct GcMajlisSection: View {
    @Environment(GcAuthStore.self) private var auth
    @State private var majalis: [GcMajlisSummary] = []
    @State private var boards: [String: GcMajlisBoard] = [:]
    @State private var expandedId: String?
    @State private var newName = ""
    @State private var joinCode = ""
    @State private var busy = false
    @State private var message: String?
    @State private var loaded = false

    var body: some View {
        if !auth.isLoggedIn {
            VStack(spacing: 12) {
                Text("المجالس لأعضاء سبق — سجّل دخولك لتنشئ مجلسك وتنافس برمز دعوة")
                    .font(GulfCupFonts.app(size: 12.5))
                    .foregroundStyle(GcTheme.inkDim)
                    .multilineTextAlignment(.center)
                GcAppleSignInButton()
            }
            .padding(16)
            .gcCard()
        } else {
            content
        }
    }

    private var content: some View {
        VStack(spacing: 12) {
            // إنشاء مجلس
            VStack(alignment: .leading, spacing: 8) {
                Text("أنشئ مجلسك")
                    .font(GulfCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                HStack(spacing: 8) {
                    TextField("اسم المجلس — مثل: ديوانية الجمعة", text: $newName)
                        .font(GulfCupFonts.app(size: 12.5))
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: GcTheme.chipRadius, style: .continuous).fill(GcTheme.chipFill))
                    Button("إنشاء") { Task { await create() } }
                        .font(GulfCupFonts.app(size: 12.5, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(Capsule().fill(GcTheme.emerald))
                        .buttonStyle(GcPressStyle())
                        .disabled(busy || newName.trimmingCharacters(in: .whitespaces).count < 2)
                }
            }
            .padding(13)
            .gcCard()

            // انضمام برمز
            VStack(alignment: .leading, spacing: 8) {
                Text("انضم برمز دعوة")
                    .font(GulfCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                HStack(spacing: 8) {
                    TextField("مثل: 7KQ2MD", text: $joinCode)
                        .font(GulfCupFonts.app(size: 13, weight: .bold))
                        .multilineTextAlignment(.center)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.characters)
                        .environment(\.layoutDirection, .leftToRight)
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: GcTheme.chipRadius, style: .continuous).fill(GcTheme.chipFill))
                    Button("انضمام") { Task { await join() } }
                        .font(GulfCupFonts.app(size: 12.5, weight: .bold))
                        .foregroundStyle(GcTheme.forest)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(Capsule().fill(GcTheme.goldFill))
                        .buttonStyle(GcPressStyle())
                        .disabled(busy || joinCode.trimmingCharacters(in: .whitespaces).count < 4)
                }
            }
            .padding(13)
            .gcCard()

            if let message {
                Text(message)
                    .font(GulfCupFonts.app(size: 11.5, weight: .semibold))
                    .foregroundStyle(GcTheme.emeraldDeep)
            }

            if majalis.isEmpty && loaded {
                GcEmptyState(icon: "person.3", title: "لا مجالس بعد", subtitle: "أنشئ مجلسك الأول أو انضم برمز وصلك من صديق")
            }

            ForEach(majalis) { majlis in
                majlisCard(majlis)
            }
        }
        .task { await reload() }
    }

    private func majlisCard(_ majlis: GcMajlisSummary) -> some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    expandedId = expandedId == majlis.id ? nil : majlis.id
                }
                if boards[majlis.id] == nil {
                    Task { boards[majlis.id] = try? await APIClient.shared.fetchGcMajlisBoard(majlis.id) }
                }
            } label: {
                HStack(spacing: 10) {
                    Text(majlis.isOwner ? "👑" : "🪑").font(.system(size: 20))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(majlis.name).font(GulfCupFonts.app(size: 13.5, weight: .bold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                        Text("\(majlis.membersCount) عضو\(majlis.isOwner ? " · أنت صاحب المجلس" : "")")
                            .font(GulfCupFonts.app(size: 10)).foregroundStyle(GcTheme.inkDim)
                    }
                    Spacer()
                    Button {
                        UIPasteboard.general.string = majlis.code
                        message = "نُسخ الرمز \(majlis.code) — شاركه مع من تحب"
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "doc.on.doc").font(.system(size: 10, weight: .semibold))
                            Text(majlis.code).font(GulfCupFonts.app(size: 11, weight: .bold)).monospacedDigit()
                        }
                        .foregroundStyle(GcTheme.emeraldDeep)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Capsule().fill(GcTheme.emerald.opacity(0.10)))
                        .environment(\.layoutDirection, .leftToRight)
                    }
                    .buttonStyle(GcPressStyle())
                }
                .padding(13)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if expandedId == majlis.id {
                Rectangle().fill(GcTheme.outline).frame(height: 1)
                if let board = boards[majlis.id] {
                    VStack(spacing: 0) {
                        ForEach(Array(board.rows.enumerated()), id: \.element.id) { idx, row in
                            if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                            HStack(spacing: 9) {
                                Text(row.rank == 1 ? "🥇" : row.rank == 2 ? "🥈" : row.rank == 3 ? "🥉" : "\(row.rank)")
                                    .font(GulfCupFonts.app(size: 12, weight: .bold))
                                    .foregroundStyle(GcTheme.inkDim)
                                    .frame(width: 26)
                                GcPlayerPhoto(url: row.avatar, size: 26)
                                Text(row.name + (row.isOwner ? " 👑" : ""))
                                    .font(GulfCupFonts.app(size: 12, weight: row.userId == auth.member?.id ? .bold : .semibold))
                                    .foregroundStyle(GcTheme.ink)
                                    .lineLimit(1)
                                Spacer()
                                Text("\(row.correctCount) إصابة")
                                    .font(GulfCupFonts.app(size: 9.5)).foregroundStyle(GcTheme.inkFaint)
                                Text("\(row.totalPoints)")
                                    .font(GulfCupFonts.app(size: 13.5, weight: .bold))
                                    .foregroundStyle(GcTheme.emeraldDeep)
                                    .monospacedDigit()
                            }
                            .padding(.horizontal, 13).padding(.vertical, 8)
                            .background(row.userId == auth.member?.id ? GcTheme.emerald.opacity(0.06) : Color.clear)
                        }
                    }
                } else {
                    GcLoadingPanel(title: "جاري جلب الترتيب", rows: 2).padding(13)
                }
                Button {
                    Task { await leave(majlis) }
                } label: {
                    Text(majlis.isOwner ? "حذف المجلس نهائيًا" : "مغادرة المجلس")
                        .font(GulfCupFonts.app(size: 11.5, weight: .bold))
                        .foregroundStyle(GcTheme.crimson)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                }
                .buttonStyle(GcPressStyle())
            }
        }
        .gcCard()
    }

    private func reload() async {
        majalis = (try? await APIClient.shared.fetchGcMyMajalis()) ?? majalis
        loaded = true
    }

    private func create() async {
        busy = true
        do {
            let created = try await APIClient.shared.createGcMajlis(name: newName)
            message = "أُنشئ «\(created.name)» — رمز الدعوة: \(created.code)"
            newName = ""
            await reload()
        } catch let e as APIError { message = e.errorDescription } catch { message = "تعذّر الإنشاء — حاول مجددًا" }
        busy = false
    }

    private func join() async {
        busy = true
        do {
            let joined = try await APIClient.shared.joinGcMajlis(code: joinCode)
            message = "انضممت إلى «\(joined.name)» 🎉"
            joinCode = ""
            await reload()
        } catch let e as APIError { message = e.errorDescription } catch { message = "تعذّر الانضمام — تأكد من الرمز" }
        busy = false
    }

    private func leave(_ majlis: GcMajlisSummary) async {
        busy = true
        _ = try? await APIClient.shared.leaveGcMajlis(majlis.id)
        boards[majlis.id] = nil
        if expandedId == majlis.id { expandedId = nil }
        await reload()
        busy = false
    }
}

// MARK: - «فانتازي خليجي المصغّر»

/// اختر 7 لاعبين ضمن ميزانية 100، عيّن قائدًا (نقاطه ×2)، ونقاطك من تقييمات
/// المباريات الفعلية. نظير تبويب الويب عبر مرايا /api/v1.
struct GcFantasySection: View {
    @Environment(GcAuthStore.self) private var auth
    @State private var pool: GcFantasyPoolResponse?
    @State private var squad: GcFantasySquad?
    @State private var picked: Set<String> = []
    @State private var captainId = ""
    @State private var seeded = false
    @State private var busy = false
    @State private var message: String?
    @State private var loaded = false

    private var budget: Int { pool?.budget ?? 100 }
    private var squadSize: Int { pool?.squadSize ?? 7 }
    private var players: [GcFantasyPoolPlayer] { pool?.players ?? [] }
    private var spent: Int { players.filter { picked.contains($0.id) }.reduce(0) { $0 + $1.price } }
    private var remaining: Int { budget - spent }
    private var canSave: Bool { picked.count == squadSize && picked.contains(captainId) && spent <= budget }

    var body: some View {
        if !auth.isLoggedIn {
            VStack(spacing: 12) {
                Text("فانتازي خليجي لأعضاء سبق — سجّل دخولك لتكوّن تشكيلتك")
                    .font(GulfCupFonts.app(size: 12.5))
                    .foregroundStyle(GcTheme.inkDim)
                    .multilineTextAlignment(.center)
                GcAppleSignInButton()
            }
            .padding(16)
            .gcCard()
        } else if !loaded {
            GcLoadingPanel(title: "جاري تجهيز الفانتازي")
                .task { await load() }
        } else if players.isEmpty {
            GcEmptyState(icon: "sparkles", title: "قائمة اللاعبين تُفتح قبل البطولة", subtitle: "عُد قريبًا لتكوّن تشكيلتك المثالية")
        } else {
            content
        }
    }

    private var content: some View {
        VStack(spacing: 12) {
            // شريط الميزانية
            HStack(spacing: 14) {
                budgetTile("\(remaining)", "متبقٍّ من \(budget)")
                budgetTile("\(picked.count)/\(squadSize)", "لاعبون")
                if let squad { budgetTile("\(squad.totalPoints)", "نقاطي", tint: GcTheme.goldDeep) }
                Spacer()
                Button(squad == nil ? "حفظ" : "تحديث") { Task { await save() } }
                    .font(GulfCupFonts.app(size: 12.5, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18).padding(.vertical, 10)
                    .background(Capsule().fill(canSave ? GcTheme.emerald : GcTheme.inkFaint))
                    .buttonStyle(GcPressStyle())
                    .disabled(!canSave || busy)
            }
            .padding(13)
            .gcCard()

            if picked.count > 0 && captainId.isEmpty {
                Text("👑 اضغط التاج بجانب أحد لاعبيك لتعيينه قائدًا — نقاطه تُضاعَف")
                    .font(GulfCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(GcTheme.goldDeep)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 4)
            }
            if let message {
                Text(message).font(GulfCupFonts.app(size: 11.5, weight: .semibold)).foregroundStyle(GcTheme.emeraldDeep)
            }

            VStack(spacing: 0) {
                ForEach(Array(players.enumerated()), id: \.element.id) { idx, player in
                    if idx > 0 { Rectangle().fill(GcTheme.outline).frame(height: 1).padding(.leading, 14) }
                    playerRow(player)
                }
            }
            .gcCard()
        }
    }

    private func budgetTile(_ value: String, _ label: String, tint: Color = GcTheme.emeraldDeep) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value).font(GulfCupFonts.app(size: 15, weight: .bold)).foregroundStyle(tint).monospacedDigit()
            Text(label).font(GulfCupFonts.app(size: 9)).foregroundStyle(GcTheme.inkFaint)
        }
    }

    private func playerRow(_ player: GcFantasyPoolPlayer) -> some View {
        let isPicked = picked.contains(player.id)
        let isCaptain = captainId == player.id
        let disabled = !isPicked && (picked.count >= squadSize || player.price > remaining)
        return HStack(spacing: 10) {
            Button {
                toggle(player)
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: isPicked ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 18))
                        .foregroundStyle(isPicked ? GcTheme.emerald : GcTheme.inkFaint)
                    if let team = player.team {
                        GcTeamLogo(logo: team.logo, size: 22)
                    }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(player.name).font(GulfCupFonts.app(size: 12.5, weight: .semibold)).foregroundStyle(GcTheme.ink).lineLimit(1)
                        Text(player.team?.name ?? "").font(GulfCupFonts.app(size: 9.5)).foregroundStyle(GcTheme.inkDim)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(disabled)

            if isPicked {
                Button {
                    captainId = isCaptain ? "" : player.id
                } label: {
                    Image(systemName: "crown.fill")
                        .font(.system(size: 13))
                        .foregroundStyle(isCaptain ? GcTheme.forest : GcTheme.inkFaint)
                        .padding(6)
                        .background(Circle().fill(isCaptain ? AnyShapeStyle(GcTheme.goldFill) : AnyShapeStyle(GcTheme.chipFill)))
                }
                .buttonStyle(GcPressStyle())
            }

            Text("\(player.price)")
                .font(GulfCupFonts.app(size: 12.5, weight: .bold))
                .foregroundStyle(GcTheme.ink)
                .monospacedDigit()
                .frame(width: 30, height: 26)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(GcTheme.chipFill))
        }
        .padding(.horizontal, 13).padding(.vertical, 8)
        .opacity(disabled ? 0.45 : 1)
        .background(isPicked ? GcTheme.emerald.opacity(0.05) : Color.clear)
    }

    private func toggle(_ player: GcFantasyPoolPlayer) {
        if picked.contains(player.id) {
            picked.remove(player.id)
            if captainId == player.id { captainId = "" }
        } else if picked.count < squadSize && player.price <= remaining {
            picked.insert(player.id)
        }
    }

    private func load() async {
        pool = try? await APIClient.shared.fetchGcFantasyPool()
        squad = try? await APIClient.shared.fetchGcMyFantasy()
        if let squad, !seeded {
            picked = Set(squad.players.map(\.id))
            captainId = squad.captainId
            seeded = true
        }
        loaded = true
    }

    private func save() async {
        busy = true
        do {
            try await APIClient.shared.saveGcFantasy(playerIds: Array(picked), captainId: captainId)
            message = "حُفظت تشكيلتك ⚽ — نقاطك تُحتسب من تقييمات المباريات"
            squad = try? await APIClient.shared.fetchGcMyFantasy()
        } catch let e as APIError { message = e.errorDescription } catch { message = "تعذّر الحفظ — حاول مجددًا" }
        busy = false
    }
}
