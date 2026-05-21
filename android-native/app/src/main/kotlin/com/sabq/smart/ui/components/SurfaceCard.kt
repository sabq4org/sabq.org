package com.sabq.smart.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Ports iOS `SurfaceCard` (SabqComponents.swift line 829-866). White
 * (or dark) rounded surface with a soft+hard double shadow, a thin
 * outline stroke, and an optional accent-tinted decorative circle
 * peeking from the top-right corner.
 *
 * iOS stacks two shadows on the same path:
 *   `.shadow(SabqTheme.shadow, radius: 16, y: 6)`  — soft halo
 *   `.shadow(SabqTheme.deepShadow, radius: 1, y: 1)` — tight rim
 *
 * Compose's `Modifier.shadow` chains the same way — the first call
 * renders the wide soft glow, the second adds the tight under-rim.
 * Earlier this file approximated both with a single `elevation=10dp`
 * which the user flagged as "ظلال ثقيلة"; this is the corrected pass.
 */
@Composable
fun SurfaceCard(
    modifier: Modifier = Modifier,
    accent: Color? = null,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    val outlineColor = SabqTheme.colors.outline.copy(alpha = 0.5f)

    Box(
        modifier = modifier
            .fillMaxWidth()
            // Soft outer halo — iOS `radius: 16, y: 6`. Spot-only so the
            // shadow sits below the card, ambient is transparent.
            .shadow(
                elevation = 8.dp,
                shape = shape,
                ambientColor = Color.Transparent,
                spotColor = SabqTheme.colors.shadow,
            )
            // Tight under-rim — iOS `radius: 1, y: 1`.
            .shadow(
                elevation = 1.dp,
                shape = shape,
                ambientColor = Color.Transparent,
                spotColor = SabqTheme.colors.deepShadow,
            )
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(BorderStroke(0.5.dp, outlineColor), shape),
    ) {
        if (accent != null) {
            // Decorative tinted circle in the corner — equivalent to
            // iOS's `.overlay(alignment: .topTrailing)`. RTL flips
            // topTrailing → topLeading, which matches iOS behaviour
            // when its outer scope is in RTL (the iOS `.sabqRTL()` on
            // SurfaceCard) so we keep alignment as TopEnd here.
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 40.dp, y = (-40).dp)
                    .size(120.dp)
                    .clip(CircleShape)
                    .background(accent.copy(alpha = 0.08f)),
            )
        }
        Column(
            modifier = Modifier.padding(SabqTheme.dimens.cardPadding),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            content()
        }
    }
}
