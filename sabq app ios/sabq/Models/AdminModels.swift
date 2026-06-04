import SwiftUI

// MARK: - Admin Dashboard models
//
// Data layer for the in-app admin dashboard. These decode the REAL backend
// payloads from `/api/v1/admin/*` (see `AdminService.swift`). No mock data —
// this is a production surface.

// MARK: Article status

/// The three editorial states the dashboard surfaces. Drives the segmented
/// control, the per-item badge, and the metric tiles.
enum AdminArticleStatus: String, CaseIterable, Codable, Identifiable, Hashable {
    case draft
    case review
    case published

    var id: String { rawValue }

    /// Plural/section label used in the segmented control.
    var label: String {
        switch self {
        case .draft:     return "المسودات"
        case .review:    return "قيد المراجعة"
        case .published: return "المنشورة"
        }
    }

    /// Singular label used on an individual item's badge.
    var badgeLabel: String {
        switch self {
        case .draft:     return "مسودة"
        case .review:    return "قيد المراجعة"
        case .published: return "منشور"
        }
    }

    var icon: String {
        switch self {
        case .draft:     return "doc.text"
        case .review:    return "clock.badge.checkmark"
        case .published: return "checkmark.seal.fill"
        }
    }

    var tint: Color {
        switch self {
        case .draft:     return SabqTheme.gold
        case .review:    return SabqTheme.sky
        case .published: return SabqTheme.teal
        }
    }
}

// MARK: News item

/// A single news row in the dashboard. Decoded from `/api/v1/admin/articles`.
/// Deliberately flat — the simplified editor edits these fields directly.
struct AdminNewsItem: Identifiable, Hashable, Decodable {
    let id: String
    var title: String
    var excerpt: String
    var body: String
    var status: AdminArticleStatus
    var author: String
    var updatedAt: Date
    var views: Int

    private enum CodingKeys: String, CodingKey {
        case id, title, excerpt, body, status, author, updatedAt, views
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = (try? c.decode(String.self, forKey: .title)) ?? ""
        excerpt = (try? c.decode(String.self, forKey: .excerpt)) ?? ""
        body = (try? c.decode(String.self, forKey: .body)) ?? ""
        status = (try? c.decode(AdminArticleStatus.self, forKey: .status)) ?? .draft
        author = (try? c.decode(String.self, forKey: .author)) ?? ""
        views = (try? c.decode(Int.self, forKey: .views)) ?? 0
        // Backend sends an ISO-8601 string; reuse the app's tolerant parser.
        let dateString = (try? c.decode(String.self, forKey: .updatedAt)) ?? ""
        updatedAt = SabqFormatters.parseISO8601(dateString) ?? Date()
    }
}

// MARK: Overview metrics

/// Top-of-dashboard KPI snapshot. Decoded from `/api/v1/admin/dashboard/stats`.
struct AdminOverview: Decodable, Hashable {
    var publishedToday: Int
    var totalViews: Int
    var pendingDrafts: Int
    var underReview: Int

    /// Maps the snapshot into the cards rendered by the horizontal metrics
    /// strip. Kept here (not in the view) so the labels/formatting live next
    /// to the data they describe.
    func metrics() -> [AdminMetric] {
        [
            AdminMetric(key: "published_today",
                        title: "منشورات اليوم",
                        value: "\(publishedToday)",
                        icon: "checkmark.seal.fill",
                        tint: SabqTheme.teal),
            AdminMetric(key: "total_views",
                        title: "إجمالي المشاهدات",
                        value: SabqFormatters.compactViewCount(totalViews),
                        icon: "eye.fill",
                        tint: SabqTheme.sky),
            AdminMetric(key: "pending_drafts",
                        title: "مسودات معلّقة",
                        value: "\(pendingDrafts)",
                        icon: "doc.text",
                        tint: SabqTheme.gold),
            AdminMetric(key: "under_review",
                        title: "قيد المراجعة",
                        value: "\(underReview)",
                        icon: "clock.badge.checkmark",
                        tint: SabqTheme.coral),
        ]
    }
}

/// View-model for a single KPI tile.
struct AdminMetric: Identifiable, Hashable {
    let key: String
    let title: String
    let value: String
    let icon: String
    let tint: Color

    var id: String { key }
}
