import Foundation

// Codable mirrors of the «الرأي» tab endpoints (`/api/v1/staff/opinion/*`,
// docs/systems/editorial/STAFF_APP_API.md). Unknown enum values fall back to
// `.unknown` so an additive server change never breaks decoding.

/// Where an opinion article stands for the desk.
public enum StaffOpinionStatus: String, Codable, Sendable, CaseIterable {
    /// Waiting for the desk (`pending_review`, or an old mobile draft).
    case newDraft = "new_draft"
    /// Approved but not scheduled yet.
    case inPrep = "in_prep"
    case scheduled
    /// Display only: published this week, no actions.
    case published
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffOpinionStatus(rawValue: raw) ?? .unknown
    }

    public var title: String {
        switch self {
        case .newDraft: return "مسودة جديدة"
        case .inPrep: return "قيد التجهيز"
        case .scheduled: return "مجدول"
        case .published: return "نُشر"
        case .unknown: return "—"
        }
    }

    /// Counts toward the tab badge.
    public var isPending: Bool { self == .newDraft || self == .inPrep }
}

/// The state of a timeline slot.
public enum StaffOpinionSlotState: String, Codable, Sendable {
    case arrived, missing, scheduled, published, late, unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = StaffOpinionSlotState(rawValue: raw) ?? .unknown
    }
}

public struct StaffOpinionFixedSlot: Codable, Sendable, Equatable, Hashable {
    /// 0 = Sunday … 6 = Saturday (Riyadh).
    public var weekday: Int
    /// `HH:mm`, Riyadh time.
    public var publishTime: String

    public init(weekday: Int, publishTime: String) {
        self.weekday = weekday
        self.publishTime = publishTime
    }

    /// «كل خميس».
    public var everyLabel: String {
        "كل \(StaffOpinionFixedSlot.weekdayNames[((weekday % 7) + 7) % 7])"
    }

    public static let weekdayNames = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"]
}

public struct StaffOpinionWriter: Codable, Sendable, Equatable, Hashable {
    public var id: String
    public var name: String
    public var avatarUrl: String?
    public var jobTitle: String?
    public var fixedSlot: StaffOpinionFixedSlot?

    public init(id: String, name: String, avatarUrl: String? = nil, jobTitle: String? = nil,
                fixedSlot: StaffOpinionFixedSlot? = nil) {
        self.id = id
        self.name = name
        self.avatarUrl = avatarUrl
        self.jobTitle = jobTitle
        self.fixedSlot = fixedSlot
    }
}

public struct StaffOpinionArticle: Codable, Sendable, Equatable, Hashable {
    public var id: String
    public var title: String
    public var status: StaffOpinionStatus
    public var submittedAt: Date?
    public var scheduledAt: Date?
    public var publishedAt: Date?

    public init(id: String, title: String, status: StaffOpinionStatus, submittedAt: Date? = nil,
                scheduledAt: Date? = nil, publishedAt: Date? = nil) {
        self.id = id
        self.title = title
        self.status = status
        self.submittedAt = submittedAt
        self.scheduledAt = scheduledAt
        self.publishedAt = publishedAt
    }
}

public struct StaffOpinionItem: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var writer: StaffOpinionWriter
    public var slotAt: Date?
    public var state: StaffOpinionSlotState
    public var article: StaffOpinionArticle?
    public var deeplink: String?

    public init(writer: StaffOpinionWriter, slotAt: Date?, state: StaffOpinionSlotState,
                article: StaffOpinionArticle?, deeplink: String? = nil) {
        self.writer = writer
        self.slotAt = slotAt
        self.state = state
        self.article = article
        self.deeplink = deeplink
    }

    /// The article id, or the writer + slot for an empty reserved slot.
    public var id: String {
        if let article { return article.id }
        return "slot-\(writer.id)-\(slotAt.map { String(Int($0.timeIntervalSince1970)) } ?? "none")"
    }

    /// A reserved fixed slot whose draft has not arrived.
    public var isAwaitingDraft: Bool { article == nil }
}

public struct StaffOpinionDay: Codable, Sendable, Equatable, Hashable {
    public struct Counts: Codable, Sendable, Equatable, Hashable {
        public var draft: Int
        public var prep: Int
        public var scheduled: Int
        public var missing: Int

        public init(draft: Int = 0, prep: Int = 0, scheduled: Int = 0, missing: Int = 0) {
            self.draft = draft
            self.prep = prep
            self.scheduled = scheduled
            self.missing = missing
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            draft = try c.decodeIfPresent(Int.self, forKey: .draft) ?? 0
            prep = try c.decodeIfPresent(Int.self, forKey: .prep) ?? 0
            scheduled = try c.decodeIfPresent(Int.self, forKey: .scheduled) ?? 0
            missing = try c.decodeIfPresent(Int.self, forKey: .missing) ?? 0
        }

        private enum CodingKeys: String, CodingKey { case draft, prep, scheduled, missing }
    }

    /// `YYYY-MM-DD`, Riyadh.
    public var date: String
    public var weekday: Int
    public var counts: Counts

    public init(date: String, weekday: Int, counts: Counts = Counts()) {
        self.date = date
        self.weekday = weekday
        self.counts = counts
    }

    /// Midnight of `date` in Riyadh.
    public var start: Date? {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return RiyadhTime.calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}

public struct StaffOpinionBoard: Codable, Sendable, Equatable {
    public var weekStart: String
    public var days: [StaffOpinionDay]
    public var slots: [StaffOpinionItem]
    public var unslotted: [StaffOpinionItem]
    public var pendingCount: Int

    public init(weekStart: String, days: [StaffOpinionDay], slots: [StaffOpinionItem],
                unslotted: [StaffOpinionItem], pendingCount: Int) {
        self.weekStart = weekStart
        self.days = days
        self.slots = slots
        self.unslotted = unslotted
        self.pendingCount = pendingCount
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        weekStart = try c.decodeIfPresent(String.self, forKey: .weekStart) ?? ""
        days = try c.decodeIfPresent([StaffOpinionDay].self, forKey: .days) ?? []
        slots = try c.decodeIfPresent([StaffOpinionItem].self, forKey: .slots) ?? []
        unslotted = try c.decodeIfPresent([StaffOpinionItem].self, forKey: .unslotted) ?? []
        pendingCount = try c.decodeIfPresent(Int.self, forKey: .pendingCount) ?? 0
    }

    private enum CodingKeys: String, CodingKey { case weekStart, days, slots, unslotted, pendingCount }

    /// Every article on the board, timeline first.
    public var allItems: [StaffOpinionItem] { slots + unslotted }

    /// No draft is waiting: the empty-week state, which still lists reserved slots.
    public var hasNoDrafts: Bool { !allItems.contains { $0.article?.status.isPending == true } }

    public func item(articleID: String) -> StaffOpinionItem? {
        allItems.first { $0.article?.id == articleID }
    }
}

/// `GET /opinion/:id`.
public struct StaffOpinionItemDetail: Codable, Sendable, Equatable {
    public var item: StaffOpinionItem
    public var nextSlot: Date?
}

public struct StaffOpinionWarning: Codable, Sendable, Equatable, Hashable {
    public var code: String
    public var message: String
    public var otherWriterName: String?
    public var otherArticleId: String?

    public init(code: String = "slot_clash", message: String, otherWriterName: String? = nil,
                otherArticleId: String? = nil) {
        self.code = code
        self.message = message
        self.otherWriterName = otherWriterName
        self.otherArticleId = otherArticleId
    }

    /// «تنبيه: الكاتب X مجدول في الموعد نفسه».
    public var displayText: String {
        if let otherWriterName, !otherWriterName.isEmpty {
            return "تنبيه: الكاتب \(otherWriterName) مجدول في الموعد نفسه"
        }
        return message
    }
}

/// `GET /opinion/:id/slot-check`.
public struct StaffOpinionSlotCheck: Codable, Sendable, Equatable {
    public var scheduledAt: Date?
    public var warnings: [StaffOpinionWarning]

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        scheduledAt = try c.decodeIfPresent(Date.self, forKey: .scheduledAt)
        warnings = try c.decodeIfPresent([StaffOpinionWarning].self, forKey: .warnings) ?? []
    }

    private enum CodingKeys: String, CodingKey { case scheduledAt, warnings }
}

/// `POST /opinion/:id/schedule`.
public struct StaffOpinionScheduleResult: Codable, Sendable, Equatable {
    public struct Article: Codable, Sendable, Equatable {
        public var id: String
        public var status: String
        public var scheduledAt: Date?
    }

    public var article: Article
    public var scheduledAt: Date?
    public var warnings: [StaffOpinionWarning]

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        article = try c.decode(Article.self, forKey: .article)
        scheduledAt = try c.decodeIfPresent(Date.self, forKey: .scheduledAt)
        warnings = try c.decodeIfPresent([StaffOpinionWarning].self, forKey: .warnings) ?? []
    }

    private enum CodingKeys: String, CodingKey { case article, scheduledAt, warnings }
}

/// When to schedule: the writer's next fixed slot, or an exact time.
public enum StaffOpinionScheduleTarget: Sendable, Equatable {
    case fixedSlot
    case at(Date)
}

/// Publish / return-to-writer answer.
public struct StaffOpinionActionResult: Codable, Sendable, Equatable {
    public struct Article: Codable, Sendable, Equatable {
        public var id: String
        public var status: String
    }

    public var article: Article
}

/// «جهّز وجدول» state: `POST/GET /opinion/:id/prepare`. Runs on the server in
/// the background (proofread → ancillaries → GPT image → schedule).
public struct StaffOpinionPrepJob: Codable, Sendable, Equatable {
    public enum Status: String, Codable, Sendable { case running, done, failed }

    public var articleId: String
    public var status: Status
    public var step: String?
    public var stepLabel: String?
    public var scheduledAt: Date?
    public var titleChanged: Bool
    public var contentFixes: Int
    /// `generated` = a new image; `kept` = the article already had one.
    public var image: String?
    public var message: String?

    public var isFinished: Bool { status != .running }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        articleId = try c.decode(String.self, forKey: .articleId)
        status = (try? c.decode(Status.self, forKey: .status)) ?? .failed
        step = try c.decodeIfPresent(String.self, forKey: .step)
        stepLabel = try c.decodeIfPresent(String.self, forKey: .stepLabel)
        scheduledAt = try c.decodeIfPresent(Date.self, forKey: .scheduledAt)
        titleChanged = try c.decodeIfPresent(Bool.self, forKey: .titleChanged) ?? false
        contentFixes = try c.decodeIfPresent(Int.self, forKey: .contentFixes) ?? 0
        image = try c.decodeIfPresent(String.self, forKey: .image)
        message = try c.decodeIfPresent(String.self, forKey: .message)
    }

    private enum CodingKeys: String, CodingKey {
        case articleId, status, step, stepLabel, scheduledAt, titleChanged, contentFixes, image, message
    }
}

struct StaffOpinionPrepEnvelope: Decodable {
    var job: StaffOpinionPrepJob
}

// MARK: - Display helpers

extension RiyadhTime {
    /// `أسبوع 28 أكتوبر – 3 نوفمبر`, Latin digits.
    public static func weekTitle(from start: Date, days: Int = 7) -> String {
        let calendar = calendar
        let end = calendar.date(byAdding: .day, value: max(days - 1, 0), to: start) ?? start
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.calendar = calendar
        formatter.dateFormat = "d MMMM"
        return "أسبوع \(formatter.string(from: start)) – \(formatter.string(from: end))"
    }

    /// `2026-10-29` — the Riyadh day a moment falls on, the board's `date` key.
    public static func dayString(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Short weekday for the day strip: «أربعاء», «خميس».
    public static func shortWeekday(_ date: Date) -> String {
        let weekday = calendar.component(.weekday, from: date) - 1
        return StaffOpinionFixedSlot.weekdayNames[(weekday + 7) % 7]
    }

    /// Day of month with Latin digits.
    public static func dayNumber(_ date: Date) -> String {
        String(calendar.component(.day, from: date))
    }

    /// `بعد 23 س` within two days, `بعد 4 أيام` after, `بعد 12 د` within the hour; nil when past.
    public static func slotCountdown(to date: Date, now: Date = Date()) -> String? {
        let seconds = date.timeIntervalSince(now)
        guard seconds > 0 else { return nil }
        let minutes = Int((seconds / 60).rounded(.up))
        if minutes < 60 { return "بعد \(minutes) د" }
        let hours = minutes / 60
        if hours < 36 { return "بعد \(hours) س" }
        let days = Int((Double(hours) / 24).rounded())
        switch days {
        case 2: return "بعد يومين"
        case 3...10: return "بعد \(days) أيام"
        default: return "بعد \(days) يومًا"
        }
    }
}
