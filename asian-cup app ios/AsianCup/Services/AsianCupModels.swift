import Foundation

// نماذج بيانات كأس آسيا 2027 — مطابقة لـ DTOs الخادم في asianCupService.ts.
// كلها Decodable عربية الجاهزية (الخادم يعيد الأسماء معرّبة). nonisolated لأن
// SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor.

nonisolated struct AcTeam: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct AcStatus: Decodable, Hashable {
    let code: String
    let label: String
    let elapsed: Int?
    let live: Bool
    let finished: Bool
}

nonisolated struct AcScore: Decodable, Hashable { let home: Int?; let away: Int? }

nonisolated struct AcVenue: Decodable, Hashable { let name: String; let city: String }

nonisolated struct AcFixture: Decodable, Identifiable, Hashable {
    let id: Int
    let date: String
    let timestamp: Int
    let status: AcStatus
    let round: String
    let roundEn: String
    let venue: AcVenue
    let home: AcTeam
    let away: AcTeam
    let goals: AcScore

    var kickoff: Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: date) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: date)
    }

    var involvesSaudi: Bool { home.id == AsianCupConstants.saudiTeamId || away.id == AsianCupConstants.saudiTeamId }
}

nonisolated struct AcStandingRow: Decodable, Identifiable, Hashable {
    let rank: Int
    let team: AcTeam
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let goalsDiff: Int
    let points: Int
    var id: Int { team.id }
}

nonisolated struct AcGroup: Decodable, Identifiable, Hashable {
    let name: String
    let rows: [AcStandingRow]
    var id: String { name }
}

// نظرة عامة — الطبقة الموحّدة للواجهة الرئيسية.
nonisolated struct AcOverview: Decodable, Hashable {
    let startsAt: String?
    let endsAt: String?
    let teamsCount: Int
    let groupsCount: Int
    let host: String
    let venues: [AcVenue]
    let started: Bool
    let saudi: AcSaudi
    let nextMatch: AcFixture?
}

nonisolated struct AcSaudi: Decodable, Hashable {
    let team: AcTeam?
    let group: String?
    let fixtures: [AcFixture]
}

// مغلفات الاستجابة
private nonisolated struct AcTeamsResponse: Decodable { let teams: [AcTeam] }
private nonisolated struct AcFixturesResponse: Decodable { let fixtures: [AcFixture] }
private nonisolated struct AcStandingsResponse: Decodable { let groups: [AcGroup] }

// تجميع المباريات حسب اليوم (لعرض الجدول). نوع مُسمّى (لا tuple) لتجنّب
// «unable to type-check» على محلّل Swift في الـ SwiftUI ForEach.
struct AcDayGroup: Identifiable {
    let key: String
    let label: String
    let items: [AcFixture]
    var id: String { key }
}

// ثوابت البطولة
nonisolated enum AsianCupConstants {
    static let saudiTeamId = 23
    static let tournamentName = "كأس آسيا 2027"
    static let tournamentNameEn = "AFC Asian Cup 2027"
}

// عدّ تنازلي من سلسلة ISO (تصل بإزاحة +03:00).
struct AcCountdown: Equatable {
    let days: Int
    let hours: Int
    let minutes: Int
    let seconds: Int
    let total: Double
    var isFinished: Bool { total <= 0 }
}

enum AcCountdownMath {
    static func to(iso: String?) -> AcCountdown {
        let target = iso.map { AcDateMath.date(from: $0)?.timeIntervalSinceNow ?? 0 } ?? 0
        let total = max(0, target)
        return AcCountdown(
            days: Int(total / 86_400),
            hours: Int((total.truncatingRemainder(dividingBy: 86_400)) / 3_600),
            minutes: Int((total.truncatingRemainder(dividingBy: 3_600)) / 60),
            seconds: Int(total.truncatingRemainder(dividingBy: 60)),
            total: total
        )
    }
}

// مساعد تحويل ISO → Date (يتحمّل إزاحة +03:00 والإزاحات الجزئية).
enum AcDateMath {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoNoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func date(from s: String) -> Date? {
        iso.date(from: s) ?? isoNoFrac.date(from: s)
    }
}

// تنسيق التواريخ بالعربية (بتوقيت الرياض).
enum AcFormat {
    private static let riyadh = TimeZone(identifier: "Asia/Riyadh")!

    static func kickoffDay(_ iso: String?) -> String {
        guard let iso, let d = AcDateMath.date(from: iso) else { return "" }
        let f = DateFormatter()
        f.timeZone = riyadh
        f.locale = Locale(identifier: "ar-SA")
        f.dateFormat = "EEEE d MMMM"
        return f.string(from: d)
    }

    static func kickoffTime(_ iso: String?) -> String {
        guard let iso, let d = AcDateMath.date(from: iso) else { return "" }
        let f = DateFormatter()
        f.timeZone = riyadh
        f.locale = Locale(identifier: "ar-SA")
        f.dateFormat = "HH:mm"
        return f.string(from: d)
    }

    static func dateRange(startIso: String?, endIso: String?) -> String {
        guard let startIso, let s = AcDateMath.date(from: startIso) else { return "" }
        let f = DateFormatter()
        f.timeZone = riyadh
        f.locale = Locale(identifier: "ar-SA")
        f.dateFormat = "d MMMM yyyy"
        let start = f.string(from: s)
        guard let endIso, let e = AcDateMath.date(from: endIso) else { return start }
        let end = f.string(from: e)
        return start == end ? start : "\(start) — \(end)"
    }
}

// نقاط الشبكة — كلها عامة عبر publicAPI (لا مصادقة في النسخة الأولى).
extension APIClient {
    func fetchOverview(ignoreCache: Bool = false) async throws -> AcOverview {
        try await get(AcOverview.self, path: "/asian-cup/overview",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchTeams(ignoreCache: Bool = false) async throws -> [AcTeam] {
        let r = try await get(AcTeamsResponse.self, path: "/asian-cup/teams",
                              ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
        return r.teams
    }

    func fetchFixtures(ignoreCache: Bool = false) async throws -> [AcFixture] {
        let r = try await get(AcFixturesResponse.self, path: "/asian-cup/fixtures",
                              ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
        return r.fixtures
    }

    func fetchStandings(ignoreCache: Bool = false) async throws -> [AcGroup] {
        let r = try await get(AcStandingsResponse.self, path: "/asian-cup/standings",
                              ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
        return r.groups
    }
}
