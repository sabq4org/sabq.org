package com.sabq.smart.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames

/**
 * DTOs for the secondary Home sections — stories rail, today's
 * calendar events, and audio newsletters. Mirrors the iOS shapes in
 * `Services/APIDeepContent.swift` and `Services/APIModels.swift:420+`.
 */

// Stories

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiStory(
    val id: String = "",
    val title: String = "",
    val description: String? = null,
    @JsonNames("image_url", "image")
    val imageUrl: String? = null,
    @JsonNames("articles_count", "count")
    val articlesCount: Int? = null,
    /** Each Sabq story wraps a `rootArticle` — the bubble tap opens
     *  that article directly. The `slug` on the nested object is
     *  what the public ArticleDetail endpoint uses. */
    @JsonNames("rootArticle", "root_article")
    val rootArticle: ApiStoryRootArticle? = null,
    @JsonNames("root_article_slug", "rootArticleSlug")
    val rootArticleSlug: String? = null,
)

@Serializable
data class ApiStoryRootArticle(
    val id: String = "",
    val slug: String? = null,
    val title: String? = null,
)

@Serializable
data class ApiStoriesResponse(
    val items: List<ApiStory> = emptyList(),
)

// Calendar

@Serializable
data class ApiCalendarEvent(
    val id: String = "",
    val title: String = "",
    val description: String? = null,
    /** "GLOBAL" | "NATIONAL" | "INTERNAL" */
    val type: String? = null,
    val dateStart: String = "",
    val dateEnd: String? = null,
    /** 1–5 importance */
    val importance: Int? = null,
    val tags: List<String>? = null,
)

@Serializable
data class ApiCalendarEventsResponse(
    val events: List<ApiCalendarEvent> = emptyList(),
)

// Audio newsletters

@Serializable
data class ApiAudioNewsletter(
    val id: String = "",
    val title: String = "",
    val description: String? = null,
    val slug: String = "",
    val coverImageUrl: String? = null,
    val audioUrl: String? = null,
    /** seconds */
    val duration: Int? = null,
    val totalListens: Int? = null,
    val publishedAt: String? = null,
)

@Serializable
data class ApiAudioNewslettersResponse(
    val newsletters: List<ApiAudioNewsletter> = emptyList(),
)

// Hajj block — seasonal "صدى الحج" homepage rail. Mirrors the iOS
// `APIHajjBlockResponse` shape in `Services/APIModels.swift:1779`.
// Lives on the PUBLIC namespace (NOT `/api/v1/`) — the backend gates
// visibility via `isVisible`, so signed-out clients can read it.

@Serializable
data class ApiHajjBlockResponse(
    val isVisible: Boolean = false,
    val title: String? = null,
    val subtitle: String? = null,
    val articles: List<ApiHajjArticle> = emptyList(),
    val hajjDay: Int? = null,
    val daysToArafat: Int? = null,
    /** tarwiyah | arafat | nahr | tashreeq | before | after */
    val hajjPhase: String? = null,
    val lastUpdatedAt: String? = null,
    /** why hidden — `before_season` / `after_season` / `no_matching_articles` */
    val reason: String? = null,
)

@Serializable
data class ApiHajjArticle(
    val id: String = "",
    val title: String = "",
    val slug: String? = null,
    val excerpt: String? = null,
    val imageUrl: String? = null,
    val publishedAt: String? = null,
    val isBreaking: Boolean? = null,
    val isPinned: Boolean? = null,
    /** Arabic tag derived server-side — "من عرفات", "في منى", ... */
    val hajjTag: String = "",
    /** Emoji glyph paired with the tag — 🏔️, 🪨, ... */
    val hajjEmoji: String = "🕋",
)
