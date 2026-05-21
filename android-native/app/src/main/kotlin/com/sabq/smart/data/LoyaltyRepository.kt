package com.sabq.smart.data

import com.sabq.smart.data.api.SabqApi
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LoyaltyRepository @Inject constructor(
    private val api: SabqApi,
) {
    suspend fun getSummary(): LoyaltySummary {
        val response = api.getLoyaltyMe()
        val pts = response.points
        return LoyaltySummary(
            totalPoints = pts?.totalPoints ?: 0,
            lifetimePoints = pts?.lifetimePoints ?: 0,
            currentRank = pts?.currentRank,
            rankLevel = pts?.rankLevel,
            weekPoints = response.weekPoints,
            monthPoints = response.monthPoints,
            streakDays = response.streakDays,
            lastActivityAt = pts?.lastActivityAt,
        )
    }

    /** Paginated event log for the "سجل نقاطي" screen. */
    suspend fun getHistory(page: Int = 1, limit: Int = 20): LoyaltyHistoryPage {
        val response = api.getLoyaltyHistory(page = page, limit = limit)
        return LoyaltyHistoryPage(
            items = response.items.map {
                LoyaltyHistoryEvent(
                    id = it.id.takeIf { id -> id.isNotBlank() } ?: "${it.action}-${it.createdAt}",
                    action = it.action,
                    points = it.points,
                    source = it.source?.takeIf { s -> s.isNotBlank() },
                    createdAt = it.createdAt,
                )
            },
            page = response.page,
            limit = response.limit,
            hasMore = response.hasMore,
        )
    }
}

data class LoyaltyHistoryEvent(
    val id: String,
    val action: String,
    val points: Int,
    val source: String?,
    val createdAt: String?,
)

data class LoyaltyHistoryPage(
    val items: List<LoyaltyHistoryEvent>,
    val page: Int,
    val limit: Int,
    val hasMore: Boolean,
)
