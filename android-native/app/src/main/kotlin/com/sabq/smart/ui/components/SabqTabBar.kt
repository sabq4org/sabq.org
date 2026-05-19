package com.sabq.smart.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.unit.dp
import com.sabq.smart.nav.AppTab
import com.sabq.smart.ui.theme.SabqTheme

/**
 * iOS [SabqTabBar] (SabqComponents.swift line 1654-1735). Floating
 * capsule with 4 tabs in `ultraThinMaterial`. Selected tab keeps its
 * label visible; idle tabs collapse to icon-only so the bar feels
 * light.
 *
 * Differences from iOS:
 *   - SwiftUI's `.ultraThinMaterial` isn't supported on Android until
 *     API 31's `RenderEffect.createBlurEffect`. We render a static
 *     semi-transparent surface with shadows — visually close enough
 *     in light mode, slightly less convincing in dark.
 *   - `matchedGeometryEffect` is replaced with per-tab background
 *     animation. The pill grows under the selected tab via
 *     `AnimatedVisibility` over the label — close enough; revisit
 *     with Compose 1.7+ shared elements once we drop minSdk.
 */
@Composable
fun SabqTabBar(
    selectedTab: AppTab,
    onSelect: (AppTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tabs = remember { AppTab.entries.toList() }
    val capsule = CircleShape

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .shadow(
                elevation = 24.dp,
                shape = capsule,
                ambientColor = SabqTheme.colors.shadow,
                spotColor = SabqTheme.colors.deepShadow,
            )
            .clip(capsule)
            .background(SabqTheme.colors.surface.copy(alpha = 0.95f), capsule)
            .border(BorderStroke(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.30f)), capsule)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        tabs.forEach { tab ->
            val isSelected = selectedTab == tab
            TabBarItem(
                tab = tab,
                isSelected = isSelected,
                onClick = { onSelect(tab) },
                // Selected tab gets ~1.7x the base width so its
                // label has room — iOS uses
                // `matchedGeometryEffect` for the same morph.
                modifier = Modifier.weight(if (isSelected) 1.8f else 1f),
            )
        }
    }
}

@Composable
private fun TabBarItem(
    tab: AppTab,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberSabqHaptics()
    val tint = SabqTheme.colors.primaryEnd
    val capsule = CircleShape
    val pillBg = if (isSelected) tint.copy(alpha = 0.14f) else androidx.compose.ui.graphics.Color.Transparent
    val interactionSource = remember { MutableInteractionSource() }

    Row(
        modifier = modifier
            .clip(capsule)
            .background(pillBg, capsule)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
            ) {
                haptics.light()
                onClick()
            }
            .padding(horizontal = 14.dp, vertical = 9.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (isSelected) tab.filledIcon else tab.outlinedIcon,
            contentDescription = null,
            tint = if (isSelected) tint else SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(20.dp),
        )

        AnimatedVisibility(
            visible = isSelected,
            enter = fadeIn(animationSpec = spring(stiffness = Spring.StiffnessMediumLow)) +
                expandHorizontally(animationSpec = spring(stiffness = Spring.StiffnessMediumLow)),
            exit = fadeOut() + shrinkHorizontally(),
        ) {
            Text(
                text = androidx.compose.ui.res.stringResource(tab.titleResId),
                style = SabqTheme.typography.tabLabel,
                color = tint,
                maxLines = 1,
            )
        }
    }
}

