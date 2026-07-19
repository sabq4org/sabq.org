import Foundation

// نماذج «نظام التوقّعات المتطوّر» (بركة متدرّجة مشتركة pari-mutuel) — مطابقة
// لـ DTOs الخادم في sportsPoolPredictionsService.ts. كل النقاط تحت
// /api/v1/sports/predictions/* بجلسة العضو (Bearer). nonisolated لأن
// SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor على مستوى المشروع.

// MARK: - الكيانات

nonisolated struct SpPoolProbs: Decodable, Hashable {
    let home: Int
    let draw: Int
    let away: Int
}

nonisolated struct SpPoolCrowd: Decodable, Hashable {
    let home: Int
    let draw: Int
    let away: Int
    let total: Int
}

// طبقة التوقّع — للعرض والألوان.
nonisolated enum SpTier: String, Decodable, Hashable {
    case exact, margin, outcome, none

    var labelAr: String {
        switch self {
        case .exact: return "النتيجة الدقيقة"
        case .margin: return "الفارق الصحيح"
        case .outcome: return "النتيجة الصحيحة"
        case .none: return "—"
        }
    }
    var emoji: String {
        switch self {
        case .exact: return "🎯"
        case .margin: return "📏"
        case .outcome: return "✅"
        case .none: return ""
        }
    }
}

nonisolated struct SpMyPoolPrediction: Decodable, Hashable {
    let predHome: Int
    let predAway: Int
    let status: String
    let tier: SpTier
    let outcomeHit: Bool
    let marginHit: Bool
    let exactHit: Bool
    let pointsAwarded: Int
}

nonisolated struct SpPoolSettlement: Decodable, Hashable {
    let status: String           // open | locked | settled
    let finalHome: Int?
    let finalAway: Int?
    let predictionsCount: Int
    let exactWinners: Int
    let marginWinners: Int
    let outcomeWinners: Int
    let poolBase: Int
    let poolCarryIn: Int
    let carryOut: Int
}

nonisolated struct SpPoolStatus: Decodable, Hashable {
    let code: String
    let label: String
    let live: Bool
    let finished: Bool
}

nonisolated struct SpPoolTeamLite: Decodable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct SpPoolGoals: Decodable, Hashable {
    let home: Int?
    let away: Int?
}

nonisolated struct SpPoolFixture: Decodable, Identifiable, Hashable {
    let id: Int
    let timestamp: Int
    let competition: String?
    let competitionSlug: String?
    let status: SpPoolStatus
    let home: SpPoolTeamLite
    let away: SpPoolTeamLite
    let goals: SpPoolGoals

    var kickoff: Date { Date(timeIntervalSince1970: TimeInterval(timestamp)) }
}

nonisolated struct SpPredictableMatch: Decodable, Identifiable, Hashable {
    let fixture: SpPoolFixture
    let locked: Bool
    let probs: SpPoolProbs
    let crowd: SpPoolCrowd
    let predictionsCount: Int
    let poolAvailable: Int
    let myPrediction: SpMyPoolPrediction?
    let settlement: SpPoolSettlement?

    var id: Int { fixture.id }
}

nonisolated struct SpMeStats: Decodable, Hashable {
    let points: Int
    let correct: Int
    let exact: Int
    let played: Int
    let currentStreak: Int
    let rank: Int?
    let badges: [String]
}

nonisolated struct SpPoolTodayResponse: Decodable {
    let matches: [SpPredictableMatch]
    let me: SpMeStats?
    let jackpot: Int
}

// MARK: - توقّعاتي

nonisolated struct SpMyPredictionRow: Decodable, Identifiable, Hashable {
    let fixtureId: Int
    let predHome: Int
    let predAway: Int
    let status: String
    let tier: SpTier
    let outcomeHit: Bool
    let marginHit: Bool
    let exactHit: Bool
    let pointsAwarded: Int
    let createdAt: String?
    let kickoffTs: Int?
    let competitionSlug: String?
    let homeTeamName: String
    let homeTeamLogo: String?
    let awayTeamName: String
    let awayTeamLogo: String?
    let finalHome: Int?
    let finalAway: Int?
    let matchStatus: String?

    var id: Int { fixtureId }
    var settled: Bool { matchStatus == "settled" }
    var won: Bool { settled && pointsAwarded > 0 }
}

nonisolated struct SpMineResponse: Decodable {
    let success: Bool?
    let predictions: [SpMyPredictionRow]
    let me: SpMeStats?
}

// MARK: - المتصدّرون

nonisolated struct SpPoolLeader: Decodable, Identifiable, Hashable {
    let rank: Int
    let userId: String
    let name: String
    let avatar: String?
    let totalPoints: Int
    let correctCount: Int
    let exactCount: Int
    let playedCount: Int
    let accuracy: Int

    var id: String { userId }
}

nonisolated struct SpPoolLeaderboardResponse: Decodable {
    let leaders: [SpPoolLeader]
}

// MARK: - طويلة المدى (البطل / الهدّاف)

nonisolated struct SpLongTeam: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct SpLongPools: Decodable, Hashable {
    let champion: Int
    let topScorer: Int
    enum CodingKeys: String, CodingKey { case champion; case topScorer = "top_scorer" }
}

nonisolated struct SpChampionVote: Decodable, Hashable {
    let teamId: Int?
    let n: Int
}

nonisolated struct SpLongMine: Decodable, Hashable {
    let kind: String
    let teamId: Int?
    let teamName: String?
    let teamLogo: String?
    let playerName: String?
    let status: String
    let pointsAwarded: Int
}

nonisolated struct SpLongResponse: Decodable {
    let competitionSlug: String
    let teams: [SpLongTeam]
    let pools: SpLongPools
    let championVotes: [SpChampionVote]
    let locked: Bool
    let mine: [SpLongMine]
}

// MARK: - أجسام الطلب

nonisolated struct SpPoolSubmitBody: Encodable {
    let fixtureId: Int
    let predHome: Int
    let predAway: Int
    let kickoffTs: Int
    let competitionSlug: String?
    let homeId: Int?
    let awayId: Int?
    let homeName: String
    let awayName: String
    let homeLogo: String?
    let awayLogo: String?
}

nonisolated struct SpPoolSubmitResponse: Decodable {
    let success: Bool?
    let reason: String?
    let prediction: SubmittedPrediction?
    nonisolated struct SubmittedPrediction: Decodable {
        let predHome: Int
        let predAway: Int
        let status: String
    }
}

nonisolated struct SpLongSubmitBody: Encodable {
    let competitionSlug: String
    let kind: String          // champion | top_scorer
    let teamId: Int?
    let playerName: String?
}

// MARK: - معاينة البركة (مطابقة لمنطق الخادم 50/30/20)

nonisolated enum SpPoolMath {
    static let split: (exact: Double, margin: Double, outcome: Double) = (0.5, 0.3, 0.2)

    /// حجم طبقة معيّنة من البركة المتاحة (للعرض فقط — النصيب الفعلي يعتمد عدد الفائزين).
    static func tierPool(_ available: Int, _ tier: SpTier) -> Int {
        let e = Int(Double(available) * split.exact)
        let m = Int(Double(available) * split.margin)
        switch tier {
        case .exact: return e
        case .margin: return m
        default: return available - e - m
        }
    }
}

// MARK: - نقاط الشبكة (Bearer عبر mobileAPI)

extension APIClient {
    /// مباريات اليوم القابلة للتوقّع + إحصاءاتي + الجاكبوت.
    func fetchPoolToday() async throws -> SpPoolTodayResponse {
        try await get(SpPoolTodayResponse.self, path: "/sports/predictions/today",
                      ignoreCache: true, apiRoot: URLConstants.mobileAPI)
    }

    /// إرسال/تعديل توقّع مباراة. يعيد الاستجابة كاملة (لاكتشاف الإقفال/الخطأ).
    func submitPoolPrediction(_ body: SpPoolSubmitBody) async throws -> SpPoolSubmitResponse {
        try await post(SpPoolSubmitResponse.self, path: "/sports/predictions",
                       body: body, apiRoot: URLConstants.mobileAPI)
    }

    /// توقّعاتي + إحصاءاتي.
    func fetchPoolMine() async throws -> SpMineResponse {
        try await get(SpMineResponse.self, path: "/sports/predictions/mine",
                      ignoreCache: true, apiRoot: URLConstants.mobileAPI)
    }

    /// لوحة المتصدّرين (نظام البركة).
    func fetchPoolLeaderboard(ignoreCache: Bool = false) async throws -> [SpPoolLeader] {
        try await get(SpPoolLeaderboardResponse.self, path: "/sports/predictions/leaderboard",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.mobileAPI).leaders
    }

    /// ملخّص تسوية مباراة (للتحديث بعد انتهائها).
    func fetchPoolMatch(_ fixtureId: Int) async throws -> SpPoolSettlement {
        try await get(SpPoolSettlement.self, path: "/sports/predictions/match/\(fixtureId)",
                      ignoreCache: true, apiRoot: URLConstants.mobileAPI)
    }

    /// توقّعات البطل/الهدّاف لبطولة.
    func fetchPoolLong(comp: String) async throws -> SpLongResponse {
        try await get(SpLongResponse.self, path: "/sports/predictions/long",
                      query: ["comp": comp], ignoreCache: true, apiRoot: URLConstants.mobileAPI)
    }

    /// إرسال توقّع طويل المدى (بطل/هدّاف).
    @discardableResult
    func submitPoolLong(_ body: SpLongSubmitBody) async throws -> Int {
        let data = try JSONEncoder().encode(body)
        return try await send(method: "POST", path: "/sports/predictions/long",
                              jsonBody: data, apiRoot: URLConstants.mobileAPI)
    }

    // MARK: - توقّعات الهدافين (Expansion A) + الأقسام (Expansion C)

    /// قائمة لاعبي مباراة لاختيار الهداف (يتطلّب تشكيلات API-Football).
    func fetchMatchScorers(fixtureId: Int) async throws -> SpMatchPlayersResponse {
        try await get(SpMatchPlayersResponse.self,
                      path: "/sports/predictions/scorers/\(fixtureId)",
                      ignoreCache: true, apiRoot: URLConstants.mobileAPI)
    }

    /// إرسال/تعديل توقّع الهدافين. يعيد الاستجابة كاملة.
    func submitPoolPick(_ body: SpPickSubmitBody) async throws -> SpPickSubmitResponse {
        try await post(SpPickSubmitResponse.self, path: "/sports/predictions/picks",
                       body: body, apiRoot: URLConstants.mobileAPI)
    }

    /// توقّعات الهدافين للمستخدم الحالي.
    func fetchPoolMyPicks() async throws -> SpMyPicksResponse {
        try await get(SpMyPicksResponse.self, path: "/sports/predictions/picks/mine",
                      ignoreCache: true, apiRoot: URLConstants.mobileAPI)
    }

    /// قسمي الأسبوعي + معلومات الأقسام الأربعة.
    func fetchMyDivision() async throws -> SpDivisionResponse {
        try await get(SpDivisionResponse.self, path: "/sports/predictions/division",
                      ignoreCache: true, apiRoot: URLConstants.mobileAPI)
    }

    /// لوحة متصدّري قسم معيّن (1-4).
    func fetchDivisionLeaderboard(division: Int) async throws -> SpDivisionBoardResponse {
        try await get(SpDivisionBoardResponse.self,
                      path: "/sports/predictions/division/\(division)",
                      ignoreCache: true, apiRoot: URLConstants.mobileAPI)
    }
}

// MARK: - نماذج الهدافين

nonisolated struct SpPickPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let teamId: Int
    let teamName: String
    let starter: Bool
}

nonisolated struct SpPickSide: Decodable, Hashable {
    let teamId: Int
    let teamName: String
    let players: [SpPickPlayer]
}

nonisolated struct SpMatchPlayersResponse: Decodable, Hashable {
    let fixtureId: Int
    let lineupsReady: Bool
    let kickoffTs: Int
    let locked: Bool
    let home: SpPickSide
    let away: SpPickSide
}

nonisolated enum SpPickKind: String, Codable, CaseIterable {
    case matchScorer = "match_scorer"
    case firstScorer = "first_scorer"

    var labelAr: String { self == .matchScorer ? "هداف المباراة" : "أول هدّاف" }
    var emoji: String { self == .matchScorer ? "⚽" : "🥇" }
    var pool: Int { self == .matchScorer ? 300 : 200 }
}

nonisolated struct SpPickSubmitBody: Encodable {
    let fixtureId: Int
    let kind: String
    let playerId: Int
    let playerName: String
    let teamId: Int
    let teamName: String?
}

nonisolated struct SpPickSubmitResponse: Decodable {
    let success: Bool?
    let reason: String?
    let pick: SubmittedPick?
    nonisolated struct SubmittedPick: Decodable {
        let kind: String
        let playerId: Int
        let playerName: String
        let status: String
    }
}

nonisolated struct SpActualScorer: Decodable, Hashable {
    let playerId: Int
    let name: String
    let teamId: Int
    let minute: Int?
}

nonisolated struct SpMyPickRow: Decodable, Identifiable, Hashable {
    let fixtureId: Int
    let kind: String
    let playerId: Int
    let playerName: String
    let teamId: Int
    let teamName: String?
    let status: String
    let pointsAwarded: Int
    let kickoffTs: Int?
    let competitionSlug: String?
    let homeTeamName: String?
    let awayTeamName: String?
    let finalHome: Int?
    let finalAway: Int?
    let actualScorers: [SpActualScorer]?
    let firstScorerId: Int?

    var id: String { "\(fixtureId)-\(kind)" }
    var pickKind: SpPickKind? { SpPickKind(rawValue: kind) }
    var settled: Bool { status == "correct" || status == "incorrect" }
    var won: Bool { status == "correct" && pointsAwarded > 0 }
}

nonisolated struct SpMyPicksResponse: Decodable {
    let success: Bool?
    let picks: [SpMyPickRow]
}

// MARK: - نماذج الأقسام الأسبوعية

nonisolated struct SpDivisionMeta: Decodable, Hashable {
    let nameAr: String
    let emoji: String
    let color: String
}

nonisolated struct SpMyDivision: Decodable, Hashable {
    let division: Int
    let weekId: String
    let weekPoints: Int
    let seasonPoints: Int
}

nonisolated struct SpDivisionResponse: Decodable {
    let success: Bool?
    let division: SpMyDivision?
    let meta: [String: SpDivisionMeta]?
}

nonisolated struct SpDivisionLeader: Decodable, Identifiable, Hashable {
    let userId: String
    let weekPoints: Int
    let seasonPoints: Int
    var id: String { userId }
}

nonisolated struct SpDivisionBoardResponse: Decodable {
    let success: Bool?
    let division: Int
    let meta: SpDivisionMeta?
    let leaders: [SpDivisionLeader]
}
