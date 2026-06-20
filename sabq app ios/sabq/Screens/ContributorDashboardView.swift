import SwiftUI
import Charts
import Combine

// MARK: - Models

nonisolated struct ContributorAnalytics: Decodable {
    let success: Bool
    let role: String
    let totalArticles: Int
    let publishedArticles: Int
    let draftArticles: Int
    let pendingArticles: Int
    let needsChangesArticles: Int
    let rejectedArticles: Int
    let totalViews: Int
    let totalLikes: Int
    let totalComments: Int
    let totalBookmarks: Int
    let dailyStats: [DailyStat]
    let bestArticleThisWeek: BestArticle?
    let comparison: Comparison
    let followers: FollowerData
    let topArticles: [TopArticle]
    let featuredComment: FeaturedComment?
    let publishingActivity: PublishingActivity
    let articles: [ContributorArticle]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        success = (try? c.decode(Bool.self, forKey: FlexKey("success"))) ?? true
        role = (try? c.decode(String.self, forKey: FlexKey("role"))) ?? "writer"
        totalArticles = (try? c.decode(Int.self, forKey: FlexKey("totalArticles"))) ?? (try? c.decode(Int.self, forKey: FlexKey("total_articles"))) ?? 0
        publishedArticles = (try? c.decode(Int.self, forKey: FlexKey("publishedArticles"))) ?? (try? c.decode(Int.self, forKey: FlexKey("published_articles"))) ?? 0
        draftArticles = (try? c.decode(Int.self, forKey: FlexKey("draftArticles"))) ?? (try? c.decode(Int.self, forKey: FlexKey("draft_articles"))) ?? 0
        pendingArticles = (try? c.decode(Int.self, forKey: FlexKey("pendingArticles"))) ?? (try? c.decode(Int.self, forKey: FlexKey("pending_articles"))) ?? 0
        needsChangesArticles = (try? c.decode(Int.self, forKey: FlexKey("needsChangesArticles"))) ?? (try? c.decode(Int.self, forKey: FlexKey("needs_changes_articles"))) ?? 0
        rejectedArticles = (try? c.decode(Int.self, forKey: FlexKey("rejectedArticles"))) ?? (try? c.decode(Int.self, forKey: FlexKey("rejected_articles"))) ?? 0
        totalViews = (try? c.decode(Int.self, forKey: FlexKey("totalViews"))) ?? (try? c.decode(Int.self, forKey: FlexKey("total_views"))) ?? 0
        totalLikes = (try? c.decode(Int.self, forKey: FlexKey("totalLikes"))) ?? (try? c.decode(Int.self, forKey: FlexKey("total_likes"))) ?? 0
        totalComments = (try? c.decode(Int.self, forKey: FlexKey("totalComments"))) ?? (try? c.decode(Int.self, forKey: FlexKey("total_comments"))) ?? 0
        totalBookmarks = (try? c.decode(Int.self, forKey: FlexKey("totalBookmarks"))) ?? (try? c.decode(Int.self, forKey: FlexKey("total_bookmarks"))) ?? 0
        dailyStats = (try? c.decode([DailyStat].self, forKey: FlexKey("dailyStats"))) ?? (try? c.decode([DailyStat].self, forKey: FlexKey("daily_stats"))) ?? []
        bestArticleThisWeek = (try? c.decode(BestArticle.self, forKey: FlexKey("bestArticleThisWeek"))) ?? (try? c.decode(BestArticle.self, forKey: FlexKey("best_article_this_week")))
        comparison = (try? c.decode(Comparison.self, forKey: FlexKey("comparison"))) ?? Comparison()
        followers = (try? c.decode(FollowerData.self, forKey: FlexKey("followers"))) ?? FollowerData()
        topArticles = (try? c.decode([TopArticle].self, forKey: FlexKey("topArticles"))) ?? (try? c.decode([TopArticle].self, forKey: FlexKey("top_articles"))) ?? []
        featuredComment = (try? c.decode(FeaturedComment.self, forKey: FlexKey("featuredComment"))) ?? (try? c.decode(FeaturedComment.self, forKey: FlexKey("featured_comment")))
        publishingActivity = (try? c.decode(PublishingActivity.self, forKey: FlexKey("publishingActivity"))) ?? (try? c.decode(PublishingActivity.self, forKey: FlexKey("publishing_activity"))) ?? PublishingActivity()
        articles = (try? c.decode([ContributorArticle].self, forKey: FlexKey("articles"))) ?? []
    }
}

nonisolated struct DailyStat: Decodable, Identifiable {
    var id: String { date }
    let date: String
    let views: Int
    let likes: Int
    let comments: Int

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        date = (try? c.decode(String.self, forKey: FlexKey("date"))) ?? ""
        views = (try? c.decode(Int.self, forKey: FlexKey("views"))) ?? 0
        likes = (try? c.decode(Int.self, forKey: FlexKey("likes"))) ?? 0
        comments = (try? c.decode(Int.self, forKey: FlexKey("comments"))) ?? 0
    }
}

nonisolated struct BestArticle: Decodable {
    let id: String
    let title: String
    let views: Int

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? ""
        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""
        views = (try? c.decode(Int.self, forKey: FlexKey("views"))) ?? 0
    }
}

nonisolated struct Comparison: Decodable {
    let viewsThisMonth: Int
    let viewsLastMonth: Int
    let likesThisMonth: Int
    let likesLastMonth: Int

    init() { viewsThisMonth = 0; viewsLastMonth = 0; likesThisMonth = 0; likesLastMonth = 0 }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        viewsThisMonth = (try? c.decode(Int.self, forKey: FlexKey("viewsThisMonth"))) ?? (try? c.decode(Int.self, forKey: FlexKey("views_this_month"))) ?? 0
        viewsLastMonth = (try? c.decode(Int.self, forKey: FlexKey("viewsLastMonth"))) ?? (try? c.decode(Int.self, forKey: FlexKey("views_last_month"))) ?? 0
        likesThisMonth = (try? c.decode(Int.self, forKey: FlexKey("likesThisMonth"))) ?? (try? c.decode(Int.self, forKey: FlexKey("likes_this_month"))) ?? 0
        likesLastMonth = (try? c.decode(Int.self, forKey: FlexKey("likesLastMonth"))) ?? (try? c.decode(Int.self, forKey: FlexKey("likes_last_month"))) ?? 0
    }
}

nonisolated struct FollowerData: Decodable {
    let count: Int
    let dailyGrowth: [FollowerDay]

    init() { count = 0; dailyGrowth = [] }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        count = (try? c.decode(Int.self, forKey: FlexKey("count"))) ?? 0
        dailyGrowth = (try? c.decode([FollowerDay].self, forKey: FlexKey("dailyGrowth"))) ?? (try? c.decode([FollowerDay].self, forKey: FlexKey("daily_growth"))) ?? []
    }
}

nonisolated struct FollowerDay: Decodable, Identifiable {
    var id: String { date }
    let date: String
    let count: Int

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        date = (try? c.decode(String.self, forKey: FlexKey("date"))) ?? ""
        count = (try? c.decode(Int.self, forKey: FlexKey("count"))) ?? 0
    }
}

nonisolated struct TopArticle: Decodable, Identifiable {
    let id: String
    let title: String
    let views: Int
    let likes: Int
    let comments: Int
    let bookmarks: Int

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""
        views = (try? c.decode(Int.self, forKey: FlexKey("views"))) ?? 0
        likes = (try? c.decode(Int.self, forKey: FlexKey("likes"))) ?? 0
        comments = (try? c.decode(Int.self, forKey: FlexKey("comments"))) ?? 0
        bookmarks = (try? c.decode(Int.self, forKey: FlexKey("bookmarks"))) ?? 0
    }
}

nonisolated struct FeaturedComment: Decodable {
    let content: String
    let userName: String
    let articleTitle: String
    let articleId: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        content = (try? c.decode(String.self, forKey: FlexKey("content"))) ?? ""
        userName = (try? c.decode(String.self, forKey: FlexKey("userName"))) ?? (try? c.decode(String.self, forKey: FlexKey("user_name"))) ?? "قارئ"
        articleTitle = (try? c.decode(String.self, forKey: FlexKey("articleTitle"))) ?? (try? c.decode(String.self, forKey: FlexKey("article_title"))) ?? ""
        articleId = (try? c.decode(String.self, forKey: FlexKey("articleId"))) ?? (try? c.decode(String.self, forKey: FlexKey("article_id"))) ?? ""
    }
}

nonisolated struct PublishingActivity: Decodable {
    let lastPublishedAt: String?
    let daysSinceLastPublished: Int?
    let thisWeekCount: Int
    let thisMonthCount: Int

    init() { lastPublishedAt = nil; daysSinceLastPublished = nil; thisWeekCount = 0; thisMonthCount = 0 }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        lastPublishedAt = (try? c.decode(String.self, forKey: FlexKey("lastPublishedAt"))) ?? (try? c.decode(String.self, forKey: FlexKey("last_published_at")))
        daysSinceLastPublished = (try? c.decode(Int.self, forKey: FlexKey("daysSinceLastPublished"))) ?? (try? c.decode(Int.self, forKey: FlexKey("days_since_last_published")))
        thisWeekCount = (try? c.decode(Int.self, forKey: FlexKey("thisWeekCount"))) ?? (try? c.decode(Int.self, forKey: FlexKey("this_week_count"))) ?? 0
        thisMonthCount = (try? c.decode(Int.self, forKey: FlexKey("thisMonthCount"))) ?? (try? c.decode(Int.self, forKey: FlexKey("this_month_count"))) ?? 0
    }
}

nonisolated struct ContributorArticle: Decodable, Identifiable {
    let id: String
    let title: String
    let status: String
    let reviewStatus: String?
    let views: Int
    let likes: Int
    let comments: Int
    let bookmarks: Int
    let createdAt: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""
        status = (try? c.decode(String.self, forKey: FlexKey("status"))) ?? ""
        reviewStatus = (try? c.decode(String.self, forKey: FlexKey("reviewStatus"))) ?? (try? c.decode(String.self, forKey: FlexKey("review_status")))
        views = (try? c.decode(Int.self, forKey: FlexKey("views"))) ?? 0
        likes = (try? c.decode(Int.self, forKey: FlexKey("likes"))) ?? 0
        comments = (try? c.decode(Int.self, forKey: FlexKey("comments"))) ?? 0
        bookmarks = (try? c.decode(Int.self, forKey: FlexKey("bookmarks"))) ?? 0
        createdAt = (try? c.decode(String.self, forKey: FlexKey("createdAt"))) ?? (try? c.decode(String.self, forKey: FlexKey("created_at")))
    }
}

nonisolated struct ContributorRanking: Decodable {
    let rank: Int?
    let totalAuthors: Int
    let percentile: Int
    let myViews: Int
    let isTopTen: Bool

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        rank = (try? c.decode(Int.self, forKey: FlexKey("rank")))
        totalAuthors = (try? c.decode(Int.self, forKey: FlexKey("totalAuthors"))) ?? (try? c.decode(Int.self, forKey: FlexKey("total_authors"))) ?? 0
        percentile = (try? c.decode(Int.self, forKey: FlexKey("percentile"))) ?? 0
        myViews = (try? c.decode(Int.self, forKey: FlexKey("myViews"))) ?? (try? c.decode(Int.self, forKey: FlexKey("my_views"))) ?? 0
        isTopTen = (try? c.decode(Bool.self, forKey: FlexKey("isTopTen"))) ?? (try? c.decode(Bool.self, forKey: FlexKey("is_top_ten"))) ?? false
    }
}

// MARK: - ViewModel

@MainActor
final class ContributorDashboardViewModel: ObservableObject {
    @Published var analytics: ContributorAnalytics?
    @Published var ranking: ContributorRanking?
    @Published var isLoading = true
    @Published var error: String?

    func load() async {
        isLoading = true
        error = nil
        do {
            async let a = APIClient.shared.get(ContributorAnalytics.self, path: "/contributor/analytics", ignoreCache: true)
            async let r = APIClient.shared.get(ContributorRanking.self, path: "/contributor/ranking", ignoreCache: true)
            analytics = try await a
            ranking = try? await r
        } catch {
            self.error = "تعذّر تحميل البيانات"
        }
        isLoading = false
    }
}

// MARK: - View

struct ContributorDashboardView: View {
    @StateObject private var vm = ContributorDashboardViewModel()

    private let accentGreen = Color(red: 0.18, green: 0.80, blue: 0.44)
    private let accentBlue  = Color(red: 0.25, green: 0.56, blue: 0.97)
    private let accentPink  = Color(red: 0.93, green: 0.36, blue: 0.48)
    private let accentAmber = Color(red: 0.96, green: 0.62, blue: 0.04)
    private let accentCyan  = Color(red: 0.20, green: 0.78, blue: 0.85)

    var body: some View {
        ScrollView(showsIndicators: false) {
            if vm.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 300)
            } else if let error = vm.error {
                VStack(spacing: 16) {
                    Image(systemName: "chart.bar.xaxis.ascending")
                        .font(SabqFonts.app(size: 40, weight: .light))
                        .foregroundStyle(SabqTheme.secondaryInk.opacity(0.4))
                    Text(error)
                        .font(SabqFonts.app(size: 14, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                    Button { Task { await vm.load() } } label: {
                        Text("إعادة المحاولة")
                            .font(SabqFonts.app(size: 14, weight: .semibold))
                            .padding(.horizontal, 20)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(accentBlue.opacity(0.12)))
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 300)
            } else if let data = vm.analytics {
                VStack(alignment: .leading, spacing: 24) {
                    headerSection(data)
                    statsCardsSection(data)
                    overviewRow(data)
                    chartSection(data)
                    engagementSection(data)
                    audienceSection(data)
                    publishingSection(data)
                    articlesSection(data)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 100)
            }
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("لوحة الأداء")
        .navigationBarTitleDisplayMode(.large)
        .task { await vm.load() }
        .refreshable { await vm.load() }
    }

    // MARK: - Header

    @ViewBuilder
    private func headerSection(_ data: ContributorAnalytics) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: data.role == "reporter" ? "newspaper.fill" : "pencil.and.outline")
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(accentBlue)
                Text(data.role == "reporter" ? "لوحة المراسل" : "لوحة كاتب الرأي")
                    .font(SabqFonts.app(size: 20, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
            }
            Text("مرحباً بك في لوحة التحكم الخاصة بك")
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
    }

    // MARK: - Stats Cards

    @ViewBuilder
    private func statsCardsSection(_ data: ContributorAnalytics) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            statCard(title: "المشاهدات", value: data.totalViews, icon: "eye.fill", color: accentBlue, bgColor: accentBlue, trend: trendPct(data.comparison.viewsThisMonth, data.comparison.viewsLastMonth))
            statCard(title: "الإعجابات", value: data.totalLikes, icon: "heart.fill", color: accentPink, bgColor: accentPink, trend: trendPct(data.comparison.likesThisMonth, data.comparison.likesLastMonth))
            statCard(title: "التعليقات", value: data.totalComments, icon: "bubble.left.fill", color: accentCyan, bgColor: accentCyan, trend: nil)
            statCard(title: "المفضلة", value: data.totalBookmarks, icon: "bookmark.fill", color: accentAmber, bgColor: accentAmber, trend: nil)
        }
    }

    @ViewBuilder
    private func statCard(title: String, value: Int, icon: String, color: Color, bgColor: Color, trend: Int?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(bgColor.opacity(0.12))
                        .frame(width: 30, height: 30)
                    Image(systemName: icon)
                        .font(SabqFonts.app(size: 13, weight: .semibold))
                        .foregroundStyle(color)
                }
                Spacer()
                if let t = trend {
                    HStack(spacing: 2) {
                        Image(systemName: t >= 0 ? "arrow.up.right" : "arrow.down.right")
                            .font(SabqFonts.app(size: 8, weight: .bold))
                        Text("\(abs(t))%")
                            .font(SabqFonts.app(size: 10, weight: .bold))
                    }
                    .foregroundStyle(t >= 0 ? accentGreen : accentPink)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Capsule().fill((t >= 0 ? accentGreen : accentPink).opacity(0.1)))
                }
            }
            Text("\(value)")
                .font(SabqFonts.app(size: 24, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
            Text(title)
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).fill(.ultraThinMaterial))
        .overlay(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).stroke(SabqTheme.outline.opacity(0.25), lineWidth: 0.5))
    }

    // MARK: - Overview Row

    @ViewBuilder
    private func overviewRow(_ data: ContributorAnalytics) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("نظرة عامة")

            HStack(spacing: 12) {
                // Status breakdown
                VStack(alignment: .leading, spacing: 6) {
                    statusDot(label: "منشور", count: data.publishedArticles, color: .green)
                    statusDot(label: "مسودة", count: data.draftArticles, color: .yellow)
                    statusDot(label: "قيد المراجعة", count: data.pendingArticles, color: .blue)
                    statusDot(label: "مرفوض", count: data.rejectedArticles, color: .red)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).fill(.ultraThinMaterial))
                .overlay(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).stroke(SabqTheme.outline.opacity(0.3), lineWidth: 0.5))

                // Best article
                if let best = data.bestArticleThisWeek {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 4) {
                            Image(systemName: "trophy.fill")
                                .font(SabqFonts.app(size: 12))
                                .foregroundStyle(.orange)
                            Text("الأفضل هذا الأسبوع")
                                .font(SabqFonts.app(size: 10, weight: .semibold))
                                .foregroundStyle(SabqTheme.secondaryInk)
                        }
                        Text(best.title)
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)
                            .lineLimit(3)
                        HStack(spacing: 3) {
                            Image(systemName: "eye.fill")
                                .font(SabqFonts.app(size: 10))
                            Text("\(best.views)")
                                .font(SabqFonts.app(size: 11, weight: .medium))
                        }
                        .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                            .fill(Color.orange.opacity(0.06))
                    )
                    .overlay(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).stroke(Color.orange.opacity(0.2), lineWidth: 0.5))
                }
            }
        }
    }

    // MARK: - Chart

    @ViewBuilder
    private func chartSection(_ data: ContributorAnalytics) -> some View {
        if !data.dailyStats.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                sectionTitle("أداء المقالات")
                if #available(iOS 17, *) {
                    Chart(data.dailyStats) { stat in
                        AreaMark(
                            x: .value("التاريخ", stat.date),
                            y: .value("مشاهدات", stat.views)
                        )
                        .foregroundStyle(.linearGradient(colors: [.blue.opacity(0.3), .blue.opacity(0.05)], startPoint: .top, endPoint: .bottom))
                        LineMark(
                            x: .value("التاريخ", stat.date),
                            y: .value("مشاهدات", stat.views)
                        )
                        .foregroundStyle(.blue)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                    }
                    .chartXAxis(.hidden)
                    .chartYAxis {
                        AxisMarks(position: .leading) { value in
                            AxisValueLabel {
                                if let v = value.as(Int.self) {
                                    Text("\(v)")
                                        .font(SabqFonts.app(size: 9))
                                }
                            }
                        }
                    }
                    .frame(height: 180)
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).fill(.ultraThinMaterial))
                    .overlay(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).stroke(SabqTheme.outline.opacity(0.3), lineWidth: 0.5))
                }
            }
        }
    }

    // MARK: - Engagement

    @ViewBuilder
    private func engagementSection(_ data: ContributorAnalytics) -> some View {
        if !data.topArticles.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                sectionTitle("أعلى المقالات تفاعلاً")
                ForEach(Array(data.topArticles.prefix(5).enumerated()), id: \.element.id) { index, article in
                    HStack(spacing: 10) {
                        ZStack {
                            Circle()
                                .fill(index < 3 ? accentAmber.opacity(0.12) : SabqTheme.outline.opacity(0.15))
                                .frame(width: 26, height: 26)
                            Text("\(index + 1)")
                                .font(SabqFonts.app(size: 12, weight: .heavy))
                                .foregroundStyle(index < 3 ? accentAmber : SabqTheme.secondaryInk)
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            Text(article.title)
                                .font(SabqFonts.app(size: 13, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)
                                .lineLimit(1)
                            HStack(spacing: 10) {
                                miniStat(icon: "eye.fill", value: article.views)
                                miniStat(icon: "heart.fill", value: article.likes)
                                miniStat(icon: "bubble.left.fill", value: article.comments)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 8)
                    .padding(.horizontal, 14)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(SabqTheme.outline.opacity(0.06)))
                }
                .padding(.vertical, 10)
                .padding(.horizontal, 4)
                .background(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).fill(.ultraThinMaterial))
                .overlay(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).stroke(SabqTheme.outline.opacity(0.3), lineWidth: 0.5))
            }
        }

        if let comment = data.featuredComment {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: "quote.opening")
                        .font(SabqFonts.app(size: 13, weight: .semibold))
                        .foregroundStyle(accentCyan)
                    Text("أبرز تعليق هذا الأسبوع")
                        .font(SabqFonts.app(size: 12, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                }
                Text("«\(comment.content)»")
                    .font(SabqFonts.app(size: 14, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(3)
                    .italic()
                HStack(spacing: 4) {
                    Image(systemName: "person.circle.fill")
                        .font(SabqFonts.app(size: 11))
                        .foregroundStyle(SabqTheme.secondaryInk)
                    Text("\(comment.userName) · \(comment.articleTitle)")
                        .font(SabqFonts.app(size: 11, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineLimit(1)
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .fill(accentCyan.opacity(0.04))
            )
            .overlay(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).stroke(accentCyan.opacity(0.2), lineWidth: 0.5))
        }
    }

    // MARK: - Audience

    @ViewBuilder
    private func audienceSection(_ data: ContributorAnalytics) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("الجمهور")

            HStack(spacing: 12) {
                // Followers
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 4) {
                        Image(systemName: "person.2.fill")
                            .font(SabqFonts.app(size: 12))
                            .foregroundStyle(.blue)
                        Text("المتابعون")
                            .font(SabqFonts.app(size: 11, weight: .semibold))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    Text("\(data.followers.count)")
                        .font(SabqFonts.app(size: 24, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                    if !data.followers.dailyGrowth.isEmpty {
                        let total = data.followers.dailyGrowth.reduce(0) { $0 + $1.count }
                        Text("+\(total) آخر 30 يوم")
                            .font(SabqFonts.app(size: 10, weight: .medium))
                            .foregroundStyle(.green)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).fill(.ultraThinMaterial))
                .overlay(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).stroke(SabqTheme.outline.opacity(0.3), lineWidth: 0.5))

                // Ranking
                if let ranking = vm.ranking {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 4) {
                            Image(systemName: "medal.fill")
                                .font(SabqFonts.app(size: 12))
                                .foregroundStyle(accentAmber)
                            Text("ترتيبك")
                                .font(SabqFonts.app(size: 11, weight: .semibold))
                                .foregroundStyle(SabqTheme.secondaryInk)
                        }
                        if let rank = ranking.rank {
                            HStack(alignment: .firstTextBaseline, spacing: 4) {
                                Text("#\(rank)")
                                    .font(SabqFonts.app(size: 24, weight: .heavy))
                                    .foregroundStyle(SabqTheme.ink)
                                Text("من \(ranking.totalAuthors)")
                                    .font(SabqFonts.app(size: 11, weight: .medium))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                            }
                            if ranking.isTopTen {
                                Text("الأكثر قراءة")
                                    .font(SabqFonts.app(size: 10, weight: .bold))
                                    .foregroundStyle(accentAmber)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Capsule().fill(accentAmber.opacity(0.12)))
                            } else {
                                Text("أعلى من \(ranking.percentile)%")
                                    .font(SabqFonts.app(size: 10, weight: .medium))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                            }
                        } else {
                            Text("لم تنشر هذا الشهر")
                                .font(SabqFonts.app(size: 12, weight: .medium))
                                .foregroundStyle(SabqTheme.secondaryInk)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).fill(.ultraThinMaterial))
                    .overlay(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).stroke(SabqTheme.outline.opacity(0.25), lineWidth: 0.5))
                }
            }
        }
    }

    // MARK: - Publishing

    @ViewBuilder
    private func publishingSection(_ data: ContributorAnalytics) -> some View {
        let pa = data.publishingActivity
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("نشاط النشر")
            HStack(spacing: 12) {
                VStack(spacing: 4) {
                    Text("\(pa.thisWeekCount)")
                        .font(SabqFonts.app(size: 20, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                    Text("هذا الأسبوع")
                        .font(SabqFonts.app(size: 10, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(accentBlue.opacity(0.06)))

                VStack(spacing: 4) {
                    Text("\(pa.thisMonthCount)")
                        .font(SabqFonts.app(size: 20, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                    Text("هذا الشهر")
                        .font(SabqFonts.app(size: 10, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(accentGreen.opacity(0.06)))
            }
            if let days = pa.daysSinceLastPublished {
                HStack(spacing: 4) {
                    Image(systemName: "clock.fill")
                        .font(SabqFonts.app(size: 11))
                    Text(days == 0 ? "آخر نشر: اليوم" : days == 1 ? "آخر نشر: أمس" : "آخر نشر منذ \(days) يوم")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                }
                .foregroundStyle(days > 14 ? .orange : SabqTheme.secondaryInk)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).fill(.ultraThinMaterial))
        .overlay(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).stroke(SabqTheme.outline.opacity(0.3), lineWidth: 0.5))
    }

    // MARK: - Articles List

    @ViewBuilder
    private func articlesSection(_ data: ContributorAnalytics) -> some View {
        if !data.articles.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                sectionTitle(data.role == "reporter" ? "أخباري" : "مقالاتي")
                ForEach(data.articles.prefix(10)) { article in
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(article.title)
                                .font(SabqFonts.app(size: 13, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)
                                .lineLimit(1)
                            HStack(spacing: 8) {
                                statusPill(article.status, reviewStatus: article.reviewStatus)
                                miniStat(icon: "eye.fill", value: article.views)
                                miniStat(icon: "heart.fill", value: article.likes)
                                miniStat(icon: "bubble.left.fill", value: article.comments)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 8)
                    .padding(.horizontal, 14)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(SabqTheme.outline.opacity(0.06)))
                }
            }
        }
    }

    // MARK: - Helpers

    @ViewBuilder
    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(SabqFonts.app(size: 16, weight: .heavy))
            .foregroundStyle(SabqTheme.ink)
    }

    @ViewBuilder
    private func statusDot(label: String, count: Int, color: Color) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.ink)
            Spacer()
            Text("\(count)")
                .font(SabqFonts.app(size: 12, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
        }
    }

    @ViewBuilder
    private func miniStat(icon: String, value: Int) -> some View {
        HStack(spacing: 2) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 9))
            Text("\(value)")
                .font(SabqFonts.app(size: 10, weight: .medium))
        }
        .foregroundStyle(SabqTheme.secondaryInk)
    }

    @ViewBuilder
    private func statusPill(_ status: String, reviewStatus: String?) -> some View {
        let (label, color) = statusInfo(status, reviewStatus: reviewStatus)
        Text(label)
            .font(SabqFonts.app(size: 9, weight: .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(color.opacity(0.12)))
    }

    private func statusInfo(_ status: String, reviewStatus: String?) -> (String, Color) {
        if reviewStatus == "needs_changes" { return ("يحتاج تعديل", .orange) }
        if reviewStatus == "pending_review" { return ("قيد المراجعة", .blue) }
        switch status {
        case "published": return ("منشور", .green)
        case "draft": return ("مسودة", .yellow)
        case "rejected": return ("مرفوض", .red)
        case "archived": return ("مؤرشف", .red)
        default: return (status, .gray)
        }
    }

    private func trendPct(_ current: Int, _ previous: Int) -> Int? {
        guard previous > 0 else { return current > 0 ? 100 : nil }
        return Int(Double(current - previous) / Double(previous) * 100)
    }
}

// MARK: - Route

struct ContributorDashboardRoute: Hashable {}
