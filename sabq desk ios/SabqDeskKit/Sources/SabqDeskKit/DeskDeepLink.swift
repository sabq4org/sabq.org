import Foundation

/// `sabqdesk://ticket/<id>`, `sabqdesk://social/<id>`, and the host-only
/// admin screens `sabqdesk://system` and `sabqdesk://alerts`, from a URL or a
/// push payload.
public enum DeskDeepLink: Sendable, Equatable, Hashable {
    case ticket(id: String)
    case social(id: String)
    /// «حالة النظام».
    case systemHealth
    /// «تنبيهات الإدارة».
    case alerts

    public static let scheme = "sabqdesk"

    public var url: URL {
        switch self {
        case .ticket(let id): return URL(string: "\(Self.scheme)://ticket/\(id)")!
        case .social(let id): return URL(string: "\(Self.scheme)://social/\(id)")!
        case .systemHealth: return URL(string: "\(Self.scheme)://system")!
        case .alerts: return URL(string: "\(Self.scheme)://alerts")!
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
            default: return nil
            }
            return
        }
        guard segments.count == 1, let id = segments.first, Self.isValidID(id) else { return nil }
        switch kind {
        case "ticket": self = .ticket(id: id)
        case "social": self = .social(id: id)
        default: return nil
        }
    }

    /// Prefers the explicit `deeplink`, then the admin `type`s (`ai_status`,
    /// `admin_alert`), then falls back to the `ticketId` / `postId` fields the
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
