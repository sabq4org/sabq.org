import SwiftUI

// بطاقة توقّع مباراة — عدّادات النتيجة + «توقّع VARA» + نبض الجمهور +
// معاينة البركة (50/30/20) + زرّ الإرسال. تتكيّف مع الحالة: قابلة للتوقّع /
// مُقفلة (بانتظار النتيجة) / مُسوّاة (تعرض النتيجة وطبقتي ونصيبي).
struct SpPredictionMatchCard: View {
    let match: SpPredictableMatch
    /// يُستدعى بعد إرسال ناجح لتحديث القائمة من الخادم.
    var onSubmitted: () async -> Void

    @Environment(SpAuthStore.self) private var auth
    @State private var predHome = 0
    @State private var predAway = 0
    @State private var submitting = false
    @State private var error: String?
    @State private var justSaved = false

    private var f: SpPoolFixture { match.fixture }
    private var settled: Bool { match.settlement?.status == "settled" }
    private var hasMine: Bool { match.myPrediction != nil }
    private var drawNotAllowed: Bool { f.competitionSlug == "world-cup" && predHome == predAway }
    private let drawNotAllowedMessage = "لا يمكن توقع التعادل في خروج المغلوب — اختر فائزًا للمباراة"

    var body: some View {
        VStack(spacing: 11) {
            headerRow
            teamsRow
            if settled {
                settledStrip
            } else if match.locked {
                lockedStrip
            } else if auth.isLoggedIn {
                stepperRow
                submitButton
            } else {
                signInHint
            }
            probabilityBar
            if match.crowd.total > 0 { crowdLine }
            if !settled { poolPreview }
            if let error {
                Text(error).font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.crimson)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.card)
        )
        .onAppear {
            if let mine = match.myPrediction {
                predHome = mine.predHome
                predAway = mine.predAway
            }
        }
    }

    // MARK: - الترويسة (البطولة + الموعد)

    private var headerRow: some View {
        HStack(spacing: 8) {
            if let comp = f.competition, !comp.isEmpty {
                Text(comp)
                    .font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                    .lineLimit(1)
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .background(Capsule().fill(SpTheme.chipFill))
            }
            Spacer(minLength: 0)
            Text(kickoffLabel)
                .font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
        }
    }

    private var kickoffLabel: String {
        if settled { return "انتهت" }
        if match.locked { return "جارية / مقفلة" }
        let iso = ISO8601DateFormatter().string(from: f.kickoff)
        let day = SpFormat.dayMonth(iso)
        let time = SpFormat.kickoffTime(iso)
        return [day, time].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    // MARK: - صفّ الفريقين (RTL: المضيف يمين، الضيف يسار)

    private var teamsRow: some View {
        HStack(spacing: 10) {
            teamBadge(f.home)
            Spacer(minLength: 0)
            centerScore
            Spacer(minLength: 0)
            teamBadge(f.away)
        }
    }

    private func teamBadge(_ t: SpPoolTeamLite) -> some View {
        VStack(spacing: 6) {
            SpTeamLogo(logo: t.logo, size: 42)
            Text(t.name)
                .font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                .lineLimit(1).minimumScaleFactor(0.75).frame(width: 84)
        }
    }

    @ViewBuilder private var centerScore: some View {
        if settled, let fh = match.settlement?.finalHome, let fa = match.settlement?.finalAway {
            VStack(spacing: 2) {
                // اتجاه LTR صريح: يسار=الضيف، يمين=المضيف ليطابق الشعارات في RTL.
                Text("\(fa) - \(fh)")
                    .font(SportsFonts.app(size: 22, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                    .monospacedDigit().environment(\.layoutDirection, .leftToRight)
                Text("النتيجة").font(SportsFonts.app(size: 9)).foregroundStyle(SpTheme.onDarkFaint)
            }
        } else {
            Text("VS").font(SportsFonts.app(size: 14, weight: .bold)).foregroundStyle(SpTheme.onDarkFaint)
        }
    }

    // MARK: - عدّادات التوقّع

    private var stepperRow: some View {
        HStack(alignment: .center, spacing: 12) {
            stepper($predHome)
            Text("-").font(SportsFonts.app(size: 22, weight: .heavy)).foregroundStyle(SpTheme.onDarkFaint)
            stepper($predAway)
        }
    }

    private func stepper(_ value: Binding<Int>) -> some View {
        HStack(spacing: 10) {
            stepButton("minus") { if value.wrappedValue > 0 { value.wrappedValue -= 1 } }
            Text("\(value.wrappedValue)")
                .font(SportsFonts.app(size: 24, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                .frame(minWidth: 28).monospacedDigit()
            stepButton("plus") { if value.wrappedValue < 20 { value.wrappedValue += 1 } }
        }
        .frame(maxWidth: .infinity)
    }

    private func stepButton(_ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold)).foregroundStyle(SpTheme.green)
                .frame(width: 34, height: 34).background(Circle().fill(SpTheme.green.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(icon == "plus" ? "زيادة الأهداف" : "إنقاص الأهداف")
    }

    private var submitButton: some View {
        Button { Task { await submit() } } label: {
            HStack(spacing: 8) {
                if submitting { ProgressView().tint(.white) }
                Text(justSaved ? "تم الحفظ ✓" : (hasMine ? "تعديل التوقّع" : "احفظ توقّعي"))
                    .font(SportsFonts.app(size: 14, weight: .bold))
            }
            .foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 44)
            .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous)
                .fill(justSaved ? SpTheme.leaf : SpTheme.green))
        }
        .buttonStyle(.plain).disabled(submitting)
    }

    private var signInHint: some View {
        Text("سجّل الدخول للتوقّع على هذه المباراة")
            .font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
            .frame(maxWidth: .infinity).padding(.vertical, 6)
    }

    // MARK: - الحالات (مقفلة / مُسوّاة)

    private var lockedStrip: some View {
        HStack(spacing: 8) {
            Image(systemName: "lock.fill").font(.system(size: 12)).foregroundStyle(SpTheme.onDarkDim)
            if let mine = match.myPrediction {
                // عزل الأرقام LRI…PDI كي تُعرض «ضيف - مضيف» بثبات في سياق RTL (نفس عرف scoreBlock).
                Text("توقّعك: ")
                    .font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                + Text(verbatim: "\u{2066}\(mine.predAway) - \(mine.predHome)\u{2069}")
                    .font(SportsFonts.app(size: 13, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                Text("· بانتظار النتيجة").font(SportsFonts.app(size: 11)).foregroundStyle(SpTheme.onDarkFaint)
            } else {
                Text("أُقفل التوقّع — انطلقت المباراة").font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6).padding(.horizontal, 10)
        .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.chipFill))
    }

    @ViewBuilder private var settledStrip: some View {
        if let mine = match.myPrediction {
            let win = mine.pointsAwarded > 0
            HStack(spacing: 8) {
                Text("\(mine.tier.emoji)")
                Text(verbatim: "توقّعك \u{2066}\(mine.predAway)-\(mine.predHome)\u{2069}")
                    .font(SportsFonts.app(size: 12, weight: .semibold)).foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                Text(win ? "+\(mine.pointsAwarded) نقطة" : "لم تُصب")
                    .font(SportsFonts.app(size: 12, weight: .heavy))
                    .foregroundStyle(win ? SpTheme.leaf : SpTheme.onDarkFaint)
            }
            .padding(.vertical, 7).padding(.horizontal, 10)
            .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill((win ? SpTheme.leaf : SpTheme.onDarkFaint).opacity(0.10)))
        } else {
            HStack {
                Text("انتهت المباراة — لم تتوقّع").font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkFaint)
                Spacer(minLength: 0)
            }
            .padding(.vertical, 7).padding(.horizontal, 10)
            .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.chipFill))
        }
    }

    // MARK: - توقّع VARA (RTL: المضيف يمين)

    private var probabilityBar: some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles").font(.system(size: 10, weight: .bold)).foregroundStyle(SpTheme.green)
                Text("توقّع VARA").font(SportsFonts.app(size: 10, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                Spacer(minLength: 0)
            }
            // شريط مكدّس باتجاه RTL: المضيف أولًا (يمين) ثم التعادل ثم الضيف (يسار).
            GeometryReader { geo in
                HStack(spacing: 2) {
                    probSegment(width: geo.size.width, pct: match.probs.home, color: SpTheme.green)
                    probSegment(width: geo.size.width, pct: match.probs.draw, color: SpTheme.onDarkFaint)
                    probSegment(width: geo.size.width, pct: match.probs.away, color: SpTheme.teal)
                }
                .environment(\.layoutDirection, .rightToLeft)
            }
            .frame(height: 8)
            HStack {
                probLabel("\(match.probs.home)٪", "فوز \(f.home.name)", SpTheme.green)
                Spacer(minLength: 0)
                probLabel("\(match.probs.draw)٪", "تعادل", SpTheme.onDarkDim)
                Spacer(minLength: 0)
                probLabel("\(match.probs.away)٪", "فوز \(f.away.name)", SpTheme.teal)
            }
        }
    }

    private func probSegment(width: CGFloat, pct: Int, color: Color) -> some View {
        Capsule().fill(color)
            .frame(width: max(2, width * CGFloat(pct) / 100.0))
    }

    private func probLabel(_ pct: String, _ name: String, _ color: Color) -> some View {
        VStack(spacing: 1) {
            Text(pct).font(SportsFonts.app(size: 12, weight: .heavy)).foregroundStyle(color)
                .environment(\.layoutDirection, .leftToRight)
            Text(name).font(SportsFonts.app(size: 9)).foregroundStyle(SpTheme.onDarkFaint).lineLimit(1)
        }
        .frame(maxWidth: 100)
    }

    // MARK: - نبض الجمهور + معاينة البركة

    private var crowdLine: some View {
        HStack(spacing: 4) {
            Image(systemName: "person.3.fill").font(.system(size: 9)).foregroundStyle(SpTheme.onDarkFaint)
            Text("الجمهور (\(match.crowd.total)): \(match.crowd.home)٪ مضيف · \(match.crowd.draw)٪ تعادل · \(match.crowd.away)٪ ضيف")
                .font(SportsFonts.app(size: 10)).foregroundStyle(SpTheme.onDarkDim).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }
    }

    private var poolPreview: some View {
        VStack(spacing: 9) {
            HStack(spacing: 6) {
                Image(systemName: "banknote").font(.system(size: 11)).foregroundStyle(SpTheme.gold)
                Text("البركة المتاحة")
                    .font(SportsFonts.app(size: 11, weight: .semibold)).foregroundStyle(SpTheme.onDarkDim)
                Spacer(minLength: 0)
                Text("\(match.poolAvailable) نقطة")
                    .font(SportsFonts.app(size: 12, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                    .monospacedDigit().environment(\.layoutDirection, .leftToRight)
            }
            HStack(spacing: 0) {
                tierChip("🎯", SpPoolMath.tierPool(match.poolAvailable, .exact))
                tierDivider
                tierChip("📏", SpPoolMath.tierPool(match.poolAvailable, .margin))
                tierDivider
                tierChip("✅", SpPoolMath.tierPool(match.poolAvailable, .outcome))
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 11)
        .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.chipFill))
    }

    private var tierDivider: some View {
        Rectangle().fill(SpTheme.outline).frame(width: 1, height: 28)
    }

    private func tierChip(_ emoji: String, _ points: Int) -> some View {
        VStack(spacing: 2) {
            Text(emoji).font(.system(size: 14))
            Text("\(points)").font(SportsFonts.app(size: 11.5, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                .monospacedDigit().environment(\.layoutDirection, .leftToRight)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 2)
    }

    // MARK: - الإرسال

    private func submit() async {
        error = nil
        if drawNotAllowed {
            error = drawNotAllowedMessage
            return
        }
        submitting = true
        let body = SpPoolSubmitBody(
            fixtureId: f.id, predHome: predHome, predAway: predAway, kickoffTs: f.timestamp,
            competitionSlug: f.competitionSlug, homeId: f.home.id, awayId: f.away.id,
            homeName: f.home.name, awayName: f.away.name, homeLogo: f.home.logo, awayLogo: f.away.logo
        )
        do {
            let r = try await APIClient.shared.submitPoolPrediction(body)
            if r.success == true {
                justSaved = true
                await onSubmitted()
                try? await Task.sleep(nanoseconds: 1_400_000_000)
                justSaved = false
            } else {
                error = submitErrorMessage(reason: r.reason)
            }
        } catch let e as APIError {
            if case .server(409, let msg) = e { error = msg ?? "أُقفل التوقّع — انطلقت المباراة" }
            else { error = e.errorDescription ?? "تعذّر حفظ التوقّع" }
        } catch {
            self.error = "تعذّر حفظ التوقّع"
        }
        submitting = false
    }

    private func submitErrorMessage(reason: String?) -> String {
        switch reason {
        case "LOCKED": return "أُقفل التوقّع — انطلقت المباراة"
        case "DRAW_NOT_ALLOWED": return drawNotAllowedMessage
        default: return "تعذّر حفظ التوقّع"
        }
    }
}
