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

    // MARK: - Motivational hints (vary by value tier + time of day)

    private enum DayPeriod { case morning, afternoon, evening, night }

    private var period: DayPeriod {
        let h = Calendar.current.component(.hour, from: Date())
        switch h {
        case 5..<12:  return .morning
        case 12..<17: return .afternoon
        case 17..<22: return .evening
        default:      return .night
        }
    }

    private var stepsHint: String {
        guard let s = hk.todaySteps else {
            switch period {
            case .morning:   return "صباح جديد — ابدأ بخطوات تُنشّط يومك"
            case .afternoon: return "منتصف اليوم — جولة قصيرة تكفي للبداية"
            case .evening:   return "أنهِ يومك بمشية هادئة"
            case .night:     return "وقت الراحة — جسدك يستحق النوم"
            }
        }
        let tier: Int
        switch s {
        case 0..<1_500:      tier = 0
        case 1_500..<4_000:  tier = 1
        case 4_000..<7_000:  tier = 2
        case 7_000..<10_000: tier = 3
        default:             tier = 4
        }
        switch (tier, period) {
        case (0, .morning):   return "صباحك بدأ هادئاً — مشية قصيرة تُنشّط جسدك"
        case (0, .afternoon): return "اليوم لم ينتهِ — جولة عشر دقائق تصنع فرقاً"
        case (0, .evening):   return "قبل أن ينتهي يومك — خذ نفساً ومشيةً قصيرة"
        case (0, .night):     return "يوم هادئ — اجعل غداً أكثر حركة"

        case (1, .morning):   return "بداية لطيفة — حافظ على هذا الإيقاع"
        case (1, .afternoon): return "تقدّم جيد — أكمل لتصل لهدف اليوم"
        case (1, .evening):   return "أنهِ مساءك بجولة تكمل بها رصيدك"
        case (1, .night):     return "خطوات لا بأس بها — وقت الاستراحة"

        case (2, .morning):   return "انطلاقة قوية — أنت متقدّم على يومك"
        case (2, .afternoon): return "أداء جيد — استمر بنفس الإيقاع"
        case (2, .evening):   return "يوم نشيط — اقتربت من هدفك"
        case (2, .night):     return "يوم نشيط خلفك — استرح جيداً"

        case (3, .morning):   return "ما شاء الله — اقتربت من هدفك مبكراً"
        case (3, .afternoon): return "ممتاز — خطوات قليلة وتصل ١٠٬٠٠٠"
        case (3, .evening):   return "قريب جداً — جولة أخيرة وتُكمل الهدف"
        case (3, .night):     return "كدت تصل — حقّقه غداً بسهولة"

        case (4, .morning):   return "تجاوزت الهدف قبل الظهر! 🎯"
        case (4, .afternoon): return "أحسنت — تجاوزت هدف اليوم 🎯"
        case (4, .evening):   return "يوم رياضي مميّز — تستحق الراحة"
        case (4, .night):     return "أكثر من ١٠٬٠٠٠ خطوة — يوم استثنائي"
        default: return ""
        }
    }

    private var sleepHint: String {
        guard let h = hk.sleepHours, let m = hk.sleepMinutes else {
            switch period {
            case .morning:   return "نوم منتظم يمنحك طاقة لبدء يومك"
            case .afternoon: return "نوم كافٍ ليلاً يحافظ على تركيزك"
            case .evening:   return "خطّط لنومك الليلة — ٧–٩ ساعات مثالية"
            case .night:     return "اقترب وقت النوم — جهّز نفسك للراحة"
            }
        }
        let total = Double(h) + Double(m) / 60.0
        let tier: Int
        switch total {
        case ..<5:    tier = 0
        case 5..<6.5: tier = 1
        case 6.5..<9: tier = 2
        default:      tier = 3
        }
        switch (tier, period) {
        case (0, .morning):   return "نوم قصير ليلة أمس — اشرب الماء وخفّف من الكافيين"
        case (0, .afternoon): return "قلّة النوم تظهر بعد الظهر — قيلولة ٢٠ دقيقة تساعد"
        case (0, .evening):   return "اقترب من سريرك مبكراً الليلة — جسدك يحتاجها"
        case (0, .night):     return "حان وقت النوم — استرجع ما فاتك الليلة"

        case (1, .morning):   return "قريب من الكفاية — تناول إفطاراً متوازناً"
        case (1, .afternoon): return "ابتعد عن الكافيين بعد الرابعة لنوم أعمق الليلة"
        case (1, .evening):   return "أضف نصف ساعة لنومك الليلة لراحة أعمق"
        case (1, .night):     return "حان وقت النوم — اجعلها ليلة أطول"

        case (2, .morning):   return "نوم متوازن — لديك طاقة جيدة للبدء"
        case (2, .afternoon): return "نومك ليلة أمس جيد — حافظ على روتينك"
        case (2, .evening):   return "نوم منتظم — التزم بنفس وقت النوم الليلة"
        case (2, .night):     return "روتين جيد — حان وقت النوم"

        case (3, .morning):   return "نوم وفير — جسدك مستعد ليوم نشيط"
        case (3, .afternoon): return "نوم وفير ليلة أمس — استغل طاقتك"
        case (3, .evening):   return "نمت كفايتك — لا داعي لإطالة الليلة"
        case (3, .night):     return "نوم وفير سابق — لا تتأخر كثيراً الليلة"
        default: return ""
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
