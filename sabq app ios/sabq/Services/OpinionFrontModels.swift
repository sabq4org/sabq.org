import Foundation

// صفحة الرأي العادلة (GET /api/opinion-front) وإضافات صفحة الكاتب (`writer` في
// /api/v1/authors/by-name) — نفس بيانات الويب (#2256، #2257).

nonisolated struct APIOpinionFrontArticle: Decodable, Identifiable {
    let opinion: APIOpinion
    let readMinutes: Int
    let categoryName: String?
    let authorBio: String?

    var id: String { opinion.id }

    init(from decoder: Decoder) throws {
        opinion = try APIOpinion(from: decoder)
        let c = try decoder.container(keyedBy: FlexKey.self)
        readMinutes = (try? c.decode(Int.self, forKey: FlexKey("readMinutes"))) ?? 0
        if let cat = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey("category")) {
            categoryName = try? cat.decode(String.self, forKey: FlexKey("nameAr"))
        } else {
            categoryName = nil
        }
        if let auth = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey("author")) {
            authorBio = try? auth.decode(String.self, forKey: FlexKey("bio"))
        } else {
            authorBio = nil
        }
    }
}

nonisolated struct APIOpinionFrontWriter: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let profileImageUrl: String?
    let bio: String?
    let gender: String?
    let articleCount: Int

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? UUID().uuidString
        name = (try? c.decode(String.self, forKey: FlexKey("name"))) ?? ""
        profileImageUrl = (try? c.decode(String.self, forKey: FlexKey("profileImageUrl"))).map { URLConstants.absolutize($0) }
        bio = try? c.decode(String.self, forKey: FlexKey("bio"))
        gender = try? c.decode(String.self, forKey: FlexKey("gender"))
        articleCount = (try? c.decode(Int.self, forKey: FlexKey("articleCount"))) ?? 0
    }
}

nonisolated struct APIOpinionFrontDay: Decodable, Hashable {
    let key: String
    let count: Int
    let isToday: Bool
    let isFuture: Bool

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        key = (try? c.decode(String.self, forKey: FlexKey("key"))) ?? ""
        count = (try? c.decode(Int.self, forKey: FlexKey("count"))) ?? 0
        isToday = (try? c.decode(Bool.self, forKey: FlexKey("isToday"))) ?? false
        isFuture = (try? c.decode(Bool.self, forKey: FlexKey("isFuture"))) ?? false
    }
}

nonisolated struct APIOpinionFrontSpotlight: Decodable {
    let writer: APIOpinionFrontWriter
    let article: APIOpinionFrontArticle?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        writer = try c.decode(APIOpinionFrontWriter.self, forKey: FlexKey("writer"))
        article = try? c.decode(APIOpinionFrontArticle.self, forKey: FlexKey("article"))
    }
}

nonisolated struct APIOpinionFront: Decodable {
    let today: String
    let days: [APIOpinionFrontDay]
    let latestDay: String?
    let articlesByDay: [String: [APIOpinionFrontArticle]]
    let hot: [APIOpinionFrontArticle]
    let spotlight: APIOpinionFrontSpotlight?
    let rosterTotal: Int
    let roster: [APIOpinionFrontWriter]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        today = (try? c.decode(String.self, forKey: FlexKey("today"))) ?? ""
        days = (try? c.decode([APIOpinionFrontDay].self, forKey: FlexKey("days"))) ?? []
        latestDay = try? c.decode(String.self, forKey: FlexKey("latestDay"))
        articlesByDay = (try? c.decode([String: [APIOpinionFrontArticle]].self, forKey: FlexKey("articlesByDay"))) ?? [:]
        hot = (try? c.decode([APIOpinionFrontArticle].self, forKey: FlexKey("hot"))) ?? []
        spotlight = try? c.decode(APIOpinionFrontSpotlight.self, forKey: FlexKey("spotlight"))
        if let r = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey("roster")) {
            rosterTotal = (try? r.decode(Int.self, forKey: FlexKey("total"))) ?? 0
            roster = (try? r.decode([APIOpinionFrontWriter].self, forKey: FlexKey("writers"))) ?? []
        } else {
            rosterTotal = 0
            roster = []
        }
    }
}

nonisolated struct APIWriterPeer: Decodable, Hashable, Identifiable {
    let id: String
    let name: String
    let avatarUrl: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? UUID().uuidString
        name = (try? c.decode(String.self, forKey: FlexKey("name"))) ?? ""
        avatarUrl = (try? c.decode(String.self, forKey: FlexKey("avatarUrl"))).map { URLConstants.absolutize($0) }
    }
}

/// كاتب الرأي في صفحة الكاتب. `weekday`: 0 الأحد … 6 السبت بتوقيت الرياض.
nonisolated struct APIWriterExtras: Decodable {
    let weekday: Int?
    let nextDayKey: String?
    let usualCategories: [String]
    let peers: [APIWriterPeer]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        weekday = try? c.decode(Int.self, forKey: FlexKey("weekday"))
        nextDayKey = try? c.decode(String.self, forKey: FlexKey("nextDayKey"))
        usualCategories = (try? c.decode([String].self, forKey: FlexKey("usualCategories"))) ?? []
        peers = (try? c.decode([APIWriterPeer].self, forKey: FlexKey("peers"))) ?? []
    }
}

extension APIClient {
    /// صفحة الرأي للقارئ: مقالات الأسبوع يومًا بيوم، و«يقرؤونه الآن»، و«تعرّف على كاتب»، والكتّاب.
    func fetchOpinionFront() async throws -> APIOpinionFront {
        try await get(APIOpinionFront.self, path: "/opinion-front", apiRoot: URLConstants.publicAPI)
    }
}

/// نصوص عربية مشتركة بين صفحة الرأي وصفحة الكاتب (مطابقة للويب).
enum OpinionText {
    static let weekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]

    /// مقال واحد، مقالان، 3–10 مقالات، 11+ مقالًا.
    static func count(_ n: Int) -> String {
        switch n {
        case 0: return "لا مقالات"
        case 1: return "مقال واحد"
        case 2: return "مقالان"
        case 3...10: return "\(n) مقالات"
        default: return "\(n) مقالًا"
        }
    }

    static func readTime(_ n: Int) -> String {
        switch n {
        case 1: return "دقيقة قراءة"
        case 2: return "دقيقتان قراءة"
        case 3...10: return "\(n) دقائق قراءة"
        default: return "\(n) دقيقة قراءة"
        }
    }

    private static let riyadh = TimeZone(identifier: "Asia/Riyadh") ?? .current

    private static func formatter(_ format: String, tz: TimeZone) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "ar")
        f.timeZone = tz
        f.dateFormat = format
        return f
    }

    /// مفتاح يوم «YYYY-MM-DD» → تاريخ ظهرًا بتوقيت UTC.
    static func dayDate(_ key: String) -> Date? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: "\(key) 12:00")
    }

    static func weekdayName(_ key: String) -> String {
        guard let d = dayDate(key) else { return "" }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC") ?? .current
        return weekdays[cal.component(.weekday, from: d) - 1]
    }

    static func dayNumber(_ key: String) -> String {
        String(Int(key.suffix(2)) ?? 0)
    }

    /// «الثلاثاء 1 ديسمبر» لمفتاح يوم.
    static func dayLabel(_ key: String) -> String {
        guard let d = dayDate(key) else { return key }
        let month = latin(formatter("MMMM", tz: TimeZone(identifier: "UTC") ?? .current).string(from: d))
        return "\(weekdayName(key)) \(dayNumber(key)) \(month)"
    }

    /// «الثلاثاء 24 نوفمبر» لتاريخ نشر بتوقيت الرياض.
    static func publishDay(_ date: Date) -> String {
        let weekday = latin(formatter("EEEE", tz: riyadh).string(from: date))
        let day = latin(formatter("d", tz: riyadh).string(from: date))
        let month = latin(formatter("MMMM", tz: riyadh).string(from: date))
        return "\(weekday) \(day) \(month)"
    }

    /// «نوفمبر 2026» بتوقيت الرياض.
    static func monthYear(_ date: Date) -> String {
        latin(formatter("MMMM yyyy", tz: riyadh).string(from: date))
    }

    static func monthKey(_ date: Date) -> String {
        let f = formatter("yyyy-MM", tz: riyadh)
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: date)
    }

    /// أرقام لاتينية دائمًا.
    static func latin(_ s: String) -> String {
        let map: [Character: Character] = ["٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"]
        return String(s.map { map[$0] ?? $0 })
    }

    /// صفة الكاتب تحت اسمه: أول جملة قصيرة من النبذة، وإلا «كاتب/كاتبة رأي» (مثل الويب).
    static func role(bio: String?, name: String, gender: String?) -> String {
        let fallback = gender == "female" ? "كاتبة رأي" : "كاتب رأي"
        guard let bio, !bio.isEmpty else { return fallback }
        let firstLine = bio
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .first { !$0.isEmpty && !$0.contains("http") } ?? ""
        var line = firstLine
        if !name.isEmpty, line.hasPrefix(name) {
            line = String(line.dropFirst(name.count)).trimmingCharacters(in: CharacterSet(charactersIn: " ،,:-–—|"))
        }
        if let cut = line.firstIndex(where: { ".،؛!؟".contains($0) }) {
            line = String(line[..<cut])
        }
        line = line.trimmingCharacters(in: .whitespaces)
        if line.count < 3 || line.count > 68 { return fallback }
        return line
    }
}
