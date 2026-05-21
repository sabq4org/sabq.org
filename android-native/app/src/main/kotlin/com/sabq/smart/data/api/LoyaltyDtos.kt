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

/**
 * Request body for `POST /api/v1/loyalty/events`. iOS sends the same
 * shape via `APIClient.submitLoyaltyEvents`. The server caps the array
 * at 100; the on-device queue slices to 50 per flush for safety.
 */
@Serializable
data class LoyaltyEventBatchRequest(
    val events: List<LoyaltyEventDto>,
)

@Serializable
data class LoyaltyEventDto(
    val action: String,
    val source: String? = null,
    val articleId: String? = null,
    val duration: Int? = null,
    val extraInfo: String? = null,
)

/**
 * Response from `POST /api/v1/loyalty/events`. Per-event outcomes
 * include AWARDED (with points), CAPPED, DEDUP, INVALID_ACTION, etc.
 * The queue doesn't act on individual outcomes — the server is the
 * source of truth for what was credited. A 2xx response means the
 * batch was processed; we drop those events from the pending list.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class LoyaltyEventBatchResponse(
    val success: Boolean = false,
    val results: List<LoyaltyEventResult> = emptyList(),
)

@Serializable
data class LoyaltyEventResult(
    val action: String,
    val outcome: String,
    val points: Int? = null,
)
