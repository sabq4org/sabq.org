import Foundation

// نماذج بيانات «خليجي 27» — مطابقة لـ DTOs الخادم في gulfCupService.ts و gcPredictionsService.ts.

struct GcTeam: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

struct GcStatus: Decodable, Hashable {
    let code: String
    let label: String
    let elapsed: Int?
    let live: Bool
    let finished: Bool
}

struct GcScore: Decodable, Hashable { let home: Int?; let away: Int? }
struct GcVenue: Decodable, Hashable { let name: String; let city: String }

struct GcFixture: Decodable, Identifiable, Hashable {
    let id: Int
    let matchNo: Int?
    let date: String
    let timestamp: Int
    let status: GcStatus
    let round: String
    let roundEn: String
    let venue: GcVenue
    let home: GcTeam
    let away: GcTeam
    let goals: GcScore

    var involvesSaudi: Bool {
        home.id == GulfCupConstants.saudiTeamId || away.id == GulfCupConstants.saudiTeamId
    }

    var isKnockout: Bool {
        let r = roundEn.lowercased()
        return r.contains("semi") || r.contains("final") || round.contains("نصف") || round.contains("نهائي")
    }
}

struct GcStandingRow: Decodable, Identifiable, Hashable {
    let rank: Int
    let team: GcTeam
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let goalsDiff: Int
    let points: Int
    let live: Bool?
    let liveDelta: Int?
    var id: Int { team.id }
}

struct GcGroup: Decodable, Identifiable, Hashable {
    let name: String
    let rows: [GcStandingRow]
    var id: String { name }
}

struct GcOverview: Decodable, Hashable {
    let startsAt: String?
    let endsAt: String?
    let teamsCount: Int
    let groupsCount: Int
    let host: String
    let venues: [GcVenue]
    let started: Bool
    let saudi: GcSaudi
    let nextMatch: GcFixture?
}

struct GcSaudi: Decodable, Hashable {
    let team: GcTeam?
    let group: String?
    let fixtures: [GcFixture]
}

private struct GcTeamsResponse: Decodable { let teams: [GcTeam] }
private struct GcFixturesResponse: Decodable { let fixtures: [GcFixture] }
private struct GcStandingsResponse: Decodable { let groups: [GcGroup] }

// MARK: - الهدّافون وصنّاع الأهداف (/gulf-cup/scorers)

struct GcScorer: Decodable, Identifiable, Hashable {
    let rank: Int
    let id: Int
    let name: String
    let photo: String
    let team: GcTeam
    let goals: Int
    let assists: Int
    let penalties: Int
    let matches: Int
    let minutes: Int
}

struct GcScorersBoard: Decodable, Hashable {
    let season: Int
    let isCurrent: Bool
    let scorers: [GcScorer]
    let assists: [GcScorer]
}

// MARK: - سجلّ البطولة (/gulf-cup/history)

struct GcEdition: Decodable, Identifiable, Hashable {
    let edition: Int
    let title: String
    let year: String
    let host: GcTeam
    let hostCity: String?
    let champion: GcTeam?
    let runnerUp: GcTeam?
    let finalNote: String?
    let upcoming: Bool
    var id: Int { edition }
}

struct GcTitleRow: Decodable, Identifiable, Hashable {
    let team: GcTeam
    let titles: Int
    let runnerUps: Int
    let hosted: Int
    let lastTitleYear: String?
    var id: Int { team.id }
}

struct GcHistory: Decodable, Hashable {
    let editions: [GcEdition]
    let titles: [GcTitleRow]
}

// MARK: - التوقعات (gcPredictionsService)

struct GcModelProbs: Decodable, Hashable {
    let home: Double
    let draw: Double
    let away: Double
}

struct GcPredictionCrowd: Decodable, Hashable {
    let home: Int
    let draw: Int
    let away: Int
    let total: Int
}

struct GcMyPrediction: Decodable, Hashable {
    let predHome: Int
    let predAway: Int
    let status: String
    let tier: String?
    let outcomeHit: Bool?
    let marginHit: Bool?
    let exactHit: Bool?
    let pointsAwarded: Int?
}

struct GcMatchSettlement: Decodable, Hashable {
    let status: String
    let finalHome: Int?
    let finalAway: Int?
    let predictionsCount: Int
    let exactWinners: Int
    let marginWinners: Int
    let outcomeWinners: Int
    let poolBase: Int?
    let poolCarryIn: Int?
    let carryOut: Int?
}

struct GcPredictableMatch: Decodable, Identifiable, Hashable {
    let fixture: GcFixture
    let locked: Bool
    let probs: GcModelProbs
    let crowd: GcPredictionCrowd
    let predictionsCount: Int
    let poolAvailable: Int
    let myPrediction: GcMyPrediction?
    let settlement: GcMatchSettlement?
    var id: Int { fixture.id }
}

struct GcPredictionMeStats: Decodable, Hashable {
    let points: Int
    let correct: Int
    let exact: Int
    let played: Int
    let currentStreak: Int
    let badges: [String]?
}

struct GcPredictionLeader: Decodable, Identifiable, Hashable {
    let rank: Int
    let userId: String
    let name: String
    let avatar: String?
    let totalPoints: Int
    let correctCount: Int
    let exactCount: Int
    let playedCount: Int
    let accuracy: Double
    var id: String { userId }
}

struct GcPredictionsTodayResponse: Decodable, Hashable {
    let matches: [GcPredictableMatch]
    let me: GcPredictionMeStats?
    let jackpot: Int
}

private struct GcPredictionsLeaderboardResponse: Decodable {
    let leaders: [GcPredictionLeader]
}

/// سجلّ توقّعاتي (/predictions/mine) — الصفوف مضمومة إلى لقطة المباراة.
struct GcMyPredictionRow: Decodable, Identifiable, Hashable {
    let fixtureId: String
    let predHome: Int
    let predAway: Int
    let status: String
    let tier: String?
    let outcomeHit: Bool?
    let marginHit: Bool?
    let exactHit: Bool?
    let pointsAwarded: Int?
    let kickoffAt: String?
    let homeTeamName: String?
    let homeTeamLogo: String?
    let awayTeamName: String?
    let awayTeamLogo: String?
    let finalHome: Int?
    let finalAway: Int?
    let matchStatus: String?
    var id: String { fixtureId }
}

private struct GcMyPredictionsResponse: Decodable { let predictions: [GcMyPredictionRow] }

// توقعات طويلة المدى (البطل / الهدّاف)
struct GcTeamLite: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

struct GcLongPools: Decodable, Hashable {
    let champion: Int
    let top_scorer: Int
}

struct GcLongVote: Decodable, Hashable {
    let kind: String
    let teamId: Int?
    let n: Int
}

struct GcLongMine: Decodable, Hashable {
    let kind: String
    let teamId: Int?
    let teamName: String?
    let playerName: String?
    let status: String
    let pointsAwarded: Int
}

struct GcLongData: Decodable, Hashable {
    let teams: [GcTeamLite]
    let pools: GcLongPools
    let championVotes: [GcLongVote]
    let mine: [GcLongMine]
}

// MARK: - صفحة المنتخب + تفاصيل المباراة

struct GcTeamStats: Decodable, Hashable {
    let groupName: String?
    let rank: Int?
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let goalsDiff: Int
    let points: Int
    let form: [String]
}

struct GcSquadPlayer: Decodable, Hashable, Identifiable {
    let id: Int
    let name: String
    let number: Int?
    let position: String
    let positionEn: String?
    let age: Int?
    let photo: String?
}

/// إرث المنتخب في تاريخ البطولة (ثابت من الخادم).
struct GcTeamLegacy: Decodable, Hashable {
    let titles: Int
    let runnerUps: Int
    let hosted: Int
    let titleYears: [String]
    let lastTitleYear: String?
}

struct GcTeamProfile: Decodable, Hashable {
    let team: GcTeam
    let isSaudi: Bool
    let coach: String?
    let group: GcGroup?
    let stats: GcTeamStats
    let nextMatch: GcFixture?
    let fixtures: [GcFixture]
    let squad: [GcSquadPlayer]
    let legacy: GcTeamLegacy?
    /// تصنيف الفيفا (TheSports) — nil قبل توفّر الجسر.
    let fifaRank: GcFifaRank?
    /// الإصابات والغيابات الحالية — nil/فارغة قبل توفّر الجسر.
    let injuries: [GcInjury]?
}

struct GcMatchEvent: Decodable, Hashable, Identifiable {
    let minute: Int
    let extraMinute: Int?
    let teamId: Int
    let type: String
    let label: String
    let player: String?
    var id: String { "\(minute)-\(teamId)-\(type)-\(player ?? "")" }
}

struct GcLineupPlayer: Decodable, Hashable, Identifiable {
    let id: Int
    let name: String
    let number: Int?
    let position: String?
}

struct GcLineup: Decodable, Hashable, Identifiable {
    let teamId: Int
    let teamName: String
    let formation: String?
    let coach: String
    let startXI: [GcLineupPlayer]
    let substitutes: [GcLineupPlayer]
    var id: Int { teamId }
}

struct GcStatistic: Decodable, Hashable, Identifiable {
    let key: String
    let label: String
    let home: String
    let away: String
    var id: String { key }
}

/// مواجهة تاريخية (كل البطولات) من fixtures/headtohead.
struct GcH2HMatch: Decodable, Hashable, Identifiable {
    let date: String
    let competition: String
    let home: GcTeam
    let away: GcTeam
    let goals: GcScore
    var id: String { "\(date)-\(home.id)-\(away.id)" }
}

struct GcH2HSummary: Decodable, Hashable {
    let total: Int
    let homeWins: Int
    let awayWins: Int
    let draws: Int
    let recent: [GcH2HMatch]
}

// ---------- إثراء TheSports (اختيارية كلها — تغيب قبل توفر بيانات المزوّد) ----------

struct GcRichLineupPlayer: Decodable, Hashable, Identifiable {
    let id: String
    let name: String
    let number: Int?
    let position: String?
    /// إحداثيات على الملعب (0..100) — nil إن غابت لدى المزوّد.
    let x: Double?
    let y: Double?
    /// تقييم المباراة (يتجدّد أثناء اللعب).
    let rating: Double?
    let photo: String?
    let captain: Bool
    let starter: Bool
}

struct GcRichLineup: Decodable, Hashable {
    let confirmed: Bool
    let homeFormation: String?
    let awayFormation: String?
    let home: [GcRichLineupPlayer]
    let away: [GcRichLineupPlayer]
}

struct GcTrendPoint: Decodable, Hashable {
    let minute: Int
    let value: Double
}

struct GcTrend: Decodable, Hashable {
    let perMinutes: Int
    /// القيمة −100..100: موجب = ضغط المضيف، سالب = ضغط الضيف.
    let values: [GcTrendPoint]
}

struct GcTvChannel: Decodable, Hashable, Identifiable {
    let name: String
    let country: String?
    let logo: String?
    var id: String { name + (country ?? "") }
}

struct GcPlayerMatchStat: Decodable, Hashable, Identifiable {
    let playerId: String
    let name: String
    let photo: String?
    let side: String?
    let starter: Bool
    let minutes: Int
    let rating: Double?
    let values: [String: Double]
    var id: String { playerId }
}

struct GcInjury: Decodable, Hashable, Identifiable {
    let player: String
    let reason: String?
    let missedMatches: Int?
    var id: String { player + (reason ?? "") }
}

struct GcMatchInjuries: Decodable, Hashable {
    let home: [GcInjury]
    let away: [GcInjury]
}

struct GcFifaRank: Decodable, Hashable {
    let rank: Int
    let points: Double?
    let change: Int?
}

struct GcMatchFifa: Decodable, Hashable {
    let home: GcFifaRank?
    let away: GcFifaRank?
}

// ---------- إثراء Sportmonks (اختيارية كلها) ----------

struct GcXg: Decodable, Hashable {
    let home: Double?
    let away: Double?
}

struct GcForecast: Decodable, Hashable {
    let home: Int
    let draw: Int
    let away: Int
}

struct GcExpectedPlayer: Decodable, Hashable, Identifiable {
    let name: String
    let jersey: Int?
    let row: Int?
    var id: String { name + String(jersey ?? 0) }
}

struct GcExpectedSide: Decodable, Hashable {
    let formation: String?
    let starters: [GcExpectedPlayer]
}

struct GcExpectedLineups: Decodable, Hashable {
    let home: GcExpectedSide?
    let away: GcExpectedSide?
}

struct GcReferee: Decodable, Hashable {
    let name: String
    let photo: String?
    let country: String?
    let matches: Int?
    let yellowAvg: Double?
    let penaltiesAvg: Double?
}

struct GcCommentaryItem: Decodable, Hashable, Identifiable {
    let minute: Int?
    let extraMinute: Int?
    let goal: Bool
    let important: Bool
    let text: String
    var id: String { "\(minute ?? -1)-\(extraMinute ?? 0)-\(text.prefix(24))" }
}

struct GcMatchDetail: Decodable, Hashable {
    let fixture: GcFixture
    let events: [GcMatchEvent]
    let lineups: [GcLineup]
    let statistics: [GcStatistic]
    let headToHead: [GcFixture]
    let history: GcH2HSummary?
    let lineupsRich: GcRichLineup?
    let trend: GcTrend?
    let tv: [GcTvChannel]?
    let playerStats: [GcPlayerMatchStat]?
    let injuries: GcMatchInjuries?
    let fifa: GcMatchFifa?
    let xg: GcXg?
    let forecast: GcForecast?
    let expectedLineups: GcExpectedLineups?
    let referee: GcReferee?
    let commentary: [GcCommentaryItem]?
}

struct GcDayGroup: Identifiable {
    let key: String
    let label: String
    let items: [GcFixture]
    var id: String { key }
}

enum GulfCupConstants {
    static let saudiTeamId = 23
    static let tournamentName = "خليجي 27"
    static let tournamentNameEn = "Arab Gulf Cup 27"
}

struct GcCountdown: Equatable {
    let days: Int
    let hours: Int
    let minutes: Int
    let seconds: Int
    let total: Double
    var isFinished: Bool { total <= 0 }
}

enum GcCountdownMath {
    static func to(iso: String?) -> GcCountdown {
        let target = iso.map { GcDateMath.date(from: $0)?.timeIntervalSinceNow ?? 0 } ?? 0
        let total = max(0, target)
        return GcCountdown(
            days: Int(total / 86_400),
            hours: Int((total.truncatingRemainder(dividingBy: 86_400)) / 3_600),
            minutes: Int((total.truncatingRemainder(dividingBy: 3_600)) / 60),
            seconds: Int(total.truncatingRemainder(dividingBy: 60)),
            total: total
        )
    }
}

enum GcDateMath {
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

enum GcFormat {
    private static let riyadh = TimeZone(identifier: "Asia/Riyadh")!
    private static let locale = Locale(identifier: "ar-SA@calendar=gregorian;numbers=latn")

    private static func formatter(_ pattern: String) -> DateFormatter {
        let f = DateFormatter()
        f.timeZone = riyadh
        f.locale = locale
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = pattern
        return f
    }

    static func kickoffDay(_ iso: String?) -> String {
        guard let iso, let d = GcDateMath.date(from: iso) else { return "" }
        return formatter("EEEE d MMMM").string(from: d)
    }

    /// يوم مختصر «23 سبت» لعمود الحالة الضيّق.
    static func kickoffDayShort(_ iso: String?) -> String {
        guard let iso, let d = GcDateMath.date(from: iso) else { return "" }
        return formatter("d MMM").string(from: d)
    }

    static func kickoffTime(_ iso: String?) -> String {
        guard let iso, let d = GcDateMath.date(from: iso) else { return "" }
        return formatter("HH:mm").string(from: d)
    }

    /// سنة المواجهة التاريخية «2024».
    static func year(_ iso: String?) -> String {
        guard let iso, let d = GcDateMath.date(from: iso) else { return "" }
        return formatter("yyyy").string(from: d)
    }

    static func dateRange(startIso: String?, endIso: String?) -> String {
        guard let startIso, let s = GcDateMath.date(from: startIso) else { return "" }
        let f = formatter("d MMMM yyyy")
        let start = f.string(from: s)
        guard let endIso, let e = GcDateMath.date(from: endIso) else { return start }
        let end = f.string(from: e)
        return start == end ? start : "\(start) — \(end)"
    }

    /// وصف نسبي قريب: «اليوم 21:00» / «غدًا 18:00» / «الثلاثاء 23 سبتمبر».
    static func relativeKickoff(_ iso: String?) -> String {
        guard let iso, let d = GcDateMath.date(from: iso) else { return "" }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = riyadh
        let time = kickoffTime(iso)
        if cal.isDateInToday(d) { return "\(L("time.today")) \(time)" }
        if cal.isDateInTomorrow(d) { return "\(L("time.tomorrow")) \(time)" }
        return kickoffDay(iso)
    }
}

enum GcFixtureMath {
    static func groupByDay(_ fixtures: [GcFixture]) -> [GcDayGroup] {
        var map: [String: [GcFixture]] = [:]
        for f in fixtures {
            let key = String(f.date.prefix(10))
            map[key, default: []].append(f)
        }
        return map.keys.sorted().map { key in
            let items = (map[key] ?? []).sorted { a, b in
                let sa = a.involvesSaudi ? 0 : 1
                let sb = b.involvesSaudi ? 0 : 1
                return sa != sb ? sa < sb : a.timestamp < b.timestamp
            }
            return GcDayGroup(key: key, label: GcFormat.kickoffDay(items.first?.date), items: items)
        }
    }

    static func knockout(from fixtures: [GcFixture]) -> [GcFixture] {
        fixtures.filter(\.isKnockout).sorted { $0.timestamp < $1.timestamp }
    }
}

extension APIClient {
    func fetchGcOverview(ignoreCache: Bool = false) async throws -> GcOverview {
        try await get(GcOverview.self, path: "/gulf-cup/overview", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchGcTeams(ignoreCache: Bool = false) async throws -> [GcTeam] {
        let r = try await get(GcTeamsResponse.self, path: "/gulf-cup/teams", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
        return r.teams
    }

    func fetchGcFixtures(ignoreCache: Bool = false) async throws -> [GcFixture] {
        let r = try await get(GcFixturesResponse.self, path: "/gulf-cup/fixtures", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
        return r.fixtures
    }

    func fetchGcStandings(ignoreCache: Bool = false) async throws -> [GcGroup] {
        let r = try await get(GcStandingsResponse.self, path: "/gulf-cup/standings", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
        return r.groups
    }

    func fetchGcScorers(ignoreCache: Bool = false) async throws -> GcScorersBoard {
        try await get(GcScorersBoard.self, path: "/gulf-cup/scorers", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchGcHistory(ignoreCache: Bool = false) async throws -> GcHistory {
        try await get(GcHistory.self, path: "/gulf-cup/history", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchGcPredictionsToday(ignoreCache: Bool = false) async throws -> GcPredictionsTodayResponse {
        try await get(
            GcPredictionsTodayResponse.self,
            path: "/gulf-cup/predictions/today",
            ignoreCache: ignoreCache,
            apiRoot: URLConstants.mobileAPI
        )
    }

    func fetchGcPredictionsLeaderboard(ignoreCache: Bool = false) async throws -> [GcPredictionLeader] {
        let r = try await get(
            GcPredictionsLeaderboardResponse.self,
            path: "/gulf-cup/predictions/leaderboard",
            ignoreCache: ignoreCache,
            apiRoot: URLConstants.mobileAPI
        )
        return r.leaders
    }

    func fetchGcMyPredictions(ignoreCache: Bool = false) async throws -> [GcMyPredictionRow] {
        let r = try await get(
            GcMyPredictionsResponse.self,
            path: "/gulf-cup/predictions/mine",
            ignoreCache: ignoreCache,
            apiRoot: URLConstants.mobileAPI
        )
        return r.predictions
    }

    func fetchGcLongPredictions(ignoreCache: Bool = false) async throws -> GcLongData {
        try await get(
            GcLongData.self,
            path: "/gulf-cup/predictions/long",
            ignoreCache: ignoreCache,
            apiRoot: URLConstants.mobileAPI
        )
    }

    func fetchGcTeamProfile(_ teamId: Int, ignoreCache: Bool = false) async throws -> GcTeamProfile {
        try await get(GcTeamProfile.self, path: "/gulf-cup/team/\(teamId)", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchGcMatchDetail(_ fixtureId: Int, ignoreCache: Bool = false) async throws -> GcMatchDetail {
        try await get(GcMatchDetail.self, path: "/gulf-cup/match/\(fixtureId)", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func registerLiveActivity(fixtureId: Int, pushToken: String) async throws {
        struct Body: Encodable { let fixtureId: Int; let token: String; let bundleId: String? }
        struct Ok: Decodable { let ok: Bool? }
        let body = Body(fixtureId: fixtureId, token: pushToken, bundleId: Bundle.main.bundleIdentifier)
        _ = try await post(Ok.self, path: "/live-activity/register", body: body, apiRoot: URLConstants.mobileAPI)
    }

    func endLiveActivity(pushToken: String) async throws {
        struct Body: Encodable { let token: String }
        struct Ok: Decodable { let ok: Bool? }
        _ = try await post(Ok.self, path: "/live-activity/end", body: Body(token: pushToken), apiRoot: URLConstants.mobileAPI)
    }
}
