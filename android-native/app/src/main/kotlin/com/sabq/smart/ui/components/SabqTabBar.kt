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
 * شريط التبويبات العائم بنمط iOS: كبسولة بأربعة تبويبات متساوية
 * (الرئيسية، استكشف، محفوظاتي، حسابي)، لكل تبويب أيقونة واسمه.
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
            .padding(horizontal = 6.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        tabs.forEach { tab ->
            val isSelected = selectedTab == tab
            TabBarItem(
                tab = tab,
                isSelected = isSelected,
                onClick = { onSelect(tab) },
                modifier = Modifier.weight(1f),
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
    // iOS TabView (ContentView.swift): كل تبويب أيقونة فوقها اسمه، والمحدد
    // بلون الأساس على كبسولة رمادية هادئة.
    val haptics = rememberSabqHaptics()
    val tint = if (isSelected) SabqTheme.colors.primaryEnd else SabqTheme.colors.ink
    val capsule = CircleShape
    val interactionSource = remember { MutableInteractionSource() }
    val title = androidx.compose.ui.res.stringResource(tab.titleResId)

    androidx.compose.foundation.layout.Column(
        modifier = modifier
            .clip(capsule)
            .background(if (isSelected) SabqTheme.colors.chipFill else androidx.compose.ui.graphics.Color.Transparent, capsule)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                role = androidx.compose.ui.semantics.Role.Tab,
                onClickLabel = title,
            ) {
                haptics.light()
                onClick()
            }
            .padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Icon(
            imageVector = if (isSelected) tab.filledIcon else tab.outlinedIcon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(24.dp),
        )
        Text(
            text = title,
            style = SabqTheme.typography.tabLabel,
            color = tint,
            maxLines = 1,
        )
    }
}
