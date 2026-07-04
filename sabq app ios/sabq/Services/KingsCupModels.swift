import Foundation
import SwiftUI

// MARK: - كأس خادم الحرمين الشريفين (Kings Cup) — DTOs
//
// مرآة لما ترسله نقاط /api/kings-cup/* (مُعرَّبة من الخادم عبر saudiLeagueService،
// بطولة إقصائية للأندية السعودية — API-Football league 504). الـ JSON يصل
// بصيغة camelCase نظيفة، والـ decoder المشترك في APIClient عادي بلا
// keyDecodingStrategy، فالأسماء هنا تطابق المفاتيح حرفيًا. الحقول التي قد
// تكون null في الخادم optional هنا. البنية أبسط من كأس العالم: لا مجموعات ولا
// ترتيب (بطولة إقصائية بالكامل)، ولا معطيات SportMonks المتقدّمة.

nonisolated struct KcTeam: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
    let winner: Bool?
}

nonisolated struct KcStatus: Decodable, Hashable {
    let code: String
    let label: String
    let elapsed: Int?
    let extra: Int?
    let live: Bool
    let finished: Bool
}

nonisolated struct KcScore: Decodable, Hashable {
    let home: Int?
    let away: Int?
}

nonisolated struct KcVenue: Decodable, Hashable {
    let name: String
    let city: String
}

nonisolated struct KcFixture: Decodable, Identifiable, Hashable {
    let id: Int
    let date: String
    let timestamp: Int
    let status: KcStatus
    let round: String
    let venue: KcVenue
    let home: KcTeam
    let away: KcTeam
    let goals: KcScore
    let penalties: KcScore?

    var started: Bool { status.live || status.finished }
    var kickoff: Date? { SabqFormatters.parseISO8601(date) }

    /// نتيجة ركلات الترجيح مع تحديد الفائز — مرتّبة دائمًا «الفائز أولًا» كي لا
    /// تنقلب بصريًّا في سياق RTL. nil إن لم تُحسم بالترجيح.
    var penaltyOutcome: (winnerName: String, winnerScore: Int, loserScore: Int, winnerHome: Bool)? {
        guard let p = penalties, let h = p.home, let a = p.away, h != a else { return nil }
        let homeWon = h > a
        return (homeWon ? home.name : away.name, homeWon ? h : a, homeWon ? a : h, homeWon)
    }
}

/// البطل بعد حسم النهائي (أو المعيَّن يدويًا من لوحة التحكم). النتائج بترتيب
/// «الفائز أولًا» من الخادم فلا تنقلب في RTL.
nonisolated struct KcChampion: Decodable, Hashable {
    let team: KcTeam
    let runnerUp: KcTeam?
    let score: String?
    let penalties: String?
    let decidedAt: String?
    let source: String   // "auto" | "manual"
}

/// ملخّص «يوم الجولة» — أدوار الكأس المبكرة تُلعب دفعة واحدة (حتى 16 مباراة
/// في يوم)، فتعرض الواجهة عدّادًا مشتركًا بدل إبراز مباراة اعتباطية.
nonisolated struct KcMatchday: Decodable, Hashable {
    let count: Int
    let round: String?
    let date: String
    let nextKickoffTs: Int?
    let sameKickoff: Bool
    let liveCount: Int
    let finishedCount: Int
}

/// مباراة اليوم — الخادم يرفق توقّعًا (نتجاهله في iOS مرحلة أولى).
nonisolated struct KcMatchOfDay: Decodable, Hashable {
    let fixture: KcFixture
}

nonisolated struct KcOverview: Decodable, Hashable {
    /// يخفي بلوك الواجهة فقط (لا تُفرَّغ الحمولة) — يُضبط من لوحة التحكم.
    let blockHidden: Bool?
    let live: [KcFixture]
    let today: [KcFixture]
    let nextMatch: KcFixture?
    let matchOfTheDay: KcMatchOfDay?
    let matchday: KcMatchday?
    let started: Bool
    let champion: KcChampion?
    let updatedAt: String
}

nonisolated struct KcScorer: Decodable, Identifiable, Hashable {
    let rank: Int
    /// معرّف اللاعب عند المزود (مفتاح JSON: id) — 0/null = غير معروف.
    let playerId: Int?
    let name: String
    let photo: String
    let team: KcTeam
    let goals: Int
    let assists: Int
    let penalties: Int
    let matches: Int

    var id: String { "\(rank)-\(name)" }

    private enum CodingKeys: String, CodingKey {
        case playerId = "id"
        case rank, name, photo, team, goals, assists, penalties, matches
    }
}

nonisolated struct KcLeader: Decodable, Identifiable, Hashable {
    let rank: Int
    let playerId: Int?
    let name: String
    let photo: String
    let team: KcTeam
    let goals: Int?
    let assists: Int?
    let yellow: Int?
    let red: Int?

    var id: String { "\(rank)-\(name)" }

    private enum CodingKeys: String, CodingKey {
        case playerId = "id"
        case rank, name, photo, team, goals, assists, yellow, red
    }
}

// MARK: - شجرة الأدوار الإقصائية (/kings-cup/bracket)

nonisolated struct KcBracketRound: Decodable, Identifiable, Hashable {
    let round: String
    let matches: [KcFixture]

    var id: String { round }
}

nonisolated struct KcBracket: Decodable, Hashable {
    let rounds: [KcBracketRound]
}

// MARK: - تفاصيل المباراة (/kings-cup/match/:id)

nonisolated struct KcMatchEvent: Decodable, Identifiable, Hashable {
    let minute: Int?
    let extra: Int?
    let teamId: Int
    let team: String
    let player: String
    let assist: String?
    let type: String
    let label: String

    var id: String { "\(minute ?? 0)-\(extra ?? 0)-\(type)-\(player)" }
    var minuteLabel: String { "\(minute ?? 0)'\(extra.map { "+\($0)" } ?? "")" }
}

/// صفّ إحصائي — home/away قد تصل نصًّا أو رقمًا أو null، فنطبّعها لنصّ عرض.
nonisolated struct KcStatRow: Decodable, Identifiable, Hashable {
    let type: String
    let label: String
    let homeText: String
    let awayText: String

    var id: String { type }

    private enum CodingKeys: String, CodingKey { case type, label, home, away }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = try c.decode(String.self, forKey: .type)
        label = try c.decode(String.self, forKey: .label)
        homeText = Self.text(c, .home)
        awayText = Self.text(c, .away)
    }

    private static func text(_ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> String {
        if let s = try? c.decode(String.self, forKey: key) { return s }
        if let i = try? c.decode(Int.self, forKey: key) { return String(i) }
        if let d = try? c.decode(Double.self, forKey: key) {
            return d == d.rounded() ? String(Int(d)) : String(format: "%.1f", d)
        }
        return "-"
    }
}

nonisolated struct KcStatSide: Decodable, Hashable {
    let id: Int
    let name: String
}

nonisolated struct KcStatistics: Decodable, Hashable {
    let home: KcStatSide
    let away: KcStatSide
    let rows: [KcStatRow]
}

nonisolated struct KcLineupPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let number: Int?
    let name: String
    let pos: String
    let grid: String?
}

nonisolated struct KcLineupTeam: Decodable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct KcLineup: Decodable, Identifiable, Hashable {
    let team: KcLineupTeam
    let formation: String?
    let coach: String?
    let startXI: [KcLineupPlayer]
    let substitutes: [KcLineupPlayer]

    var id: Int { team.id }
}

nonisolated struct KcMatchDetail: Decodable, Hashable {
    let fixture: KcFixture
    let events: [KcMatchEvent]
    let statistics: KcStatistics?
    let lineups: [KcLineup]
    let leagueId: Int?
}

// MARK: - صفحة النادي (/kings-cup/team/:id)

nonisolated struct KcTeamVenue: Decodable, Hashable {
    let name: String
    let city: String
    let capacity: Int?
    let image: String
}

nonisolated struct KcTeamInfo: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
    let country: String?
    let founded: Int?
    let venue: KcTeamVenue?
}

nonisolated struct KcSquadPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let number: Int?
    let position: String
    let positionEn: String
    let age: Int?
    let photo: String
}

nonisolated struct KcCoach: Decodable, Hashable {
    let id: Int
    let name: String
    let photo: String
    let age: Int?
    let nationality: String?
}

nonisolated struct KcTeamTopScorer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let photo: String
    let goals: Int
}

nonisolated struct KcTeamProfile: Decodable, Hashable {
    let team: KcTeamInfo
    let competitionName: String?
    let fixtures: [KcFixture]
    let squad: [KcSquadPlayer]
    let coach: KcCoach?
    let topScorers: [KcTeamTopScorer]
}

nonisolated struct KcSquad: Decodable, Hashable {
    let team: KcTeam
    let players: [KcSquadPlayer]
}

// MARK: - سجلّ البطولة السابق (/kings-cup/history)

nonisolated struct KcHistoryChampion: Decodable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct KcHistoryScorer: Decodable, Hashable {
    let id: Int
    let name: String
    let photo: String
    let team: KcTeam
    let goals: Int
}

nonisolated struct KcHistory: Decodable, Hashable {
    let previousSeason: Int?
    let champion: KcHistoryChampion?
    let topScorer: KcHistoryScorer?

    var hasContent: Bool { champion != nil || topScorer != nil }
}

// MARK: - قنوات البث (/kings-cup/match/:id/tv)

nonisolated struct KcTvChannel: Decodable, Identifiable, Hashable {
    let name: String
    let country: String?
    let url: String?
    let logo: String?

    var id: String { "\(name)-\(country ?? "")" }
}

nonisolated struct KcTvListing: Decodable, Hashable {
    let available: Bool
    let channels: [KcTvChannel]
}

// MARK: - Response envelopes

private nonisolated struct KcFixturesResponse: Decodable { let fixtures: [KcFixture] }
private nonisolated struct KcTeamsResponse: Decodable { let teams: [KcTeam] }
private nonisolated struct KcScorersResponse: Decodable { let scorers: [KcScorer] }
private nonisolated struct KcLeadersResponse: Decodable { let leaders: [KcLeader] }

/// البطاقات الصفراء + الحمراء في استجابة واحدة.
nonisolated struct KcCards: Decodable, Hashable {
    let yellow: [KcLeader]
    let red: [KcLeader]
}

// MARK: - APIClient — Kings Cup reads
//
// كل النقاط عامة (لا مصادقة) فتُمرَّر عبر apiRoot=publicAPI. الكاش على الخادم
// يخدم آلاف الزوار من طلب واحد، فلا نضيف كاشًا محليًا غير افتراضي URLSession.

extension APIClient {
    func fetchKingsCupOverview(ignoreCache: Bool = false) async throws -> KcOverview {
        try await get(KcOverview.self, path: "/kings-cup/overview",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchKingsCupFixtures(ignoreCache: Bool = false) async throws -> [KcFixture] {
        try await get(KcFixturesResponse.self, path: "/kings-cup/fixtures",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).fixtures
    }

    func fetchKingsCupLive(ignoreCache: Bool = false) async throws -> [KcFixture] {
        try await get(KcFixturesResponse.self, path: "/kings-cup/live",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).fixtures
    }

    func fetchKingsCupBracket(ignoreCache: Bool = false) async throws -> KcBracket {
        try await get(KcBracket.self, path: "/kings-cup/bracket",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchKingsCupTeams() async throws -> [KcTeam] {
        try await get(KcTeamsResponse.self, path: "/kings-cup/teams",
                      apiRoot: URLConstants.publicAPI).teams
    }

    func fetchKingsCupScorers(ignoreCache: Bool = false) async throws -> [KcScorer] {
        try await get(KcScorersResponse.self, path: "/kings-cup/scorers",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).scorers
    }

    func fetchKingsCupAssists() async throws -> [KcLeader] {
        try await get(KcLeadersResponse.self, path: "/kings-cup/assists",
                      apiRoot: URLConstants.publicAPI).leaders
    }

    func fetchKingsCupCards() async throws -> KcCards {
        try await get(KcCards.self, path: "/kings-cup/cards",
                      apiRoot: URLConstants.publicAPI)
    }

    func fetchKingsCupHistory() async throws -> KcHistory {
        try await get(KcHistory.self, path: "/kings-cup/history",
                      apiRoot: URLConstants.publicAPI)
    }

    func fetchKingsCupMatch(fixtureId: Int, ignoreCache: Bool = false) async throws -> KcMatchDetail {
        try await get(KcMatchDetail.self, path: "/kings-cup/match/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchKingsCupTeamProfile(teamId: Int, ignoreCache: Bool = false) async throws -> KcTeamProfile {
        try await get(KcTeamProfile.self, path: "/kings-cup/team/\(teamId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchKingsCupSquad(teamId: Int) async throws -> KcSquad {
        try await get(KcSquad.self, path: "/kings-cup/squad/\(teamId)",
                      apiRoot: URLConstants.publicAPI)
    }

    func fetchKingsCupTv(fixtureId: Int) async throws -> KcTvListing {
        try await get(KcTvListing.self, path: "/kings-cup/match/\(fixtureId)/tv",
                      apiRoot: URLConstants.publicAPI)
    }
}

// MARK: - Kings Cup — تنسيق التوقيت
//
// يعيد استخدام مُنسِّقات كأس العالم (توقيت الرياض، ميلادي، أرقام لاتينية) مع
// KcFixture. countdown/dayKey/todayKey تُستدعى مباشرة من WCFormat (لا تعتمد على
// نوع المباراة).

nonisolated enum KcFormat {
    static func time(_ fixture: KcFixture) -> String {
        guard let d = fixture.kickoff else { return "" }
        return WCFormat.timeRiyadh.string(from: d)
    }

    static func day(_ fixture: KcFixture) -> String {
        guard let d = fixture.kickoff else { return "" }
        return WCFormat.dayRiyadh.string(from: d)
    }

    /// "الأحد، 14 يونيو" من سلسلة ISO (لبطاقة يوم الجولة).
    static func day(iso: String) -> String {
        guard let d = SabqFormatters.parseISO8601(iso) else { return "" }
        return WCFormat.dayRiyadh.string(from: d)
    }

    /// "1:00 ص" من ختم زمني (لبطاقة يوم الجولة).
    static func time(timestamp: Int) -> String {
        WCFormat.timeRiyadh.string(from: Date(timeIntervalSince1970: TimeInterval(timestamp)))
    }
}

/// مسار التنقل لقسم كأس الملك.
nonisolated struct KingsCupRoute: Hashable {}
