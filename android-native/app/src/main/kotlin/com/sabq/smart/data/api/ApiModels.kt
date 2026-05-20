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

    @JsonNames("image_url", "imageUrl", "image", "thumbnailUrl", "thumbnail_url")
    val imageUrl: String? = null,

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
    val tags: List<String>? = null,

    /** Canonical public article URL — used by the iOS share sheet
     *  fallback. Backend ships it under `article_url` or `articleUrl`
     *  depending on the route. */
    @JsonNames("article_url", "articleUrl", "url", "canonical_url", "canonicalUrl")
    val articleUrl: String? = null,
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
