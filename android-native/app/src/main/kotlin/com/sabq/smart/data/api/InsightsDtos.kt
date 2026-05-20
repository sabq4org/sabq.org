package com.sabq.smart.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames

/**
 * Mirrors iOS `APITodayInsights` (`Services/APIModels.swift:1722`) and
 * the backend response for `GET /api/v1/insights/today`
 * (`server/routes/mobileApiRoutes.ts:4472`).
 *
 * The same payload powers both the "simple" greeting-only view and the
 * "rich" personal-journey block — iOS just calls the same path twice
 * with two decoders. We use one DTO and map at the repository layer.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiTodayInsights(
    val greeting: String = "",
    val metrics: ApiTodayInsightsMetrics = ApiTodayInsightsMetrics(),
    @JsonNames("topInterests", "top_interests")
    val topInterests: List<String> = emptyList(),
    @JsonNames("aiPhrase", "ai_phrase")
    val aiPhrase: String? = null,
    @JsonNames("quickSummary", "quick_summary")
    val quickSummary: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiTodayInsightsMetrics(
    @JsonNames("readingTime", "reading_time")
    val readingTime: Int = 0,        // minutes
    @JsonNames("completionRate", "completion_rate")
    val completionRate: Int = 0,     // 0..100
    val likes: Int = 0,
    val comments: Int = 0,
    @JsonNames("articlesRead", "articles_read")
    val articlesRead: Int = 0,
)
