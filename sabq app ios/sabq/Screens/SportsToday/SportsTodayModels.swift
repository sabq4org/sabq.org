import SwiftUI

// MARK: - «مباريات اليوم» وشريط البوابة الرياضية — نقل SportsMatchesBoard.tsx وSportsPortalStrip.tsx
//
// المصدر `/api/sports/today?date=` (كل البطولات بحالة المباشر) و`/api/sports/competitions`.
// منطق عنوان الشريط منقول حرفيًا من client/src/components/sports/sportsPortalHeadline.ts.

struct SportsTodayRoute: Hashable {}

nonisolated struct SpTodayTeam: Decodable, Hashable {
    let id: Int
    let name: String
    let logo: String?
}

nonisolated struct SpTodayStatus: Decodable, Hashable {
    let code: String?
    let label: String?
    let elapsed: Int?
    let extra: Int?
    let live: Bool
    let finished: Bool

    private enum CodingKeys: String, CodingKey { case code, label, elapsed, extra, live, finished }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        code = try? c.decode(String.self, forKey: .code)
        label = try? c.decode(String.self, forKey: .label)
        elapsed = try? c.decode(Int.self, forKey: .elapsed)
        extra = try? c.decode(Int.self, forKey: .extra)
        live = (try? c.decode(Bool.self, forKey: .live)) ?? false
        finished = (try? c.decode(Bool.self, forKey: .finished)) ?? false
    }

    /// «90+3′» أثناء اللعب.
    var minuteText: String? {
        guard let elapsed else { return nil }
        if let extra, extra > 0 { return "\(elapsed)+\(extra)′" }
        return "\(elapsed)′"
    }
}

nonisolated struct SpTodayGoals: Decodable, Hashable {
    let home: Int?
    let away: Int?
}

nonisolated struct SpTodayFixture: Decodable, Identifiable, Hashable {
    let id: Int
    let timestamp: Int
    let status: SpTodayStatus
    let round: String?
    let home: SpTodayTeam
    let away: SpTodayTeam
    let goals: SpTodayGoals?
    let competition: String?
    let competitionSlug: String?

    var started: Bool { status.live || status.finished }
    var kickoff: Date { Date(timeIntervalSince1970: TimeInterval(timestamp)) }
}

nonisolated struct SpTodayPayload: Decodable {
    let configured: Bool?
    let today: [SpTodayFixture]

    private enum CodingKeys: String, CodingKey { case configured, today }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        configured = try? c.decode(Bool.self, forKey: .configured)
        // عنصر تالف واحد لا يُسقط القائمة كلها.
        let raw = (try? c.decode([FailableDecodable<SpTodayFixture>].self, forKey: .today)) ?? []
        today = raw.compactMap(\.value)
    }
}

nonisolated struct FailableDecodable<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

nonisolated struct SpCompetitionInfo: Decodable, Hashable {
    let slug: String
    let name: String
    let category: String?
    let start: String?
    let logo: String?
}

nonisolated struct SpCompetitionsPayload: Decodable {
    let competitions: [SpCompetitionInfo]
}

extension APIClient {
    func fetchSportsToday(date: String? = nil) async throws -> SpTodayPayload {
        try await get(SpTodayPayload.self, path: "/sports/today", query: date.map { ["date": $0] } ?? [:],
                      ignoreCache: true, apiRoot: URLConstants.publicAPI)
    }

    func fetchSportsCompetitions() async throws -> [SpCompetitionInfo] {
        try await get(SpCompetitionsPayload.self, path: "/sports/competitions", apiRoot: URLConstants.publicAPI).competitions
    }
}

/// روابط تطبيق VARA في المتجرين (`VaraAppPromo.tsx`).
nonisolated enum VaraApp {
    static let appStoreURL = URL(string: "https://apps.apple.com/us/app/vara-sports/id6784725221?l=ar")!
}

// MARK: - عنوان الشريط (sportsPortalHeadline.ts)

nonisolated enum SportsHeadline {
    struct Headline: Hashable {
        let live: Bool
        let tail: String
        var match: SpTodayFixture? = nil
        var text: String? = nil
    }

    private static let marqueeSlugs: Set<String> = [
        "world-cup", "club-world-cup", "intercontinental-cup", "afc-champions-league", "asian-cup",
        "champions-league", "europa-league",
        "premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1",
        "gulf-cup", "gulf-club-champions",
    ]
    private static let saudiCountdownSlugs: Set<String> = ["pro-league", "kings-cup", "super-cup"]
    private static var countdownSlugs: Set<String> { saudiCountdownSlugs.union(marqueeSlugs) }

    private static let headlineClubs = [
        "الهلال", "النصر", "الاتحاد", "الاهلي", "الشباب", "القادسيه", "التعاون",
        "الفيحاء", "الاتفاق", "الفتح", "الخليج", "ضمك", "نيوم", "الرياض", "الحزم", "النجمه",
        "ريال مدريد", "برشلونه", "اتلتيكو مدريد", "مانشستر سيتي", "مانشستر يونايتد",
        "ليفربول", "ارسنال", "تشيلسي", "توتنهام", "بايرن", "دورتموند",
        "باريس سان جيرمان", "يوفنتوس", "انتر", "ميلان", "نابولي",
    ]

    static func normalizeName(_ raw: String) -> String {
        raw.replacingOccurrences(of: "[آأإٱ]", with: "ا", options: .regularExpression)
            .replacingOccurrences(of: "ى", with: "ي")
            .replacingOccurrences(of: "ة", with: "ه")
            .replacingOccurrences(of: "[\\u064B-\\u0652\\u0640]", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    private static func isHeadlineClub(_ name: String) -> Bool {
        let n = normalizeName(name)
        return headlineClubs.contains { n.contains($0) }
    }

    static func saudiSlugs(_ competitions: [SpCompetitionInfo]) -> Set<String> {
        Set(competitions.filter { ($0.category ?? "saudi") == "saudi" }.map(\.slug))
    }

    private static func canHeadline(_ f: SpTodayFixture, saudi: Set<String>) -> Bool {
        let slug = f.competitionSlug ?? ""
        guard saudi.contains(slug) || marqueeSlugs.contains(slug) else { return false }
        return saudi.contains(slug) || isHeadlineClub(f.home.name) || isHeadlineClub(f.away.name)
    }

    private static func daysPhrase(_ d: Int) -> String {
        switch d {
        case ...0: "ينطلق اليوم"
        case 1: "ينطلق غدًا"
        case 2: "ينطلق بعد يومين"
        case 3...10: "ينطلق بعد \(d) أيام"
        default: "ينطلق بعد \(d) يومًا"
        }
    }

    private static func daysUntil(_ iso: String, now: Date) -> Int {
        let p = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard p.count == 3, let start = Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) else { return -1 }
        return Int((start.timeIntervalSince(now) / 86_400).rounded(.up))
    }

    static func kickoffText(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar-SA-u-ca-gregory-nu-latn")
        f.timeZone = TimeZone(identifier: "Asia/Riyadh")
        f.dateFormat = "h:mm a"
        return f.string(from: date)
    }

    static func pick(_ today: [SpTodayFixture], competitions: [SpCompetitionInfo], now: Date = .now) -> Headline {
        let saudi = saudiSlugs(competitions)
        let saudiRank: (SpTodayFixture) -> Int = { saudi.contains($0.competitionSlug ?? "") ? 0 : 1 }
        let eligible = today.filter { canHeadline($0, saudi: saudi) }

        if let live = eligible.filter({ $0.status.live })
            .sorted(by: { (saudiRank($0), $0.timestamp) < (saudiRank($1), $1.timestamp) }).first {
            let tail = live.status.elapsed.map { "د\($0) — تابعها لحظة بلحظة" } ?? "تابعها لحظة بلحظة"
            return Headline(live: true, tail: tail, match: live)
        }
        if let upcoming = eligible.filter({ !$0.status.live && !$0.status.finished })
            .sorted(by: { $0.timestamp < $1.timestamp }).first {
            return Headline(live: false, tail: "\(kickoffText(upcoming.kickoff)) — التشكيل المتوقّع والترتيب", match: upcoming)
        }
        let pending = competitions
            .filter { countdownSlugs.contains($0.slug) && $0.start != nil && daysUntil($0.start!, now: now) >= 0 }
            .sorted { ($0.start ?? "") < ($1.start ?? "") }
        if let next = pending.first(where: { saudiCountdownSlugs.contains($0.slug) }) ?? pending.first, let start = next.start {
            return Headline(live: false, tail: "الجدول والترتيب والتوقّعات", text: "\(next.name) \(daysPhrase(daysUntil(start, now: now)))")
        }
        return Headline(live: false, tail: "نتائج مباشرة · ترتيب · توقّعات",
                        text: competitions.isEmpty ? "كل البطولات في مكان واحد" : "\(competitions.count) بطولة في مكان واحد")
    }
}
