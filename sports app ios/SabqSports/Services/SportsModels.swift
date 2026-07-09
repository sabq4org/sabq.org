import Foundation

// نماذج بيانات البوابة الرياضية — مطابقة لـ DTOs الخادم في saudiLeagueService.ts
// (SplFixture / SplStandingRow / SplScorer / SplCompetitionMeta). الخادم يعيد
// الأسماء معرّبة. nonisolated لأن SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor.

// MARK: - الكيانات الأساسية

nonisolated struct SpTeam: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String
    let winner: Bool?
}

nonisolated struct SpStatus: Codable, Hashable {
    let code: String
    let label: String
    let elapsed: Int?
    let extra: Int?
    let live: Bool
    let finished: Bool
    /// مرساة الساعة الذاتية من الخادم (Unix ثوانٍ) — «الآن − الزمن المنقضي»
    /// مثبّتة عبر matchClock الموحّد، نفس قيمة دفعات Live Activity حرفيًّا.
    /// منها يشتق `SpMatchClock` العدّاد فيتطابق التطبيق مع شاشة القفل.
    /// nil = الساعة متوقّفة أو استجابة لا تحقنها (تسقط للعرض الثابت).
    var clockStartEpoch: Double? = nil
}

nonisolated struct SpScore: Codable, Hashable {
    let home: Int?
    let away: Int?
}

nonisolated struct SpVenue: Codable, Hashable {
    let name: String
    let city: String
}

// مباراة — تخدم مباريات البطولة (بلا competition) ولوحة اليوم/المباشر
// (SplLiveBoardItem = SplFixture + competition + competitionSlug) عبر جعل
// حقلَي البطولة اختياريين.
nonisolated struct SpFixture: Codable, Identifiable, Hashable {
    let id: Int
    let date: String
    let timestamp: Int
    var status: SpStatus
    let round: String
    let venue: SpVenue
    let home: SpTeam
    let away: SpTeam
    let goals: SpScore
    /// نتيجة ركلات الترجيح — لحظية أثناء الترجيح (code=P) ونهائية بعده (PEN).
    let penalties: SpScore?
    let competition: String?
    let competitionSlug: String?

    var started: Bool { status.live || status.finished }

    /// ركلات الترجيح جارية الآن.
    var shootoutLive: Bool { status.live && status.code == "P" }

    /// نتيجة ترجيح معلومة (جارية أو نهائية) — nil إن لا ترجيح.
    var penaltyScore: SpScore? {
        guard let p = penalties, p.home != nil || p.away != nil else { return nil }
        return p
    }

    /// لحظة انطلاق المباراة (من الطابع الزمني) — أساس العدّاد التنازلي.
    var kickoff: Date { Date(timeIntervalSince1970: TimeInterval(timestamp)) }

    /// يحتفظ بـ competition/competitionSlug من لقطة سابقة عند التحديث بمسار lite.
    func preservingCompetition(from other: SpFixture) -> SpFixture {
        SpFixture(
            id: id, date: date, timestamp: timestamp, status: status, round: round,
            venue: venue, home: home, away: away, goals: goals, penalties: penalties,
            competition: competition ?? other.competition,
            competitionSlug: competitionSlug ?? other.competitionSlug
        )
    }
}

nonisolated struct SpStandingRow: Decodable, Identifiable, Hashable {
    let rank: Int
    let team: SpTeam
    let played: Int
    let win: Int
    let draw: Int
    let lose: Int
    let goalsFor: Int
    let goalsAgainst: Int
    let goalsDiff: Int
    let points: Int
    let form: String?
    let live: Bool?
    var id: Int { team.id }
}

nonisolated struct SpScorer: Decodable, Identifiable, Hashable {
    let rank: Int
    let id: Int
    let name: String
    let photo: String
    let team: SpTeam
    let goals: Int
    let assists: Int
    let penalties: Int
    let matches: Int
}

// بطولة — listCompetitions الأساسية، تُثرى بـ logo/season/status عند توفّر المفتاح.
nonisolated struct SpCompetition: Codable, Identifiable, Hashable {
    let slug: String
    let name: String
    let type: String        // "league" | "cup"
    let category: String    // "saudi" | "gulf" | "arab" | "european" | "world"
    let hasStandings: Bool
    let hasScorers: Bool
    let hasStats: Bool
    let logo: String?
    let season: Int?
    let status: String?     // "ongoing" | "upcoming" | "finished" | "unknown"
    var id: String { slug }
}

// MARK: - مغلفات الاستجابة

nonisolated struct SpCompetitionsResponse: Decodable {
    let configured: Bool
    let competitions: [SpCompetition]
}

nonisolated struct SpTodayResponse: Decodable {
    let configured: Bool
    let today: [SpFixture]
}

nonisolated struct SpLiveResponse: Decodable {
    let configured: Bool
    let live: [SpFixture]
}

// عنصر البث المباشر العالمي — كل مباراة قائمة الآن في العالم (لا بطولاتنا فقط)
// مع بلدها وبطولتها وشعارها. competitionSlug غير null لبطولاتنا المُدرَجة.
nonisolated struct SpWorldLiveItem: Decodable, Identifiable {
    let competition: String?
    let competitionSlug: String?
    let country: String
    let countryAr: String
    let flag: String?
    let leagueId: Int
    let leagueLogo: String?
    let fixture: SpFixture   // يُفكّ من نفس الكائن المسطّح
    var id: Int { fixture.id }

    enum CodingKeys: String, CodingKey {
        case competition, competitionSlug, country, countryAr, flag, leagueId, leagueLogo
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        competition = try c.decodeIfPresent(String.self, forKey: .competition)
        competitionSlug = try c.decodeIfPresent(String.self, forKey: .competitionSlug)
        country = (try? c.decode(String.self, forKey: .country)) ?? ""
        countryAr = (try? c.decode(String.self, forKey: .countryAr)) ?? ""
        flag = try c.decodeIfPresent(String.self, forKey: .flag)
        leagueId = (try? c.decode(Int.self, forKey: .leagueId)) ?? 0
        leagueLogo = try c.decodeIfPresent(String.self, forKey: .leagueLogo)
        fixture = try SpFixture(from: decoder)
    }
}

nonisolated struct SpWorldLiveResponse: Decodable {
    let configured: Bool
    let matches: [SpWorldLiveItem]
}

// خبر رياضي من صحافة سبق (/api/v1/articles?section=sports). المفاتيح snake_case.
nonisolated struct SpArticle: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let subtitle: String?
    let excerpt: String?
    let imageUrl: String?
    let articleUrl: String?
    let slug: String?
    let publishedAt: String?
    let readingMinutes: Int?
    let author: String?
    let isBreaking: Bool?
    let isFeatured: Bool?

    enum CodingKeys: String, CodingKey {
        case id, title, subtitle, excerpt, slug, author
        case imageUrl = "image_url"
        case articleUrl = "article_url"
        case publishedAt = "published_at"
        case readingMinutes = "reading_minutes"
        case isBreaking = "is_breaking"
        case isFeatured = "is_featured"
    }
}

nonisolated struct SpArticlesResponse: Decodable {
    let articles: [SpArticle]
    let total: Int?
    let hasMore: Bool?
}

nonisolated struct SpMatchesResponse: Decodable {
    let configured: Bool
    let live: [SpFixture]
    let today: [SpFixture]
    let upcoming: [SpFixture]
    let results: [SpFixture]
}

nonisolated struct SpRound: Decodable, Identifiable, Hashable {
    let key: String
    let label: String
    var id: String { key }
    var displayLabel: String { Self.localize(label) }

    private static func localize(_ raw: String) -> String {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = value.lowercased()
        if lower.range(of: #"^1st\s+qualifying\s+round"#, options: .regularExpression) != nil {
            return L("الدور التأهيلي الأول")
        }
        if lower.range(of: #"^2nd\s+qualifying\s+round"#, options: .regularExpression) != nil {
            return L("الدور التأهيلي الثاني")
        }
        if lower.range(of: #"^3rd\s+qualifying\s+round"#, options: .regularExpression) != nil {
            return L("الدور التأهيلي الثالث")
        }
        if lower.contains("play-off") || lower.contains("playoff") {
            return L("الملحق")
        }
        if let match = value.range(of: #"^(League Stage|League Phase)\s*-\s*(\d+)"#, options: [.regularExpression, .caseInsensitive]) {
            let text = String(value[match])
            let number = text.components(separatedBy: CharacterSet.decimalDigits.inverted).filter { !$0.isEmpty }.last ?? ""
            return number.isEmpty ? L("مرحلة الدوري") : Lf("الجولة %@ — مرحلة الدوري", number)
        }
        if let match = value.range(of: #"^Group Stage\s*-\s*(\d+)"#, options: [.regularExpression, .caseInsensitive]) {
            let text = String(value[match])
            let number = text.components(separatedBy: CharacterSet.decimalDigits.inverted).filter { !$0.isEmpty }.last ?? ""
            return number.isEmpty ? L("دور المجموعات") : Lf("الجولة %@ — دور المجموعات", number)
        }
        if let match = value.range(of: #"^Round of\s*(\d+)"#, options: [.regularExpression, .caseInsensitive]) {
            let text = String(value[match])
            let number = text.components(separatedBy: CharacterSet.decimalDigits.inverted).filter { !$0.isEmpty }.last ?? ""
            return number.isEmpty ? value : Lf("دور الـ%@", number)
        }
        return value
    }
}

nonisolated struct SpRoundsResponse: Decodable {
    let configured: Bool
    let rounds: [SpRound]
    let current: String?
}

nonisolated struct SpRoundFixturesResponse: Decodable {
    let configured: Bool
    let fixtures: [SpFixture]
}

nonisolated struct SpLeagueInsightsResponse: Decodable {
    let configured: Bool
    let generatedAt: Double?
    let competition: SpLeagueInsightCompetition?
    let summary: SpLeagueInsightSummary?
    let featured: SpLeagueFeaturedInsight?
    let signals: [SpLeagueSignal]
    let providers: [SpLeagueProvider]
}

nonisolated struct SpLeagueInsightCompetition: Decodable, Hashable {
    let slug: String
    let name: String
}

nonisolated struct SpLeagueInsightSummary: Decodable {
    let title: String?
    let subtitle: String?
    let leader: SpStandingRow?
    let runnerUp: SpStandingRow?
    let gap: Int?
    let bestAttack: SpStandingRow?
    let bestDefense: SpStandingRow?
    let mostWins: SpStandingRow?
    let topScorer: SpScorer?
    let topAssist: SpScorer?
}

nonisolated struct SpLeagueFeaturedInsight: Decodable {
    let fixture: SpFixture
}

nonisolated struct SpLeagueSignal: Decodable, Identifiable, Hashable {
    let key: String
    let label: String
    let title: String
    let value: String
    let subtitle: String?
    let logo: String?
    let teamId: Int?
    let playerId: Int?
    var id: String { key }
}

nonisolated struct SpLeagueProvider: Decodable, Identifiable, Hashable {
    let key: String
    let label: String
    let available: Bool
    let summary: String?
    var id: String { key }
}

nonisolated struct SpStandingsResponse: Decodable {
    let configured: Bool
    let standings: [SpStandingRow]
}

nonisolated struct SpScorersResponse: Decodable {
    let configured: Bool
    let scorers: [SpScorer]
}

// صنّاع الأهداف — SplAssister على الخادم يطابق SpScorer (rank/id/name/photo/team/goals/assists/matches).
nonisolated struct SpAssistsResponse: Decodable {
    let configured: Bool
    let assists: [SpScorer]
}

// مركز الانتقالات (مستوى الدوري) — أبرز الصفقات بمبلغ معلن من كامل السجل.
nonisolated struct SpTransferClub: Decodable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct SpTransferPlayer: Decodable, Hashable {
    let id: Int
    let name: String
}

nonisolated struct SpLeagueTransfer: Decodable, Identifiable, Hashable {
    let id: String
    let date: String
    let type: String      // المبلغ/النوع كما يُعرض (مُعرَّب)
    let kind: String      // permanent | loan | free | …
    let player: SpTransferPlayer
    let from: SpTransferClub
    let to: SpTransferClub
    let inClubId: Int?
    let outClubId: Int?
}

nonisolated struct SpLeagueTransfersResponse: Decodable {
    let configured: Bool
    let topDeals: [SpLeagueTransfer]?
    let transfers: [SpLeagueTransfer]?
}

// ملخّص ذكي للمباراة — نصّ عربي مُولَّد (AI) عبر /match/:id/story.
nonisolated struct SpMatchStory: Decodable {
    let text: String
    let generatedAt: Double?
    let live: Bool?
}

// تقييمات اللاعبين — أفضل لاعب + تقييمات XI عبر /match/:id/players.
nonisolated struct SpMotm: Decodable, Hashable {
    let id: Int
    let name: String
    let team: String
    let rating: Double
}

nonisolated struct SpRatedPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let photo: String
    let teamId: Int
    let team: String
    let number: Int?
    let pos: String?
    let rating: Double?
    let minutes: Int?
    let goals: Int?
    let assists: Int?
    let yellow: Int?
    let red: Int?
    let captain: Bool?
}

nonisolated struct SpMatchPlayers: Decodable {
    let motm: SpMotm?
    let players: [SpRatedPlayer]
}

// المواجهات المباشرة — السجلّ + آخر اللقاءات عبر /h2h.
nonisolated struct SpH2HTeam: Decodable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct SpH2HSummary: Decodable, Hashable {
    let total: Int
    let homeWins: Int
    let draws: Int
    let awayWins: Int
}

nonisolated struct SpH2HMeeting: Decodable, Identifiable, Hashable {
    let id: Int
    let timestamp: Int
    let date: String
    let competition: String
    let home: SpH2HTeam
    let away: SpH2HTeam
    let goals: SpScore
}

nonisolated struct SpH2HResponse: Decodable {
    let configured: Bool
    let summary: SpH2HSummary?
    let meetings: [SpH2HMeeting]
}

// نظرة الموسم — جاهزية ما قبل الموسم/العطلة: بطل الموسم المنتهي + عدّ تنازلي
// للموسم القادم + مباريات الافتتاح. تملأ الرئيسية بمحتوى سعودي خارج المواسم.
nonisolated struct SpOutlookChampion: Decodable, Hashable {
    let id: Int
    let name: String
    let logo: String
}

nonisolated struct SpOutlook: Decodable {
    let phase: String            // in-season | pre-season | off-season | unknown
    let season: Int
    let champion: SpOutlookChampion?
    let nextSeason: Int?
    let nextSeasonStart: String?
    let firstKickoff: Int?       // ms — للعدّ التنازلي
    let daysUntilKickoff: Int?
    let openers: [SpFixture]
}

nonisolated struct SpOutlookResponse: Decodable {
    let configured: Bool
    let outlook: SpOutlook?
}

// MARK: - تفاصيل المباراة (مركز المباراة) — مطابق SplMatchDetail

// قيمة إحصائية قد تصل رقمًا (12) أو نصًّا ("55%") أو null. نخزّن النص للعرض
// والرقم (إن وُجد) لشريط المقارنة.
nonisolated struct SpStatValue: Decodable, Hashable {
    let text: String
    let number: Double?

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let i = try? c.decode(Int.self) {
            text = "\(i)"; number = Double(i)
        } else if let d = try? c.decode(Double.self) {
            text = String(format: "%g", d); number = d
        } else if let s = try? c.decode(String.self) {
            text = s
            let digits = s.prefix { $0.isNumber || $0 == "." }
            number = Double(digits)
        } else {
            text = "—"; number = nil
        }
    }
}

nonisolated struct SpMatchEvent: Decodable, Identifiable, Hashable {
    let minute: Int?
    let extra: Int?
    let teamId: Int
    let team: String
    let player: String
    let assist: String?
    let type: String     // goal | card | subst | var | ...
    let label: String
    var id: String { "\(minute ?? 0)-\(extra ?? 0)-\(teamId)-\(player)-\(type)-\(label)" }
}

nonisolated struct SpStatRow: Decodable, Identifiable, Hashable {
    let type: String
    let label: String
    let home: SpStatValue?
    let away: SpStatValue?
    var id: String { type }
}

nonisolated struct SpLineupPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let number: Int?
    let name: String
    let pos: String
    let grid: String?
}

nonisolated struct SpLineup: Decodable, Hashable {
    let team: SpTeam
    let formation: String?
    let coach: String?
    let startXI: [SpLineupPlayer]
    let substitutes: [SpLineupPlayer]
}

// التشكيلة المتوقعة قبل المباراة (SportMonks عبر خادم سبق) — تُعرض حتى صدور الرسمية
nonisolated struct SpExpectedPlayer: Decodable, Hashable {
    let name: String
    let jersey: Int?
    let slot: Int?
    let grid: String?
    let row: Int?
}

nonisolated struct SpExpectedSide: Decodable, Hashable {
    let formation: String?
    let starters: [SpExpectedPlayer]
    let bench: [SpExpectedPlayer]
}

nonisolated struct SpExpectedLineups: Decodable, Hashable {
    let available: Bool
    let home: SpExpectedSide?
    let away: SpExpectedSide?
}

nonisolated struct SpMatchStatistics: Decodable, Hashable {
    let home: SpStatSide
    let away: SpStatSide
    let rows: [SpStatRow]
}

nonisolated struct SpStatSide: Decodable, Hashable {
    let id: Int
    let name: String
}

nonisolated struct SpMatchDetail: Decodable {
    let fixture: SpFixture
    let events: [SpMatchEvent]
    let statistics: SpMatchStatistics?
    let lineups: [SpLineup]
    let leagueId: Int?
}

nonisolated struct SpMatchLiteResponse: Decodable {
    let fixture: SpFixture
}

// MARK: - المصادقة (عضو سبق عبر Bearer — /api/v1/auth/apple)

/// مفتاح ترميز ديناميكي للقراءة المرنة من JSON.
nonisolated struct SpFlexKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init(_ s: String) { stringValue = s }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
}

nonisolated struct SpMember: Decodable, Hashable {
    let id: String
    let name: String?       // الاسم الكامل (firstName + lastName، أو name/fullName)
    let firstName: String?
    let lastName: String?
    let email: String?
    let phone: String?      // phone / phoneNumber من /members/profile
    let avatar: String?     // profileImageUrl
    let isProfileComplete: Bool?
    /// هل للحساب كلمة مرور؟ يقرّر هل نطلبها عند حذف الحساب (Apple/الجوال بلا كلمة
    /// مرور). يأتي من /members/profile؛ nil قبل تحميل الملف.
    let hasPassword: Bool?

    /// بريد اصطناعي لحسابات الجوال — لا يُعرض للمستخدم.
    var isSyntheticEmail: Bool {
        guard let email, !email.isEmpty else { return false }
        return email.lowercased().hasSuffix("@phone.sabq.org")
    }

    /// بريد حقيقي للعرض؛ nil إن كان اصطناعيًا أو فارغًا.
    var displayEmail: String? {
        guard let email, !email.isEmpty, !isSyntheticEmail else { return nil }
        return email
    }

    /// هل الاسم قابل للتعديل؟ (write-once على الخادم).
    var canEditName: Bool {
        let n = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return n.isEmpty
    }

    init(
        id: String,
        name: String?,
        email: String?,
        avatar: String?,
        hasPassword: Bool? = nil,
        firstName: String? = nil,
        lastName: String? = nil,
        phone: String? = nil,
        isProfileComplete: Bool? = nil
    ) {
        self.id = id
        self.name = name
        self.firstName = firstName
        self.lastName = lastName
        self.email = email
        self.phone = phone
        self.avatar = avatar
        self.isProfileComplete = isProfileComplete
        self.hasPassword = hasPassword
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: SpFlexKey.self)
        if let s = try? c.decode(String.self, forKey: SpFlexKey("id")) { id = s }
        else if let i = try? c.decode(Int.self, forKey: SpFlexKey("id")) { id = String(i) }
        else { id = "" }

        // الاسم الثنائي: firstName + lastName أولًا، ثم name/fullName.
        let first = (try? c.decode(String.self, forKey: SpFlexKey("firstName"))) ?? ""
        let last = (try? c.decode(String.self, forKey: SpFlexKey("lastName"))) ?? ""
        firstName = first.isEmpty ? nil : first
        lastName = last.isEmpty ? nil : last
        let combined = [first, last].filter { !$0.isEmpty }.joined(separator: " ")
        if !combined.isEmpty {
            name = combined
        } else {
            name = (try? c.decode(String.self, forKey: SpFlexKey("name")))
                ?? (try? c.decode(String.self, forKey: SpFlexKey("fullName")))
        }
        email = try? c.decode(String.self, forKey: SpFlexKey("email"))
        let rawPhone = (try? c.decode(String.self, forKey: SpFlexKey("phone")))
            ?? (try? c.decode(String.self, forKey: SpFlexKey("phoneNumber")))
        phone = (rawPhone?.isEmpty == false) ? rawPhone : nil
        isProfileComplete = try? c.decode(Bool.self, forKey: SpFlexKey("isProfileComplete"))
        let rawAvatar = (try? c.decode(String.self, forKey: SpFlexKey("profileImageUrl")))
            ?? (try? c.decode(String.self, forKey: SpFlexKey("profile_image_url")))
            ?? (try? c.decode(String.self, forKey: SpFlexKey("avatar")))
            ?? (try? c.decode(String.self, forKey: SpFlexKey("avatarUrl")))
        // روابط الصور قد تكون نسبية → نحوّلها لمطلقة على sabq.org.
        if let r = rawAvatar, !r.isEmpty {
            avatar = URLConstants.absolutize(r)
        } else {
            avatar = nil
        }
        hasPassword = try? c.decode(Bool.self, forKey: SpFlexKey("hasPassword"))
    }
}

/// طلب تحديث الملف الشخصي — يُرسل فقط الحقول غير الفارغة.
nonisolated struct SpProfileUpdateRequest: Encodable {
    var firstName: String?
    var lastName: String?
    var name: String?
    var email: String?
}

nonisolated struct SpAvatarUploadBody: Encodable {
    let image: String
}

nonisolated struct SpLoginResponse: Decodable {
    let token: String?
    let member: SpMember?
    let message: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: SpFlexKey.self)
        token = (try? c.decode(String.self, forKey: SpFlexKey("token")))
            ?? (try? c.decode(String.self, forKey: SpFlexKey("access_token")))
        member = (try? c.decode(SpMember.self, forKey: SpFlexKey("user")))
            ?? (try? c.decode(SpMember.self, forKey: SpFlexKey("member")))
            ?? (try? c.decode(SpMember.self, forKey: SpFlexKey("data")))
        message = try? c.decode(String.self, forKey: SpFlexKey("message"))
    }
}

/// استجابة /members/profile — العضو مغلَّف بـuser (أو member/data/مباشر).
nonisolated struct SpProfileResponse: Decodable {
    let member: SpMember?
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: SpFlexKey.self)
        member = (try? c.decode(SpMember.self, forKey: SpFlexKey("user")))
            ?? (try? c.decode(SpMember.self, forKey: SpFlexKey("member")))
            ?? (try? c.decode(SpMember.self, forKey: SpFlexKey("data")))
            ?? (try? SpMember(from: decoder))
    }
}

nonisolated struct SpDeviceInfo: Encodable {
    let platform: String
    let osVersion: String
    let appVersion: String
    let deviceName: String?
    let deviceId: String?
}

nonisolated struct SpAppleAuthRequest: Encodable {
    let identityToken: String
    let fullName: AppleFullName?
    let email: String?
    let deviceInfo: SpDeviceInfo?
    struct AppleFullName: Encodable { let firstName: String?; let lastName: String? }
}

/// دخول بحساب سبق — البريد أو الجوال + كلمة المرور (nil يُحذف من JSON تلقائيًّا).
nonisolated struct SpLoginRequest: Encodable {
    let email: String?
    let phone: String?
    let password: String
    let deviceInfo: SpDeviceInfo?
}

// دخول/تسجيل بالجوال (Twilio Verify)
nonisolated struct SpPhoneSendRequest: Encodable {
    let phone: String
}
nonisolated struct SpPhoneSendResponse: Decodable {
    let success: Bool
    let message: String?
}
nonisolated struct SpPhoneVerifyRequest: Encodable {
    let phone: String
    let code: String
    let deviceInfo: SpDeviceInfo?
}

// MARK: - المتابعة + تفضيلات التنبيهات (تتطلّب جلسة)

nonisolated struct SpFollow: Decodable, Identifiable, Hashable {
    let id: String
    let kind: String       // team | competition
    let refId: String
    let refName: String
    let refLogo: String?
    var key: String { "\(kind):\(refId)" }
}

nonisolated struct SpFollowsResponse: Decodable {
    let success: Bool?
    let follows: [SpFollow]
}

nonisolated struct SpFollowBody: Encodable {
    let kind: String
    let refId: String
    let refName: String
    let refLogo: String?
}

nonisolated struct SpAlertPrefs: Decodable, Hashable {
    var kickoff: Bool
    var goals: Bool
    var cards: Bool
    var varReview: Bool
    var fulltime: Bool
    // تنبيهات الانتقالات (بثّ عام): السعودية مفعّلة افتراضيًّا (opt-out)، والعالمية مطفأة (opt-in).
    var transfersSaudi: Bool
    var transfersGlobal: Bool
    var smartSnaps: Bool

    init(kickoff: Bool = true, goals: Bool = true, cards: Bool = true, varReview: Bool = true, fulltime: Bool = true,
         transfersSaudi: Bool = true, transfersGlobal: Bool = false, smartSnaps: Bool = true) {
        self.kickoff = kickoff; self.goals = goals; self.cards = cards; self.varReview = varReview; self.fulltime = fulltime
        self.transfersSaudi = transfersSaudi; self.transfersGlobal = transfersGlobal
        self.smartSnaps = smartSnaps
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: SpFlexKey.self)
        func b(_ k: String, _ def: Bool = true) -> Bool { (try? c.decode(Bool.self, forKey: SpFlexKey(k))) ?? def }
        kickoff = b("kickoff"); goals = b("goals"); cards = b("cards"); varReview = b("varReview"); fulltime = b("fulltime")
        transfersSaudi = b("transfersSaudi", true); transfersGlobal = b("transfersGlobal", false)
        smartSnaps = b("smartSnaps", true)
    }
}

nonisolated struct SpAlertPrefsResponse: Decodable {
    let success: Bool?
    let preferences: SpAlertPrefs
}

nonisolated struct SpAlertPrefsBody: Encodable {
    let kickoff: Bool
    let goals: Bool
    let cards: Bool
    let varReview: Bool
    let fulltime: Bool
    let transfersSaudi: Bool
    let transfersGlobal: Bool
    let smartSnaps: Bool
}

// MARK: - لقطات VARA الذكية

nonisolated struct SpSnap: Decodable, Identifiable, Hashable {
    let id: String
    let kind: String
    let icon: String
    let headline: String
    let body: String
    let accent: String
    let fixtureId: Int?
    let teamId: Int?
    let competitionSlug: String?
    let kickoff: String?
    let deeplink: String
    let generatedAt: String?
    let ttlAt: String?
}

nonisolated struct SpSnapsResponse: Decodable {
    let success: Bool?
    let configured: Bool?
    let snaps: [SpSnap]
}

nonisolated struct SpEngagementBody: Encodable {
    let kind: String
    let fixtureId: Int
    let homeId: Int
    let awayId: Int
    let competitionSlug: String?
}

// MARK: - المجتمع — لوحة المتصدّرين (عامّة)

nonisolated struct SpLeaderboardEntry: Decodable, Identifiable, Hashable {
    let userId: String
    let name: String
    let avatar: String?
    let totalPoints: Int
    let predictions: Int
    let exact: Int
    let correct: Int
    let rank: Int
    var id: String { userId }
}

nonisolated struct SpLeaderboardResponse: Decodable {
    let period: String?
    let leaderboard: [SpLeaderboardEntry]
}

// توقّع المستخدم لمباراة (المجتمع) — مطابق صفّ sports_predictions (camelCase).
nonisolated struct SpPrediction: Decodable, Hashable {
    let fixtureId: Int
    let homeName: String
    let awayName: String
    let homeLogo: String?
    let awayLogo: String?
    let predHome: Int
    let predAway: Int
    let actualHome: Int?
    let actualAway: Int?
    let points: Int?
    let kickoffTs: Int?
    let competitionSlug: String?
}

nonisolated struct SpPredictionResponse: Decodable {
    let success: Bool?
    let prediction: SpPrediction?
}

nonisolated struct SpUserStats: Decodable, Hashable {
    let totalPoints: Int
    let predictions: Int
    let exact: Int
    let correct: Int
}

nonisolated struct SpMyPredictionsResponse: Decodable {
    let success: Bool?
    let predictions: [SpPrediction]
    let stats: SpUserStats?
}

nonisolated struct SpPredictBody: Encodable {
    let predHome: Int
    let predAway: Int
    let kickoffTs: Int
    let competitionSlug: String?
    let homeId: Int?
    let awayId: Int?
    let homeName: String
    let awayName: String
    let homeLogo: String?
    let awayLogo: String?
}

/// تسجيل رمز جهاز APNs — /api/v1/devices/register (userId من الجسم، tokenProvider=apns).
nonisolated struct SpDeviceRegisterBody: Encodable {
    let deviceToken: String
    let platform: String
    let tokenProvider: String
    let userId: String
    let language: String
    let appVersion: String?
    let osVersion: String?
    let timezone: String?
    /// معرّف الحزمة (apns-topic). يميّز تطبيق الرياضة عن الأخبار على نفس خادم APNs.
    let bundleId: String?
}

/// إلغاء تسجيل رمز جهاز APNs — /api/v1/devices/unregister (عند تسجيل الخروج).
nonisolated struct SpDeviceUnregisterBody: Encodable {
    let deviceToken: String
}

/// تسجيل توكن Live Activity — /api/v1/live-activity/register.
nonisolated struct SpLiveActivityRegisterBody: Encodable {
    let fixtureId: Int
    let token: String
    let bundleId: String?
}

/// إلغاء توكن Live Activity — /api/v1/live-activity/end.
nonisolated struct SpLiveActivityEndBody: Encodable {
    let token: String
}

// MARK: - إثراء المباراة (SportMonks) — xG/الزخم/الضغط/الوقائع

nonisolated struct SpXgSide: Decodable, Hashable { let xg: Double; let xgot: Double }
nonisolated struct SpXgPlayer: Decodable, Hashable {
    let name: String
    let location: String   // home | away
    let xg: Double
}
nonisolated struct SpXg: Decodable {
    let available: Bool
    let home: SpXgSide
    let away: SpXgSide
    let topPlayers: [SpXgPlayer]
}

nonisolated struct SpPossession: Decodable, Hashable { let home: Int; let away: Int }

/// نقطة تدفّق (زخم/ضغط) — net موجب = أفضلية المضيف، سالب = الضيف.
nonisolated struct SpFlowPoint: Decodable, Hashable {
    let label: String
    let minute: Int
    let home: Double
    let away: Double
    let net: Double
}

nonisolated struct SpMomentum: Decodable {
    let available: Bool
    let live: Bool
    let possession: SpPossession?
    let points: [SpFlowPoint]
}

nonisolated struct SpPressureLatest: Decodable { let side: String; let value: Double }
nonisolated struct SpPressure: Decodable {
    let available: Bool
    let live: Bool
    let latest: SpPressureLatest?
    let points: [SpFlowPoint]
}

nonisolated struct SpFactStat: Decodable, Hashable {
    let key: String
    let label: String
    let home: String
    let away: String
}
nonisolated struct SpWeather: Decodable {
    let temp: Int?
    let description: String?
    let icon: String?
    let humidity: String?
}
nonisolated struct SpAbsentee: Decodable, Hashable {
    let name: String
    let location: String
    let reason: String
}
nonisolated struct SpHalftime: Decodable { let home: Int?; let away: Int? }
nonisolated struct SpMatchFacts: Decodable {
    let available: Bool
    let statistics: [SpFactStat]
    let weather: SpWeather?
    let absentees: [SpAbsentee]
    let halftime: SpHalftime?
}

// التعليق اللحظي (أبرز اللحظات) — /sports/match/:id/commentary.
// الخادم يرسل textAr + textEn؛ نعرض حسب لغة الواجهة.
nonisolated struct SpCommentaryItem: Decodable, Identifiable, Hashable {
    let minute: Int
    let extraMinute: Int?
    let goal: Bool
    let important: Bool
    let textAr: String
    let textEn: String
    let order: Int
    var id: String { "\(order)-\(minute)-\(extraMinute ?? 0)" }

    /// النص المعروض حسب لغة الواجهة النشطة.
    var displayText: String {
        if spActiveLangCode == "en" {
            let en = textEn.trimmingCharacters(in: .whitespacesAndNewlines)
            if !en.isEmpty { return en }
        }
        return textAr
    }

    enum CodingKeys: String, CodingKey { case minute, extraMinute, goal, important, textAr, textEn, order }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        minute = (try? c.decode(Int.self, forKey: .minute)) ?? 0
        extraMinute = try? c.decodeIfPresent(Int.self, forKey: .extraMinute)
        goal = (try? c.decode(Bool.self, forKey: .goal)) ?? false
        important = (try? c.decode(Bool.self, forKey: .important)) ?? false
        textAr = (try? c.decode(String.self, forKey: .textAr)) ?? ""
        textEn = (try? c.decode(String.self, forKey: .textEn)) ?? ""
        order = (try? c.decode(Int.self, forKey: .order)) ?? 0
    }
}
nonisolated struct SpCommentary: Decodable {
    let available: Bool
    let live: Bool
    let items: [SpCommentaryItem]
}

// MARK: - صفحة النادي (مطابق SplTeamProfile) — نداء واحد ?with=stats

nonisolated struct SpVenueInfo: Decodable, Hashable {
    let name: String
    let city: String
    let capacity: Int?
    let image: String?
}

nonisolated struct SpTeamInfo: Decodable, Hashable {
    let id: Int
    let name: String
    let logo: String
    let country: String?
    let founded: Int?
    let venue: SpVenueInfo?
}

nonisolated struct SpSquadPlayer: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
    let number: Int?
    let position: String
    let positionEn: String
    let age: Int?
    let photo: String
}

nonisolated struct SpStatTriple: Decodable, Hashable {
    let total: Int
    let home: Int
    let away: Int
}

nonisolated struct SpTeamStatFixtures: Decodable, Hashable {
    let played: SpStatTriple
    let wins: SpStatTriple
    let draws: SpStatTriple
    let loses: SpStatTriple
}

nonisolated struct SpGoalSide: Decodable, Hashable {
    let total: Int
    let average: String?
}

nonisolated struct SpTeamStatGoals: Decodable, Hashable {
    let `for`: SpGoalSide
    let against: SpGoalSide
}

nonisolated struct SpTeamCards: Decodable, Hashable {
    let yellowTotal: Int
    let redTotal: Int
}

nonisolated struct SpTeamStatSummary: Decodable, Hashable {
    let cleanSheets: SpStatTriple
    let failedToScore: SpStatTriple
    let cards: SpTeamCards
    let mostUsedFormation: String?
}

nonisolated struct SpTeamStatBiggest: Decodable, Hashable {
    let winsHome: String?
    let winsAway: String?
    let losesHome: String?
    let losesAway: String?
    let streakWin: Int?
    let streakLose: Int?
    let streakDraw: Int?
}

nonisolated struct SpTeamStats: Decodable, Hashable {
    let leagueId: Int?
    let season: Int?
    let fixtures: SpTeamStatFixtures
    let goals: SpTeamStatGoals
    let summary: SpTeamStatSummary
    let biggest: SpTeamStatBiggest?
}

// إصابات النادي (TheSports) — /team/:id/injuries.
nonisolated struct SpTeamInjury: Decodable, Identifiable, Hashable {
    let player: String
    let reason: String?
    let until: String?
    var id: String { player + (until ?? "") }
}
nonisolated struct SpTeamInjuriesResponse: Decodable {
    let injuries: [SpTeamInjury]
}

// انتقالات النادي — /team/:id/transfers (واصلون/مغادرون).
nonisolated struct SpTeamTransferItem: Decodable, Identifiable, Hashable {
    let date: String
    let type: String
    let playerId: Int
    let player: String
    let teamId: Int
    let team: String
    let teamLogo: String
    var id: String { "\(playerId)-\(date)-\(teamId)" }
}
nonisolated struct SpTeamTransfersResponse: Decodable {
    let arrivals: [SpTeamTransferItem]
    let departures: [SpTeamTransferItem]
}

nonisolated struct SpCoachCareer: Decodable, Hashable {
    let team: String
    let start: String?
    let end: String?
}

nonisolated struct SpCoach: Decodable, Hashable {
    let id: Int
    let name: String
    let photo: String
    let nationality: String
    let age: Int?
    let startDate: String?
    let career: [SpCoachCareer]
}

nonisolated struct SpTeamScorer: Decodable, Identifiable, Hashable {
    let rank: Int
    let id: Int
    let name: String
    let photo: String
    let goals: Int
    let assists: Int
    let penalties: Int
    let matches: Int
}

nonisolated struct SpTeamProfile: Decodable {
    let team: SpTeamInfo
    let standing: SpStandingRow?
    let competitionSlug: String?
    let competitionName: String?
    let fixtures: [SpFixture]
    let squad: [SpSquadPlayer]
    let stats: SpTeamStats?
    let coach: SpCoach?
    let topScorers: [SpTeamScorer]
}

// MARK: - بطاقة اللاعب (مطابق SplPlayerCard)

nonisolated struct SpPlayerSeasonStats: Decodable, Hashable {
    let competition: String
    let team: SpTeam
    let matches: Int
    let lineups: Int
    let minutes: Int
    let rating: Double?
    let goals: Int
    let assists: Int
    let yellow: Int
    let red: Int
    let saves: Int
    let conceded: Int
}

nonisolated struct SpPlayerCareerStop: Decodable, Identifiable, Hashable {
    let teamId: Int
    let team: String
    let logo: String
    let seasons: [Int]
    var id: Int { teamId }
}

nonisolated struct SpPlayerTrophy: Decodable, Hashable {
    let competition: String
    let country: String
    let season: String
    let place: String
    let winner: Bool
}

// سجل المواسم (?with=extras) — موسم بموسم.
nonisolated struct SpPlayerHistory: Decodable, Identifiable, Hashable {
    let season: Int
    let competition: String
    let matches: Int
    let goals: Int
    let assists: Int
    var id: String { "\(season)-\(competition)" }
}

nonisolated struct SpPlayerCard: Decodable {
    let id: Int
    let name: String
    let fullName: String?
    let photo: String
    let position: String
    let number: Int?
    let age: Int?
    let birthDate: String?
    let birthPlace: String?
    let nationality: String?
    let height: Int?
    let weight: Int?
    let seasonStats: [SpPlayerSeasonStats]
    let career: [SpPlayerCareerStop]
    let trophies: [SpPlayerTrophy]
    let history: [SpPlayerHistory]?   // مع ?with=extras
}

// فورمة اللاعب — آخر المباريات (/player/:id/form).
nonisolated struct SpFormMatch: Decodable, Identifiable, Hashable {
    let date: String
    let opponent: String
    let opponentLogo: String?
    let homeAway: String?
    let result: String        // W | D | L
    let scoreFor: Int?
    let scoreAgainst: Int?
    let xg: Double?
    let goals: Int?
    let rating: Double?
    let league: String?
    var id: String { date + opponent }
}
nonisolated struct SpPlayerForm: Decodable {
    let available: Bool
    let matches: [SpFormMatch]
}

// القيمة السوقية (TheSports) — /player/:id/market.
nonisolated struct SpPlayerMarket: Decodable {
    let available: Bool
    let value: Double?
    let currency: String?
    let peak: Double?
}

// MARK: - ثوابت

nonisolated enum SportsConstants {
    /// دوري روشن — البطولة الافتراضية والأبرز.
    static let defaultComp = "pro-league"
    static let worldCupComp = "world-cup"

    /// ترتيب عرض فئات البطولات (السعودية أولًا).
    static let categoryOrder = ["saudi", "gulf", "arab", "european", "world"]

    /// شرائح البطولات السعودية (category == "saudi") — لحصر الرئيسية/المباشر على
    /// الكرة السعودية. نقاط /sports/today و /sports/live تُرجِع كل بطولاتنا (خليجي/
    /// عربي/أوروبي/عالمي) لا السعودية فقط، فنُرشّح عليها هنا. ثابتة ومعروفة؛ حدّثها
    /// إذا أضاف الخادم بطولة سعودية جديدة.
    static let saudiSlugs: Set<String> = [
        "pro-league", "division-1", "division-2", "kings-cup", "super-cup", "womens-league",
    ]

    /// هل المباراة ضمن بطولة سعودية؟ (عبر competitionSlug من لوحة اليوم/المباشر).
    static func isSaudi(_ slug: String?) -> Bool {
        guard let slug else { return false }
        return saudiSlugs.contains(slug)
    }

    /// معرّفات الأندية/المنتخب السعودية (api-sports) — لإبراز مبارياتها حتى في
    /// البطولات القارية (دوري أبطال آسيا/كأس العالم للأندية) لا السعودية فقط.
    /// مأخوذة من SPL_TEAM_AR في الخادم (روشن + السيدات) + المنتخب الأول (23).
    static let saudiTeamIds: Set<Int> = [
        23, // المنتخب السعودي
        // دوري روشن للرجال
        2928, 2929, 2931, 2932, 2933, 2934, 2936, 2938, 2939, 2940,
        2944, 2945, 2956, 2977, 2992, 10509, 10511, 10513,
        // الدوري الممتاز للسيدات
        24884, 27712, 27713, 27714, 27715, 27716, 27717, 27718,
    ]

    /// هل هذه المباراة «سعودية» للرئيسية/المباشر؟ بطولة سعودية، أو نادٍ/منتخب
    /// سعودي يلعب في بطولة قارية (الهلال/النصر/الأهلي/الاتحاد في دوري الأبطال…).
    static func isSaudiFixture(_ f: SpFixture) -> Bool {
        isSaudi(f.competitionSlug)
            || saudiTeamIds.contains(f.home.id)
            || saudiTeamIds.contains(f.away.id)
    }

    /// رتبة الفئة للترتيب (السعودية أولًا) — للوحات المجمّعة حسب البطولة.
    static func categoryRank(_ category: String) -> Int {
        categoryOrder.firstIndex(of: category) ?? categoryOrder.count
    }

    static func categoryLabel(_ category: String) -> String {
        switch category {
        case "saudi": return L("البطولات السعودية")
        case "gulf": return L("البطولات الخليجية")
        case "arab": return L("البطولات العربية")
        case "european": return L("البطولات الأوروبية")
        case "world": return L("بطولات عالمية")
        default: return L("بطولات")
        }
    }
}

// MARK: - تنسيق التواريخ بالعربية (بتوقيت الرياض)

enum SpDateMath {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoNoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func date(from s: String) -> Date? {
        iso.date(from: s) ?? isoNoFrac.date(from: s)
    }
}

enum SpFormat {
    private static let riyadh = TimeZone(identifier: "Asia/Riyadh")!

    // تقويم الرياض الميلادي (للمقارنات isDateInToday/...) — يطابق إعدادات
    // formatters أعلاه: أسماء عربية + أرقام لاتينية + ميلادي + توقيت الرياض.
    private static let riyadhCal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = riyadh
        c.locale = Locale(identifier: "ar-u-nu-latn")
        return c
    }()

    private static var formatters: [String: DateFormatter] = [:]

    // لغة عرض التواريخ — يحدّثها SpLanguage عند التبديل. المفاتيح الآلية
    // (dateKey/numericDate) تتجاهلها وتبقى en_US_POSIX. القيمة بسيطة وتُكتب من
    // MainActor فقط وتُقرأ أثناء التنسيق — nonisolated(unsafe) كافٍ هنا.
    nonisolated(unsafe) static var displayLangCode: String = "ar"

    // العربية: أسماء عربية + أرقام لاتينية + ميلادي (نتجنّب ar-SA الهجري).
    // الإنجليزية: أسماء إنجليزية (Saturday / 27 July).
    private static var displayLocale: Locale {
        displayLangCode == "en" ? Locale(identifier: "en_US") : Locale(identifier: "ar-u-nu-latn")
    }

    private static func makeFormatter(_ pattern: String, locale: Locale) -> DateFormatter {
        let f = DateFormatter()
        f.timeZone = riyadh
        f.locale = locale
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = pattern
        return f
    }

    /// مُنسِّق عرض واعٍ باللغة — الكاش مُفتَّح بالنمط + رمز اللغة.
    private static func fmt(_ pattern: String) -> DateFormatter {
        let key = "\(pattern)|\(displayLangCode)"
        if let f = formatters[key] { return f }
        let f = makeFormatter(pattern, locale: displayLocale)
        formatters[key] = f
        return f
    }

    /// «اليوم/غدًا/أمس» أو Today/Tomorrow/Yesterday حسب لغة العرض.
    private static func relDayWord(_ kind: RelDay) -> String {
        let en = displayLangCode == "en"
        switch kind {
        case .today:     return en ? "Today" : "اليوم"
        case .tomorrow:  return en ? "Tomorrow" : "غدًا"
        case .yesterday: return en ? "Yesterday" : "أمس"
        }
    }
    private enum RelDay { case today, tomorrow, yesterday }

    static func kickoffDay(_ iso: String?) -> String {
        guard let iso, let d = SpDateMath.date(from: iso) else { return "" }
        return fmt("EEEE d MMMM").string(from: d)
    }

    static func kickoffTime(_ iso: String?) -> String {
        guard let iso, let d = SpDateMath.date(from: iso) else { return "" }
        return fmt("HH:mm").string(from: d)
    }

    /// تاريخ قصير «15 مايو» — لشريط معلومة النتيجة المنتهية.
    static func dayMonth(_ iso: String?) -> String {
        guard let iso, let d = SpDateMath.date(from: iso) else { return "" }
        return fmt("d MMMM").string(from: d)
    }

    /// اسم اليوم «السبت» — لشريط اختيار اليوم.
    static func weekdayName(_ date: Date) -> String { fmt("EEEE").string(from: date) }

    /// «27 يونيو» (أرقام لاتينية) — لشريط اختيار اليوم.
    static func dayMonthLabel(_ date: Date) -> String { fmt("d MMMM").string(from: date) }

    /// مفتاح التاريخ YYYY-MM-DD بتوقيت الرياض — لاستعلام /sports/today?date=.
    static func dateKey(_ date: Date) -> String {
        let key = "posix:yyyy-MM-dd"
        if let f = formatters[key] { return f.string(from: date) }
        let f = makeFormatter("yyyy-MM-dd", locale: Locale(identifier: "en_US_POSIX"))
        formatters[key] = f
        return f.string(from: date)
    }

    /// تاريخ رقمي «2026/07/04» بتوقيت الرياض (أرقام لاتينية) — لفواصل التجميع
    /// في تبويب «مبارياتي». يعتمد نفس تقنية dateKey: en_US_POSIX + cache منفصل.
    static func numericDate(_ date: Date) -> String {
        let key = "posix:yyyy/MM/dd"
        if let f = formatters[key] { return f.string(from: date) }
        let f = makeFormatter("yyyy/MM/dd", locale: Locale(identifier: "en_US_POSIX"))
        formatters[key] = f
        return f.string(from: date)
    }

    /// فاصل اليوم لتبويب «مبارياتي»: «اليوم · 2026/07/04» (أو غدًا/أمس)، وإلا
    /// الرقم فقط «2026/07/04». المقارنات بتقويم الرياض فلا تتأثّر بتوقيت الجهاز.
    static func daySeparator(_ date: Date) -> String {
        let cal = Self.riyadhCal
        let numeric = numericDate(date)
        if cal.isDateInToday(date) { return "\(relDayWord(.today)) · \(numeric)" }
        if cal.isDateInTomorrow(date) { return "\(relDayWord(.tomorrow)) · \(numeric)" }
        if cal.isDateInYesterday(date) { return "\(relDayWord(.yesterday)) · \(numeric)" }
        return numeric
    }

    /// وقت نسبي («قبل ٣ ساعات» / “3 hours ago”) حسب لغة العرض — لبطاقات الأخبار.
    static func relativeArabic(_ iso: String?) -> String {
        guard let iso, let d = SpDateMath.date(from: iso) else { return "" }
        let f = RelativeDateTimeFormatter()
        f.locale = displayLocale
        f.unitsStyle = .full
        return f.localizedString(for: d, relativeTo: Date())
    }
}

// MARK: - نقاط الشبكة (كلها عامة عبر publicAPI — بلا مصادقة في v1)

extension APIClient {
    func fetchCompetitions(status: String? = nil, ignoreCache: Bool = false) async throws -> SpCompetitionsResponse {
        var query: [String: String] = [:]
        if let status { query["status"] = status }
        return try await get(SpCompetitionsResponse.self, path: "/sports/competitions",
                             query: query, ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchToday(date: String? = nil, ignoreCache: Bool = false) async throws -> SpTodayResponse {
        var query: [String: String] = [:]
        if let date { query["date"] = date }
        return try await get(SpTodayResponse.self, path: "/sports/today",
                             query: query, ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchLive(ignoreCache: Bool = false) async throws -> SpLiveResponse {
        try await get(SpLiveResponse.self, path: "/sports/live",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// البث المباشر العالمي — كل مباريات العالم القائمة الآن (لتبويب «المباشر»).
    func fetchWorldLive(ignoreCache: Bool = false) async throws -> SpWorldLiveResponse {
        try await get(SpWorldLiveResponse.self, path: "/sports/world-live",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchMatches(comp: String, ignoreCache: Bool = false) async throws -> SpMatchesResponse {
        try await get(SpMatchesResponse.self, path: "/sports/\(comp)/matches",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchRounds(comp: String, ignoreCache: Bool = false) async throws -> SpRoundsResponse {
        try await get(SpRoundsResponse.self, path: "/sports/\(comp)/rounds",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchRoundFixtures(comp: String, round: String, ignoreCache: Bool = false) async throws -> SpRoundFixturesResponse {
        try await get(SpRoundFixturesResponse.self, path: "/sports/\(comp)/round",
                      query: ["name": round], ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchLeagueInsights(comp: String, ignoreCache: Bool = false) async throws -> SpLeagueInsightsResponse {
        try await get(SpLeagueInsightsResponse.self, path: "/sports/\(comp)/insights",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchStandings(comp: String, ignoreCache: Bool = false) async throws -> SpStandingsResponse {
        try await get(SpStandingsResponse.self, path: "/sports/\(comp)/standings",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchScorers(comp: String, ignoreCache: Bool = false) async throws -> SpScorersResponse {
        try await get(SpScorersResponse.self, path: "/sports/\(comp)/scorers",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchAssists(comp: String, ignoreCache: Bool = false) async throws -> SpAssistsResponse {
        try await get(SpAssistsResponse.self, path: "/sports/\(comp)/assists",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchLeagueTransfers(since: Int = 18, ignoreCache: Bool = false) async throws -> SpLeagueTransfersResponse {
        try await get(SpLeagueTransfersResponse.self, path: "/sports/transfers",
                      query: ["since": String(since)], ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchOutlook(comp: String, ignoreCache: Bool = false) async throws -> SpOutlookResponse {
        try await get(SpOutlookResponse.self, path: "/sports/\(comp)/outlook",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchMatchDetail(id: Int, ignoreCache: Bool = false) async throws -> SpMatchDetail {
        try await get(SpMatchDetail.self, path: "/sports/match/\(id)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// لقطة خفيفة (نتيجة/حالة فقط) — لتحديث «مبارياتي» بلا detail كامل.
    func fetchMatchLite(id: Int, ignoreCache: Bool = false) async throws -> SpFixture {
        try await get(SpMatchLiteResponse.self, path: "/sports/match/\(id)/lite",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).fixture
    }

    /// تحديث لقطة مباراة متابَعة من مصدرها الصحيح؛ «مبارياتي» قد تجمع روشن،
    /// البطولات العالمية، وكأس العالم في مكان واحد.
    func fetchFollowedFixture(_ fixture: SpFixture, ignoreCache: Bool = false) async throws -> SpFixture {
        if fixture.competitionSlug == "world-cup" {
            let detail = try await fetchWorldCupMatch(id: fixture.id, ignoreCache: ignoreCache)
            return SpFixture(worldCup: detail.fixture)
        }
        // نفضّل المسار الخفيف — يكفي للنتيجة/الدقيقة دون events/stats/lineups.
        if let lite = try? await fetchMatchLite(id: fixture.id, ignoreCache: ignoreCache) {
            return lite.preservingCompetition(from: fixture)
        }
        return try await fetchMatchDetail(id: fixture.id, ignoreCache: ignoreCache).fixture
            .preservingCompetition(from: fixture)
    }

    // إثراء مركز المباراة: ملخّص ذكي + تقييمات اللاعبين + المواجهات.
    func fetchStory(matchId: Int, ignoreCache: Bool = false) async throws -> SpMatchStory {
        try await get(SpMatchStory.self, path: "/sports/match/\(matchId)/story", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchMatchPlayers(matchId: Int, ignoreCache: Bool = false) async throws -> SpMatchPlayers {
        try await get(SpMatchPlayers.self, path: "/sports/match/\(matchId)/players", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchH2H(home: Int, away: Int, ignoreCache: Bool = false) async throws -> SpH2HResponse {
        try await get(SpH2HResponse.self, path: "/sports/h2h",
                      query: ["home": String(home), "away": String(away)], ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    // إثراء المباراة (SportMonks) — أفضل جهد، يُخفى تبويب التحليل إن لم يتوفّر.
    func fetchXg(matchId: Int, ignoreCache: Bool = false) async throws -> SpXg {
        try await get(SpXg.self, path: "/sports/match/\(matchId)/xg", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchMomentum(matchId: Int, ignoreCache: Bool = false) async throws -> SpMomentum {
        try await get(SpMomentum.self, path: "/sports/match/\(matchId)/momentum", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchPressure(matchId: Int, ignoreCache: Bool = false) async throws -> SpPressure {
        try await get(SpPressure.self, path: "/sports/match/\(matchId)/pressure", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchMatchFacts(matchId: Int, ignoreCache: Bool = false) async throws -> SpMatchFacts {
        try await get(SpMatchFacts.self, path: "/sports/match/\(matchId)/facts", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchCommentary(matchId: Int, ignoreCache: Bool = false) async throws -> SpCommentary {
        try await get(SpCommentary.self, path: "/sports/match/\(matchId)/commentary", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchExpectedLineup(matchId: Int, ignoreCache: Bool = false) async throws -> SpExpectedLineups {
        try await get(SpExpectedLineups.self, path: "/sports/match/\(matchId)/expected-lineup", ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// لوحة المتصدّرين (عامّة) — period: all | month | week.
    func fetchLeaderboard(period: String = "all", ignoreCache: Bool = false) async throws -> [SpLeaderboardEntry] {
        try await get(SpLeaderboardResponse.self, path: "/sports/leaderboard",
                      query: ["period": period], ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).leaderboard
    }

    // توقّعات المباريات (جلسة عضو، عبر mobileAPI).
    func fetchMyPrediction(matchId: Int) async throws -> SpPrediction? {
        try await get(SpPredictionResponse.self, path: "/sports/match/\(matchId)/predict",
                      ignoreCache: true, apiRoot: URLConstants.mobileAPI).prediction
    }
    func submitPrediction(_ body: SpPredictBody, matchId: Int) async throws -> SpPrediction? {
        try await post(SpPredictionResponse.self, path: "/sports/match/\(matchId)/predict",
                       body: body, apiRoot: URLConstants.mobileAPI).prediction
    }
    func fetchMyPredictions() async throws -> SpMyPredictionsResponse {
        try await get(SpMyPredictionsResponse.self, path: "/sports/predictions/me",
                      ignoreCache: true, apiRoot: URLConstants.mobileAPI)
    }

    /// تسجيل رمز جهاز APNs ليصله بثّ التنبيهات (يلزم userId لربط الجهاز بالعضو).
    func registerDevice(deviceToken: String, userId: String) async throws {
        let info = APIClient.deviceInfo()
        let body = SpDeviceRegisterBody(
            deviceToken: deviceToken, platform: "ios", tokenProvider: "apns",
            userId: userId, language: "ar", appVersion: info.appVersion,
            osVersion: info.osVersion, timezone: TimeZone.current.identifier,
            bundleId: Bundle.main.bundleIdentifier
        )
        let data = try JSONEncoder().encode(body)
        try await send(method: "POST", path: "/devices/register", jsonBody: data, apiRoot: URLConstants.mobileAPI)
    }

    /// إلغاء ربط رمز الجهاز (عند تسجيل الخروج) كي لا تصل تنبيهات العضو السابق للجهاز.
    /// النقطة لا تتطلّب جلسة — تعمل بعد مسح التوكن أيضًا.
    func unregisterDevice(deviceToken: String) async throws {
        let body = SpDeviceUnregisterBody(deviceToken: deviceToken)
        let data = try JSONEncoder().encode(body)
        try await send(method: "DELETE", path: "/devices/unregister", jsonBody: data, apiRoot: URLConstants.mobileAPI)
    }

    /// تسجيل توكن Live Activity (نشاط شاشة القفل) ليدفع الخادم تحديثات النتيجة
    /// عبر APNs حتى والتطبيق مغلق. عامّة (تعمل للزوّار؛ الخادم يربط userId إن وُجد).
    func registerLiveActivity(fixtureId: Int, pushToken: String) async throws {
        let body = SpLiveActivityRegisterBody(
            fixtureId: fixtureId, token: pushToken,
            bundleId: Bundle.main.bundleIdentifier)
        let data = try JSONEncoder().encode(body)
        try await send(method: "POST", path: "/live-activity/register",
                       jsonBody: data, apiRoot: URLConstants.mobileAPI)
    }

    /// إلغاء توكن نشاط مباشر (عند إيقاف المستخدم للمتابعة) كي يتوقّف الدفع.
    func endLiveActivity(pushToken: String) async throws {
        let body = SpLiveActivityEndBody(token: pushToken)
        let data = try JSONEncoder().encode(body)
        try await send(method: "POST", path: "/live-activity/end",
                       jsonBody: data, apiRoot: URLConstants.mobileAPI)
    }

    /// تحديث ملف العضو (صورة/اسم) من /members/profile.
    func fetchMemberProfile(ignoreCache: Bool = true) async throws -> SpMember? {
        try await get(SpProfileResponse.self, path: "/members/profile", ignoreCache: ignoreCache, apiRoot: URLConstants.mobileAPI).member
    }

    /// تحديث الاسم/البريد عبر PUT /members/profile (Bearer).
    @discardableResult
    func updateMemberProfile(_ body: SpProfileUpdateRequest) async throws -> SpMember? {
        try await requestJSON(
            SpProfileResponse.self,
            method: "PUT",
            path: "/members/profile",
            body: body,
            apiRoot: URLConstants.mobileAPI
        ).member
    }

    /// رفع صورة شخصية (base64 data-URI) — تُحفظ في Cloudflare وتظهر على الويب وVARA معًا.
    @discardableResult
    func uploadMemberAvatar(imageData: Data) async throws -> SpMember? {
        let mime = Self.detectImageMimeType(imageData) ?? "image/jpeg"
        let body = SpAvatarUploadBody(image: "data:\(mime);base64,\(imageData.base64EncodedString())")
        return try await post(
            SpProfileResponse.self,
            path: "/members/profile/image",
            body: body,
            apiRoot: URLConstants.mobileAPI
        ).member
    }

    private static func detectImageMimeType(_ data: Data) -> String? {
        guard data.count >= 12 else { return nil }
        let b = [UInt8](data.prefix(12))
        if b[0] == 0xFF, b[1] == 0xD8 { return "image/jpeg" }
        if b[0] == 0x89, b[1] == 0x50, b[2] == 0x4E, b[3] == 0x47 { return "image/png" }
        if b[0] == 0x52, b[1] == 0x49, b[2] == 0x46, b[3] == 0x46,
           b[8] == 0x57, b[9] == 0x45, b[10] == 0x42, b[11] == 0x50 { return "image/webp" }
        if b[0] == 0x47, b[1] == 0x49, b[2] == 0x46 { return "image/gif" }
        return nil
    }

    // المتابعة + التفضيلات (Bearer، عبر mobileAPI).
    func fetchFollows(ignoreCache: Bool = true) async throws -> [SpFollow] {
        try await get(SpFollowsResponse.self, path: "/sports/follows", ignoreCache: ignoreCache, apiRoot: URLConstants.mobileAPI).follows
    }
    func addFollow(kind: String, refId: String, refName: String, refLogo: String?) async throws {
        let data = try JSONEncoder().encode(SpFollowBody(kind: kind, refId: refId, refName: refName, refLogo: refLogo))
        try await send(method: "POST", path: "/sports/follows", jsonBody: data, apiRoot: URLConstants.mobileAPI)
    }
    func removeFollow(kind: String, refId: String) async throws {
        try await send(method: "DELETE", path: "/sports/follows", query: ["kind": kind, "refId": refId], apiRoot: URLConstants.mobileAPI)
    }
    func fetchAlertPrefs(ignoreCache: Bool = true) async throws -> SpAlertPrefs {
        try await get(SpAlertPrefsResponse.self, path: "/sports/alert-prefs", ignoreCache: ignoreCache, apiRoot: URLConstants.mobileAPI).preferences
    }
    @discardableResult
    func updateAlertPrefs(_ p: SpAlertPrefs) async throws -> SpAlertPrefs {
        let body = SpAlertPrefsBody(kickoff: p.kickoff, goals: p.goals, cards: p.cards, varReview: p.varReview, fulltime: p.fulltime,
                                    transfersSaudi: p.transfersSaudi, transfersGlobal: p.transfersGlobal, smartSnaps: p.smartSnaps)
        return try await requestJSON(SpAlertPrefsResponse.self, method: "PUT", path: "/sports/alert-prefs", body: body, apiRoot: URLConstants.mobileAPI).preferences
    }

    func fetchTeamSnaps(teamId: Int, ignoreCache: Bool = false) async throws -> [SpSnap] {
        try await get(SpSnapsResponse.self, path: "/sports/snaps/team/\(teamId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI).snaps
    }

    func fetchMySnaps(ignoreCache: Bool = true) async throws -> [SpSnap] {
        try await get(SpSnapsResponse.self, path: "/sports/snaps",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.mobileAPI).snaps
    }

    func recordMatchView(_ fixture: SpFixture) async throws {
        let body = SpEngagementBody(
            kind: "match_view",
            fixtureId: fixture.id,
            homeId: fixture.home.id,
            awayId: fixture.away.id,
            competitionSlug: fixture.competitionSlug
        )
        try await send(method: "POST", path: "/sports/engagement",
                       jsonBody: JSONEncoder().encode(body), apiRoot: URLConstants.mobileAPI)
    }

    /// دخول بحساب سبق بالبريد/الجوال + كلمة المرور. يكتشف البريد بوجود «@».
    func loginWithIdentifier(_ identifier: String, password: String) async throws -> SpLoginResponse {
        let trimmed = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        let isEmail = trimmed.contains("@")
        let body = SpLoginRequest(
            email: isEmail ? trimmed.lowercased() : nil,
            phone: isEmail ? nil : trimmed,
            password: password,
            deviceInfo: APIClient.deviceInfo()
        )
        return try await post(SpLoginResponse.self, path: "/auth/login", body: body, apiRoot: URLConstants.mobileAPI)
    }

    /// تبديل هوية Apple بجلسة عضو سبق (Bearer). نقطة /api/v1/auth/apple معفاة CSRF.
    func loginWithApple(identityToken: String, firstName: String?, lastName: String?, email: String?) async throws -> SpLoginResponse {
        let fullName: SpAppleAuthRequest.AppleFullName? =
            (firstName != nil || lastName != nil) ? .init(firstName: firstName, lastName: lastName) : nil
        let body = SpAppleAuthRequest(identityToken: identityToken, fullName: fullName, email: email, deviceInfo: APIClient.deviceInfo())
        return try await post(SpLoginResponse.self, path: "/auth/apple", body: body, apiRoot: URLConstants.mobileAPI)
    }

    /// إرسال رمز تحقّق للجوال (Twilio Verify). الرقم بأي صيغة سعودية — الخادم يطبّعه.
    func sendPhoneCode(_ phone: String) async throws -> SpPhoneSendResponse {
        let body = SpPhoneSendRequest(phone: phone)
        return try await post(SpPhoneSendResponse.self, path: "/auth/phone/send", body: body, apiRoot: URLConstants.mobileAPI)
    }

    /// التحقّق من الرمز → جلسة عضو سبق (يُنشئ الحساب إن لم يكن موجودًا).
    func verifyPhoneCode(_ phone: String, code: String) async throws -> SpLoginResponse {
        let body = SpPhoneVerifyRequest(phone: phone, code: code, deviceInfo: APIClient.deviceInfo())
        return try await post(SpLoginResponse.self, path: "/auth/phone/verify", body: body, apiRoot: URLConstants.mobileAPI)
    }

    /// أخبار سبق الرياضية (تصنيف «رياضة») — عبر mobileAPI، عامّة بلا مصادقة.
    func fetchSportsNews(limit: Int = 14, offset: Int = 0, ignoreCache: Bool = false) async throws -> SpArticlesResponse {
        try await get(SpArticlesResponse.self, path: "/articles",
                      query: ["section": "sports", "limit": "\(limit)", "offset": "\(offset)"],
                      ignoreCache: ignoreCache, apiRoot: URLConstants.mobileAPI)
    }

    /// صفحة النادي المتكاملة (هوية+ترتيب+مباريات+تشكيلة+إحصاءات+مدرب+هدّافون).
    func fetchTeamProfile(id: Int, withStats: Bool = true, ignoreCache: Bool = false) async throws -> SpTeamProfile {
        try await get(SpTeamProfile.self, path: "/sports/team/\(id)",
                      query: withStats ? ["with": "stats"] : [:],
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// بطاقة اللاعب (هوية + أرقام الموسم + المسيرة + الألقاب + سجل المواسم via extras).
    func fetchPlayerCard(id: Int, ignoreCache: Bool = false) async throws -> SpPlayerCard {
        try await get(SpPlayerCard.self, path: "/sports/player/\(id)",
                      query: ["with": "extras"], ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    // إثراء النادي (المرحلة 3): إصابات + انتقالات.
    func fetchTeamInjuries(id: Int, comp: String?, ignoreCache: Bool = false) async throws -> SpTeamInjuriesResponse {
        var q: [String: String] = [:]
        if let comp { q["comp"] = comp }
        return try await get(SpTeamInjuriesResponse.self, path: "/sports/team/\(id)/injuries",
                             query: q, ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchTeamTransfers(id: Int, ignoreCache: Bool = false) async throws -> SpTeamTransfersResponse {
        try await get(SpTeamTransfersResponse.self, path: "/sports/team/\(id)/transfers",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    // إثراء اللاعب (المرحلة 4): فورمة + قيمة سوقية.
    func fetchPlayerForm(id: Int, ignoreCache: Bool = false) async throws -> SpPlayerForm {
        try await get(SpPlayerForm.self, path: "/sports/player/\(id)/form",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
    func fetchPlayerMarket(id: Int, ignoreCache: Bool = false) async throws -> SpPlayerMarket {
        try await get(SpPlayerMarket.self, path: "/sports/player/\(id)/market",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
}
