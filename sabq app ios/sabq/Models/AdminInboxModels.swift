import SwiftUI

// Soft status tints for inbox labels — light enough to stay calm, distinct enough to scan.
// primaryButton stays dark enough that white send-button text remains readable.
nonisolated enum AdminInboxPalette {
    /// Soft blue — read / filter default
    static let action = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.55, green: 0.70, blue: 0.92, alpha: 1)
            : UIColor(red: 0.28, green: 0.45, blue: 0.72, alpha: 1)
    })

    /// Soft green — replied / answered
    static let success = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.48, green: 0.78, blue: 0.68, alpha: 1)
            : UIColor(red: 0.18, green: 0.52, blue: 0.42, alpha: 1)
    })

    /// Soft amber — pending / open
    static let warning = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.92, green: 0.78, blue: 0.48, alpha: 1)
            : UIColor(red: 0.62, green: 0.42, blue: 0.12, alpha: 1)
    })

    /// Soft rose — unread / new
    static let danger = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.92, green: 0.62, blue: 0.60, alpha: 1)
            : UIColor(red: 0.72, green: 0.32, blue: 0.30, alpha: 1)
    })

    static let primaryButton = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.30, green: 0.34, blue: 0.40, alpha: 1)
            : UIColor(red: 0.22, green: 0.26, blue: 0.32, alpha: 1)
    })
}

// MARK: - Contact-message inbox

nonisolated enum AdminContactMessageStatus: String, CaseIterable, Codable, Identifiable {
    case pending
    case read
    case replied

    var id: String { rawValue }

    var label: String {
        switch self {
        case .pending: return "بانتظار القراءة"
        case .read: return "تمت القراءة"
        case .replied: return "تم الرد"
        }
    }

    var icon: String {
        switch self {
        case .pending: return "envelope.badge"
        case .read: return "envelope.open"
        case .replied: return "checkmark.message"
        }
    }

    var tint: Color {
        switch self {
        case .pending: return AdminInboxPalette.warning
        case .read: return AdminInboxPalette.action
        case .replied: return AdminInboxPalette.success
        }
    }
}

nonisolated struct AdminContactMessage: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let phone: String
    let email: String
    let subject: String
    let message: String
    var status: AdminContactMessageStatus
    let createdAt: Date
    let repliedAt: Date?
    let replyText: String?

    private enum CodingKeys: String, CodingKey {
        case id, name, phone, email, subject, message, status, createdAt, repliedAt, replyText
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = (try? c.decode(String.self, forKey: .name)) ?? ""
        phone = (try? c.decode(String.self, forKey: .phone)) ?? ""
        email = (try? c.decode(String.self, forKey: .email)) ?? ""
        subject = (try? c.decode(String.self, forKey: .subject)) ?? ""
        message = (try? c.decode(String.self, forKey: .message)) ?? ""
        status = (try? c.decode(AdminContactMessageStatus.self, forKey: .status)) ?? .pending
        let created = (try? c.decode(String.self, forKey: .createdAt)) ?? ""
        createdAt = SabqFormatters.parseISO8601(created) ?? Date()
        let replied = (try? c.decode(String.self, forKey: .repliedAt)) ?? ""
        repliedAt = SabqFormatters.parseISO8601(replied)
        replyText = try? c.decodeIfPresent(String.self, forKey: .replyText)
    }
}

nonisolated struct AdminContactMessageReply: Identifiable, Decodable, Hashable {
    let id: String
    let replyText: String
    let responderName: String?
    let createdAt: Date

    private enum CodingKeys: String, CodingKey { case id, replyText, responderName, createdAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        replyText = (try? c.decode(String.self, forKey: .replyText)) ?? ""
        responderName = try? c.decodeIfPresent(String.self, forKey: .responderName)
        let created = (try? c.decode(String.self, forKey: .createdAt)) ?? ""
        createdAt = SabqFormatters.parseISO8601(created) ?? Date()
    }
}

nonisolated struct AdminContactMessagesResponse: Decodable {
    let messages: [AdminContactMessage]
    let total: Int
    let page: Int
    let totalPages: Int
}

nonisolated struct AdminContactMessageDetailResponse: Decodable {
    let message: AdminContactMessage
    let replies: [AdminContactMessageReply]
}

// MARK: - Opinion-ticket inbox

nonisolated enum AdminOpinionTicketStatus: String, CaseIterable, Codable, Identifiable {
    case open
    case answered
    case closed

    var id: String { rawValue }

    var label: String {
        switch self {
        case .open: return "مفتوح"
        case .answered: return "تمت الإجابة"
        case .closed: return "مغلق"
        }
    }

    var icon: String {
        switch self {
        case .open: return "bubble.left.and.bubble.right.fill"
        case .answered: return "checkmark.bubble.fill"
        case .closed: return "lock.fill"
        }
    }

    var tint: Color {
        switch self {
        case .open: return AdminInboxPalette.warning
        case .answered: return AdminInboxPalette.success
        case .closed: return SabqTheme.secondaryInk
        }
    }
}

nonisolated struct AdminOpinionTicket: Identifiable, Decodable, Hashable {
    let id: String
    let writerId: String
    let writerName: String?
    let writerEmail: String?
    let title: String
    var status: AdminOpinionTicketStatus
    let lastMessageAt: Date
    let createdAt: Date
    let hasUnread: Bool

    private enum CodingKeys: String, CodingKey {
        case id, writerId, writerName, writerEmail, title, status, lastMessageAt, createdAt, hasUnread
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        writerId = (try? c.decode(String.self, forKey: .writerId)) ?? ""
        writerName = try? c.decodeIfPresent(String.self, forKey: .writerName)
        writerEmail = try? c.decodeIfPresent(String.self, forKey: .writerEmail)
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        status = (try? c.decode(AdminOpinionTicketStatus.self, forKey: .status)) ?? .open
        let lastMessage = (try? c.decode(String.self, forKey: .lastMessageAt)) ?? ""
        lastMessageAt = SabqFormatters.parseISO8601(lastMessage) ?? Date()
        let created = (try? c.decode(String.self, forKey: .createdAt)) ?? ""
        createdAt = SabqFormatters.parseISO8601(created) ?? Date()
        hasUnread = (try? c.decode(Bool.self, forKey: .hasUnread)) ?? false
    }
}

nonisolated struct AdminOpinionTicketMessage: Identifiable, Decodable, Hashable {
    let id: String
    let ticketId: String
    let senderId: String
    let senderRole: String
    let senderName: String?
    let message: String
    let parentMessageId: String?
    let createdAt: Date

    var isFromAdmin: Bool { senderRole == "admin" }

    private enum CodingKeys: String, CodingKey {
        case id, ticketId, senderId, senderRole, senderName, message, parentMessageId, createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        ticketId = (try? c.decode(String.self, forKey: .ticketId)) ?? ""
        senderId = (try? c.decode(String.self, forKey: .senderId)) ?? ""
        senderRole = (try? c.decode(String.self, forKey: .senderRole)) ?? "writer"
        senderName = try? c.decodeIfPresent(String.self, forKey: .senderName)
        message = (try? c.decode(String.self, forKey: .message)) ?? ""
        parentMessageId = try? c.decodeIfPresent(String.self, forKey: .parentMessageId)
        let created = (try? c.decode(String.self, forKey: .createdAt)) ?? ""
        createdAt = SabqFormatters.parseISO8601(created) ?? Date()
    }
}

nonisolated struct AdminOpinionTicketsResponse: Decodable {
    let tickets: [AdminOpinionTicket]
    let total: Int
    let page: Int
    let totalPages: Int
}

nonisolated struct AdminOpinionTicketDetailResponse: Decodable {
    let ticket: AdminOpinionTicket
    let messages: [AdminOpinionTicketMessage]
}

nonisolated struct AdminInboxActionResponse: Decodable {
    let success: Bool?
    let message: String?
    let emailSent: Bool?
}
