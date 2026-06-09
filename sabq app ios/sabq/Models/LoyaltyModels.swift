import SwiftUI

// Swift mirror of shared/loyalty.ts. Single source of truth for the
// 5-tier table on the iOS side. If the server-side table ever changes,
// the responsible move is to update this file the same day — the iOS
// app falls back to its local table when offline, so a drift produces
// the wrong rank name in cards/pills until the user is back online.

enum LoyaltyAction: String, Codable {
    case readOpen = "READ"
    case readDeep = "READ_DEEP"
    case like = "LIKE"
    case share = "SHARE"
    case comment = "COMMENT"
    case notificationOpen = "NOTIFICATION_OPEN"
    case dailyLogin = "DAILY_LOGIN"
}

struct LoyaltyTier: Identifiable, Equatable {
    let level: Int  // 1..5
    let nameAr: String
    let nameEn: String
    let minLifetimePoints: Int
    let color: Color
    let gradient: LinearGradient

    var id: Int { level }

    // Level is the unique key; gradient is a SwiftUI view-only artifact
    // that doesn't conform to Equatable, so we compare on level alone.
    static func == (lhs: LoyaltyTier, rhs: LoyaltyTier) -> Bool {
        lhs.level == rhs.level
    }
}

enum LoyaltyTiers {
    nonisolated static let all: [LoyaltyTier] = [
        LoyaltyTier(
            level: 1, nameAr: "القارئ الجديد", nameEn: "New Reader",
            minLifetimePoints: 0,
            color: Color(red: 0.61, green: 0.64, blue: 0.69),
            gradient: LinearGradient(
                colors: [Color(red: 0.42, green: 0.45, blue: 0.5), Color(red: 0.12, green: 0.16, blue: 0.22)],
                startPoint: .topLeading, endPoint: .bottomTrailing)
        ),
        LoyaltyTier(
            level: 2, nameAr: "المتفاعل", nameEn: "Engaged",
            minLifetimePoints: 100,
            color: Color(red: 0.23, green: 0.51, blue: 0.96),
            gradient: LinearGradient(
                colors: [Color(red: 0.15, green: 0.38, blue: 0.92), Color(red: 0.12, green: 0.23, blue: 0.54)],
                startPoint: .topLeading, endPoint: .bottomTrailing)
        ),
        LoyaltyTier(
            level: 3, nameAr: "العضو الذهبي", nameEn: "Gold Member",
            minLifetimePoints: 500,
            color: Color(red: 0.96, green: 0.62, blue: 0.04),
            gradient: LinearGradient(
                colors: [Color(red: 0.96, green: 0.62, blue: 0.04),
                         Color(red: 0.71, green: 0.45, blue: 0.04),
                         Color(red: 0.47, green: 0.21, blue: 0.06)],
                startPoint: .topLeading, endPoint: .bottomTrailing)
        ),
        LoyaltyTier(
            level: 4, nameAr: "القارئ الموثوق", nameEn: "Trusted Reader",
            minLifetimePoints: 2_000,
            color: Color(red: 0.65, green: 0.55, blue: 0.98),
            gradient: LinearGradient(
                colors: [Color(red: 0.65, green: 0.55, blue: 0.98), Color(red: 0.43, green: 0.16, blue: 0.85)],
                startPoint: .topLeading, endPoint: .bottomTrailing)
        ),
        LoyaltyTier(
            level: 5, nameAr: "سفير سبق", nameEn: "Sabq Ambassador",
            minLifetimePoints: 10_000,
            color: Color(red: 0.49, green: 0.23, blue: 0.93),
            gradient: LinearGradient(
                colors: [Color(red: 0.49, green: 0.23, blue: 0.93),
                         Color(red: 0.30, green: 0.11, blue: 0.58),
                         Color(red: 0.12, green: 0.11, blue: 0.29)],
                startPoint: .topLeading, endPoint: .bottomTrailing)
        ),
    ]

    nonisolated static func tier(forLifetimePoints points: Int) -> LoyaltyTier {
        var current = all[0]
        for t in all where points >= t.minLifetimePoints { current = t }
        return current
    }

    nonisolated static func tier(forLevel level: Int) -> LoyaltyTier {
        all.first(where: { $0.level == level }) ?? all[0]
    }

    nonisolated static func nextTier(after level: Int) -> LoyaltyTier? {
        all.first(where: { $0.level == level + 1 })
    }
}

// API response shape — must match server/routes/mobileApiRoutes.ts
// `GET /api/v1/loyalty/me`.
nonisolated struct LoyaltyPointsBlock: Codable, Equatable {
    let userId: String?
    let totalPoints: Int
    let currentRank: String?
    let rankLevel: Int?
    let lifetimePoints: Int
    let lastActivityAt: String?
}

nonisolated struct LoyaltySummary: Codable, Equatable {
    let success: Bool?
    let points: LoyaltyPointsBlock?
    let weekPoints: Int
    let monthPoints: Int
    let streakDays: Int

    var resolvedTier: LoyaltyTier {
        // Trust the server's rankLevel first (it incorporates the
        // grandfather rule). Fall back to client-side compute only when
        // the server-side row is missing — i.e., a brand-new user.
        if let level = points?.rankLevel {
            return LoyaltyTiers.tier(forLevel: level)
        }
        return LoyaltyTiers.tier(forLifetimePoints: points?.lifetimePoints ?? 0)
    }

    var progressToNext: (current: LoyaltyTier, next: LoyaltyTier?, pointsToNext: Int, fraction: Double) {
        let lifetime = points?.lifetimePoints ?? 0
        let current = resolvedTier
        guard let next = LoyaltyTiers.nextTier(after: current.level) else {
            return (current, nil, 0, 1.0)
        }
        let span = max(1, next.minLifetimePoints - current.minLifetimePoints)
        let inTier = max(0, lifetime - current.minLifetimePoints)
        let pointsToNext = max(0, next.minLifetimePoints - lifetime)
        let fraction = min(1.0, Double(inTier) / Double(span))
        return (current, next, pointsToNext, fraction)
    }
}

// POST /api/v1/loyalty/events body shape
nonisolated struct LoyaltyEventPayload: Codable, Equatable {
    let action: String
    let source: String?
    let articleId: String?
    let duration: Int?
    let extraInfo: String?

    init(action: LoyaltyAction, source: String? = nil, articleId: String? = nil, duration: Int? = nil, extraInfo: String? = nil) {
        self.action = action.rawValue
        self.source = source
        self.articleId = articleId
        self.duration = duration
        self.extraInfo = extraInfo
    }
}

nonisolated struct LoyaltyEventResult: Codable, Equatable {
    let action: String
    let outcome: String  // AWARDED | DAILY_CAP | DEDUP | INVALID_ACTION | NEGATIVE_POINTS
    let points: Int?
}

nonisolated struct LoyaltyEventBatchResponse: Codable, Equatable {
    let success: Bool?
    let results: [LoyaltyEventResult]
}

// ============================================================================
// New endpoints (2026-05-20): history / monthly / rewards / redeem
// ============================================================================

/// Single row in /loyalty/history. `action` matches LoyaltyAction.rawValue
/// (READ / READ_DEEP / LIKE / ...) plus the new lifetime bonuses
/// PROFILE_COMPLETE / EMAIL_VERIFIED. `metadata` is intentionally raw so
/// the UI can introspect on a per-action basis without a parallel schema
/// here for every shape the backend ships.
nonisolated struct LoyaltyHistoryEvent: Codable, Equatable, Identifiable {
    let id: String
    let action: String
    let points: Int
    let source: String?
    let createdAt: String
    /// Backend hydrates this when the event's metadata or source points
    /// at an article — surfaces the actual headline next to the action
    /// label instead of the generic "قراءة مقال".
    let articleTitle: String?
    let articleSlug: String?

    var date: Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: createdAt) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: createdAt)
    }
}

nonisolated struct LoyaltyHistoryResponse: Codable, Equatable {
    let success: Bool?
    let items: [LoyaltyHistoryEvent]
    let page: Int
    let limit: Int
    let hasMore: Bool
}

nonisolated struct LoyaltyMonthlyBucket: Codable, Equatable, Identifiable {
    let month: String   // "YYYY-MM"
    let total: Int
    let events: Int
    var id: String { month }
}

nonisolated struct LoyaltyMonthlyResponse: Codable, Equatable {
    let success: Bool?
    let months: [LoyaltyMonthlyBucket]
}

/// Reward row returned by /loyalty/rewards. `canRedeem` is computed
/// server-side from balance + per-user cap, so the iOS button can
/// disable instantly without recomputing the rules locally.
nonisolated struct LoyaltyReward: Codable, Equatable, Identifiable {
    let id: String
    let nameAr: String
    let nameEn: String?
    let description: String?
    let imageUrl: String?
    let pointsCost: Int
    let rewardType: String
    let partnerName: String?
    let remainingStock: Int?
    let expiresAt: String?
    let myRedemptionCount: Int
    let canRedeem: Bool
    let pointsShort: Int
    let reasonBlocked: String?
}

nonisolated struct LoyaltyRewardsResponse: Codable, Equatable {
    let success: Bool?
    let balance: Int
    let rewards: [LoyaltyReward]
}

nonisolated struct LoyaltyRedeemResponse: Codable, Equatable {
    let success: Bool
    let message: String?
    let remainingBalance: Int?
    let redemption: Redemption?

    struct Redemption: Codable, Equatable {
        let id: String
        let rewardId: String
        let pointsSpent: Int
        let status: String
        let redeemedAt: String?
    }
}

/// `/loyalty/redemptions/me` — member's own history. Status semantics
/// (pending / delivered / expired / cancelled) match the dashboard.
nonisolated struct LoyaltyRedemption: Codable, Equatable, Identifiable {
    let id: String
    let rewardId: String
    let pointsSpent: Int
    let status: String
    let rewardSnapshot: RewardSnapshot?
    let deliveryData: DeliveryData?
    let redeemedAt: String?
    let deliveredAt: String?

    struct RewardSnapshot: Codable, Equatable {
        let nameAr: String?
        let nameEn: String?
        let pointsCost: Int?
        let rewardType: String?
    }

    struct DeliveryData: Codable, Equatable {
        let couponCode: String?
        let trackingInfo: String?
    }
}

nonisolated struct LoyaltyRedemptionsResponse: Codable, Equatable {
    let success: Bool?
    let redemptions: [LoyaltyRedemption]
}
