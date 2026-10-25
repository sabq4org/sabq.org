import Foundation

// «أرصدة النماذج» — Codable mirrors of the admin-only
// `/api/v1/staff/system/balances` endpoints. Every enum falls back to
// `.unknown` and everything but the provider id is optional, so an additive
// server change never breaks decoding.

// MARK: - Enums

public enum StaffBalanceKind: String, Codable, Sendable {
    /// «رصيد فعلي» — read from the provider's own API (DeepSeek, ElevenLabs).
    case actual
    /// «رصيد تقديري» — last top-up minus recorded spend (OpenAI, Anthropic).
    case estimated
    /// «ميزانية» — this month's spend against an admin budget (Gemini).
    case budget
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffBalanceKind(rawValue: raw) ?? .unknown
    }
}

public enum StaffBalanceState: String, Codable, Sendable {
    case healthy
    case low
    case critical
    case notConfigured = "not_configured"
    case unavailable
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffBalanceState(rawValue: raw) ?? .unknown
    }

    /// Below the threshold (low or critical).
    public var needsTopUp: Bool { self == .low || self == .critical }
}

public enum StaffBalanceUnit: String, Codable, Sendable {
    case usd
    case cny
    case characters
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffBalanceUnit(rawValue: raw) ?? .unknown
    }
}

public enum StaffBalanceReason: String, Codable, Sendable {
    case missingKey = "missing_key"
    case noTopup = "no_topup"
    case noBudget = "no_budget"
    case fetchFailed = "fetch_failed"
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffBalanceReason(rawValue: raw) ?? .unknown
    }
}

public enum StaffBalanceSpendSource: String, Codable, Sendable {
    case provider
    case providerAdminAPI = "provider_admin_api"
    case sabqTracked = "sabq_tracked"
    case balanceSnapshots = "balance_snapshots"
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffBalanceSpendSource(rawValue: raw) ?? .unknown
    }
}

public enum StaffBalanceTopupMode: String, Codable, Sendable, CaseIterable {
    /// «أضفتُ شحنة جديدة».
    case add
    /// «الرصيد الحالي في اللوحة».
    case set
    /// Gemini's monthly budget.
    case budget
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffBalanceTopupMode(rawValue: raw) ?? .unknown
    }
}

// MARK: - Payloads

public struct StaffBalanceThreshold: Codable, Sendable, Equatable {
    public var low: Double
    public var critical: Double?
    public var presets: [Double]?
    public var isDefault: Bool?

    public init(low: Double, critical: Double? = nil, presets: [Double]? = nil, isDefault: Bool? = nil) {
        self.low = low
        self.critical = critical
        self.presets = presets
        self.isDefault = isDefault
    }

    /// «حرج» is a quarter of the threshold unless the server says otherwise.
    public var effectiveCritical: Double { critical ?? low / 4 }
}

public struct StaffBalanceBaseline: Codable, Sendable, Equatable {
    public var amount: Double
    public var at: Date?
}

public struct StaffBalanceLastTopup: Codable, Sendable, Equatable {
    public var mode: StaffBalanceTopupMode?
    public var amount: Double
    public var topupAt: Date?
    public var byName: String?
}

public struct StaffBalancePoint: Codable, Sendable, Equatable, Identifiable {
    /// `YYYY-MM-DD` (UTC day, like the usage tables).
    public var date: String
    public var value: Double

    public var id: String { date }

    public init(date: String, value: Double) {
        self.date = date
        self.value = value
    }

    /// Noon UTC of that day, so the chart never shifts it across midnight.
    public var day: Date? {
        StaffJSON.parseDate("\(date)T12:00:00Z")
    }
}

public struct StaffBalanceTopupRecord: Codable, Sendable, Equatable, Identifiable {
    public var mode: StaffBalanceTopupMode?
    public var amountUsd: Double
    public var topupAt: Date?
    public var savedAt: Date?
    public var byName: String?
    public var balanceAfterUsd: Double?

    public var id: String { "\(savedAt?.timeIntervalSince1970 ?? 0)-\(amountUsd)" }
}

/// One provider row (list) or the full detail (`series`/`topups` present).
public struct StaffAIBalance: Codable, Sendable, Equatable, Identifiable {
    public var provider: String
    public var label: String?
    public var kind: StaffBalanceKind?
    public var unit: StaffBalanceUnit?
    public var state: StaffBalanceState?
    public var reason: StaffBalanceReason?
    /// Remaining (actual/estimated) or spent this month (budget).
    public var amount: Double?
    /// Last baseline / monthly budget / character limit.
    public var total: Double?
    /// Bar fill 0…1, computed by the server.
    public var fraction: Double?
    /// Budget only: budget − spend (what the state is measured on).
    public var remaining: Double?
    public var threshold: StaffBalanceThreshold?
    public var todaySpend: Double?
    public var monthSpend: Double?
    public var spendUnit: StaffBalanceUnit?
    public var spentSinceBaseline: Double?
    public var daysLeft: Double?
    public var resetsAt: Date?
    public var baseline: StaffBalanceBaseline?
    public var lastTopup: StaffBalanceLastTopup?
    public var spendSource: StaffBalanceSpendSource?
    public var canUpdateBalance: Bool?
    /// The signed-in user may save a top-up or threshold (`ai_hub.manage`).
    /// Set per request by the server on detail and write responses.
    public var canManage: Bool?
    public var fetchedAt: Date?
    public var error: String?
    /// Detail only: oldest first, today last.
    public var series: [StaffBalancePoint]?
    /// Detail only: newest first.
    public var topups: [StaffBalanceTopupRecord]?

    public var id: String { provider }
    public var displayName: String { label ?? provider }
    public var effectiveState: StaffBalanceState { state ?? .unknown }
    public var effectiveKind: StaffBalanceKind { kind ?? .unknown }
    public var effectiveUnit: StaffBalanceUnit { unit ?? .usd }
    public var lowThreshold: Double? { threshold?.low }
    /// The figure the state is measured against the threshold.
    public var measuredAmount: Double? { effectiveKind == .budget ? remaining : amount }
    public var clampedFraction: Double? { fraction.map { min(max($0, 0), 1) } }
    /// The first letter shown in the grey avatar square.
    public var initial: String { String(displayName.prefix(1)).uppercased() }

    /// Whether the user may edit this provider's alert threshold. The server
    /// flag wins; `/me` capabilities are the fallback; unknown means no.
    public func allowsEditing(_ capabilities: StaffCapabilities?) -> Bool {
        canManage ?? capabilities?.canManageBalances ?? false
    }

    /// Whether «تحديث الرصيد» / «تعديل الميزانية» / «اضبطه» is offered.
    public func allowsBalanceUpdate(_ capabilities: StaffCapabilities?) -> Bool {
        (canUpdateBalance ?? false) && allowsEditing(capabilities)
    }
}

public struct StaffBalanceSummary: Codable, Sendable, Equatable {
    public var critical: Int?
    public var low: Int?
    public var notConfigured: Int?
    public var attention: Int?
    public var text: String?
}

public struct StaffAIBalances: Codable, Sendable, Equatable {
    public var generatedAt: Date?
    public var summary: StaffBalanceSummary?
    public var providers: [StaffAIBalance]?
    /// The signed-in user may save top-ups and thresholds (`ai_hub.manage`).
    public var canManage: Bool?

    public var items: [StaffAIBalance] { providers ?? [] }

    /// Server flag first, then `/me` capabilities; unknown means read-only.
    public func allowsEditing(_ capabilities: StaffCapabilities?) -> Bool {
        canManage ?? capabilities?.canManageBalances ?? false
    }

    public var criticalCount: Int { summary?.critical ?? items.filter { $0.effectiveState == .critical }.count }
    public var lowCount: Int { summary?.low ?? items.filter { $0.effectiveState == .low }.count }
    public var notConfiguredCount: Int {
        summary?.notConfigured ?? items.filter { $0.effectiveState == .notConfigured }.count
    }
    /// The red badge on «أرصدة النماذج».
    public var attentionCount: Int { criticalCount + lowCount + notConfiguredCount }

    /// The most urgent below-threshold provider, for the in-app banner.
    public var mostUrgent: StaffAIBalance? {
        items.first { $0.effectiveState == .critical } ?? items.first { $0.effectiveState == .low }
    }
}

// MARK: - Requests

/// `POST /system/balances/:provider/topup`.
public struct StaffBalanceTopup: Encodable, Sendable, Equatable {
    public var mode: StaffBalanceTopupMode
    public var amountUsd: Double
    /// `2026-10-25T22:24:00+03:00` (only meaningful for `add`).
    public var topupAt: String?
    public var threshold: Double?

    public init(mode: StaffBalanceTopupMode, amountUsd: Double, topupAt: Date? = nil, threshold: Double? = nil) {
        self.mode = mode
        self.amountUsd = amountUsd
        self.topupAt = topupAt.map(RiyadhTime.isoString)
        self.threshold = threshold
    }
}

/// `PUT /system/balances/:provider/threshold`.
public struct StaffBalanceThresholdUpdate: Encodable, Sendable, Equatable {
    public var threshold: Double

    public init(threshold: Double) {
        self.threshold = threshold
    }
}

extension StaffAIBalance {
    /// For previews and tests; the app decodes balances from the server.
    public init(provider: String, label: String? = nil, kind: StaffBalanceKind? = nil,
                unit: StaffBalanceUnit? = nil, state: StaffBalanceState? = nil, amount: Double? = nil) {
        self.provider = provider
        self.label = label
        self.kind = kind
        self.unit = unit
        self.state = state
        self.amount = amount
    }
}

extension StaffAIBalances {
    public init(providers: [StaffAIBalance], summary: StaffBalanceSummary? = nil, generatedAt: Date? = nil,
                canManage: Bool? = nil) {
        self.generatedAt = generatedAt
        self.summary = summary
        self.providers = providers
        self.canManage = canManage
    }
}
