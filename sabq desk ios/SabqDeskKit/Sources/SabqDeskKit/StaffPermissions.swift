import Foundation

/// Buttons the social detail screen may show. The server re-checks every
/// permission; this only hides what would be refused anyway.
public struct SocialActionSet: Sendable, Equatable {
    public var publish: Bool
    public var schedule: Bool
    public var reject: Bool

    public var isEmpty: Bool { !publish && !schedule && !reject }
}

extension StaffCapabilities {
    public var canOpenInbox: Bool { canTickets || canSocial.view }

    /// The «النظام» tab: system health and/or admin alerts.
    public var canSystemTab: Bool { canSystemHealth || canAdminAlerts }

    /// Anything to show besides «حسابي».
    public var canOpenApp: Bool { canOpenInbox || canSystemTab || canOpinion.view || canNews }

    /// Work tabs this member sees (المكتب، الأخبار، الرأي، الرسائل، النظام).
    public var workTabCount: Int {
        [canSocial.view, canNews, canOpinion.view, canTickets, canSystemTab].filter { $0 }.count
    }

    /// iOS shows five tabs before «المزيد»: with five work tabs, «حسابي»
    /// moves to the avatar button in each screen's header (mockup 2026-10-31).
    public var accountInHeader: Bool { workTabCount >= 5 }

    /// Segments the inbox shows; a single-domain account gets no «الكل».
    public var inboxFilters: [StaffInboxFilter] {
        switch (canTickets, canSocial.view) {
        case (true, true): return [.all, .ticket, .social]
        case (true, false): return [.ticket]
        case (false, true): return [.social]
        case (false, false): return []
        }
    }

    public func socialActions(for status: StaffSocialStatus) -> SocialActionSet {
        // Mirrors the server's status guards: publish/schedule accept
        // draft|scheduled|failed, cancel accepts draft|scheduled only.
        let open = status.isActionable
        return SocialActionSet(publish: open && canSocial.publish,
                               schedule: open && canSocial.schedule,
                               reject: open && status != .failed && canSocial.reject)
    }
}

extension StaffInboxFilter {
    public var title: String {
        switch self {
        case .all: return "الكل"
        case .ticket: return "الاستفسارات"
        case .social: return "النشر"
        }
    }
}
