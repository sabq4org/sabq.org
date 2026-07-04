import Foundation

// نماذج «مركز الانتقالات» — تطابق DTO الخادم في transferCenterService.ts حرفيًّا
// (كلها camelCase فلا حاجة لـ CodingKeys). المصدران:
//   - إشاعات SportMonks (/api/transfer-center/rumours · story · overview)
//   - مؤكّد عالمي (/api/transfer-center/global-confirmed)
// المؤكّد السعودي يبقى على /api/sports/transfers (SpLeagueTransfer الموجود).
// كل شيء «أفضل جهد»: configured:false يُخفي الأقسام بلا عطل.

// MARK: - كيانات مشتركة

nonisolated struct TcParty: Decodable, Hashable {
    let id: Int
    let name: String
    let image: String?
    let leagueId: Int?
    let leagueName: String?
    let saudi: Bool
}

nonisolated struct TcPlayer: Decodable, Hashable {
    let id: Int
    let name: String
    let image: String?
    let position: String?
    let birthdate: String?

    /// العمر المحسوب من تاريخ الميلاد (nil عند غيابه/تعذّره).
    var age: Int? {
        guard let birthdate, !birthdate.isEmpty else { return nil }
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.locale = Locale(identifier: "en_US_POSIX")
        guard let d = fmt.date(from: String(birthdate.prefix(10))) else { return nil }
        return Calendar(identifier: .gregorian).dateComponents([.year], from: d, to: Date()).year
    }
}

nonisolated struct TcSource: Decodable, Hashable {
    let name: String
    let url: String?
    let tier: String   // high | medium | low
}

// MARK: - إشاعة

nonisolated enum TcProbability: String, Decodable {
    case low = "LOW", medium = "MEDIUM", high = "HIGH", imminent = "IMMINENT"

    /// عدد الخانات الممتلئة في مقياس الاحتمال (من 4).
    var segments: Int {
        switch self {
        case .imminent: return 4
        case .high: return 3
        case .medium: return 2
        case .low: return 1
        }
    }

    var label: String {
        switch self {
        case .imminent: return "وشيكة"
        case .high: return "قوية"
        case .medium: return "متوسطة"
        case .low: return "ضعيفة"
        }
    }
}

nonisolated enum TcRumourKind: String, Decodable {
    case transfer, loan, extensionDeal = "extension"

    var label: String {
        switch self {
        case .transfer: return "انتقال"
        case .loan: return "إعارة"
        case .extensionDeal: return "تجديد عقد"
        }
    }
    var icon: String {
        switch self {
        case .transfer: return "arrow.left.arrow.right"
        case .loan: return "arrow.2.squarepath"
        case .extensionDeal: return "signature"
        }
    }
}

nonisolated struct TcRumour: Decodable, Identifiable, Hashable {
    let id: Int
    let date: String
    let probability: TcProbability
    let kind: TcRumourKind
    let amount: Double?
    let currency: String?
    let source: TcSource
    let hereWeGo: Bool
    let player: TcPlayer
    let from: TcParty
    let to: TcParty
    let saudi: Bool
}

nonisolated struct TcRumoursResponse: Decodable {
    let configured: Bool
    let rumours: [TcRumour]?
    let leagues: [TcLeagueRef]?
}

nonisolated struct TcLeagueRef: Decodable, Identifiable, Hashable {
    let id: Int
    let name: String
}

// MARK: - مؤكّد عالمي

nonisolated enum TcConfirmedKind: String, Decodable {
    case transfer, loan, free
}

nonisolated struct TcConfirmed: Decodable, Identifiable, Hashable {
    let id: Int
    let date: String
    let kind: TcConfirmedKind
    let amount: Double?
    let currency: String?
    let player: TcPlayer
    let from: TcParty
    let to: TcParty
    let saudi: Bool
    let major: Bool
}

nonisolated struct TcGlobalConfirmedResponse: Decodable {
    let configured: Bool
    let transfers: [TcConfirmed]?
}

// MARK: - قصة انتقال

nonisolated struct TcStoryResponse: Decodable {
    let configured: Bool
    let found: Bool
    let player: TcPlayer?
    let timeline: [TcRumour]?
}

// MARK: - نظرة السوق (overview)

nonisolated struct TcWindow: Decodable, Hashable {
    let label: String
    let opensAt: String
    let closesAt: String
}

nonisolated struct TcWindows: Decodable, Hashable {
    let saudi: TcWindow
    let europe: TcWindow
}

nonisolated struct TcComparisonSide: Decodable, Hashable {
    let total: Double
    let deals: Int
}

nonisolated struct TcComparison: Decodable, Hashable {
    let basis: String   // confirmed | rumoured
    let roshn: TcComparisonSide
    let premierLeague: TcComparisonSide
}

nonisolated struct TcClubBalance: Decodable, Identifiable, Hashable {
    var id: Int { clubId }
    let clubId: Int
    let club: String
    let logo: String
    let spent: Double
    let earned: Double
}

nonisolated struct TcPulseItem: Decodable, Identifiable, Hashable {
    let type: String   // confirmed | rumour
    let playerId: Int
    let player: String
    let playerImage: String?
    let from: String
    let to: String
    let fromLogo: String?
    let toLogo: String?
    let amount: Double?
    let currency: String?
    let probability: TcProbability?
    let hereWeGo: Bool
    let date: String
    let saudi: Bool

    // مفتاح مستقر للقوائم (المعرّف قد يتكرّر بين مؤكّد/إشاعة بفضاءين مختلفين).
    var id: String { "\(type)-\(playerId)-\(date)-\(to)" }
}

nonisolated struct TcOverviewResponse: Decodable {
    let configured: Bool
    let rumoursConfigured: Bool?
    let pulse: [TcPulseItem]?
    let dealOfDay: TcPulseItem?
    let hero: [TcRumour]?
    let windows: TcWindows?
    let comparison: TcComparison?
    let clubBalance: [TcClubBalance]?
}

// MARK: - أخبار ذات صلة (بحث سبق العام /api/search)

nonisolated struct TcRelatedArticle: Decodable, Identifiable, Hashable {
    let id: String            // معرّف مقال سبق = varchar/uuid
    let title: String
    let slug: String?
    let imageUrl: String?
    let publishedAt: String?
}

nonisolated struct TcSearchResponse: Decodable {
    let results: [TcRelatedArticle]?
}

// MARK: - تنسيق الأرقام والعملة
//
// قاعدة العرض: الرقم أولًا ثم رمز العملة — «85 مليون €» لا «€ 85». في سياق RTL
// (وهو افتراضي التطبيق) يُقرأ الرقم أولًا ثم رمز العملة في نهاية العبارة، وهو
// المطلوب. لا نختلق رقمًا: أي مبلغ ناقص/صفري يرجّع nil فلا يُعرض شيء.

nonisolated enum TcMoney {
    static func symbol(_ currency: String?) -> String {
        switch (currency ?? "EUR").uppercased() {
        case "GBP": return "£"
        case "USD": return "$"
        case "SAR": return "ر.س"
        default: return "€"
        }
    }

    /// «85 مليون €» / «500 ألف €» — الرقم ثم الوحدة ثم رمز العملة.
    static func format(_ amount: Double?, currency: String?) -> String? {
        guard let n = amount, n.isFinite, n > 0 else { return nil }
        let sym = symbol(currency)
        if n >= 1_000_000 {
            let millions = n / 1_000_000
            let num = millions.truncatingRemainder(dividingBy: 1) == 0
                ? String(Int(millions))
                : String(format: "%.1f", millions)
            return "\(num) مليون \(sym)"
        }
        if n >= 1_000 {
            return "\(Int((n / 1_000).rounded())) ألف \(sym)"
        }
        return "\(Int(n)) \(sym)"
    }
}

// MARK: - تنسيق التاريخ (عربي، تقويم ميلادي، أرقام لاتينية)

nonisolated enum TcDate {
    private static let inFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()
    private static let outFmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "ar_SA@calendar=gregorian;numbers=latn")
        f.setLocalizedDateFormatFromTemplate("d MMMM yyyy")
        return f
    }()

    static func medium(_ iso: String) -> String {
        guard let d = inFmt.date(from: String(iso.prefix(10))) else { return iso }
        return outFmt.string(from: d)
    }
}

// MARK: - نداءات الشبكة

extension APIClient {
    func fetchTransferRumours(ignoreCache: Bool = false) async throws -> TcRumoursResponse {
        try await get(TcRumoursResponse.self, path: "/transfer-center/rumours",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchTransferGlobalConfirmed(ignoreCache: Bool = false) async throws -> TcGlobalConfirmedResponse {
        try await get(TcGlobalConfirmedResponse.self, path: "/transfer-center/global-confirmed",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchTransferStory(playerId: Int, ignoreCache: Bool = false) async throws -> TcStoryResponse {
        try await get(TcStoryResponse.self, path: "/transfer-center/story/\(playerId)",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    func fetchTransferOverview(ignoreCache: Bool = false) async throws -> TcOverviewResponse {
        try await get(TcOverviewResponse.self, path: "/transfer-center/overview",
                      ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }

    /// أخبار ذات صلة من أرشيف سبق العام (بحث FTS بالاسم المعرَّب).
    func fetchTransferRelated(query: String, ignoreCache: Bool = false) async throws -> TcSearchResponse {
        try await get(TcSearchResponse.self, path: "/search",
                      query: ["q": query, "limit": "6"], ignoreCache: ignoreCache, apiRoot: URLConstants.publicAPI)
    }
}
