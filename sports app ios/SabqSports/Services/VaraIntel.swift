import Foundation

// MARK: - محرّك الذكاء الرياضي (VARA Intelligence) — نماذج الموبايل
//
// نظير iOS لمحرّك «الذكاء الرياضي» في الخادم (server/services/sportsIntelligence).
// يحوّل البيانات الخام إلى رؤى مؤسَّسة على الحقائق:
//   • «المشهد الآن»    — لقطات عامة مصنّفة بالأهمية (عام:  /api/sports/intel/scene)
//   • بطاقة المباراة الذكية + التوقّع المفسّر (عام: /api/sports/intel/match/:id)
//   • «قصص الموسم» للبطولة (عام: /api/sports/intel/competition/:slug)
//   • الموجز المخصّص (جلسة العضو: /api/v1/sports/intel/digest)
//   • المساعد المحادثي RAG (عام: /api/v1/sports/intel/ask)
//
// كل الأنواع nonisolated Decodable (SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor).
// الاستجابات تعيد لقطات مخزَّنة جاهزة على الخادم (بلا انتظار LLM من العميل).

// MARK: - لقطة رؤية عامة (المشهد / قصص الموسم)

/// لقطة ذكاء واحدة — تُغذّي بطاقات «المشهد الآن» و«قصص الموسم».
/// `entities`/`sourceStats` من الخادم تُتجاهل هنا (Decodable يتجاوز المفاتيح الزائدة).
nonisolated struct VaraIntelInsight: Identifiable, Decodable, Equatable {
    let id: String
    let scope: String
    let kind: String
    let importance: Int
    let competitionSlug: String?
    let headline: String
    let body: String
}

// MARK: - «المشهد الآن»

nonisolated struct VaraSceneResponse: Decodable {
    let configured: Bool
    let summary: VaraIntelInsight?
    let cards: [VaraIntelInsight]

    enum CodingKeys: String, CodingKey { case configured, summary, cards }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        configured = (try? c.decode(Bool.self, forKey: .configured)) ?? false
        summary = try? c.decodeIfPresent(VaraIntelInsight.self, forKey: .summary)
        cards = (try? c.decode([VaraIntelInsight].self, forKey: .cards)) ?? []
    }
}

// MARK: - «قصص الموسم» (بطولة)

nonisolated struct VaraCompetitionIntelResponse: Decodable {
    let configured: Bool
    let cards: [VaraIntelInsight]

    enum CodingKeys: String, CodingKey { case configured, cards }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        configured = (try? c.decode(Bool.self, forKey: .configured)) ?? false
        cards = (try? c.decode([VaraIntelInsight].self, forKey: .cards)) ?? []
    }
}

// MARK: - بطاقة المباراة الذكية + التوقّع المفسّر

nonisolated enum VaraMatchPhase: String, Decodable {
    case pre, live, post

    var label: String {
        switch self {
        case .pre:  return "قبل المباراة"
        case .live: return "مباشر الآن"
        case .post: return "بعد المباراة"
        }
    }
    var icon: String {
        switch self {
        case .pre:  return "sparkles"
        case .live: return "dot.radiowaves.left.and.right"
        case .post: return "checkmark.seal.fill"
        }
    }
}

nonisolated struct VaraSmartMatchCard: Decodable, Equatable {
    let phase: VaraMatchPhase
    let headline: String
    let body: String
    let bullets: [String]

    enum CodingKeys: String, CodingKey { case phase, headline, body, bullets }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        phase = (try? c.decode(VaraMatchPhase.self, forKey: .phase)) ?? .pre
        headline = (try? c.decode(String.self, forKey: .headline)) ?? ""
        body = (try? c.decode(String.self, forKey: .body)) ?? ""
        bullets = (try? c.decode([String].self, forKey: .bullets)) ?? []
    }
}

nonisolated struct VaraPredictionProbabilities: Decodable, Equatable {
    let home: Int
    let draw: Int
    let away: Int
}

nonisolated struct VaraExplainedPrediction: Decodable, Equatable {
    let headline: String
    let body: String
    let probabilities: VaraPredictionProbabilities?

    enum CodingKeys: String, CodingKey { case headline, body, probabilities }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        headline = (try? c.decode(String.self, forKey: .headline)) ?? ""
        body = (try? c.decode(String.self, forKey: .body)) ?? ""
        probabilities = try? c.decodeIfPresent(VaraPredictionProbabilities.self, forKey: .probabilities)
    }
}

nonisolated struct VaraMatchIntelResponse: Decodable {
    let configured: Bool
    let card: VaraSmartMatchCard?
    let prediction: VaraExplainedPrediction?

    enum CodingKeys: String, CodingKey { case configured, card, prediction }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        configured = (try? c.decode(Bool.self, forKey: .configured)) ?? false
        card = try? c.decodeIfPresent(VaraSmartMatchCard.self, forKey: .card)
        prediction = try? c.decodeIfPresent(VaraExplainedPrediction.self, forKey: .prediction)
    }
}

// MARK: - الموجز المخصّص

nonisolated struct VaraDigest: Decodable, Equatable {
    let headline: String
    let body: String
}

nonisolated struct VaraDigestResponse: Decodable {
    let success: Bool
    let configured: Bool
    let digest: VaraDigest?

    enum CodingKeys: String, CodingKey { case success, configured, digest }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        success = (try? c.decode(Bool.self, forKey: .success)) ?? false
        configured = (try? c.decode(Bool.self, forKey: .configured)) ?? false
        digest = try? c.decodeIfPresent(VaraDigest.self, forKey: .digest)
    }
}

// MARK: - المساعد المحادثي (RAG)

nonisolated struct VaraCopilotResponse: Decodable {
    let success: Bool
    let configured: Bool
    let answer: String?
    let usedCompetitions: [String]?

    enum CodingKeys: String, CodingKey { case success, configured, answer, usedCompetitions }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        success = (try? c.decode(Bool.self, forKey: .success)) ?? false
        configured = (try? c.decode(Bool.self, forKey: .configured)) ?? false
        answer = try? c.decodeIfPresent(String.self, forKey: .answer)
        usedCompetitions = try? c.decodeIfPresent([String].self, forKey: .usedCompetitions)
    }
}

private nonisolated struct VaraCopilotRequest: Encodable { let question: String }

// MARK: - نقاط الوصول (توسعة APIClient)

extension APIClient {
    /// «المشهد الآن» — لقطات ذكاء عامة عبر البطولات (خلاصة + بطاقات).
    func fetchIntelScene(ignoreCache: Bool = false) async throws -> VaraSceneResponse {
        try await get(VaraSceneResponse.self, path: "/sports/intel/scene",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// «قصص الموسم» لبطولة (أنماط وشذوذات مؤسَّسة على الترتيب والهدّافين).
    func fetchIntelCompetition(slug: String, ignoreCache: Bool = false) async throws -> VaraCompetitionIntelResponse {
        try await get(VaraCompetitionIntelResponse.self, path: "/sports/intel/competition/\(slug)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// بطاقة المباراة الذكية + التوقّع المفسّر (إن كانت مرتقبة).
    func fetchIntelMatch(id: Int, ignoreCache: Bool = false) async throws -> VaraMatchIntelResponse {
        try await get(VaraMatchIntelResponse.self, path: "/sports/intel/match/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// الموجز الرياضي المخصّص — يحتاج جلسة العضو (Bearer)؛ عبر بوابة /api/v1.
    func fetchIntelDigest(ignoreCache: Bool = true) async throws -> VaraDigestResponse {
        try await get(VaraDigestResponse.self, path: "/sports/intel/digest",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.mobileAPI)
    }

    /// المساعد المحادثي — سؤال حرّ يُجاب من بياناتنا الحيّة (بوابة /api/v1، معفاة من CSRF).
    func askIntelCopilot(question: String) async throws -> VaraCopilotResponse {
        try await post(VaraCopilotResponse.self, path: "/sports/intel/ask",
                       body: VaraCopilotRequest(question: question), apiRoot: URLConstants.mobileAPI)
    }
}
