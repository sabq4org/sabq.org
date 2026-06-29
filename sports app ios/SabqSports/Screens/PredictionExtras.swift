import SwiftUI

// مكوّنات مساعدة لمركز التوقّعات: قائمة توقّعاتي · لوحة المتصدّرين · شاشة البطل
// والهدّاف · شبكة الإنجازات · احتفال الفوز (confetti). كلها تستهلك نماذج
// SportsPredictionModels عبر نقاط /api/v1/sports/predictions/* (Bearer).

// MARK: - توقّعاتي

struct SpMyPredictionsList: View {
    let rows: [SpMyPredictionRow]

    var body: some View {
        VStack(spacing: 10) {
            ForEach(rows) { row in SpMyPredictionRowCard(row: row) }
        }
    }
}

private struct SpMyPredictionRowCard: View {
    let row: SpMyPredictionRow

    var body: some View {
        VStack(spacing: 9) {
            HStack(spacing: 8) {
                if let comp = row.competitionSlug, !comp.isEmpty {
                    Text(prettyComp(comp))
                        .font(SportsFonts.app(size: 10, weight: .semibold)).foregroundStyle(SpTheme.green)
                        .lineLimit(1)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Capsule().fill(SpTheme.green.opacity(0.10)))
                }
                Spacer(minLength: 0)
                statusBadge
            }

            HStack(spacing: 10) {
                teamMini(row.homeTeamLogo, row.homeTeamName, leading: true)
                scoreBlock
                teamMini(row.awayTeamLogo, row.awayTeamName, leading: false)
            }
        }
        .padding(13)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(SpTheme.card)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                    .stroke(row.won ? SpTheme.leaf.opacity(0.45) : SpTheme.cardStroke, lineWidth: 1))
        )
    }

    // ترتيب موحّد مع بقية الشاشات: الشعار للداخل (نحو النتيجة)، الاسم للطرف الخارجي.
    private func teamMini(_ logo: String?, _ name: String, leading: Bool) -> some View {
        HStack(spacing: 7) {
            if leading {
                Text(name).font(SportsFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(SpTheme.onDark).lineLimit(1).minimumScaleFactor(0.8)
                SpTeamLogo(logo: logo ?? "", size: 30)
            } else {
                SpTeamLogo(logo: logo ?? "", size: 30)
                Text(name).font(SportsFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(SpTheme.onDark).lineLimit(1).minimumScaleFactor(0.8)
            }
        }
        .frame(maxWidth: .infinity, alignment: leading ? .leading : .trailing)
    }

    private var scoreBlock: some View {
        VStack(spacing: 3) {
            // توقّعي (LTR: ضيف-مضيف ليطابق ترتيب RTL).
            Text(verbatim: "\(row.predAway) - \(row.predHome)")
                .font(SportsFonts.app(size: 18, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                .monospacedDigit().environment(\.layoutDirection, .leftToRight)
            if row.settled, let fh = row.finalHome, let fa = row.finalAway {
                Text(verbatim: "(\(fa)-\(fh))")
                    .font(SportsFonts.app(size: 10, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
                    .monospacedDigit().environment(\.layoutDirection, .leftToRight)
            } else {
                Text("توقّعي").font(SportsFonts.app(size: 9)).foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .frame(width: 64)
    }

    @ViewBuilder private var statusBadge: some View {
        if row.settled {
            if row.won {
                HStack(spacing: 4) {
                    Text(row.tier.emoji)
                    Text("+\(row.pointsAwarded)")
                        .font(SportsFonts.app(size: 12, weight: .heavy)).foregroundStyle(SpTheme.leaf)
                        .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                }
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(SpTheme.leaf.opacity(0.12)))
            } else {
                Text("لم تُصب")
                    .font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Capsule().fill(SpTheme.chipFill))
            }
        } else {
            Text("بانتظار النتيجة")
                .font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.green)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(SpTheme.green.opacity(0.10)))
        }
    }
}

// أسماء بطولات مختصرة من الـ slug (احتياط حين لا يرسل الخادم اسمًا).
func prettyComp(_ slug: String) -> String {
    switch slug {
    case "gulf-cup-27", "gulf-cup": return "خليجي 27"
    case "saudi-league", "roshn-league": return "دوري روشن"
    case "world-cup": return "كأس العالم"
    case "champions-league": return "دوري الأبطال"
    case "afc-champions-league", "afc-champions": return "أبطال آسيا"
    case "pro-league": return "دوري روشن"
    default: return slug.replacingOccurrences(of: "-", with: " ")
    }
}

// MARK: - المتصدّرون

struct SpPoolLeaderboardList: View {
    let leaders: [SpPoolLeader]
    let myId: String?

    var body: some View {
        VStack(spacing: 8) {
            ForEach(leaders) { l in
                SpLeaderRow(leader: l, isMe: l.userId == myId)
            }
        }
    }
}

private struct SpLeaderRow: View {
    let leader: SpPoolLeader
    let isMe: Bool

    var body: some View {
        HStack(spacing: 12) {
            rankBadge
            SpAvatarImage(url: leader.avatar, size: 38,
                          ring: SpTheme.outline,
                          placeholderFg: SpTheme.green,
                          placeholderBg: SpTheme.green.opacity(0.12))
            VStack(alignment: .leading, spacing: 2) {
                Text(isMe ? "\(leader.name) (أنت)" : leader.name)
                    .font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.onDark)
                    .lineLimit(1)
                Text("\(leader.exactCount) دقيقة · دقّة \(leader.accuracy)٪ · \(leader.playedCount) توقّع")
                    .font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1)
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 1) {
                Text("\(leader.totalPoints)")
                    .font(SportsFonts.app(size: 16, weight: .heavy)).foregroundStyle(SpTheme.green)
                    .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                Text("نقطة").font(SportsFonts.app(size: 9)).foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .padding(11)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(isMe ? SpTheme.green.opacity(0.08) : SpTheme.card)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                    .stroke(isMe ? SpTheme.green.opacity(0.40) : SpTheme.cardStroke, lineWidth: 1))
        )
    }

    @ViewBuilder private var rankBadge: some View {
        let medal: Color? = leader.rank == 1 ? SpTheme.gold
            : leader.rank == 2 ? Color(red: 0.74, green: 0.76, blue: 0.80)
            : leader.rank == 3 ? Color(red: 0.80, green: 0.55, blue: 0.35) : nil
        ZStack {
            Circle().fill((medal ?? SpTheme.chipFill).opacity(medal == nil ? 1 : 0.9))
                .frame(width: 30, height: 30)
            Text("\(leader.rank)")
                .font(SportsFonts.app(size: 13, weight: .heavy))
                .foregroundStyle(medal == nil ? SpTheme.onDarkDim : .white)
                .monospacedDigit().environment(\.layoutDirection, .leftToRight)
        }
    }
}

// MARK: - البطل والهدّاف (توقّعات طويلة المدى)

struct SpLongPredictionsView: View {
    @Environment(SpAuthStore.self) private var auth

    @State private var comps: [SpCompetition] = []
    @State private var selected: SpCompetition?
    @State private var data: SpLongResponse?
    @State private var loading = true
    @State private var error: String?

    // اختيارات المستخدم قبل الإرسال
    @State private var pickedTeamId: Int?
    @State private var scorerName = ""
    @State private var submitting = false
    @State private var savedKind: String?

    var body: some View {
        VStack(spacing: 14) {
            if comps.count > 1 { compPicker }

            if loading {
                SpLoading()
            } else if let error {
                SpEmptyState(icon: "wifi.exclamationmark", title: "تعذّر التحميل", subtitle: error)
            } else if let data {
                championCard(data)
                scorerCard(data)
            } else {
                SpEmptyState(icon: "trophy", title: "لا بطولات متاحة",
                             subtitle: "توقّعات البطل والهدّاف تظهر للبطولات الجارية")
            }
        }
        .task { await loadComps() }
    }

    // اختيار البطولة
    private var compPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(comps) { c in
                    let active = c.slug == selected?.slug
                    Button {
                        selected = c
                        Task { await loadLong() }
                    } label: {
                        Text(c.name)
                            .font(SportsFonts.app(size: 12, weight: active ? .bold : .semibold))
                            .foregroundStyle(active ? .white : SpTheme.onDarkDim)
                            .lineLimit(1)
                            .padding(.horizontal, 13).padding(.vertical, 8)
                            .background(Capsule().fill(active ? SpTheme.green : SpTheme.chipFill))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    // بطاقة توقّع البطل
    private func championCard(_ d: SpLongResponse) -> some View {
        let myChampion = d.mine.first { $0.kind == "champion" }
        let totalVotes = max(1, d.championVotes.reduce(0) { $0 + $1.n })
        return VStack(alignment: .leading, spacing: 12) {
            longHeader(emoji: "🏆", title: "توقّع البطل", pool: d.pools.champion,
                       locked: d.locked, mineText: myChampion?.teamName)
            if d.teams.isEmpty {
                Text("قوائم الفرق غير متاحة بعد لهذه البطولة")
                    .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
            } else {
                let cols = [GridItem(.adaptive(minimum: 96), spacing: 10)]
                LazyVGrid(columns: cols, spacing: 10) {
                    ForEach(d.teams) { t in
                        let picked = (pickedTeamId ?? myChampion?.teamId) == t.id
                        let votes = d.championVotes.first { $0.teamId == t.id }?.n ?? 0
                        Button {
                            if !d.locked { pickedTeamId = t.id }
                        } label: {
                            VStack(spacing: 6) {
                                SpTeamLogo(logo: t.logo, size: 40)
                                Text(t.name).font(SportsFonts.app(size: 11, weight: .semibold))
                                    .foregroundStyle(SpTheme.onDark).lineLimit(1).minimumScaleFactor(0.7)
                                Text("\(Int(round(Double(votes) / Double(totalVotes) * 100)))٪")
                                    .font(SportsFonts.app(size: 9)).foregroundStyle(SpTheme.onDarkFaint)
                                    .environment(\.layoutDirection, .leftToRight)
                            }
                            .frame(maxWidth: .infinity).padding(.vertical, 9)
                            .background(RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(picked ? SpTheme.green.opacity(0.12) : SpTheme.chipFill)
                                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(picked ? SpTheme.green : .clear, lineWidth: 1.5)))
                        }
                        .buttonStyle(.plain).disabled(d.locked)
                    }
                }
                if auth.isLoggedIn && !d.locked {
                    longSubmit(kind: "champion",
                               enabled: (pickedTeamId ?? myChampion?.teamId) != nil) {
                        await submitChampion()
                    }
                }
            }
        }
        .padding(15)
        .background(longCardBg)
    }

    // بطاقة توقّع الهدّاف
    private func scorerCard(_ d: SpLongResponse) -> some View {
        let myScorer = d.mine.first { $0.kind == "top_scorer" }
        return VStack(alignment: .leading, spacing: 12) {
            longHeader(emoji: "⚽️", title: "توقّع الهدّاف", pool: d.pools.topScorer,
                       locked: d.locked, mineText: myScorer?.playerName)
            if d.locked {
                Text("أُقفلت التوقّعات — انطلقت البطولة")
                    .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
            } else if auth.isLoggedIn {
                TextField("اكتب اسم اللاعب…", text: $scorerName)
                    .font(SportsFonts.app(size: 14)).foregroundStyle(SpTheme.onDark)
                    .padding(.horizontal, 14).frame(height: 46)
                    .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous)
                        .fill(SpTheme.chipFill))
                    .onAppear { if scorerName.isEmpty, let n = myScorer?.playerName { scorerName = n } }
                longSubmit(kind: "top_scorer",
                           enabled: !scorerName.trimmingCharacters(in: .whitespaces).isEmpty) {
                    await submitScorer()
                }
            } else {
                Text("سجّل الدخول لتوقّع الهدّاف")
                    .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
            }
        }
        .padding(15)
        .background(longCardBg)
    }

    private func longHeader(emoji: String, title: String, pool: Int, locked: Bool, mineText: String?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(emoji).font(.system(size: 18))
                Text(title).font(SportsFonts.subhead(size: 16)).foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                Text("\(pool) نقطة")
                    .font(SportsFonts.app(size: 11, weight: .heavy)).foregroundStyle(SpTheme.gold)
                    .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .background(Capsule().fill(SpTheme.gold.opacity(0.12)))
            }
            if let mineText, !mineText.isEmpty {
                Text("اختيارك الحالي: \(mineText)")
                    .font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.green)
            }
        }
    }

    private func longSubmit(kind: String, enabled: Bool, _ action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            HStack(spacing: 8) {
                if submitting { ProgressView().tint(.white) }
                Text(savedKind == kind ? "تم الحفظ ✓" : "احفظ توقّعي")
                    .font(SportsFonts.app(size: 14, weight: .bold))
            }
            .foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 44)
            .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous)
                .fill(savedKind == kind ? SpTheme.leaf : (enabled ? SpTheme.green : SpTheme.onDarkFaint)))
        }
        .buttonStyle(.plain).disabled(!enabled || submitting)
    }

    private var longCardBg: some View {
        RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
            .fill(SpTheme.card)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .stroke(SpTheme.cardStroke, lineWidth: 1))
    }

    // MARK: - تحميل/إرسال

    // بطولات التوقّعات طويلة المدى (البطل/الهدّاف): كأس العالم، أبطال آسيا، خليجي 27،
    // وكل البطولات السعودية. لا نشترط جدول ترتيب — الكؤوس تشتقّ فِرقها من المباريات
    // في الخادم، فاشتراط hasStandings كان يستبعد كأس العالم والخليج وآسيا بالكامل.
    private static let longCompSlugs: [String] = ["world-cup", "afc-champions-league", "gulf-cup"]

    private func loadComps() async {
        loading = true
        do {
            let r = try await APIClient.shared.fetchCompetitions(ignoreCache: false)
            let pick: (SpCompetition) -> Bool = { c in
                Self.longCompSlugs.contains(c.slug) || c.category == "saudi"
            }
            var list = r.competitions.filter { pick($0) && $0.status != "finished" }
            if list.isEmpty { list = r.competitions.filter(pick) }
            // ترتيب العرض: كأس العالم ثم آسيا ثم خليجي ثم البطولات السعودية.
            comps = list.sorted { a, b in
                let ai = Self.longCompSlugs.firstIndex(of: a.slug) ?? Self.longCompSlugs.count
                let bi = Self.longCompSlugs.firstIndex(of: b.slug) ?? Self.longCompSlugs.count
                return ai < bi
            }
            selected = comps.first
            if selected != nil { await loadLong() } else { loading = false }
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? "تعذّر التحميل"
            loading = false
        }
    }

    private func loadLong() async {
        guard let slug = selected?.slug else { return }
        loading = true; error = nil; savedKind = nil; pickedTeamId = nil; scorerName = ""
        do {
            data = try await APIClient.shared.fetchPoolLong(comp: slug)
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? "تعذّر التحميل"
        }
        loading = false
    }

    private func submitChampion() async {
        guard let slug = selected?.slug, let teamId = pickedTeamId else { return }
        submitting = true
        let body = SpLongSubmitBody(competitionSlug: slug, kind: "champion", teamId: teamId, playerName: nil)
        do {
            _ = try await APIClient.shared.submitPoolLong(body)
            savedKind = "champion"
            await loadLong()
        } catch { self.error = "تعذّر حفظ التوقّع" }
        submitting = false
    }

    private func submitScorer() async {
        guard let slug = selected?.slug else { return }
        let name = scorerName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        submitting = true
        let body = SpLongSubmitBody(competitionSlug: slug, kind: "top_scorer", teamId: nil, playerName: name)
        do {
            _ = try await APIClient.shared.submitPoolLong(body)
            savedKind = "top_scorer"
            await loadLong()
        } catch { self.error = "تعذّر حفظ التوقّع" }
        submitting = false
    }
}

// MARK: - الإنجازات (الشارات)

// كتالوج الشارات — مطابق لمنطق المنح في sportsPoolPredictionsService.awardBadges.
struct SpBadgeInfo: Identifiable, Hashable {
    let code: String
    let emoji: String
    let title: String
    let desc: String
    var id: String { code }
}

let spBadgeCatalog: [SpBadgeInfo] = [
    .init(code: "nostradamus", emoji: "🔮", title: "العرّاف", desc: "5 نتائج دقيقة"),
    .init(code: "lionheart", emoji: "🦁", title: "قلب الأسد", desc: "أصبت نتيجة مفاجئة (احتمال أقل من 10٪)"),
    .init(code: "hot_streak", emoji: "🔥", title: "سلسلة ملتهبة", desc: "3 توقّعات صحيحة متتالية"),
    .init(code: "marathoner", emoji: "🏃", title: "الماراثوني", desc: "25 توقّعًا مكتملًا"),
]

struct SpBadgesGrid: View {
    let earned: Set<String>

    private var cols: [GridItem] { [GridItem(.adaptive(minimum: 150), spacing: 12)] }

    var body: some View {
        VStack(spacing: 14) {
            HStack {
                Text("جمعت \(earned.count) من \(spBadgeCatalog.count) شارة")
                    .font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                Spacer(minLength: 0)
            }
            LazyVGrid(columns: cols, spacing: 12) {
                ForEach(spBadgeCatalog) { b in
                    badgeCard(b, unlocked: earned.contains(b.code))
                }
            }
        }
    }

    private func badgeCard(_ b: SpBadgeInfo, unlocked: Bool) -> some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(unlocked ? SpTheme.gold.opacity(0.16) : SpTheme.chipFill)
                    .frame(width: 56, height: 56)
                Text(b.emoji).font(.system(size: 28))
                    .grayscale(unlocked ? 0 : 1).opacity(unlocked ? 1 : 0.5)
            }
            Text(b.title)
                .font(SportsFonts.app(size: 13, weight: .bold))
                .foregroundStyle(unlocked ? SpTheme.onDark : SpTheme.onDarkDim)
            Text(b.desc)
                .font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkFaint)
                .multilineTextAlignment(.center).lineLimit(2).frame(height: 26)
            if unlocked {
                Text("مكتمل ✓").font(SportsFonts.app(size: 10, weight: .heavy)).foregroundStyle(SpTheme.leaf)
            } else {
                Text("مقفل").font(SportsFonts.app(size: 10, weight: .semibold)).foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .frame(maxWidth: .infinity).padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(SpTheme.card)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                    .stroke(unlocked ? SpTheme.gold.opacity(0.45) : SpTheme.cardStroke, lineWidth: 1))
        )
    }
}

// MARK: - احتفال الفوز (modal + confetti)

struct SpWinCelebration: View {
    let row: SpMyPredictionRow
    var onClose: () -> Void

    var body: some View {
        ZStack {
            SpConfettiView().allowsHitTesting(false)
            VStack(spacing: 18) {
                Text(row.tier.emoji).font(.system(size: 64))
                Text("توقّع موفّق! 🎉")
                    .font(SportsFonts.headline(size: 24)).foregroundStyle(SpTheme.onDark)
                Text("\(row.homeTeamName) ضد \(row.awayTeamName)")
                    .font(SportsFonts.app(size: 14, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                    .multilineTextAlignment(.center)
                VStack(spacing: 4) {
                    Text("+\(row.pointsAwarded)")
                        .font(SportsFonts.app(size: 40, weight: .heavy)).foregroundStyle(SpTheme.green)
                        .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                    Text("نقطة من \(row.tier.labelAr)")
                        .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
                }
                .padding(.vertical, 6)

                Button(action: onClose) {
                    Text("رائع!")
                        .font(SportsFonts.app(size: 16, weight: .bold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity).frame(height: 50)
                        .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous)
                            .fill(SpTheme.green))
                }
                .buttonStyle(.plain).padding(.horizontal, 24)
            }
            .padding(28)
        }
        .background(SpTheme.card.ignoresSafeArea())
    }
}

// confetti خفيف بـ Canvas + TimelineView — قطع ملوّنة تتساقط وتدور لِـ ~4 ثوانٍ.
struct SpConfettiView: View {
    private struct Piece {
        let x: CGFloat          // نسبة أفقية 0..1
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
        let palette: [Color] = [SpTheme.green, SpTheme.gold, SpTheme.greenSoft, SpTheme.teal, SpTheme.leaf, SpTheme.goldSoft]
        pieces = (0..<count).map { _ in
            Piece(
                x: .random(in: 0...1),
                delay: .random(in: 0...0.8),
                duration: .random(in: 2.2...3.6),
                color: palette.randomElement() ?? SpTheme.green,
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
