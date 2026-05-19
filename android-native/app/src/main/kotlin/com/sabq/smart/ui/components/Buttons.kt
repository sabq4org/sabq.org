package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.sabq.smart.ui.theme.SabqTheme

/**
 * iOS [SmallActionButton] (line 982-1007). Compact pill button:
 * tinted background at 10% opacity, label + trailing icon, used in
 * screen headers ("الكل ←", "حذف الكل").
 */
@Composable
fun SmallActionButton(
    title: String,
    icon: ImageVector,
    tint: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val haptics = rememberSabqHaptics()
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    Row(
        modifier = modifier
            .clip(shape)
            .background(tint.copy(alpha = 0.10f), shape)
            .clickable {
                haptics.light()
                onClick()
            }
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Text(
            text = title,
            style = SabqTheme.typography.chipLabel,
            color = tint,
        )
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(13.dp),
        )
    }
}

/**
 * iOS [PrimaryCTAButton] (line 1009-1042). Full-width gradient pill,
 * brand gradient when enabled, muted grey gradient when disabled.
 * Carries a soft tinted shadow when enabled.
 */
@Composable
fun PrimaryCTAButton(
    title: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val haptics = rememberSabqHaptics()
    val shape = RoundedCornerShape(SabqTheme.dimens.buttonRadius)
    val brush = if (enabled) {
        Brush.linearGradient(
            listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
        )
    } else {
        Brush.linearGradient(
            listOf(
                SabqTheme.colors.secondaryInk.copy(alpha = 0.4f),
                SabqTheme.colors.secondaryInk.copy(alpha = 0.3f),
            ),
        )
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = if (enabled) 8.dp else 0.dp,
                shape = shape,
                ambientColor = SabqTheme.colors.primaryEnd.copy(alpha = 0.25f),
                spotColor = SabqTheme.colors.primaryEnd.copy(alpha = 0.25f),
            )
            .clip(shape)
            .background(brush, shape)
            .clickable(enabled = enabled) {
                haptics.medium()
                onClick()
            }
            .padding(vertical = 17.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
    ) {
        Text(
            text = title,
            style = SabqTheme.typography.ctaButton,
            color = Color.White.copy(alpha = if (enabled) 1f else 0.7f),
        )
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = Color.White.copy(alpha = if (enabled) 1f else 0.7f),
            modifier = Modifier.size(17.dp),
        )
    }
}
