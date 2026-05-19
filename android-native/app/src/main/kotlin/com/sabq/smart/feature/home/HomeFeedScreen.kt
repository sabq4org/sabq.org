package com.sabq.smart.feature.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.outlined.Podcasts
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.R
import com.sabq.smart.data.Article
import com.sabq.smart.data.Section
import com.sabq.smart.feature.auth.AuthViewModel
import com.sabq.smart.feature.notifications.EditorialBellViewModel
import com.sabq.smart.feature.settings.SettingsViewModel
import com.sabq.smart.ui.components.CategoryChip
import com.sabq.smart.ui.components.CompactArticleRow
import com.sabq.smart.ui.components.FeaturedArticleCard
import com.sabq.smart.ui.components.SmallActionButton
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Home feed — Pillar 3-5 deliverable. Live news from the
 * `api/v1` endpoints on `https://sabq.org`. Includes:
 *   - Featured carousel (HorizontalPager, up to 5 items)
 *   - Dynamic category chips from /api/v1/sections
 *   - Section filter (chip tap re-queries /api/v1/articles?section=<slug>)
 *   - Infinite pagination (auto-loads next page near end of list)
 *   - Floating tab bar
 */
@Composable
fun HomeFeedScreen(
    viewModel: HomeFeedViewModel = hiltViewModel(),
    settingsViewModel: SettingsViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel(),
    bellViewModel: EditorialBellViewModel = hiltViewModel(),
    onArticleClick: (Article) -> Unit = {},
    onMomentByMomentClick: () -> Unit = {},
    onNotificationsClick: () -> Unit = {},
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()
    val settings by settingsViewModel.settings.collectAsStateWithLifecycle()
    val currentUser by authViewModel.currentUser.collectAsStateWithLifecycle()
    val unreadCount by bellViewModel.unreadCount.collectAsStateWithLifecycle()
    val isDarkMode = if (settings.followsSystemDark)
        androidx.compose.foundation.isSystemInDarkTheme()
    else settings.isDarkMode
    val isLoggedIn = currentUser != null

    // Trigger the badge count fetch on first appearance for signed-in
    // users. Failures are silent (count stays 0).
    LaunchedEffect(isLoggedIn) {
        if (isLoggedIn) bellViewModel.refresh()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        when (val s = uiState) {
            HomeFeedUiState.Loading -> LoadingState()
            is HomeFeedUiState.Error -> ErrorState(message = s.message, onRetry = viewModel::refresh)
            is HomeFeedUiState.Loaded -> LoadedFeed(
                state = s,
                isDarkMode = isDarkMode,
                showNotificationsBell = isLoggedIn,
                notificationsUnreadCount = unreadCount,
                onSectionSelect = viewModel::selectSection,
                onBookmark = viewModel::toggleBookmark,
                onArticleClick = onArticleClick,
                onMomentByMomentClick = onMomentByMomentClick,
                onNotificationsClick = onNotificationsClick,
                onToggleDarkMode = {
                    // Mirrors iOS: tapping the header sun/moon flips the
                    // user's explicit darkMode flag. If the user was in
                    // "follow system" mode, drop that so the explicit
                    // toggle wins.
                    if (settings.followsSystemDark) settingsViewModel.setFollowsSystem(false)
                    settingsViewModel.setDarkMode(!isDarkMode)
                },
                onEndReached = viewModel::loadMore,
            )
        }
    }
}

@Composable
private fun LoadedFeed(
    state: HomeFeedUiState.Loaded,
    isDarkMode: Boolean,
    showNotificationsBell: Boolean,
    notificationsUnreadCount: Int,
    onSectionSelect: (String?) -> Unit,
    onBookmark: (String) -> Unit,
    onArticleClick: (Article) -> Unit,
    onMomentByMomentClick: () -> Unit,
    onNotificationsClick: () -> Unit,
    onToggleDarkMode: () -> Unit,
    onEndReached: () -> Unit,
) {
    val listState = rememberLazyListState()

    // Trigger load-more when within 3 items of the end.
    val endReached by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            val total = info.totalItemsCount
            val lastVisible = info.visibleItemsInfo.lastOrNull()?.index ?: return@derivedStateOf false
            total > 0 && lastVisible >= total - 3
        }
    }
    LaunchedEffect(endReached) {
        if (endReached) onEndReached()
    }

    LazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding(),
        contentPadding = PaddingValues(
            start = SabqTheme.dimens.screenPaddingH,
            end = SabqTheme.dimens.screenPaddingH,
            top = 16.dp,
            bottom = 120.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item {
            HomeHeaderBar(
                isDarkMode = isDarkMode,
                showNotificationsBell = showNotificationsBell,
                notificationsUnreadCount = notificationsUnreadCount,
                onMomentByMomentClick = onMomentByMomentClick,
                onNotificationsClick = onNotificationsClick,
                onToggleDarkMode = onToggleDarkMode,
            )
        }

        item {
            AnimatedVisibility(state.isRefreshing) {
                CenteredSpinner()
            }
        }

        // Featured carousel.
        if (state.featured.isNotEmpty()) {
            item {
                FeaturedCarousel(
                    articles = state.featured,
                    bookmarkedIds = state.bookmarkedIds,
                    onBookmark = onBookmark,
                    onClick = onArticleClick,
                )
            }
        }

        // Dynamic chip strip.
        item {
            SectionChips(
                sections = state.sections,
                selectedSlug = state.selectedSlug,
                onSelect = onSectionSelect,
            )
        }

        // Latest list (inside a SurfaceCard).
        item {
            SurfaceCard {
                state.articles.forEachIndexed { index, article ->
                    if (index > 0) {
                        HorizontalDivider(
                            color = SabqTheme.colors.outline.copy(alpha = 0.3f),
                            thickness = 0.5.dp,
                        )
                    }
                    CompactArticleRow(
                        article = article,
                        isBookmarked = article.bookmarkKey in state.bookmarkedIds,
                        onBookmark = { onBookmark(article.bookmarkKey) },
                        onClick = { onArticleClick(article) },
                    )
                }
            }
        }

        // Bottom load-more spinner.
        item {
            AnimatedVisibility(state.isLoadingMore) {
                CenteredSpinner()
            }
        }

        // End-of-list hint when no more pages.
        if (!state.hasMore && state.articles.isNotEmpty() && !state.isLoadingMore) {
            item {
                Text(
                    text = "وصلت إلى نهاية الأخبار",
                    style = SabqTheme.typography.meta,
                    color = SabqTheme.colors.tertiaryInk,
                    modifier = Modifier.fillMaxWidth().padding(8.dp),
                )
            }
        }
    }
}

@Composable
private fun FeaturedCarousel(
    articles: List<Article>,
    bookmarkedIds: Set<String>,
    onBookmark: (String) -> Unit,
    onClick: (Article) -> Unit,
) {
    val pagerState = rememberPagerState(pageCount = { articles.size })
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        HorizontalPager(
            state = pagerState,
            pageSpacing = 12.dp,
        ) { page ->
            val article = articles[page]
            FeaturedArticleCard(
                article = article,
                isBookmarked = article.bookmarkKey in bookmarkedIds,
                onBookmark = { onBookmark(article.bookmarkKey) },
                onClick = { onClick(article) },
            )
        }
        // Compact page dots — neutral when idle, brand-tinted on the
        // current page. iOS uses `.tabViewStyle(.page)` for the same
        // affordance.
        if (articles.size > 1) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            ) {
                repeat(articles.size) { i ->
                    val isActive = i == pagerState.currentPage
                    Box(
                        modifier = Modifier
                            .size(if (isActive) 8.dp else 6.dp)
                            .clip(CircleShape)
                            .background(
                                if (isActive) SabqTheme.colors.primaryEnd
                                else SabqTheme.colors.outline,
                            ),
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionChips(
    sections: List<Section>,
    selectedSlug: String?,
    onSelect: (String?) -> Unit,
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            CategoryChip(
                title = "الكل",
                isSelected = selectedSlug == null,
                onClick = { onSelect(null) },
            )
        }
        items(sections, key = { it.id }) { section ->
            CategoryChip(
                title = section.name,
                isSelected = selectedSlug == section.slug,
                onClick = { onSelect(section.slug) },
            )
        }
    }
}

@Composable
private fun CenteredSpinner() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(
            color = SabqTheme.colors.primaryEnd,
            strokeWidth = 2.dp,
            modifier = Modifier.size(22.dp),
        )
    }
}

@Composable
private fun LoadingState() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
            Text(
                text = "جاري تحميل الأخبار",
                style = SabqTheme.typography.meta,
                color = SabqTheme.colors.secondaryInk,
            )
        }
    }
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = "تعذّر تحميل الأخبار",
                style = SabqTheme.typography.sectionHeader,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = message,
                style = SabqTheme.typography.meta,
                color = SabqTheme.colors.secondaryInk,
            )
            Spacer(modifier = Modifier.height(8.dp))
            SmallActionButton(
                title = "إعادة المحاولة",
                icon = Icons.AutoMirrored.Filled.ArrowForward,
                tint = SabqTheme.colors.primaryEnd,
                onClick = onRetry,
            )
        }
    }
}

/**
 * Top header row — ports `headerSection` from iOS
 * `HomeFeedView.swift:329-427`. Sabq logo on the leading edge (visual
 * right in RTL), Spacer, then the icon cluster.
 *
 * iOS ships four icons in the cluster (search, editorial bell,
 * moment-by-moment radiowaves, dark-mode toggle). We currently ship:
 *   - Editorial bell (signed-in only) → notifications inbox, with a
 *     coral unread dot when [notificationsUnreadCount] > 0.
 *   - `Icons.Outlined.Podcasts` → MomentByMoment (matches iOS
 *     `dot.radiowaves.left.and.right`, same icon used inside the
 *     destination screen — see [MomentByMomentScreen.kt:257]).
 *   - Sun/moon → dark-mode toggle (`SettingsViewModel.setDarkMode`).
 * Search button will land when its dedicated screen does.
 */
@Composable
private fun HomeHeaderBar(
    isDarkMode: Boolean,
    showNotificationsBell: Boolean,
    notificationsUnreadCount: Int,
    onMomentByMomentClick: () -> Unit,
    onNotificationsClick: () -> Unit,
    onToggleDarkMode: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Image(
            painter = painterResource(id = R.drawable.sabq_logo),
            contentDescription = "سبق",
            contentScale = ContentScale.Fit,
            modifier = Modifier.height(48.dp),
        )
        Spacer(modifier = Modifier.weight(1f))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (showNotificationsBell) {
                HeaderIcon(
                    icon = Icons.Filled.Notifications,
                    contentDescription = "الإشعارات",
                    onClick = onNotificationsClick,
                    badge = notificationsUnreadCount > 0,
                )
            }
            HeaderIcon(
                icon = Icons.Outlined.Podcasts,
                contentDescription = "لحظة بلحظة",
                onClick = onMomentByMomentClick,
            )
            HeaderIcon(
                icon = if (isDarkMode) Icons.Filled.LightMode else Icons.Filled.DarkMode,
                contentDescription = if (isDarkMode) "الوضع الفاتح" else "الوضع الداكن",
                onClick = onToggleDarkMode,
            )
        }
    }
}

/**
 * 44 dp gradient-tinted circular icon button — matches iOS
 * `headerIcon(_:)` at [HomeFeedView.swift:429-444]. Fill is the brand
 * gradient at 10% → 5% opacity; icon is `primaryEnd` at 18 sp weight
 * semibold.
 *
 * When [badge] is true, a 10 dp coral unread dot is overlaid in the
 * top-right corner with a 2 dp background stroke so it reads cleanly
 * over the brand-tinted backdrop (matches iOS bell-unread treatment).
 */
@Composable
private fun HeaderIcon(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    badge: Boolean = false,
) {
    val colors = SabqTheme.colors
    Box(
        modifier = Modifier.size(44.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .matchParentSize()
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            colors.primaryStart.copy(alpha = 0.10f),
                            colors.primaryEnd.copy(alpha = 0.05f),
                        ),
                    ),
                )
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = colors.primaryEnd,
                modifier = Modifier.size(18.dp),
            )
        }
        if (badge) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(colors.background)
                    .padding(2.dp)
                    .clip(CircleShape)
                    .background(colors.coral),
            )
        }
    }
}

@Suppress("unused")
private val _markers = listOf<Any>(Color.Transparent)
