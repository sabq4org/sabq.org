package com.sabq.smart.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames

/**
 * Moment-by-moment update — one item from `/api/live/updates`.
 * Ports iOS `APILiveUpdate` (APIModels.swift line 1676+). Distinct
 * from `ApiArticle`: lighter payload (no full body), no author, plus
 * a `categoryNameAr` Arabic-only category label inline.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLiveUpdate(
    val id: String = "",
    val title: String = "",
    val slug: String = "",

    @JsonNames("imageUrl", "image_url")
    val imageUrl: String? = null,

    @JsonNames("imageFocalPoint", "image_focal_point")
    val imageFocalPoint: ApiFocalPoint? = null,

    @JsonNames("publishedAt", "published_at")
    val publishedAt: String = "",

    @JsonNames("updatedAt", "updated_at")
    val updatedAt: String? = null,

    @JsonNames("isBreaking", "is_breaking")
    val isBreaking: Boolean = false,

    @JsonNames("categoryId", "category_id")
    val categoryId: String? = null,

    @JsonNames("categoryNameAr", "category_name_ar", "category")
    val categoryNameAr: String? = null,

    @JsonNames("viewsCount", "views_count")
    val viewsCount: Int? = null,
    @JsonNames("commentsCount", "comments_count")
    val commentsCount: Int? = null,

    val summary: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLiveUpdatesResponse(
    val items: List<ApiLiveUpdate> = emptyList(),
    @JsonNames("nextCursor", "next_cursor")
    val nextCursor: String? = null,
)

// ────────────────────────────────────────────────────────────────────
// Live coverage — `/api/v1/live`. Distinct from MomentByMoment above:
// curated multi-country event feed with timeline + stats + per-country
// filter. Ports iOS `APILiveResponse` etc. (APIModels.swift line 1394+).
// ────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLiveResponse(
    @JsonNames("title_ar", "titleAr")
    val titleAr: String? = null,
    @JsonNames("is_live", "isLive")
    val isLive: Boolean? = null,
    val coverages: List<ApiLiveCoverage> = emptyList(),
    val countries: List<ApiLiveCountry> = emptyList(),
    val events: List<ApiLiveEvent> = emptyList(),
    val stats: ApiLiveStats? = null,
    val total: Int? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLiveCoverage(
    val country: String = "",
    val events: List<ApiLiveEvent> = emptyList(),
    val count: Int = 0,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLiveCountry(
    val key: String = "",
    @JsonNames("name_ar", "nameAr")
    val nameAr: String? = null,
    @JsonNames("name_en", "nameEn")
    val nameEn: String? = null,
    val count: Int = 0,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLiveStats(
    @JsonNames("total_events", "totalEvents")
    val totalEvents: Int? = null,
    val intercepted: Int? = null,
    val injuries: Int? = null,
    val martyrdom: Int? = null,
    @JsonNames("by_country", "byCountry")
    val byCountry: Map<String, Int> = emptyMap(),
    @JsonNames("last_updated", "lastUpdated")
    val lastUpdated: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLiveEvent(
    val id: String = "",
    val content: String = "",
    val country: String = "",
    @JsonNames("country_name_ar", "countryNameAr")
    val countryNameAr: String? = null,
    @JsonNames("event_type", "eventType")
    val eventType: String? = null,
    @JsonNames("event_type_label_ar", "eventTypeLabelAr")
    val eventTypeLabelAr: String? = null,
    val severity: String? = null,
    val priority: String? = null,
    @JsonNames("source_name", "sourceName", "source")
    val sourceName: String? = null,
    @JsonNames("is_pinned", "isPinned")
    val isPinned: Boolean = false,
    @JsonNames("is_update", "isUpdate")
    val isUpdate: Boolean = false,
    @JsonNames("published_at", "publishedAt", "created_at", "createdAt")
    val publishedAt: String = "",
)
