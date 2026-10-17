import SwiftUI

/// Compact HealthKit strip: today's steps + last night's sleep in one row.
/// Lives inside the "رحلتك المعرفية" block on the home screen.
struct KnowledgeJourneyHealthCard: View {

    @ObservedObject private var hk = HealthKitManager.shared

    private let stepsAccent = SabqTheme.primary
    private let sleepAccent = SabqTheme.primary

    var body: some View {
        Group {
            if hk.hasOptedIn {
                metricsContent
            } else {
                invitationContent
            }
        }
        .padding(.vertical, SabqLayout.space12)
        .padding(.horizontal, SabqLayout.space12)
        .frame(maxWidth: .infinity)
        .sabqBlockSurface()
        .onAppear { hk.fetchIfNeeded() }
    }

    // MARK: - Modes

    /// Side-by-side metrics — one short row instead of two tall stacked cards.
    private var metricsContent: some View {
        HStack(spacing: 0) {
            compactMetric(
                symbol: "figure.walk.motion",
                tint: stepsAccent,
                value: stepsText,
                unit: "خطوة"
            )

            Rectangle()
                .fill(SabqTheme.separator)
                .frame(width: 1, height: 28)

            compactMetric(
                symbol: "moon.stars.fill",
                tint: sleepAccent,
                value: sleepText,
                unit: "نوم"
            )
        }
    }

    private var invitationContent: some View {
        HStack(alignment: .center, spacing: SabqLayout.space12) {
            Image(systemName: "heart.text.square.fill")
                .font(SabqFonts.app(size: 16, weight: .medium))
                .foregroundStyle(sleepAccent)
                .frame(width: 32, height: 32)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.surface)
                )
                .accessibilityHidden(true)

            Text("اربط خطواتك ونومك")
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1)

            Spacer(minLength: 0)

            Button {
                SabqHaptics.medium()
                Task { await hk.requestAccess() }
            } label: {
                Text("تفعيل")
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(SabqTheme.onAction)
                    .padding(.horizontal, SabqLayout.space16)
                    .frame(minHeight: 36)
                    .background(Capsule().fill(SabqTheme.actionFill))
                    .frame(minHeight: SabqLayout.touchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Sub-views

    private func compactMetric(symbol: String, tint: Color, value: String, unit: String) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: symbol)
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(tint)
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.surface)
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 0) {
                Text(value)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .monospacedDigit()
                    .minimumScaleFactor(0.75)
                    .lineLimit(1)
                Text(unit)
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, SabqLayout.space8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Values

    private var stepsText: String {
        guard let steps = hk.todaySteps else { return "—" }
        return arabicFormatted(steps)
    }

    private var sleepText: String {
        guard let h = hk.sleepHours, let m = hk.sleepMinutes else { return "—" }
        if h == 0 { return "\(arabicFormatted(m))د" }
        if m == 0 { return "\(arabicFormatted(h))س" }
        return "\(arabicFormatted(h))س \(arabicFormatted(m))د"
    }

    private func arabicFormatted(_ n: Int) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "ar")
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }
}

#Preview {
    KnowledgeJourneyHealthCard()
        .padding()
        .background(Color(.systemGroupedBackground))
}
