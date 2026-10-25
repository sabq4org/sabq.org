import Foundation

// Codable mirrors of the admin-only «النظام» endpoints (desk v2 contract):
// `/system/health`, `/alerts` and `/me/alert-prefs`. Everything the screens
// can live without is optional, and every enum falls back to `.unknown`, so
// an additive server change never breaks decoding.

// MARK: - Alert preferences

/// Per-admin push switches. A missing key means ON (the server default).
public struct StaffAlertPrefs: Codable, Sendable, Equatable {
    public var aiAlerts: Bool
    public var adminAlerts: Bool

    private enum CodingKeys: String, CodingKey { case aiAlerts, adminAlerts }

    public init(aiAlerts: Bool = true, adminAlerts: Bool = true) {
        self.aiAlerts = aiAlerts
        self.adminAlerts = adminAlerts
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        aiAlerts = try container.decodeIfPresent(Bool.self, forKey: .aiAlerts) ?? true
        adminAlerts = try container.decodeIfPresent(Bool.self, forKey: .adminAlerts) ?? true
    }
}

/// `PUT /me/alert-prefs` body; a nil field is left unchanged by the server.
public struct StaffAlertPrefsUpdate: Encodable, Sendable, Equatable {
    public var aiAlerts: Bool?
    public var adminAlerts: Bool?

    public init(aiAlerts: Bool? = nil, adminAlerts: Bool? = nil) {
        self.aiAlerts = aiAlerts
        self.adminAlerts = adminAlerts
    }
}

// MARK: - System health

public enum StaffSystemStatus: String, Codable, Sendable {
    case ok
    case partial
    case down
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffSystemStatus(rawValue: raw) ?? .unknown
    }
}

public enum StaffModelStatus: String, Codable, Sendable {
    case up
    case degraded
    case down
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffModelStatus(rawValue: raw) ?? .unknown
    }
}

public struct StaffSystemSummary: Codable, Sendable, Equatable {
    public var status: StaffSystemStatus?
    public var title: String?
    public var detail: String?
}

public struct StaffModelError: Codable, Sendable, Equatable {
    public var code: String?
    public var message: String?
}

public struct StaffModelHealth: Codable, Sendable, Equatable {
    public var provider: String?
    public var providerLabel: String?
    public var modelId: String
    public var status: StaffModelStatus?
    /// Provider-level detail, e.g. `quota_exceeded`.
    public var rawStatus: String?
    public var lastCheckAt: Date?
    public var since: Date?
    public var cooldownUntil: Date?
    public var lastError: StaffModelError?
    public var requests24h: Int?
    public var failures24h: Int?

    public var effectiveStatus: StaffModelStatus { status ?? .unknown }
    public var isQuotaExceeded: Bool { rawStatus?.lowercased() == "quota_exceeded" }
}

public struct StaffBudget: Codable, Sendable, Equatable {
    public var id: String?
    public var label: String?
    public var limitUsd: Double?
    public var spentUsd: Double?
    public var percent: Double?
    public var period: String?

    /// 0…1 for the progress bar; prefers the server's percent.
    public var fraction: Double {
        if let percent { return min(max(percent / 100, 0), 1) }
        guard let limitUsd, limitUsd > 0, let spentUsd else { return 0 }
        return min(max(spentUsd / limitUsd, 0), 1)
    }
}

public struct StaffSystemHealth: Codable, Sendable, Equatable {
    public var generatedAt: Date?
    public var lastCheckAt: Date?
    public var summary: StaffSystemSummary?
    public var aiAlertsEnabled: Bool?
    public var models: [StaffModelHealth]?
    public var budgets: [StaffBudget]?
}

// MARK: - Admin alerts

public enum StaffAlertSeverity: String, Codable, Sendable {
    case urgent
    case info
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffAlertSeverity(rawValue: raw) ?? .unknown
    }
}

public enum StaffAlertKind: String, Codable, Sendable {
    case socialFailed = "social_failed"
    case agencyBalanceLow = "agency_balance_low"
    case breakingExpiring = "breaking_expiring"
    case breakingExpired = "breaking_expired"
    case aiIncident = "ai_incident"
    case aiBudget = "ai_budget"
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffAlertKind(rawValue: raw) ?? .unknown
    }
}

public enum StaffAlertActionType: String, Codable, Sendable {
    case retrySocial = "retry_social"
    case openSystem = "open_system"
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffAlertActionType(rawValue: raw) ?? .unknown
    }
}

public struct StaffAlertAction: Codable, Sendable, Equatable {
    public var type: StaffAlertActionType?
    public var postId: String?
}

public struct StaffAdminAlert: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var kind: StaffAlertKind?
    public var severity: StaffAlertSeverity?
    public var title: String
    public var body: String?
    public var occurredAt: Date?
    public var deeplink: String?
    public var action: StaffAlertAction?

    /// Anything not explicitly urgent is listed under «للاطلاع».
    public var isUrgent: Bool { severity == .urgent }

    /// The validated in-app link, if the server sent one.
    public var link: DeskDeepLink? {
        guard let deeplink, let url = URL(string: deeplink) else { return nil }
        return DeskDeepLink(url: url)
    }

    /// The post to retry when the action is `retry_social` with a valid id.
    public var retryPostID: String? {
        guard action?.type == .retrySocial, let id = action?.postId, DeskDeepLink.isValidID(id) else { return nil }
        return id
    }
}

public struct StaffAlertCounts: Codable, Sendable, Equatable {
    public var urgent: Int?
    public var info: Int?
}

public struct StaffAdminAlerts: Codable, Sendable, Equatable {
    public var generatedAt: Date?
    public var counts: StaffAlertCounts?
    public var items: [StaffAdminAlert]?

    public var urgentCount: Int {
        counts?.urgent ?? (items ?? []).filter(\.isUrgent).count
    }
}
