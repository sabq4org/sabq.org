package com.sabq.smart.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLoyaltyPoints(
    @JsonNames("userId", "user_id")
    val userId: String? = null,
    @JsonNames("totalPoints", "total_points")
    val totalPoints: Int = 0,
    @JsonNames("currentRank", "current_rank")
    val currentRank: String? = null,
    @JsonNames("rankLevel", "rank_level")
    val rankLevel: Int? = null,
    @JsonNames("lifetimePoints", "lifetime_points")
    val lifetimePoints: Int = 0,
    @JsonNames("lastActivityAt", "last_activity_at")
    val lastActivityAt: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLoyaltySummary(
    val success: Boolean? = null,
    val points: ApiLoyaltyPoints? = null,
    @JsonNames("weekPoints", "week_points")
    val weekPoints: Int = 0,
    @JsonNames("monthPoints", "month_points")
    val monthPoints: Int = 0,
    @JsonNames("streakDays", "streak_days")
    val streakDays: Int = 0,
)
