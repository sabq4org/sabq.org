package com.sabq.smart.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.ui.theme.SabqTheme

/**
 * 1:1 port of iOS `EmptyStateView`
 * (`Components/SabqComponents.swift:1554-1626`).
 *
 * Replaces the seven scattered per-screen empty-state implementations
 * (LoyaltyHistory, EditorialNotifications, Calendar, LiveCoverage,
 * MomentByMoment, Trending, InterestsPicker) — each one was a smaller,
 * iconless variant that drifted visually from iOS over time.
 *
 * Visual recipe:
 *   - 120 dp radial-gradient circle (`tint × 0.12 → tint × 0.03`)
 *   - 42 sp semibold icon centered
 *   - 20 sp Bold title, 15 sp Normal subtitle (max-width 300 dp)
 *   - Optional capsule action button (refresh icon + label) with
 *     `tint × 0.10` background and `tint` foreground
 *   - The whole stack pulses gently (1.0 → 1.05 scale, 2 s ease-in-out,
 *     forever) — matches iOS's `.scaleEffect + .repeatForever` and
 *     `.symbolEffect(.pulse)` combo.
 */
@Composable
fun EmptyStateView(
    icon: ImageVector,
    tint: Color,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    actionTitle: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val transition = rememberInfiniteTransition(label = "empty-state-pulse")
    val scale by transition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2_000, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "scale",
    )

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Box(
            modifier = Modifier
                .size(120.dp)
                .scale(scale)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            tint.copy(alpha = 0.12f),
                            tint.copy(alpha = 0.03f),
                        ),
                    ),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(42.dp),
            )
        }

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = title,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                textAlign = TextAlign.Center,
            )
            Text(
                text = subtitle,
                fontSize = 15.sp,
                fontWeight = FontWeight.Normal,
                color = SabqTheme.colors.secondaryInk,
                textAlign = TextAlign.Center,
                lineHeight = 22.sp,
                modifier = Modifier.widthIn(max = 300.dp),
            )
        }

        if (actionTitle != null && onAction != null) {
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(tint.copy(alpha = 0.10f))
                    .clickable { onAction() }
                    .padding(horizontal = 24.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.Refresh,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = actionTitle,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = tint,
                )
            }
        }
    }
}

/**
 * Convenience for network/load failures — iOS `ErrorStateView`
 * (`SabqComponents.swift:1630-1644`). Always coral, always has a retry
 * action.
 */
@Composable
fun ErrorStateView(
    message: String,
    onRetry: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    EmptyStateView(
        icon = Icons.Filled.WifiOff,
        tint = SabqTheme.colors.coral,
        title = "حدث خطأ",
        subtitle = message,
        actionTitle = if (onRetry != null) "إعادة المحاولة" else null,
        onAction = onRetry,
        modifier = modifier,
    )
}

