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

    val screenPaddingH: Dp = 16.dp,
    // Strict iOS parity (owner directive 2026-07-13): section gap, card
    // padding, and tab-bar inset restored to the exact iOS values —
    // earlier Android-side reductions (18/16/88) reverted.
    val sectionGap: Dp = 20.dp,
    val cardPadding: Dp = 20.dp,
    // Horizontal rails (opinions, stories): iOS uses 14pt gaps.
    val railGap: Dp = 14.dp,
    // HorizontalPager spacing for the featured carousel.
    val pageSpacing: Dp = 12.dp,
    val tabBarSafeArea: Dp = 120.dp,

    // Component-internal — drawn from FeaturedArticleCard / CompactArticleRow.
    val heroImageHeight: Dp = 200.dp,
    val thumbnailSize: Dp = 84.dp,
    val thumbnailRadius: Dp = 16.dp,
    val tabBarHeight: Dp = 54.dp,
    val badgeSmall: Dp = 44.dp,
    val badgeLarge: Dp = 72.dp,

    // Icon-badge corner radii (SmallSquareBadge / SquareIconBadge in iOS).
    // 13 pt = SabqComponents.swift:941, 18 pt = SabqComponents.swift:963.
    // Used as the rounded-rect fill behind a single SF Symbol / Material
    // Icon, e.g. the section-icon chip on screen headers.
    val badgeIconRadius: Dp = 13.dp,
    val badgeIconRadiusLarge: Dp = 18.dp,
)
