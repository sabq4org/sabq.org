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
import androidx.compose.foundation.layout.width
import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PlayCircleFilled
import androidx.compose.material.icons.filled.WbSunny
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.border
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
    onOpinionsAllClick: () -> Unit = {},
    onStoryClick: (com.sabq.smart.data.Story) -> Unit = {},
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
                onOpinionsAllClick = onOpinionsAllClick,
                onStoryClick = onStoryClick,
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
    onOpinionsAllClick: () -> Unit,
    onStoryClick: (com.sabq.smart.data.Story) -> Unit,
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

        // Time-aware Arabic greeting block — ports iOS
        // `HomeFeedView.greetingBlock` (lines 878-1001).
        item { GreetingBlock() }

        // Breaking news pill — single coral row.
        state.breaking?.let { breaking ->
            item {
                BreakingNewsPill(
                    article = breaking,
                    onClick = { onArticleClick(breaking) },
                )
            }
        }

        // Stories rail — circular bubbles. Each bubble opens the
        // dedicated StoryDetailScreen via the parent's onStoryClick.
        if (state.stories.isNotEmpty()) {
            item { StoriesRail(stories = state.stories, onStoryClick = onStoryClick) }
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

        // Opinions preview — horizontal rail of up to 5 cards +
        // "الكل" link to the full Opinions list.
        if (state.opinions.isNotEmpty()) {
            item {
                OpinionsPreviewRail(
                    opinions = state.opinions,
                    onArticleClick = onArticleClick,
                    onSeeAllClick = onOpinionsAllClick,
                )
            }
        }

        // Trending preview — top-3 list inside a SurfaceCard.
        if (state.trending.isNotEmpty()) {
            item {
                TrendingPreviewBlock(
                    trending = state.trending,
                    onArticleClick = onArticleClick,
                )
            }
        }

        // Today's calendar events.
        if (state.calendar.isNotEmpty()) {
            item { CalendarTodayCard(events = state.calendar) }
        }

        // Audio newsletter card.
        state.audioNewsletter?.let { newsletter ->
            item { AudioNewsletterCard(newsletter = newsletter) }
        }

        // Category chips removed from Home per user direction
        // (2026-05-19) — categories live in the Explore tab. State +
        // filter logic kept in HomeFeedViewModel so we can re-introduce
        // them in a sheet later without re-wiring everything. iOS
        // HomeFeedView.swift line 162-165 mirrors this decision.

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

/**
 * Time-aware Arabic greeting card. Ports iOS
 * `HomeFeedView.greetingBlock` at lines 878-1001. The headline + tip
 * are seeded by day-of-year + quarter-of-day so the copy doesn't
 * flicker between recompositions and rotates predictably across the
 * day. The backend AI override (`todayInsights.phrase/headline/
 * summary`) is wired in the iOS counterpart; we ship the static
 * SABQ-AI fallback list here. Backend hookup lands when we port
 * `fetchTodayInsights`.
 */
@Composable
private fun GreetingBlock() {
    val now = remember { java.time.LocalDateTime.now() }
    val slot = remember(now) { greetingSlot(now.hour) }
    val dayOfYear = remember(now) { now.dayOfYear }
    val quarterIndex = remember(slot) {
        when (slot) {
            GreetingSlot.Morning -> 0
            GreetingSlot.Afternoon -> 1
            GreetingSlot.Evening -> 2
            GreetingSlot.Night -> 3
        }
    }
    val headline = remember(dayOfYear, quarterIndex) {
        SabqHeadlines[(dayOfYear + quarterIndex) % SabqHeadlines.size]
    }
    val tip = remember(dayOfYear) {
        SabqTips[dayOfYear % SabqTips.size]
    }
    val tint = slot.tint
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(SabqTheme.dimens.cardRadius)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.6f), shape)
            .background(tint.copy(alpha = 0.05f), shape)
            .border(width = 0.5.dp, color = tint.copy(alpha = 0.18f), shape = shape)
            .padding(18.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            androidx.compose.material3.Icon(
                imageVector = slot.icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(22.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = slot.greeting,
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 13.sp,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                        color = SabqTheme.colors.secondaryInk,
                    ),
                )
                Row(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(
                            androidx.compose.ui.graphics.Brush.linearGradient(
                                listOf(SabqTheme.colors.primaryEnd, tint),
                            ),
                            CircleShape,
                        )
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    androidx.compose.material3.Icon(
                        imageVector = Icons.Filled.AutoAwesome,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(8.dp),
                    )
                    Text(
                        text = "SABQ AI",
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 9.sp,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.Black,
                            color = Color.White,
                        ),
                    )
                }
            }
            Text(
                text = headline,
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 16.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Black,
                    color = SabqTheme.colors.ink,
                ),
                maxLines = 3,
            )
            Text(
                text = tip,
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 11.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                    color = SabqTheme.colors.tertiaryInk,
                ),
                maxLines = 2,
            )
        }
    }
}

private enum class GreetingSlot(
    val greeting: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val tint: Color,
) {
    Morning(
        greeting = "صباح الخير",
        icon = Icons.Filled.WbSunny,
        tint = Color(red = 0.96f, green = 0.72f, blue = 0.18f),
    ),
    Afternoon(
        greeting = "نهارك سعيد",
        icon = Icons.Filled.WbSunny,
        tint = Color(red = 0.93f, green = 0.58f, blue = 0.22f),
    ),
    Evening(
        greeting = "مساء الخير",
        icon = Icons.Filled.WbSunny,
        tint = Color(red = 0.95f, green = 0.45f, blue = 0.20f),
    ),
    Night(
        greeting = "ليلة هادئة",
        icon = Icons.Filled.Bedtime,
        tint = Color(red = 0.46f, green = 0.52f, blue = 0.95f),
    ),
}

private fun greetingSlot(hour: Int): GreetingSlot = when (hour) {
    in 5..11 -> GreetingSlot.Morning
    in 12..16 -> GreetingSlot.Afternoon
    in 17..20 -> GreetingSlot.Evening
    else -> GreetingSlot.Night
}

/** SABQ-AI-branded headlines for the greeting block. iOS source at
 *  `HomeFeedView.swift:1194-1203`. */
private val SabqHeadlines: List<String> = listOf(
    "موجزك ينتظر اهتماماتك",
    "اختر ما يهمك وسبق ترتّب الباقي",
    "صفحتك الشخصية تبدأ من هنا",
    "أخبارك اليومية في مساحة واحدة",
    "اقتراحات أذكى كلما قرأت أكثر",
    "احفظ، تابع، واكتشف من حسابك",
    "موجز خاص بك داخل سبق",
    "ابدأ تجربة قراءة مصممة لك",
)

/** Rotating in-app tips, one per day. iOS at `HomeFeedView.swift:1208-1218`. */
private val SabqTips: List<String> = listOf(
    "أنشئ حسابك لاختيار المحليات والرياضة والاقتصاد وما يهمك",
    "بعد التسجيل يظهر لك موجز يومي مبني على اهتماماتك",
    "حسابك يحفظ المقالات ويعيدها لك من أي جهاز",
    "كل قراءة تساعد سبق AI على تحسين الاقتراحات لك",
    "صفحة حسابك تجمع اهتماماتك ومحفوظاتك وإحصاءاتك",
    "اضغط هنا لمعاينة مزايا العضوية قبل التسجيل",
    "الموجز الشخصي يختصر لك أهم ما فاتك",
    "ابدأ بعضوية مجانية واجعل الصفحة الرئيسية أقرب لك",
    "اختر اهتماماتك مرة، ودع سبق ترتّب الأخبار لك",
)

// MARK: - Breaking news pill (iOS HomeFeedView.breakingNewsSection)

@Composable
private fun BreakingNewsPill(article: Article, onClick: () -> Unit) {
    val coral = SabqTheme.colors.coral
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                androidx.compose.ui.graphics.Brush.horizontalGradient(
                    listOf(coral.copy(alpha = 0.06f), coral.copy(alpha = 0.02f)),
                ),
                shape,
            )
            .border(width = 1.dp, color = coral.copy(alpha = 0.15f), shape = shape)
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        PulsingDot(color = coral)
        Text(
            text = "عاجل",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Black,
                color = coral,
            ),
        )
        Text(
            text = article.title,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 15.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            ),
            maxLines = 2,
            modifier = Modifier.weight(1f),
        )
        androidx.compose.material3.Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
            contentDescription = null,
            tint = coral.copy(alpha = 0.6f),
            modifier = Modifier.size(12.dp),
        )
    }
}

@Composable
private fun PulsingDot(color: Color) {
    val infinite = androidx.compose.animation.core.rememberInfiniteTransition(label = "breaking-pulse")
    val scale by infinite.animateFloat(
        initialValue = 0.85f,
        targetValue = 1.3f,
        animationSpec = androidx.compose.animation.core.infiniteRepeatable(
            androidx.compose.animation.core.tween(durationMillis = 1100, easing = androidx.compose.animation.core.LinearEasing),
            androidx.compose.animation.core.RepeatMode.Reverse,
        ),
        label = "breaking-pulse-scale",
    )
    Box(
        modifier = Modifier.size(18.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(18.dp)
                .scale(scale)
                .clip(CircleShape)
                .background(color.copy(alpha = 0.20f)),
        )
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(color),
        )
    }
}

// MARK: - Opinions preview rail

@Composable
private fun OpinionsPreviewRail(
    opinions: List<Article>,
    onArticleClick: (Article) -> Unit,
    onSeeAllClick: () -> Unit = {},
) {
    val gold = SabqTheme.colors.gold
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        // Header row with title on the leading edge (right in RTL) and
        // an "الكل" link on the trailing edge — same pattern iOS uses
        // for omqPreviewSection (HomeFeedView.swift line 1232-1239).
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.weight(1f),
            ) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(gold.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center,
                ) {
                    androidx.compose.material3.Icon(
                        imageVector = Icons.Filled.FormatQuote,
                        contentDescription = null,
                        tint = gold,
                        modifier = Modifier.size(12.dp),
                    )
                }
                Text(
                    text = "آراء وأقلام",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 17.sp,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                )
            }
            Row(
                modifier = Modifier.clickable { onSeeAllClick() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = "الكل",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 12.sp,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Black,
                        color = gold,
                    ),
                )
                androidx.compose.material3.Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = null,
                    tint = gold,
                    modifier = Modifier.size(11.dp),
                )
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            items(opinions, key = { it.id }) { opinion ->
                OpinionCard(opinion = opinion, onClick = { onArticleClick(opinion) })
            }
        }
    }
}

@Composable
private fun OpinionCard(opinion: Article, onClick: () -> Unit) {
    val gold = SabqTheme.colors.gold
    val primary = SabqTheme.colors.primaryEnd
    val cardShape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp)
    Column(
        modifier = Modifier
            .width(200.dp)
            .clip(cardShape)
            .background(SabqTheme.colors.surface, cardShape)
            .clickable { onClick() },
    ) {
        Box(
            modifier = Modifier
                .width(200.dp)
                .height(120.dp),
        ) {
            if (!opinion.imageUrl.isNullOrBlank()) {
                coil.compose.SubcomposeAsyncImage(
                    model = opinion.imageUrl,
                    contentDescription = null,
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                    loading = { OpinionPlaceholder(gold = gold, primary = primary) },
                    error = { OpinionPlaceholder(gold = gold, primary = primary) },
                )
            } else {
                OpinionPlaceholder(gold = gold, primary = primary)
            }
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        androidx.compose.ui.graphics.Brush.verticalGradient(
                            listOf(Color.Transparent, Color.Black.copy(alpha = 0.7f)),
                        ),
                    ),
            )
            opinion.authorName?.takeIf { it.isNotBlank() }?.let { name ->
                Row(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(
                                androidx.compose.ui.graphics.Brush.linearGradient(
                                    listOf(gold, primary),
                                ),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = name.take(1),
                            style = SabqTheme.typography.metaSmall.copy(
                                fontSize = 11.sp,
                                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                                color = Color.White,
                            ),
                        )
                    }
                    Text(
                        text = name,
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                            color = Color.White,
                        ),
                        maxLines = 1,
                    )
                }
            }
        }
        Column(
            modifier = Modifier.padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = opinion.title,
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 13.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                    color = SabqTheme.colors.ink,
                ),
                maxLines = 2,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = opinion.readingTime,
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 10.sp,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                        color = SabqTheme.colors.tertiaryInk,
                    ),
                )
                Text(
                    text = opinion.dateFormatted,
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 10.sp,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                        color = SabqTheme.colors.tertiaryInk,
                    ),
                )
            }
        }
    }
}

@Composable
private fun OpinionPlaceholder(gold: Color, primary: Color) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                androidx.compose.ui.graphics.Brush.linearGradient(
                    listOf(gold.copy(alpha = 0.2f), primary.copy(alpha = 0.1f)),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Icon(
            imageVector = Icons.Filled.FormatQuote,
            contentDescription = null,
            tint = gold.copy(alpha = 0.4f),
            modifier = Modifier.size(32.dp),
        )
    }
}

// MARK: - Trending preview (top-3 list)

@Composable
private fun TrendingPreviewBlock(
    trending: List<Article>,
    onArticleClick: (Article) -> Unit,
) {
    val orange = Color(red = 0.98f, green = 0.45f, blue = 0.09f)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                androidx.compose.material3.Icon(
                    imageVector = Icons.Filled.LocalFireDepartment,
                    contentDescription = null,
                    tint = orange,
                    modifier = Modifier
                        .padding(top = 2.dp)
                        .size(16.dp),
                )
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = "الأكثر تداولاً",
                        style = SabqTheme.typography.cardTitle.copy(
                            fontSize = 17.sp,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                            color = SabqTheme.colors.ink,
                        ),
                    )
                    Text(
                        text = "خلال آخر 48 ساعة",
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                            color = SabqTheme.colors.tertiaryInk,
                        ),
                    )
                }
            }
        }
        SurfaceCard {
            trending.forEachIndexed { idx, article ->
                if (idx > 0) {
                    HorizontalDivider(
                        color = SabqTheme.colors.outline.copy(alpha = 0.3f),
                        thickness = 0.5.dp,
                    )
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onArticleClick(article) }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        text = "${idx + 1}",
                        style = SabqTheme.typography.cardTitle.copy(
                            fontSize = 18.sp,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.Black,
                            color = if (idx < 3) orange else SabqTheme.colors.tertiaryInk,
                        ),
                        modifier = Modifier.size(28.dp),
                    )
                    Text(
                        text = article.title,
                        style = SabqTheme.typography.cardTitle.copy(
                            fontSize = 14.sp,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                            color = SabqTheme.colors.ink,
                        ),
                        maxLines = 2,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

// MARK: - Stories rail

@Composable
private fun StoriesRail(
    stories: List<com.sabq.smart.data.Story>,
    onStoryClick: (com.sabq.smart.data.Story) -> Unit,
) {
    LazyRow(
        modifier = Modifier.padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        items(stories, key = { it.id }) { story ->
            StoryBubble(story = story, onClick = { onStoryClick(story) })
        }
    }
}

@Composable
private fun StoryBubble(
    story: com.sabq.smart.data.Story,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier.clickable { onClick() },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier.size(68.dp),
            contentAlignment = Alignment.Center,
        ) {
            // Brand-gradient ring
            Box(
                modifier = Modifier
                    .size(68.dp)
                    .clip(CircleShape)
                    .background(
                        androidx.compose.ui.graphics.Brush.linearGradient(
                            listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                        ),
                    ),
            )
            // Inner image
            Box(
                modifier = Modifier
                    .size(60.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.surface),
                contentAlignment = Alignment.Center,
            ) {
                if (!story.imageUrl.isNullOrBlank()) {
                    coil.compose.SubcomposeAsyncImage(
                        model = story.imageUrl,
                        contentDescription = story.title,
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                        modifier = Modifier
                            .size(60.dp)
                            .clip(CircleShape),
                        loading = { StoryPlaceholder() },
                        error = { StoryPlaceholder() },
                    )
                } else {
                    StoryPlaceholder()
                }
            }
        }
        Text(
            text = story.title,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 11.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            ),
            maxLines = 1,
            modifier = Modifier.width(72.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

@Composable
private fun StoryPlaceholder() {
    Box(
        modifier = Modifier
            .size(60.dp)
            .clip(CircleShape)
            .background(
                androidx.compose.ui.graphics.Brush.linearGradient(
                    listOf(
                        SabqTheme.colors.primaryEnd.copy(alpha = 0.15f),
                        SabqTheme.colors.primaryStart.copy(alpha = 0.05f),
                    ),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
            contentDescription = null,
            tint = SabqTheme.colors.primaryEnd.copy(alpha = 0.5f),
            modifier = Modifier.size(22.dp),
        )
    }
}

// MARK: - Calendar today card

@Composable
private fun CalendarTodayCard(events: List<com.sabq.smart.data.CalendarEvent>) {
    val gold = SabqTheme.colors.gold
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionRow(title = "أحداث اليوم القادمة", icon = Icons.Filled.CalendarMonth, tint = gold)
        val shape = androidx.compose.foundation.shape.RoundedCornerShape(SabqTheme.dimens.tileRadius)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(SabqTheme.colors.surface, shape)
                .border(width = 0.5.dp, color = gold.copy(alpha = 0.18f), shape = shape)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            events.forEach { event ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .width(3.dp)
                            .height(28.dp)
                            .clip(androidx.compose.foundation.shape.RoundedCornerShape(3.dp))
                            .background(gold),
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = event.title,
                            style = SabqTheme.typography.cardTitle.copy(
                                fontSize = 13.sp,
                                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                                color = SabqTheme.colors.ink,
                            ),
                            maxLines = 1,
                        )
                        if ((event.importance ?: 0) >= 4) {
                            Text(
                                text = "حدث بارز",
                                style = SabqTheme.typography.metaSmall.copy(
                                    fontSize = 10.sp,
                                    fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                                    color = SabqTheme.colors.tertiaryInk,
                                ),
                            )
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Audio newsletter card

@Composable
private fun AudioNewsletterCard(newsletter: com.sabq.smart.data.AudioNewsletter) {
    val coral = SabqTheme.colors.coral
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionRow(title = "النشرات الصوتية", icon = Icons.Filled.GraphicEq, tint = coral)
        val shape = androidx.compose.foundation.shape.RoundedCornerShape(SabqTheme.dimens.tileRadius)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(SabqTheme.colors.surface, shape)
                .border(width = 0.5.dp, color = coral.copy(alpha = 0.18f), shape = shape)
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(androidx.compose.foundation.shape.RoundedCornerShape(14.dp))
                    .background(
                        androidx.compose.ui.graphics.Brush.linearGradient(
                            listOf(coral.copy(alpha = 0.30f), SabqTheme.colors.primaryEnd.copy(alpha = 0.18f)),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                androidx.compose.material3.Icon(
                    imageVector = Icons.Filled.GraphicEq,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.8f),
                    modifier = Modifier.size(20.dp),
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = newsletter.title,
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 14.sp,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Black,
                        color = SabqTheme.colors.ink,
                    ),
                    maxLines = 2,
                )
                newsletter.durationSeconds?.let { sec ->
                    Text(
                        text = "${sec / 60} دقيقة استماع",
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                            color = SabqTheme.colors.tertiaryInk,
                        ),
                    )
                }
            }
            androidx.compose.material3.Icon(
                imageVector = Icons.Filled.PlayCircleFilled,
                contentDescription = "تشغيل",
                tint = coral,
                modifier = Modifier.size(28.dp),
            )
        }
    }
}

@Composable
private fun SectionRow(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .size(26.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            androidx.compose.material3.Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(12.dp),
            )
        }
        Text(
            text = title,
            style = SabqTheme.typography.cardTitle.copy(
                fontSize = 16.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Black,
                color = SabqTheme.colors.ink,
            ),
        )
    }
}

@Suppress("unused")
private val _markers = listOf<Any>(Color.Transparent)
