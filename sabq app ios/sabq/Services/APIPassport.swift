import Foundation

// Mirror of server `PassportResponse` (server/services/articlePassportService.ts).
// Staff-only fields (prompts, audit details) come back nil for public viewers —
// that's expected, not an error. Only the subset we render today is decoded;
// `aiImageGenerations`, `seoHistoryLatest`, `timeline` are deferred to Phase 2.

nonisolated struct APIPassport: Decodable, Sendable {
    let language: String
    let viewer: Viewer
    let article: ArticleInfo
    let source: Source
    let people: People
    let publisher: Publisher?
    let aiFootprint: AIFootprint
    let trustBadge: TrustBadge
    let aiImageGenerations: [AIImageGeneration]
    let seoHistoryLatest: SEOHistoryEntry?
    let timeline: [TimelineEvent]

    struct Viewer: Decodable, Sendable {
        let isStaff: Bool
    }

    struct ArticleInfo: Decodable, Sendable {
        let id: String
        let title: String
        let subtitle: String?
        let slug: String
        let publishedAt: String?
        let category: Category?
        let credibilityScore: Double?
        let verifiedAt: String?
        let isPublisherNews: Bool
        let canonicalUrl: String?

        struct Category: Decodable, Sendable {
            let id: String
            let name: String
            let slug: String
        }
    }

    struct Source: Decodable, Sendable {
        /// `"manual" | "email" | "whatsapp" | "publisher" | "external"`
        let channel: String
        let rawSource: String?
        let sourceUrl: String?
    }

    struct Person: Decodable, Sendable, Identifiable {
        let id: String
        let firstName: String?
        let lastName: String?
        let firstNameEn: String?
        let lastNameEn: String?
        let profileImageUrl: String?
        let role: String?

        var displayName: String {
            let ar = [firstName, lastName]
                .compactMap { $0?.isEmpty == false ? $0 : nil }
                .joined(separator: " ")
            if !ar.isEmpty { return ar }
            return [firstNameEn, lastNameEn]
                .compactMap { $0?.isEmpty == false ? $0 : nil }
                .joined(separator: " ")
        }
    }

    struct People: Decodable, Sendable {
        let author: Person?
        let submitter: Person?
        let reporter: Person?
        let reviewer: Person?
        let verifier: Person?
        let publisherApprover: Person?
    }

    struct Publisher: Decodable, Sendable {
        let id: String
        let agencyName: String
        let agencyNameEn: String?
        let logoUrl: String?
    }

    struct AIFootprint: Decodable, Sendable {
        let body: Body
        let cover: Cover
        let seo: SEO
        let percentages: Percentages
        let explanation: Explanation

        struct Body: Decodable, Sendable {
            /// `"human" | "assisted" | "ai_drafted"`
            let tier: String
            let aiGenerated: Bool
            let hasSummary: Bool
            let hasBullets: Bool
            let aiEditCount: Int
        }

        struct Cover: Decodable, Sendable {
            let isAiGenerated: Bool
            let model: String?
            /// Staff-only — nil for public viewers
            let prompt: String?
        }

        struct SEO: Decodable, Sendable {
            let status: String?
            let version: Int?
            let provider: String?
            let model: String?
            let generatedBy: String?
            let manualOverride: Bool?
        }

        /// 0 / 50 / 100 per surface; `total` is the weighted average.
        struct Percentages: Decodable, Sendable {
            let body: Int
            let cover: Int
            let seo: Int
            let total: Int
        }

        struct Explanation: Decodable, Sendable {
            let ar: String
            let en: String
            let ur: String
        }
    }

    struct TrustBadge: Decodable, Sendable {
        /// `"human_edited" | "ai_assisted" | "ai_drafted_human_reviewed"`
        let tier: String
        let label: Label
        let credibilityScore: Double?

        struct Label: Decodable, Sendable {
            let ar: String
            let en: String
            let ur: String
        }
    }

    struct AIImageGeneration: Decodable, Sendable, Identifiable {
        let id: String
        /// Staff-only — nil for public viewers
        let prompt: String?
        let model: String
        let imageUrl: String?
        let thumbnailUrl: String?
        let aspectRatio: String?
        let enableSearchGrounding: Bool?
        let createdAt: String
    }

    struct SEOHistoryEntry: Decodable, Sendable {
        let id: String
        let version: Int
        let provider: String
        let model: String
        let status: String?
        let manualOverride: Bool?
        let generatedBy: String?
        let generatedByName: String?
        let createdAt: String
    }

    struct TimelineEvent: Decodable, Sendable, Identifiable {
        let id: String
        /// e.g. "created" / "submitted" / "approved" / "published" / "updated" / "verified" / "unpublish"
        let eventType: String
        let summary: String?
        let createdAt: String
        let actor: Person?
        /// `"article_events" | "audit_log" | "synthetic"`
        let source: String
        /// Sensitive change details — populated only for staff viewers.
        let details: [String: JSONValue]?
    }
}

/// Minimal Codable-friendly JSON enum used to decode the staff-only
/// `timeline.details` field whose shape varies per event type.
nonisolated enum JSONValue: Decodable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let v = try? c.decode(Bool.self) { self = .bool(v); return }
        if let v = try? c.decode(Double.self) { self = .number(v); return }
        if let v = try? c.decode(String.self) { self = .string(v); return }
        if let v = try? c.decode([JSONValue].self) { self = .array(v); return }
        if let v = try? c.decode([String: JSONValue].self) { self = .object(v); return }
        throw DecodingError.dataCorruptedError(
            in: c,
            debugDescription: "Unsupported JSON value"
        )
    }

    /// Single-line readable representation used inside the staff-only timeline disclosure.
    var displayString: String {
        switch self {
        case .string(let s): return s
        case .number(let n):
            if n.rounded() == n { return String(Int(n)) }
            return String(n)
        case .bool(let b): return b ? "true" : "false"
        case .null: return "—"
        case .array(let arr): return "[" + arr.map(\.displayString).joined(separator: ", ") + "]"
        case .object(let obj):
            let pairs = obj.map { "\($0): \($1.displayString)" }.sorted()
            return "{" + pairs.joined(separator: ", ") + "}"
        }
    }
}
