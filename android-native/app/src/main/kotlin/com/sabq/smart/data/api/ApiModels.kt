package com.sabq.smart.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames

/**
 * Kotlinx-serializable shapes for the `api/v1` (Bearer) and the public
 * `api` namespaces on `https://sabq.org`. The Sabq backend is forgiving
 * — fields drift between snake_case + camelCase and between nested +
 * flat shapes. [JsonNames] gives us the same tolerance the iOS
 * `APIArticle` decoder has (FlexKey custom decoder, see
 * Services/APIModels.swift line 90).
 *
 * Decoding requires `Json { ignoreUnknownKeys = true; useAlternativeNames = true }`.
 */

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiPaginatedList<T>(
    val items: List<T> = emptyList(),
    val total: Int? = null,
    val page: Int? = null,
    @JsonNames("perPage", "per_page", "limit")
    val perPage: Int? = null,
    @JsonNames("hasMore", "has_more")
    val hasMore: Boolean? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiWrappedArray<T>(
    val items: List<T> = emptyList(),
)

/**
 * Response shape for `GET /api/v1/articles`. Differs from
 * [ApiPaginatedList] in that the items field is named `articles`, not
 * `items`. Verified against live production response 2026-05-19.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiArticlesResponse(
    val articles: List<ApiArticle> = emptyList(),
    val total: Int? = null,
    val limit: Int? = null,
    val offset: Int? = null,
    @JsonNames("hasMore", "has_more")
    val hasMore: Boolean? = null,
)

/**
 * Response shape for `GET /api/v1/trending`. Mirrors iOS
 * `APITrendingPageResponse` (`Services/APIModels.swift:1379-1392`) —
 * both `articles`/`data` and `tags`/`keywords` aliases are accepted
 * because backend revs have shipped each spelling at different times.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiTrendingPageResponse(
    @JsonNames("articles", "data")
    val articles: List<ApiArticle> = emptyList(),
    @JsonNames("tags", "keywords")
    val tags: List<String> = emptyList(),
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiArticle(
    /** ID can come back as int or string from the legacy DB; we always
     *  declare String here. If the backend ships an int, a custom
     *  [com.sabq.smart.data.api.LenientStringSerializer] is wired in
     *  Json config to coerce it. */
    val id: String = "",
    val title: String = "",
    val excerpt: String? = null,
    @JsonNames("content", "body", "full_text", "fullText")
    val body: String? = null,

    @JsonNames("ai_summary", "aiSummary")
    val aiSummary: String? = null,
    val summary: String? = null,
    val subtitle: String? = null,

    val slug: String? = null,
    @JsonNames("english_slug", "englishSlug")
    val englishSlug: String? = null,

    @JsonNames("category_name", "section")
    val categoryName: String? = null,
    @JsonNames("category_slug", "section_slug")
    val categorySlug: String? = null,
    val category: ApiCategoryNested? = null,

    // Two shapes coexist for the author field:
    //   - List endpoint ships `"author": "صحيفة سبق"` (plain string)
    //   - Detail endpoint ships `"author": { id, firstName, lastName }`
    // We accept the raw JsonElement here and resolve to a display
    // string in the mapper, exactly the way iOS's APIArticle decoder
    // does at Services/APIModels.swift line 129-139.
    @JsonNames("author_name")
    val authorName: String? = null,
    val author: kotlinx.serialization.json.JsonElement? = null,

    @JsonNames("published_at", "publishedAt", "createdAt", "created_at")
    val publishedAt: String? = null,

    @JsonNames("article_type", "articleType")
    val articleType: String? = null,
    @JsonNames("news_type", "newsType", "type")
    val newsType: String? = null,

    @JsonNames("is_featured", "isFeatured", "featured")
    val isFeatured: Boolean? = null,
    @JsonNames("is_breaking", "isBreaking")
    val isBreaking: Boolean? = null,

    @JsonNames("image_url", "imageUrl", "image")
    val imageUrl: String? = null,

    @JsonNames("thumbnail_url", "thumbnailUrl")
    val thumbnailUrl: String? = null,

    @JsonNames("image_focal_point", "imageFocalPoint", "focal_point", "focalPoint")
    val imageFocalPoint: ApiFocalPoint? = null,

    @JsonNames("is_ai_generated_image", "isAiGeneratedImage")
    val isAiGeneratedImage: Boolean? = null,
    @JsonNames("ai_image_model", "aiImageModel")
    val aiImageModel: String? = null,

    /** Opinion-author gender ("male" / "female" / arabic). Drives
     *  the byline label "الكاتب" / "الكاتبة" / "بقلم". Often null
     *  on the regular `/articles` endpoint; comes through on the
     *  `/api/opinion` route. */
    @JsonNames("author_gender", "authorGender")
    val authorGender: String? = null,

    @JsonNames("views", "views_count")
    val viewsCount: Int? = null,
    @JsonNames("comments_count")
    val commentsCount: Int? = null,

    /** Server-computed reading time (whole minutes). */
    @JsonNames("reading_minutes", "readingMinutes")
    val readingMinutes: Int? = null,
    @JsonNames("section_id", "sectionId")
    val sectionId: String? = null,

    /** TipTap-stored tag/keyword list. Backend ships either a string
     *  array OR a list of `{ name }` objects depending on the route; we
     *  accept the array form here and parse the object form in the
     *  domain mapper. */
    @JsonNames("tags", "keywords")
    val tags: kotlinx.serialization.json.JsonElement? = null,

    /** Canonical public article URL — used by the iOS share sheet
     *  fallback. Backend ships it under `article_url` or `articleUrl`
     *  depending on the route. */
    @JsonNames("article_url", "articleUrl", "url", "canonical_url", "canonicalUrl")
    val articleUrl: String? = null,

    val seo: ApiSeo? = null,

    /**
     * Editorial "صور الأسبوع" pack. Backend nests under
     * `weeklyPhotosData.photos` (or the snake-case variant). Present
     * only when `articleType == "weekly_photos"`. Mirrors iOS
     * `APIArticle.weeklyPhotos` decoder at `Services/APIModels.swift:213`.
     */
    @JsonNames("weeklyPhotosData", "weekly_photos_data")
    val weeklyPhotosContainer: ApiWeeklyPhotosContainer? = null,

    @JsonNames("albumImages", "album_images")
    val albumImages: List<String>? = null,
)

@Serializable
data class ApiWeeklyPhotosContainer(
    val photos: List<ApiWeeklyPhoto> = emptyList(),
)

/**
 * One photo inside a `weekly_photos` article — image + Arabic caption +
 * photographer/source credit. Permissive defaults so a missing
 * caption / credit still yields a renderable row. Mirrors iOS
 * `APIWeeklyPhoto` decoder.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiWeeklyPhoto(
    @JsonNames("imageUrl", "image_url", "image")
    val imageUrl: String = "",
    val caption: String = "",
    val credit: String = "",
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiSeo(
    @JsonNames("keywords", "tags")
    val keywords: kotlinx.serialization.json.JsonElement? = null,
)

@Serializable
data class ApiAuthor(
    @SerialName("firstName") val firstName: String? = null,
    @SerialName("lastName") val lastName: String? = null,
    val name: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiCategoryNested(
    @JsonNames("nameAr", "name")
    val name: String? = null,
    val slug: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiCategory(
    val id: String = "",
    @JsonNames("nameAr", "name")
    val name: String = "",
    @JsonNames("name_en", "nameEn")
    val nameEn: String? = null,
    val slug: String? = null,
    val description: String? = null,
    @JsonNames("articles_count", "count")
    val articlesCount: Int? = null,
    val icon: String? = null,
    val color: String? = null,
    @JsonNames("display_order", "displayOrder")
    val displayOrder: Int? = null,
)

@Serializable
data class ApiSectionsResponse(
    val sections: List<ApiCategory> = emptyList(),
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiSearchResponse(
    val query: String = "",
    val articles: List<ApiArticle> = emptyList(),
    val total: Int? = null,
    @JsonNames("hasMore", "has_more")
    val hasMore: Boolean? = null,
)

/**
 * Focal point can ship as a `{x, y}` object with either 0–1 or 0–100
 * numeric encoding. We accept both as Float and normalise downstream
 * via [com.sabq.smart.ui.components.ImageFocalPoint.normalised].
 */
@Serializable
data class ApiFocalPoint(
    val x: Float? = null,
    val y: Float? = null,
)

@Serializable
data class ApiBreakingTicker(
    val items: List<ApiBreakingHeadline> = emptyList(),
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiBreakingHeadline(
    val id: String = "",
    val title: String = "",
    val slug: String? = null,
    @JsonNames("published_at", "publishedAt")
    val publishedAt: String? = null,
)

/** Single entry from `GET /api/trending-keywords`. */
@Serializable
data class ApiTrendingKeyword(
    val keyword: String = "",
    val count: Int = 0,
    val category: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiArticleReactionResponse(
    val liked: Boolean,
    @JsonNames("likesCount", "likes_count")
    val likesCount: Int,
)

@Serializable
data class ApiBehaviorEventRequest(
    val articleId: String,
    val eventType: String,
    val dwellSeconds: Int? = null,
    val scrollDepth: Int? = null,
    val completionRate: Int? = null,
    val platform: String = "android",
)

@Serializable
data class ApiBookmarksResponse(
    val success: Boolean,
    val articleIds: List<String> = emptyList(),
    val articles: List<ApiBookmarkArticle> = emptyList(),
)

@Serializable
data class ApiBookmarkArticle(
    val id: String = "",
    val title: String = "",
    val slug: String = "",
    @JsonNames("imageUrl", "image_url")
    val imageUrl: String? = null,
    @JsonNames("categoryName", "category_name")
    val categoryName: String? = null,
    @JsonNames("publishedAt", "published_at")
    val publishedAt: String? = null,
)

@Serializable
data class ApiAuthorPage(
    val author: ApiAuthorProfile,
    val stats: ApiAuthorStats? = null,
    val topCategories: List<ApiAuthorCategory> = emptyList(),
    val recentArticles: List<ApiArticle> = emptyList(),
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiAuthorProfile(
    val id: String = "",
    val name: String = "",
    val role: String = "",
    @JsonNames("avatarUrl", "avatar_url")
    val avatarUrl: String? = null,
    val bio: String? = null,
    @JsonNames("jobTitle", "job_title")
    val jobTitle: String? = null,
    val department: String? = null,
    @JsonNames("joinedAt", "joined_at")
    val joinedAt: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiAuthorStats(
    @JsonNames("articleCount", "article_count")
    val articleCount: Int = 0,
    @JsonNames("totalViews", "total_reads", "total_views")
    val totalViews: Int = 0,
    @JsonNames("earliestPublish", "earliest_publish")
    val earliestPublish: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiAuthorCategory(
    val id: String = "",
    @JsonNames("nameAr", "name_ar", "name")
    val nameAr: String = "",
    val color: String? = null,
    val icon: String? = null,
    val count: Int = 0,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMediaAsset(
    val id: String = "",
    @JsonNames("displayOrder", "display_order")
    val displayOrder: Int = 0,
    @JsonNames("altText", "alt_text")
    val altText: String? = null,
    val mediaFile: ApiMediaFile? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMediaFile(
    val id: String = "",
    val url: String = "",
    @JsonNames("fileName", "file_name")
    val fileName: String? = null,
)

// -- Contributor Dashboard ------------------------------------------

@Serializable
data class ApiContributorAnalytics(
    val success: Boolean = true,
    val role: String = "writer",
    @JsonNames("totalArticles", "total_articles")
    val totalArticles: Int = 0,
    @JsonNames("publishedArticles", "published_articles")
    val publishedArticles: Int = 0,
    @JsonNames("draftArticles", "draft_articles")
    val draftArticles: Int = 0,
    @JsonNames("pendingArticles", "pending_articles")
    val pendingArticles: Int = 0,
    @JsonNames("needsChangesArticles", "needs_changes_articles")
    val needsChangesArticles: Int = 0,
    @JsonNames("rejectedArticles", "rejected_articles")
    val rejectedArticles: Int = 0,
    @JsonNames("totalViews", "total_views")
    val totalViews: Int = 0,
    @JsonNames("totalLikes", "total_likes")
    val totalLikes: Int = 0,
    @JsonNames("totalComments", "total_comments")
    val totalComments: Int = 0,
    @JsonNames("totalBookmarks", "total_bookmarks")
    val totalBookmarks: Int = 0,
    @JsonNames("dailyStats", "daily_stats")
    val dailyStats: List<ApiDailyStat> = emptyList(),
    @JsonNames("bestArticleThisWeek", "best_article_this_week")
    val bestArticleThisWeek: ApiBestArticle? = null,
    val comparison: ApiComparison = ApiComparison(),
    val followers: ApiFollowerData = ApiFollowerData(),
    @JsonNames("topArticles", "top_articles")
    val topArticles: List<ApiTopArticle> = emptyList(),
    @JsonNames("featuredComment", "featured_comment")
    val featuredComment: ApiFeaturedComment? = null,
    @JsonNames("publishingActivity", "publishing_activity")
    val publishingActivity: ApiPublishingActivity = ApiPublishingActivity(),
    val articles: List<ApiContributorArticle> = emptyList(),
)

@Serializable
data class ApiDailyStat(
    val date: String = "",
    val views: Int = 0,
    val likes: Int = 0,
    val comments: Int = 0,
)

@Serializable
data class ApiBestArticle(
    val id: String = "",
    val title: String = "",
    val views: Int = 0,
)

@Serializable
data class ApiComparison(
    @JsonNames("viewsThisMonth", "views_this_month")
    val viewsThisMonth: Int = 0,
    @JsonNames("viewsLastMonth", "views_last_month")
    val viewsLastMonth: Int = 0,
    @JsonNames("likesThisMonth", "likes_this_month")
    val likesThisMonth: Int = 0,
    @JsonNames("likesLastMonth", "likes_last_month")
    val likesLastMonth: Int = 0,
)

@Serializable
data class ApiFollowerData(
    val count: Int = 0,
    @JsonNames("dailyGrowth", "daily_growth")
    val dailyGrowth: List<ApiFollowerDay> = emptyList(),
)

@Serializable
data class ApiFollowerDay(
    val date: String = "",
    val count: Int = 0,
)

@Serializable
data class ApiTopArticle(
    val id: String = "",
    val title: String = "",
    val views: Int = 0,
    val likes: Int = 0,
    val comments: Int = 0,
    val bookmarks: Int = 0,
)

@Serializable
data class ApiFeaturedComment(
    val content: String = "",
    @JsonNames("userName", "user_name")
    val userName: String = "قارئ",
    @JsonNames("articleTitle", "article_title")
    val articleTitle: String = "",
    @JsonNames("articleId", "article_id")
    val articleId: String = "",
)

@Serializable
data class ApiPublishingActivity(
    @JsonNames("lastPublishedAt", "last_published_at")
    val lastPublishedAt: String? = null,
    @JsonNames("daysSinceLastPublished", "days_since_last_published")
    val daysSinceLastPublished: Int? = null,
    @JsonNames("thisWeekCount", "this_week_count")
    val thisWeekCount: Int = 0,
    @JsonNames("thisMonthCount", "this_month_count")
    val thisMonthCount: Int = 0,
)

@Serializable
data class ApiContributorArticle(
    val id: String = "",
    val title: String = "",
    val status: String = "",
    @JsonNames("reviewStatus", "review_status")
    val reviewStatus: String? = null,
    @JsonNames("reviewNotes", "review_notes")
    val reviewNotes: String? = null,
    val views: Int = 0,
    val likes: Int = 0,
    val comments: Int = 0,
    val bookmarks: Int = 0,
    @JsonNames("publishedAt", "published_at")
    val publishedAt: String? = null,
    @JsonNames("createdAt", "created_at")
    val createdAt: String? = null,
)

@Serializable
data class ApiContributorRanking(
    val success: Boolean = true,
    val rank: Int? = null,
    @JsonNames("totalAuthors", "total_authors")
    val totalAuthors: Int = 0,
    val percentile: Int = 0,
    @JsonNames("myViews", "my_views")
    val myViews: Int = 0,
    @JsonNames("isTopTen", "is_top_ten")
    val isTopTen: Boolean = false,
)

