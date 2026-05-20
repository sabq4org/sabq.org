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
        val response = api.getArticles(
            page = page,
            limit = limit,
            section = section,
            featured = if (featuredOnly) true else null,
        )
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
    suspend fun getOpinions(page: Int = 1, limit: Int = 20): ArticlesPage {
        val response = api.getOpinions(page = page, limit = limit)
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
     *  into the standard [Article] shape. */
    suspend fun getTrending(): List<Article> =
        api.getTrending().articles.map { it.toDomain() }

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

    suspend fun getArticleBySlug(slug: String): Article =
        api.getArticleBySlug(slug).toDomain()

    /** Related articles for the bottom of the detail screen. iOS shows
     *  up to 5; we follow the same cap to keep the layout tight. */
    suspend fun getRelated(slug: String): List<Article> =
        api.getRelatedArticles(slug).articles.map { it.toDomain() }.take(5)

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
