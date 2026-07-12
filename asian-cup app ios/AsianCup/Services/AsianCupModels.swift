import Foundation

// نماذج بيانات كأس آسيا 2027 — مطابقة لـ DTOs الخادم في asianCupService.ts.
// كلها Decodable عربية الجاهزية (الخادم يعيد الأسماء معرّبة). nonisolated لأن
// SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor.

nonisolated struct AcTeam: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let nameEn: String?
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

// MARK: - التوقعات

nonisolated struct AcModelProbs: Decodable, Hashable {
    let home: Double
    let draw: Double
    let away: Double
}

nonisolated struct AcPredictionCrowd: Decodable, Hashable {
    let home: Int
    let draw: Int
    let away: Int
    let total: Int
}

nonisolated struct AcMyPrediction: Decodable, Hashable {
    let predHome: Int
    let predAway: Int
    let status: String
    let outcomeHit: Bool?
    let marginHit: Bool?
    let exactHit: Bool?
    let boldnessMult: Double?
    let streakMult: Double?
    let pointsAwarded: Int?
}

nonisolated struct AcPredictionSettlement: Decodable, Hashable {
    let status: String
    let finalHome: Int?
    let finalAway: Int?
    let predictionsCount: Int
    let outcomeWinners: Int
    let exactWinners: Int
}

nonisolated struct AcPredictableMatch: Decodable, Identifiable, Hashable {
    let fixture: AcFixture
    let locked: Bool
    let probs: AcModelProbs
    let crowd: AcPredictionCrowd
    let predictionsCount: Int
    let myPrediction: AcMyPrediction?
    let settlement: AcPredictionSettlement?

    var id: Int { fixture.id }
}

nonisolated struct AcPredictionMeStats: Decodable, Hashable {
    let points: Int
    let correct: Int
    let exact: Int
    let played: Int
    let currentStreak: Int
}

nonisolated struct AcPredictionLeader: Decodable, Identifiable, Hashable {
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

nonisolated struct AcPredictionsTodayResponse: Decodable, Hashable {
    let matches: [AcPredictableMatch]
    let me: AcPredictionMeStats?
}

private nonisolated struct AcPredictionsLeaderboardResponse: Decodable {
    let leaders: [AcPredictionLeader]
}

private nonisolated struct AcPredictionSubmitBody: Encodable {
    let fixtureId: Int
    let predHome: Int
    let predAway: Int
}

private nonisolated struct AcPredictionSubmitResponse: Decodable {
    let prediction: AcMyPrediction
}

// MARK: - الهدّافون (API-Football topscorers)

nonisolated struct AcScorer: Decodable, Hashable {
    let rank: Int
    let id: Int          // معرّف اللاعب عند المزوّد (0 = غير معروف)
    let name: String     // الاسم معرّبًا عربيًّا
    let nameEn: String   // الاسم الأصلي (لاتيني) للغات غير العربية
    let photo: String
    let team: AcTeam
    let goals: Int
    let assists: Int
    let penalties: Int
    let minutes: Int
    let matches: Int
}
private nonisolated struct AcScorersResponse: Decodable { let scorers: [AcScorer] }

/// قادة الصناعات/البطاقات — نفس شكل المونديال.
nonisolated struct AcLeader: Decodable, Hashable, Identifiable {
    let rank: Int
    let id: Int
    let name: String
    let nameEn: String?
    let photo: String
    let team: AcTeam
    let goals: Int
    let assists: Int
    let yellow: Int
    let red: Int
    let minutes: Int
    let matches: Int
}
private nonisolated struct AcLeadersResponse: Decodable { let leaders: [AcLeader] }

nonisolated struct AcMomentumPoint: Decodable, Hashable, Identifiable {
    let label: String
    let minute: Int
    let home: Double
    let away: Double
    let net: Double
    var id: Int { minute }
}
nonisolated struct AcMomentum: Decodable, Hashable {
    let available: Bool
    let live: Bool
    let possession: AcPossession?
    let points: [AcMomentumPoint]
}
nonisolated struct AcPossession: Decodable, Hashable {
    let home: Int
    let away: Int
}
nonisolated struct AcPressureLatest: Decodable, Hashable {
    let side: String
    let value: Double
}
nonisolated struct AcPressure: Decodable, Hashable {
    let available: Bool
    let live: Bool
    let latest: AcPressureLatest?
    let points: [AcMomentumPoint]
}
nonisolated struct AcCommentaryItem: Decodable, Hashable, Identifiable {
    let minute: Int
    let extraMinute: Int?
    let goal: Bool
    let important: Bool
    let textAr: String
    let textEn: String
    let order: Int
    var id: String { "\(order)-\(minute)" }
}
nonisolated struct AcCommentary: Decodable, Hashable {
    let available: Bool
    let live: Bool
    let items: [AcCommentaryItem]
}

nonisolated struct AcAlertPreferences: Codable, Hashable {
    var kickoff: Bool
    var goals: Bool
    var cards: Bool
    var varReview: Bool
    var fulltime: Bool

    static let allOn = AcAlertPreferences(kickoff: true, goals: true, cards: true, varReview: true, fulltime: true)
}
private nonisolated struct AcAlertPrefsResponse: Decodable { let preferences: AcAlertPreferences }
private nonisolated struct AcAlertPrefsBody: Encodable {
    let kickoff: Bool
    let goals: Bool
    let cards: Bool
    let varReview: Bool
    let fulltime: Bool
}

// MARK: - شجرة الأدوار الإقصائية

nonisolated struct AcBracketRound: Decodable, Identifiable, Hashable {
    let round: String
    let roundEn: String
    let matches: [AcFixture]
    var id: String { roundEn }
}
nonisolated struct AcBracket: Decodable, Hashable {
    let source: String
    let rounds: [AcBracketRound]
}

// MARK: - صفحة المنتخب + القائمة

nonisolated struct AcSquadPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let nameEn: String
    let number: Int?
    let position: String
    let positionEn: String
    let age: Int?
    let photo: String
}
nonisolated struct AcTeamProfile: Decodable, Hashable {
    let team: AcTeam
    let isSaudi: Bool
    let coach: String?
    let group: AcGroup?
    let stats: AcTeamStats?
    let nextMatch: AcFixture?
    let fixtures: [AcFixture]
    let squad: [AcSquadPlayer]
    let fifaRank: AcFifaRank?
    let seasonStats: AcTeamSeasonStats?
}

// تصنيف فيفا (TheSports عبر جسر الخادم).
nonisolated struct AcFifaRank: Decodable, Hashable {
    let rank: Int
    let points: Double?
    let change: Int?
}

nonisolated struct AcSeasonStatItem: Decodable, Hashable {
    let label: String
    let value: Double
    let percent: Bool?
}

nonisolated struct AcTeamSeasonStats: Decodable, Hashable {
    let available: Bool
    let matches: Int
    let items: [AcSeasonStatItem]
}

// قناة بثّ (TheSports) — تُعرض في تفاصيل المباراة.
nonisolated struct AcTvChannel: Decodable, Hashable, Identifiable {
    let name: String
    let country: String?
    let logo: String?
    var id: String { name + (country ?? "") }
}

nonisolated struct AcQualificationGoals: Decodable, Hashable {
    let `for`: Int?
    let against: Int?
}

nonisolated struct AcQualificationStats: Decodable, Hashable {
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
}

nonisolated struct AcQualificationTimelineItem: Decodable, Identifiable, Hashable {
    let id: String
    let kind: String
    let date: String?
    let title: String
    let subtitle: String?
    let competition: String?
    let round: String?
    let opponent: AcTeam?
    let isHome: Bool?
    let venue: AcVenue?
    let goals: AcQualificationGoals
    let result: String?
    let status: String?
}

nonisolated struct AcQualificationJourney: Decodable, Hashable {
    let team: AcTeam
    let available: Bool
    let method: String
    let source: String
    let title: String
    let subtitle: String
    let stats: AcQualificationStats
    let timeline: [AcQualificationTimelineItem]
    let updatedAt: String
}

nonisolated struct AcPlayerCareerStop: Decodable, Identifiable, Hashable {
    let teamId: Int
    let team: String
    let logo: String
    let seasons: [Int]
    var id: String { "\(teamId)-\(seasons.first ?? 0)-\(seasons.last ?? 0)" }
}

nonisolated struct AcPlayerTrophy: Decodable, Identifiable, Hashable {
    let competition: String
    let country: String
    let season: String
    let place: String
    let winner: Bool
    var id: String { "\(competition)-\(season)-\(place)" }
}

nonisolated struct AcPlayerTransfer: Decodable, Identifiable, Hashable {
    let date: String?
    let type: String
    let from: AcTeam?
    let to: AcTeam?
    var id: String { "\(date ?? "")-\(type)-\(from?.id ?? 0)-\(to?.id ?? 0)" }
}

nonisolated struct AcPlayerTournamentStats: Decodable, Hashable {
    let matches: Int
    let lineups: Int
    let minutes: Int
    let rating: Double?
    let goals: Int
    let assists: Int
    let shots: Int
    let shotsOn: Int
    let passes: Int
    let keyPasses: Int
    let tackles: Int
    let yellow: Int
    let red: Int
    let saves: Int
    let conceded: Int
    let penaltiesScored: Int
    let penaltiesMissed: Int
}

nonisolated struct AcPlayerMarketPoint: Decodable, Hashable {
    let time: Int
    let value: Int
}

nonisolated struct AcPlayerMarket: Decodable, Hashable {
    let available: Bool
    let value: Int?
    let currency: String
    let source: String
    let history: [AcPlayerMarketPoint]
}

nonisolated struct AcPlayerSourceFlags: Decodable, Hashable {
    let apiFootball: Bool
    let theSports: Bool
}

nonisolated struct AcPlayerInjury: Decodable, Hashable {
    let reason: String
}

nonisolated struct AcPlayerCard: Decodable, Hashable {
    let id: Int
    let name: String
    let fullName: String?
    let photo: String
    let nationality: String?
    let position: String
    let positionEn: String
    let number: Int?
    let age: Int?
    let birthDate: String?
    let birthPlace: String?
    let height: Int?
    let weight: Int?
    let currentTeam: AcTeam?
    let career: [AcPlayerCareerStop]
    let trophies: [AcPlayerTrophy]
    let transfers: [AcPlayerTransfer]
    let stats: AcPlayerTournamentStats?
    let injury: AcPlayerInjury?
    let market: AcPlayerMarket
    let sources: AcPlayerSourceFlags
}

nonisolated struct AcTeamStats: Decodable, Hashable {
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

// MARK: - تفاصيل المباراة (أحداث + تشكيلات + إحصاءات + تقييمات)

nonisolated struct AcMatchEvent: Decodable, Hashable {
    let minute: Int
    let extraMinute: Int?
    let teamId: Int
    let type: String
    let label: String
    let detail: String
    let player: String
    let playerEn: String
    let playerId: Int?
    let assist: String?
    let assistEn: String?
    let assistId: Int?
}

nonisolated struct AcLineupPlayer: Decodable, Hashable {
    let id: Int
    let name: String
    let nameEn: String
    let number: Int?
    let position: String?
    let grid: String?
}

nonisolated struct AcLineup: Decodable, Hashable {
    let teamId: Int
    let teamName: String
    let formation: String?
    let coach: String
    let startXI: [AcLineupPlayer]
    let substitutes: [AcLineupPlayer]
}

nonisolated struct AcStatistic: Decodable, Hashable {
    let key: String
    let label: String
    let home: String
    let away: String
}

nonisolated struct AcPlayerRating: Decodable, Hashable {
    let id: Int
    let name: String
    let nameEn: String
    let photo: String
    let teamId: Int
    let number: Int?
    let position: String
    let rating: Double
    let minutes: Int
    let goals: Int
    let assists: Int
    let captain: Bool
}

nonisolated struct AcMatchPrediction: Decodable, Hashable {
    let home: Int
    let draw: Int
    let away: Int
}

nonisolated struct AcMatchDetail: Decodable, Hashable {
    let fixture: AcFixture
    let events: [AcMatchEvent]
    let lineups: [AcLineup]
    let statistics: [AcStatistic]
    let ratings: [AcPlayerRating]
    let manOfTheMatch: AcPlayerRating?
    let prediction: AcMatchPrediction?
    let headToHead: [AcFixture]
    let tv: [AcTvChannel]?
}

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

// تنسيق التواريخ بتوقيت الرياض — تقويم ميلادي وأرقام لاتينية (3455) دائمًا،
// مع أسماء الأشهر/الأيام وفق لغة العرض الحالية (عربي، إنجليزي، ياباني ...).
enum AcFormat {
    private static let riyadh = TimeZone(identifier: "Asia/Riyadh")!
    private static let gregorian = Calendar(identifier: .gregorian)

    // لوكال لغة العرض الحالية مع فرض التقويم الميلادي والأرقام اللاتينية.
    private static var localizedLocale: Locale {
        let base = AcLocalization.shared.language.localeIdentifier
        return Locale(identifier: "\(base)@calendar=gregorian;numbers=latn")
    }

    private static func formatter(_ pattern: String) -> DateFormatter {
        let f = DateFormatter()
        f.timeZone = riyadh
        f.locale = localizedLocale
        f.calendar = gregorian
        f.dateFormat = pattern
        return f
    }

    static func kickoffDay(_ iso: String?) -> String {
        guard let iso, let d = AcDateMath.date(from: iso) else { return "" }
        return formatter("EEEE d MMMM").string(from: d)
    }

    static func kickoffTime(_ iso: String?) -> String {
        guard let iso, let d = AcDateMath.date(from: iso) else { return "" }
        return formatter("HH:mm").string(from: d)
    }

    static func dateRange(startIso: String?, endIso: String?) -> String {
        guard let startIso, let s = AcDateMath.date(from: startIso) else { return "" }
        let f = formatter("d MMMM yyyy")
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

    func fetchAcPredictionsToday(ignoreCache: Bool = false) async throws -> AcPredictionsTodayResponse {
        try await get(AcPredictionsTodayResponse.self, path: "/asian-cup/predictions/today",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.mobileAPI)
    }

    func fetchAcPredictionsLeaderboard(ignoreCache: Bool = false) async throws -> [AcPredictionLeader] {
        let r = try await get(AcPredictionsLeaderboardResponse.self, path: "/asian-cup/predictions/leaderboard",
                              ignoreCache: ignoreCache, apiRoot: URLConstants.mobileAPI)
        return r.leaders
    }

    func submitAcPrediction(fixtureId: Int, predHome: Int, predAway: Int) async throws -> AcMyPrediction {
        let body = AcPredictionSubmitBody(fixtureId: fixtureId, predHome: predHome, predAway: predAway)
        let response = try await post(
            AcPredictionSubmitResponse.self,
            path: "/asian-cup/predictions",
            body: body,
            apiRoot: URLConstants.mobileAPI
        )
        return response.prediction
    }

    // المرحلة 1 — نقاط API-Football الإضافية.

    func fetchAcScorers(ignoreCache: Bool = false) async throws -> [AcScorer] {
        let r = try await get(AcScorersResponse.self, path: "/asian-cup/scorers",
                              ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
        return r.scorers
    }

    func fetchAcAssists(ignoreCache: Bool = false) async throws -> [AcLeader] {
        try await get(AcLeadersResponse.self, path: "/asian-cup/assists",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).leaders
    }

    func fetchAcCards(ignoreCache: Bool = false) async throws -> [AcLeader] {
        try await get(AcLeadersResponse.self, path: "/asian-cup/cards",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).leaders
    }

    func fetchAcMomentum(_ fixtureId: Int, ignoreCache: Bool = false) async throws -> AcMomentum {
        try await get(AcMomentum.self, path: "/asian-cup/momentum/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAcPressure(_ fixtureId: Int, ignoreCache: Bool = false) async throws -> AcPressure {
        try await get(AcPressure.self, path: "/asian-cup/pressure/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAcCommentary(_ fixtureId: Int, ignoreCache: Bool = false) async throws -> AcCommentary {
        try await get(AcCommentary.self, path: "/asian-cup/commentary/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAcAlertPreferences() async throws -> AcAlertPreferences {
        try await get(AcAlertPrefsResponse.self, path: "/sports/alert-prefs",
                      ignoreCache: true, apiRoot: URLConstants.mobileAPI).preferences
    }

    func updateAcAlertPreferences(_ prefs: AcAlertPreferences) async throws {
        struct Ok: Decodable { let success: Bool? }
        _ = try await put(
            Ok.self,
            path: "/sports/alert-prefs",
            body: AcAlertPrefsBody(
                kickoff: prefs.kickoff, goals: prefs.goals, cards: prefs.cards,
                varReview: prefs.varReview, fulltime: prefs.fulltime
            ),
            apiRoot: URLConstants.mobileAPI
        )
    }

    func fetchAcBracket(ignoreCache: Bool = false) async throws -> AcBracket {
        try await get(AcBracket.self, path: "/asian-cup/bracket",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAcTeamProfile(_ teamId: Int, ignoreCache: Bool = false) async throws -> AcTeamProfile {
        try await get(AcTeamProfile.self, path: "/asian-cup/team/\(teamId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAcQualificationJourney(_ teamId: Int, ignoreCache: Bool = false) async throws -> AcQualificationJourney {
        try await get(AcQualificationJourney.self, path: "/asian-cup/team/\(teamId)/qualification",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAcPlayerCard(_ playerId: Int, ignoreCache: Bool = false) async throws -> AcPlayerCard {
        try await get(AcPlayerCard.self, path: "/asian-cup/player/\(playerId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAcMatchDetail(_ fixtureId: Int, ignoreCache: Bool = false) async throws -> AcMatchDetail {
        try await get(AcMatchDetail.self, path: "/asian-cup/match/\(fixtureId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAcFacts(ignoreCache: Bool = false) async throws -> AcFacts {
        try await get(AcFacts.self, path: "/asian-cup/facts",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
}

// حقائق البطولة (مصدر TheSports عبر الخادم): حامل اللقب، الأكثر تتويجًا، المضيف.
nonisolated struct AcFacts: Decodable {
    struct TitleHolder: Decodable {
        let name: String
        let titles: Int?
    }
    struct MostTitles: Decodable {
        let names: [String]
        let titles: Int?
    }

    let available: Bool
    let titleHolder: TitleHolder?
    let mostTitles: MostTitles?
    let host: String?
}
