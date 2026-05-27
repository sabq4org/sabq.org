package com.sabq.smart.data

import com.sabq.smart.data.api.SabqApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Single point of access to article data for the UI layer. Wraps the
 * Retrofit [SabqApi] and maps API DTOs to domain [Article].
 *
 * iOS counterpart: ArticlesStore (Stores/ArticlesStore.swift).
 */
@Singleton
class ArticleRepository @Inject constructor(
    private val api: SabqApi,
) {
    /**
     * Paginated articles list. `page` is 1-indexed. Optional `section`
     * filters by backend slug ("saudi", "sports", "business"...). When
     * `featured = true`, returns only featured-flagged articles.
     */
    suspend fun getArticles(
        page: Int = 1,
        limit: Int = 20,
        section: String? = null,
        featuredOnly: Boolean = false,
    ): ArticlesPage {
        val offset = (page - 1) * limit
        val response = api.getArticles(
            offset = offset,
            limit = limit,
            section = section,
            featured = if (featuredOnly) true else null,
        )
        response.articles.forEach { 
            android.util.Log.d("ArticleRepoList", "id=${it.id}, title=${it.title}, imageUrl=${it.imageUrl}") 
        }
        return ArticlesPage(
            items = response.articles.map { it.toDomain() },
            total = response.total ?: 0,
            page = page,
            limit = limit,
            hasMore = response.hasMore ?: (response.articles.size >= limit),
        )
    }

    /** Opinion articles list — uses the separate `/api/opinion`
     *  endpoint, NOT the same `/articles` feed. Result rows already
     *  carry `articleType = "opinion"` so `Article.isOpinion`
     *  returns true. */
    /** Trending search keywords for the Explore screen. Returns plain
     *  strings (drops the count/category metadata the backend ships). */
    suspend fun getTrendingKeywords(): List<String> =
        api.getTrendingKeywords().mapNotNull { it.keyword.takeIf { kw -> kw.isNotBlank() } }

    suspend fun getOpinions(page: Int = 1, limit: Int = 20, sort: String? = null): ArticlesPage {
        val response = api.getOpinions(page = page, limit = limit, sort = sort)
        return ArticlesPage(
            items = response.articles.map { it.toDomain() },
            total = response.total ?: 0,
            page = page,
            limit = limit,
            hasMore = response.hasMore ?: (response.articles.size >= limit),
        )
    }

    /** Breaking-news ticker. iOS surfaces the first row as the single
     *  "عاجل" pill on Home. */
    suspend fun getBreaking(): List<Article> {
        val resp = api.getBreaking()
        return resp.items.map { headline ->
            Article(
                id = headline.id,
                title = headline.title,
                excerpt = "",
                category = ArticleCategory.Local,
                imageUrl = null,
                focalPoint = null,
                readingTime = "",
                dateFormatted = "",
                isBreaking = true,
                isFeatured = false,
                slug = headline.slug,
            )
        }
    }

    /** Trending articles list. Maps the `/api/v1/trending` response
     *  into the standard [Article] shape. Convenience wrapper around
     *  [getTrendingPage] for the Home top-3 preview which doesn't need
     *  the tags payload. */
    suspend fun getTrending(): List<Article> = getTrendingPage().articles

    /** Trending page payload — `[Article]` + trending keyword tags.
     *  Powers the dedicated `TrendingScreen` (B1) which surfaces both
     *  the ranked article list and a tag rail. */
    suspend fun getTrendingPage(): TrendingPage {
        val response = api.getTrending()
        return TrendingPage(
            articles = response.articles.map { it.toDomain() },
            tags = response.tags.map { it.trim() }.filter { it.isNotEmpty() },
        )
    }

    suspend fun getSections(): List<Section> {
        return api.getSections().sections.map { c ->
            Section(
                id = c.id,
                name = c.name,
                nameEn = c.nameEn,
                slug = c.slug ?: c.id,
                articlesCount = c.articlesCount ?: 0,
                displayOrder = c.displayOrder ?: Int.MAX_VALUE,
            )
        }.sortedBy { it.displayOrder }
    }

    suspend fun getArticleBySlug(slug: String): Article {
        val apiArticle = api.getArticleBySlug(slug)
        android.util.Log.d("ArticleRepo", "API Article ID: ${apiArticle.id}")
        android.util.Log.d("ArticleRepo", "API Article Title: ${apiArticle.title}")
        android.util.Log.d("ArticleRepo", "API Article Slug: ${apiArticle.slug}")
        android.util.Log.d("ArticleRepo", "API Article ImageUrl: ${apiArticle.imageUrl}")
        android.util.Log.d("ArticleRepo", "API Article ImageFocalPoint: ${apiArticle.imageFocalPoint}")
        val domainArticle = apiArticle.toDomain()
        android.util.Log.d("ArticleRepo", "Domain Article mapped: imageUrl=${domainArticle.imageUrl}")
        return domainArticle
    }

    /** Related articles for the bottom of the detail screen. iOS shows
     *  up to 5; we follow the same cap to keep the layout tight. */
    suspend fun getRelated(slug: String): List<Article> =
        api.getRelatedArticles(slug).map { it.toDomain() }.take(5)

    suspend fun getArticlesByKeyword(keyword: String): List<Article> =
        api.getArticlesByKeyword(keyword).map { it.toDomain() }

    suspend fun getAuthorPage(name: String, page: Int = 1, limit: Int = 20): AuthorPage =
        api.getAuthorPage(name, page, limit).toDomain()

    /** Full-text search over the article corpus. */
    suspend fun search(query: String, page: Int = 1): SearchResult {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return SearchResult.empty(trimmed)
        val response = api.search(query = trimmed, page = page)
        return SearchResult(
            query = response.query.ifEmpty { trimmed },
            items = response.articles.map { it.toDomain() },
            total = response.total ?: 0,
            hasMore = response.hasMore ?: false,
        )
    }
}

data class SearchResult(
    val query: String,
    val items: List<Article>,
    val total: Int,
    val hasMore: Boolean,
) {
    companion object {
        fun empty(query: String) = SearchResult(query, emptyList(), 0, false)
    }
}

data class ArticlesPage(
    val items: List<Article>,
    val total: Int,
    val page: Int,
    val limit: Int,
    val hasMore: Boolean,
)

/** Trending page payload — ranked articles plus a list of trending tag
 *  strings. Tags are already trimmed + non-empty in [getTrendingPage]. */
data class TrendingPage(
    val articles: List<Article>,
    val tags: List<String>,
)
