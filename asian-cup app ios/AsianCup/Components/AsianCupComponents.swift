import SwiftUI

// مكوّنات UI أساسية لكأس آسيا — مُعاد تصميمها من WorldCupComponents لكن بألوان
// AcTheme. كلها تُستعمل عبر الشاشات.

// MARK: - أجواء الخلفية (توهّجات دقيقة + نقشة هندسية اختيارية)

// نقشة هندسية مائلة خفيفة مستوحاة من زخرفة اللوقو — تُرسم بـ Canvas لأداء عالٍ.
struct AcLatticePattern: View {
    var spacing: CGFloat = 26
    var body: some View {
        Canvas { ctx, size in
            var path = Path()
            var x: CGFloat = -size.height
            while x < size.width {
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x + size.height, y: size.height))
                x += spacing
            }
            ctx.stroke(path, with: .color(.white), lineWidth: 1)
        }
        .allowsHitTesting(false)
    }
}

// خلفية التطبيق الكاملة. محايدة حتى لا تبتلع الهوية؛ النقشة تُستخدم داخل
// البطاقات/الهيرو فقط، لا على كامل التطبيق.
struct AcAmbientBackground: View {
    var animated: Bool = true
    @State private var drift = false

    var body: some View {
        ZStack {
            AcTheme.screenGradient

            Circle()
                .fill(AcTheme.azure.opacity(0.10))
                .frame(width: 420, height: 420)
                .blur(radius: 130)
                .offset(x: drift ? 44 : -36, y: -315)

            Circle()
                .fill(AcTheme.gold.opacity(0.06))
                .frame(width: 330, height: 330)
                .blur(radius: 125)
                .offset(x: 155, y: 345)

            Circle()
                .fill(AcTheme.teal.opacity(0.08))
                .frame(width: 320, height: 320)
                .blur(radius: 125)
                .offset(x: -170, y: 430)
        }
        .ignoresSafeArea()
        .onAppear {
            guard animated else { return }
            withAnimation(.easeInOut(duration: 10).repeatForever(autoreverses: true)) {
                drift = true
            }
        }
    }
}

// MARK: - شعار البطولة (هالة نابضة + دخول زنبركي)
struct AcEmblem: View {
    var height: CGFloat = 134
    @State private var pulse = false
    @State private var entered = false

    var body: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [AcTheme.gold.opacity(0.38), .clear],
                        center: .center, startRadius: 4, endRadius: height * 0.7
                    )
                )
                .frame(width: height * 1.25, height: height * 1.25)
                .blur(radius: 30)
                .scaleEffect(pulse ? 1.12 : 0.9)
                .opacity(pulse ? 0.9 : 0.5)

            Image("Emblem")
                .resizable()
                .scaledToFit()
                .frame(height: height)
                .shadow(color: .black.opacity(0.18), radius: 16, y: 8)
                .scaleEffect(entered ? 1 : 0.82)
                .rotationEffect(.degrees(entered ? 0 : -4))
        }
        .onAppear {
            withAnimation(.spring(response: 0.75, dampingFraction: 0.6)) { entered = true }
            withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}

// شارة هيرو صغيرة (أيقونة + نص داخل كبسولة شفّافة بحدّ ملوّن).
struct AcHeroBadge: View {
    let icon: String
    let text: String
    var tint: Color = AcTheme.gold

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 11, weight: .semibold))
            Text(text).font(AsianCupFonts.app(size: 12, weight: .semibold))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Capsule().fill(tint.opacity(0.12)))
        .overlay(Capsule().stroke(tint.opacity(0.30), lineWidth: 1))
    }
}

// عنوان «كأس آسيا 2027» بتدرّج ذهبي على «2027» (مطابق لهيرو الويب).
struct AcTournamentTitle: View {
    var body: some View {
        HStack(spacing: 8) {
            Text(L("app.title"))
                .foregroundStyle(AcTheme.onDark)
            Text("2027")
                .foregroundStyle(AcTheme.goldTitleGradient)
        }
        .font(AsianCupFonts.app(size: 32, weight: .bold))
    }
}

// MARK: - حركة دخول الأقسام (ظهور تدريجي + انزياح خفيف)
private struct AcRevealModifier: ViewModifier {
    var delay: Double
    @State private var shown = false
    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 18)
            .onAppear {
                withAnimation(.easeOut(duration: 0.55).delay(delay)) { shown = true }
            }
    }
}

extension View {
    func acReveal(delay: Double = 0) -> some View { modifier(AcRevealModifier(delay: delay)) }
}

struct AcRemoteImage: View {
    let url: String
    var contentMode: ContentMode = .fit

    var body: some View {
        AsyncImage(url: URL(string: url)) { phase in
            switch phase {
            case .success(let image):
                image.resizable().aspectRatio(contentMode: contentMode)
            case .failure:
                Color.clear
            default:
                Color.clear
            }
        }
    }
}

struct AcTeamLogo: View {
    let logo: String
    var size: CGFloat = 40

    var body: some View {
        AcRemoteImage(url: logo)
            .padding(size * 0.14)
            .frame(width: size, height: size)
            .background(Circle().fill(.white))
            .overlay(Circle().stroke(AcTheme.outline, lineWidth: 1.5))
    }
}

struct AcStatusPill: View {
    let fixture: AcFixture

    var body: some View {
        if fixture.status.live {
            HStack(spacing: 4) {
                Circle().fill(.white).frame(width: 5, height: 5)
                Text(elapsedText)
            }
            .font(AsianCupFonts.app(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(AcTheme.crimson))
        } else if fixture.status.finished {
            Text(fixture.status.label)
                .font(AsianCupFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(AcTheme.chipFill))
        } else {
            Text(AcFormat.kickoffTime(fixture.date))
                .font(AsianCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(AcTheme.goldDeep)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(AcTheme.gold.opacity(0.16)))
        }
    }

    private var elapsedText: String {
        guard let e = fixture.status.elapsed else { return fixture.status.label }
        return "\(e)'"
    }
}

struct AcSectionHeader: View {
    let icon: String
    let title: String
    var subtitle: String? = nil
    var count: Int? = nil
    var tint: Color = AcTheme.gold

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(AsianCupFonts.app(size: 19, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 38, height: 38)
                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(tint.opacity(0.14)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AsianCupFonts.headline(size: 20))
                    .foregroundStyle(AcTheme.onDark)
                if let subtitle {
                    Text(subtitle)
                        .font(AsianCupFonts.app(size: 12))
                        .foregroundStyle(AcTheme.onDarkDim)
                }
            }
            Spacer(minLength: 0)
            if let count {
                Text("\(count)")
                    .font(AsianCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(tint)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(tint.opacity(0.14)))
            }
        }
    }
}

struct AcEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(AsianCupFonts.app(size: 30))
                .foregroundStyle(AcTheme.gold)
            Text(title)
                .font(AsianCupFonts.subhead(size: 15))
                .foregroundStyle(AcTheme.onDark)
            Text(subtitle)
                .font(AsianCupFonts.app(size: 12))
                .foregroundStyle(AcTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
    }
}

struct AcLoading: View {
    var body: some View {
        HStack { Spacer(); ProgressView().tint(AcTheme.gold); Spacer() }
            .padding(.vertical, 32)
    }
}

// بطاقة مباراة واحدة — تُستعمل في الجدول واليوم. الضغط يفتح ورقة التفاصيل.
struct AcMatchCard: View {
    let fixture: AcFixture

    private var started: Bool { fixture.status.live || fixture.status.finished }

    var body: some View {
        NavigationLink {
            AcMatchDetailSheet(fixture: fixture)
        } label: {
            cardLabel
        }
        .buttonStyle(.plain)
    }

    private var cardLabel: some View {
        VStack(spacing: 10) {
            HStack(spacing: 6) {
                Text(LRound(fixture.roundEn, fallback: fixture.round))
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
                Spacer(minLength: 6)
                AcStatusPill(fixture: fixture)
            }

            HStack(spacing: 8) {
                teamSide(fixture.home, highlight: false, leading: true)
                scoreBox
                teamSide(fixture.away, highlight: false, leading: false)
            }

            if !fixture.venue.name.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 10))
                    Text(venueText)
                        .font(AsianCupFonts.app(size: 11))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.left")
                        .font(.system(size: 10, weight: .semibold))
                }
                .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(AcTheme.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                        .stroke(AcTheme.outline, lineWidth: 1)
                )
        )
    }

    private var venueText: String {
        fixture.venue.city.isEmpty ? fixture.venue.name : "\(fixture.venue.name) — \(fixture.venue.city)"
    }

    // صفّ منتخب أفقي (شعار + اسم) — مطابق لـ TeamRow في الويب، مُرايا للجهتين.
    private func teamSide(_ team: AcTeam, highlight: Bool, leading: Bool) -> some View {
        HStack(spacing: 8) {
            if leading {
                AcTeamLogo(logo: team.logo, size: 30)
                teamName(team, highlight: highlight, align: .leading)
            } else {
                teamName(team, highlight: highlight, align: .trailing)
                AcTeamLogo(logo: team.logo, size: 30)
            }
        }
        .frame(maxWidth: .infinity, alignment: leading ? .leading : .trailing)
    }

    private func teamName(_ team: AcTeam, highlight: Bool, align: TextAlignment) -> some View {
        Text(LTeam(String(team.id), fallback: team.name))
            .font(AsianCupFonts.app(size: 13, weight: highlight ? .bold : .semibold))
            .foregroundStyle(highlight ? AcTheme.gold : AcTheme.onDark)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .multilineTextAlignment(align)
    }

    private var scoreBox: some View {
        Group {
            if started {
                Text("\(fixture.goals.home ?? 0) - \(fixture.goals.away ?? 0)")
                    .font(AsianCupFonts.app(size: 20, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text("VS")
                    .font(AsianCupFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
        .frame(minWidth: 52)
    }
}

// MARK: - ورقة تفاصيل المباراة (تُفتح بالضغط على أي بطاقة مباراة)
// تجلب التفاصيل الكاملة (أحداث/تشكيلات/إحصاءات/تقييمات/توقّع/مواجهات) من الخادم،
// وتعرض ما توفّر منها فقط — قبل البطولة تظهر النتيجة + التوقّع + معلومات المباراة.
struct AcMatchDetailSheet: View {
    let fixture: AcFixture
    @Environment(\.dismiss) private var dismiss
    @State private var detail: AcMatchDetail?
    @State private var loading = true

    private var displayFixture: AcFixture { detail?.fixture ?? fixture }
    private var started: Bool { displayFixture.status.live || displayFixture.status.finished }

    private func team(_ id: Int) -> AcTeam? {
        if id == displayFixture.home.id { return displayFixture.home }
        if id == displayFixture.away.id { return displayFixture.away }
        return nil
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                scoreboardHero

                if let d = detail {
                    if let p = d.prediction, !displayFixture.status.finished {
                        AcPredictionBarsCard(prediction: p, home: displayFixture.home, away: displayFixture.away)
                    }
                    if let mom = d.manOfTheMatch {
                        AcManOfMatchCard(player: mom, team: team(mom.teamId))
                    }
                    if !d.events.isEmpty {
                        AcEventsTimelineCard(events: d.events, homeId: displayFixture.home.id,
                                             home: displayFixture.home, away: displayFixture.away)
                    }
                    if !d.statistics.isEmpty {
                        AcStatisticsCard(stats: d.statistics, home: displayFixture.home, away: displayFixture.away)
                    }
                    if !d.ratings.isEmpty {
                        AcRatingsCard(ratings: d.ratings, teamFor: team)
                    }
                    if !d.lineups.isEmpty {
                        AcLineupsCard(lineups: d.lineups, teamFor: team)
                    }
                    if !d.headToHead.isEmpty {
                        AcHeadToHeadCard(fixtures: d.headToHead)
                    }
                } else if loading {
                    AcInlineLoading(title: L("match.loading"))
                }

                infoCard
            }
            .padding(16)
            .padding(.top, 4)
        }
        .background(AcAmbientBackground())
        .navigationBarTitleDisplayMode(.inline)
        .asianCupRTL()
        .task { await load() }
    }

    private func load() async {
        loading = true
        detail = try? await APIClient.shared.fetchAcMatchDetail(fixture.id)
        loading = false
    }

    // لوحة نتيجة متدرّجة فخمة (مستوحاة من سبوتلايت الأخضر في الويب).
    private var scoreboardHero: some View {
        VStack(spacing: 16) {
            HStack {
                Text(LRound(displayFixture.roundEn, fallback: displayFixture.round))
                    .font(AsianCupFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .padding(.horizontal, 12).padding(.vertical, 5)
                    .background(Capsule().fill(AcTheme.chipFill))
                Spacer()
                AcStatusPill(fixture: displayFixture)
            }

            HStack(alignment: .top, spacing: 8) {
                bigTeam(displayFixture.home, saudi: false)
                centerScore
                bigTeam(displayFixture.away, saudi: false)
            }

            AcFollowButton(
                kind: "match",
                refId: String(displayFixture.id),
                refName: "\(displayFixture.home.name) - \(displayFixture.away.name)"
            )
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [AcTheme.heroTop, AcTheme.heroBottom],
                        startPoint: .topTrailing, endPoint: .bottomLeading
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(AcTheme.gold.opacity(0.0), lineWidth: 1.5)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(AcTheme.outline, lineWidth: 1)
                )
        )
        .shadow(color: .black.opacity(0.10), radius: 16, y: 8)
    }

    private var centerScore: some View {
        VStack(spacing: 6) {
            if started {
                Text("\(displayFixture.goals.home ?? 0) - \(displayFixture.goals.away ?? 0)")
                    .font(AsianCupFonts.app(size: 40, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text(AcFormat.kickoffTime(displayFixture.date))
                    .font(AsianCupFonts.app(size: 30, weight: .bold))
                    .foregroundStyle(AcTheme.goldDeep)
                Text(L("match.riyadhTime"))
                    .font(AsianCupFonts.app(size: 10))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
        .frame(minWidth: 96)
    }

    private func bigTeam(_ team: AcTeam, saudi: Bool) -> some View {
        NavigationLink {
            AcTeamProfileScreen(teamId: team.id, fallback: team)
        } label: {
            VStack(spacing: 10) {
                AcTeamLogo(logo: team.logo, size: 68)
                    .overlay(alignment: .topTrailing) {
                        if saudi {
                            Image(systemName: "star.fill")
                                .font(.system(size: 12))
                                .foregroundStyle(.white)
                                .padding(4)
                                .background(Circle().fill(AcTheme.gold))
                                .offset(x: 4, y: -4)
                        }
                    }
                Text(LTeam(String(team.id), fallback: team.name))
                    .font(AsianCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .frame(height: 38)
                Text(L("team.profile.eyebrow"))
                    .font(AsianCupFonts.app(size: 10, weight: .semibold))
                    .foregroundStyle(AcTheme.goldDeep)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private var infoCard: some View {
        VStack(spacing: 0) {
            infoRow(icon: "calendar", label: L("match.date"), value: AcFormat.kickoffDay(displayFixture.date))
            divider
            infoRow(icon: "clock", label: L("match.time"), value: AcFormat.kickoffTime(displayFixture.date) + " (\(L("riyadh")))")
            if !displayFixture.venue.name.isEmpty {
                divider
                infoRow(icon: "sportscourt", label: L("match.stadium"), value: displayFixture.venue.name)
            }
            if !displayFixture.venue.city.isEmpty {
                divider
                infoRow(icon: "mappin.and.ellipse", label: L("match.city"), value: displayFixture.venue.city)
            }
            divider
            infoRow(icon: "flag.checkered", label: L("match.status"), value: displayFixture.status.label)
        }
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(AcTheme.cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                        .stroke(AcTheme.outline, lineWidth: 1)
                )
        )
    }

    private func infoRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(AcTheme.gold)
                .frame(width: 22)
            Text(label)
                .font(AsianCupFonts.app(size: 13))
                .foregroundStyle(AcTheme.onDarkDim)
            Spacer()
            Text(value)
                .font(AsianCupFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(AcTheme.onDark)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private var divider: some View {
        Rectangle().fill(AcTheme.outline).frame(height: 1).padding(.horizontal, 14)
    }
}

// MARK: - مكوّنات تفاصيل المباراة المُثراة

// مؤشّر تحميل داخلي خفيف داخل الورقة.
struct AcInlineLoading: View {
    let title: String
    var body: some View {
        HStack(spacing: 10) {
            ProgressView().tint(AcTheme.gold)
            Text(title)
                .font(AsianCupFonts.app(size: 13, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
    }
}

// ترويسة قسم صغيرة داخل البطاقات (أيقونة + عنوان).
struct AcDetailSectionTitle: View {
    let icon: String
    let title: String
    var tint: Color = AcTheme.gold
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(tint)
            Text(title)
                .font(AsianCupFonts.app(size: 14, weight: .bold))
                .foregroundStyle(AcTheme.onDark)
            Spacer(minLength: 0)
        }
    }
}

// غلاف بطاقة موحّد لأقسام التفاصيل.
struct AcDetailCard<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .padding(15)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(AcTheme.cardFill))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

// شارات احتمالات التوقّع (النموذج الداخلي) — ثلاثة أشرطة فوز/تعادل/فوز.
struct AcPredictionBarsCard: View {
    let prediction: AcMatchPrediction
    let home: AcTeam
    let away: AcTeam

    var body: some View {
        AcDetailCard {
            AcDetailSectionTitle(icon: "sparkles", title: L("match.prediction"), tint: AcTheme.azure)
            bar(LTeam(String(home.id), fallback: home.name), prediction.home, AcTheme.emerald)
            bar(L("predictions.draw"), prediction.draw, AcTheme.neutralAccent)
            bar(LTeam(String(away.id), fallback: away.name), prediction.away, AcTheme.emeraldSoft)
            Text(L("match.prediction.note"))
                .font(AsianCupFonts.app(size: 10))
                .foregroundStyle(AcTheme.onDarkFaint)
        }
    }

    private func bar(_ title: String, _ pct: Int, _ tint: Color) -> some View {
        VStack(spacing: 5) {
            HStack {
                Text(title)
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
                Spacer()
                Text("\(pct)%")
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(tint)
                    .monospacedDigit()
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(AcTheme.chipFill)
                    Capsule().fill(tint)
                        .frame(width: proxy.size.width * CGFloat(min(max(Double(pct) / 100, 0), 1)))
                }
            }
            .frame(height: 6)
        }
    }
}

// بطاقة «أفضل لاعب» — تظهر للمباريات المنتهية فقط.
struct AcManOfMatchCard: View {
    let player: AcPlayerRating
    let team: AcTeam?

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(AcTheme.emerald).frame(width: 54, height: 54)
                Image(systemName: "star.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(.white)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(L("match.mom"))
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(AcTheme.goldDeep)
                Text(LName(player.name, player.nameEn))
                    .font(AsianCupFonts.app(size: 17, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.7)
                if let team {
                    Text(LTeam(String(team.id), fallback: team.name))
                        .font(AsianCupFonts.app(size: 11))
                        .foregroundStyle(AcTheme.onDarkDim)
                }
            }
            Spacer(minLength: 0)
            VStack(spacing: 2) {
                Text(String(format: "%.1f", player.rating))
                    .font(AsianCupFonts.app(size: 22, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .monospacedDigit()
                Text(L("match.rating"))
                    .font(AsianCupFonts.app(size: 9))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(AcTheme.gold.opacity(0.14)))
        }
        .padding(15)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(AcTheme.gold.opacity(0.3), lineWidth: 1))
    }
}

// شريط الأحداث الزمني (أهداف/بطاقات/تبديلات) — شعار المنتخب يميّز صاحب الحدث.
struct AcEventsTimelineCard: View {
    let events: [AcMatchEvent]
    let homeId: Int
    let home: AcTeam
    let away: AcTeam

    var body: some View {
        AcDetailCard {
            AcDetailSectionTitle(icon: "clock.fill", title: L("match.events"), tint: AcTheme.gold)
            VStack(spacing: 0) {
                ForEach(Array(events.enumerated()), id: \.offset) { idx, ev in
                    AcEventRow(event: ev, team: ev.teamId == homeId ? home : away)
                    if idx < events.count - 1 {
                        Rectangle().fill(AcTheme.outline).frame(height: 1).padding(.vertical, 2)
                    }
                }
            }
        }
    }
}

private struct AcEventRow: View {
    let event: AcMatchEvent
    let team: AcTeam

    private var minuteText: String {
        if let extra = event.extraMinute, extra > 0 { return "\(event.minute)+\(extra)'" }
        return "\(event.minute)'"
    }

    private var icon: String {
        switch event.type {
        case "goal": return "soccerball"
        case "missed-penalty": return "xmark.circle"
        case "yellow-card": return "rectangle.portrait.fill"
        case "red-card": return "rectangle.portrait.fill"
        case "substitution": return "arrow.left.arrow.right"
        default: return "tv"
        }
    }
    private var iconTint: Color {
        switch event.type {
        case "goal": return AcTheme.emeraldSoft
        case "missed-penalty": return AcTheme.crimson
        case "yellow-card": return AcTheme.gold
        case "red-card": return AcTheme.crimson
        case "substitution": return AcTheme.teal
        default: return AcTheme.azure
        }
    }

    var body: some View {
        HStack(spacing: 11) {
            Text(minuteText)
                .font(AsianCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(AcTheme.onDarkDim)
                .monospacedDigit()
                .frame(width: 38, alignment: .center)
                .environment(\.layoutDirection, .leftToRight)
            Image(systemName: icon)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(iconTint)
                .frame(width: 22, height: 22)
                .background(Circle().fill(iconTint.opacity(0.14)))
            VStack(alignment: .leading, spacing: 2) {
                Text(LName(event.player, event.playerEn))
                    .font(AsianCupFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(AcTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.75)
                Text(secondary)
                    .font(AsianCupFonts.app(size: 10))
                    .foregroundStyle(AcTheme.onDarkFaint)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            AcTeamLogo(logo: team.logo, size: 22)
        }
        .padding(.vertical, 9)
    }

    private var secondary: String {
        if let assist = event.assist, !assist.isEmpty {
            return "\(event.label) • \(L("match.assist")): \(LName(assist, event.assistEn))"
        }
        return event.label
    }
}

// بطاقة الإحصاءات — شريط ثنائي الاتجاه لكل مؤشّر.
struct AcStatisticsCard: View {
    let stats: [AcStatistic]
    let home: AcTeam
    let away: AcTeam

    var body: some View {
        AcDetailCard {
            AcDetailSectionTitle(icon: "chart.bar.fill", title: L("match.stats"), tint: AcTheme.teal)
            HStack {
                AcTeamLogo(logo: home.logo, size: 24)
                Spacer()
                AcTeamLogo(logo: away.logo, size: 24)
            }
            ForEach(Array(stats.enumerated()), id: \.offset) { _, s in
                AcStatRow(stat: s)
            }
        }
    }
}

private struct AcStatRow: View {
    let stat: AcStatistic

    private func num(_ s: String) -> Double {
        Double(s.replacingOccurrences(of: "%", with: "").trimmingCharacters(in: .whitespaces)) ?? 0
    }

    var body: some View {
        let h = num(stat.home), a = num(stat.away)
        let total = max(h + a, 0.0001)
        let hFrac = CGFloat(h / total)
        return VStack(spacing: 5) {
            HStack {
                Text(stat.home)
                    .font(AsianCupFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(AcTheme.onDark).monospacedDigit()
                Spacer()
                Text(stat.label)
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkDim)
                Spacer()
                Text(stat.away)
                    .font(AsianCupFonts.app(size: 12, weight: .bold))
                    .foregroundStyle(AcTheme.onDark).monospacedDigit()
            }
            GeometryReader { proxy in
                HStack(spacing: 3) {
                    HStack { Spacer(minLength: 0)
                        Capsule().fill(AcTheme.gold).frame(width: max(0, (proxy.size.width / 2 - 2) * hFrac))
                    }
                    HStack {
                        Capsule().fill(AcTheme.teal).frame(width: max(0, (proxy.size.width / 2 - 2) * (1 - hFrac)))
                        Spacer(minLength: 0)
                    }
                }
                .environment(\.layoutDirection, .leftToRight)
            }
            .frame(height: 6)
        }
    }
}

// تقييمات اللاعبين — مرتّبة تنازليًّا بالتقييم.
struct AcRatingsCard: View {
    let ratings: [AcPlayerRating]
    let teamFor: (Int) -> AcTeam?

    var body: some View {
        AcDetailCard {
            AcDetailSectionTitle(icon: "star.leadinghalf.filled", title: L("match.ratings"), tint: AcTheme.gold)
            VStack(spacing: 8) {
                ForEach(Array(ratings.prefix(8).enumerated()), id: \.offset) { _, r in
                    AcRatingRow(rating: r, team: teamFor(r.teamId))
                }
            }
        }
    }
}

private struct AcRatingRow: View {
    let rating: AcPlayerRating
    let team: AcTeam?

    private var tint: Color {
        if rating.rating >= 7.5 { return AcTheme.emeraldSoft }
        if rating.rating >= 6.5 { return AcTheme.gold }
        return AcTheme.onDarkFaint
    }

    var body: some View {
        HStack(spacing: 11) {
            Text(String(format: "%.1f", rating.rating))
                .font(AsianCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .monospacedDigit()
                .frame(width: 42, height: 26)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(tint))
            VStack(alignment: .leading, spacing: 2) {
                Text(LName(rating.name, rating.nameEn))
                    .font(AsianCupFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(AcTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.75)
                if !rating.position.isEmpty {
                    Text(rating.position)
                        .font(AsianCupFonts.app(size: 10))
                        .foregroundStyle(AcTheme.onDarkFaint)
                }
            }
            Spacer(minLength: 0)
            if rating.goals > 0 {
                HStack(spacing: 3) {
                    Image(systemName: "soccerball").font(.system(size: 9))
                    Text("\(rating.goals)").monospacedDigit()
                }
                .font(AsianCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(AcTheme.emeraldSoft)
            }
            if let team { AcTeamLogo(logo: team.logo, size: 22) }
        }
    }
}

// التشكيلات — لكل منتخب: الخطة + الأساسيون + البدلاء.
struct AcLineupsCard: View {
    let lineups: [AcLineup]
    let teamFor: (Int) -> AcTeam?

    var body: some View {
        AcDetailCard {
            AcDetailSectionTitle(icon: "person.3.fill", title: L("match.lineups"), tint: AcTheme.emeraldSoft)
            ForEach(Array(lineups.enumerated()), id: \.offset) { idx, lineup in
                AcLineupBlock(lineup: lineup, team: teamFor(lineup.teamId))
                if idx < lineups.count - 1 {
                    Rectangle().fill(AcTheme.outline).frame(height: 1).padding(.vertical, 4)
                }
            }
        }
    }
}

private struct AcLineupBlock: View {
    let lineup: AcLineup
    let team: AcTeam?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let team { AcTeamLogo(logo: team.logo, size: 26) }
                Text(team.map { LTeam(String($0.id), fallback: $0.name) } ?? lineup.teamName)
                    .font(AsianCupFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                Spacer(minLength: 0)
                if let formation = lineup.formation, !formation.isEmpty {
                    Text(formation)
                        .font(AsianCupFonts.app(size: 11, weight: .bold))
                        .foregroundStyle(AcTheme.teal)
                        .monospacedDigit()
                        .padding(.horizontal, 9).padding(.vertical, 4)
                        .background(Capsule().fill(AcTheme.teal.opacity(0.14)))
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
            ForEach(Array(lineup.startXI.enumerated()), id: \.offset) { _, p in
                AcLineupPlayerRow(player: p, starter: true)
            }
            if !lineup.substitutes.isEmpty {
                Text(L("match.subs"))
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkFaint)
                    .padding(.top, 2)
                ForEach(Array(lineup.substitutes.enumerated()), id: \.offset) { _, p in
                    AcLineupPlayerRow(player: p, starter: false)
                }
            }
        }
    }
}

private struct AcLineupPlayerRow: View {
    let player: AcLineupPlayer
    let starter: Bool

    var body: some View {
        HStack(spacing: 10) {
            Text(player.number.map { "\($0)" } ?? "–")
                .font(AsianCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(starter ? AcTheme.onDark : AcTheme.onDarkFaint)
                .monospacedDigit()
                .frame(width: 24, height: 24)
                .background(Circle().fill(AcTheme.chipFill))
            Text(LName(player.name, player.nameEn))
                .font(AsianCupFonts.app(size: 12, weight: starter ? .semibold : .regular))
                .foregroundStyle(starter ? AcTheme.onDark : AcTheme.onDarkDim)
                .lineLimit(1).minimumScaleFactor(0.75)
            Spacer(minLength: 0)
            if let pos = player.position, !pos.isEmpty {
                Text(pos)
                    .font(AsianCupFonts.app(size: 9, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
    }
}

// سجل المواجهات المباشرة.
struct AcHeadToHeadCard: View {
    let fixtures: [AcFixture]

    var body: some View {
        AcDetailCard {
            AcDetailSectionTitle(icon: "arrow.left.arrow.right.circle.fill", title: L("match.h2h"), tint: AcTheme.azure)
            VStack(spacing: 8) {
                ForEach(fixtures.prefix(6)) { f in
                    HStack(spacing: 10) {
                        Text(AcFormat.kickoffDay(f.date))
                            .font(AsianCupFonts.app(size: 10))
                            .foregroundStyle(AcTheme.onDarkFaint)
                            .frame(width: 80, alignment: .leading)
                            .lineLimit(1)
                        AcTeamLogo(logo: f.home.logo, size: 20)
                        Text("\(f.goals.home ?? 0) - \(f.goals.away ?? 0)")
                            .font(AsianCupFonts.app(size: 13, weight: .bold))
                            .foregroundStyle(AcTheme.onDark)
                            .monospacedDigit()
                            .environment(\.layoutDirection, .leftToRight)
                        AcTeamLogo(logo: f.away.logo, size: 20)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }
}
