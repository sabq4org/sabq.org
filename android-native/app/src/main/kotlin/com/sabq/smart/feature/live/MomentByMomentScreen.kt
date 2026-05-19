package com.sabq.smart.feature.live

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material.icons.outlined.Podcasts
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.Article
import com.sabq.smart.ui.components.CompactArticleRow
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme

/**
 * "لحظة بلحظة" — reverse-chronological news feed. Ports iOS
 * `MomentByMomentView` (Screens/MomentByMomentView.swift). Layout:
 *
 *   1. Toolbar  — back chevron + "لحظة بلحظة" 17 sp bold rounded.
 *   2. Header   — pulsing 36 dp coral radiowaves circle + "مباشر"
 *                 capsule + "<N> خبر" + subtitle.
 *   3. Filter   — two capsule chips (all / breaking).
 *   4. List     — SurfaceCard wrapping CompactArticleRows + dividers,
 *                 with a "تحميل المزيد" button when a nextCursor is
 *                 available.
 *   5. States   — skeleton (5 rows), empty (tray), error (wifi-alert
 *                 + retry button) when items is empty.
 */
@Composable
fun MomentByMomentScreen(
    onBack: () -> Unit,
    onArticleClick: (Article) -> Unit,
    viewModel: MomentByMomentViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        TopBar(onBack = onBack)

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                horizontal = 16.dp,
                vertical = 8.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item { LiveHeader(itemCount = state.items.size) }

            item {
                FilterRow(
                    selected = state.filter,
                    onSelect = viewModel::setFilter,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }

            when {
                state.isLoading && state.items.isEmpty() -> item { LoadingSkeleton() }
                state.loadError != null && state.items.isEmpty() ->
                    item { ErrorState(message = state.loadError!!, onRetry = viewModel::reload) }
                state.items.isEmpty() -> item { EmptyState() }
                else -> item {
                    SurfaceCard {
                        state.items.forEachIndexed { index, article ->
                            if (index > 0) {
                                HorizontalDivider(color = SabqTheme.colors.outline)
                            }
                            CompactArticleRow(
                                article = article,
                                isBookmarked = false,
                                onBookmark = {},
                                onClick = { onArticleClick(article) },
                            )
                        }

                        if (state.nextCursor != null) {
                            LoadMoreButton(
                                isLoading = state.isLoadingMore,
                                onClick = viewModel::loadMore,
                            )
                        }
                    }
                }
            }

            item { Spacer(modifier = Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun TopBar(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
                .clickable { onBack() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = "رجوع",
                tint = SabqTheme.colors.ink,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "لحظة بلحظة",
            style = SabqTheme.typography.cardTitle.copy(fontSize = 17.sp, fontWeight = FontWeight.Bold),
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(40.dp))
    }
}

/**
 * Pulsing live indicator + "مباشر" + count + subtitle row. Ports
 * iOS lines 144-179: 36 dp circle with coral 18% bg, animated
 * stroke that scales 1 → 1.6 and fades 0.8 → 0 over 1.4 s.
 */
@Composable
private fun LiveHeader(itemCount: Int) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.padding(top = 8.dp),
    ) {
        PulsingLiveDot()
        Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(SabqTheme.colors.coral)
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                ) {
                    Text(
                        text = "مباشر",
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                        ),
                    )
                }
                Text(
                    text = "$itemCount خبر",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.tertiaryInk,
                    ),
                )
            }
            Text(
                text = "أحدث الأخبار لحظة بلحظة",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
    }
}

@Composable
private fun PulsingLiveDot() {
    val transition = rememberInfiniteTransition(label = "live-pulse")
    val pulseScale by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1.6f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "scale",
    )
    val pulseAlpha by transition.animateFloat(
        initialValue = 0.8f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "alpha",
    )

    Box(modifier = Modifier.size(36.dp), contentAlignment = Alignment.Center) {
        // Static inner disc.
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.coral.copy(alpha = 0.18f)),
        )
        // Centre antenna icon.
        Icon(
            imageVector = Icons.Outlined.Podcasts,
            contentDescription = null,
            tint = SabqTheme.colors.coral,
            modifier = Modifier.size(16.dp),
        )
        // Animated stroke ring — scales out + fades.
        Box(
            modifier = Modifier
                .size(36.dp)
                .scale(pulseScale)
                .alpha(pulseAlpha)
                .clip(CircleShape)
                .background(Color.Transparent)
                .border(
                    BorderStroke(width = 2.dp, color = SabqTheme.colors.coral.copy(alpha = 0.40f)),
                    CircleShape,
                ),
        )
    }
}

@Composable
private fun FilterRow(
    selected: MomentByMomentViewModel.Filter,
    onSelect: (MomentByMomentViewModel.Filter) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        MomentByMomentViewModel.Filter.entries.forEach { f ->
            FilterPill(
                label = f.label,
                isSelected = selected == f,
                onClick = { onSelect(f) },
            )
        }
        Spacer(modifier = Modifier.weight(1f))
    }
}

@Composable
private fun FilterPill(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(
                if (isSelected) SabqTheme.colors.primaryEnd else SabqTheme.colors.paleFill,
                CircleShape,
            )
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                color = if (isSelected) Color.White else SabqTheme.colors.ink,
            ),
        )
    }
}

@Composable
private fun LoadMoreButton(isLoading: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !isLoading) { onClick() }
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                color = SabqTheme.colors.primaryEnd,
                strokeWidth = 2.dp,
                modifier = Modifier.size(16.dp),
            )
        }
        Text(
            text = "تحميل المزيد",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.primaryEnd,
            ),
        )
    }
}

@Composable
private fun LoadingSkeleton() {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        repeat(5) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(
                    modifier = Modifier
                        .size(84.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(SabqTheme.colors.paleFill),
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(width = 80.dp, height = 14.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(SabqTheme.colors.paleFill),
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(16.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(SabqTheme.colors.paleFill),
                    )
                    Box(
                        modifier = Modifier
                            .size(width = 200.dp, height = 14.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(SabqTheme.colors.paleFill),
                    )
                }
            }
            HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.3f))
        }
    }
}

@Composable
private fun EmptyState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.Inbox,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(32.dp),
        )
        Text(
            text = "لا توجد أخبار حالياً",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
    }
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.WifiOff,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(28.dp),
        )
        Text(
            text = message,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd)
                .clickable { onRetry() }
                .padding(horizontal = 18.dp, vertical = 8.dp),
        ) {
            Text(
                text = "إعادة المحاولة",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                ),
            )
        }
    }
}
