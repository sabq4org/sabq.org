package com.sabq.smart.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Shared screen header — title 30 sp bold + subtitle 15 sp secondary,
 * optional `SmallActionButton` on the trailing edge. 1:1 port of iOS
 * `CompactScreenHeader` (`Components/SabqComponents.swift:870-904`).
 *
 * Used by every full-screen surface that needs a calm hero strip:
 * Explore, Opinions, Bookmarks, etc. Keeping the title sizing,
 * spacing, and ink tones consistent across screens is the whole
 * point of factoring this out.
 */
@Composable
fun CompactScreenHeader(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    actionTitle: String? = null,
    actionIcon: ImageVector? = null,
    actionTint: androidx.compose.ui.graphics.Color = SabqTheme.colors.primaryEnd,
    onAction: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = title,
                fontSize = 30.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = subtitle,
                fontSize = 15.sp,
                fontWeight = FontWeight.Normal,
                color = SabqTheme.colors.secondaryInk,
                lineHeight = 20.sp,
            )
        }

        if (actionTitle != null && actionIcon != null && onAction != null) {
            SmallActionButton(
                title = actionTitle,
                icon = actionIcon,
                tint = actionTint,
                onClick = onAction,
            )
        }
    }
}
