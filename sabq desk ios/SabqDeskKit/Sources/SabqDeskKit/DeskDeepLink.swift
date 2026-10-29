import Foundation

/// `sabqdesk://ticket/<id>`, `sabqdesk://social/<id>`, and the host-only
/// admin screens `sabqdesk://system` and `sabqdesk://alerts`, from a URL or a
/// push payload. `sabqdesk://balances` and `sabqdesk://balances/<provider>`
/// open «أرصدة النماذج». `sabqdesk://opinion/<articleId>` opens «الرأي».
/// `sabqdesk://notifications` opens the notifications center (the bell).
public enum DeskDeepLink: Sendable, Equatable, Hashable {
    case ticket(id: String)
    case social(id: String)
    /// An opinion article on the «الرأي» timeline.
    case opinion(id: String)
    /// «حالة النظام».
    case systemHealth
    /// «تنبيهات الإدارة».
    case alerts
    /// «أرصدة النماذج».
    case balances
    /// One provider's balance (`deepseek`, `openai`, …).
    case balance(provider: String)
    /// The notifications center behind the bell.
    case notifications

    public static let scheme = "sabqdesk"

    public var url: URL {
        switch self {
        case .ticket(let id): return URL(string: "\(Self.scheme)://ticket/\(id)")!
        case .social(let id): return URL(string: "\(Self.scheme)://social/\(id)")!
        case .opinion(let id): return URL(string: "\(Self.scheme)://opinion/\(id)")!
        case .systemHealth: return URL(string: "\(Self.scheme)://system")!
        case .alerts: return URL(string: "\(Self.scheme)://alerts")!
        case .balances: return URL(string: "\(Self.scheme)://balances")!
        case .balance(let provider): return URL(string: "\(Self.scheme)://balances/\(provider)")!
        case .notifications: return URL(string: "\(Self.scheme)://notifications")!
        }
    }

    /// Ids are UUID-like; the whitelist keeps a crafted link from injecting
    /// path segments or query strings into an API request.
    public static func isValidID(_ id: String) -> Bool {
        guard (1...128).contains(id.count) else { return false }
        return id.unicodeScalars.allSatisfy { scalar in
            scalar.isASCII && (CharacterSet.alphanumerics.contains(scalar) || scalar == "-" || scalar == "_")
        }
    }

    public init?(url: URL) {
        guard url.scheme?.lowercased() == Self.scheme else { return nil }
        let kind = url.host?.lowercased()
        let segments = url.pathComponents.filter { $0 != "/" }
        if segments.isEmpty {
            switch kind {
            case "system": self = .systemHealth
            case "alerts": self = .alerts
            case "balances": self = .balances
            case "notifications": self = .notifications
            default: return nil
            }
            return
        }
        guard segments.count == 1, let id = segments.first, Self.isValidID(id) else { return nil }
        if kind == "balances" {
            let provider = id.lowercased()
            guard DeskBalanceCopy.isKnownProvider(provider) else { return nil }
            self = .balance(provider: provider)
            return
        }
        switch kind {
        case "ticket": self = .ticket(id: id)
        case "social": self = .social(id: id)
        case "opinion": self = .opinion(id: id)
        default: return nil
        }
    }

    /// Prefers the explicit `deeplink`, then the `type`s (`ai_status`,
    /// `admin_alert`, `desk.opinion_draft` + `articleId`), then falls back to the `ticketId` / `postId` fields the
    /// server sends alongside it.
    public init?(pushPayload userInfo: [AnyHashable: Any]) {
        if let raw = userInfo["deeplink"] as? String, let url = URL(string: raw), let link = DeskDeepLink(url: url) {
            self = link
            return
        }
        switch userInfo["type"] as? String {
        case "ai_status":
            self = .systemHealth
            return
        case "admin_alert":
            self = .alerts
            return
        case "desk.publisher_news":
            self = .notifications
            return
        case "desk.opinion_draft":
            // Server: notifyStaffDeskOfOpinionDraft sends data.articleId.
            if let id = userInfo["articleId"] as? String, Self.isValidID(id) {
                self = .opinion(id: id)
                return
            }
        default:
            break
        }
        if let id = userInfo["ticketId"] as? String, Self.isValidID(id) {
            self = .ticket(id: id)
            return
        }
        if let id = userInfo["postId"] as? String, Self.isValidID(id) {
            self = .social(id: id)
            return
        }
        return nil
    }

    public init?(item: StaffInboxItem) {
        guard Self.isValidID(item.id) else { return nil }
        switch item.kind {
        case .ticket: self = .ticket(id: item.id)
        case .social: self = .social(id: item.id)
        }
    }
}
