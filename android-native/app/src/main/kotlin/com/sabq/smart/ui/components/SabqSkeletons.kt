package com.sabq.smart.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Sabq skeleton primitives — port iOS [ShimmerModifier] + [SkeletonBox]
 * + [ArticleRowSkeleton] + [FeaturedCardSkeleton] + [HomeFeedSkeleton]
 * (Components/SabqComponents.swift lines 27-176) 1:1.
 *
 * Used to replace page-level CircularProgressIndicator calls on
 * first-paint loading states. Inline progress (pull-to-refresh,
 * load-more, button-internal) intentionally keeps the spinner since
 * iOS does the same.
 */

/**
 * Shimmer overlay. iOS uses a 60%-wide LinearGradient
 * (clear → white@0.25 → clear) sweeping left→right at 1.5s linear
 * repeat. Compose lacks `BlendMode.SoftLight`, so we approximate the
 * iOS effect with `Plus` (additive) which gives a similar bright
 * sweep over the darker placeholder fill without bleeding past
 * already-clipped rounded corners.
 */
@Composable
fun Modifier.shimmer(): Modifier {
    val transition = rememberInfiniteTransition(label = "sabq-shimmer")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1500, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "shimmer-phase",
    )
    return this.drawWithContent {
        drawContent()
        val sweepW = size.width * 0.6f
        val offX = phase * (size.width * 1.6f) - size.width * 0.3f
        // No BlendMode — Compose lacks SoftLight, and Plus over-saturates
        // the placeholder fill to pure white. Drawing the sweep as a
        // semi-transparent overlay with default SrcOver gives the
        // subtle iOS-style glide the user expects.
        drawRect(
            brush = Brush.linearGradient(
                colors = listOf(
                    Color.Transparent,
                    Color.White.copy(alpha = 0.45f),
                    Color.Transparent,
                ),
                start = Offset(offX, 0f),
                end = Offset(offX + sweepW, 0f),
            ),
            topLeft = Offset.Zero,
            size = Size(size.width, size.height),
        )
    }
}

/**
 * Rounded placeholder box that shimmers. Width null → fill parent width.
 * Default radius mirrors iOS SkeletonBox (8 pt).
 */
@Composable
fun SkeletonBox(
    modifier: Modifier = Modifier,
    width: Dp? = null,
    height: Dp = 16.dp,
    radius: Dp = 8.dp,
) {
    val shape = RoundedCornerShape(radius)
    val sized = if (width != null) modifier.width(width) else modifier.fillMaxWidth()
    Box(
        modifier = sized
            .height(height)
            .clip(shape)
            .background(SabqTheme.colors.outline.copy(alpha = 0.5f))
            .shimmer(),
    )
}

/** Circular shimmer placeholder. */
@Composable
fun SkeletonCircle(diameter: Dp, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(diameter)
            .clip(CircleShape)
            .background(SabqTheme.colors.outline.copy(alpha = 0.5f))
            .shimmer(),
    )
}

/**
 * Article-row skeleton. Mirrors iOS [ArticleRowSkeleton]
 * (SabqComponents.swift:80-95).
 */
@Composable
fun ArticleRowSkeleton(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SkeletonBox(width = 70.dp, height = 24.dp, radius = 12.dp)
            SkeletonBox(height = 16.dp)
            SkeletonBox(width = 200.dp, height = 14.dp)
            SkeletonBox(width = 140.dp, height = 12.dp)
        }
        SkeletonBox(width = 80.dp, height = 80.dp, radius = 16.dp)
    }
}

/**
 * Featured-card skeleton (carousel hero). Mirrors iOS
 * [FeaturedCardSkeleton] (SabqComponents.swift:97-124).
 *
 * Compose can't replicate iOS's `UnevenRoundedRectangle` cleanly, so
 * we wrap the whole card in cardRadius and the inner hero block fills
 * to the top edges via the same rounded surface.
 */
@Composable
fun FeaturedCardSkeleton(modifier: Modifier = Modifier) {
    val cardShape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(cardShape)
            .background(SabqTheme.colors.surface, cardShape),
    ) {
        // Hero strip (200dp tall) with shimmer.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(SabqTheme.dimens.heroImageHeight)
                .background(SabqTheme.colors.outline.copy(alpha = 0.5f))
                .shimmer(),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(SabqTheme.dimens.cardPadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SkeletonBox(height = 20.dp)
            SkeletonBox(width = 240.dp, height = 16.dp)
            SkeletonBox(width = 180.dp, height = 14.dp)
        }
    }
}

/**
 * Full HomeFeed skeleton — mirrors iOS [HomeFeedSkeleton]
 * (SabqComponents.swift:126-176): logo + 2 round buttons, big search,
 * 5 circular section avatars, featured carousel placeholder, 6 pill
 * chips, then a surface card hosting 4 article rows.
 */
@Composable
fun HomeFeedSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = SabqTheme.dimens.screenPaddingH, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SkeletonBox(width = 120.dp, height = 48.dp, radius = 12.dp)
            Spacer(modifier = Modifier.weight(1f))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SkeletonBox(width = 48.dp, height = 48.dp, radius = 24.dp)
                SkeletonBox(width = 48.dp, height = 48.dp, radius = 24.dp)
            }
        }

        SkeletonBox(height = 50.dp, radius = SabqTheme.dimens.tileRadius)

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            contentPadding = PaddingValues(horizontal = 0.dp),
        ) {
            items(5) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    SkeletonCircle(diameter = 68.dp)
                    SkeletonBox(width = 50.dp, height = 10.dp)
                }
            }
        }

        FeaturedCardSkeleton(modifier = Modifier.padding(horizontal = 4.dp))

        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(6) {
                SkeletonBox(
                    width = 80.dp,
                    height = 36.dp,
                    radius = SabqTheme.dimens.chipRadius,
                )
            }
        }

        val surfaceShape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(surfaceShape)
                .background(SabqTheme.colors.surface, surfaceShape)
                .padding(SabqTheme.dimens.cardPadding),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            repeat(4) { idx ->
                ArticleRowSkeleton()
                if (idx < 3) {
                    HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.3f))
                }
            }
        }
    }
}

/** Compact list-only skeleton — N rows, no surrounding card. */
@Composable
fun ArticleListSkeleton(
    rows: Int = 6,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = SabqTheme.dimens.screenPaddingH),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        repeat(rows) { idx ->
            ArticleRowSkeleton()
            if (idx < rows - 1) {
                HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.3f))
            }
        }
    }
}
