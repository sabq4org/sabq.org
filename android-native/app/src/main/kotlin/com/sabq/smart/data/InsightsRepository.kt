package com.sabq.smart.data

import com.sabq.smart.data.api.ApiTodayInsights
import com.sabq.smart.data.api.SabqApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Today's "personal knowledge journey" insights.
 *
 * Single endpoint (`GET /api/v1/insights/today`) backs both the simple
 * greeting-only view (which iOS uses to populate `todayInsights` as a
 * `[String:String]` dict) and the rich personal-journey block. We
 * expose just the rich [TodayInsights] domain model — callers wanting
 * only the greeting can read [TodayInsights.greeting] directly.
 *
 * Network failures bubble up; the caller is expected to wrap in
 * `runCatching { ... }` and degrade gracefully (the personal-journey
 * block hides itself when the call fails or returns null).
 */
@Singleton
class InsightsRepository @Inject constructor(
    private val api: SabqApi,
) {
    suspend fun getToday(): TodayInsights {
        val raw = api.getInsightsToday()
        return TodayInsights(
            greeting = raw.greeting,
            metrics = TodayInsights.Metrics(
                readingTime = raw.metrics.readingTime,
                completionRate = raw.metrics.completionRate,
                likes = raw.metrics.likes,
                comments = raw.metrics.comments,
                articlesRead = raw.metrics.articlesRead,
            ),
            topInterests = raw.topInterests,
            aiPhrase = raw.aiPhrase?.takeIf { it.isNotBlank() },
            quickSummary = raw.quickSummary?.takeIf { it.isNotBlank() },
        )
    }
}

/**
 * Domain projection of `ApiTodayInsights`. Field names match the iOS
 * `APITodayInsights` model 1:1 so the personal-journey block reads the
 * same property paths as Swift's `richInsights?.metrics.readingTime`.
 */
data class TodayInsights(
    val greeting: String,
    val metrics: Metrics,
    val topInterests: List<String>,
    val aiPhrase: String?,
    val quickSummary: String?,
) {
    data class Metrics(
        val readingTime: Int,
        val completionRate: Int,
        val likes: Int,
        val comments: Int,
        val articlesRead: Int,
    )
}
