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
