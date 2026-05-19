package com.sabq.smart.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Spacing + radius tokens — ported 1:1 from iOS [SabqTheme]
 * (lines 813-816 of `SabqComponents.swift`).
 *
 * iOS uses CGFloat with no unit and SwiftUI multiplies by the device's
 * @1x scale — which corresponds exactly to Compose's `dp`. A `28` in
 * Swift becomes `28.dp` here. Do not "convert" — they're the same unit.
 */
@Immutable
data class SabqDimens(
    val cardRadius: Dp = 28.dp,
    val tileRadius: Dp = 22.dp,
    val chipRadius: Dp = 14.dp,
    val buttonRadius: Dp = 20.dp,

    // Layout — extracted from per-screen padding rules in DESIGN_SPEC.
    val screenPaddingH: Dp = 16.dp,
    val sectionGap: Dp = 20.dp,
    val cardPadding: Dp = 20.dp,

    // Component-internal — drawn from FeaturedArticleCard / CompactArticleRow.
    val heroImageHeight: Dp = 200.dp,
    val thumbnailSize: Dp = 84.dp,
    val thumbnailRadius: Dp = 16.dp,
    val tabBarHeight: Dp = 54.dp,
    val badgeSmall: Dp = 44.dp,
    val badgeLarge: Dp = 72.dp,
)
