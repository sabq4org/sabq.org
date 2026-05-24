import SwiftUI

/// A two-row health card showing today's steps and last night's sleep
/// from HealthKit, with adaptive motivational captions. Placed inside
/// the "رحلتك المعرفية" block on the home screen.
struct KnowledgeJourneyHealthCard: View {

    @ObservedObject private var hk = HealthKitManager.shared

    // Brand accents
    private let stepsAccent = Color(red: 0.18, green: 0.62, blue: 0.42)   // calm green
    private let sleepAccent = Color(red: 0.36, green: 0.42, blue: 0.78)   // indigo

    var body: some View {
        VStack(spacing: 14) {
            metricRow(
                symbol:    "figure.walk.motion",
                tint:      stepsAccent,
                value:     stepsText,
                unit:      "خطوة اليوم",
                hint:      stepsHint
            )

            Rectangle()
                .fill(SabqTheme.outline.opacity(0.35))
                .frame(height: 0.5)
                .padding(.horizontal, 6)

            metricRow(
                symbol:    "moon.stars.fill",
                tint:      sleepAccent,
                value:     sleepText,
                unit:      "ساعات النوم",
                hint:      sleepHint
            )
        }
        .padding(.vertical, 16)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(SabqTheme.surface.opacity(0.55))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.35), lineWidth: 0.5)
        )
        .onAppear { hk.fetchIfNeeded() }
    }

    // MARK: - Sub-views

    private func metricRow(symbol: String, tint: Color, value: String, unit: String, hint: String) -> some View {
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.12))
                Image(systemName: symbol)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(tint)
            }
            .frame(width: 46, height: 46)

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(value)
                        .font(.system(size: 22, weight: .heavy, design: .rounded))
                        .foregroundStyle(SabqTheme.ink)
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
                    Text(unit)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                Text(hint)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk.opacity(0.85))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: - Values

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

    // MARK: - Motivational hints

    private var stepsHint: String {
        guard let s = hk.todaySteps else {
            return "ابدأ يومك بخطوة — جسدك سيشكرك لاحقاً"
        }
        switch s {
        case 0..<1_500:    return "تحرّك قليلاً — كل خطوة تُحتسب لصحتك"
        case 1_500..<4_000: return "بداية لطيفة — جولة قصيرة تنشّط ذهنك"
        case 4_000..<7_000: return "تقدّم جيد — أكمل المسار لتصل الهدف"
        case 7_000..<10_000: return "ممتاز — اقتربت من ١٠٬٠٠٠ خطوة"
        default:            return "أحسنت! تجاوزت هدف اليوم 🎯"
        }
    }

    private var sleepHint: String {
        guard let h = hk.sleepHours, let m = hk.sleepMinutes else {
            return "نوم منتظم يحسّن تركيزك وذاكرتك"
        }
        let total = Double(h) + Double(m) / 60.0
        switch total {
        case ..<5:   return "نوم قصير — حاول تعويضه الليلة بساعتين إضافيتين"
        case 5..<6.5: return "قريب من الكفاية — أضف نصف ساعة لراحة أعمق"
        case 6.5..<9: return "نوم متوازن — حافظ على هذا الإيقاع"
        default:      return "نوم وفير — جسدك أخذ كفايته"
        }
    }

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
