package com.sabq.smart.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.TodayInsights
import com.sabq.smart.data.User
import com.sabq.smart.ui.components.LoyaltyStripView
import com.sabq.smart.ui.theme.SabqTheme
import java.time.LocalDateTime

/**
 * "رحلتك المعرفية اليوم" — 1:1 port of iOS `personalJourneyBlock`
 * (`Screens/HomeFeedView.swift:1011-1187`).
 *
 * Four stacked sub-blocks inside an ultra-thin material card:
 *   1. [JourneyHeader] — 40 dp purple→primaryEnd gradient circle with
 *      a sparkles icon, alongside greeting line + subtitle.
 *   2. [LoyaltyStripView] — slim loyalty card, taps into the Loyalty
 *      Account screen.
 *   3. [JourneyMetrics] — four bare metric cells (no per-cell icons or
 *      colours) inside a `paleFill` rounded rect.
 *   4. [JourneyInterests] — horizontal scroll of interest-name chips.
 *
 * Auth-gated by the caller. Pass `insights == null` to render with all
 * counters at zero (cheaper than guessing whether the fetch is still in
 * flight); the parent ViewModel is responsible for surfacing this only
 * when a signed-in user is present.
 */
@Composable
fun PersonalJourneyBlock(
    insights: TodayInsights?,
    currentUser: User?,
    loyaltyLifetimePoints: Int,
    onLoyaltyTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    // Sharper gray frame to match SurfaceCard treatment — the previous
    // 0.5dp / 50%-alpha outline blended with the feed background and
    // the block lost its edge. Reported 2026-05-24.
    val frameColor = if (SabqTheme.colors.isDark) {
        SabqTheme.colors.outline
    } else {
        Color(0xFFEAECEF)
    }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 1.dp, color = frameColor, shape = shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        JourneyHeader(insights = insights, currentUser = currentUser)
        LoyaltyStripView(onTap = onLoyaltyTap)
        JourneyMetrics(insights = insights, lifetimePoints = loyaltyLifetimePoints)
        JourneyInterests(interests = insights?.topInterests ?: emptyList())
    }
}

// ============================================================
// 1. Header — purple→primaryEnd circle + greeting + subtitle
// ============================================================

@Composable
private fun JourneyHeader(
    insights: TodayInsights?,
    currentUser: User?,
) {
    val greeting = remember(insights?.greeting, currentUser?.firstName) {
        journeyGreeting(insights?.greeting, currentUser?.firstName)
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            SabqTheme.colors.journeyGradientStart,
                            SabqTheme.colors.primaryEnd,
                        ),
                    ),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(16.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = greeting,
                fontSize = 15.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
                maxLines = 1,
            )
            Text(
                text = "رحلتك المعرفية في سبق اليوم باختصار",
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
                maxLines = 1,
            )
        }
    }
}

/**
 * Greeting word ALWAYS comes from the device clock — Railway runs in
 * UTC and would otherwise call mid-afternoon "صباح الخير" all day. If
 * the backend's greeting embeds a name (e.g. "صباح الخير يا علي")
 * we pluck the name; otherwise we fall back to the signed-in user's
 * first name from the auth store. iOS counterpart at HomeFeedView.swift
 * lines 1068-1101.
 */
private fun journeyGreeting(backendGreeting: String?, firstNameFallback: String?): String {
    val hour = LocalDateTime.now().hour
    val word = when (hour) {
        in 5..11 -> "صباح الخير"
        in 12..16 -> "نهارك سعيد"
        in 17..20 -> "مساء الخير"
        else -> "ليلة سعيدة"
    }

    val nameFromBackend = backendGreeting
        ?.trim()
        ?.let { raw ->
            val anchor = " يا "
            val idx = raw.indexOf(anchor)
            if (idx >= 0) raw.substring(idx + anchor.length).trim() else null
        }
        ?.takeIf { it.isNotEmpty() }

    val name = nameFromBackend
        ?: firstNameFallback?.trim()?.takeIf { it.isNotEmpty() }

    return if (name.isNullOrEmpty()) word else "$word يا $name"
}

// ============================================================
// 2. Metrics — 4 bare cells inside a paleFill rounded rect
// ============================================================

@Composable
private fun JourneyMetrics(insights: TodayInsights?, lifetimePoints: Int) {
    val shape = RoundedCornerShape(SabqTheme.dimens.mediaCardRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.paleFill.copy(alpha = 0.5f), shape)
            .padding(vertical = 10.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        MetricCell(
            value = (insights?.metrics?.readingTime ?: 0).toString(),
            unit = "د",
            label = "وقت القراءة",
        )
        MetricDivider()
        MetricCell(
            value = "${insights?.metrics?.completionRate ?: 0}%",
            unit = null,
            label = "الإكمال",
        )
        MetricDivider()
        MetricCell(
            value = (insights?.metrics?.likes ?: 0).toString(),
            unit = null,
            label = "إعجابات",
        )
        MetricDivider()
        MetricCell(
            value = lifetimePoints.toString(),
            unit = null,
            label = "نقاط الولاء",
        )
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.MetricCell(
    value: String,
    unit: String?,
    label: String,
) {
    Column(
        modifier = Modifier.weight(1f),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = value,
                fontSize = 17.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
                maxLines = 1,
            )
            if (unit != null) {
                Text(
                    text = unit,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.tertiaryInk,
                )
            }
        }
        Text(
            text = label,
            style = SabqTheme.typography.microMeta,
            color = SabqTheme.colors.tertiaryInk,
            maxLines = 1,
        )
    }
}

@Composable
private fun MetricDivider() {
    Box(
        modifier = Modifier
            .width(0.5.dp)
            .height(28.dp)
            .background(SabqTheme.colors.outline.copy(alpha = 0.5f)),
    )
}

// ============================================================
// 3. Interests — "اهتماماتك اليوم:" + scrollable capsule chips
// ============================================================

@Composable
private fun JourneyInterests(interests: List<String>) {
    if (interests.isEmpty()) return
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = "اهتماماتك اليوم:",
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.tertiaryInk,
            maxLines = 1,
        )
        Row(
            modifier = Modifier
                .weight(1f)
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            interests.forEach { name ->
                InterestChip(name = name)
            }
        }
    }
}

@Composable
private fun InterestChip(name: String) {
    val shape = CircleShape
    Box(
        modifier = Modifier
            .clip(shape)
            .background(SabqTheme.colors.paleFill, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.5f), shape = shape)
            .padding(horizontal = 9.dp, vertical = 4.dp),
    ) {
        Text(
            text = name,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.secondaryInk,
            maxLines = 1,
        )
    }
}

