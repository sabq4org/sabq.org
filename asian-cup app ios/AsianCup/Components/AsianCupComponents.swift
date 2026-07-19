import SwiftUI
import Charts

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
            Text(LStatus(fixture.status))
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
        guard let e = fixture.status.elapsed else { return LStatus(fixture.status) }
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
        // أصغر من عنوان الصفحة (AcTopBar = 20) حتى لا ينافسه بصريًا.
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(AsianCupFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 28, height: 28)
                .background(RoundedRectangle(cornerRadius: AcTheme.chipRadius, style: .continuous).fill(tint.opacity(0.14)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(AsianCupFonts.headline(size: 15))
                    .foregroundStyle(AcTheme.onDark)
                if let subtitle {
                    Text(subtitle)
                        .font(AsianCupFonts.app(size: 11.5))
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

// بطاقة مباراة أفقية — نمط VARA/الرياضة:
//   الجولة                          الحالة
//   السعودية [شعار]  17:00  [شعار] فلسطين
//   (العلَمان ملاصقان للمنتصف، والاسم نحو الطرف الخارجي)
struct AcMatchCard: View {
    let fixture: AcFixture
    var embedded: Bool = false
    @State private var showDetail = false

    private var started: Bool { fixture.status.live || fixture.status.finished }

    var body: some View {
        Button { showDetail = true } label: {
            cardLabel
        }
        .buttonStyle(AcPressableStyle())
        .sheet(isPresented: $showDetail) {
            NavigationStack {
                AcMatchDetailSheet(fixture: fixture)
            }
            .presentationDetents([.large])
            .asianCupRTL()
        }
    }

    private var cardLabel: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Text(LRound(fixture.roundEn, fallback: fixture.round))
                    .font(AsianCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(AcTheme.onDarkDim)
                    .lineLimit(1)
                Spacer(minLength: 4)
                if started {
                    AcStatusPill(fixture: fixture)
                }
            }

            HStack(spacing: 6) {
                teamSide(fixture.home, home: true)
                centerScore
                teamSide(fixture.away, home: false)
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

    /// نمط VARA: الشعار ملاصق للنتيجة/الوقت في المنتصف، والاسم يمتد للخارج.
    private func teamSide(_ team: AcTeam, home: Bool) -> some View {
        HStack(spacing: 6) {
            if home {
                Spacer(minLength: 4)
                teamName(team, align: .trailing)
                AcTeamLogo(logo: team.logo, size: 34)
            } else {
                AcTeamLogo(logo: team.logo, size: 34)
                teamName(team, align: .leading)
                Spacer(minLength: 4)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func teamName(_ team: AcTeam, align: TextAlignment) -> some View {
        Text(LTeam(String(team.id), fallback: team.name))
            .font(AsianCupFonts.app(size: 12.5, weight: .bold))
            .foregroundStyle(AcTheme.onDarkStrong)
            .lineLimit(1)
            .minimumScaleFactor(0.76)
            .allowsTightening(true)
            .multilineTextAlignment(align)
    }

    private var centerScore: some View {
        Group {
            if started {
                Text("\(fixture.goals.home ?? 0) - \(fixture.goals.away ?? 0)")
                    .font(AsianCupFonts.app(size: 15, weight: .heavy))
                    .foregroundStyle(AcTheme.onDarkStrong)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                Text(AcFormat.kickoffTime(fixture.date))
                    .font(AsianCupFonts.app(size: 13, weight: .heavy))
                    .foregroundStyle(AcTheme.onDarkStrong)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
        .frame(minWidth: 50)
    }
}

// MARK: - ورقة تفاصيل المباراة (sheet — تكافؤ WorldCupMatchCenter)
// تبويبات: تعليق / أحداث (شريط زمني) / زخم / ضغط / تشكيلات 2D / إحصائيات / تقييمات / توقعات.
struct AcMatchDetailSheet: View {
    let fixture: AcFixture
    @Environment(\.dismiss) private var dismiss
    @State private var detail: AcMatchDetail?
    @State private var loading = true
    @State private var commentary: AcCommentary?
    @State private var momentum: AcMomentum?
    @State private var pressure: AcPressure?
    @State private var didPickDefaultTab = false

    enum Tab: String, CaseIterable {
        case commentary, events, momentum, pressure, lineups, stats, ratings, prediction
        var title: String {
            switch self {
            case .commentary: return L("match.tab.commentary")
            case .events: return L("match.tab.events")
            case .momentum: return L("match.tab.momentum")
            case .pressure: return L("match.tab.pressure")
            case .lineups: return L("match.tab.lineups")
            case .stats: return L("match.tab.stats")
            case .ratings: return L("match.tab.ratings")
            case .prediction: return L("match.tab.prediction")
            }
        }
    }
    @State private var tab: Tab = .events

    private var displayFixture: AcFixture { detail?.fixture ?? fixture }
    private var started: Bool { displayFixture.status.live || displayFixture.status.finished }

    private var tabs: [Tab] {
        var t: [Tab] = []
        if started { t.append(.commentary) }
        t.append(.events)
        if started { t.append(contentsOf: [.momentum, .pressure]) }
        t.append(contentsOf: [.lineups, .stats])
        if let d = detail, !d.ratings.isEmpty { t.append(.ratings) }
        t.append(.prediction)
        return t
    }

    private func team(_ id: Int) -> AcTeam? {
        if id == displayFixture.home.id { return displayFixture.home }
        if id == displayFixture.away.id { return displayFixture.away }
        return nil
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                scoreboardHero

                if loading && detail == nil {
                    AcInlineLoading(title: L("match.loading"))
                } else {
                    tabBar
                    tabContent
                }

                infoCard
            }
            .padding(16)
            .padding(.top, 4)
        }
        .background(AcAmbientBackground())
        .navigationTitle(L("match.center.title"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .foregroundStyle(AcTheme.onDark)
                }
            }
        }
        .asianCupRTL()
        .task { await load() }
        .task(id: detail?.fixture.id) {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                if Task.isCancelled { return }
                if displayFixture.status.live { await load(force: true) }
            }
        }
        .refreshable { await load(force: true) }
    }

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(tabs, id: \.self) { t in
                    Button {
                        withAnimation(.easeOut(duration: 0.2)) { tab = t }
                    } label: {
                        Text(t.title)
                            .font(AsianCupFonts.app(size: 13, weight: .bold))
                            .foregroundStyle(tab == t ? .white : AcTheme.onDarkDim)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Capsule().fill(tab == t ? AcTheme.emerald : AcTheme.chipFill))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .onChange(of: tabs) { _, newTabs in
            if !newTabs.contains(tab), let first = newTabs.first { tab = first }
        }
    }

    @ViewBuilder
    private var tabContent: some View {
        switch tab {
        case .commentary:
            commentaryBlock
        case .events:
            if let d = detail, !d.events.isEmpty {
                AcEventsTimelineCard(events: d.events, homeId: displayFixture.home.id,
                                     home: displayFixture.home, away: displayFixture.away)
            } else {
                emptyTab(L("match.empty.events"))
            }
        case .momentum:
            if let m = momentum, m.available, !m.points.isEmpty {
                momentumCard(m)
            } else {
                emptyTab(L("match.empty.momentum"))
            }
        case .pressure:
            if let p = pressure, p.available, !p.points.isEmpty {
                pressureCard(p)
            } else {
                emptyTab(L("match.empty.pressure"))
            }
        case .lineups:
            if let d = detail, !d.lineups.isEmpty {
                AcLineupsCard(lineups: d.lineups, teamFor: team)
            } else {
                emptyTab(L("match.empty.lineups"))
            }
        case .stats:
            VStack(spacing: 12) {
                if let d = detail, !d.statistics.isEmpty {
                    AcStatisticsCard(stats: d.statistics, home: displayFixture.home, away: displayFixture.away)
                } else {
                    emptyTab(L("match.empty.stats"))
                }
                if let tv = detail?.tv, !tv.isEmpty {
                    AcTvCard(channels: tv)
                }
            }
        case .ratings:
            if let d = detail {
                VStack(spacing: 12) {
                    if let mom = d.manOfTheMatch {
                        AcManOfMatchCard(player: mom, team: team(mom.teamId))
                    }
                    if !d.ratings.isEmpty {
                        AcRatingsCard(ratings: d.ratings, teamFor: team)
                    }
                }
            }
        case .prediction:
            if let d = detail {
                if let p = d.prediction {
                    AcPredictionBarsCard(prediction: p, home: displayFixture.home, away: displayFixture.away)
                } else {
                    emptyTab(L("match.empty.prediction"))
                }
                if !d.headToHead.isEmpty {
                    AcHeadToHeadCard(fixtures: d.headToHead)
                } else if d.prediction == nil {
                    EmptyView()
                } else {
                    Text(L("match.h2h.first"))
                        .font(AsianCupFonts.app(size: 12))
                        .foregroundStyle(AcTheme.onDarkDim)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
            }
        }
    }

    private func emptyTab(_ text: String) -> some View {
        Text(text)
            .font(AsianCupFonts.app(size: 13))
            .foregroundStyle(AcTheme.onDarkDim)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 28)
    }

    private var commentaryBlock: some View {
        Group {
            if let items = commentary?.items, !items.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(items) { item in
                        HStack(alignment: .top, spacing: 8) {
                            Text("\(item.minute)'")
                                .font(AsianCupFonts.app(size: 11, weight: .bold))
                                .foregroundStyle(AcTheme.emerald)
                                .monospacedDigit()
                                .frame(width: 28, alignment: .leading)
                            Text(LName(item.textAr, item.textEn))
                                .font(AsianCupFonts.app(size: 13))
                                .foregroundStyle(AcTheme.onDark)
                        }
                        .padding(.vertical, 4)
                    }
                }
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: AcTheme.cardRadius, style: .continuous)
                        .fill(AcTheme.cardFill)
                )
            } else {
                emptyTab(L("match.empty.commentary"))
            }
        }
        .task {
            if commentary == nil {
                commentary = try? await APIClient.shared.fetchAcCommentary(fixture.id)
            }
        }
    }

    private func momentumCard(_ m: AcMomentum) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L("match.momentum.title"))
                .font(AsianCupFonts.app(size: 14, weight: .bold))
                .foregroundStyle(AcTheme.onDark)
            if let p = m.possession {
                HStack {
                    Text("\(p.home)%").font(AsianCupFonts.app(size: 12, weight: .bold)).monospacedDigit()
                    Spacer()
                    Text(L("match.momentum.possession")).font(AsianCupFonts.app(size: 11)).foregroundStyle(AcTheme.onDarkDim)
                    Spacer()
                    Text("\(p.away)%").font(AsianCupFonts.app(size: 12, weight: .bold)).monospacedDigit()
                }
            }
            Text(L("match.momentum.legend", [
                "home": LTeam(String(displayFixture.home.id), fallback: displayFixture.home.name),
                "away": LTeam(String(displayFixture.away.id), fallback: displayFixture.away.name),
            ]))
                .font(AsianCupFonts.app(size: 11))
                .foregroundStyle(AcTheme.onDarkDim)
            Chart(m.points) { pt in
                BarMark(x: .value(L("match.chart.minute"), pt.minute), y: .value(L("match.chart.net"), pt.net))
                    .foregroundStyle(pt.net >= 0 ? AcTheme.emerald : AcTheme.amber)
            }
            .chartYAxis(.hidden)
            .frame(height: 160)
            .environment(\.layoutDirection, .leftToRight)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius).fill(AcTheme.cardFill))
    }

    private func pressureCard(_ p: AcPressure) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L("match.pressure.title"))
                .font(AsianCupFonts.app(size: 14, weight: .bold))
                .foregroundStyle(AcTheme.onDark)
            if let latest = p.latest, latest.side != "even" {
                HStack(spacing: 8) {
                    Image(systemName: "gauge.medium").foregroundStyle(AcTheme.emerald)
                    Text(latest.side == "home"
                          ? LTeam(String(displayFixture.home.id), fallback: displayFixture.home.name)
                          : LTeam(String(displayFixture.away.id), fallback: displayFixture.away.name))
                        .font(AsianCupFonts.app(size: 12, weight: .bold))
                    Text("\(Int(latest.value))")
                        .font(AsianCupFonts.app(size: 12, weight: .bold))
                        .monospacedDigit()
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Capsule().fill(AcTheme.chipFill))
                }
            }
            Chart(p.points) { pt in
                BarMark(x: .value(L("match.chart.minute"), pt.minute), y: .value(L("match.chart.pressure"), pt.net))
                    .foregroundStyle(pt.net >= 0 ? AcTheme.emerald : AcTheme.crimson)
            }
            .chartYAxis(.hidden)
            .frame(height: 160)
            .environment(\.layoutDirection, .leftToRight)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius).fill(AcTheme.cardFill))
    }

    private func load(force: Bool = false) async {
        if !force { loading = true }
        detail = try? await APIClient.shared.fetchAcMatchDetail(fixture.id, ignoreCache: force)
        if let updated = detail?.fixture { AcLiveActivityStore.shared.update(updated) }
        if started {
            async let c = try? APIClient.shared.fetchAcCommentary(fixture.id, ignoreCache: force)
            async let m = try? APIClient.shared.fetchAcMomentum(fixture.id, ignoreCache: force)
            async let p = try? APIClient.shared.fetchAcPressure(fixture.id, ignoreCache: force)
            let (cR, mR, pR) = await (c, m, p)
            commentary = cR
            momentum = mR
            pressure = pR
            if !didPickDefaultTab, displayFixture.status.live {
                tab = .commentary
                didPickDefaultTab = true
            }
        }
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
            infoRow(icon: "flag.checkered", label: L("match.status"), value: LStatus(displayFixture.status))
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

// شريط الأحداث الزمني (أهداف/بطاقات أعلى المحور + سرد عمودي أحدثها بالأعلى) — تكافؤ WC.
struct AcEventsTimelineCard: View {
    let events: [AcMatchEvent]
    let homeId: Int
    let home: AcTeam
    let away: AcTeam

    private let barHeight: CGFloat = 96
    private let axisY: CGFloat = 42
    private let topRowY: CGFloat = 20
    private let bottomRowY: CGFloat = 64
    private let barInset: CGFloat = 16

    private var barEvents: [AcMatchEvent] {
        events.filter { $0.type == "goal" || $0.type == "yellow-card" || $0.type == "red-card" }
    }
    private var maxMinute: Int {
        max(90, events.map { $0.minute + ($0.extraMinute ?? 0) }.max() ?? 90)
    }
    private var sorted: [AcMatchEvent] {
        events.sorted { ($0.minute, $0.extraMinute ?? 0) > ($1.minute, $1.extraMinute ?? 0) }
    }

    private func barX(_ minute: Int, width w: CGFloat) -> CGFloat {
        let f = min(max(CGFloat(minute) / CGFloat(maxMinute), 0), 1)
        let usable = max(w - barInset * 2, 1)
        return barInset + usable * (1 - f)
    }

    var body: some View {
        AcDetailCard {
            AcDetailSectionTitle(icon: "clock.fill", title: L("match.events"))
            if !barEvents.isEmpty {
                horizontalBar
                    .padding(.bottom, 8)
            }
            VStack(spacing: 0) {
                ForEach(Array(sorted.enumerated()), id: \.offset) { idx, ev in
                    AcEventRow(event: ev, team: ev.teamId == homeId ? home : away)
                    if idx < sorted.count - 1 {
                        Rectangle().fill(AcTheme.outline).frame(height: 1).padding(.vertical, 2)
                    }
                }
            }
        }
    }

    private var horizontalBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { geo in
                let w = geo.size.width
                let marks = maxMinute > 95 ? [0, 45, 90, maxMinute] : [0, 45, 90]
                ZStack(alignment: .topLeading) {
                    Rectangle().fill(AcTheme.emerald.opacity(0.22))
                        .frame(width: w - barInset * 2, height: 2)
                        .position(x: w / 2, y: axisY)
                    ForEach(marks, id: \.self) { m in
                        let x = barX(m, width: w)
                        Rectangle().fill(AcTheme.emerald.opacity(0.12))
                            .frame(width: 1, height: barHeight - 22)
                            .position(x: x, y: (barHeight - 22) / 2)
                        Text("\(m)'")
                            .font(AsianCupFonts.app(size: 8))
                            .foregroundStyle(AcTheme.onDarkFaint)
                            .monospacedDigit()
                            .position(x: x, y: barHeight - 6)
                    }
                    ForEach(Array(barEvents.enumerated()), id: \.offset) { _, ev in
                        let isHome = ev.teamId == homeId
                        let x = barX(ev.minute + (ev.extraMinute ?? 0), width: w)
                        VStack(spacing: 1) {
                            if isHome {
                                Text("\(ev.minute)'").font(AsianCupFonts.app(size: 8)).foregroundStyle(AcTheme.onDarkFaint).monospacedDigit()
                                barMarker(ev)
                            } else {
                                barMarker(ev)
                                Text("\(ev.minute)'").font(AsianCupFonts.app(size: 8)).foregroundStyle(AcTheme.onDarkFaint).monospacedDigit()
                            }
                        }
                        .position(x: x, y: isHome ? topRowY : bottomRowY)
                    }
                }
                .frame(width: w, height: barHeight)
                .environment(\.layoutDirection, .leftToRight)
            }
            .frame(height: barHeight)

            HStack {
                HStack(spacing: 4) {
                    Circle().fill(AcTheme.emerald).frame(width: 6, height: 6)
                    Text(LTeam(String(home.id), fallback: home.name))
                        .font(AsianCupFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim).lineLimit(1)
                }
                Spacer()
                HStack(spacing: 4) {
                    Text(LTeam(String(away.id), fallback: away.name))
                        .font(AsianCupFonts.app(size: 10)).foregroundStyle(AcTheme.onDarkDim).lineLimit(1)
                    Circle().fill(AcTheme.amber).frame(width: 6, height: 6)
                }
            }
        }
    }

    @ViewBuilder private func barMarker(_ ev: AcMatchEvent) -> some View {
        switch ev.type {
        case "goal":
            Image(systemName: "soccerball").font(.system(size: 11)).foregroundStyle(AcTheme.emerald)
                .padding(2).background(Circle().fill(.white))
        case "yellow-card":
            RoundedRectangle(cornerRadius: 2).fill(AcTheme.amber).frame(width: 8, height: 12)
        case "red-card":
            RoundedRectangle(cornerRadius: 2).fill(AcTheme.crimson).frame(width: 8, height: 12)
        default:
            EmptyView()
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

// التشكيلات — ملعب 2D + دكة البدلاء (تكافؤ WCPitch).
struct AcLineupsCard: View {
    let lineups: [AcLineup]
    let teamFor: (Int) -> AcTeam?

    var body: some View {
        VStack(spacing: 16) {
            ForEach(Array(lineups.enumerated()), id: \.offset) { _, lineup in
                AcPitchBlock(lineup: lineup, team: teamFor(lineup.teamId))
            }
        }
    }
}

private struct AcPitchBlock: View {
    let lineup: AcLineup
    let team: AcTeam?

    private var rows: [[AcLineupPlayer]] {
        var byRow: [Int: [(col: Int, p: AcLineupPlayer)]] = [:]
        for p in lineup.startXI {
            let parts = (p.grid ?? "0:0").split(separator: ":").map { Int($0) ?? 0 }
            let r = parts.first ?? 0, c = parts.count > 1 ? parts[1] : 0
            byRow[r, default: []].append((c, p))
        }
        return byRow.keys.filter { $0 > 0 }.sorted().map { r in
            byRow[r]!.sorted { $0.col < $1.col }.map { $0.p }
        }
    }

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

            pitch

            if !lineup.coach.isEmpty {
                Text(L("team.coach", ["name": lineup.coach]))
                    .font(AsianCupFonts.app(size: 11))
                    .foregroundStyle(AcTheme.onDarkDim)
            }

            if !lineup.substitutes.isEmpty {
                Text(L("match.subs"))
                    .font(AsianCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(AcTheme.onDarkFaint)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8)], alignment: .leading, spacing: 8) {
                    ForEach(Array(lineup.substitutes.enumerated()), id: \.offset) { _, p in
                        AcLineupPlayerRow(player: p, starter: false)
                    }
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: AcTheme.cardRadius).fill(AcTheme.cardFillStrong))
        .overlay(RoundedRectangle(cornerRadius: AcTheme.cardRadius).stroke(AcTheme.outline, lineWidth: 1))
    }

    private var pitch: some View {
        GeometryReader { geo in
            let r = rows
            ZStack {
                LinearGradient(colors: [AcTheme.emerald.opacity(0.55), AcTheme.emeraldInk.opacity(0.85)],
                               startPoint: .top, endPoint: .bottom)
                RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.25), lineWidth: 1).padding(8)
                Rectangle().fill(.white.opacity(0.2)).frame(height: 1)
                Circle().stroke(.white.opacity(0.25), lineWidth: 1).frame(width: 64, height: 64)

                if r.isEmpty {
                    Text(L("match.lineups"))
                        .font(AsianCupFonts.app(size: 12))
                        .foregroundStyle(.white.opacity(0.8))
                } else {
                    ForEach(Array(r.enumerated()), id: \.offset) { ri, players in
                        let y = geo.size.height * (1 - (CGFloat(ri) + 0.6) / (CGFloat(r.count) + 0.4))
                        HStack(spacing: 0) {
                            ForEach(Array(players.enumerated()), id: \.offset) { _, p in
                                VStack(spacing: 2) {
                                    Text(p.number.map { "\($0)" } ?? "•")
                                        .font(AsianCupFonts.app(size: 11, weight: .bold))
                                        .foregroundStyle(AcTheme.emeraldInk)
                                        .monospacedDigit()
                                        .frame(width: 28, height: 28)
                                        .background(Circle().fill(.white))
                                    Text(LName(p.name, p.nameEn))
                                        .font(AsianCupFonts.app(size: 9))
                                        .foregroundStyle(.white)
                                        .lineLimit(1)
                                        .frame(maxWidth: 56)
                                }
                                .frame(maxWidth: .infinity)
                            }
                        }
                        .environment(\.layoutDirection, .leftToRight)
                        .position(x: geo.size.width / 2, y: y)
                        .frame(width: geo.size.width)
                    }
                }
            }
        }
        .aspectRatio(3.0 / 4.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
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
