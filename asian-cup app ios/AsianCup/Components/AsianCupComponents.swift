import SwiftUI

// مكوّنات UI أساسية لكأس آسيا — مُعاد تصميمها من WorldCupComponents لكن بألوان
// AcTheme. كلها تُستعمل عبر الشاشات.

// MARK: - خلفية ونقشة هندسية (مسطّحة رسمية — بلا توهّج ولا ظل)

// نقشة هندسية مائلة خفيفة مستوحاة من زخرفة اللوقو — تُرسم بـ Canvas لأداء عالٍ.
struct AcLatticePattern: View {
    var spacing: CGFloat = 26
    // حبر ديناميكي (داكن على الفاتح، أبيض على الداكن) — الأبيض الثابت كان غير مرئي في الوضع الفاتح.
    var color: Color = AcTheme.onDark
    var body: some View {
        Canvas { ctx, size in
            var path = Path()
            var x: CGFloat = -size.height
            while x < size.width {
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x + size.height, y: size.height))
                x += spacing
            }
            ctx.stroke(path, with: .color(color), lineWidth: 1)
        }
        .allowsHitTesting(false)
    }
}

// خلفية التطبيق — تدرّج مسطّح فقط، بلا أوراب ضبابية.
struct AcAmbientBackground: View {
    var animated: Bool = true

    var body: some View {
        AcTheme.screenGradient
            .ignoresSafeArea()
    }
}

// MARK: - شعار البطولة (مسطّح — بلا هالة ولا ظل)
struct AcEmblem: View {
    var height: CGFloat = 134

    var body: some View {
        Image("Emblem")
            .resizable()
            .scaledToFit()
            .frame(height: height)
    }
}

// شارة هيرو صغيرة (أيقونة + نص داخل كبسولة شفّافة بحدّ ملوّن).
struct AcHeroBadge: View {
    let icon: String
    let text: String
    var tint: Color = AcTheme.emerald

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 11, weight: .semibold))
            Text(text).font(AsianCupFonts.app(size: 12, weight: .semibold))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Capsule().fill(tint.opacity(0.10)))
        .overlay(Capsule().stroke(tint.opacity(0.22), lineWidth: AcTheme.borderWidth))
    }
}

// عنوان «كأس آسيا 2027» بتدرّج ذهبي على «2027» (مطابق لهيرو الويب).
struct AcTournamentTitle: View {
    var body: some View {
        HStack(spacing: 6) {
            Text(L("app.title"))
                .foregroundStyle(AcTheme.onDark)
            Text("2027")
                .foregroundStyle(AcTheme.titleGradient)
        }
        .font(AsianCupFonts.app(size: 24, weight: .bold))
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
                .foregroundStyle(AcTheme.amberDeep)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(Capsule().fill(AcTheme.amber.opacity(0.16)))
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
    var tint: Color = AcTheme.emerald

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(AsianCupFonts.app(size: subtitle == nil ? 14 : 19, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: subtitle == nil ? 28 : 38, height: subtitle == nil ? 28 : 38)
                .background(RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous).fill(tint.opacity(0.14)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AsianCupFonts.headline(size: subtitle == nil ? 16 : 20))
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
                .foregroundStyle(AcTheme.emerald)
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

// بطاقة مباراة أفقية مألوفة ومضغوطة:
//   الجولة                          17:00
//   [شعار] السعودية   VS   فلسطين [شعار]
//   الملعب — المدينة                   ‹
struct AcMatchCard: View {
    let fixture: AcFixture
    var embedded: Bool = false

    private var started: Bool { fixture.status.live || fixture.status.finished }

    var body: some View {
        NavigationLink {
            AcMatchDetailSheet(fixture: fixture)
        } label: {
            cardLabel
        }
        .buttonStyle(AcPressableStyle())
    }

    private var cardLabel: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Text(LRound(fixture.roundEn, fallback: fixture.round))
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
                Spacer(minLength: 4)
                AcStatusPill(fixture: fixture)
            }

            HStack(spacing: 8) {
                teamSide(fixture.home, leading: true)
                centerScore
                teamSide(fixture.away, leading: false)
            }

            if !fixture.venue.name.isEmpty || !fixture.venue.city.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 10, weight: .semibold))
                    Text(venueText)
                        .font(AsianCupFonts.app(size: 11))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.forward")
                        .font(.system(size: 10, weight: .semibold))
                }
                .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background {
            if !embedded {
                RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                    .fill(AcTheme.cardFillStrong)
                    .overlay(
                        RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous)
                            .stroke(AcTheme.outline, lineWidth: AcTheme.borderWidth)
                    )
            }
        }
    }

    private var venueText: String {
        if fixture.venue.name.isEmpty { return fixture.venue.city }
        if fixture.venue.city.isEmpty { return fixture.venue.name }
        return "\(fixture.venue.name) — \(fixture.venue.city)"
    }

    private func teamSide(_ team: AcTeam, leading: Bool) -> some View {
        HStack(spacing: 7) {
            if leading {
                AcTeamLogo(logo: team.logo, size: 28)
                teamName(team, align: .leading)
            } else {
                teamName(team, align: .trailing)
                AcTeamLogo(logo: team.logo, size: 28)
            }
        }
        .frame(maxWidth: .infinity, alignment: leading ? .leading : .trailing)
    }

    private func teamName(_ team: AcTeam, align: TextAlignment) -> some View {
        Text(LTeam(String(team.id), fallback: team.name))
            .font(AsianCupFonts.app(size: 13, weight: .bold))
            .foregroundStyle(AcTheme.onDarkStrong)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .multilineTextAlignment(align)
    }

    private var centerScore: some View {
        Group {
            if started {
                Text("\(fixture.goals.home ?? 0) - \(fixture.goals.away ?? 0)")
                    .font(AsianCupFonts.app(size: 18, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkStrong)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text("VS")
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
        .frame(width: 48)
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
                    if let tv = d.tv, !tv.isEmpty {
                        AcTvCard(channels: tv)
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
        if let updated = detail?.fixture { AcLiveActivityStore.shared.update(updated) }
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
            AcLiveActivityButton(fixture: displayFixture)
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [AcTheme.heroTop, AcTheme.heroBottom],
                        startPoint: .topTrailing, endPoint: .bottomLeading
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                        .stroke(AcTheme.outline, lineWidth: 1)
                )
        )
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
                    .foregroundStyle(AcTheme.amberDeep)
                Text(L("match.riyadhTime"))
                    .font(AsianCupFonts.app(size: 11))
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
                                .background(Circle().fill(AcTheme.amber))
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
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.emeraldInk)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(AcPressableStyle())
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
                .foregroundStyle(AcTheme.emerald)
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
            ProgressView().tint(AcTheme.emerald)
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
    var tint: Color = AcTheme.emerald
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
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFill))
            .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

// شارات احتمالات التوقّع (النموذج الداخلي) — ثلاثة أشرطة فوز/تعادل/فوز.
struct AcPredictionBarsCard: View {
    let prediction: AcMatchPrediction
    let home: AcTeam
    let away: AcTeam

    var body: some View {
        AcDetailCard {
            AcDetailSectionTitle(icon: "sparkles", title: L("match.prediction"), tint: AcTheme.emerald)
            bar(LTeam(String(home.id), fallback: home.name), prediction.home, AcTheme.emerald)
            bar(L("predictions.draw"), prediction.draw, AcTheme.amber)
            bar(LTeam(String(away.id), fallback: away.name), prediction.away, AcTheme.emeraldSoft)
            Text(L("match.prediction.note"))
                .font(AsianCupFonts.app(size: 11))
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

// «أين تشاهد المباراة» — قنوات البث حول العالم (TheSports) — ذهبية للجمهور الأجنبي.
struct AcTvCard: View {
    let channels: [AcTvChannel]

    var body: some View {
        AcDetailCard {
            AcDetailSectionTitle(icon: "tv.fill", title: L("match.tv"))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 2), spacing: 8) {
                ForEach(channels.prefix(12)) { channel in
                    HStack(spacing: 6) {
                        Image(systemName: "antenna.radiowaves.left.and.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(AcTheme.emerald)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(channel.name)
                                .font(AsianCupFonts.app(size: 12, weight: .bold))
                                .foregroundStyle(AcTheme.onDark)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                            if let country = channel.country, !country.isEmpty {
                                Text(country)
                                    .font(AsianCupFonts.app(size: 11))
                                    .foregroundStyle(AcTheme.onDarkFaint)
                                    .lineLimit(1)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(8)
                    .background(RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous).fill(AcTheme.chipFill))
                }
            }
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
                    .foregroundStyle(AcTheme.amberDeep)
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
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.amber.opacity(0.14)))
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous).stroke(AcTheme.amber.opacity(0.3), lineWidth: 1))
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
            AcDetailSectionTitle(icon: "clock.fill", title: L("match.events"))
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
        case "yellow-card": return AcTheme.amber
        case "red-card": return AcTheme.crimson
        case "substitution": return AcTheme.emerald
        default: return AcTheme.emerald
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
                    .font(AsianCupFonts.app(size: 11))
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
            AcDetailSectionTitle(icon: "chart.bar.fill", title: L("match.stats"), tint: AcTheme.emerald)
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
                        Capsule().fill(AcTheme.amber).frame(width: max(0, (proxy.size.width / 2 - 2) * hFrac))
                    }
                    HStack {
                        Capsule().fill(AcTheme.emerald).frame(width: max(0, (proxy.size.width / 2 - 2) * (1 - hFrac)))
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
            AcDetailSectionTitle(icon: "star.leadinghalf.filled", title: L("match.ratings"))
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
        if rating.rating >= 6.5 { return AcTheme.amber }
        return AcTheme.onDarkFaint
    }

    var body: some View {
        HStack(spacing: 11) {
            Text(String(format: "%.1f", rating.rating))
                .font(AsianCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .monospacedDigit()
                .frame(width: 42, height: 26)
                .background(RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous).fill(tint))
            VStack(alignment: .leading, spacing: 2) {
                Text(LName(rating.name, rating.nameEn))
                    .font(AsianCupFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(AcTheme.onDark)
                    .lineLimit(1).minimumScaleFactor(0.75)
                if !rating.position.isEmpty {
                    Text(rating.position)
                        .font(AsianCupFonts.app(size: 11))
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
                        .foregroundStyle(AcTheme.emerald)
                        .monospacedDigit()
                        .padding(.horizontal, 9).padding(.vertical, 4)
                        .background(Capsule().fill(AcTheme.emerald.opacity(0.14)))
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
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkFaint)
            }
        }
    }
}

// MARK: - نظام الإحصاءات الموحّد
// بديل واحد عن ست بلاطات شبه متطابقة كانت متناثرة عبر الشاشات — إيقاع بصري واحد.

/// بلاطة «رقم فوق تسمية» بثلاثة أحجام. اللون الافتراضي حبر قوي؛ يُمرَّر tint دلالي عند الحاجة.
struct AcStatTile: View {
    enum Size {
        case small, medium, large
        var valueSize: CGFloat {
            switch self {
            case .small: return 17
            case .medium: return 20
            case .large: return 23
            }
        }
        var vPad: CGFloat {
            switch self {
            case .small: return 10
            case .medium: return 11
            case .large: return 13
            }
        }
    }

    let value: String
    let label: String
    var tint: Color = AcTheme.onDarkStrong
    var size: Size = .medium

    var body: some View {
        VStack(spacing: 3) {
            Text(value)
                .font(AsianCupFonts.app(size: size.valueSize, weight: .bold))
                .foregroundStyle(tint)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label)
                .font(AsianCupFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, size.vPad)
        .background(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).fill(AcTheme.chipFill))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

/// كبسولة «رقم + تسمية» أفقية مضغوطة — للسجلات الثانوية داخل البطاقات.
struct AcStatPill: View {
    let value: String
    let label: String
    var tint: Color = AcTheme.onDarkStrong

    var body: some View {
        HStack(spacing: 5) {
            Text(value)
                .font(AsianCupFonts.app(size: 13, weight: .bold))
                .foregroundStyle(tint)
                .monospacedDigit()
            Text(label)
                .font(AsianCupFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(AcTheme.onDarkDim)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

/// إحصاء بأيقونة جانبية — لأشرطة الملخّص (مباريات/منتهية/مباشر…).
struct AcIconStat: View {
    let icon: String
    let value: String
    let label: String
    var tint: Color = AcTheme.emerald

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(AsianCupFonts.app(size: 17, weight: .bold))
                    .foregroundStyle(AcTheme.onDark)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(label)
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkFaint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).fill(AcTheme.cardFill))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.tileRadius, style: .continuous).stroke(AcTheme.outline, lineWidth: 1))
    }
}

// MARK: - استجابة الضغط الموحّدة
// كل عنصر قابل للنقر ينكمش ويخفت قليلًا — الإحساس «الأصيل» الذي كان غائبًا مع .plain.
struct AcPressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

// سجل المواجهات المباشرة.
struct AcHeadToHeadCard: View {
    let fixtures: [AcFixture]

    var body: some View {
        AcDetailCard {
            AcDetailSectionTitle(icon: "arrow.left.arrow.right.circle.fill", title: L("match.h2h"), tint: AcTheme.emerald)
            VStack(spacing: 8) {
                ForEach(fixtures.prefix(6)) { f in
                    HStack(spacing: 10) {
                        Text(AcFormat.kickoffDay(f.date))
                            .font(AsianCupFonts.app(size: 11))
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
