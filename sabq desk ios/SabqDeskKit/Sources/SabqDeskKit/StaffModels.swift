import Foundation

// Codable mirrors of the `/api/v1/staff/*` responses documented in
// docs/systems/editorial/STAFF_APP_API.md. Fields the app does not depend on
// are optional so an additive server change never breaks decoding.

// MARK: - Identity

public struct StaffCapabilities: Codable, Sendable, Equatable {
    public struct Social: Codable, Sendable, Equatable {
        public var view: Bool
        public var publish: Bool
        public var schedule: Bool
        public var reject: Bool

        public init(view: Bool = false, publish: Bool = false, schedule: Bool = false, reject: Bool = false) {
            self.view = view
            self.publish = publish
            self.schedule = schedule
            self.reject = reject
        }
    }

    public var canTickets: Bool
    public var canSocial: Social
    /// «حالة النظام» (permission `ai_hub.view`). False when an older server omits it.
    public var canSystemHealth: Bool
    /// «تنبيهات الإدارة» (admins only). False when an older server omits it.
    public var canAdminAlerts: Bool
    /// Save a top-up, budget or alert threshold in «أرصدة النماذج»
    /// (`ai_hub.view` + `ai_hub.manage`). False when an older server omits it.
    public var canManageBalances: Bool
    /// «الرأي» tab. All false when an older server omits it.
    public var canOpinion: Opinion
    /// «أخبار» in the notifications center: news published from «نشر سبق»
    /// (`articles.publish`). False when an older server omits it.
    public var canPublisherNews: Bool

    /// Opinion desk rights, computed server-side from live RBAC
    /// (`computeStaffOpinionCapabilities` in shared/staffApp.ts).
    public struct Opinion: Codable, Sendable, Equatable {
        public var view: Bool
        public var schedule: Bool
        public var publish: Bool
        public var returnToWriter: Bool

        public init(view: Bool = false, schedule: Bool = false, publish: Bool = false, returnToWriter: Bool = false) {
            self.view = view
            self.schedule = schedule
            self.publish = publish
            self.returnToWriter = returnToWriter
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            view = try container.decodeIfPresent(Bool.self, forKey: .view) ?? false
            schedule = try container.decodeIfPresent(Bool.self, forKey: .schedule) ?? false
            publish = try container.decodeIfPresent(Bool.self, forKey: .publish) ?? false
            returnToWriter = try container.decodeIfPresent(Bool.self, forKey: .returnToWriter) ?? false
        }

        private enum CodingKeys: String, CodingKey { case view, schedule, publish, returnToWriter }
    }

    private enum CodingKeys: String, CodingKey {
        case canTickets, canSocial, canSystemHealth, canAdminAlerts, canManageBalances, canOpinion, canPublisherNews
    }

    public init(canTickets: Bool = false, canSocial: Social = Social(),
                canSystemHealth: Bool = false, canAdminAlerts: Bool = false,
                canManageBalances: Bool = false, canOpinion: Opinion = Opinion(),
                canPublisherNews: Bool = false) {
        self.canTickets = canTickets
        self.canSocial = canSocial
        self.canSystemHealth = canSystemHealth
        self.canAdminAlerts = canAdminAlerts
        self.canManageBalances = canManageBalances
        self.canOpinion = canOpinion
        self.canPublisherNews = canPublisherNews
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        canTickets = try container.decode(Bool.self, forKey: .canTickets)
        canSocial = try container.decode(Social.self, forKey: .canSocial)
        canSystemHealth = try container.decodeIfPresent(Bool.self, forKey: .canSystemHealth) ?? false
        canAdminAlerts = try container.decodeIfPresent(Bool.self, forKey: .canAdminAlerts) ?? false
        canManageBalances = try container.decodeIfPresent(Bool.self, forKey: .canManageBalances) ?? false
        canOpinion = (try? container.decodeIfPresent(Opinion.self, forKey: .canOpinion)) ?? Opinion()
        canPublisherNews = try container.decodeIfPresent(Bool.self, forKey: .canPublisherNews) ?? false
    }

    public static let none = StaffCapabilities()
}

public struct StaffMe: Codable, Sendable, Equatable {
    public var id: String
    public var email: String?
    public var name: String?
    public var firstName: String?
    public var lastName: String?
    public var profileImageUrl: String?
    public var role: String?
    public var twoFactorEnabled: Bool?
    public var roles: [String]?
    public var capabilities: StaffCapabilities
    /// Admins only; nil for everyone else and on older servers.
    public var alertPrefs: StaffAlertPrefs?

    public init(id: String, email: String? = nil, name: String? = nil, firstName: String? = nil,
                lastName: String? = nil, profileImageUrl: String? = nil, role: String? = nil,
                twoFactorEnabled: Bool? = nil, roles: [String]? = nil, capabilities: StaffCapabilities = .none,
                alertPrefs: StaffAlertPrefs? = nil) {
        self.id = id
        self.email = email
        self.name = name
        self.firstName = firstName
        self.lastName = lastName
        self.profileImageUrl = profileImageUrl
        self.role = role
        self.twoFactorEnabled = twoFactorEnabled
        self.roles = roles
        self.capabilities = capabilities
        self.alertPrefs = alertPrefs
    }

    public var displayName: String {
        if let name, !name.isEmpty { return name }
        let joined = [firstName, lastName].compactMap { $0 }.joined(separator: " ")
        return joined.isEmpty ? (email ?? "") : joined
    }

    public var roleDisplayLabel: String {
        if let roles, let formatted = StaffRoleLabel.displayList(for: roles) {
            return formatted
        }
        if let role, !role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return StaffRoleLabel.arabicLabel(for: role)
        }
        return "—"
    }
}

/// Maps server role keys (`shared/rbac-constants.ts`, `shared/effectiveRoles.ts`,
/// `server/services/mobileUserRolePayload.ts`) to the web dashboard's Arabic role labels.
/// Unknown keys fall back to the raw key verbatim.
public enum StaffRoleLabel {
    private static let arabicMap: [String: String] = [
        "system_admin": "مدير النظام",
        "system.admin": "مدير النظام",
        "superadmin": "المدير العام",
        "super_admin": "المدير العام",
        "admin": "مسؤول",
        "editor_in_chief": "رئيس التحرير",
        "chief_editor": "رئيس التحرير",
        "managing_editor": "مدير تحرير",
        "editorial_manager": "مدير تحرير",
        "senior_editor": "محرر أول",
        "editor": "محرر",
        "content_manager": "مدير محتوى",
        "reporter": "مراسل",
        "correspondent": "مراسل",
        "journalist": "صحفي",
        "opinion_author": "كاتب مقال رأي",
        "angle_writer": "كاتب زاوية",
        "columnist": "كاتب عمود",
        "article_writer": "كاتب مقال",
        "article_author": "كاتب مقال",
        "writer": "كاتب",
        "author": "كاتب",
        "content_creator": "صانع محتوى",
        "comments_moderator": "مشرف تعليقات",
        "moderator": "مشرف",
        "media_manager": "مدير وسائط",
        "publisher": "ناشر",
        "photographer": "مصور",
        "contributor": "مساهم",
        "reviewer": "مراجع",
        "analyst": "محلل",
        "advertiser": "معلن",
        "hr": "موارد بشرية",
        "reader": "قارئ",
        "user": "قارئ",
        "subscriber": "مشترك",
        "guest": "ضيف",
    ]

    public static func arabicLabel(for rawKey: String) -> String {
        let trimmed = rawKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return rawKey }
        let lower = trimmed.lowercased()
        if let match = arabicMap[lower] {
            return match
        }
        let normalized = lower.replacingOccurrences(of: "-", with: "_")
            .replacingOccurrences(of: " ", with: "_")
        if let match = arabicMap[normalized] {
            return match
        }
        return trimmed
    }

    public static func displayList(for rawKeys: [String]) -> String? {
        var seen = Set<String>()
        var labels: [String] = []
        for raw in rawKeys {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            let label = arabicLabel(for: trimmed)
            if seen.insert(label).inserted {
                labels.append(label)
            }
        }
        return labels.isEmpty ? nil : labels.joined(separator: "، ")
    }
}

// MARK: - Inbox

public enum StaffInboxKind: String, Codable, Sendable, CaseIterable {
    case ticket
    case social
}

public enum StaffInboxFilter: String, Sendable, CaseIterable {
    case all
    case ticket
    case social
}

public enum StaffSenderKind: String, Codable, Sendable {
    case writer
    case reporter
    case agency
    /// Any other staff account (admin, editor, …): «حساب المؤسسة».
    case organization
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffSenderKind(rawValue: raw) ?? .unknown
    }
}

public struct StaffSender: Codable, Sendable, Equatable {
    public var id: String?
    public var name: String
    public var kind: StaffSenderKind
    public var roleKind: String?
    /// Absolute https photo (person) or logo (agency). Absent on older servers.
    public var avatarUrl: String?
}

public struct StaffArticleRef: Codable, Sendable, Equatable {
    public var id: String
    public var title: String?
    public var url: String?
    public var imageUrl: String?
}

public struct StaffInboxItem: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var kind: StaffInboxKind
    public var title: String
    public var previewText: String?
    public var sender: StaffSender
    public var createdAt: Date
    public var updatedAt: Date
    public var status: String
    public var hasUnread: Bool
    public var deeplink: String?
    public var article: StaffArticleRef?
    /// Social only: when a `scheduled` post will go out. Absent on older servers.
    public var scheduledAt: Date?
    /// Social only: when a `published` post went out. Absent on older servers.
    public var publishedAt: Date?
    /// Social only: the rejection reason (`canceled`) or the last publish
    /// error (`failed`). Absent on older servers.
    public var lastError: String?
    /// Social only, `canceled` posts: true when the sender withdrew it
    /// themselves, false when an editor rejected it. Absent on older servers.
    public var canceledBySelf: Bool?

    /// Stable across kinds: a ticket and a social post may share a UUID space.
    public var listID: String { "\(kind.rawValue):\(id)" }
}

public struct StaffInboxPage: Codable, Sendable, Equatable {
    public var items: [StaffInboxItem]
    public var nextCursor: String?
    public var hasMore: Bool
}

public struct StaffUnreadCounts: Codable, Sendable, Equatable {
    public var tickets: Int
    public var social: Int
    public var total: Int

    public init(tickets: Int = 0, social: Int = 0, total: Int = 0) {
        self.tickets = tickets
        self.social = social
        self.total = total
    }
}

public struct StaffInboxQuery: Sendable, Equatable {
    public var type: StaffInboxFilter
    public var status: String?
    public var unreadOnly: Bool
    public var search: String?
    public var cursor: String?
    public var limit: Int

    public init(type: StaffInboxFilter = .all, status: String? = nil, unreadOnly: Bool = false,
                search: String? = nil, cursor: String? = nil, limit: Int = 20) {
        self.type = type
        self.status = status
        self.unreadOnly = unreadOnly
        self.search = search
        self.cursor = cursor
        self.limit = min(max(limit, 1), 50)
    }

    var queryItems: [URLQueryItem] {
        var items = [URLQueryItem(name: "type", value: type.rawValue),
                     URLQueryItem(name: "limit", value: String(limit))]
        if let status, !status.isEmpty { items.append(URLQueryItem(name: "status", value: status)) }
        if unreadOnly { items.append(URLQueryItem(name: "unread", value: "true")) }
        let trimmed = search?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmed.isEmpty { items.append(URLQueryItem(name: "q", value: String(trimmed.prefix(200)))) }
        if let cursor, !cursor.isEmpty { items.append(URLQueryItem(name: "cursor", value: cursor)) }
        return items
    }
}

// MARK: - Tickets

public enum StaffTicketStatus: String, Codable, Sendable, CaseIterable {
    case open
    case answered
    case closed
}

public struct StaffTicket: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var writerId: String?
    public var title: String
    public var status: StaffTicketStatus
    public var lastMessageAt: Date?
    public var createdAt: Date
    public var updatedAt: Date?
    public var writerFirstName: String?
    public var writerLastName: String?
    public var writerEmail: String?
    public var sender: StaffSender?
    public var deeplink: String?

    public var writerName: String {
        if let name = sender?.name, !name.isEmpty { return name }
        return [writerFirstName, writerLastName].compactMap { $0 }.joined(separator: " ")
    }
}

public enum StaffTicketSenderRole: String, Codable, Sendable {
    case writer
    case admin
}

public struct StaffTicketMessage: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var ticketId: String
    public var senderId: String?
    public var senderRole: StaffTicketSenderRole
    public var message: String
    public var parentMessageId: String?
    public var createdAt: Date
    public var senderName: String?
}

public struct StaffTicketDetail: Codable, Sendable, Equatable {
    public var ticket: StaffTicket
    public var messages: [StaffTicketMessage]
    /// Opinion writers only: their last published and next scheduled article.
    /// Absent on older servers and for other senders.
    public var writerContext: StaffWriterOpinionContext?
}

/// The line above a writer's conversation: when they last published, what is
/// scheduled next, and whether a draft awaits review.
public struct StaffWriterOpinionContext: Codable, Sendable, Equatable {
    public var lastPublishedAt: Date?
    public var nextScheduledAt: Date?
    public var hasPendingDraft: Bool

    public init(lastPublishedAt: Date?, nextScheduledAt: Date?, hasPendingDraft: Bool) {
        self.lastPublishedAt = lastPublishedAt
        self.nextScheduledAt = nextScheduledAt
        self.hasPendingDraft = hasPendingDraft
    }

    /// `آخر مقال نُشر له: 20 أكتوبر`
    public var headline: String {
        guard let lastPublishedAt else { return "لم يُنشر له مقال بعد" }
        return "آخر مقال نُشر له: \(DeskBalanceCopy.dayMonth(lastPublishedAt))"
    }

    /// `المجدول القادم: الخميس 29 أكتوبر، 10:45 · مسودة بانتظار المراجعة`
    public var detail: String {
        let next = nextScheduledAt.map { "المجدول القادم: \(RiyadhTime.displayString($0))" } ?? "لا مقال مجدول له الآن"
        return hasPendingDraft ? "\(next) · مسودة بانتظار المراجعة" : next
    }
}

public struct StaffTicketReplyResult: Codable, Sendable, Equatable {
    public var message: StaffTicketMessage
    public var ticketStatus: StaffTicketStatus?
}

public struct StaffTicketEnvelope: Codable, Sendable, Equatable {
    public var ticket: StaffTicket
}

// MARK: - Social

public enum StaffSocialStatus: String, Codable, Sendable {
    case draft
    case scheduled
    case processing
    case published
    case failed
    case canceled
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffSocialStatus(rawValue: raw) ?? .unknown
    }

    /// Only a pending proposal or a failed post can still be acted on.
    public var isActionable: Bool { self == .draft || self == .failed || self == .scheduled }
}

public struct StaffSocialPost: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var articleId: String?
    public var platform: String?
    public var text: String
    public var linkUrl: String?
    public var imageUrl: String?
    public var mediaKind: String?
    public var mediaUrls: [String]?
    public var publisherId: String?
    public var status: StaffSocialStatus
    public var scheduledAt: Date?
    public var publishedAt: Date?
    public var externalPostUrl: String?
    public var lastError: String?
    public var createdAt: Date
    public var updatedAt: Date?
    /// `canceled` only: true for a withdrawal by the sender. Absent on older servers.
    public var canceledBySelf: Bool?
}

public struct StaffSocialPreview: Codable, Sendable, Equatable {
    public var text: String?
    public var linkUrl: String?
    public var composedText: String
    public var weightedLength: Int
    public var maxLength: Int
    public var valid: Bool
    public var overStandard: Bool?
    public var imageUrl: String?
    public var mediaKind: String?
    public var mediaUrls: [String]?
}

public struct StaffPersonRef: Codable, Sendable, Equatable {
    public var id: String
    public var name: String?
    public var email: String?
}

public struct StaffSocialAttempt: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var phase: String?
    public var outcome: String?
    public var httpStatus: Int?
    public var errorCode: String?
    public var errorMessage: String?
    public var retryable: Bool?
    public var createdAt: Date
}

public struct StaffSocialDetail: Codable, Sendable, Equatable {
    public var post: StaffSocialPost
    public var preview: StaffSocialPreview
    public var author: StaffPersonRef?
    public var agency: StaffPersonRef?
    public var article: StaffArticleRef?
    public var sender: StaffSender?
    public var attempts: [StaffSocialAttempt]
    public var deeplink: String?
    /// Same as `post.canceledBySelf`; either may be sent.
    public var canceledBySelf: Bool?

    public var isWithdrawnBySender: Bool { (canceledBySelf ?? post.canceledBySelf) == true }
}

public struct StaffSocialPostEnvelope: Codable, Sendable, Equatable {
    public var post: StaffSocialPost
}

// MARK: - Auth

public struct StaffSession: Codable, Sendable, Equatable {
    public var token: String
    public var expiresAt: Date?
    public var userId: String

    public init(token: String, expiresAt: Date?, userId: String) {
        self.token = token
        self.expiresAt = expiresAt
        self.userId = userId
    }

    public func isExpired(now: Date = Date()) -> Bool {
        guard let expiresAt else { return false }
        return expiresAt <= now
    }
}

public enum StaffLoginResult: Sendable, Equatable {
    case signedIn(StaffSession)
    case needsTwoFactor(challengeToken: String, message: String?)
}

public enum StaffSecondFactor: Sendable, Equatable {
    case code(String)
    case backupCode(String)
}

/// `{ success, token, expiresAt, user, requires2FA, challengeToken, message }`
/// from `/api/v1/auth/login` and `/api/v1/auth/verify-2fa`.
struct MemberAuthResponse: Decodable {
    struct User: Decodable { var id: String }

    var success: Bool?
    var message: String?
    var token: String?
    var expiresAt: Date?
    var user: User?
    var requires2FA: Bool?
    var challengeToken: String?
}
