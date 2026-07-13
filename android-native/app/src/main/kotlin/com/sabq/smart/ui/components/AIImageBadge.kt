package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.CompositionLocalProvider
import com.sabq.smart.ui.theme.SabqTheme

/**
 * AI-generated image disclosure badge — pixel-port of iOS
 * `AIImageBadge` (Components/AIImageBadge.swift). Pill with accent fill,
 * white text "مولدة بالذكاء الاصطناعي" + trailing sparkles icon.
 *
 * Visual notes from iOS:
 * - Capsule fill: accent colour @ 0.95 opacity (NOT a dark media scrim)
 * - Border: white @ 0.30 light / 0.22 dark
 * - Shadow: black @ 0.25 light / 0.45 dark, radius 6 dp, y=2
 * - Internal LTR layout direction so icon stays physically right of text
 *   even when the surrounding screen is RTL.
 * - Model name is intentionally not rendered (iOS captures it for
 *   accessibility / future analytics).
 */
@Composable
fun AIImageBadge(
    modifier: Modifier = Modifier,
    model: String? = null,
    sizeScale: Float = 1f,
) {
    val border = if (SabqTheme.colors.isDark) Color.White.copy(alpha = 0.22f)
                 else Color.White.copy(alpha = 0.30f)
    val shadowColor = if (SabqTheme.colors.isDark) Color.Black.copy(alpha = 0.45f)
                      else Color.Black.copy(alpha = 0.25f)
    val fill = SabqTheme.colors.primaryEnd.copy(alpha = 0.95f)

    @Suppress("UnusedReceiverParameter")
    val unused = model // kept for parity with iOS API surface

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            modifier = modifier
                .shadow(elevation = 6.dp, shape = CircleShape, ambientColor = shadowColor, spotColor = shadowColor)
                .clip(CircleShape)
                .background(fill, CircleShape)
                .border(width = 0.5.dp, color = border, shape = CircleShape)
                .padding(horizontal = (10 * sizeScale).dp, vertical = (5 * sizeScale).dp)
                .semantics { contentDescription = "مولدة بالذكاء الاصطناعي" },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy((5 * sizeScale).dp),
        ) {
            Text(
                text = "مولدة بالذكاء الاصطناعي",
                style = TextStyle(
                    fontSize = (10 * sizeScale).sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                ),
                maxLines = 1,
            )
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size((10 * sizeScale).dp),
            )
        }
    }
}

/** Physical screen corner — immune to RTL flips. */
enum class AIImageBadgeCorner { TopStart, TopEnd }

/**
 * Pins the AI badge to a fixed physical corner of an image. Use as an
 * overlay inside the same Box that contains the hero / thumbnail.
 * Mirrors iOS `AIImageBadgeOverlay`.
 */
@Composable
fun BoxScopedAIImageBadgeOverlay(
    isVisible: Boolean,
    modifier: Modifier = Modifier,
    model: String? = null,
    inset: Dp = 12.dp,
    sizeScale: Float = 1f,
    corner: AIImageBadgeCorner = AIImageBadgeCorner.TopEnd,
) {
    if (!isVisible) return
    // The badge itself enforces LTR. We use Box alignment here on the
    // physical screen (TopEnd ≈ physical top-right) so RTL pages don't
    // flip the corner.
    Box(modifier = modifier.padding(inset)) {
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            AIImageBadge(model = model, sizeScale = sizeScale)
        }
    }
    // Helper marker — actual alignment is applied by the caller via
    // Modifier.align(...) below in the overlay site to choose corner.
    @Suppress("UNUSED_EXPRESSION") corner
}
