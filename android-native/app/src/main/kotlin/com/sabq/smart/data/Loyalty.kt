package com.sabq.smart.data

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import kotlinx.serialization.Serializable

/**
 * Android mirror of iOS `Models/LoyaltyModels.swift` — single source
 * of truth for the 5-tier table client-side. Falls back to local
 * tier resolution when the server-side row is missing (brand-new
 * users). Keep this in sync with `shared/loyalty.ts` server-side and
 * the iOS file the same day if the table changes.
 */
data class LoyaltyTier(
    val level: Int,              // 1..5
    val nameAr: String,
    val nameEn: String,
    val minLifetimePoints: Int,
    val color: Color,
    val gradientColors: List<Color>,
) {
    /** Top-leading → bottom-trailing gradient — matches iOS SwiftUI. */
    val gradient: Brush
        get() = Brush.linearGradient(gradientColors)
}

object LoyaltyTiers {
    val all: List<LoyaltyTier> = listOf(
        LoyaltyTier(
            level = 1,
            nameAr = "القارئ الجديد",
            nameEn = "New Reader",
            minLifetimePoints = 0,
            color = Color(red = 0.61f, green = 0.64f, blue = 0.69f),
            gradientColors = listOf(
                Color(0.42f, 0.45f, 0.50f, 1f),
                Color(0.12f, 0.16f, 0.22f, 1f),
            ),
        ),
        LoyaltyTier(
            level = 2,
            nameAr = "المتفاعل",
            nameEn = "Engaged",
            minLifetimePoints = 100,
            color = Color(red = 0.23f, green = 0.51f, blue = 0.96f),
            gradientColors = listOf(
                Color(0.15f, 0.38f, 0.92f, 1f),
                Color(0.12f, 0.23f, 0.54f, 1f),
            ),
        ),
        LoyaltyTier(
            level = 3,
            nameAr = "العضو الذهبي",
            nameEn = "Gold Member",
            minLifetimePoints = 500,
            color = Color(red = 0.96f, green = 0.62f, blue = 0.04f),
            gradientColors = listOf(
                Color(0.96f, 0.62f, 0.04f, 1f),
                Color(0.71f, 0.45f, 0.04f, 1f),
                Color(0.47f, 0.21f, 0.06f, 1f),
            ),
        ),
        LoyaltyTier(
            level = 4,
            nameAr = "القارئ الموثوق",
            nameEn = "Trusted Reader",
            minLifetimePoints = 2_000,
            color = Color(red = 0.65f, green = 0.55f, blue = 0.98f),
            gradientColors = listOf(
                Color(0.65f, 0.55f, 0.98f, 1f),
                Color(0.43f, 0.16f, 0.85f, 1f),
            ),
        ),
        LoyaltyTier(
            level = 5,
            nameAr = "سفير سبق",
            nameEn = "Sabq Ambassador",
            minLifetimePoints = 10_000,
            color = Color(red = 0.49f, green = 0.23f, blue = 0.93f),
            gradientColors = listOf(
                Color(0.49f, 0.23f, 0.93f, 1f),
                Color(0.30f, 0.11f, 0.58f, 1f),
                Color(0.12f, 0.11f, 0.29f, 1f),
            ),
        ),
    )

    fun forLifetimePoints(points: Int): LoyaltyTier {
        var current = all[0]
        for (t in all) if (points >= t.minLifetimePoints) current = t
        return current
    }

    fun forLevel(level: Int): LoyaltyTier = all.firstOrNull { it.level == level } ?: all[0]

    fun nextAfter(level: Int): LoyaltyTier? = all.firstOrNull { it.level == level + 1 }
}

/** Server-resolved loyalty summary — `GET /api/v1/loyalty/me` response. */
data class LoyaltySummary(
    val totalPoints: Int,
    val lifetimePoints: Int,
    val currentRank: String?,
    val rankLevel: Int?,
    val weekPoints: Int,
    val monthPoints: Int,
    val streakDays: Int,
    val lastActivityAt: String?,
) {
    /** Trust server's rankLevel first; fall back to client lifetime
     *  compute for brand-new accounts where the row is missing. */
    val resolvedTier: LoyaltyTier
        get() = rankLevel?.let { LoyaltyTiers.forLevel(it) }
            ?: LoyaltyTiers.forLifetimePoints(lifetimePoints)

    /** Progress toward the next tier — same math as iOS
     *  LoyaltySummary.progressToNext at line 127 of LoyaltyModels.swift. */
    val progress: LoyaltyProgress
        get() {
            val current = resolvedTier
            val next = LoyaltyTiers.nextAfter(current.level)
                ?: return LoyaltyProgress(current, null, 0, 1f)
            val span = (next.minLifetimePoints - current.minLifetimePoints).coerceAtLeast(1)
            val inTier = (lifetimePoints - current.minLifetimePoints).coerceAtLeast(0)
            val pointsToNext = (next.minLifetimePoints - lifetimePoints).coerceAtLeast(0)
            val fraction = (inTier.toFloat() / span.toFloat()).coerceIn(0f, 1f)
            return LoyaltyProgress(current, next, pointsToNext, fraction)
        }
}

data class LoyaltyProgress(
    val current: LoyaltyTier,
    val next: LoyaltyTier?,
    val pointsToNext: Int,
    val fraction: Float,
)

enum class LoyaltyAction(val value: String) {
    READ_OPEN("READ"),
    READ_DEEP("READ_DEEP"),
    LIKE("LIKE"),
    SHARE("SHARE"),
    COMMENT("COMMENT"),
    NOTIFICATION_OPEN("NOTIFICATION_OPEN"),
    DAILY_LOGIN("DAILY_LOGIN")
}

/** Payload persisted to disk by [LoyaltyEventQueue]. Serializable so
 *  pending events survive process death. */
@Serializable
data class LoyaltyEventPayload(
    val action: String,
    val source: String? = null,
    val articleId: String? = null,
    val duration: Int? = null,
    val extraInfo: String? = null,
)

