import SwiftUI

// بطاقة توقّع مباراة v3 — منتقي نتيجة كبير بأزرار +/− تحت كل منتخب (لا Steppers
// نظامية صغيرة)، وشريط احتمالات النموذج الثلاثي، وتوزيع توقّعات الجمهور، وأرقام
// البركة. بعد التسوية: النتيجة النهائية مقابل توقّعي مع الطبقة والنقاط.
//
// عُرف RTL الحاكم: كل عرض رقمي مثبّت LTR يُكتب «ضيف - مضيف» كي يقع رقم المضيف
// بجوار شعاره (يمين الشاشة). لا تعكس هذا الترتيب.
struct GcPredictionMatchCard: View {
    let match: GcPredictableMatch
    var onSubmitted: () async -> Void

    @Environment(GcAuthStore.self) private var auth
    @State private var predHome = 0
    @State private var predAway = 0
    @State private var submitting = false
    @State private var error: String?
    @State private var justSaved = false

    private var settled: Bool { match.settlement?.status == "settled" }
    private var editable: Bool { !match.locked && !settled && auth.isLoggedIn }

    var body: some View {
        VStack(spacing: 13) {
            headerRow

            if editable {
                pickerRow
            } else {
                staticTeamsRow
            }

            if settled {
                settledStrip
            } else if match.locked {
                lockedStrip
            } else if auth.isLoggedIn {
                submitButton
            } else {
                signInBlock
            }

            if !settled {
                GcProbBar(probs: match.probs, home: match.fixture.home, away: match.fixture.away)
                if match.crowd.total > 0 {
                    GcCrowdBar(crowd: match.crowd)
                }
            }

            poolRow

            if let error {
                Text(error).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.crimson)
            }
        }
        .padding(14)
        .gcCard(stroke: justSaved ? GcTheme.emerald.opacity(0.5) : GcTheme.line)
        .onAppear {
            if let mine = match.myPrediction {
                predHome = mine.predHome
                predAway = mine.predAway
            }
        }
    }

    private var headerRow: some View {
        HStack {
            GcChip(text: match.fixture.round, tint: GcTheme.inkDim)
            Spacer()
            Text(match.locked ? L("predictions.locked") : GcFormat.relativeKickoff(match.fixture.date))
                .font(GulfCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(match.locked ? GcTheme.crimson : GcTheme.emerald)
        }
    }

    // MARK: منتقي النتيجة (وضع التحرير)

    private var pickerRow: some View {
        HStack(alignment: .top, spacing: 8) {
            scoreColumn(team: match.fixture.home, value: $predHome)
            VStack(spacing: 4) {
                Text("\(predAway) - \(predHome)")
                    .font(GulfCupFonts.app(size: 24, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                Text(outcomeHint)
                    .font(GulfCupFonts.app(size: 9.5, weight: .semibold))
                    .foregroundStyle(GcTheme.inkFaint)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 26)
            scoreColumn(team: match.fixture.away, value: $predAway)
        }
    }

    private var outcomeHint: String {
        if predHome > predAway { return "فوز \(match.fixture.home.name)" }
        if predAway > predHome { return "فوز \(match.fixture.away.name)" }
        return L("predictions.draw")
    }

    private func scoreColumn(team: GcTeam, value: Binding<Int>) -> some View {
        VStack(spacing: 8) {
            GcTeamLogo(logo: team.logo, size: 42)
            Text(team.name)
                .font(GulfCupFonts.app(size: 11.5, weight: .semibold))
                .foregroundStyle(GcTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            HStack(spacing: 0) {
                scoreButton("minus") {
                    if value.wrappedValue > 0 { value.wrappedValue -= 1 }
                }
                Text("\(value.wrappedValue)")
                    .font(GulfCupFonts.app(size: 19, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                    .monospacedDigit()
                    .frame(width: 34)
                scoreButton("plus") {
                    if value.wrappedValue < 9 { value.wrappedValue += 1 }
                }
            }
            .background(Capsule().fill(GcTheme.chipFill))
        }
        .frame(width: 108)
    }

    private func scoreButton(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(GcTheme.emerald)
                .frame(width: 34, height: 34)
                .contentShape(Circle())
        }
        .buttonStyle(GcPressStyle())
    }

    // MARK: عرض ثابت (مقفلة / منتهية / غير مسجّل)

    private var staticTeamsRow: some View {
        HStack(spacing: 10) {
            staticTeam(match.fixture.home)
            Spacer(minLength: 0)
            staticCenter
            Spacer(minLength: 0)
            staticTeam(match.fixture.away)
        }
    }

    private func staticTeam(_ team: GcTeam) -> some View {
        VStack(spacing: 6) {
            GcTeamLogo(logo: team.logo, size: 42)
            Text(team.name).font(GulfCupFonts.app(size: 11.5, weight: .semibold)).foregroundStyle(GcTheme.ink).lineLimit(1).frame(width: 82)
        }
    }

    @ViewBuilder private var staticCenter: some View {
        if settled, let fh = match.settlement?.finalHome, let fa = match.settlement?.finalAway {
            VStack(spacing: 3) {
                Text("\(fa) - \(fh)")
                    .font(GulfCupFonts.app(size: 25, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                if let mine = match.myPrediction {
                    Text("توقّعي \(mine.predAway)-\(mine.predHome)")
                        .font(GulfCupFonts.app(size: 10))
                        .foregroundStyle(GcTheme.inkDim)
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                }
            }
        } else if let mine = match.myPrediction {
            VStack(spacing: 3) {
                Text("\(mine.predAway) - \(mine.predHome)")
                    .font(GulfCupFonts.app(size: 23, weight: .bold))
                    .foregroundStyle(GcTheme.emerald)
                    .monospacedDigit()
                    .environment(\.layoutDirection, .leftToRight)
                Text("توقّعي").font(GulfCupFonts.app(size: 10)).foregroundStyle(GcTheme.inkDim)
            }
        } else {
            Text(GcFormat.kickoffTime(match.fixture.date))
                .font(GulfCupFonts.app(size: 17, weight: .bold))
                .foregroundStyle(GcTheme.inkDim)
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
        }
    }

    // MARK: أزرار الحالة

    private var submitButton: some View {
        Button {
            Task { await submit() }
        } label: {
            Group {
                if submitting {
                    ProgressView().tint(.white)
                } else if justSaved {
                    Label(L("predictions.submit.saved"), systemImage: "checkmark.circle.fill")
                } else {
                    Text(match.myPrediction == nil ? L("predictions.submit.new") : L("predictions.submit.update"))
                }
            }
            .font(GulfCupFonts.app(size: 14, weight: .bold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: GcTheme.buttonRadius, style: .continuous).fill(GcTheme.emeraldGradient))
        }
        .disabled(submitting || match.locked)
        .buttonStyle(GcPressStyle())
    }

    private var signInBlock: some View {
        VStack(spacing: 8) {
            Text(L("predictions.signin.note"))
                .font(GulfCupFonts.app(size: 11.5))
                .foregroundStyle(GcTheme.inkDim)
                .multilineTextAlignment(.center)
            GcAppleSignInButton()
        }
    }

    private var lockedStrip: some View {
        HStack(spacing: 6) {
            Image(systemName: "lock.fill").font(.system(size: 11))
            Text(L("predictions.locked.note"))
        }
        .font(GulfCupFonts.app(size: 12, weight: .semibold))
        .foregroundStyle(GcTheme.inkDim)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(GcTheme.chipFill))
    }

    private var settledStrip: some View {
        VStack(spacing: 5) {
            if let mine = match.myPrediction {
                if let pts = mine.pointsAwarded, pts > 0 {
                    HStack(spacing: 6) {
                        Image(systemName: "trophy.fill").font(.system(size: 13)).foregroundStyle(GcTheme.gold)
                        Text("+\(pts) نقطة")
                            .font(GulfCupFonts.app(size: 16, weight: .bold))
                            .foregroundStyle(GcTheme.goldDeep)
                            .monospacedDigit()
                    }
                }
                if let tier = mine.tier {
                    Text(tierLabel(tier))
                        .font(GulfCupFonts.app(size: 11.5, weight: .semibold))
                        .foregroundStyle(tier == "none" ? GcTheme.inkFaint : GcTheme.inkDim)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(GcTheme.gold.opacity((match.myPrediction?.pointsAwarded ?? 0) > 0 ? 0.08 : 0)))
    }

    private var poolRow: some View {
        HStack(spacing: 8) {
            meta("\(match.poolAvailable)", L("predictions.meta.pool"), "gift.fill", GcTheme.goldDeep)
            meta("\(match.crowd.total)", L("predictions.meta.participant"), "person.2.fill", GcTheme.emerald)
            meta("\(match.predictionsCount)", L("predictions.meta.prediction"), "sparkles", GcTheme.teal)
        }
    }

    private func meta(_ v: String, _ l: String, _ icon: String, _ tint: Color) -> some View {
        VStack(spacing: 3) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 9)).foregroundStyle(tint)
                Text(v).font(GulfCupFonts.app(size: 13, weight: .bold)).foregroundStyle(GcTheme.ink).monospacedDigit()
            }
            Text(l).font(GulfCupFonts.app(size: 9)).foregroundStyle(GcTheme.inkFaint)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(GcTheme.chipFill.opacity(0.7)))
    }

    private func tierLabel(_ tier: String) -> String {
        switch tier {
        case "exact": return L("predictions.tier.exact")
        case "margin": return L("predictions.tier.margin")
        case "outcome": return L("predictions.tier.outcome")
        default: return L("predictions.tier.none")
        }
    }

    private func submit() async {
        submitting = true
        error = nil
        do {
            _ = try await APIClient.shared.submitGcPrediction(
                fixtureId: match.fixture.id,
                predHome: predHome,
                predAway: predAway
            )
            justSaved = true
            await onSubmitted()
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            justSaved = false
        } catch let e as APIError {
            error = e.errorDescription
        } catch _ {
            error = "تعذّر حفظ التوقّع"
        }
        submitting = false
    }
}

// MARK: - شريط احتمالات النموذج (فوز المضيف / تعادل / فوز الضيف)

struct GcProbBar: View {
    let probs: GcModelProbs
    let home: GcTeam
    let away: GcTeam

    private var pHome: Int { Int((probs.home * 100).rounded()) }
    private var pDraw: Int { Int((probs.draw * 100).rounded()) }
    private var pAway: Int { max(0, 100 - pHome - pDraw) }

    var body: some View {
        VStack(spacing: 5) {
            HStack {
                Text(L("predictions.probs.title")).font(GulfCupFonts.app(size: 10, weight: .bold)).foregroundStyle(GcTheme.inkFaint)
                Spacer()
            }
            GeometryReader { geo in
                HStack(spacing: 2) {
                    // RTL: المضيف يبدأ من اليمين تلقائيًّا
                    segment(width: geo.size.width * probs.home, color: GcTheme.emerald)
                    segment(width: geo.size.width * probs.draw, color: GcTheme.inkFaint.opacity(0.4))
                    segment(width: geo.size.width * probs.away, color: GcTheme.teal)
                }
            }
            .frame(height: 7)
            HStack {
                probLabel("\(home.name) \(pHome)%", GcTheme.emerald)
                Spacer()
                probLabel("\(L("predictions.draw")) \(pDraw)%", GcTheme.inkDim)
                Spacer()
                probLabel("\(away.name) \(pAway)%", GcTheme.teal)
            }
        }
    }

    private func segment(width: CGFloat, color: Color) -> some View {
        Capsule().fill(color).frame(width: max(width - 2, 3))
    }

    private func probLabel(_ text: String, _ color: Color) -> some View {
        Text(text).font(GulfCupFonts.app(size: 9.5, weight: .semibold)).foregroundStyle(color).lineLimit(1)
    }
}

// MARK: - توزيع توقّعات الجمهور

struct GcCrowdBar: View {
    let crowd: GcPredictionCrowd

    var body: some View {
        let total = max(crowd.total, 1)
        VStack(spacing: 5) {
            HStack {
                Text(L("predictions.crowd.title")).font(GulfCupFonts.app(size: 10, weight: .bold)).foregroundStyle(GcTheme.inkFaint)
                Spacer()
                Text("\(crowd.total) \(L("predictions.meta.participant"))")
                    .font(GulfCupFonts.app(size: 9.5)).foregroundStyle(GcTheme.inkFaint)
            }
            GeometryReader { geo in
                HStack(spacing: 2) {
                    Capsule().fill(GcTheme.gold)
                        .frame(width: max(geo.size.width * CGFloat(crowd.home) / CGFloat(total) - 2, 3))
                    Capsule().fill(GcTheme.inkFaint.opacity(0.4))
                        .frame(width: max(geo.size.width * CGFloat(crowd.draw) / CGFloat(total) - 2, 3))
                    Capsule().fill(GcTheme.amber.opacity(0.8))
                        .frame(width: max(geo.size.width * CGFloat(crowd.away) / CGFloat(total) - 2, 3))
                }
            }
            .frame(height: 7)
        }
    }
}
