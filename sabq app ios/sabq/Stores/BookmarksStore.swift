import SwiftUI

@Observable
final class BookmarksStore {
    private(set) var bookmarkedIDs: Set<String> = []
    private(set) var cachedArticles: [String: Article] = [:]

    private let storageKey = "sabq_bookmarks_v1"
    private let articleCacheKey = "sabq_bookmarks_articles_v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode(Set<String>.self, from: data) {
            bookmarkedIDs = decoded
        }
        if let data = UserDefaults.standard.data(forKey: articleCacheKey),
           let decoded = try? JSONDecoder().decode([CachedArticle].self, from: data) {
            for cached in decoded {
                cachedArticles[cached.id] = cached.toArticle()
            }
        }
    }

    func isBookmarked(_ articleID: String) -> Bool {
        bookmarkedIDs.contains(articleID)
    }

    func toggle(_ articleID: String, article: Article? = nil) {
        if bookmarkedIDs.contains(articleID) {
            bookmarkedIDs.remove(articleID)
            cachedArticles.removeValue(forKey: articleID)
        } else {
            bookmarkedIDs.insert(articleID)
            if let article { cachedArticles[articleID] = article }
        }
        persist()
        persistArticleCache()
        Task {
            try? await APIClient.shared.bookmarkArticle(articleId: articleID)
        }
    }

    func cacheArticle(_ article: Article) {
        cachedArticles[article.id] = article
        persistArticleCache()
    }

    func bookmarkedArticles(from allArticles: [Article]) -> [Article] {
        let articlesById = Dictionary(allArticles.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var result: [Article] = []
        var didUpdateCache = false
        for id in bookmarkedIDs {
            if let article = articlesById[id] {
                result.append(article)
                if cachedArticles[id]?.title != article.title {
                    cachedArticles[id] = article
                    didUpdateCache = true
                }
            } else if let cached = cachedArticles[id] {
                result.append(cached)
            }
        }
        if didUpdateCache { persistArticleCache() }
        return result.sorted { $0.publishDate > $1.publishDate }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(bookmarkedIDs) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }

    private func persistArticleCache() {
        let toCache = bookmarkedIDs.compactMap { id -> CachedArticle? in
            guard let article = cachedArticles[id] else { return nil }
            return CachedArticle(from: article)
        }
        if let data = try? JSONEncoder().encode(toCache) {
            UserDefaults.standard.set(data, forKey: articleCacheKey)
        }
    }
}

private struct CachedArticle: Codable {
    let id: String
    let title: String
    let excerpt: String
    let body: String
    let categoryRaw: String
    let author: String
    let publishDate: Date
    let isBreaking: Bool
    let isFeatured: Bool
    let tags: [String]
    let imageURL: String?
    let slug: String?
    let articleURL: String?

    init(from article: Article) {
        id = article.id
        title = article.title
        excerpt = article.excerpt
        body = article.body
        categoryRaw = article.category.rawValue
        author = article.author
        publishDate = article.publishDate
        isBreaking = article.isBreaking
        isFeatured = article.isFeatured
        tags = article.tags
        imageURL = article.imageURL
        slug = article.slug
        articleURL = article.articleURL
    }

    func toArticle() -> Article {
        Article(
            id: id,
            title: title,
            excerpt: excerpt,
            // Bookmarks predate the dedicated aiSummary field; we'd have to
            // migrate the persisted store to keep it. The article detail
            // refetches the full article anyway, so leaving it empty just
            // means the smart-summary card falls back to `excerpt` for the
            // brief moment between opening a bookmark and the fetch landing.
            aiSummary: "",
            body: body,
            // Bookmarks store only the stripped body; the rich HTML is
            // re-fetched from the API when the article is opened.
            bodyHTML: "",
            category: ArticleCategory(rawValue: categoryRaw) ?? .saudi,
            author: author,
            publishDate: publishDate,
            isBreaking: isBreaking,
            isFeatured: isFeatured,
            tags: tags,
            imageURL: imageURL,
            slug: slug,
            articleURL: articleURL
        )
    }
}
