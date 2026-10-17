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

// موعد النشر الأسبوعي لكاتب الرأي — بانر بثلاث حالات، أو دعوة لاختيار اليوم
nonisolated struct WriterScheduleBannerModel: Decodable {
    let weekday: Int
    let publishTime: String
    let nextPublishAt: String
    let submitDeadline: String
    let state: String // ok | reminder | late
    let hasUpcoming: Bool

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        weekday = (try? c.decode(Int.self, forKey: FlexKey("weekday"))) ?? 0
        publishTime = (try? c.decode(String.self, forKey: FlexKey("publishTime"))) ?? "06:00"
        nextPublishAt = (try? c.decode(String.self, forKey: FlexKey("nextPublishAt"))) ?? ""
        submitDeadline = (try? c.decode(String.self, forKey: FlexKey("submitDeadline"))) ?? ""
        state = (try? c.decode(String.self, forKey: FlexKey("state"))) ?? "ok"
        hasUpcoming = (try? c.decode(Bool.self, forKey: FlexKey("hasUpcoming"))) ?? false
    }
}

nonisolated struct WriterActivePipelineArticleModel: Decodable {
    let id: String
    let title: String
    let stage: String
    let scheduledAt: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = (try? c.decode(String.self, forKey: FlexKey("id"))) ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""
        stage = (try? c.decode(String.self, forKey: FlexKey("stage"))) ?? "pending_review"
        scheduledAt = try? c.decode(String.self, forKey: FlexKey("scheduledAt"))
    }
}

nonisolated struct WriterScheduleResponse: Decodable {
    let banner: WriterScheduleBannerModel?
    let canChoose: Bool
    let dayLoads: [Int]
    let activeArticle: WriterActivePipelineArticleModel?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        banner = try? c.decode(WriterScheduleBannerModel.self, forKey: FlexKey("banner"))
        canChoose = (try? c.decode(Bool.self, forKey: FlexKey("canChoose"))) ?? false
        dayLoads = (try? c.decode([Int].self, forKey: FlexKey("dayLoads"))) ?? []
        activeArticle = try? c.decode(WriterActivePipelineArticleModel.self, forKey: FlexKey("activeArticle"))
    }
}

nonisolated struct WriterSchedulePostResponse: Decodable {
    let success: Bool

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        success = (try? c.decode(Bool.self, forKey: FlexKey("success"))) ?? false
    }
}

let writerWeekdaysAr = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]

// MARK: - ViewModel

@MainActor
final class ContributorDashboardViewModel: ObservableObject {
    @Published var analytics: ContributorAnalytics?
    @Published var ranking: ContributorRanking?
    @Published var schedule: WriterScheduleResponse?
    @Published var savingDay = false
    @Published var scheduleError: String?
    @Published var isLoading = true
    @Published var error: String?

    func load() async {
        isLoading = true
        error = nil
        do {
            async let a = APIClient.shared.get(ContributorAnalytics.self, path: "/contributor/analytics", ignoreCache: true)
            async let r = APIClient.shared.get(ContributorRanking.self, path: "/contributor/ranking", ignoreCache: true)
            async let s = APIClient.shared.get(WriterScheduleResponse.self, path: "/contributor/schedule", ignoreCache: true)
            analytics = try await a
            ranking = try? await r
            schedule = try? await s
        } catch {
            self.error = "تعذّر تحميل البيانات"
        }
        isLoading = false
    }

    /// تثبيت اليوم المختار — مرة واحدة؛ الخادم يرفض أي تغيير لاحق (409)
    func pickDay(_ weekday: Int) async {
        savingDay = true
        scheduleError = nil
        struct Body: Encodable { let weekday: Int }
        do {
            _ = try await APIClient.shared.post(WriterSchedulePostResponse.self, path: "/contributor/schedule", body: Body(weekday: weekday))
            schedule = try? await APIClient.shared.get(WriterScheduleResponse.self, path: "/contributor/schedule", ignoreCache: true)
        } catch {
            scheduleError = "تعذر حفظ اليوم — حاول مرة أخرى"
        }
        savingDay = false
    }
}

// MARK: - View

struct ContributorDashboardView: View {
    /// true عندما تُعرض كتبويب «أدائي» داخل WriterWorkspaceView — تُخفى
    /// بطاقات الجدولة والاستطلاعات (انتقلت لتبويب «اليوم») ويتغير العنوان.
    var embedded = false

    @StateObject private var vm = ContributorDashboardViewModel()
    /// دعوات الاستطلاع المفتوحة — بطاقة «استطلاع بانتظارك» أعلى اللوحة
    /// حتى لو فات الكاتبَ إشعارُ الدفع. فشل الجلب يمرّ بصمت (القائمة تبقى فارغة).
    @State private var pendingSurveys: [APIMySurveyInvite] = []

    var body: some View {
        ScrollView(showsIndicators: false) {
            if vm.isLoading {
                ProgressView()
                    .tint(SabqTheme.primary)
                    .frame(maxWidth: .infinity, minHeight: 300)
            } else if let error = vm.error {
                VStack(spacing: SabqLayout.space16) {
                    Image(systemName: "chart.bar.xaxis.ascending")
                        .font(SabqFonts.app(size: 40, weight: .light))
                        .foregroundStyle(SabqTheme.textTertiary)
                        .accessibilityHidden(true)
                    Text(error)
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)
                    Button { Task { await vm.load() } } label: {
                        Text("إعادة المحاولة")
                            .sabqText(SabqType.button)
                            .foregroundStyle(SabqTheme.onAction)
                            .padding(.horizontal, SabqLayout.space24)
                            .frame(minHeight: SabqLayout.controlHeight)
                            .background(
                                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                    .fill(SabqTheme.actionFill)
                            )
                    }
                    .buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity, minHeight: 300)
            } else if let data = vm.analytics {
                VStack(alignment: .leading, spacing: SabqLayout.sectionGap) {
                    VStack(alignment: .leading, spacing: SabqLayout.space16) {
                        headerSection(data)
                        if !embedded, data.role == "writer", let sched = vm.schedule {
                            if let banner = sched.banner {
                                WriterScheduleBannerCard(banner: banner)
                            } else if sched.canChoose {
                                WriterDayPickerCard(
                                    dayLoads: sched.dayLoads,
                                    saving: vm.savingDay,
                                    errorText: vm.scheduleError
                                ) { day in
                                    Task { await vm.pickDay(day) }
                                }
                            }
                        }
                        if !pendingSurveys.isEmpty {
                            PendingSurveysCard(invites: pendingSurveys)
                        }
                        statsCardsSection(data)
                    }
                    overviewRow(data)
                    chartSection(data)
                    engagementSection(data)
                    audienceSection(data)
                    publishingSection(data)
                    articlesSection(data)
                }
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.top, SabqLayout.space8)
                .padding(.bottom, 104)
            }
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle(embedded ? "لوحة الكاتب" : "لوحة الأداء")
        .navigationBarTitleDisplayMode(.large)
        .task {
            await vm.load()
            pendingSurveys = (try? await APIClient.shared.fetchMySurveys()) ?? []
        }
        .refreshable {
            await vm.load()
            pendingSurveys = (try? await APIClient.shared.fetchMySurveys()) ?? []
        }
    }

    // MARK: - Header

    @ViewBuilder
    private func headerSection(_ data: ContributorAnalytics) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: data.role == "reporter" ? "newspaper" : "pencil.and.outline")
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                    .accessibilityHidden(true)
                Text(data.role == "reporter" ? "لوحة المراسل" : "لوحة كاتب الرأي")
                    .sabqText(SabqType.leadTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }
            Text("مرحباً بك في لوحة التحكم الخاصة بك")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
        }
    }

    // MARK: - Stats Cards

    @ViewBuilder
    private func statsCardsSection(_ data: ContributorAnalytics) -> some View {
        LazyVGrid(columns: SabqGrid.adaptive(spacing: SabqLayout.space8), spacing: SabqLayout.space8) {
            statCard(title: "المشاهدات", value: data.totalViews, icon: "eye", trend: trendPct(data.comparison.viewsThisMonth, data.comparison.viewsLastMonth))
            statCard(title: "الإعجابات", value: data.totalLikes, icon: "heart", trend: trendPct(data.comparison.likesThisMonth, data.comparison.likesLastMonth))
            statCard(title: "التعليقات", value: data.totalComments, icon: "bubble.left", trend: nil)
            statCard(title: "المفضلة", value: data.totalBookmarks, icon: "bookmark", trend: nil)
        }
    }

    @ViewBuilder
    private func statCard(title: String, value: Int, icon: String, trend: Int?) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.textSecondary)
                    .accessibilityHidden(true)
                Spacer()
                if let t = trend {
                    HStack(spacing: 2) {
                        Image(systemName: t >= 0 ? "arrow.up.right" : "arrow.down.right")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                        Text("\(abs(t))%")
                            .sabqText(SabqType.tag)
                    }
                    .environment(\.layoutDirection, .leftToRight)
                    .foregroundStyle(t >= 0 ? SabqTheme.success : SabqTheme.danger)
                    .padding(.horizontal, SabqLayout.space8)
                    .padding(.vertical, SabqLayout.space4)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                            .fill(SabqTheme.background)
                    )
                }
            }
            Text("\(value)")
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(title)
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
        .accessibilityElement(children: .combine)
    }

    // MARK: - Overview Row

    @ViewBuilder
    private func overviewRow(_ data: ContributorAnalytics) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            sectionTitle("نظرة عامة")

            HStack(alignment: .top, spacing: SabqLayout.space8) {
                // Status breakdown
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    statusDot(label: "منشور", count: data.publishedArticles, color: SabqTheme.success)
                    statusDot(label: "مسودة", count: data.draftArticles, color: SabqTheme.warning)
                    statusDot(label: "قيد المراجعة", count: data.pendingArticles, color: SabqTheme.primary)
                    statusDot(label: "مرفوض", count: data.rejectedArticles, color: SabqTheme.danger)
                }
                .padding(SabqLayout.space12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))

                // Best article
                if let best = data.bestArticleThisWeek {
                    VStack(alignment: .leading, spacing: SabqLayout.space8) {
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "trophy")
                                .font(SabqFonts.app(size: 12, weight: .semibold))
                                .foregroundStyle(SabqTheme.warning)
                                .accessibilityHidden(true)
                            Text("الأفضل هذا الأسبوع")
                                .sabqText(SabqType.tag)
                                .foregroundStyle(SabqTheme.textSecondary)
                        }
                        Text(best.title)
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(3)
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "eye")
                                .font(SabqFonts.app(size: 12))
                            Text("\(best.views)")
                                .sabqText(SabqType.meta)
                        }
                        .foregroundStyle(SabqTheme.textSecondary)
                    }
                    .padding(SabqLayout.space12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
                }
            }
        }
    }

    // MARK: - Chart

    @ViewBuilder
    private func chartSection(_ data: ContributorAnalytics) -> some View {
        if !data.dailyStats.isEmpty {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                sectionTitle("أداء المقالات")
                if #available(iOS 17, *) {
                    Chart(data.dailyStats) { stat in
                        AreaMark(
                            x: .value("التاريخ", stat.date),
                            y: .value("مشاهدات", stat.views)
                        )
                        .foregroundStyle(SabqTheme.primary.opacity(0.12))
                        LineMark(
                            x: .value("التاريخ", stat.date),
                            y: .value("مشاهدات", stat.views)
                        )
                        .foregroundStyle(SabqTheme.primary)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                    }
                    .chartXAxis(.hidden)
                    .chartYAxis {
                        AxisMarks(position: .leading) { value in
                            AxisGridLine().foregroundStyle(SabqTheme.separator)
                            AxisValueLabel {
                                if let v = value.as(Int.self) {
                                    Text("\(v)")
                                        .sabqText(SabqType.tag)
                                        .foregroundStyle(SabqTheme.textTertiary)
                                }
                            }
                        }
                    }
                    .frame(height: 180)
                    .padding(.vertical, SabqLayout.space8)
                }
            }
        }
    }

    // MARK: - Engagement

    @ViewBuilder
    private func engagementSection(_ data: ContributorAnalytics) -> some View {
        if !data.topArticles.isEmpty {
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                sectionTitle("أعلى المقالات تفاعلاً")
                ForEach(Array(data.topArticles.prefix(5).enumerated()), id: \.element.id) { index, article in
                    if index > 0 { Divider().overlay(SabqTheme.separator) }
                    HStack(spacing: SabqLayout.space12) {
                        Text("\(index + 1)")
                            .sabqText(SabqType.rowTitle)
                            .foregroundStyle(index < 3 ? SabqTheme.primary : SabqTheme.textTertiary)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: SabqLayout.space4) {
                            Text(article.title)
                                .sabqText(SabqType.rowTitle)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .lineLimit(2)
                            HStack(spacing: SabqLayout.space12) {
                                miniStat(icon: "eye", value: article.views)
                                miniStat(icon: "heart", value: article.likes)
                                miniStat(icon: "bubble.left", value: article.comments)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, SabqLayout.space12)
                }
            }
        }

        if let comment = data.featuredComment {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "quote.opening")
                        .font(SabqFonts.app(size: 13, weight: .semibold))
                        .foregroundStyle(SabqTheme.primary)
                        .accessibilityHidden(true)
                    Text("أبرز تعليق هذا الأسبوع")
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.textPrimary)
                }
                Text("«\(comment.content)»")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(3)
                HStack(spacing: SabqLayout.space4) {
                    Image(systemName: "person.circle")
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(SabqTheme.textSecondary)
                    Text("\(comment.userName) · \(comment.articleTitle)")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(1)
                }
            }
            .padding(SabqLayout.space16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
        }
    }

    // MARK: - Audience

    @ViewBuilder
    private func audienceSection(_ data: ContributorAnalytics) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            sectionTitle("الجمهور")

            HStack(alignment: .top, spacing: SabqLayout.space8) {
                // Followers
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    HStack(spacing: SabqLayout.space4) {
                        Image(systemName: "person.2")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                            .foregroundStyle(SabqTheme.primary)
                            .accessibilityHidden(true)
                        Text("المتابعون")
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                    Text("\(data.followers.count)")
                        .sabqText(SabqType.leadTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                    if !data.followers.dailyGrowth.isEmpty {
                        let total = data.followers.dailyGrowth.reduce(0) { $0 + $1.count }
                        Text("+\(total) آخر 30 يوم")
                            .sabqText(SabqType.tag)
                            .foregroundStyle(SabqTheme.success)
                    }
                }
                .padding(SabqLayout.space12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))

                // Ranking
                if let ranking = vm.ranking {
                    VStack(alignment: .leading, spacing: SabqLayout.space4) {
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "medal")
                                .font(SabqFonts.app(size: 12, weight: .semibold))
                                .foregroundStyle(SabqTheme.warning)
                                .accessibilityHidden(true)
                            Text("ترتيبك")
                                .sabqText(SabqType.metaEmphasis)
                                .foregroundStyle(SabqTheme.textSecondary)
                        }
                        if let rank = ranking.rank {
                            HStack(alignment: .firstTextBaseline, spacing: SabqLayout.space4) {
                                Text("#\(rank)")
                                    .sabqText(SabqType.leadTitle)
                                    .foregroundStyle(SabqTheme.textPrimary)
                                Text("من \(ranking.totalAuthors)")
                                    .sabqText(SabqType.meta)
                                    .foregroundStyle(SabqTheme.textSecondary)
                            }
                            if ranking.isTopTen {
                                StatusChip(title: "الأكثر قراءة", tint: SabqTheme.warning)
                            } else {
                                Text("أعلى من \(ranking.percentile)%")
                                    .sabqText(SabqType.tag)
                                    .foregroundStyle(SabqTheme.textSecondary)
                            }
                        } else {
                            Text("لم تنشر هذا الشهر")
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.textSecondary)
                        }
                    }
                    .padding(SabqLayout.space12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
                }
            }
        }
    }

    // MARK: - Publishing

    @ViewBuilder
    private func publishingSection(_ data: ContributorAnalytics) -> some View {
        let pa = data.publishingActivity
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            sectionTitle("نشاط النشر")
            HStack(spacing: SabqLayout.space8) {
                countTile(value: pa.thisWeekCount, label: "هذا الأسبوع")
                countTile(value: pa.thisMonthCount, label: "هذا الشهر")
            }
            if let days = pa.daysSinceLastPublished {
                HStack(spacing: SabqLayout.space4) {
                    Image(systemName: "clock")
                        .font(SabqFonts.app(size: 12))
                    Text(days == 0 ? "آخر نشر: اليوم" : days == 1 ? "آخر نشر: أمس" : "آخر نشر منذ \(days) يوم")
                        .sabqText(SabqType.meta)
                }
                .foregroundStyle(days > 14 ? SabqTheme.warning : SabqTheme.textSecondary)
            }
        }
    }

    private func countTile(value: Int, label: String) -> some View {
        VStack(spacing: SabqLayout.space4) {
            Text("\(value)")
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
            Text(label)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space12)
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
        .accessibilityElement(children: .combine)
    }

    // MARK: - Articles List

    @ViewBuilder
    private func articlesSection(_ data: ContributorAnalytics) -> some View {
        if !data.articles.isEmpty {
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                sectionTitle(data.role == "reporter" ? "أخباري" : "مقالاتي")
                ForEach(data.articles.prefix(10)) { article in
                    if article.id != data.articles.first?.id {
                        Divider().overlay(SabqTheme.separator)
                    }
                    VStack(alignment: .leading, spacing: SabqLayout.space8) {
                        Text(article.title)
                            .sabqText(SabqType.rowTitle)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(2)
                        HStack(spacing: SabqLayout.space12) {
                            statusPill(article.status, reviewStatus: article.reviewStatus)
                            miniStat(icon: "eye", value: article.views)
                            miniStat(icon: "heart", value: article.likes)
                            miniStat(icon: "bubble.left", value: article.comments)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, SabqLayout.space12)
                }
            }
        }
    }

    // MARK: - Helpers

    @ViewBuilder
    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .sabqText(SabqType.sectionHeading)
            .foregroundStyle(SabqTheme.textPrimary)
            .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder
    private func statusDot(label: String, count: Int, color: Color) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textPrimary)
            Spacer()
            Text("\(count)")
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textPrimary)
        }
    }

    @ViewBuilder
    private func miniStat(icon: String, value: Int) -> some View {
        HStack(spacing: SabqLayout.space4) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 12))
            Text("\(value)")
                .sabqText(SabqType.meta)
        }
        .foregroundStyle(SabqTheme.textSecondary)
    }

    @ViewBuilder
    private func statusPill(_ status: String, reviewStatus: String?) -> some View {
        let (label, color) = statusInfo(status, reviewStatus: reviewStatus)
        StatusChip(title: label, tint: color)
    }

    private func statusInfo(_ status: String, reviewStatus: String?) -> (String, Color) {
        if reviewStatus == "needs_changes" { return ("يحتاج تعديل", SabqTheme.warning) }
        if reviewStatus == "pending_review" { return ("قيد المراجعة", SabqTheme.primary) }
        switch status {
        case "published": return ("منشور", SabqTheme.success)
        case "draft": return ("مسودة", SabqTheme.warning)
        case "rejected": return ("مرفوض", SabqTheme.danger)
        case "archived": return ("مؤرشف", SabqTheme.danger)
        default: return (status, SabqTheme.textSecondary)
        }
    }

    private func trendPct(_ current: Int, _ previous: Int) -> Int? {
        guard previous > 0 else { return current > 0 ? 100 : nil }
        return Int(Double(current - previous) / Double(previous) * 100)
    }
}

// MARK: - Writer Schedule Cards

/// تنسيق تاريخ ISO بتوقيت الرياض وبالعربية — "الثلاثاء 21 يوليو – 6:00 ص"
private func formatRiyadhDate(_ iso: String, withTime: Bool = true) -> String {
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let plain = ISO8601DateFormatter()
    guard let date = withFraction.date(from: iso) ?? plain.date(from: iso) else { return "" }
    let f = DateFormatter()
    f.locale = Locale(identifier: "ar")
    f.timeZone = TimeZone(identifier: "Asia/Riyadh")
    f.dateFormat = withTime ? "EEEE d MMMM – h:mm a" : "EEEE d MMMM"
    return f.string(from: date)
}

/// بانر موعد النشر الأسبوعي بثلاث حالات: عادي / تذكير / متأخر
struct WriterScheduleBannerCard: View {
    let banner: WriterScheduleBannerModel

    private var tint: Color {
        switch banner.state {
        case "late": return SabqTheme.danger
        case "reminder": return SabqTheme.warning
        default: return SabqTheme.primary
        }
    }

    private var iconName: String {
        switch banner.state {
        case "late": return "exclamationmark.circle"
        case "reminder": return "bell.badge"
        default: return "calendar.badge.clock"
        }
    }

    private var title: String {
        switch banner.state {
        case "late": return "فات موعد النشر لهذا الأسبوع"
        case "reminder": return "تذكير: اقترب موعد مقالتك"
        default: return "يومك المخصص للنشر: \(writerWeekdaysAr[banner.weekday])"
        }
    }

    private var subtitle: String {
        switch banner.state {
        case "late":
            return "عند إرسال مقالتك الآن ستُجدول ليوم \(formatRiyadhDate(banner.nextPublishAt))"
        case "reminder":
            return "أرسلها قبل \(formatRiyadhDate(banner.submitDeadline, withTime: false)) — تُنشر \(formatRiyadhDate(banner.nextPublishAt))"
        default:
            if banner.hasUpcoming {
                return "مقالتك القادمة في مسار النشر — موعدها \(formatRiyadhDate(banner.nextPublishAt))"
            }
            return "مقالتك القادمة تُنشر \(formatRiyadhDate(banner.nextPublishAt)) — آخر موعد للإرسال \(formatRiyadhDate(banner.submitDeadline, withTime: false))"
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            Image(systemName: iconName)
                .font(SabqFonts.app(size: 18, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.background)
                )
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(banner.state == "ok" ? SabqTheme.textPrimary : tint)
                Text(subtitle)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
        .accessibilityElement(children: .combine)
    }
}

/// بطاقة اختيار الكاتب يومه الأسبوعي — مرة واحدة، مع ازدحام كل يوم
struct WriterDayPickerCard: View {
    let dayLoads: [Int]
    let saving: Bool
    let errorText: String?
    let onPick: (Int) -> Void

    @State private var picked: Int?

    private let columns = [GridItem(.flexible(), spacing: SabqLayout.space8), GridItem(.flexible(), spacing: SabqLayout.space8), GridItem(.flexible(), spacing: SabqLayout.space8), GridItem(.flexible(), spacing: SabqLayout.space8)]

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(alignment: .top, spacing: SabqLayout.space12) {
                Image(systemName: "calendar.badge.plus")
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                    .frame(width: 36, height: 36)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                            .fill(SabqTheme.background)
                    )
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text("اختر يومك الأسبوعي للنشر")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text("مقالتك ستُنشر في هذا اليوم من كل أسبوع. يُحدد مرة واحدة، وتغييره لاحقاً عبر إدارة التحرير.")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            LazyVGrid(columns: columns, spacing: SabqLayout.space8) {
                ForEach(0..<7, id: \.self) { day in
                    let isPicked = picked == day
                    Button {
                        picked = day
                    } label: {
                        VStack(spacing: 2) {
                            Text(writerWeekdaysAr[day])
                                .sabqText(SabqType.metaEmphasis)
                                .foregroundStyle(isPicked ? SabqTheme.onAction : SabqTheme.textPrimary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                            Text(day < dayLoads.count && dayLoads[day] > 0 ? "\(dayLoads[day]) كاتب" : "شاغر")
                                .sabqText(SabqType.tag)
                                .foregroundStyle(isPicked ? SabqTheme.onAction : SabqTheme.textSecondary)
                        }
                        .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                .fill(isPicked ? SabqTheme.actionFill : SabqTheme.background)
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(isPicked ? [.isSelected] : [])
                }
            }

            if let errorText {
                Text(errorText)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.danger)
            }

            Button {
                if let picked { onPick(picked) }
            } label: {
                let enabled = picked != nil && !saving
                HStack(spacing: SabqLayout.space8) {
                    if saving {
                        ProgressView().controlSize(.small).tint(SabqTheme.onAction)
                    } else {
                        Image(systemName: "checkmark")
                            .font(SabqFonts.app(size: 14, weight: .semibold))
                    }
                    Text(picked == nil ? "اختر يوماً أولاً" : "تثبيت يوم \(writerWeekdaysAr[picked ?? 0])")
                        .sabqText(SabqType.button)
                }
                .foregroundStyle(enabled || saving ? SabqTheme.onAction : SabqTheme.disabledInk)
                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(enabled || saving ? SabqTheme.actionFill : SabqTheme.disabledFill)
                )
            }
            .disabled(picked == nil || saving)
            .buttonStyle(.plain)
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous).fill(SabqTheme.surfaceMuted))
    }
}

// MARK: - Route

struct ContributorDashboardRoute: Hashable {}
