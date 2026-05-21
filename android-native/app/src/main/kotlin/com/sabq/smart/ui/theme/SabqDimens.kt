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
    // Compact media-bearing cards (opinion thumbnails, journey metric tiles).
    // iOS uses 12pt on OpinionCard (HomeFeedView.swift:777). Sits below
    // chipRadius (14) and above pure-pill shapes.
    val mediaCardRadius: Dp = 12.dp,

    // Layout — matched 1:1 to iOS HomeFeedView spacing (VStack 26pt at
    // HomeFeedView.swift:95, 16pt horizontal padding at line 179).
    val screenPaddingH: Dp = 16.dp,
    val sectionGap: Dp = 26.dp,
    val cardPadding: Dp = 20.dp,
    // Horizontal rails (opinions, stories): iOS uses 14pt gaps.
    val railGap: Dp = 14.dp,
    // HorizontalPager spacing for the featured carousel.
    val pageSpacing: Dp = 12.dp,
    // List bottom inset reserving room for the floating tab bar.
    val tabBarSafeArea: Dp = 120.dp,

    // Component-internal — drawn from FeaturedArticleCard / CompactArticleRow.
    val heroImageHeight: Dp = 200.dp,
    val thumbnailSize: Dp = 84.dp,
    val thumbnailRadius: Dp = 16.dp,
    val tabBarHeight: Dp = 54.dp,
    val badgeSmall: Dp = 44.dp,
    val badgeLarge: Dp = 72.dp,
)
