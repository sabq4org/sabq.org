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

/// احتمالات الفوز (API-Football predictions) — الخادم يُسقط العنصر الوهمي
/// 33/33/33 قبل توفّر بيانات الموسم، فوصولها = توقّع حقيقي.
nonisolated struct KcPrediction: Decodable, Hashable {
    let homePct: Int
    let drawPct: Int
    let awayPct: Int
    let winnerId: Int?
    let winnerName: String?
    let advice: String?
}

/// مباراة اليوم — مع توقّعها الجاهز من overview (المرحلة الثانية).
nonisolated struct KcMatchOfDay: Decodable, Hashable {
    let fixture: KcFixture
    let prediction: KcPrediction?
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

nonisolated struct KcCoachStop: Decodable, Hashable {
    let team: String
    let start: String?
    let end: String?
}

nonisolated struct KcCoach: Decodable, Hashable {
    let id: Int
    let name: String
    let photo: String
    let age: Int?
    let nationality: String?
    /// منذ متى يقود الفريق + محطات المسيرة — تصل مع إثراء ?with=stats فقط
    let startDate: String?
    let career: [KcCoachStop]?
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

// MARK: - تقييمات اللاعبين (/kings-cup/match/:id/player-stats)

nonisolated struct KcMatchMotm: Decodable, Hashable {
    let id: Int
    let name: String
    let team: String
    let rating: Double
}

nonisolated struct KcMatchRating: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let photo: String
    let teamId: Int
    let team: String
    let number: Int?
    let pos: String
    let rating: Double?
    let minutes: Int
    let goals: Int
    let assists: Int
    let yellow: Int
    let red: Int
    let captain: Bool
}

nonisolated struct KcMatchRatings: Decodable, Hashable {
    let motm: KcMatchMotm?
    let players: [KcMatchRating]?
}

// MARK: - سجلّ الأبطال متعدد المواسم (/kings-cup/record)

nonisolated struct KcRecordTitleRow: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
    let titles: Int
    let lastSeason: Int
}

nonisolated struct KcRecordEdition: Decodable, Identifiable, Hashable {
    let season: Int
    let champion: KcHistoryChampion?
    let runnerUp: KcHistoryChampion?
    /// نتيجة النهائي بمنظور الفائز أولًا — لا تنقلب في RTL
    let score: String?
    let penalties: String?

    var id: Int { season }
}

nonisolated struct KcRecord: Decodable, Hashable {
    let sinceSeason: Int?
    let editions: [KcRecordEdition]
    let titles: [KcRecordTitleRow]
}

// MARK: - إحصائيات النادي الموسمية (teams/statistics — دوري أو كأس)

nonisolated struct KcStatTriple: Decodable, Hashable {
    let total: Int
    let home: Int
    let away: Int
}

nonisolated struct KcTeamStatsFixtures: Decodable, Hashable {
    let played: KcStatTriple
    let wins: KcStatTriple
    let draws: KcStatTriple
    let loses: KcStatTriple
}

nonisolated struct KcGoalsSide: Decodable, Hashable {
    let total: Int
    let average: String
    let home: String
    let away: String
}

nonisolated struct KcTeamStatsGoals: Decodable, Hashable {
    let scored: KcGoalsSide
    let against: KcGoalsSide

    private enum CodingKeys: String, CodingKey {
        case scored = "for"
        case against
    }
}

nonisolated struct KcTeamStatsBiggest: Decodable, Hashable {
    let winsHome: String?
    let winsAway: String?
    let losesHome: String?
    let losesAway: String?
    let streakWin: Int?
    let streakLose: Int?
    let streakDraw: Int?
}

nonisolated struct KcCardsTotal: Decodable, Hashable {
    let yellowTotal: Int
    let redTotal: Int
}

nonisolated struct KcTeamStatsSummary: Decodable, Hashable {
    let cleanSheets: KcStatTriple
    let failedToScore: KcStatTriple
    let cards: KcCardsTotal
    let mostUsedFormation: String?
}

nonisolated struct KcGoalTiming: Decodable, Identifiable, Hashable {
    let bucket: String
    let scored: Int
    let against: Int

    var id: String { bucket }

    private enum CodingKeys: String, CodingKey {
        case bucket
        case scored = "for"
        case against
    }
}

nonisolated struct KcTeamStats: Decodable, Hashable {
    let leagueId: Int
    let season: Int
    let fixtures: KcTeamStatsFixtures
    let goals: KcTeamStatsGoals
    let biggest: KcTeamStatsBiggest
    let summary: KcTeamStatsSummary
    let timing: [KcGoalTiming]
}

nonisolated struct KcTeamCupStats: Decodable, Hashable {
    let season: Int
    let stats: KcTeamStats
}

// MARK: - انتقالات النادي

nonisolated struct KcTeamTransfer: Decodable, Identifiable, Hashable {
    let date: String
    let type: String
    let playerId: Int
    let player: String
    let teamId: Int
    let team: String
    let teamLogo: String

    var id: String { "\(playerId)-\(date)" }
}

nonisolated struct KcTeamTransfers: Decodable, Hashable {
    let arrivals: [KcTeamTransfer]
    let departures: [KcTeamTransfer]
}

/// إثراء صفحة النادي (?with=stats) — نفكّ منه الحقول الثقيلة فقط.
nonisolated struct KcTeamExtras: Decodable, Hashable {
    let stats: KcTeamStats?
    let kcStats: KcTeamCupStats?
    let coach: KcCoach?
    let topScorers: [KcTeamTopScorer]?
    let transfers: KcTeamTransfers?
}

// MARK: - مباريات النادي في الكأس (/kings-cup/team/:id/matches)

nonisolated struct KcPrevRun: Decodable, Hashable {
    let season: Int
    let fixtures: [KcFixture]
}

nonisolated struct KcTeamMatches: Decodable, Hashable {
    let season: Int?
    let fixtures: [KcFixture]
    let previous: KcPrevRun?
}

// MARK: - صفحة اللاعب (/kings-cup/player/:id)

nonisolated struct KcPlayerSeasonStats: Decodable, Identifiable, Hashable {
    let competition: String
    let team: KcTeam
    let matches: Int
    let lineups: Int
    let minutes: Int
    let rating: Double?
    let goals: Int
    let assists: Int
    let yellow: Int
    let red: Int
    let saves: Int
    let conceded: Int

    var id: String { competition }
    var isKingsCup: Bool { competition.contains("خادم الحرمين") || competition.contains("كأس الملك") }
}

nonisolated struct KcPlayerCareerStop: Decodable, Identifiable, Hashable {
    let teamId: Int
    let team: String
    let logo: String
    let seasons: [Int]

    var id: String { "\(teamId)-\(seasons.first ?? 0)" }
}

nonisolated struct KcPlayerTrophy: Decodable, Identifiable, Hashable {
    let competition: String
    let country: String
    let season: String
    let place: String
    let winner: Bool

    var id: String { "\(competition)-\(season)" }
}

nonisolated struct KcCurrentTeam: Decodable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct KcPlayerCard: Decodable, Hashable {
    let id: Int
    let name: String
    let fullName: String?
    let photo: String
    let position: String
    let number: Int?
    let age: Int?
    let birthDate: String?
    let birthPlace: String?
    let nationality: String?
    let height: Int?
    let weight: Int?
    let seasonStats: [KcPlayerSeasonStats]
    let career: [KcPlayerCareerStop]
    let trophies: [KcPlayerTrophy]
    let currentTeam: KcCurrentTeam?
}

nonisolated struct KcPlayerSeasonPoint: Decodable, Identifiable, Hashable {
    let season: Int
    let competition: String
    let matches: Int
    let goals: Int
    let assists: Int

    var id: String { "\(season)-\(competition)" }
}

nonisolated struct KcPlayerTransfer: Decodable, Identifiable, Hashable {
    let date: String
    let type: String
    let fromId: Int
    let from: String
    let fromLogo: String
    let toId: Int
    let to: String
    let toLogo: String

    var id: String { "\(date)-\(toId)" }
}

nonisolated struct KcPlayerInjury: Decodable, Identifiable, Hashable {
    let date: String
    let type: String
    let reason: String
    let team: String
    let competition: String

    var id: String { "\(date)-\(reason)" }
}

/// إثراء صفحة اللاعب (?with=extras) — نفكّ الحقول الإضافية فقط.
nonisolated struct KcPlayerExtras: Decodable, Hashable {
    let history: [KcPlayerSeasonPoint]?
    let transfers: [KcPlayerTransfer]?
    let injuries: [KcPlayerInjury]?
}

nonisolated struct KcFormMatch: Decodable, Identifiable, Hashable {
    let date: String
    let opponent: String
    let opponentLogo: String
    let homeAway: String
    let result: String
    let scoreFor: Int
    let scoreAgainst: Int
    let xg: Double?
    let goals: Int
    let rating: Double?
    let league: String

    var id: String { "\(date)-\(opponent)" }
}

nonisolated struct KcPlayerForm: Decodable, Hashable {
    let available: Bool
    let matches: [KcFormMatch]
}

nonisolated struct KcMarketPoint: Decodable, Identifiable, Hashable {
    let time: Int
    let value: Double

    var id: Int { time }
}

nonisolated struct KcPlayerMarket: Decodable, Hashable {
    let available: Bool
    let value: Double?
    let currency: String
    let peak: Double?
    let history: [KcMarketPoint]
}

// MARK: - توقّعات المجتمع (sports_pool الموحّد — /api/v1/sports/*)
//
// نظائر الويب: توقّع نتيجة (3 نقاط دقيقة/1 اتجاه) + البطل والهدّاف
// (مجمّع 5000/5000) + المتصدّرون. كلها بجلسة العضو (Bearer) على جذر v1.

nonisolated struct KcPoolPrediction: Decodable, Identifiable, Hashable {
    let id: String
    let fixtureId: Int
    let competitionSlug: String?
    let kickoffTs: Int
    let homeId: Int?
    let awayId: Int?
    let homeName: String
    let awayName: String
    let homeLogo: String?
    let awayLogo: String?
    let predHome: Int
    let predAway: Int
    let actualHome: Int?
    let actualAway: Int?
    /// null = لم تُسوَّ بعد؛ 3 = نتيجة دقيقة، 1 = اتجاه صحيح، 0 = لم تُصب
    let points: Int?
    let settledAt: String?
}

nonisolated struct KcPoolStats: Decodable, Hashable {
    let totalPoints: Int
    let predictions: Int
    let exact: Int
    let correct: Int
}

nonisolated struct KcPoolMine: Decodable, Hashable {
    let predictions: [KcPoolPrediction]?
    let stats: KcPoolStats?
}

nonisolated struct KcPoolLeader: Decodable, Identifiable, Hashable {
    let userId: String
    let name: String
    let avatar: String?
    let totalPoints: Int
    let predictions: Int
    let exact: Int
    let correct: Int
    let rank: Int

    var id: String { userId }
}

nonisolated struct KcLongTeam: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct KcLongPools: Decodable, Hashable {
    let champion: Int
    let topScorer: Int

    private enum CodingKeys: String, CodingKey {
        case champion
        case topScorer = "top_scorer"
    }
}

nonisolated struct KcLongVote: Decodable, Hashable {
    let teamId: Int?
    let n: Int
}

nonisolated struct KcLongMine: Decodable, Identifiable, Hashable {
    let kind: String
    let teamId: Int?
    let teamName: String?
    let teamLogo: String?
    let playerName: String?
    let status: String
    let pointsAwarded: Int

    var id: String { kind }
}

nonisolated struct KcLongData: Decodable, Hashable {
    let competitionSlug: String
    let teams: [KcLongTeam]
    let pools: KcLongPools
    let championVotes: [KcLongVote]
    let locked: Bool
    let mine: [KcLongMine]
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

    // MARK: المرحلة الثانية — احتمالات وتقييمات وسجلّ ونادٍ ولاعب

    func fetchKingsCupPrediction(fixtureId: Int) async throws -> KcPrediction? {
        struct Envelope: Decodable { let prediction: KcPrediction? }
        return try await get(Envelope.self, path: "/kings-cup/match/\(fixtureId)/prediction",
                             apiRoot: URLConstants.publicAPI).prediction
    }

    func fetchKingsCupMatchRatings(fixtureId: Int, ignoreCache: Bool = false) async throws -> KcMatchRatings {
        try await get(KcMatchRatings.self, path: "/kings-cup/match/\(fixtureId)/player-stats",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchKingsCupRecord() async throws -> KcRecord {
        try await get(KcRecord.self, path: "/kings-cup/record",
                      apiRoot: URLConstants.publicAPI)
    }

    /// الإثراء الثقيل لصفحة النادي — نفس نقطة الملف الأساسي مع ?with=stats
    /// (إحصائيات الدوري والكأس + مسيرة المدرب + الهدّافين + الانتقالات).
    func fetchKingsCupTeamExtras(teamId: Int) async throws -> KcTeamExtras {
        try await get(KcTeamExtras.self, path: "/kings-cup/team/\(teamId)",
                      query: ["with": "stats"], apiRoot: URLConstants.publicAPI)
    }

    /// مباريات النادي في الكأس: الموسم الجاري + مشوار النسخة السابقة.
    func fetchKingsCupTeamMatches(teamId: Int) async throws -> KcTeamMatches {
        try await get(KcTeamMatches.self, path: "/kings-cup/team/\(teamId)/matches",
                      apiRoot: URLConstants.publicAPI)
    }

    func fetchKingsCupPlayer(playerId: Int) async throws -> KcPlayerCard {
        try await get(KcPlayerCard.self, path: "/kings-cup/player/\(playerId)",
                      apiRoot: URLConstants.publicAPI)
    }

    func fetchKingsCupPlayerExtras(playerId: Int) async throws -> KcPlayerExtras {
        try await get(KcPlayerExtras.self, path: "/kings-cup/player/\(playerId)",
                      query: ["with": "extras"], apiRoot: URLConstants.publicAPI)
    }

    func fetchKingsCupPlayerForm(playerId: Int) async throws -> KcPlayerForm {
        try await get(KcPlayerForm.self, path: "/kings-cup/player/\(playerId)/form",
                      apiRoot: URLConstants.publicAPI)
    }

    func fetchKingsCupPlayerMarket(playerId: Int) async throws -> KcPlayerMarket {
        try await get(KcPlayerMarket.self, path: "/kings-cup/player/\(playerId)/market",
                      apiRoot: URLConstants.publicAPI)
    }

    // MARK: توقّعات المجتمع — جذر v1 المصادَق (جلسة العضو Bearer)

    func fetchKcPoolMine() async throws -> KcPoolMine {
        try await get(KcPoolMine.self, path: "/sports/predictions/me", ignoreCache: true)
    }

    func submitKcPoolPrediction(fixture: KcFixture, home: Int, away: Int) async throws -> KcPoolPrediction? {
        struct Body: Encodable {
            let predHome: Int
            let predAway: Int
            let kickoffTs: Int
            let competitionSlug: String
            let homeId: Int
            let awayId: Int
            let homeName: String
            let awayName: String
            let homeLogo: String
            let awayLogo: String
        }
        struct Envelope: Decodable { let prediction: KcPoolPrediction? }
        let body = Body(
            predHome: home, predAway: away,
            kickoffTs: fixture.timestamp, competitionSlug: "kings-cup",
            homeId: fixture.home.id, awayId: fixture.away.id,
            homeName: fixture.home.name, awayName: fixture.away.name,
            homeLogo: fixture.home.logo, awayLogo: fixture.away.logo
        )
        return try await post(Envelope.self, path: "/sports/match/\(fixture.id)/predict", body: body).prediction
    }

    func fetchKcPoolLeaderboard() async throws -> [KcPoolLeader] {
        struct Envelope: Decodable { let leaders: [KcPoolLeader] }
        return try await get(Envelope.self, path: "/sports/predictions/leaderboard").leaders
    }

    func fetchKcPoolLong() async throws -> KcLongData {
        try await get(KcLongData.self, path: "/sports/predictions/long",
                      query: ["comp": "kings-cup"], ignoreCache: true)
    }

    func submitKcPoolLong(kind: String, teamId: Int?, playerName: String?) async throws {
        struct Body: Encodable {
            let competitionSlug: String
            let kind: String
            let teamId: Int?
            let playerName: String?
        }
        struct Envelope: Decodable { let success: Bool }
        _ = try await post(Envelope.self, path: "/sports/predictions/long",
                           body: Body(competitionSlug: "kings-cup", kind: kind, teamId: teamId, playerName: playerName))
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

    /// «2026» لدى المزوّد = نسخة 2025/26 (الكؤوس تُرقَّم بسنة النهاية).
    static func seasonLabel(_ season: Int) -> String {
        "\(season - 1)/\(String(season).suffix(2))"
    }
}

/// مسار التنقل لقسم كأس الملك.
nonisolated struct KingsCupRoute: Hashable {}
