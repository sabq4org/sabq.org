import Foundation

// Pure rules behind the redesigned desk (approved mockup 2026-10-25): the
// four social tabs, the three message tabs, Arabic counts, Riyadh day and
// countdown labels, quick schedule slots and the schedule-clash check.

/// The four tabs of «المكتب». Each maps to one inbox query.
public enum DeskSocialSection: String, CaseIterable, Sendable, Identifiable {
    case pending
    case scheduled
    case published
    case rejected

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .pending: return "بانتظارك"
        case .scheduled: return "مجدول"
        case .published: return "منشور"
        case .rejected: return "مرفوض"
        }
    }

    /// `status` sent to `/inbox`. A failed post waits for a decision too.
    public var statusQuery: String {
        switch self {
        case .pending: return "draft,processing,failed"
        case .scheduled: return "scheduled"
        case .published: return "published"
        case .rejected: return "canceled"
        }
    }

    public var query: StaffInboxQuery {
        StaffInboxQuery(type: .social, status: statusQuery, limit: 30)
    }

    public var emptyTitle: String {
        switch self {
        case .pending: return "لا شيء بانتظارك"
        case .scheduled: return "لا منشورات مجدولة"
        case .published: return "لم يُنشر شيء بعد"
        case .rejected: return "لا مقترحات مرفوضة"
        }
    }

    public var emptyMessage: String {
        switch self {
        case .pending: return "تصلك المقترحات الجديدة من الكتّاب والوكالات هنا فور إرسالها."
        case .scheduled: return "ما تجدوله يظهر هنا على خط زمني بتوقيت الرياض."
        case .published: return "تظهر هنا التغريدات المنشورة على حساب سبق مع روابطها."
        case .rejected: return "المقترحات المرفوضة وأسبابها تظهر هنا، ويمكن إعادتها إلى الانتظار."
        }
    }
}

/// The three tabs of «الرسائل».
public enum DeskTicketSection: String, CaseIterable, Sendable, Identifiable {
    case awaiting
    case answered
    case closed

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .awaiting: return "تنتظر ردك"
        case .answered: return "تم الرد"
        case .closed: return "مغلقة"
        }
    }

    public var status: StaffTicketStatus {
        switch self {
        case .awaiting: return .open
        case .answered: return .answered
        case .closed: return .closed
        }
    }

    public func query(search: String) -> StaffInboxQuery {
        StaffInboxQuery(type: .ticket, status: status.rawValue, search: search, limit: 30)
    }

    public var emptyTitle: String {
        switch self {
        case .awaiting: return "لا رسائل تنتظر ردك"
        case .answered: return "لا رسائل تم الرد عليها"
        case .closed: return "لا رسائل مغلقة"
        }
    }
}

/// Arabic number agreement for the desk's counts (Latin digits).
public enum DeskCount {
    /// `تغريدة واحدة`, `تغريدتان`, `3 تغريدات`, `11 تغريدة`.
    public static func tweets(_ count: Int) -> String {
        phrase(count, one: "تغريدة واحدة", two: "تغريدتان", few: "تغريدات", many: "تغريدة")
    }

    /// `رسالة واحدة`, `رسالتان`, `3 رسائل`, `11 رسالة`.
    public static func messages(_ count: Int) -> String {
        phrase(count, one: "رسالة واحدة", two: "رسالتان", few: "رسائل", many: "رسالة")
    }

    static func phrase(_ count: Int, one: String, two: String, few: String, many: String) -> String {
        switch count {
        case 1: return one
        case 2: return two
        case 3...10: return "\(count) \(few)"
        default: return "\(count) \(many)"
        }
    }

    /// The assistant's opening line on the desk and lock screens.
    public static func greeting(name: String?, pendingTweets: Int, openMessages: Int,
                                showsTweets: Bool, showsMessages: Bool) -> String {
        let firstName = name?.split(separator: " ").first.map(String.init)
        let hello = firstName.map { "أهلًا \($0)، " } ?? "أهلًا، "
        var parts: [String] = []
        if showsTweets, pendingTweets > 0 { parts.append("\(tweets(pendingTweets)) بانتظار قرارك") }
        if showsMessages, openMessages > 0 { parts.append("\(messages(openMessages)) من المساهمين") }
        if parts.isEmpty { return hello + "لا شيء ينتظرك الآن." }
        return hello + "عندك " + parts.joined(separator: " و") + "."
    }
}

extension RiyadhTime {
    /// Section title for the scheduled timeline: `اليوم · الأحد 25 أكتوبر`,
    /// `غدًا · الاثنين 26 أكتوبر`, or just the date further out.
    public static func dayTitle(_ date: Date, now: Date = Date()) -> String {
        let calendar = calendar
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.calendar = calendar
        formatter.dateFormat = "EEEE d MMMM"
        let label = formatter.string(from: date)
        let today = calendar.startOfDay(for: now)
        let day = calendar.startOfDay(for: date)
        let offset = calendar.dateComponents([.day], from: today, to: day).day ?? 0
        switch offset {
        case 0: return "اليوم · \(label)"
        case 1: return "غدًا · \(label)"
        case -1: return "أمس · \(label)"
        default: return label
        }
    }

    /// Start of the Riyadh day, used to group the timeline.
    public static func dayKey(_ date: Date) -> Date {
        calendar.startOfDay(for: date)
    }

    /// `بعد 12 د` under an hour, `بعد 1:25` within a day, nil otherwise or when past.
    public static func countdown(to date: Date, now: Date = Date()) -> String? {
        let seconds = date.timeIntervalSince(now)
        guard seconds > 0 else { return nil }
        let minutes = Int((seconds / 60).rounded(.up))
        if minutes < 60 { return "بعد \(minutes) د" }
        guard minutes < 24 * 60 else { return nil }
        return String(format: "بعد %d:%02d", minutes / 60, minutes % 60)
    }

    /// `الآن`, `قبل 12 د`, `قبل 3 س`, `أمس`, then the short date.
    public static func ago(_ date: Date, now: Date = Date()) -> String {
        let seconds = now.timeIntervalSince(date)
        if seconds < 60 { return "الآن" }
        let minutes = Int(seconds / 60)
        if minutes < 60 { return "قبل \(minutes) د" }
        let calendar = calendar
        if calendar.isDate(date, inSameDayAs: now) { return "قبل \(minutes / 60) س" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
           calendar.isDate(date, inSameDayAs: yesterday) {
            return "أمس"
        }
        return shortString(date, relativeTo: now)
    }

    /// The Riyadh date at `hour:minute` on the day of `day`.
    static func at(hour: Int, minute: Int = 0, on day: Date) -> Date? {
        var parts = calendar.dateComponents([.year, .month, .day], from: day)
        parts.hour = hour
        parts.minute = minute
        return calendar.date(from: parts)
    }
}

/// One-tap slots in the schedule sheet.
public struct SchedulePreset: Sendable, Equatable, Identifiable {
    public var id: String
    public var title: String
    public var date: Date

    /// «بعد ساعة», «الليلة 21:00» (or «مساء الغد» once that has passed),
    /// «غدًا صباحًا 07:00». Each is at least the earliest allowed slot.
    public static func defaults(now: Date = Date()) -> [SchedulePreset] {
        let earliest = RiyadhTime.earliestSchedulableDate(now: now)
        var result: [SchedulePreset] = []
        let inOneHour = RiyadhTime.earliestSchedulableDate(now: now.addingTimeInterval(55 * 60))
        result.append(SchedulePreset(id: "hour", title: "بعد ساعة", date: inOneHour))

        let calendar = RiyadhTime.calendar
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: now) ?? now.addingTimeInterval(86_400)
        if let tonight = RiyadhTime.at(hour: 21, on: now), tonight >= earliest, tonight > inOneHour {
            result.append(SchedulePreset(id: "tonight", title: "الليلة", date: tonight))
        } else if let evening = RiyadhTime.at(hour: 21, on: tomorrow) {
            result.append(SchedulePreset(id: "tomorrow-evening", title: "مساء الغد", date: evening))
        }
        if let morning = RiyadhTime.at(hour: 7, on: tomorrow), morning >= earliest {
            result.append(SchedulePreset(id: "tomorrow-morning", title: "غدًا صباحًا", date: morning))
        }
        return result
    }
}

public enum ScheduleClash {
    /// The nearest already-scheduled time within `window` of `date`, if any.
    public static func nearest(to date: Date, among scheduled: [Date], window: TimeInterval = 30 * 60) -> Date? {
        scheduled
            .filter { abs($0.timeIntervalSince(date)) < window }
            .min { abs($0.timeIntervalSince(date)) < abs($1.timeIntervalSince(date)) }
    }
}

/// Up to two initials for an avatar; ZWNJ keeps Arabic letters unjoined.
public enum DeskInitials {
    public static func of(_ name: String) -> String {
        let skip: Set<String> = ["د.", "أ.", "م.", "د", "أ.د."]
        let words = name.split(whereSeparator: { $0.isWhitespace || $0 == "@" })
            .map(String.init)
            .filter { !skip.contains($0) }
        let letters = words.prefix(2).compactMap { $0.first }.map { String($0) }
        return letters.isEmpty ? "؟" : letters.joined(separator: "\u{200C}")
    }
}

/// Editable quick replies for the message composer, kept on this device.
public final class QuickReplyStore: @unchecked Sendable {
    public static let defaults = ["تم، شكرًا لك", "نراجعه ونعود لك", "تم تعديل الموعد"]
    private static let preferenceName = "desk.quickReplies"
    private let storage: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.storage = defaults
    }

    public var replies: [String] {
        get {
            guard let stored = storage.stringArray(forKey: Self.preferenceName) else { return Self.defaults }
            return stored
        }
        set {
            let cleaned = newValue
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .map { String($0.prefix(200)) }
            storage.set(Array(cleaned.prefix(8)), forKey: Self.preferenceName)
        }
    }
}
