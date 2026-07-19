import Foundation

// MARK: - معاينة الدعوة

struct GcMajlisInvitePreview: Decodable, Hashable {
    let code: String
    let name: String
    let membersCount: Int
    let maxMembers: Int
    let full: Bool
    let joinUrl: String
}

struct GcMajlisNotificationPreference: Decodable, Hashable {
    let enabled: Bool
}

private struct GcMajlisNotificationPreferenceBody: Encodable {
    let enabled: Bool
}

// MARK: - جولة المجلس

enum GcMajlisMatchVisibility: String, Decodable, Hashable {
    case sealed, revealed, settled
}

struct GcMajlisMatchResult: Decodable, Hashable {
    let home: Int?
    let away: Int?
    let status: String
}

struct GcMajlisRevealedPrediction: Decodable, Hashable {
    let home: Int
    let away: Int
    let evaluation: String
    let provisional: Bool
    let points: Int
}

struct GcMajlisMemberPrediction: Decodable, Hashable, Identifiable {
    let userId: String
    let name: String
    let avatar: String?
    let isOwner: Bool
    let isViewer: Bool
    let hasPredicted: Bool
    let prediction: GcMajlisRevealedPrediction?
    var id: String { userId }
}

struct GcMajlisMatchdayMatch: Decodable, Hashable, Identifiable {
    let fixture: GcFixture
    let revealAt: String
    let visibility: GcMajlisMatchVisibility
    let result: GcMajlisMatchResult?
    let members: [GcMajlisMemberPrediction]
    var id: Int { fixture.id }
}

struct GcMajlisDayChampionWinner: Decodable, Hashable, Identifiable {
    let userId: String
    let name: String
    let avatar: String?
    let points: Int
    let exact: Int
    let correct: Int
    var id: String { userId }
}

struct GcMajlisDayChampion: Decodable, Hashable {
    let status: String
    let settledMatches: Int
    let totalMatches: Int
    let winners: [GcMajlisDayChampionWinner]
}

struct GcMajlisMatchdayResponse: Decodable, Hashable {
    let date: String
    let timezone: String
    let majlis: GcMajlisSummary
    let matches: [GcMajlisMatchdayMatch]
    let dayChampion: GcMajlisDayChampion
}

// MARK: - فانتازي المجلس

struct GcMajlisFantasyRow: Decodable, Hashable, Identifiable {
    let rank: Int
    let userId: String
    let name: String
    let avatar: String?
    let isOwner: Bool
    let isViewer: Bool
    let hasSquad: Bool
    let totalPoints: Int
    var id: String { userId }
}

struct GcMajlisFantasyResponse: Decodable, Hashable {
    let majlis: GcMajlisSummary
    let rows: [GcMajlisFantasyRow]
}

// MARK: - توقعات البطل داخل المجلس

struct GcMajlisChampionTeamPick: Decodable, Hashable {
    let teamId: Int
    let teamName: String
    let status: String
    let points: Int
}

struct GcMajlisChampionMember: Decodable, Hashable, Identifiable {
    let userId: String
    let name: String
    let avatar: String?
    let isOwner: Bool
    let isViewer: Bool
    let hasPicked: Bool
    let pick: GcMajlisChampionTeamPick?
    var id: String { userId }
}

struct GcMajlisChampionPicksResponse: Decodable, Hashable {
    let majlis: GcMajlisSummary
    let visibility: String
    let lockedAt: String?
    let members: [GcMajlisChampionMember]
}

// MARK: - حصاد المجلس

struct GcMajlisHarvestChampion: Decodable, Hashable, Identifiable {
    let userId: String
    let name: String
    let avatar: String?
    let totalPoints: Int
    let exactCount: Int
    let correctCount: Int
    let badgeCode: String
    var id: String { userId }
}

struct GcMajlisHarvestAccurate: Decodable, Hashable, Identifiable {
    let userId: String
    let name: String
    let avatar: String?
    let accuracy: Double
    let correctCount: Int
    let playedCount: Int
    var id: String { userId }
}

struct GcMajlisHarvestBold: Decodable, Hashable, Identifiable {
    let userId: String
    let name: String
    let avatar: String?
    let pickProb: Double
    let fixtureId: Int
    var id: String { "\(userId)-\(fixtureId)" }
}

struct GcMajlisHarvestStubborn: Decodable, Hashable, Identifiable {
    let userId: String
    let name: String
    let avatar: String?
    let teamId: Int
    let teamName: String
    let picksCount: Int
    var id: String { userId }
}

struct GcMajlisHarvestAwards: Decodable, Hashable {
    let champions: [GcMajlisHarvestChampion]
    let mostAccurate: [GcMajlisHarvestAccurate]
    let boldest: [GcMajlisHarvestBold]
    let stubborn: [GcMajlisHarvestStubborn]
}

struct GcMajlisHarvestResponse: Decodable, Hashable {
    let status: String
    let majlis: GcMajlisSummary
    let finalAt: String?
    let generatedAt: String
    let awards: GcMajlisHarvestAwards
}

// MARK: - تحديات 1×1

struct GcMajlisDuelParticipant: Decodable, Hashable, Identifiable {
    let userId: String
    let name: String
    let avatar: String?
    var id: String { userId }
}

struct GcMajlisDuel: Decodable, Hashable, Identifiable {
    let id: String
    let majlisId: String
    let fixtureId: Int
    let stake: Int
    let status: String
    let challenger: GcMajlisDuelParticipant
    let challenged: GcMajlisDuelParticipant
    let winnerId: String?
    let createdAt: String
    let acceptedAt: String?
    let expiresAt: String?
    let settledAt: String?
}

struct GcMajlisDuelsResponse: Decodable, Hashable {
    let majlis: GcMajlisSummary
    let duels: [GcMajlisDuel]
    let eligibleMembers: [GcMajlisDuelParticipant]
}

private struct GcMajlisDuelCreateBody: Encodable {
    let fixtureId: Int
    let challengedUserId: String
    let stake: Int
}

private struct GcMajlisDuelMutationResponse: Decodable {
    let duel: GcMajlisDuel
}

enum GcMajlisDuelAction: String {
    case accept, decline, cancel
}

// MARK: - API

extension APIClient {
    func fetchGcMajlisNotificationPreference() async throws -> GcMajlisNotificationPreference {
        try await get(
            GcMajlisNotificationPreference.self,
            path: "/gulf-cup/majlis/notification-preference",
            ignoreCache: true,
            apiRoot: URLConstants.mobileAPI
        )
    }

    func updateGcMajlisNotificationPreference(enabled: Bool) async throws -> GcMajlisNotificationPreference {
        try await put(
            GcMajlisNotificationPreference.self,
            path: "/gulf-cup/majlis/notification-preference",
            body: GcMajlisNotificationPreferenceBody(enabled: enabled),
            apiRoot: URLConstants.mobileAPI
        )
    }

    func fetchGcMajlisInvite(_ code: String) async throws -> GcMajlisInvitePreview {
        try await get(
            GcMajlisInvitePreview.self,
            path: "/gulf-cup/majlis/invite/\(code)",
            ignoreCache: true,
            apiRoot: URLConstants.mobileAPI
        )
    }

    func fetchGcMajlisMatchday(_ majlisId: String, date: String? = nil) async throws -> GcMajlisMatchdayResponse {
        var query: [String: String] = [:]
        if let date { query["date"] = date }
        return try await get(
            GcMajlisMatchdayResponse.self,
            path: "/gulf-cup/majlis/\(majlisId)/matchday",
            query: query,
            ignoreCache: true,
            apiRoot: URLConstants.mobileAPI
        )
    }

    func fetchGcMajlisFantasy(_ majlisId: String) async throws -> GcMajlisFantasyResponse {
        try await get(
            GcMajlisFantasyResponse.self,
            path: "/gulf-cup/majlis/\(majlisId)/fantasy",
            ignoreCache: true,
            apiRoot: URLConstants.mobileAPI
        )
    }

    func fetchGcMajlisChampionPicks(_ majlisId: String) async throws -> GcMajlisChampionPicksResponse {
        try await get(
            GcMajlisChampionPicksResponse.self,
            path: "/gulf-cup/majlis/\(majlisId)/champion-picks",
            ignoreCache: true,
            apiRoot: URLConstants.mobileAPI
        )
    }

    func fetchGcMajlisHarvest(_ majlisId: String) async throws -> GcMajlisHarvestResponse {
        try await get(
            GcMajlisHarvestResponse.self,
            path: "/gulf-cup/majlis/\(majlisId)/harvest",
            ignoreCache: true,
            apiRoot: URLConstants.mobileAPI
        )
    }

    func fetchGcMajlisDuels(_ majlisId: String) async throws -> GcMajlisDuelsResponse {
        try await get(
            GcMajlisDuelsResponse.self,
            path: "/gulf-cup/majlis/\(majlisId)/duels",
            ignoreCache: true,
            apiRoot: URLConstants.mobileAPI
        )
    }

    func createGcMajlisDuel(
        majlisId: String,
        challengedUserId: String,
        fixtureId: Int,
        stake: Int
    ) async throws -> GcMajlisDuel {
        let response = try await post(
            GcMajlisDuelMutationResponse.self,
            path: "/gulf-cup/majlis/\(majlisId)/duels",
            body: GcMajlisDuelCreateBody(
                fixtureId: fixtureId,
                challengedUserId: challengedUserId,
                stake: stake
            ),
            apiRoot: URLConstants.mobileAPI
        )
        return response.duel
    }

    func mutateGcMajlisDuel(_ duelId: String, action: GcMajlisDuelAction) async throws -> GcMajlisDuel {
        struct Empty: Encodable {}
        let response = try await post(
            GcMajlisDuelMutationResponse.self,
            path: "/gulf-cup/majlis/duels/\(duelId)/\(action.rawValue)",
            body: Empty(),
            apiRoot: URLConstants.mobileAPI
        )
        return response.duel
    }
}
