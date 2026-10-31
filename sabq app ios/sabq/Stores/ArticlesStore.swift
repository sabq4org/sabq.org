import SwiftUI

/// Pagination counts visible rows, while the cursor tracks the original remote
/// batch independently of hero/breaking exclusions and duplicate article IDs.
struct HomeTimelinePaging {
    var articles: [Article] = []
    var displayedCount = 25
    var cursor = NewsService.HomeFeedCursor(source: .news, nextPage: 1, hasMore: true)

    func visible(excluding ids: Set<String>) -> [Article] {
        articles.filter { !ids.contains($0.id) }
    }

    func needsRemote(target: Int, excluding ids: Set<String>) -> Bool {
        cursor.hasMore && visible(excluding: ids).count < target
    }

    func hasMore(excluding ids: Set<String>) -> Bool {
        visible(excluding: ids).count > displayedCount || cursor.hasMore
    }

    mutating func append(_ page: [Article], hasMore: Bool) {
        var seen = Set(articles.map(\.id))
        articles.append(contentsOf: page.filter { seen.insert($0.id).inserted })
        articles.sort { $0.publishDate > $1.publishDate }
        cursor.nextPage += 1
        cursor.hasMore = hasMore
    }
}

@Observable
final class ArticlesStore {
    private(set) var allArticles: [Article] = []
    private(set) var featuredArticles: [Article] = []
    private(set) var breakingNews: [Article] = []
    private(set) var stories: [APIStory] = []
    private(set) var trendingKeywords: [String] = []
    private(set) var trendingArticles: [Article] = []
    private(set) var opinions: [OpinionArticle] = []
    private(set) var liveData: APILiveResponse?
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var hasMore = true
    /// آخر محاولة `loadMore()` (تحميل صفحة تالية من «آخر الأخبار») فشلت
    /// شبكيًا — يبقى `hasMore` صحيحًا فيستمر ظرف إعادة المحاولة عند
    /// المستخدم بدل أن يُقرأ الفشل كـ "انتهت القائمة" (تدقيق err-1).
    private(set) var loadMoreFailed = false
    var selectedCategory: ArticleCategory?

    /// الأخبار الجديدة المكتشفة بصمت ولم تُعرض بعد (تنتظر ضغط المستخدم على الشريط)
    private(set) var pendingNewArticles: [Article] = []
    /// عدد الأخبار الجديدة المنتظرة — يُستخدم لإظهار شريط "X أخبار جديدة"
    var newArticlesCount: Int { pendingNewArticles.count }
    private(set) var isCheckingForNew = false

    /// معرفات الأخبار التي دخلت القائمة للتو عبر شريط "أخبار جديدة" —
    /// تُستخدم لعرض شارة "جديد" الخضراء عليها. تُمسح عند أي تحديث كامل
    /// للقائمة (سحب التحديث/إعادة التحميل).
    private(set) var recentlyAddedIDs: Set<String> = []

    func isRecentlyAdded(_ id: String) -> Bool { recentlyAddedIDs.contains(id) }

    private var pagination = HomeTimelinePaging()
    private var pendingTimelineTarget: Int?
    private(set) var homeTimelineRevision: UInt = 0
    private let pageSize = 25
    private let remotePageSize = 50
    /// يزداد مع كل استدعاء `loadArticles` — الطلبات المتداخلة (إقلاع +
    /// سحب تحديث) لا تُطبّق نتيجتها إلا إذا كانت الأحدث، وإلا يكتب الطلب
    /// الكاشي البطيء فوق استجابة السحب الطازجة (الكاروسيل لا يتحدّث إلا بعد
    /// إعادة تشغيل التطبيق).
    private var loadGeneration: UInt = 0
    /// يتغيّر عند تغيّر قائمة الكاروسيل — يُجبر TabView على إعادة البناء.
    private(set) var featuredCarouselRevision: UInt = 0

    private let homepageLoader: (Bool) async -> NewsService.HomepageResult?
    private let pageLoader: (NewsService.HomeFeedCursor, Int) async -> NewsService.HomeFeedPage?
    private let loadsSupplementalData: Bool

    init(
        homepageLoader: @escaping (Bool) async -> NewsService.HomepageResult? = { await NewsService.fetchHomepage(ignoreCache: $0) },
        pageLoader: @escaping (NewsService.HomeFeedCursor, Int) async -> NewsService.HomeFeedPage? = { await NewsService.fetchHomeFeedPage(cursor: $0, perPage: $1) },
        loadsSupplementalData: Bool = true
    ) {
        self.homepageLoader = homepageLoader
        self.pageLoader = pageLoader
        self.loadsSupplementalData = loadsSupplementalData
    }

    private func applyFeaturedCarousel(_ featured: [Article]) {
        let changed = featured.map(\.id) != featuredArticles.map(\.id)
        featuredArticles = featured
        if changed { featuredCarouselRevision &+= 1 }
    }

    /// - Parameter ignoreCache: `false` للاستفادة من التخزين المؤقت لـ HTTP (تشغيل أسرع). `true` عند سحب التحديث لإجبار جلب بيانات حديثة.
    @MainActor
    func loadArticles(ignoreCache: Bool = false) async {
        loadGeneration &+= 1
        let generation = loadGeneration
        isLoading = true
        errorMessage = nil

        // ابدأ الثانوية مع الرئيسية في الإقلاع فقط؛ سحب التحديث يجلب الرئيسية
        // وحدها ثم يكمل الثانوية في الخلفية حتى لا يعلق مؤشر .refreshable.
        async let homepageTask = homepageLoader(ignoreCache)
        let trendingTask = (ignoreCache || !loadsSupplementalData) ? nil : Task { await NewsService.fetchTrendingArticles() }
        let liveTask = (ignoreCache || !loadsSupplementalData) ? nil : Task { await NewsService.fetchLivePreview() }
        let opinionsTask = (ignoreCache || !loadsSupplementalData) ? nil : Task { await NewsService.fetchOpinions() }

        let homepageResult = await homepageTask
        guard generation == loadGeneration else {
            trendingTask?.cancel(); liveTask?.cancel(); opinionsTask?.cancel()
            return
        }
        guard let result = homepageResult else {
            if allArticles.isEmpty && featuredArticles.isEmpty {
                errorMessage = "تعذر تحميل الأخبار. تحقق من اتصالك بالإنترنت ثم أعد المحاولة"
            }
            isLoading = false
            trendingTask?.cancel(); liveTask?.cancel(); opinionsTask?.cancel()
            return
        }

        if ignoreCache {
            if !result.featured.isEmpty { applyFeaturedCarousel(result.featured) }
            if !result.breaking.isEmpty { breakingNews = result.breaking }
            if !result.stories.isEmpty { stories = result.stories }
            if !result.trending.isEmpty { trendingKeywords = result.trending }
        }

        if !result.latest.isEmpty || pagination.articles.isEmpty {
            let previousIDs = Set(pagination.articles.map(\.id))
            pagination.articles = result.latest
            applyFeaturedCarousel(result.featured)
            breakingNews = result.breaking
            stories = result.stories
            trendingKeywords = result.trending
            pagination.cursor = result.cursor
            pendingTimelineTarget = nil
            loadMoreFailed = false
            pagination.displayedCount = pageSize
            allArticles = Array(pagination.articles.prefix(pagination.displayedCount))
            hasMore = pagination.displayedCount < pagination.articles.count || pagination.cursor.hasMore
            pendingNewArticles.removeAll()
            if !previousIDs.isEmpty {
                recentlyAddedIDs = Set(result.latest.map(\.id)).subtracting(previousIDs)
            } else {
                recentlyAddedIDs.removeAll()
            }

            let heroURLs = featuredArticles.prefix(3)
                .compactMap { $0.imageURL.flatMap(URL.init(string:)) }
            let cardURLs = allArticles.prefix(6)
                .compactMap { $0.imageURL.flatMap(URL.init(string:)) }
            // ميزانيات الجلب المسبق تطابق ميزانيات العرض (هيرو 1400 / مصغّر
            // 260) — عدم التطابق كان يجعل نسبة إصابة الجلب المسبق صفرًا
            // فتُحمَّل كل صورة مرتين (تدقيق الأداء 2026-08-02).
            if !heroURLs.isEmpty { ImageCache.prefetch(urls: heroURLs, maxPixelSize: 1400) }
            if !cardURLs.isEmpty { ImageCache.prefetch(urls: cardURLs, maxPixelSize: 260) }
        } else if !result.featured.isEmpty {
            // لا تمسح قائمة «آخر الأخبار» إن عادت الرئيسية بلا latest.
            applyFeaturedCarousel(result.featured)
            if !result.breaking.isEmpty { breakingNews = result.breaking }
            if !result.stories.isEmpty { stories = result.stories }
            if !result.trending.isEmpty { trendingKeywords = result.trending }
        }

        guard generation == loadGeneration else {
            trendingTask?.cancel(); liveTask?.cancel(); opinionsTask?.cancel()
            return
        }
        isLoading = false
        homeTimelineRevision &+= 1

        if ignoreCache && loadsSupplementalData {
            Task { @MainActor in
                async let trendingFetch = NewsService.fetchTrendingArticles()
                async let liveFetch = NewsService.fetchLivePreview()
                async let opinionsFetch = NewsService.fetchOpinions()
                let trending = await trendingFetch
                let live = await liveFetch
                let opinionsResult = await opinionsFetch
                guard generation == loadGeneration else { return }
                trendingArticles = trending
                liveData = live
                opinions = opinionsResult
                await NewsService.clearCategoryCache()
            }
            return
        }

        if let trendingTask, let liveTask, let opinionsTask {
            trendingArticles = await trendingTask.value
            liveData = await liveTask.value
            opinions = await opinionsTask.value
        }
    }

    /// فحص صامت للأخبار الجديدة دون تعطيل القائمة الحالية أو إظهار مؤشر تحميل.
    /// يقارن أحدث الأخبار بما هو معروض، ويخزّن الجديد في `pendingNewArticles`.
    @MainActor
    func checkForNewArticles() async {
        guard !isCheckingForNew, !isLoading else { return }
        isCheckingForNew = true
        let generationAtStart = loadGeneration
        defer { isCheckingForNew = false }

        guard let result = await NewsService.fetchHomepage(ignoreCache: true) else { return }
        // سحب التحديث بدأ أثناء الفحص الصامت — لا تكتب فوق نتيجته ولا تُظهر
        // شريط "أخبار جديدة" بعد أن حدّث loadArticles القائمة فعلاً.
        guard !isLoading, generationAtStart == loadGeneration else { return }
        guard !result.latest.isEmpty || !result.featured.isEmpty else { return }

        // الكاروسيل (hero) والعاجل — يتحدّثان فوراً عند اكتشاف تغيّر، لا ينتظر
        // المستخدم إعادة تشغيل التطبيق أو سحباً يُكتب فوقه طلب إقلاع قديم.
        if !result.featured.isEmpty {
            applyFeaturedCarousel(result.featured)
        }
        if !result.breaking.isEmpty, result.breaking.map(\.id) != breakingNews.map(\.id) {
            breakingNews = result.breaking
        }

        // المعرفات المعروضة حالياً + المنتظرة (لتفادي العدّ المكرر)
        let knownIDs = Set(pagination.articles.map(\.id))
            .union(pendingNewArticles.map(\.id))

        let fresh = result.latest.filter { !knownIDs.contains($0.id) }
        guard !fresh.isEmpty else { return }
        guard !isLoading, generationAtStart == loadGeneration else { return }

        // ندمج الجديد في أعلى قائمة المنتظرين ونرتّب بالأحدث
        pendingNewArticles.insert(contentsOf: fresh, at: 0)
        pendingNewArticles.sort { $0.publishDate > $1.publishDate }
    }

    /// دمج الأخبار المنتظرة في القائمة المعروضة (عند ضغط المستخدم على الشريط).
    @MainActor
    func applyPendingArticles() {
        guard !pendingNewArticles.isEmpty else { return }

        let existingIDs = Set(pagination.articles.map(\.id))
        let toInsert = pendingNewArticles.filter { !existingIDs.contains($0.id) }

        pagination.articles.insert(contentsOf: toInsert, at: 0)
        pagination.articles.sort { $0.publishDate > $1.publishDate }

        // نوسّع نافذة العرض لتشمل الأخبار الجديدة في الأعلى
        pagination.displayedCount = min(max(pagination.displayedCount + toInsert.count, pageSize), pagination.articles.count)
        allArticles = Array(pagination.articles.prefix(pagination.displayedCount))
        hasMore = pagination.displayedCount < pagination.articles.count || pagination.cursor.hasMore

        // علّم الأخبار المُدرجة للتو حتى تظهر عليها شارة "جديد" الخضراء
        recentlyAddedIDs = Set(toInsert.map(\.id))

        pendingNewArticles.removeAll()
    }

    @MainActor
    func loadMore(excluding excludedIDs: Set<String> = []) async {
        guard pagination.hasMore(excluding: excludedIDs), !isLoading else { return }
        let visibleCount = min(pagination.displayedCount, pagination.visible(excluding: excludedIDs).count)
        let target = pendingTimelineTarget ?? (visibleCount + pageSize)
        await fillTimeline(to: target, excluding: excludedIDs)
    }

    /// Homepage blocks can exclude rows after loading (hero/ticker/opinions).
    /// Fill the initial visible quota without requiring a first "load more" tap.
    @MainActor
    func ensureHomeTimeline(excluding excludedIDs: Set<String>) async {
        guard homeTimelineRevision > 0, !isLoading, !loadMoreFailed,
              pagination.needsRemote(target: pagination.displayedCount, excluding: excludedIDs) else { return }
        await fillTimeline(to: pagination.displayedCount, excluding: excludedIDs)
    }

    func hasMoreHomeTimeline(excluding excludedIDs: Set<String>) -> Bool {
        pagination.hasMore(excluding: excludedIDs)
    }

    @MainActor
    private func fillTimeline(to target: Int, excluding excludedIDs: Set<String>) async {
        let generation = loadGeneration
        isLoading = true
        pendingTimelineTarget = target
        defer { if generation == loadGeneration { isLoading = false } }

        // A duplicate-only page is consumed in the same tap. The bound protects
        // against a faulty server that says hasMore forever; retry keeps cursor.
        var requests = 0
        while pagination.needsRemote(target: target, excluding: excludedIDs) {
            guard !Task.isCancelled else { return }
            guard requests < 20 else {
                loadMoreFailed = true
                return
            }
            requests += 1
            let cursor = pagination.cursor
            let result = await pageLoader(cursor, remotePageSize)
            guard generation == loadGeneration, !Task.isCancelled else { return }
            guard let result else {
                loadMoreFailed = true
                return
            }
            pagination.append(result.articles, hasMore: result.hasMore)
        }
        guard generation == loadGeneration, !Task.isCancelled else { return }
        pagination.displayedCount = target
        pendingTimelineTarget = nil
        loadMoreFailed = false
        allArticles = Array(pagination.articles.prefix(pagination.displayedCount))
        hasMore = pagination.hasMore(excluding: excludedIDs)
    }

    @MainActor
    func loadCategoryArticles(slug: String, page: Int = 1) async -> (articles: [Article], hasMore: Bool) {
        await NewsService.fetchCategoryArticles(slug: slug, page: page)
    }

    func articles(for category: ArticleCategory) -> [Article] {
        allArticles.filter { $0.category == category }
    }

    func articleCount(for category: ArticleCategory) -> Int {
        allArticles.filter { $0.category == category }.count
    }

    func search(query: String) -> [Article] {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
            return allArticles
        }
        let q = query.localizedLowercase
        return allArticles.filter {
            $0.title.localizedCaseInsensitiveContains(q) ||
            $0.excerpt.localizedCaseInsensitiveContains(q) ||
            $0.tags.contains { $0.localizedCaseInsensitiveContains(q) }
        }
    }

    var filteredArticles: [Article] {
        if let category = selectedCategory {
            return articles(for: category)
        }
        return allArticles
    }

    /// نحسب حصة «آخر الأخبار» بعد استبعاد الغلاف والرأي والعاجل، حتى لا
    /// تنقص الأخبار الظاهرة عن 25 مع توفرها في الدفعة المحمّلة.
    func homeTimelineArticles(excluding excludedIDs: Set<String>) -> [Article] {
        let source = selectedCategory == nil ? pagination.articles : filteredArticles
        return Array(source.filter { !excludedIDs.contains($0.id) }.prefix(pagination.displayedCount))
    }

}
