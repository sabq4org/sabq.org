import SwiftUI

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

    private var allFetchedArticles: [Article] = []
    private var displayedCount = 0
    private var nextArticlesPage = 1
    private var hasMoreFromAPI = true
    private let pageSize = 15
    private let remotePageSize = 50
    /// يزداد مع كل استدعاء `loadArticles` — الطلبات المتداخلة (إقلاع +
    /// سحب تحديث) لا تُطبّق نتيجتها إلا إذا كانت الأحدث، وإلا يكتب الطلب
    /// الكاشي البطيء فوق استجابة السحب الطازجة (الكاروسيل لا يتحدّث إلا بعد
    /// إعادة تشغيل التطبيق).
    private var loadGeneration: UInt = 0
    /// يتغيّر عند تغيّر قائمة الكاروسيل — يُجبر TabView على إعادة البناء.
    private(set) var featuredCarouselRevision: UInt = 0

    // لا آثار جانبية في init (انظر التعليق المقابل في AuthStore):
    // ContentView.task يستدعي loadArticles مرة واحدة لكل هوية واجهة.

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
        async let homepageTask = NewsService.fetchHomepage(ignoreCache: ignoreCache)
        let trendingTask = ignoreCache ? nil : Task { await NewsService.fetchTrendingArticles() }
        let liveTask = ignoreCache ? nil : Task { await NewsService.fetchLivePreview() }
        let opinionsTask = ignoreCache ? nil : Task { await NewsService.fetchOpinions() }

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

        if !result.latest.isEmpty {
            allFetchedArticles = result.latest
            applyFeaturedCarousel(result.featured)
            breakingNews = result.breaking
            stories = result.stories
            trendingKeywords = result.trending
            nextArticlesPage = 1
            hasMoreFromAPI = true
            displayedCount = min(pageSize, allFetchedArticles.count)
            allArticles = Array(allFetchedArticles.prefix(displayedCount))
            hasMore = displayedCount < allFetchedArticles.count || hasMoreFromAPI
            pendingNewArticles.removeAll()
            recentlyAddedIDs.removeAll()

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

        if ignoreCache {
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
        let knownIDs = Set(allFetchedArticles.map(\.id))
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

        let existingIDs = Set(allFetchedArticles.map(\.id))
        let toInsert = pendingNewArticles.filter { !existingIDs.contains($0.id) }

        allFetchedArticles.insert(contentsOf: toInsert, at: 0)
        allFetchedArticles.sort { $0.publishDate > $1.publishDate }

        // نوسّع نافذة العرض لتشمل الأخبار الجديدة في الأعلى
        displayedCount = min(max(displayedCount + toInsert.count, pageSize), allFetchedArticles.count)
        allArticles = Array(allFetchedArticles.prefix(displayedCount))
        hasMore = displayedCount < allFetchedArticles.count || hasMoreFromAPI

        // علّم الأخبار المُدرجة للتو حتى تظهر عليها شارة "جديد" الخضراء
        recentlyAddedIDs = Set(toInsert.map(\.id))

        pendingNewArticles.removeAll()
    }

    @MainActor
    func loadMore() async {
        guard hasMore, !isLoading else { return }
        isLoading = true

        if displayedCount < allFetchedArticles.count {
            let end = min(displayedCount + pageSize, allFetchedArticles.count)
            displayedCount = end
            allArticles = Array(allFetchedArticles.prefix(displayedCount))
            hasMore = displayedCount < allFetchedArticles.count || hasMoreFromAPI
        } else if hasMoreFromAPI {
            let page = nextArticlesPage
            let result = await NewsService.fetchArticles(page: page, perPage: remotePageSize)
            nextArticlesPage += 1
            hasMoreFromAPI = result.hasMore
            let existingIDs = Set(allFetchedArticles.map(\.id))
            let newArticles = result.articles.filter { !existingIDs.contains($0.id) }
            if !newArticles.isEmpty {
                allFetchedArticles.append(contentsOf: newArticles)
                allFetchedArticles.sort { $0.publishDate > $1.publishDate }
            }
            if displayedCount < allFetchedArticles.count {
                let end = min(displayedCount + pageSize, allFetchedArticles.count)
                displayedCount = end
                allArticles = Array(allFetchedArticles.prefix(displayedCount))
            }
            hasMore = displayedCount < allFetchedArticles.count || hasMoreFromAPI
        } else {
            hasMore = false
        }

        isLoading = false
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

}
