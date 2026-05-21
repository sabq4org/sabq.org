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

/**
 * Paginated activity log for the signed-in member. Returned by
 * `GET /api/v1/loyalty/history?page=N&limit=20`. Each row carries the
 * action key (READ / READ_DEEP / LIKE / ...), the awarded points, an
 * optional source (e.g. `article:<id>`), and the server timestamp.
 * Drives the "سجل نقاطي" screen.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLoyaltyHistoryResponse(
    val success: Boolean? = null,
    val items: List<ApiLoyaltyHistoryEvent> = emptyList(),
    val page: Int = 1,
    val limit: Int = 20,
    @JsonNames("hasMore", "has_more")
    val hasMore: Boolean = false,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLoyaltyHistoryEvent(
    val id: String = "",
    val action: String = "",
    val points: Int = 0,
    val source: String? = null,
    @JsonNames("createdAt", "created_at")
    val createdAt: String? = null,
    @JsonNames("articleTitle", "article_title")
    val articleTitle: String? = null,
    @JsonNames("articleSlug", "article_slug")
    val articleSlug: String? = null,
)


/**
 * Reward listing from `GET /api/v1/loyalty/rewards`. Drives the
 * "متجر المكافآت" screen — same shape as the iOS
 * `LoyaltyRewardsResponse` decoder.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLoyaltyRewardsResponse(
    val success: Boolean? = null,
    val balance: Int = 0,
    val rewards: List<ApiLoyaltyReward> = emptyList(),
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLoyaltyReward(
    val id: String = "",
    @JsonNames("nameAr", "name_ar")
    val nameAr: String = "",
    @JsonNames("nameEn", "name_en")
    val nameEn: String? = null,
    val description: String? = null,
    @JsonNames("imageUrl", "image_url")
    val imageUrl: String? = null,
    @JsonNames("pointsCost", "points_cost")
    val pointsCost: Int = 0,
    @JsonNames("rewardType", "reward_type")
    val rewardType: String? = null,
    @JsonNames("partnerName", "partner_name")
    val partnerName: String? = null,
    @JsonNames("remainingStock", "remaining_stock")
    val remainingStock: Int? = null,
    @JsonNames("expiresAt", "expires_at")
    val expiresAt: String? = null,
    @JsonNames("myRedemptionCount", "my_redemption_count")
    val myRedemptionCount: Int = 0,
    @JsonNames("canRedeem", "can_redeem")
    val canRedeem: Boolean = false,
    @JsonNames("pointsShort", "points_short")
    val pointsShort: Int = 0,
    @JsonNames("reasonBlocked", "reason_blocked")
    val reasonBlocked: String? = null,
)

/**
 * Response from `POST /api/v1/loyalty/rewards/{id}/redeem`. Server
 * may return success=false with a human message (e.g. out of stock,
 * insufficient points after race) — the UI surfaces it as an error
 * banner instead of throwing.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLoyaltyRedeemResponse(
    val success: Boolean = false,
    val message: String? = null,
    @JsonNames("remainingBalance", "remaining_balance")
    val remainingBalance: Int? = null,
)
