import SwiftUI
import AuthenticationServices

// بطاقة توقّع مباراة — بركة خليجي 27 (50/30/20) + إرسال عبر Bearer.
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

    var body: some View {
        VStack(spacing: 12) {
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
                signInBlock
            }
            poolRow
            if let error {
                Text(error).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.crimson)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: GcTheme.cardRadius, style: .continuous).fill(GcTheme.cardFillStrong))
        .overlay(
            RoundedRectangle(cornerRadius: GcTheme.cardRadius, style: .continuous)
                .stroke(justSaved ? GcTheme.emerald.opacity(0.4) : GcTheme.outline, lineWidth: 1)
        )
        .onAppear {
            if let mine = match.myPrediction {
                predHome = mine.predHome
                predAway = mine.predAway
            }
        }
    }

    private var headerRow: some View {
        HStack {
            Text(match.fixture.round).font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.onDarkDim).lineLimit(1)
            Spacer()
            Text(match.locked ? L("predictions.locked") : GcFormat.kickoffTime(match.fixture.date))
                .font(GulfCupFonts.app(size: 11, weight: .bold))
                .foregroundStyle(match.locked ? GcTheme.crimson : GcTheme.emerald)
        }
    }

    private var teamsRow: some View {
        HStack(spacing: 10) {
            teamBadge(match.fixture.home)
            Spacer(minLength: 0)
            centerScore
            Spacer(minLength: 0)
            teamBadge(match.fixture.away)
        }
    }

    private func teamBadge(_ team: GcTeam) -> some View {
        VStack(spacing: 6) {
            GcTeamLogo(logo: team.logo, size: 40)
            Text(team.name).font(GulfCupFonts.app(size: 11, weight: .semibold)).lineLimit(1).frame(width: 78)
        }
    }

    @ViewBuilder private var centerScore: some View {
        if settled, let fh = match.settlement?.finalHome, let fa = match.settlement?.finalAway {
            Text("\(fa) - \(fh)")
                .font(GulfCupFonts.app(size: 22, weight: .bold))
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
        } else if auth.isLoggedIn && !match.locked {
            Text("\(predHome) - \(predAway)")
                .font(GulfCupFonts.app(size: 20, weight: .bold))
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
        } else {
            Text("VS").font(GulfCupFonts.app(size: 12, weight: .bold)).foregroundStyle(GcTheme.onDarkFaint)
        }
    }

    private var stepperRow: some View {
        HStack(spacing: 16) {
            Stepper("", value: $predHome, in: 0...9).labelsHidden()
            Text("النتيجة").font(GulfCupFonts.app(size: 11)).foregroundStyle(GcTheme.onDarkDim)
            Stepper("", value: $predAway, in: 0...9).labelsHidden()
        }
    }

    private var submitButton: some View {
        Button {
            Task { await submit() }
        } label: {
            Group {
                if submitting {
                    ProgressView().tint(.white)
                } else if justSaved {
                    Label("تم الحفظ", systemImage: "checkmark.circle.fill")
                } else {
                    Text(match.myPrediction == nil ? "إرسال التوقّع" : "تحديث التوقّع")
                }
            }
            .font(GulfCupFonts.app(size: 14, weight: .bold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(RoundedRectangle(cornerRadius: GcTheme.buttonRadius).fill(GcTheme.emerald))
        }
        .disabled(submitting || match.locked)
        .buttonStyle(.plain)
    }

    private var signInBlock: some View {
        GcAppleSignInButton()
    }

    private var lockedStrip: some View {
        Text(L("predictions.locked.note"))
            .font(GulfCupFonts.app(size: 12, weight: .semibold))
            .foregroundStyle(GcTheme.onDarkDim)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 12).fill(GcTheme.chipFill))
    }

    private var settledStrip: some View {
        VStack(spacing: 4) {
            if let mine = match.myPrediction, mine.pointsAwarded ?? 0 > 0 {
                Text("+\(mine.pointsAwarded ?? 0) نقطة")
                    .font(GulfCupFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(GcTheme.goldDeep)
            }
            if let tier = match.myPrediction?.tier, tier != "none" {
                Text(tierLabel(tier))
                    .font(GulfCupFonts.app(size: 11))
                    .foregroundStyle(GcTheme.onDarkDim)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }

    private var poolRow: some View {
        HStack(spacing: 8) {
            meta("\(match.poolAvailable)", L("predictions.meta.pool"))
            meta("\(match.crowd.total)", L("predictions.meta.participant"))
            meta("\(match.predictionsCount)", L("predictions.meta.prediction"))
        }
    }

    private func meta(_ v: String, _ l: String) -> some View {
        VStack(spacing: 2) {
            Text(v).font(GulfCupFonts.app(size: 13, weight: .bold)).monospacedDigit()
            Text(l).font(GulfCupFonts.app(size: 9)).foregroundStyle(GcTheme.onDarkDim)
        }
        .frame(maxWidth: .infinity)
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 10).fill(GcTheme.chipFill))
    }

    private func tierLabel(_ tier: String) -> String {
        switch tier {
        case "exact": return "🎯 النتيجة الدقيقة"
        case "margin": return "📏 الفارق الصحيح"
        case "outcome": return "✅ النتيجة الصحيحة"
        default: return ""
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
