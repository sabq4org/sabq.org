import Foundation

// MARK: - «الاقتصاد الحي» — نماذج نقاط النهاية العامة (نقل الويب #1493–#1506)
//
// المصدر: `/api/economy/snapshot` و`/weekly-story` و`/monthly-story` (بلا مصادقة —
// بيانات رسمية منشورة). كل «لا بيانات» يأتي `null` فيُخفى السطح بصمت — لا
// أصفار ولا لافتة خطأ (القاعدة نفسها في `EconomyNumbersBlock.tsx`).

nonisolated struct EconomySnapshot: Decodable {
    let updatedAt: String?
    let indicators: [EconomyIndicator]
    let fx: [EconomyFxRate]
    let fxAsOf: String?
    let weekly: EconomyWeeklySummary?
    let moneySupply: EconomyMoneySupply?
    let monthly: EconomyMonthlySummary?
    let samaNews: [EconomySamaNews]
    let decision: EconomyDecision?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt)
        indicators = (try? c.decodeIfPresent([EconomyIndicator].self, forKey: .indicators)) ?? []
        fx = (try? c.decodeIfPresent([EconomyFxRate].self, forKey: .fx)) ?? []
        fxAsOf = try? c.decodeIfPresent(String.self, forKey: .fxAsOf)
        weekly = try? c.decodeIfPresent(EconomyWeeklySummary.self, forKey: .weekly)
        moneySupply = try? c.decodeIfPresent(EconomyMoneySupply.self, forKey: .moneySupply)
        monthly = try? c.decodeIfPresent(EconomyMonthlySummary.self, forKey: .monthly)
        samaNews = (try? c.decodeIfPresent([EconomySamaNews].self, forKey: .samaNews)) ?? []
        decision = try? c.decodeIfPresent(EconomyDecision.self, forKey: .decision)
    }

    private enum CodingKeys: String, CodingKey {
        case updatedAt, indicators, fx, fxAsOf, weekly, moneySupply, monthly, samaNews, decision
    }

    /// آخر «بيان» صدر من ساما (لا وقت فحصنا): أكبر تاريخ بين `asOf` المؤشرات
    /// و`fxAsOf` ونهاية أسبوع نقاط البيع — قاعدة الويب (a1f8edd).
    var latestAsOf: String? {
        var dates = indicators.compactMap(\.asOf)
        if let fxAsOf { dates.append(fxAsOf) }
        if let end = weekly?.periodEnd { dates.append(end) }
        return dates.filter { !$0.isEmpty }.sorted().last
    }
}

nonisolated struct EconomyIndicator: Decodable, Identifiable {
    let key: String
    let titleAr: String
    let shortAr: String
    let unit: String
    let cadence: String
    let value: Double
    let valueText: String
    let asOf: String?
    let quarter: String?
    let year: String?
    let previousValue: Double?

    var id: String { key }

    /// ترتيب الشريط في الويب: الأسرع تغيرًا أولًا.
    static let order = ["inflation", "m3Growth", "gdp", "repo", "reverseRepo"]
}

nonisolated struct EconomyFxRate: Decodable, Identifiable {
    let code: String
    let nameAr: String
    let rate: Double
    let prevRate: Double?
    let date: String
    let prevDate: String?
    let changePct: Double?
    let isGcc: Bool

    var id: String { code }

    /// رموز شريط الصفحة (خمسة) بترتيب الويب.
    static let tickerCodes = ["USD", "EUR", "GBP", "EGP", "INR"]
}

nonisolated struct EconomyStoryCard: Decodable, Identifiable {
    let key: String
    let headline: String
    let cardTitle: String
    let figure: String
    let detailAr: String
    let tone: String
    let weight: Double?

    var id: String { key }
}

nonisolated struct EconomyKpi: Decodable, Identifiable {
    let key: String
    let labelAr: String
    let value: Double
    let unitAr: String
    let changePct: Double?
    let noteAr: String?
    let series: [Double]

    var id: String { key }
}

nonisolated struct EconomySectorSummary: Decodable, Identifiable {
    let en: String
    let ar: String
    let value: Double
    let share: Double
    let changePct: Double

    var id: String { en }
}

nonisolated struct EconomyWeeklySummary: Decodable {
    let weekLabelAr: String
    let periodEnd: String
    let totalValue: Double
    let totalChangePct: Double
    let headline: String
    let stories: [EconomyStoryCard]
    let kpis: [EconomyKpi]
    let topSectors: [EconomySectorSummary]
    let totalCount: Double
    let ingestedAt: String?
}

nonisolated struct EconomyMoneySupply: Decodable {
    let asOf: String
    let m3Billion: Double?
    let m3WeeklyChangePct: Double?
    let m3PeriodChangePct: Double?
}

nonisolated struct EconomySeriesPoint: Decodable, Hashable {
    let period: String
    let value: Double
}

nonisolated struct EconomyMonthlyCard: Decodable, Identifiable {
    let key: String
    let cardTitle: String
    let headline: String
    let figure: String
    let detailAr: String
    let tone: String
    let weight: Double?
    let unit: String?
    let seriesLabelAr: String?
    let series: [EconomySeriesPoint]

    var id: String { key }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try c.decode(String.self, forKey: .key)
        cardTitle = (try? c.decode(String.self, forKey: .cardTitle)) ?? ""
        headline = (try? c.decode(String.self, forKey: .headline)) ?? ""
        figure = (try? c.decode(String.self, forKey: .figure)) ?? ""
        detailAr = (try? c.decode(String.self, forKey: .detailAr)) ?? ""
        tone = (try? c.decode(String.self, forKey: .tone)) ?? "neutral"
        weight = try? c.decodeIfPresent(Double.self, forKey: .weight)
        unit = try? c.decodeIfPresent(String.self, forKey: .unit)
        seriesLabelAr = try? c.decodeIfPresent(String.self, forKey: .seriesLabelAr)
        series = (try? c.decodeIfPresent([EconomySeriesPoint].self, forKey: .series)) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case key, cardTitle, headline, figure, detailAr, tone, weight, unit, seriesLabelAr, series
    }
}

nonisolated struct EconomyMonthlySummary: Decodable {
    let month: String
    let monthLabelAr: String
    let headline: String
    let cards: [EconomyMonthlyCard]
    let ingestedAt: String?
}

nonisolated struct EconomySamaNews: Decodable, Identifiable {
    let id: Int?
    let url: String
    let title: String
    let summary: String?
    let publishedAt: String?

    var stableId: String { id.map(String.init) ?? url }
}

nonisolated struct EconomyDecision: Decodable {
    let isDecisionNight: Bool
    let nextDecisionDate: String?
}

// MARK: - تقرير الأسبوع الكامل (`/api/economy/weekly-story`)

nonisolated struct EconomyLead: Decodable {
    let headline: String
    let subheadline: String?
    let intro: String?
}

nonisolated struct EconomySector: Decodable, Identifiable {
    let en: String
    let ar: String
    let value: Double
    let count: Double?
    let changePct: Double?
    let countChangePct: Double?
    let share: Double?
    let isGroup: Bool
    let group: String?
    let series: [Double]

    var id: String { en }
}

nonisolated struct EconomyCity: Decodable, Identifiable {
    let en: String
    let ar: String
    let value: Double
    let count: Double?
    let changePct: Double?
    let share: Double?
    let avgTicket: Double?
    let series: [Double]

    var id: String { en }
}

nonisolated struct EconomyCityShare: Decodable, Identifiable {
    let ar: String
    let share: Double
    var id: String { ar }
}

nonisolated struct EconomyMover: Decodable, Identifiable {
    let ar: String
    let changePct: Double
    var id: String { ar }
}

nonisolated struct EconomyTotals: Decodable {
    let value: Double
    let count: Double
    let series: [Double]
    let countSeries: [Double]
}

nonisolated struct EconomyWeeklyStory: Decodable {
    let weekLabelAr: String
    let weeks: [String]
    let ingestedAt: String?
    let periodStart: String?
    let periodEnd: String?
    let kpis: [EconomyKpi]
    let stories: [EconomyStoryCard]
    let lead: EconomyLead
    let sectors: [EconomySector]
    let cities: [EconomyCity]
    let citiesShareTop: [EconomyCityShare]
    let otherCitiesShare: Double
    let risers: [EconomyMover]
    let fallers: [EconomyMover]
    let totals: EconomyTotals
}

// MARK: - النشرة الشهرية الكاملة (`/api/economy/monthly-story`)

nonisolated struct EconomyTracker: Decodable, Identifiable {
    let key: String
    let titleAr: String
    let unit: String
    let series: [EconomySeriesPoint]
    var id: String { key }
}

nonisolated struct EconomyMonthlyStory: Decodable {
    let month: String
    let monthLabelAr: String
    let cards: [EconomyMonthlyCard]
    let lead: EconomyLead
    let trackers: [EconomyTracker]
    let ingestedAt: String?
}

// MARK: - المنسّقات (نقل `client/src/components/economy/format.ts` حرفيًا)
//
// أرقام غربية كما هو معمول به في سبق. `fmtPct` تعيد القيمة المطلقة — الاتجاه
// يحمله السهم واللون (قناتان للتمييز اللوني).

nonisolated enum EconomyFormat {
    static let freshHours: Double = 48
    static let monthsAr = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
                           "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
    static let monthsShort = ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"]

    private static func formatter(_ maxDigits: Int, minDigits: Int = 0) -> NumberFormatter {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .decimal
        f.usesGroupingSeparator = true
        f.maximumFractionDigits = maxDigits
        f.minimumFractionDigits = minDigits
        return f
    }

    /// `Number(n.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d })` — يسقط الأصفار الزائدة.
    static func trimNum(_ v: Double, _ d: Int) -> String {
        guard v.isFinite else { return "—" }
        let rounded = (v * pow(10, Double(d))).rounded() / pow(10, Double(d))
        return formatter(d).string(from: NSNumber(value: rounded)) ?? "\(rounded)"
    }

    /// ≥ مليار → «x مليار» (منزلتان)؛ ≥ مليون → «x مليون» (منزلة)؛ وإلا عدد صحيح مجمّع.
    static func fmtSar(_ riyals: Double, digits: Int = 2) -> String {
        guard riyals.isFinite else { return "—" }
        let a = abs(riyals)
        if a >= 1e9 { return "\(trimNum(riyals / 1e9, digits)) مليار" }
        if a >= 1e6 { return "\(trimNum(riyals / 1e6, 1)) مليون" }
        return trimNum(riyals.rounded(), 0)
    }

    /// ≥ مليون → «x مليون» (منزلة)؛ ≥ ألف → «x ألف»؛ وإلا عدد صحيح مجمّع.
    static func fmtCount(_ n: Double) -> String {
        guard n.isFinite else { return "—" }
        let a = abs(n)
        if a >= 1e6 { return "\(trimNum(n / 1e6, 1)) مليون" }
        if a >= 1e3 { return "\(trimNum(n / 1e3, 0)) ألف" }
        return trimNum(n.rounded(), 0)
    }

    /// «—» عند الغياب؛ وإلا القيمة المطلقة + «%».
    static func fmtPct(_ p: Double?, _ d: Int = 1) -> String {
        guard let p, p.isFinite else { return "—" }
        return "\(trimNum(abs(p), d))%"
    }

    /// سعر الصرف: ≥100 → منزلتان؛ ≥1 → أربع؛ وإلا خمس.
    static func fmtRate(_ r: Double) -> String {
        guard r.isFinite else { return "—" }
        if r >= 100 { return trimNum(r, 2) }
        if r >= 1 { return formatter(4, minDigits: 2).string(from: NSNumber(value: r)) ?? trimNum(r, 4) }
        return formatter(5, minDigits: 2).string(from: NSNumber(value: r)) ?? trimNum(r, 5)
    }

    /// "2026-08-28" → «28 أغسطس 2026» (أو بلا سنة).
    static func fmtDateAr(_ iso: String?, withYear: Bool = true) -> String {
        guard let parts = ymd(iso) else { return "—" }
        let month = monthsAr[parts.month - 1]
        return withYear ? "\(parts.day) \(month) \(parts.year)" : "\(parts.day) \(month)"
    }

    /// "2026-08-28" → «أغسطس 2026».
    static func fmtMonthAr(_ iso: String?) -> String {
        guard let parts = ymd(iso) else { return "—" }
        return "\(monthsAr[parts.month - 1]) \(parts.year)"
    }

    /// "2026-07" أو "2026-07-31" → «يول»؛ و"2026-Q2" (سلاسل ربعية) → «ر2 26» كما في الويب.
    static func fmtMonthShort(_ period: String) -> String {
        let comps = period.split(separator: "-")
        guard comps.count >= 2 else { return period }
        let second = comps[1].uppercased()
        if second.hasPrefix("Q"), let q = Int(second.dropFirst()), comps[0].count == 4 {
            return "ر\(q) \(comps[0].suffix(2))"
        }
        guard let m = Int(second), (1...12).contains(m) else { return period }
        return monthsShort[m - 1]
    }

    private static func ymd(_ iso: String?) -> (year: Int, month: Int, day: Int)? {
        guard let iso, iso.count >= 10 else { return nil }
        let head = iso.prefix(10).split(separator: "-")
        guard head.count == 3, let y = Int(head[0]), let m = Int(head[1]), let d = Int(head[2]),
              (1...12).contains(m), (1...31).contains(d) else { return nil }
        return (y, m, d)
    }

    /// شارة «جديد» خلال 48 ساعة من إدخال التقرير عندنا (`ingestedAt`) لا من تاريخ ساما.
    static func isFresh(_ iso: String?, hours: Double = freshHours, now: Date = Date()) -> Bool {
        guard let iso, let date = SabqFormatters.parseISO8601(iso) else { return false }
        return now.timeIntervalSince(date) < hours * 3600
    }

    /// سطر المؤشر تحت القيمة: قرار → «منذ {تاريخ}»؛ ربعي → «الربع n · سنة»؛ شهري → «شهر سنة».
    static func indicatorSub(_ i: EconomyIndicator) -> String {
        switch i.cadence {
        case "decision":
            return "منذ \(fmtDateAr(i.asOf, withYear: false))"
        case "quarterly":
            if let q = i.quarter, let y = i.year, !q.isEmpty, !y.isEmpty { return "الربع \(q) · \(y)" }
            return fmtMonthAr(i.asOf)
        default:
            return fmtMonthAr(i.asOf)
        }
    }

    /// قيمة بحسب وحدة بطاقة النشرة الشهرية.
    static func fmtUnit(_ v: Double, unit: String?) -> String {
        switch unit {
        case "sar": return "\(fmtSar(v)) ريال"
        case "count": return v < 1e6 ? trimNum(v.rounded(), 0) : fmtCount(v)
        case "pct": return "\(trimNum(v, 1))%"
        default: return trimNum(v, 1)
        }
    }

    /// أيقونة القطاع (نظير خريطة lucide في الويب).
    static func sectorSymbol(_ en: String) -> String {
        let e = en.lowercased()
        if e.contains("restaurant") || e.contains("caf") { return "fork.knife" }
        if e.contains("food") || e.contains("beverage") { return "basket" }
        if e.contains("apparel") || e.contains("cloth") { return "tshirt" }
        if e.contains("gas") || e.contains("fuel") { return "fuelpump" }
        if e.contains("medical") || e.contains("health") || e.contains("pharma") { return "stethoscope" }
        if e.contains("furniture") { return "sofa" }
        if e.contains("electronic") { return "iphone" }
        if e.contains("professional") || e.contains("business") { return "briefcase" }
        if e.contains("education") { return "graduationcap" }
        if e.contains("hotel") { return "bed.double" }
        if e.contains("airline") || e.contains("travel") { return "airplane" }
        if e.contains("vehicle") || e.contains("car") { return "car" }
        if e.contains("maintenance") || e.contains("repair") { return "wrench" }
        if e.contains("jewel") { return "sparkles" }
        if e.contains("bakery") || e.contains("bakeries") { return "birthday.cake" }
        if e.contains("recreation") || e.contains("entertain") { return "ticket" }
        if e.contains("utilit") { return "bolt" }
        if e.contains("transport") { return "bus" }
        if e.contains("telecom") { return "antenna.radiowaves.left.and.right" }
        if e.contains("construction") || e.contains("building") { return "hammer" }
        return "basket"
    }

    /// وضع بلوك الرئيسية: نشرة شهرية جديدة (< 48 ساعة، ≥ 3 بطاقات) تسبق الأسبوعي؛
    /// وبلا أسبوعي بقطاعات يختفي البلوك كليًا.
    enum HomeMode { case monthly, weekly, hidden }
    static func homeMode(_ s: EconomySnapshot?, now: Date = Date()) -> HomeMode {
        guard let s else { return .hidden }
        if let m = s.monthly, isFresh(m.ingestedAt, now: now), m.cards.count >= 3 { return .monthly }
        if let w = s.weekly, !w.topSectors.isEmpty { return .weekly }
        return .hidden
    }
}
