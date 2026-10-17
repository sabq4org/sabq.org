import SwiftUI

// MARK: - «مواعيدك» — نقل /mawaeed و/services/* من الويب
//
// المصدر `GET /api/mawaeed?region=` و`GET /api/mawaeed/:slug` (عامّان بلا جلسة).
// الخادم يرسل النصوص جاهزة (التاريخ الميلادي والهجري، العدّاد، الحالة)، وهذا
// الملف ينقل منطق الصفحة النقي من shared/mawaeed/{home,dates,display}.ts حرفيًا:
// أقرب موعد، ترتيب السلاسل، العدّاد الحي بتوقيت الرياض، واختصار العناوين.

struct MawaeedRoute: Hashable {}

/// صفحة خدمة واحدة (`/services/*` في الويب). `slug` معرّف السلسلة في `/api/mawaeed/:slug`.
struct MawaeedServiceRoute: Hashable {
    let slug: String
    let title: String
}

nonisolated enum MawaeedKind: String, Decodable, Hashable {
    case schoolHoliday = "school_holiday"
    case salary
    case pension
    case socialSecurity = "social_security"
    case citizenAccount = "citizen_account"
    case other

    init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = MawaeedKind(rawValue: raw) ?? .other
    }

    var symbol: String {
        switch self {
        case .schoolHoliday: "graduationcap"
        case .salary: "building.columns"
        case .pension: "checkmark.shield"
        case .socialSecurity: "heart.circle"
        case .citizenAccount: "house"
        case .other: "calendar"
        }
    }

    /// لون الخدمة للنص والحدود (`--mw-t-*` في mawaeed-page.css)، بدرجتيه.
    var tone: Color {
        switch self {
        case .schoolHoliday: SabqTheme.adaptive(0x086B9E, 0x78C9F0)
        case .salary: SabqTheme.adaptive(0x4338CA, 0xA5B4FC)
        case .citizenAccount: SabqTheme.adaptive(0xBE123C, 0xFDA4AF)
        case .socialSecurity: SabqTheme.adaptive(0xA21CAF, 0xF0ABFC)
        case .pension: SabqTheme.adaptive(0x0E7490, 0x67E8F9)
        case .other: SabqTheme.primary
        }
    }

    /// لون التعبئة الزاهي (`--mw-f-*`) للخلفيات الخفيفة والأيقونات.
    var fill: Color {
        switch self {
        case .schoolHoliday: Color(red: 0x0A / 255, green: 0x8F / 255, blue: 0xD6 / 255)
        case .salary: Color(red: 0x63 / 255, green: 0x66 / 255, blue: 0xF1 / 255)
        case .citizenAccount: Color(red: 0xF4 / 255, green: 0x3F / 255, blue: 0x5E / 255)
        case .socialSecurity: Color(red: 0xD9 / 255, green: 0x46 / 255, blue: 0xEF / 255)
        case .pension: Color(red: 0x06 / 255, green: 0xB6 / 255, blue: 0xD4 / 255)
        case .other: SabqTheme.primary
        }
    }
}

nonisolated struct MawaeedCard: Decodable, Identifiable, Hashable {
    let id: String
    let seriesSlug: String
    let seriesTitle: String
    let kind: MawaeedKind
    let title: String
    let startsOn: String
    let gregorianLabel: String
    let hijriLabel: String
    let countdownText: String
    let todayLabel: String
    let isPast: Bool
    let isOngoing: Bool
    let endLabel: String?
    let pastLabel: String?
    let certainty: String?
    let certaintyLabel: String
    let expectedHint: String?
    let publicNote: String?
    let sourceUrl: String?
    let sourceTitle: String?
    let regionGroup: String?

    private enum CodingKeys: String, CodingKey {
        case id, seriesSlug, seriesTitle, kind, title, startsOn, gregorianLabel, hijriLabel, countdownText,
             todayLabel, isPast, isOngoing, endLabel, pastLabel, certainty, certaintyLabel, expectedHint,
             publicNote, sourceUrl, sourceTitle, regionGroup
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? (try? c.decode(Int.self, forKey: .id)).map(String.init) ?? UUID().uuidString
        seriesSlug = (try? c.decode(String.self, forKey: .seriesSlug)) ?? ""
        seriesTitle = (try? c.decode(String.self, forKey: .seriesTitle)) ?? ""
        kind = (try? c.decode(MawaeedKind.self, forKey: .kind)) ?? .other
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        startsOn = (try? c.decode(String.self, forKey: .startsOn)) ?? ""
        gregorianLabel = (try? c.decode(String.self, forKey: .gregorianLabel)) ?? ""
        hijriLabel = (try? c.decode(String.self, forKey: .hijriLabel)) ?? ""
        countdownText = (try? c.decode(String.self, forKey: .countdownText)) ?? ""
        todayLabel = (try? c.decode(String.self, forKey: .todayLabel)) ?? "اليوم"
        isPast = (try? c.decode(Bool.self, forKey: .isPast)) ?? false
        isOngoing = (try? c.decode(Bool.self, forKey: .isOngoing)) ?? false
        endLabel = Self.nonEmpty(try? c.decode(String.self, forKey: .endLabel))
        pastLabel = Self.nonEmpty(try? c.decode(String.self, forKey: .pastLabel))
        certainty = try? c.decode(String.self, forKey: .certainty)
        certaintyLabel = (try? c.decode(String.self, forKey: .certaintyLabel)) ?? ""
        expectedHint = Self.nonEmpty(try? c.decode(String.self, forKey: .expectedHint))
        publicNote = Self.nonEmpty(try? c.decode(String.self, forKey: .publicNote))
        sourceUrl = Self.nonEmpty(try? c.decode(String.self, forKey: .sourceUrl))
        sourceTitle = Self.nonEmpty(try? c.decode(String.self, forKey: .sourceTitle))
        regionGroup = try? c.decode(String.self, forKey: .regionGroup)
    }

    private static func nonEmpty(_ s: String?) -> String? {
        guard let s, !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return s
    }

    var isExpected: Bool { certainty == "expected" }
    var badgeText: String { isPast ? (pastLabel ?? "انتهى") : certaintyLabel }
}

nonisolated struct MawaeedSeriesBlock: Decodable, Identifiable, Hashable {
    let slug: String
    let title: String
    let kind: MawaeedKind
    let href: String
    let summary: String?
    let next: MawaeedCard?
    let upcoming: [MawaeedCard]
    let answerLine: String

    var id: String { slug }

    private enum CodingKeys: String, CodingKey { case slug, title, kind, href, summary, next, upcoming, answerLine }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        slug = (try? c.decode(String.self, forKey: .slug)) ?? ""
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        kind = (try? c.decode(MawaeedKind.self, forKey: .kind)) ?? .other
        href = (try? c.decode(String.self, forKey: .href)) ?? ""
        summary = try? c.decode(String.self, forKey: .summary)
        next = try? c.decode(MawaeedCard.self, forKey: .next)
        upcoming = (try? c.decode([MawaeedCard].self, forKey: .upcoming)) ?? []
        answerLine = (try? c.decode(String.self, forKey: .answerLine)) ?? ""
    }

    /// معرّف صفحة الخدمة في الويب (`/services/citizen-account-date` ← `citizen-account-date`)
    /// لملف التقويم `/api/service-pages/:id/calendar.ics`.
    var servicePageId: String? {
        let last = href.split(separator: "/").last.map(String.init)
        return href.hasPrefix("/services/") ? last : nil
    }
}

nonisolated struct MawaeedRegion: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
}

nonisolated struct MawaeedFaq: Decodable, Hashable {
    let question: String
    let answer: String
}

nonisolated struct MawaeedSection: Decodable, Hashable {
    let id: String
    let title: String
    let cards: [MawaeedCard]

    private enum CodingKeys: String, CodingKey { case id, title, cards }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        cards = (try? c.decode([MawaeedCard].self, forKey: .cards)) ?? []
    }
}

nonisolated struct MawaeedPageMeta: Decodable, Hashable {
    let title: String?
    let description: String?
    let h1: String?
}

nonisolated struct MawaeedViewPayload: Decodable {
    let dateModifiedLabel: String?
    let region: String
    let regions: [MawaeedRegion]
    let page: MawaeedPageMeta?
    let series: [MawaeedSeriesBlock]
    let sections: [MawaeedSection]
    let faq: [MawaeedFaq]

    private enum CodingKeys: String, CodingKey { case dateModifiedLabel, region, regions, page, series, sections, faq }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        dateModifiedLabel = try? c.decode(String.self, forKey: .dateModifiedLabel)
        region = (try? c.decode(String.self, forKey: .region)) ?? MawaeedPrefs.defaultRegion
        regions = (try? c.decode([MawaeedRegion].self, forKey: .regions)) ?? []
        page = try? c.decode(MawaeedPageMeta.self, forKey: .page)
        series = (try? c.decode([MawaeedSeriesBlock].self, forKey: .series)) ?? []
        sections = (try? c.decode([MawaeedSection].self, forKey: .sections)) ?? []
        faq = (try? c.decode([MawaeedFaq].self, forKey: .faq)) ?? []
    }
}

extension APIClient {
    /// `/api/mawaeed` أو `/api/mawaeed/:slug`، مع المنطقة إن لم تكن الرياض (الافتراضية).
    func fetchMawaeed(slug: String? = nil, region: String) async throws -> MawaeedViewPayload {
        let path = slug.map { "/mawaeed/\($0)" } ?? "/mawaeed"
        let query = region == MawaeedPrefs.defaultRegion ? [:] : ["region": region]
        return try await get(MawaeedViewPayload.self, path: path, query: query, apiRoot: URLConstants.publicAPI)
    }
}

/// المنطقة المختارة للتقويم الدراسي — المفتاح نفسه في الويب (`mawaeed-region`).
nonisolated enum MawaeedPrefs {
    static let defaultRegion = "riyadh"
    static let regionPrefID = "mawaeed-region"

    static var region: String {
        get { UserDefaults.standard.string(forKey: regionPrefID) ?? defaultRegion }
        set { UserDefaults.standard.set(newValue, forKey: regionPrefID) }
    }
}

// MARK: - Logic (shared/mawaeed/home.ts)

nonisolated enum MawaeedLogic {
    /// أقرب موعد قادم عبر كل السلاسل.
    static func nearestCard(_ series: [MawaeedSeriesBlock]) -> MawaeedCard? {
        series.compactMap(\.next).min { $0.startsOn < $1.startsOn }
    }

    static func schoolBlock(_ series: [MawaeedSeriesBlock]) -> MawaeedSeriesBlock? {
        series.first { $0.kind == .schoolHoliday }
    }

    static func schoolRows(_ block: MawaeedSeriesBlock?, limit: Int = 6) -> [MawaeedCard] {
        guard let block else { return [] }
        return Array(block.upcoming.filter { !$0.isPast }.prefix(limit))
    }

    private static func byNextDate(_ a: MawaeedSeriesBlock, _ b: MawaeedSeriesBlock) -> Bool {
        switch (a.next, b.next) {
        case let (x?, y?): return x.startsOn < y.startsOn
        case (.some, nil): return true
        default: return false
        }
    }

    /// شريط اختيار الخدمة: كل السلاسل من الأقرب.
    static func pulseBlocks(_ series: [MawaeedSeriesBlock]) -> [MawaeedSeriesBlock] {
        series.sorted(by: byNextDate)
    }

    /// «مواعيد الصرف الأخرى»: كل السلاسل عدا المدارس وسلسلة البطل.
    static func boardBlocks(_ series: [MawaeedSeriesBlock], hero: MawaeedCard?) -> [MawaeedSeriesBlock] {
        series
            .filter { $0.kind != .schoolHoliday && (hero == nil || $0.slug != hero?.seriesSlug) }
            .sorted(by: byNextDate)
    }

    static func shortTitle(_ block: MawaeedSeriesBlock) -> String {
        switch block.kind {
        case .schoolHoliday: "الإجازة القادمة"
        case .salary: "رواتب الدولة"
        case .pension: "معاشات التقاعد"
        case .socialSecurity: "الضمان المطوّر"
        case .citizenAccount: "حساب المواطن"
        case .other: block.title
        }
    }

    // MARK: display.ts

    private static let gregorianMonths = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
                                          "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]

    /// يحذف الشهر والسنة المطابقين لتاريخ الموعد من آخر العنوان.
    static func compactTitle(_ title: String, startsOn: String) -> String {
        let parts = startsOn.split(separator: "-")
        guard parts.count == 3, let m = Int(parts[1]), (1...12).contains(m) else {
            return title.trimmingCharacters(in: .whitespaces)
        }
        let monthYear = "\(gregorianMonths[m - 1])\\s*\(parts[0])"
        let patterns = ["\\s*\\(\\s*\(monthYear)\\s*\\)\\s*$", "\\s*[—–-]\\s*\(monthYear)\\s*$", "\\s*معاش\\s+\(monthYear)\\s*$"]
        var compact = title
        var removedPeriod = false
        for pattern in patterns where compact.range(of: pattern, options: .regularExpression) != nil {
            compact = compact.replacingOccurrences(of: pattern, with: "", options: .regularExpression)
            removedPeriod = true
            break
        }
        compact = compact
            .replacingOccurrences(of: "\\(\\s*\\)", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\\s{2,}", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s*([,،:؛|])\\s*$", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\\s*[-–—]\\s*$", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        if removedPeriod {
            compact = compact.replacingOccurrences(of: "\\s*[-–—]\\s*معاش$", with: "", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
        }
        return compact.isEmpty ? title.trimmingCharacters(in: .whitespaces) : compact
    }

    /// يبقى اسم الخدمة واضحًا حتى لو كتب المحرر عنوانًا لا يبدأ به.
    static func overviewTitle(_ card: MawaeedCard) -> String {
        let title = compactTitle(card.title, startsOn: card.startsOn)
        let normalize: (String) -> String = {
            $0.replacingOccurrences(of: "[\\u064B-\\u065F\\u0670\\u0640]", with: "", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
        }
        return normalize(title).hasPrefix(normalize(card.seriesTitle)) ? title : "\(card.seriesTitle) — \(title)"
    }

    // MARK: dates.ts (توقيت الرياض)

    private static let riyadh = TimeZone(identifier: "Asia/Riyadh") ?? TimeZone(secondsFromGMT: 3 * 3600)!

    static func riyadhDateISO(_ date: Date) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = riyadh
        let c = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    private static func utcDay(_ iso: String) -> Date? {
        let p = iso.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 0)!
        return cal.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
    }

    static func diffIsoDays(_ from: String, _ to: String) -> Int {
        guard let a = utcDay(from), let b = utcDay(to) else { return 0 }
        return Int((b.timeIntervalSince(a) / 86_400).rounded())
    }

    /// منتصف ليل الرياض ليوم مدني.
    static func riyadhMidnight(_ iso: String) -> Date? {
        utcDay(iso).map { $0.addingTimeInterval(-3 * 3600) }
    }

    static func dayUnitWord(_ n: Int) -> String {
        let rest = abs(n) % 100
        if rest == 0 { return "يوم" }
        if (3...10).contains(rest) { return "أيام" }
        return "يوماً"
    }

    static func daysPhrase(_ days: Int, todayLabel: String) -> String {
        if days <= 0 { return todayLabel }
        if days == 1 { return "بعد يوم واحد" }
        if days == 2 { return "بعد يومين" }
        return "بعد \(days) \(dayUnitWord(days))"
    }

    static func hoursPhrase(_ hours: Int) -> String {
        if hours <= 0 { return "" }
        if hours == 1 { return "وساعة" }
        if hours == 2 { return "وساعتين" }
        if hours <= 10 { return "و\(hours) ساعات" }
        return "و\(hours) ساعة"
    }

    /// العدّاد الحي حتى منتصف ليل بداية الموعد بتوقيت الرياض.
    static func liveText(now: Date, startsOn: String, todayLabel: String) -> String {
        let calendarDays = diffIsoDays(riyadhDateISO(now), startsOn)
        if calendarDays <= 0 { return todayLabel }
        guard let midnight = riyadhMidnight(startsOn) else { return daysPhrase(calendarDays, todayLabel: todayLabel) }
        let totalHours = max(0, Int(midnight.timeIntervalSince(now) / 3600))
        let days = totalHours / 24
        let hours = totalHours % 24
        if days <= 0 {
            var text = hoursPhrase(hours)
            if text.hasPrefix("و") { text = "بعد " + text.dropFirst() }
            if text.isEmpty { text = "بعد أقل من ساعة" }
            return text.hasPrefix("بعد") ? text : "بعد \(text)"
        }
        if hours <= 0 { return daysPhrase(days, todayLabel: todayLabel) }
        let dayPart = daysPhrase(days, todayLabel: todayLabel).replacingOccurrences(of: "بعد ", with: "")
        return "بعد \(dayPart) \(hoursPhrase(hours))"
    }

    /// نص العدّاد: الجاري والمنتهي من الخادم، والقادم محسوب من الساعة.
    static func countdown(_ card: MawaeedCard, now: Date) -> String {
        if card.isPast { return card.pastLabel ?? "انتهى" }
        if card.isOngoing { return card.countdownText }
        return liveText(now: now, startsOn: card.startsOn, todayLabel: card.todayLabel)
    }

    struct ClockParts { let days: Int; let hours: Int; let minutes: Int; let word: String? }

    /// أيام / ساعات / دقائق للبطل، أو نص الحالة عند حلول الموعد.
    static func clockParts(_ card: MawaeedCard, now: Date) -> ClockParts {
        if card.isPast { return ClockParts(days: 0, hours: 0, minutes: 0, word: card.pastLabel ?? "انتهى") }
        if card.isOngoing { return ClockParts(days: 0, hours: 0, minutes: 0, word: card.countdownText) }
        if diffIsoDays(riyadhDateISO(now), card.startsOn) <= 0 {
            return ClockParts(days: 0, hours: 0, minutes: 0, word: card.todayLabel)
        }
        guard let midnight = riyadhMidnight(card.startsOn) else {
            return ClockParts(days: 0, hours: 0, minutes: 0, word: card.countdownText)
        }
        let totalMinutes = max(0, Int(midnight.timeIntervalSince(now) / 60))
        return ClockParts(days: totalMinutes / 1440, hours: (totalMinutes / 60) % 24, minutes: totalMinutes % 60, word: nil)
    }
}
