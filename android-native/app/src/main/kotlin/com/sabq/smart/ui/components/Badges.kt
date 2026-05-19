package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.sabq.smart.ui.theme.SabqTheme

/**
 * iOS [SmallSquareBadge] (line 936-956). 44x44 rounded square with a
 * tinted gradient fill (12% → 6%) and a centred icon.
 */
@Composable
fun SmallSquareBadge(
    icon: ImageVector,
    tint: Color,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(13.dp)
    Box(
        modifier = modifier
            .size(SabqTheme.dimens.badgeSmall)
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(
                        tint.copy(alpha = 0.12f),
                        tint.copy(alpha = 0.06f),
                    ),
                ),
                shape,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(18.dp),
        )
    }
}

/**
 * iOS [SquareIconBadge] (line 958-978). 72x72 variant used in
 * CategoryTile / empty-state heroes. Slightly larger radius, lighter
 * tint (10% → 5%), larger icon.
 */
@Composable
fun SquareIconBadge(
    icon: ImageVector,
    tint: Color,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(18.dp)
    Box(
        modifier = modifier
            .size(SabqTheme.dimens.badgeLarge)
            .clip(shape)
            .background(
                Brush.linearGradient(
                    listOf(
                        tint.copy(alpha = 0.10f),
                        tint.copy(alpha = 0.05f),
                    ),
                ),
                shape,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(26.dp),
        )
    }
}
