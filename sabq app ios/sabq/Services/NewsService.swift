import Foundation

enum NewsService {
    // MARK: - API Calls

    private static func nonOpinionArticles(from apiArticles: [APIArticle]) -> [Article] {
        apiArticles
            .filter { !$0.isOpinionContent }
            .map(Article.from)
    }

    private static func opinionArticles(from apiArticles: [APIArticle]) -> [OpinionArticle] {
        apiArticles
            .filter(\.isOpinionContent)
            .map(OpinionArticle.from)
    }

    /// `nil` يعني فشل المسارين معًا (الرئيسية والاحتياطي) — شبكة/خادم لا
    /// «محتوى فارغ»؛ يميّزه المخزن ليعرض حالة خطأ قابلة لإعادة المحاولة
    /// بدل skeleton أبدي صامت.
    static func fetchHomepage(ignoreCache: Bool = false) async -> (
        featured: [Article],
        latest: [Article],
        breaking: [Article],
        stories: [APIStory],
        trending: [String]
    )? {
        do {
            let response: APIHomepageResponse
            let paginatedArticles: [Article]

            if ignoreCache {
                async let homeTask = APIClient.shared.fetchHomepage(ignoreCache: true)
                async let paginatedTask = APIClient.shared.fetchPaginatedNews(page: 1, ignoreCache: true)
                response = try await homeTask
                let paginated = try? await paginatedTask
                paginatedArticles = nonOpinionArticles(from: paginated?.items ?? [])
            } else {
                async let homeTask = APIClient.shared.fetchHomepage()
                async let paginatedTask = APIClient.shared.fetchPaginatedNews(page: 1)
                response = try await homeTask
                let paginated = try? await paginatedTask
                paginatedArticles = nonOpinionArticles(from: paginated?.items ?? [])
            }

            let hero = nonOpinionArticles(from: response.hero)
            let forYou = nonOpinionArticles(from: response.forYou)
            let editorPicks = nonOpinionArticles(from: response.editorPicks)
            let trendingTopics = response.trending.map(\.topic).filter { !$0.isEmpty }
            let stories = response.stories ?? []

            let featured = hero.isEmpty ? editorPicks : hero

            let cutoff = Date().addingTimeInterval(-3 * 24 * 3600)
            var latestIDs = Set<String>()
            var latest = [Article]()

            let allSources = paginatedArticles + forYou + editorPicks + hero
            for art in allSources.sorted(by: { $0.publishDate > $1.publishDate }) {
                guard latestIDs.insert(art.id).inserted else { continue }
                if art.publishDate > cutoff || latest.count < 5 {
                    latest.append(art)
                }
            }

            let recentBreaking = nonOpinionArticles(from: response.breaking).filter {
                $0.isBreaking
            }.sorted { $0.publishDate > $1.publishDate }

            return (featured, latest, recentBreaking, stories, trendingTopics)
        } catch {
            do {
                let articles = try await APIClient.shared.fetchArticles(page: 1, perPage: 30)
                let all = nonOpinionArticles(from: articles.items)
                    .sorted { $0.publishDate > $1.publishDate }
                let featured = all.filter(\.isFeatured)
                let breaking = all.filter(\.isBreaking)
                return (featured.isEmpty ? Array(all.prefix(3)) : featured, all, breaking, [], [])
            } catch {
                return nil
            }
        }
    }

    static func fetchArticles(page: Int = 1, perPage: Int = 50) async -> (articles: [Article], hasMore: Bool) {
        do {
            let result = try await APIClient.shared.fetchArticles(page: page, perPage: perPage)
            let all = nonOpinionArticles(from: result.items)
                .sorted { $0.publishDate > $1.publishDate }
            return (all, result.hasMore)
        } catch {
            return ([], false)
        }
    }

    static func fetchFeatured() async -> [Article] {
        do {
            let apiArticles = try await APIClient.shared.fetchFeatured()
            return nonOpinionArticles(from: apiArticles)
        } catch {
            return []
        }
    }

    private static let categoryCacheActor = CategoryCacheActor()

    static func clearCategoryCache() async {
        await categoryCacheActor.removeAll()
    }

    static func fetchCategoryArticles(slug: String, page: Int = 1, perPage: Int = 50) async -> (articles: [Article], hasMore: Bool) {
        if let cached = await categoryCacheActor.get(slug: slug, page: page) {
            return cached
        }

        do {
            let result = try await APIClient.shared.fetchCategoryArticles(slug: slug, page: page, perPage: perPage)
            let articles = nonOpinionArticles(from: result.items)
                .sorted { $0.publishDate > $1.publishDate }

            await categoryCacheActor.set(slug: slug, page: page, value: (articles: articles, hasMore: result.hasMore))

            return (articles, result.hasMore)
        } catch {
            // فشل الشبكة: نسخة قديمة (حتى المنتهية صلاحيتها) أفضل من قائمة فارغة.
            if let cached = await categoryCacheActor.getStale(slug: slug, page: page) {
                return cached
            }
            return ([], false)
        }
    }

    static func fetchCategories() async -> [APICategory] {
        (try? await APIClient.shared.fetchCategories()) ?? []
    }

    static func fetchBreakingTicker() async -> [APIBreakingHeadline] {
        ((try? await APIClient.shared.fetchBreakingTicker()) ?? nil)?.headlines ?? []
    }

    static func fetchArticleDetail(slug: String) async -> (article: Article, related: [Article])? {
        guard let api = try? await APIClient.shared.fetchArticle(slug: slug) else { return nil }
        guard !api.isOpinionContent else { return nil }
        var main = Article.from(api)
        if main.tags.isEmpty {
            let seoKeywords = await APIClient.shared.fetchSEOKeywords(slug: slug)
            if !seoKeywords.isEmpty {
                main.tags = seoKeywords
            }
        }
        let related = nonOpinionArticles(from: api.relatedArticles ?? []).filter { $0.id != main.id }
        return (main, related)
    }

    static func fetchRelated(slug: String) async -> [Article] {
        nonOpinionArticles(from: (try? await APIClient.shared.fetchRelated(slug: slug)) ?? [])
    }

    static func fetchComments(slug: String) async -> [APIComment] {
        (try? await APIClient.shared.fetchComments(slug: slug)) ?? []
    }

    static func search(query: String, page: Int = 1) async -> (articles: [Article], total: Int) {
        do {
            let result = try await APIClient.shared.search(query: query, page: page)
            let articles = nonOpinionArticles(from: result.articles)
            return (articles, result.total ?? articles.count)
        } catch {
            return ([], 0)
        }
    }

    static func fetchSearchSuggestions(query: String) async -> [String] {
        (try? await APIClient.shared.searchSuggestions(query: query)) ?? []
    }

    static func fetchTrending() async -> [String] {
        do {
            let response = try await APIClient.shared.fetchHomepage()
            let topics = response.trending.map(\.topic).filter { !$0.isEmpty }
            if !topics.isEmpty { return topics }
            let keywords = try await APIClient.shared.fetchTrendingKeywords()
            return keywords.isEmpty ? fallbackTrending : keywords
        } catch {
            return fallbackTrending
        }
    }

    private static let fallbackTrending = ["رؤية 2030", "نيوم", "الهلال", "أرامكو", "موسم الرياض", "كأس العالم"]

    static func fetchLivePreview() async -> APILiveResponse? {
        try? await APIClient.shared.fetchLive(limit: 3)
    }

    static func fetchTrendingArticles() async -> [Article] {
        do {
            let response = try await APIClient.shared.fetchTrendingPage()
            return nonOpinionArticles(from: response.articles)
        } catch {
            return []
        }
    }

    static func fetchStories() async -> [APIStory] {
        (try? await APIClient.shared.fetchStories()) ?? []
    }

    static func fetchOpinions(sort: String? = nil) async -> [OpinionArticle] {
        let publicOpinions = await fetchPrimaryOpinions(sort: sort)
        if !publicOpinions.isEmpty {
            return deduplicatedOpinions(publicOpinions)
        }

        // Fallback chains below only apply when the primary `/api/opinion`
        // endpoint returns empty — they don't honour `sort` since the
        // dashboard + paginated endpoints don't expose that knob. Acceptable
        // because the homepage feed sort matters far less than the fact that
        // *something* renders.
        let dashboardOpinions = ((try? await APIClient.shared.fetchDashboardOpinions()) ?? [])
            .map(OpinionArticle.from)
        if !dashboardOpinions.isEmpty {
            return deduplicatedOpinions(dashboardOpinions)
        }

        async let articlesTask = try? APIClient.shared.fetchArticles(page: 1, perPage: 100)
        async let paginatedTask = try? APIClient.shared.fetchPaginatedNews(page: 1)

        let articleOpinions = opinionArticles(from: (await articlesTask)?.items ?? [])
        let paginatedOpinions = opinionArticles(from: (await paginatedTask)?.items ?? [])

        return deduplicatedOpinions(articleOpinions + paginatedOpinions)
    }

    /// مقالات رأي من تصنيف الخبر نفسه — بلوك «مقالات قد تهمك» في صفحة الخبر
    /// (نقل الويب #1609/#1624). الفشل يعيد قائمة فارغة فيختفي البلوك كما في الويب.
    static func fetchRelatedOpinions(categoryId: String, excludeId: String?, limit: Int = 5) async -> [OpinionArticle] {
        let opinions = (try? await APIClient.shared.fetchRelatedOpinions(categoryId: categoryId, excludeId: excludeId, limit: limit)) ?? []
        return deduplicatedOpinions(opinions.map(OpinionArticle.from))
    }

    static func fetchOpinionDetail(slug: String) async -> OpinionArticle? {
        guard let opinion = try? await APIClient.shared.fetchOpinion(slug: slug) else { return nil }
        return OpinionArticle.from(opinion)
    }

    static func fetchOpinionDetail(_ opinion: OpinionArticle) async -> OpinionArticle? {
        if let slug = opinion.slug,
           let fetched = await fetchOpinionDetail(slug: slug) {
            return fetched
        }

        if let fetched = try? await APIClient.shared.fetchDashboardOpinion(id: opinion.id) {
            return OpinionArticle.from(fetched)
        }

        if let slug = opinion.slug,
           let article = try? await APIClient.shared.fetchArticle(slug: slug),
           article.isOpinionContent {
            return OpinionArticle.from(article)
        }

        return nil
    }

    private static func deduplicatedOpinions(_ opinions: [OpinionArticle]) -> [OpinionArticle] {
        // Preserves the backend's ordering — important for `sort=trending`,
        // which returns articles ranked by the 48h engagement score. The
        // previous version re-sorted by publishDate DESC after dedup, which
        // silently flipped every trending response back into a chronological
        // "newest-first" list (this was the bug behind "ترند المقالات يعرض
        // الأحدث فالأحدث" — backend was correct, iOS was clobbering it).
        var seen = Set<String>()
        return opinions.filter { opinion in
            let key = opinion.slug ?? opinion.id
            return seen.insert(key).inserted
        }
    }

    private static func fetchPrimaryOpinions(sort: String? = nil) async -> [OpinionArticle] {
        ((try? await APIClient.shared.fetchOpinions(page: 1, limit: 30, sort: sort)) ?? [])
            .map(OpinionArticle.from)
    }

    static func fetchNotifications() async -> [APINotification] {
        (try? await APIClient.shared.fetchNotifications()) ?? []
    }

    static func fetchShortlink(articleId: String) async -> String? {
        try? await APIClient.shared.fetchShortlink(articleId: articleId)
    }

}

// MARK: - Thread-safe Category Cache

private actor CategoryCacheActor {
    private struct EntryValue {
        let articles: [Article]
        let hasMore: Bool
        let storedAt: Date
    }

    /// كان الكاش بلا انتهاء ولا سقف: تصنيف فُتح قبل ساعة يظل يقدّم مواده
    /// القديمة حتى يسحب المستخدم تحديث الرئيسية (وهي التي تمسحه)، وتصفّح
    /// أقسام كثيرة ينمّيه بلا حدّ. صلاحية 5 دقائق + سقف صفحات مع طرد
    /// الأقدم يبقيان التنقل فوريًّا دون تقادم أو انتفاخ.
    private static let ttl: TimeInterval = 5 * 60
    private static let maxEntries = 40

    private var cache: [String: [Int: EntryValue]] = [:]
    /// ترتيب الاستخدام (مفاتيح "slug#page") — للطرد الأقدم أولًا.
    private var order: [String] = []

    private func key(_ slug: String, _ page: Int) -> String { "\(slug)#\(page)" }

    func get(slug: String, page: Int) -> (articles: [Article], hasMore: Bool)? {
        guard let entry = cache[slug]?[page] else { return nil }
        guard Date().timeIntervalSince(entry.storedAt) < Self.ttl else {
            cache[slug]?[page] = nil
            order.removeAll { $0 == key(slug, page) }
            return nil
        }
        return (entry.articles, entry.hasMore)
    }

    /// نسخة تتجاهل الصلاحية — احتياطي «الأفضل من لا شيء» عند فشل الشبكة.
    func getStale(slug: String, page: Int) -> (articles: [Article], hasMore: Bool)? {
        cache[slug]?[page].map { ($0.articles, $0.hasMore) }
    }

    func set(slug: String, page: Int, value: (articles: [Article], hasMore: Bool)) {
        var slugCache = cache[slug] ?? [:]
        slugCache[page] = EntryValue(articles: value.articles, hasMore: value.hasMore, storedAt: Date())
        cache[slug] = slugCache

        let k = key(slug, page)
        order.removeAll { $0 == k }
        order.append(k)
        while order.count > Self.maxEntries {
            let evicted = order.removeFirst()
            let parts = evicted.split(separator: "#")
            guard parts.count == 2, let page = Int(parts[1]) else { continue }
            cache[String(parts[0])]?[page] = nil
        }
    }

    func removeAll() {
        cache.removeAll()
        order.removeAll()
    }
}
