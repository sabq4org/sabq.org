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

    private var allFetchedArticles: [Article] = []
    private var displayedCount = 0
    private var nextArticlesPage = 1
    private var hasMoreFromAPI = true
    private let pageSize = 15
    private let remotePageSize = 50

    init() {
        Task { await loadArticles() }
    }

    /// - Parameter ignoreCache: `false` للاستفادة من التخزين المؤقت لـ HTTP (تشغيل أسرع). `true` عند سحب التحديث لإجبار جلب بيانات حديثة.
    @MainActor
    func loadArticles(ignoreCache: Bool = false) async {
        isLoading = true
        errorMessage = nil

        async let homepageTask = NewsService.fetchHomepage(ignoreCache: ignoreCache)
        async let trendingTask = NewsService.fetchTrendingArticles()
        async let liveTask = NewsService.fetchLivePreview()
        async let opinionsTask = NewsService.fetchOpinions()

        let result = await homepageTask
        let trending = await trendingTask
        let live = await liveTask
        let fetchedOpinions = await opinionsTask

        if !result.latest.isEmpty || !result.featured.isEmpty {
            await NewsService.clearCategoryCache()
            allFetchedArticles = result.latest
            featuredArticles = result.featured
            breakingNews = result.breaking
            stories = result.stories
            trendingKeywords = result.trending
            trendingArticles = trending
            opinions = fetchedOpinions
            liveData = live
            nextArticlesPage = 1
            hasMoreFromAPI = true
            displayedCount = min(pageSize, allFetchedArticles.count)
            allArticles = Array(allFetchedArticles.prefix(displayedCount))
            hasMore = displayedCount < allFetchedArticles.count || hasMoreFromAPI
        }
        isLoading = false
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
