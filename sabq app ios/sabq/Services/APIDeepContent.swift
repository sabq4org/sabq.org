import Foundation

// Codable types for the four Phase-5 surfaces: Calendar, OMQ deep analyses,
// Daily Brief, and Audio Newsletters. All decoded permissively so missing
// fields don't break the screen — Phase 5 features degrade gracefully.

// MARK: - Calendar

nonisolated struct APICalendarEvent: Decodable, Sendable, Identifiable {
    let id: String
    let title: String
    let description: String?
    /// `"GLOBAL" | "NATIONAL" | "INTERNAL"`
    let type: String?
    let dateStart: String
    let dateEnd: String?
    /// 1–5 importance scale
    let importance: Int?
    let tags: [String]?

    private enum CodingKeys: String, CodingKey {
        case id, title, description, type, dateStart, dateEnd, importance, tags
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        description = try? c.decode(String.self, forKey: .description)
        type = try? c.decode(String.self, forKey: .type)
        dateStart = (try? c.decode(String.self, forKey: .dateStart)) ?? ""
        dateEnd = try? c.decode(String.self, forKey: .dateEnd)
        importance = try? c.decode(Int.self, forKey: .importance)
        tags = try? c.decode([String].self, forKey: .tags)
    }
}

nonisolated struct APICalendarEventsResponse: Decodable, Sendable {
    let events: [APICalendarEvent]
}

// MARK: - OMQ (Deep Analyses)

nonisolated struct APIDeepAnalysis: Decodable, Sendable, Identifiable {
    let id: String
    let title: String
    let topic: String?
    let keywords: [String]?
    let status: String?
    let createdAt: String?
    let category: String?
    let categoryName: String?
    let viewsCount: Int?
    let sharesCount: Int?
    let downloadsCount: Int?
    let generationTime: Int?
    // Detail-only
    let gptAnalysis: String?
    let geminiAnalysis: String?
    let claudeAnalysis: String?
    let mergedAnalysis: String?
    let executiveSummary: String?
    let recommendations: String?
    let authorId: String?
    let authorName: String?
}

nonisolated struct APIOmqListResponse: Decodable, Sendable {
    let analyses: [APIDeepAnalysis]
    let total: Int?
    let page: Int?
    let totalPages: Int?
}

// MARK: - Daily Brief

nonisolated struct APIDailySummary: Decodable, Sendable {
    let personalizedGreeting: PersonalizedGreeting?
    let metrics: Metrics?
    let interestAnalysis: InterestAnalysis?
    let timeActivity: TimeActivity?
    let aiInsights: AIInsights?
    let generatedAt: String?

    struct PersonalizedGreeting: Decodable, Sendable {
        let userName: String?
        let articlesReadToday: Int?
        let readingTimeMinutes: Int?
        let topCategories: [String]?
        let readingMood: String?
    }

    struct Metrics: Decodable, Sendable {
        let articlesRead: Int?
        let readingTimeMinutes: Int?
        let completionRate: Int?
        let articlesBookmarked: Int?
        let articlesLiked: Int?
        let commentsPosted: Int?
        let percentChangeFromYesterday: Int?
    }

    struct InterestAnalysis: Decodable, Sendable {
        let topCategories: [CategoryCount]?
        let topicsThatCatchAttention: [String]?
        let suggestedArticles: [SuggestedArticle]?

        struct CategoryCount: Decodable, Sendable, Identifiable {
            let name: String
            let count: Int
            var id: String { name }
        }

        struct SuggestedArticle: Decodable, Sendable, Identifiable {
            let id: String
            let title: String
            let slug: String?
            let englishSlug: String?
            let categoryName: String?
        }
    }

    struct TimeActivity: Decodable, Sendable {
        let hourlyBreakdown: [HourData]?
        let peakReadingTime: Int?
        let lowActivityPeriod: Int?
        let aiSuggestion: String?

        struct HourData: Decodable, Sendable, Identifiable {
            let hour: Int
            let count: Int
            var id: Int { hour }
        }
    }

    struct AIInsights: Decodable, Sendable {
        let readingMood: String?
        let dailyGoal: String?
        let focusScore: Int?
    }
}

// MARK: - Audio Newsletters

nonisolated struct APIAudioNewsletter: Decodable, Sendable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let slug: String
    let coverImageUrl: String?
    let audioUrl: String?
    /// Duration in seconds.
    let duration: Int?
    let totalListens: Int?
    let publishedAt: String?

    private enum CodingKeys: String, CodingKey {
        case id, title, description, slug, coverImageUrl, audioUrl, duration, totalListens, publishedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        description = try? c.decode(String.self, forKey: .description)
        slug = (try? c.decode(String.self, forKey: .slug)) ?? ""
        coverImageUrl = try? c.decode(String.self, forKey: .coverImageUrl)
        audioUrl = try? c.decode(String.self, forKey: .audioUrl)
        duration = try? c.decode(Int.self, forKey: .duration)
        totalListens = try? c.decode(Int.self, forKey: .totalListens)
        publishedAt = try? c.decode(String.self, forKey: .publishedAt)
    }
}
