import SwiftUI

/// A compact two-column card showing today's steps and last night's sleep
/// from HealthKit, placed inside the "رحلتك المعرفية" block on the home screen.
struct KnowledgeJourneyHealthCard: View {

    @ObservedObject private var hk = HealthKitManager.shared

    var body: some View {
        HStack(spacing: 0) {
            metricColumn(
                symbol:  "figure.walk",
                value:   stepsText,
                label:   "خطوة اليوم"
            )

            Rectangle()
                .fill(SabqTheme.outline.opacity(0.4))
                .frame(width: 0.5)
                .padding(.vertical, 10)

            metricColumn(
                symbol:  "moon.fill",
                value:   sleepText,
                label:   "ساعات النوم"
            )
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(SabqTheme.surface)
                .shadow(color: SabqTheme.shadow, radius: 16, x: 0, y: 6)
                .shadow(color: SabqTheme.deepShadow, radius: 1, x: 0, y: 1)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
        .onAppear { hk.fetchIfNeeded() }
    }

    // MARK: - Sub-views

    private func metricColumn(symbol: String, value: String, label: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 22, weight: .medium))
                .foregroundStyle(SabqTheme.primaryEnd)

            Text(value)
                .font(.system(size: 20, weight: .heavy, design: .rounded))
                .foregroundStyle(SabqTheme.ink)
                .minimumScaleFactor(0.7)
                .lineLimit(1)

            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Formatting

    private var stepsText: String {
        guard let steps = hk.todaySteps else { return "- -" }
        return arabicFormatted(steps)
    }

    private var sleepText: String {
        guard let h = hk.sleepHours, let m = hk.sleepMinutes else { return "- -" }
        if h == 0 { return "\(arabicFormatted(m))د" }
        if m == 0 { return "\(arabicFormatted(h))س" }
        return "\(arabicFormatted(h))س \(arabicFormatted(m))د"
    }

    /// Converts an integer to Eastern Arabic digits with thousands separator.
    private func arabicFormatted(_ n: Int) -> String {
        let formatter = NumberFormatter()
        formatter.locale      = Locale(identifier: "ar")
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }
}

#Preview {
    KnowledgeJourneyHealthCard()
        .padding()
        .background(Color(.systemGroupedBackground))
}
