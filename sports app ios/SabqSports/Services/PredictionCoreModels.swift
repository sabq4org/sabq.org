import Foundation

// نماذج «المنصة المركزية للتوقّعات» (Prediction Core) — مطابقة لعقود الخادم
// في shared/predictions.ts ومسارات /api/v1/predictions/* بجلسة العضو (Bearer).
// نظام موحّد لكل البطولات (ما عدا مونديال 2026 الباقي على مساره القديم).
// nonisolated لأن SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor على مستوى المشروع.

// MARK: - البطولات

nonisolated struct PredCompetitionSummary: Decodable, Hashable, Identifiable {
    let id: String
    let slug: String
    let nameAr: String
    let seasonKey: String
    let status: String
    let openContests: Int
    let myPoints: Int?
}

nonisolated struct PredCompetitionsResponse: Decodable {
    let competitions: [PredCompetitionSummary]
}

nonisolated struct PredCompetitionRow: Decodable, Hashable {
    let id: String
    let slug: String
    let nameAr: String
    let seasonKey: String
    let status: String
}

nonisolated struct PredCompetitionDetailResponse: Decodable {
    let competition: PredCompetitionRow
    let contests: [PredContest]
}

// MARK: - المسابقات

nonisolated struct PredTeamMeta: Decodable, Hashable {
    let name: String?
    let logo: String?
}

nonisolated struct PredPenaltiesMeta: Decodable, Hashable {
    let home: Int?
    let away: Int?
}

nonisolated struct PredContestMeta: Decodable, Hashable {
    let home: PredTeamMeta?
    let away: PredTeamMeta?
    let round: String?
    let venue: String?
    let penalties: PredPenaltiesMeta?
}

/// حمولة توقّع نتيجة مباراة — كل الحقول اختيارية كي يمرّ فكّ الترميز
/// لحمولات الأنواع الأخرى (بطل/هدّاف) دون فشل.
nonisolated struct PredScorePayload: Codable, Hashable {
    var predHome: Int?
    var predAway: Int?
}

nonisolated struct PredMyEntry: Decodable, Hashable {
    let id: String
    let payload: PredScorePayload?
}

nonisolated struct PredScoreResult: Decodable, Hashable {
    let finalHome: Int?
    let finalAway: Int?
    let penalties: PredPenaltiesMeta?
}

nonisolated struct PredContest: Decodable, Hashable, Identifiable {
    let id: String
    let competitionId: String?
    let contestType: String
    let status: String              // open | locked | ready | settled | void
    let opensAt: String?
    let locksAt: String
    let settledAt: String?
    /// معرّف المباراة عند المصدر (API-Football) — جسر الربط بمركز المباراة.
    let externalRef: String?
    let metadata: PredContestMeta?
    let result: PredScoreResult?
    /// عدد المشاركين النشطين — رقم فقط، بلا أسماء (الأسماء في المتصدرين).
    let entriesCount: Int?
    let myEntry: PredMyEntry?

    var locksAtDate: Date? { PredDates.parse(locksAt) }
    var isMatchScore: Bool { contestType == "match_score" }
    var predictorsCount: Int { entriesCount ?? 0 }
}

// MARK: - القاعدة (ملف الاحتساب الفعّال — لتوليد شريط القاعدة، لا نص ثابت)

nonisolated struct PredRuleTiers: Decodable, Hashable {
    let exact: Double?
    let signedMargin: Double?
    let outcome: Double?
}

nonisolated struct PredRuleParams: Decodable, Hashable {
    let basePool: Int?
    let tiers: PredRuleTiers?
    let winCriterion: String?       // exact | outcome (shared_pool)
}

nonisolated struct PredRule: Decodable, Hashable {
    let strategyKey: String
    let version: Int
    let params: PredRuleParams?

    /// نص القاعدة المولّد من الملف الفعّال.
    var summaryAr: String {
        guard let params else { return L("تُحتسب النقاط بعد صافرة النهاية") }
        switch strategyKey {
        case "tiered_pool":
            let pool = params.basePool ?? 0
            let e = Int(((params.tiers?.exact ?? 0) * 100).rounded())
            let m = Int(((params.tiers?.signedMargin ?? 0) * 100).rounded())
            let o = Int(((params.tiers?.outcome ?? 0) * 100).rounded())
            return Lf("جائزة المباراة %d نقطة: %d٪ للنتيجة الدقيقة، %d٪ للفارق الصحيح، %d٪ للاتجاه — وما لا يُوزَّع يتراكم للمباراة التالية", pool, e, m, o)
        case "shared_pool":
            let pool = params.basePool ?? 0
            return params.winCriterion == "exact"
                ? Lf("جائزة %d نقطة تُقسم بالتساوي على أصحاب النتيجة الدقيقة", pool)
                : Lf("جائزة %d نقطة تُقسم بالتساوي على من أصابوا اتجاه المباراة", pool)
        case "skill_weighted":
            return L("نقاط مهارية: دقة توقّعك × جرأته × سلسلة إصاباتك")
        case "fixed_points":
            return L("نقاط ثابتة حسب دقة التوقّع")
        default:
            return L("تُحتسب النقاط بعد صافرة النهاية")
        }
    }
}

nonisolated struct PredContestDetailResponse: Decodable {
    let id: String
    let contestType: String
    let status: String
    let opensAt: String?
    let locksAt: String
    let settledAt: String?
    let metadata: PredContestMeta?
    let result: PredScoreResult?
    let entriesCount: Int?
    let myEntry: PredMyEntry?
    let rule: PredRule?

    var locksAtDate: Date? { PredDates.parse(locksAt) }
    var predictorsCount: Int { entriesCount ?? 0 }
}

// MARK: - الإرسال

nonisolated struct PredEntryBody: Encodable {
    let prediction: PredScorePayload
}

nonisolated struct PredEntrySaved: Decodable {
    let id: String
}

nonisolated struct PredEntrySaveResponse: Decodable {
    let entry: PredEntrySaved
}

// MARK: - «توقعاتي» (me/entries — نظير تبويب الويب #1413)

nonisolated struct PredMyEntryItem: Decodable, Hashable, Identifiable {
    let contestId: String
    let contestType: String
    let status: String
    let locksAt: String?
    let settledAt: String?
    let metadata: PredContestMeta?
    let result: PredScoreResult?
    let payload: PredScorePayload?
    let totalPoints: Int?

    var id: String { contestId }
    var locksAtDate: Date? { PredDates.parse(locksAt) }
}

nonisolated struct PredMyEntriesResponse: Decodable {
    let items: [PredMyEntryItem]
    let nextCursor: String?
}

// MARK: - سجل النقاط

nonisolated struct PredLedgerItem: Decodable, Hashable, Identifiable {
    let id: String
    let contestId: String?
    let points: Int
    let reasonCode: String
    let reasonLabelAr: String
    let createdAt: String

    var createdAtDate: Date? { PredDates.parse(createdAt) }
}

nonisolated struct PredLedgerResponse: Decodable {
    let items: [PredLedgerItem]
    let nextCursor: String?
}

nonisolated struct PredPointsCompetitionRow: Decodable, Hashable {
    let competitionId: String
    let slug: String
    let nameAr: String
    let points: Int
    let awards: Int
}

nonisolated struct PredMyPointsResponse: Decodable {
    let competitions: [PredPointsCompetitionRow]
}

// MARK: - لوحة المتصدرين

nonisolated struct PredLeaderEntry: Decodable, Hashable, Identifiable {
    let rank: Int
    let userId: String
    let name: String
    let profileImageUrl: String?
    let points: Int
    let exactCount: Int

    var id: String { userId }
}

nonisolated struct PredMyRank: Decodable, Hashable {
    let rank: Int
    let points: Int
}

nonisolated struct PredLeaderboardResponse: Decodable {
    let nameAr: String
    let seasonKey: String?
    let entries: [PredLeaderEntry]
    let myRank: PredMyRank?
}

// MARK: - التسوية وتفصيل النقاط

nonisolated struct PredAwardPool: Decodable, Hashable {
    let base: Int?
    let carriedIn: Int?
    let tierShare: Double?
    let tierPoints: Int?
    let winners: Int?
}

nonisolated struct PredAwardBreakdown: Decodable, Hashable {
    let prediction: String?
    let finalScore: String?
    let pool: PredAwardPool?
}

nonisolated struct PredAwardWallet: Decodable, Hashable {
    let multiplier: Double
    let walletPoints: Int
    let delivered: Bool
}

nonisolated struct PredMyAward: Decodable, Hashable, Identifiable {
    let points: Int
    let reasonCode: String
    let reasonLabelAr: String
    let breakdown: PredAwardBreakdown?
    let referenceId: String
    let wallet: PredAwardWallet?

    var id: String { referenceId }
}

nonisolated struct PredSettlementResponse: Decodable {
    let contestId: String
    let result: PredScoreResult?
    let settledAt: String?
    let myAwards: [PredMyAward]
}

// MARK: - جسر بطولات الرياضة → بطولات المنصة

/// بادئة slug بطولة التوقعات المقابلة لبطولة الرياضة (المزروع: rsl-2026،
/// kings-cup-2026…). البادئة تُطابَق على قائمة /competitions الحية — لا slug
/// مزروع في التطبيق، فتنجو من تبدّل المواسم (نهج أندرويد المعتمد).
nonisolated enum PredCompetitionBridge {
    static func prefix(forSportsSlug slug: String?) -> String? {
        switch slug {
        case "pro-league": "rsl"
        case "kings-cup": "kings-cup"
        case "super-cup": "super-cup"
        case "gulf-cup": "gulf-cup"
        case "asian-cup": "asian-cup"
        default: nil
        }
    }
}

// MARK: - عرض الأرقام في سياق RTL

/// زوج نتيجة داخل عزل LTR **بالضيف أولًا**: في صف RTL (المضيف يمينًا) يثبت
/// رقم كل فريق تحت عموده — قلب الترتيب داخل العزل هو درع الانقلاب المعتمد.
nonisolated enum PredFormat {
    static func scorePair(home: Int, away: Int) -> String {
        "\u{2066}\(away)–\(home)\u{2069}"
    }
}

// MARK: - تواريخ ISO من الخادم

nonisolated enum PredDates {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parse(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        return withFraction.date(from: raw) ?? plain.date(from: raw)
    }

    /// «يُقفل بعد ٢س ١٤د» — عدّ تنازلي مختصر حتى الإغلاق.
    static func countdown(to date: Date, from now: Date = Date()) -> String? {
        let seconds = Int(date.timeIntervalSince(now))
        guard seconds > 0 else { return nil }
        let days = seconds / 86_400
        let hours = (seconds % 86_400) / 3_600
        let minutes = (seconds % 3_600) / 60
        if days > 0 { return Lf("يُقفل بعد %dي %dس", days, hours) }
        if hours > 0 { return Lf("يُقفل بعد %dس %dد", hours, minutes) }
        return Lf("يُقفل بعد %dد", max(minutes, 1))
    }
}

// MARK: - نداءات الشبكة

extension APIClient {
    func fetchPredCompetitions() async throws -> PredCompetitionsResponse {
        try await get(PredCompetitionsResponse.self,
                      path: "/predictions/competitions",
                      ignoreCache: true,
                      apiRoot: URLConstants.mobileAPI)
    }

    func fetchPredCompetition(slug: String) async throws -> PredCompetitionDetailResponse {
        try await get(PredCompetitionDetailResponse.self,
                      path: "/predictions/competitions/\(slug)",
                      ignoreCache: true,
                      apiRoot: URLConstants.mobileAPI)
    }

    func fetchPredContest(id: String) async throws -> PredContestDetailResponse {
        try await get(PredContestDetailResponse.self,
                      path: "/predictions/contests/\(id)",
                      ignoreCache: true,
                      apiRoot: URLConstants.mobileAPI)
    }

    func submitPredEntry(contestId: String, predHome: Int, predAway: Int) async throws -> PredEntrySaveResponse {
        try await requestJSON(PredEntrySaveResponse.self,
                              method: "PUT",
                              path: "/predictions/contests/\(contestId)/entry",
                              body: PredEntryBody(prediction: PredScorePayload(predHome: predHome, predAway: predAway)),
                              apiRoot: URLConstants.mobileAPI)
    }

    func fetchPredLedger(competitionSlug: String?, cursor: String?) async throws -> PredLedgerResponse {
        var query: [String: String] = [:]
        if let competitionSlug { query["competition"] = competitionSlug }
        if let cursor { query["cursor"] = cursor }
        return try await get(PredLedgerResponse.self,
                             path: "/predictions/me/ledger",
                             query: query,
                             ignoreCache: true,
                             apiRoot: URLConstants.mobileAPI)
    }

    /// «توقعاتي» عبر البطولات — يتطلب جلسة عضو (401 بلا Bearer).
    func fetchPredMyEntries(competitionSlug: String? = nil, limit: Int? = nil) async throws -> PredMyEntriesResponse {
        var query: [String: String] = [:]
        if let competitionSlug { query["competition"] = competitionSlug }
        if let limit { query["limit"] = String(limit) }
        return try await get(PredMyEntriesResponse.self,
                             path: "/predictions/me/entries",
                             query: query,
                             ignoreCache: true,
                             apiRoot: URLConstants.mobileAPI)
    }

    func fetchPredLeaderboard(competitionSlug: String) async throws -> PredLeaderboardResponse {
        try await get(PredLeaderboardResponse.self,
                      path: "/predictions/leaderboards",
                      query: ["competition": competitionSlug],
                      ignoreCache: true,
                      apiRoot: URLConstants.mobileAPI)
    }

    func fetchPredSettlement(contestId: String) async throws -> PredSettlementResponse {
        try await get(PredSettlementResponse.self,
                      path: "/predictions/contests/\(contestId)/settlement",
                      ignoreCache: true,
                      apiRoot: URLConstants.mobileAPI)
    }
}
