import Foundation

// MARK: - نماذج قسم «مُقترب»
//
// مُقترب = زوايا تحليلية (Angles) يملكها كتّاب أفراد، وينشرون فيها مواضيع
// (Topics) بعد مراجعة الإدارة. التطبيق (القارئ) يستهلك المسارات العامة
// `/api/muqtarab/*` مباشرةً عبر `URLConstants.publicAPI` — نفس نمط كأس
// العالم و«عمق»، بلا مصادقة. لوحة الكاتب (my-angle) تحتاج مسارات
// `/api/v1` بـ Bearer وتُبنى لاحقًا — خارج نطاق هذه المرحلة.

/// زاوية تحليلية. يُستخدم في قائمة الزوايا وترويسة صفحة الزاوية.
nonisolated struct MuqAngle: Decodable, Hashable, Identifiable {
    let id: String
    let nameAr: String
    let nameEn: String?
    let slug: String
    let colorHex: String?
    let iconKey: String?
    let coverImageUrl: String?
    let shortDesc: String?
    let writerSignature: String?
    let sortOrder: Int?
    let isActive: Bool?
    // حقول الإحصاء (عند withStats=true)
    let topicCount: Int?
    let writerName: String?
    let writerAvatar: String?
}

/// زاوية مصغّرة مرفقة بالموضوع في خلاصات الواجهة. تتعامل مع شكلَي الخادم:
/// `topics/featured` يرسل `nameAr`/`iconKey`، و`latest-topics` يرسل
/// `name`/`icon` — نوحّدهما هنا.
nonisolated struct MuqTopicAngle: Decodable, Hashable {
    let id: String?
    let name: String?
    let slug: String?
    let colorHex: String?
    let icon: String?

    enum CodingKeys: String, CodingKey {
        case id, slug, colorHex, nameAr, name, iconKey, icon
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id)
        slug = try c.decodeIfPresent(String.self, forKey: .slug)
        colorHex = try c.decodeIfPresent(String.self, forKey: .colorHex)
        name = try c.decodeIfPresent(String.self, forKey: .nameAr)
            ?? c.decodeIfPresent(String.self, forKey: .name)
        icon = try c.decodeIfPresent(String.self, forKey: .iconKey)
            ?? c.decodeIfPresent(String.self, forKey: .icon)
    }
}

nonisolated struct MuqTopicContent: Decodable, Hashable {
    let rawHtml: String?
    let plainText: String?
}

nonisolated struct MuqSeoMeta: Decodable, Hashable {
    let keywords: [String]?
}

/// موضوع منشور داخل زاوية.
nonisolated struct MuqTopic: Decodable, Hashable, Identifiable {
    let id: String
    let angleId: String?
    let title: String
    let slug: String
    let excerpt: String?
    let content: MuqTopicContent?
    let heroImageUrl: String?
    let seoMeta: MuqSeoMeta?
    let publishedAt: String?
    let viewCount: Int?
    /// مرفقة في خلاصات الواجهة (`featured`/`latest-topics`) لا في قائمة
    /// مواضيع الزاوية.
    let angle: MuqTopicAngle?
    /// كاتب الزاوية (اسم + صورة) — يصل في خلاصات الرئيسية بعد توسعة
    /// الخادم 2026-08؛ اختياري حتى يبقى التطبيق متوافقًا مع خوادم أقدم.
    let writer: MuqWriter?

    /// أفضل HTML متاح للعرض (المحرّر يخزّن `content.rawHtml`).
    var html: String { content?.rawHtml ?? "" }
    /// نص احتياطي عند غياب HTML.
    var fallbackText: String { content?.plainText ?? excerpt ?? "" }
}

nonisolated struct MuqWriter: Decodable, Hashable {
    let id: String?
    let name: String?
    let avatar: String?
    let slug: String?
    let bio: String?
}

// MARK: - أغلفة الاستجابة

nonisolated struct MuqTopicsResponse: Decodable {
    let topics: [MuqTopic]
}

nonisolated struct MuqTopicDetailResponse: Decodable {
    let topic: MuqTopic
    let angle: MuqAngle
    let writer: MuqWriter?
}

/// `GET /api/muqtarab/angles/:slug` — حقول الزاوية في المستوى الأعلى + الكاتب.
nonisolated struct MuqAngleDetail: Decodable {
    let angle: MuqAngle
    let writer: MuqWriter?

    enum CodingKeys: String, CodingKey { case writer }

    init(from decoder: Decoder) throws {
        angle = try MuqAngle(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        writer = try c.decodeIfPresent(MuqWriter.self, forKey: .writer)
    }
}

// MARK: - صفحة الكاتب (`GET /api/muqtarab/writers/:id`)

nonisolated struct MuqWriterInfo: Decodable, Hashable {
    let id: String
    let name: String
    let avatar: String?
    let bio: String?
}

nonisolated struct MuqWriterAngle: Decodable, Hashable, Identifiable {
    let slug: String
    let nameAr: String
    let colorHex: String?
    let iconKey: String?
    let coverImageUrl: String?
    var id: String { slug }
}

nonisolated struct MuqWriterTopic: Decodable, Hashable, Identifiable {
    let id: String
    let title: String
    let slug: String
    let excerpt: String?
    let heroImageUrl: String?
    let publishedAt: String?
    let viewCount: Int?
    let angleSlug: String
    let angleName: String
    let colorHex: String?
}

nonisolated struct MuqWriterProfile: Decodable {
    let writer: MuqWriterInfo
    let angles: [MuqWriterAngle]
    let topics: [MuqWriterTopic]
}

// MARK: - استدعاءات API (المسارات العامة)

extension APIClient {
    /// كل الزوايا النشطة (مع إحصاء المواضيع والكاتب).
    func fetchMuqtarabAngles(withStats: Bool = true) async throws -> [MuqAngle] {
        var query = ["active": "true"]
        if withStats { query["withStats"] = "true" }
        return try await get([MuqAngle].self,
                             path: "/muqtarab/angles",
                             query: query,
                             apiRoot: URLConstants.publicAPI)
    }

    /// أحدث/مميّز المواضيع المنشورة (لشريط الرئيسية وصفحة القسم).
    func fetchMuqtarabFeaturedTopics(limit: Int = 8) async throws -> [MuqTopic] {
        try await get([MuqTopic].self,
                      path: "/muqtarab/topics/featured",
                      query: ["limit": "\(limit)"],
                      apiRoot: URLConstants.publicAPI)
    }

    /// بيانات زاوية واحدة (ترويسة + كاتب).
    func fetchMuqtarabAngleDetail(slug: String) async throws -> MuqAngleDetail {
        try await get(MuqAngleDetail.self,
                      path: "/muqtarab/angles/\(slug)",
                      apiRoot: URLConstants.publicAPI)
    }

    /// مواضيع زاوية المنشورة.
    func fetchMuqtarabAngleTopics(slug: String, limit: Int = 30) async throws -> [MuqTopic] {
        try await get(MuqTopicsResponse.self,
                      path: "/muqtarab/angles/\(slug)/topics",
                      query: ["limit": "\(limit)"],
                      apiRoot: URLConstants.publicAPI).topics
    }

    /// موضوع منشور + زاويته + الكاتب.
    func fetchMuqtarabTopic(angleSlug: String, topicSlug: String) async throws -> MuqTopicDetailResponse {
        try await get(MuqTopicDetailResponse.self,
                      path: "/muqtarab/angles/\(angleSlug)/topics/\(topicSlug)",
                      apiRoot: URLConstants.publicAPI)
    }

    /// صفحة الكاتب: نبذة + زواياه + مواضيعه المنشورة.
    func fetchMuqtarabWriter(id: String) async throws -> MuqWriterProfile {
        try await get(MuqWriterProfile.self,
                      path: "/muqtarab/writers/\(id)",
                      apiRoot: URLConstants.publicAPI)
    }

    /// تسجيل مشاهدة موضوع (best-effort، لا يرمي خطأً). مسار عام بلا مصادقة.
    func reportMuqtarabTopicView(id: String) async {
        guard let url = URL(string: "\(URLConstants.publicAPI)/muqtarab/topics/\(id)/view") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        _ = try? await URLSession.shared.data(for: request)
    }
}
