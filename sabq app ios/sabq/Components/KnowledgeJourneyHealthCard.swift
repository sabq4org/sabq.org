import SwiftUI

/// Compact HealthKit strip: today's steps + last night's sleep in one row.
/// Lives inside the "رحلتك المعرفية" block on the home screen.
struct KnowledgeJourneyHealthCard: View {

    @ObservedObject private var hk = HealthKitManager.shared

    private let stepsAccent = Color(red: 0.18, green: 0.62, blue: 0.42)
    private let sleepAccent = Color(red: 0.36, green: 0.42, blue: 0.78)

    var body: some View {
        Group {
            if hk.hasOptedIn {
                metricsContent
            } else {
                invitationContent
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.background)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
        )
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
                .fill(SabqTheme.outline.opacity(0.4))
                .frame(width: 0.5, height: 28)

            compactMetric(
                symbol: "moon.stars.fill",
                tint: sleepAccent,
                value: sleepText,
                unit: "نوم"
            )
        }
    }

    private var invitationContent: some View {
        HStack(alignment: .center, spacing: 10) {
            Image(systemName: "heart.text.square.fill")
                .font(SabqFonts.app(size: 16, weight: .medium))
                .foregroundStyle(sleepAccent)
                .frame(width: 28, height: 28)
                .background(Circle().fill(sleepAccent.opacity(0.12)))

            Text("اربط خطواتك ونومك")
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(1)

            Spacer(minLength: 0)

            Button {
                SabqHaptics.medium()
                Task { await hk.requestAccess() }
            } label: {
                Text("تفعيل")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(SabqTheme.primaryEnd))
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Sub-views

    private func compactMetric(symbol: String, tint: Color, value: String, unit: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(tint)
                .frame(width: 26, height: 26)
                .background(Circle().fill(tint.opacity(0.12)))

            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
                    .monospacedDigit()
                    .minimumScaleFactor(0.75)
                    .lineLimit(1)
                Text(unit)
                    .font(SabqFonts.app(size: 10, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
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
