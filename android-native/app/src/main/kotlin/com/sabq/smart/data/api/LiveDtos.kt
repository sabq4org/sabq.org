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
