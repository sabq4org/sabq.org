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
        let wasBookmarked = bookmarkedIDs.contains(articleID)
        if wasBookmarked {
            bookmarkedIDs.remove(articleID)
            cachedArticles.removeValue(forKey: articleID)
        } else {
            bookmarkedIDs.insert(articleID)
            if let article { cachedArticles[articleID] = article }
        }
        persist()
        persistArticleCache()
        // Sync to server via the v1 Bearer-token endpoints. The old
        // call to /articles/:id/bookmark used Passport auth and
        // silently 401'd for iOS, so bookmarks never reached the DB.
        Task {
            do {
                if wasBookmarked {
                    try await APIClient.shared.deleteRaw(path: "/bookmarks/\(articleID)")
                } else {
                    try await APIClient.shared.postRaw(path: "/bookmarks/\(articleID)")
                }
            } catch {
                // Best-effort — local state is authoritative; server
                // catches up on next syncFromServer.
            }
        }
    }

    /// Merge server bookmarks into local state. Called once on login /
    /// app launch when a session is active. Server is the union source:
    /// any ID the server has that local doesn't → add locally; any ID
    /// local has that server doesn't → push to server. This two-way
    /// merge ensures a reinstall recovers old bookmarks AND preserves
    /// any that were saved while offline.
    ///
    /// Also fetches article metadata for any IDs that don't have a
    /// cached Article (e.g., after a reinstall), so the Bookmarks tab
    /// can render titles and images without waiting for the home feed
    /// to load.
    func syncFromServer() {
        Task {
            do {
                struct BookmarkArticle: Decodable {
                    let id: String
                    let title: String?
                    let slug: String?
                    let imageUrl: String?
                    let categoryName: String?
                    let publishedAt: String?
                }
                struct BookmarksResponse: Decodable {
                    let success: Bool
                    let articleIds: [String]
                    let articles: [BookmarkArticle]?
                }
                let response = try await APIClient.shared.get(
                    BookmarksResponse.self,
                    path: "/bookmarks"
                )
                let serverSet = Set(response.articleIds)
                let localSet = bookmarkedIDs

                let toAddLocally = serverSet.subtracting(localSet)
                for id in toAddLocally {
                    bookmarkedIDs.insert(id)
                }

                let toPushToServer = localSet.subtracting(serverSet)
                for id in toPushToServer {
                    try? await APIClient.shared.postRaw(path: "/bookmarks/\(id)")
                }

                if !toAddLocally.isEmpty || !toPushToServer.isEmpty {
                    persist()
                }

                // Hydrate article metadata from the response so the
                // Bookmarks tab can render titles + images even after a
                // reinstall (no local cache). The server JOIN returns
                // enough fields to build a minimal Article shell.
                var didUpdateCache = false
                for item in response.articles ?? [] {
                    if cachedArticles[item.id] == nil {
                        let dateFormatter = ISO8601DateFormatter()
                        let date = item.publishedAt.flatMap { dateFormatter.date(from: $0) } ?? Date()
                        let category = ArticleCategory.allCases.first { $0.title == item.categoryName } ?? .saudi
                        cachedArticles[item.id] = Article(
                            id: item.id,
                            title: item.title ?? "",
                            excerpt: "",
                            aiSummary: "",
                            body: "",
                            bodyHTML: "",
                            category: category,
                            author: "",
                            publishDate: date,
                            isBreaking: false,
                            isFeatured: false,
                            tags: [],
                            imageURL: item.imageUrl,
                            slug: item.slug,
                            articleURL: nil
                        )
                        didUpdateCache = true
                    }
                }
                if didUpdateCache { persistArticleCache() }
            } catch {
                // Offline or not logged in — keep local state as-is
            }
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

    /// Wipe in-memory + on-disk state. Called by the Settings "مسح البيانات
    /// المحلية" action — without this, clearing UserDefaults from outside
    /// leaves the store's `@Observable` view of bookmarks untouched until
    /// the next launch, so the bookmarks page kept showing the old list
    /// in the same session.
    func clear() {
        bookmarkedIDs.removeAll()
        cachedArticles.removeAll()
        UserDefaults.standard.removeObject(forKey: storageKey)
        UserDefaults.standard.removeObject(forKey: articleCacheKey)
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
