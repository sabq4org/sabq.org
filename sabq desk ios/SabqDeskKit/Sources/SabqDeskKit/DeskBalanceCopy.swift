import Foundation

/// Arabic copy for «أرصدة النماذج», kept out of the views so it is unit-tested.
/// Latin digits throughout, matching the typography spec.
public enum DeskBalanceCopy {
    public static let knownProviders = ["deepseek", "openai", "anthropic", "gemini", "elevenlabs"]

    public static func isKnownProvider(_ provider: String) -> Bool {
        knownProviders.contains(provider)
    }

    // MARK: Numbers

    /// `$1.85`, `$500` (whole), `¥12.40`, `182.4K حرف`.
    public static func amount(_ value: Double, unit: StaffBalanceUnit, whole: Bool = false) -> String {
        switch unit {
        case .characters:
            return "\(compact(value)) حرف"
        case .usd, .cny, .unknown:
            let symbol = unit == .cny ? "¥" : "$"
            if whole, abs(value - value.rounded()) < 0.005 {
                return "\(symbol)\(Int(value.rounded()))"
            }
            return symbol + String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), value)
        }
    }

    /// `500K`, `182.4K`, `1.3M`.
    public static func compact(_ value: Double) -> String {
        func trim(_ n: Double) -> String {
            let r = (n * 10).rounded() / 10
            return r == r.rounded() ? String(Int(r)) : String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), r)
        }
        let a = abs(value)
        if a >= 1_000_000 { return "\(trim(value / 1_000_000))M" }
        if a >= 1_000 { return "\(trim(value / 1_000))K" }
        return String(Int(value.rounded()))
    }

    /// `يوم واحد` / `يومين` / `4 أيام` / `35 يومًا` / `أقل من يوم`.
    public static func days(_ days: Double) -> String {
        let n = Int(days.rounded())
        if n < 1 { return "أقل من يوم" }
        if n == 1 { return "يوم واحد" }
        if n == 2 { return "يومين" }
        if n <= 10 { return "\(n) أيام" }
        return "\(n) يومًا"
    }

    /// `يكفي نحو 4 أيام`
    public static func lasts(_ daysLeft: Double?) -> String? {
        guard let daysLeft else { return nil }
        return daysLeft < 1 ? "يكفي أقل من يوم" : "يكفي نحو \(days(daysLeft))"
    }

    /// `2 أكتوبر` in Riyadh time.
    public static func dayMonth(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = RiyadhTime.locale
        f.timeZone = RiyadhTime.timeZone
        f.calendar = RiyadhTime.calendar
        f.dateFormat = "d MMMM"
        return f.string(from: date)
    }

    /// `الأحد 25 أكتوبر 2026`
    public static func fullDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = RiyadhTime.locale
        f.timeZone = RiyadhTime.timeZone
        f.calendar = RiyadhTime.calendar
        f.dateFormat = "EEEE d MMMM yyyy"
        return f.string(from: date)
    }

    // MARK: Labels

    public static func kindTitle(_ kind: StaffBalanceKind) -> String {
        switch kind {
        case .actual: return "رصيد فعلي"
        case .estimated: return "رصيد تقديري"
        case .budget: return "ميزانية"
        case .unknown: return "رصيد"
        }
    }

    public static func stateTitle(_ balance: StaffAIBalance) -> String {
        switch balance.effectiveState {
        case .critical: return "حرج"
        case .low: return "منخفض"
        case .healthy: return "جيد"
        case .notConfigured:
            return balance.effectiveKind == .budget ? "لم تُضبط الميزانية بعد" : "لم يُضبط الرصيد بعد"
        case .unavailable:
            return balance.reason == .missingKey ? "المفتاح غير مضبوط" : "تعذّر الجلب"
        case .unknown: return "غير معروف"
        }
    }

    /// The big figure on the row / card; `—` when there is nothing to show.
    public static func amountText(_ balance: StaffAIBalance) -> String {
        guard let value = balance.amount else { return "—" }
        return amount(value, unit: balance.effectiveUnit)
    }

    /// The grey line under the figure, as in the approved list.
    public static func rowDetail(_ balance: StaffAIBalance) -> String {
        let unit = balance.effectiveUnit
        switch balance.effectiveState {
        case .unavailable:
            return balance.reason == .missingKey ? "مفتاح المزوّد غير مضبوط في الخادم" : (balance.error ?? "تعذّر الاتصال بالمزوّد")
        case .notConfigured:
            return balance.effectiveKind == .budget
                ? "ضع ميزانية شهرية لمقارنة الصرف بها"
                : "أدخل آخر شحنة ليُحسب الرصيد التقديري"
        default:
            break
        }
        switch balance.effectiveKind {
        case .estimated:
            var parts: [String] = []
            if let total = balance.total { parts.append("من شحنة \(amount(total, unit: unit, whole: true))") }
            if let today = balance.todaySpend { parts.append("اليوم \(amount(today, unit: balance.spendUnit ?? unit))") }
            return parts.joined(separator: " · ")
        case .budget:
            guard let total = balance.total else { return "" }
            return "صُرف من \(amount(total, unit: unit, whole: true)) هذا الشهر"
        case .actual where unit == .characters:
            var parts: [String] = []
            if let total = balance.total { parts.append("من \(compact(total))") }
            if let resets = balance.resetsAt { parts.append("يتجدد \(dayMonth(resets))") }
            return parts.joined(separator: " · ")
        case .actual, .unknown:
            var parts: [String] = []
            if let low = balance.lowThreshold { parts.append("الحد \(amount(low, unit: unit, whole: true))") }
            if let lasts = lasts(balance.daysLeft) { parts.append(lasts) }
            return parts.joined(separator: " · ")
        }
    }

    /// `نبّهني تحت $100 · حرج تحت $25`
    public static func thresholdLine(_ balance: StaffAIBalance) -> String? {
        guard let t = balance.threshold else { return nil }
        let unit = balance.effectiveUnit
        let what = balance.effectiveKind == .budget ? "حين يقل المتبقي عن" : "تحت"
        return "نبّهني \(what) \(amount(t.low, unit: unit, whole: true)) · حرج تحت \(amount(t.effectiveCritical, unit: unit, whole: true))"
    }

    /// The grey explanation on the detail card.
    public static func estimationNote(_ balance: StaffAIBalance) -> String {
        let name = balance.displayName
        switch balance.effectiveKind {
        case .estimated:
            var text = "تقدير: لا واجهة رصيد لدى \(name). الرقم = الشحنة − الصرف المسجّل منذها"
            if let spent = balance.spentSinceBaseline { text += " (\(amount(spent, unit: .usd)))" }
            text += "."
            switch balance.spendSource {
            case .providerAdminAPI?: text += " الصرف من واجهة التكاليف الرسمية."
            case .sabqTracked?: text += " الصرف من تكاليف سبق المسجّلة."
            default: break
            }
            return text
        case .budget:
            return "الصرف المسجّل في سبق هذا الشهر مقابل ميزانية تضعها أنت."
        case .actual:
            return balance.effectiveUnit == .characters
                ? "رصيد فعلي من واجهة \(name): الأحرف المتبقية في الباقة."
                : "رصيد فعلي من واجهة \(name)."
        case .unknown:
            return ""
        }
    }

    /// The footer under the list.
    public static let kindsFootnote =
        "«فعلي» من واجهة المزوّد. «تقديري» = آخر شحنة أدخلتها − الصرف المسجّل. «ميزانية» = صرف الشهر المسجّل مقابل حدّ تضعه."

    /// `حرج 1 · منخفض 1 · غير مضبوط 1` (zero parts omitted).
    public static func countsLine(_ balances: StaffAIBalances) -> String {
        var parts: [String] = []
        if balances.criticalCount > 0 { parts.append("حرج \(balances.criticalCount)") }
        if balances.lowCount > 0 { parts.append("منخفض \(balances.lowCount)") }
        if balances.notConfiguredCount > 0 { parts.append("غير مضبوط \(balances.notConfiguredCount)") }
        return parts.isEmpty ? "كل الأرصدة فوق حدود التنبيه" : parts.joined(separator: " · ")
    }

    // MARK: Banner

    /// `رصيد DeepSeek حرج: $1.85`
    public static func bannerTitle(_ balance: StaffAIBalance) -> String {
        let figure = balance.measuredAmount.map { amount($0, unit: balance.effectiveUnit) } ?? "—"
        let level = balance.effectiveState == .critical ? "حرج" : "منخفض"
        let noun = balance.effectiveKind == .budget ? "ميزانية" : "رصيد"
        return "\(noun) \(balance.displayName) \(level): \(figure)"
    }

    /// `رصيد فعلي من المزوّد · أقل من ربع حدّك ($20)`
    public static func bannerBody(_ balance: StaffAIBalance) -> String {
        let source: String
        switch balance.effectiveKind {
        case .actual: source = "رصيد فعلي من المزوّد"
        case .estimated: source = "رصيد تقديري"
        case .budget: source = "المتبقي من الميزانية"
        case .unknown: source = "الرصيد"
        }
        let low = balance.lowThreshold.map { amount($0, unit: balance.effectiveUnit, whole: true) } ?? ""
        let where_ = balance.effectiveState == .critical ? "أقل من ربع حدّك (\(low))" : "تحت حدّك (\(low))"
        var text = "\(source) · \(where_)"
        if let lasts = lasts(balance.daysLeft) { text += " · \(lasts)" }
        return text
    }

    /// Changes whenever the provider or level changes, so a dismissed banner
    /// comes back on the next crossing.
    public static func bannerSignature(_ balance: StaffAIBalance) -> String {
        "\(balance.provider):\(balance.effectiveState.rawValue)"
    }

    // MARK: Sheet

    /// The «الرصيد بعد الحفظ» preview.
    public static func balanceAfter(current: Double?, mode: StaffBalanceTopupMode, amount: Double) -> Double {
        switch mode {
        case .add: return (current ?? 0) + amount
        case .set, .budget, .unknown: return amount
        }
    }

    /// Parses `500`, `500.5`, `1,250.00`, `٥٠٠` → Double; nil when invalid or ≤ 0.
    public static func parseAmount(_ raw: String) -> Double? {
        let arabicDigits: [Character: Character] = ["٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
                                                    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "٬": ","]
        let latin = String(raw.map { arabicDigits[$0] ?? $0 })
            .replacingOccurrences(of: ",", with: "")
            .replacingOccurrences(of: "$", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !latin.isEmpty, let value = Double(latin), value.isFinite, value > 0 else { return nil }
        return value
    }
}
