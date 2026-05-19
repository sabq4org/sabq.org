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
 * Compose can't emit *two* shadows on the same path the way SwiftUI's
 * `.shadow(...).shadow(...)` stacking does. We approximate by stacking
 * a "soft" blur via `Modifier.shadow(elevation=10, ambientColor=…)` and
 * a tighter outline. The visual delta vs. iOS is within a few
 * sub-pixel rows; if it ever feels off, switch to two-layer Box.
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
            .shadow(
                elevation = 10.dp,
                shape = shape,
                ambientColor = SabqTheme.colors.shadow,
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
