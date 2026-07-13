package com.sabq.smart.feature.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PlayCircleFilled
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material.icons.outlined.Podcasts
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.border
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.R
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleCategory
import com.sabq.smart.data.Section
import com.sabq.smart.feature.auth.AuthViewModel
import com.sabq.smart.feature.notifications.EditorialBellViewModel
import com.sabq.smart.feature.settings.SettingsViewModel
import com.sabq.smart.ui.components.BreakingTickerBar
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
    onSearchClick: () -> Unit = {},
    onMomentByMomentClick: () -> Unit = {},
    onNotificationsClick: () -> Unit = {},
    onOpinionsAllClick: () -> Unit = {},
    onTrendingAllClick: () -> Unit = {},
    onWorldCupClick: () -> Unit = {},
    onGulfCupClick: () -> Unit = {},
    onAsianCupClick: () -> Unit = {},
    onCalendarAllClick: () -> Unit = {},
    onGreetingClick: () -> Unit = {},
    onLoyaltyClick: () -> Unit = {},
    onStoryClick: (com.sabq.smart.data.Story) -> Unit = {},
    onAudioNewslettersClick: () -> Unit = {},
    onHajjArticleClick: (com.sabq.smart.data.HajjArticle) -> Unit = {},
    onMuqtarabAllClick: () -> Unit = {},
    onMuqtarabTopicClick: (angleSlug: String, topicSlug: String) -> Unit = { _, _ -> },
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
                currentUser = currentUser,
                onSectionSelect = viewModel::selectSection,
                onBookmark = viewModel::toggleBookmark,
                onArticleClick = onArticleClick,
                onSearchClick = onSearchClick,
                onMomentByMomentClick = onMomentByMomentClick,
                onNotificationsClick = onNotificationsClick,
                onOpinionsAllClick = onOpinionsAllClick,
                onTrendingAllClick = onTrendingAllClick,
                onWorldCupClick = onWorldCupClick,
                onGulfCupClick = onGulfCupClick,
                onAsianCupClick = onAsianCupClick,
                onCalendarAllClick = onCalendarAllClick,
                onGreetingClick = onGreetingClick,
                onLoyaltyClick = onLoyaltyClick,
                onStoryClick = onStoryClick,
                onAudioNewslettersClick = onAudioNewslettersClick,
                onHajjArticleClick = onHajjArticleClick,
                onMuqtarabAllClick = onMuqtarabAllClick,
                onMuqtarabTopicClick = onMuqtarabTopicClick,
                onToggleDarkMode = {
                    // Mirrors iOS: tapping the header sun/moon flips the
                    // user's explicit darkMode flag. If the user was in
                    // "follow system" mode, drop that so the explicit
                    // toggle wins.
                    if (settings.followsSystemDark) settingsViewModel.setFollowsSystem(false)
                    settingsViewModel.setDarkMode(!isDarkMode)
                },
                onEndReached = viewModel::loadMore,
                onRefresh = viewModel::refresh,
            )
        }
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun LoadedFeed(
    state: HomeFeedUiState.Loaded,
    isDarkMode: Boolean,
    showNotificationsBell: Boolean,
    notificationsUnreadCount: Int,
    currentUser: com.sabq.smart.data.User?,
    onSectionSelect: (String?) -> Unit,
    onBookmark: (String) -> Unit,
    onArticleClick: (Article) -> Unit,
    onSearchClick: () -> Unit,
    onMomentByMomentClick: () -> Unit,
    onNotificationsClick: () -> Unit,
    onOpinionsAllClick: () -> Unit,
    onTrendingAllClick: () -> Unit,
    onWorldCupClick: () -> Unit,
    onGulfCupClick: () -> Unit,
    onAsianCupClick: () -> Unit,
    onCalendarAllClick: () -> Unit,
    onGreetingClick: () -> Unit,
    onLoyaltyClick: () -> Unit,
    onStoryClick: (com.sabq.smart.data.Story) -> Unit,
    onAudioNewslettersClick: () -> Unit,
    onHajjArticleClick: (com.sabq.smart.data.HajjArticle) -> Unit,
    onMuqtarabAllClick: () -> Unit,
    onMuqtarabTopicClick: (angleSlug: String, topicSlug: String) -> Unit,
    onToggleDarkMode: () -> Unit,
    onEndReached: () -> Unit,
    onRefresh: () -> Unit,
) {
    val listState = rememberLazyListState()
    val uriHandler = LocalUriHandler.current
    // «المزيد اليوم» — الكتل الثانوية خلف زر إفصاح واحد، مطوي افتراضيًا
    // (iOS HomeFeedView.swift:690 moreTodaySection + showMoreToday).
    var showMoreToday by rememberSaveable { mutableStateOf(false) }

    // Re-tap on the bottom Home tab → smooth-scroll to top + refresh.
    // Wired via [TabReselectBus] which fires only when the user taps
    // the already-active Home tab (mirrors iOS SabqTabBar.onSelect).
    LaunchedEffect(Unit) {
        com.sabq.smart.nav.TabReselectBus.home.collect {
            listState.animateScrollToItem(0)
            onRefresh()
        }
    }

    // Drop statusBarsPadding from the PullToRefreshBox modifier and
    // move it into LazyColumn's contentPadding — when the padding sat
    // on the Box, the indicator's origin was pushed below the status
    // bar AND landed inside the HomeHeaderBar's opaque background,
    // so a pull would trigger onRefresh but the user saw nothing
    // happen. Box now fills the full screen; the indicator floats at
    // the top edge above the content. Reported 2026-05-24.
    androidx.compose.material3.pulltorefresh.PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize(),
    ) {
    LazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize(),
        contentPadding = PaddingValues(
            start = SabqTheme.dimens.screenPaddingH,
            end = SabqTheme.dimens.screenPaddingH,
            top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 16.dp,
            bottom = SabqTheme.dimens.tabBarSafeArea,
        ),
        verticalArrangement = Arrangement.spacedBy(SabqTheme.dimens.sectionGap),
    ) {
        item {
            HomeHeaderBar(
                isDarkMode = isDarkMode,
                showNotificationsBell = showNotificationsBell,
                notificationsUnreadCount = notificationsUnreadCount,
                onSearchClick = onSearchClick,
                onMomentByMomentClick = onMomentByMomentClick,
                onNotificationsClick = onNotificationsClick,
                onToggleDarkMode = onToggleDarkMode,
            )
        }

        // Time-aware Arabic greeting block — ports iOS
        // `HomeFeedView.greetingBlock` (lines 878-1001).
        item { GreetingBlock(onClick = onGreetingClick) }

        // عاجل — الشريط الوحيد المسموح فوق الهيرو (iOS HomeFeedView.swift:
        // 157-164): شريط لوحة التحكم الدوّار أولًا، وعند غيابه نسقط
        // للبطاقة المفردة القديمة (خبر بنوع "breaking").
        if (state.breakingTicker.isNotEmpty()) {
            item {
                BreakingTickerBar(
                    headlines = state.breakingTicker,
                    onHeadlineClick = { headline ->
                        val slug = headline.linkedArticleSlug
                        if (slug != null) {
                            // نفس مسار فتح المقال بالـ slug الذي تستخدمه
                            // بطاقة العاجل المفردة (SabqApp ينقل بالـ slug).
                            onArticleClick(
                                Article(
                                    id = headline.id,
                                    title = headline.headline,
                                    excerpt = "",
                                    category = ArticleCategory.Local,
                                    imageUrl = null,
                                    readingTime = "",
                                    dateFormatted = "",
                                    isBreaking = true,
                                    slug = slug,
                                ),
                            )
                        } else {
                            headline.externalUrl?.let { uriHandler.openUri(it) }
                        }
                    },
                )
            }
        } else {
            state.breaking?.let { breaking ->
                item {
                    BreakingNewsPill(
                        article = breaking,
                        onClick = { onArticleClick(breaking) },
                    )
                }
            }
        }

        // Featured carousel — الهيرو مباشرة بعد العاجل وقبل أشرطة
        // البطولات (iOS HomeFeedView.swift:166-175).
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

        // شريط كأس العالم 2026 — يختفي كليًا عند غياب البيانات.
        // (خليجي 27 غير معروض في الرئيسية مطابقةً لتطبيق iOS.)
        item {
            com.sabq.smart.feature.worldcup.WorldCupHomeStrip(onClick = onWorldCupClick)
        }

        // شريط كأس آسيا — مقيّد بالخادم: يختفي عند blockHidden أو قبل
        // وصول overview (انظر AsianCupHomeStrip).
        item {
            com.sabq.smart.feature.asiancup.AsianCupHomeStrip(onClick = onAsianCupClick)
        }

        // "رحلتك المعرفية اليوم" — auth-gated personal-journey block.
        // 1:1 port of iOS HomeFeedView.personalJourneyBlock (lines
        // 1011-1187). Hidden for signed-out viewers because the
        // backend's /api/v1/insights/today 401s without a member
        // session.
        if (currentUser != null) {
            item {
                PersonalJourneyBlock(
                    insights = state.journeyInsights,
                    currentUser = currentUser,
                    loyaltyLifetimePoints = state.loyaltySummary?.lifetimePoints ?: 0,
                    onLoyaltyTap = onLoyaltyClick,
                )
            }
        }

        // الكتل الثانوية (ستوريز، صدى الحج، التقويم، النشرة الصوتية،
        // الترند) انتقلت إلى إفصاح «المزيد اليوم» أسفل الصفحة — مطابقة
        // iOS moreTodaySection (HomeFeedView.swift:690).

        // Category chips removed from Home per user direction
        // (2026-05-19) — categories live in the Explore tab. State +
        // filter logic kept in HomeFeedViewModel so we can re-introduce
        // them in a sheet later without re-wiring everything. iOS
        // HomeFeedView.swift line 162-165 mirrors this decision.

        // Latest list — header + list inside SurfaceCard + explicit
        // "تحميل المزيد" button (ports iOS HomeFeedView.swift:834-883).
        item { LatestNewsHeader() }
        item {
            SurfaceCard {
                // Rows live in their own zero-spacing Column so the
                // SurfaceCard content spacing never opens gaps between
                // them — iOS renders the list as ONE LazyVStack(spacing:
                // 0) child (HomeFeedView.swift:1025) where each row only
                // carries its call-site .padding(.vertical, 4) plus the
                // row's internal 6pt. No dividers: iOS draws none here
                // (the trending top-3 card is the one with Dividers).
                // Previously each row + a HorizontalDivider were direct
                // SurfaceCard children, so the 20dp spacedBy applied
                // twice per boundary (~48dp of air vs iOS's 20pt).
                Column {
                    state.articles.forEach { article ->
                        // Stable slot identity so appends ("تحميل المزيد")
                        // and pull-to-refresh recompose only changed rows
                        // instead of re-keying by position.
                        key(article.id) {
                            CompactArticleRow(
                                article = article,
                                isBookmarked = article.bookmarkKey in state.bookmarkedIds,
                                onBookmark = { onBookmark(article.bookmarkKey) },
                                onClick = { onArticleClick(article) },
                                isNew = article.id in state.recentlyAddedIds,
                                modifier = Modifier.padding(vertical = 4.dp),
                            )
                        }
                    }
                }
            }
        }

        // Explicit "تحميل المزيد" button — replaces the previous
        // auto-paginate-on-scroll behavior so the feed has a clear stop
        // point matching iOS (HomeFeedView.swift:863-879).
        if (state.hasMore && state.selectedSlug == null) {
            item {
                LoadMoreButton(
                    isLoading = state.isLoadingMore,
                    onClick = onEndReached,
                )
            }
        } else if (!state.hasMore && state.articles.isNotEmpty()) {
            item {
                Text(
                    text = "وصلت إلى نهاية الأخبار",
                    style = SabqTheme.typography.meta,
                    color = SabqTheme.colors.tertiaryInk,
                    modifier = Modifier.fillMaxWidth().padding(8.dp),
                )
            }
        }

        // مقالات الرأي و«مُقترب» تُعرضان أسفل «آخر الأخبار» — مطابقة iOS
        // (HomeFeedView.swift: opinionsPreviewSection ثم MuqtarabHomeStrip
        // بعد latestArticlesSection).

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

        // مُقترب — featured analytical topics strip + "الكل" link.
        // Hidden entirely when the backend returns no featured topics.
        if (state.muqtarabTopics.isNotEmpty()) {
            item {
                com.sabq.smart.feature.muqtarab.MuqtarabHomeStrip(
                    topics = state.muqtarabTopics,
                    onAllClick = onMuqtarabAllClick,
                    onTopicClick = onMuqtarabTopicClick,
                )
            }
        }

        // «المزيد اليوم» — إفصاح مطوي افتراضيًا يضم الكتل الثانوية
        // (iOS moreTodaySection, HomeFeedView.swift:690-746). كل كتلة
        // تحتفظ بشرط ظهورها الأصلي.
        item {
            MoreTodayToggle(
                expanded = showMoreToday,
                onToggle = { showMoreToday = !showMoreToday },
            )
        }
        if (showMoreToday) {
            // Stories rail — circular bubbles. Each bubble opens the
            // dedicated StoryDetailScreen via the parent's onStoryClick.
            if (state.stories.isNotEmpty()) {
                item { StoriesRail(stories = state.stories, onStoryClick = onStoryClick) }
            }

            // "صدى الحج" — seasonal block, hidden when out of season /
            // disabled / no articles (the repo returns null in those
            // cases, matching iOS `HajjBlockView` parity).
            state.hajjBlock?.let { hajj ->
                item {
                    HajjBlockSection(
                        block = hajj,
                        onArticleClick = onHajjArticleClick,
                    )
                }
            }

            // Today's calendar events.
            if (state.calendar.isNotEmpty()) {
                item { CalendarTodayCard(events = state.calendar, onSeeAllClick = onCalendarAllClick) }
            }

            // Audio newsletter card. Tap navigates to the dedicated
            // "النشرات الصوتية" list. iOS opens the same destination
            // from ContentView.swift:78 via the navigation stack.
            state.audioNewsletter?.let { newsletter ->
                item { AudioNewsletterCard(newsletter = newsletter, onClick = onAudioNewslettersClick) }
            }

            // Trending preview — top-3 list inside a SurfaceCard.
            if (state.trending.isNotEmpty()) {
                item {
                    TrendingPreviewBlock(
                        trending = state.trending,
                        onArticleClick = onArticleClick,
                        onSeeAllClick = onTrendingAllClick,
                    )
                }
            }
        }
    }
    }  // close PullToRefreshBox
}

/**
 * زر إفصاح «المزيد اليوم» — ports iOS `moreTodaySection` button
 * (HomeFeedView.swift:691-722): grid icon + label + chevron that
 * rotates 180° when expanded, on a surface tile with a thin outline.
 */
@Composable
private fun MoreTodayToggle(expanded: Boolean, onToggle: () -> Unit) {
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(SabqTheme.dimens.tileRadius)
    val chevronRotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        label = "more-today-chevron",
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.45f), shape = shape)
            .clickable { onToggle() }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.GridView,
            contentDescription = null,
            tint = SabqTheme.colors.primaryEnd,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = if (expanded) "إخفاء المزيد" else "المزيد اليوم",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 14.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                color = SabqTheme.colors.ink,
            ),
        )
        Spacer(modifier = Modifier.weight(1f))
        Icon(
            imageVector = Icons.Filled.KeyboardArrowDown,
            contentDescription = if (expanded) "إخفاء المزيد اليوم" else "عرض المزيد اليوم",
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier
                .size(16.dp)
                .rotate(chevronRotation),
        )
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
            pageSpacing = SabqTheme.dimens.pageSpacing,
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
                horizontalArrangement = Arrangement.spacedBy(7.dp, Alignment.CenterHorizontally),
            ) {
                repeat(articles.size) { i ->
                    val isActive = i == pagerState.currentPage
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(
                                if (isActive) SabqTheme.colors.primaryEnd
                                else SabqTheme.colors.ink.copy(alpha = 0.30f),
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
    // Ports iOS HomeFeedSkeleton (SabqComponents.swift:126-176).
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background)
            .verticalScroll(rememberScrollState()),
    ) {
        com.sabq.smart.ui.components.HomeFeedSkeleton()
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
    onSearchClick: () -> Unit,
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
            HeaderIcon(
                icon = Icons.Filled.Search,
                contentDescription = "بحث",
                onClick = onSearchClick,
            )
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
private fun GreetingBlock(onClick: () -> Unit = {}) {
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
    val tint = when (slot) {
        GreetingSlot.Morning   -> SabqTheme.colors.dawnTint
        GreetingSlot.Afternoon -> SabqTheme.colors.noonTint
        GreetingSlot.Evening   -> SabqTheme.colors.duskTint
        GreetingSlot.Night     -> SabqTheme.colors.nightTint
    }
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(SabqTheme.dimens.cardRadius)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            // Tint-aware warm halo — iOS `shadow(tint.opacity(0.08),
            // radius: 14, y: 6)`. Gives the greeting card a soft glow
            // that matches the time-of-day icon (dawn yellow, dusk
            // orange, night indigo…).
            .shadow(
                elevation = 7.dp,
                shape = shape,
                ambientColor = Color.Transparent,
                spotColor = tint.copy(alpha = 0.08f),
            )
            .clip(shape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.6f), shape)
            .background(tint.copy(alpha = 0.05f), shape)
            .border(width = 0.5.dp, color = tint.copy(alpha = 0.18f), shape = shape)
            .clickable { onClick() }
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
                style = SabqTheme.typography.greetingHeadline,
                color = SabqTheme.colors.ink,
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
) {
    Morning(greeting = "صباح الخير", icon = Icons.Filled.WbSunny),
    Afternoon(greeting = "نهارك سعيد", icon = Icons.Filled.WbSunny),
    Evening(greeting = "مساء الخير", icon = Icons.Filled.WbSunny),
    Night(greeting = "ليلة هادئة", icon = Icons.Filled.Bedtime),
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
        LazyRow(horizontalArrangement = Arrangement.spacedBy(SabqTheme.dimens.railGap)) {
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
    val cardShape = androidx.compose.foundation.shape.RoundedCornerShape(SabqTheme.dimens.mediaCardRadius)
    Column(
        modifier = Modifier
            .width(200.dp)
            // Subtle elevation per iOS — `shadow(.black.opacity(0.06),
            // radius: 8, y: 2)`. Keeps each opinion card "popping"
            // out of the rail.
            .shadow(
                elevation = 4.dp,
                shape = cardShape,
                ambientColor = Color.Transparent,
                spotColor = Color.Black.copy(alpha = 0.06f),
            )
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
                            listOf(Color.Transparent, SabqTheme.colors.mediaScrim),
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
    onSeeAllClick: () -> Unit = {},
) {
    val orange = SabqTheme.colors.trendingAccent
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.weight(1f),
            ) {
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
                        color = orange,
                    ),
                )
                androidx.compose.material3.Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = null,
                    tint = orange,
                    modifier = Modifier.size(11.dp),
                )
            }
        }
        SurfaceCard {
            // iOS emits one ForEach iteration per item — SwiftUI then applies
            // its VStack spacing between iteration boundaries, not between the
            // `(Divider, Row)` pair *inside* one iteration. Compose's
            // `forEachIndexed` would otherwise hand SurfaceCard's inner
            // `spacedBy(18.dp)` Column FIVE children (Row, Divider, Row,
            // Divider, Row) and add 4×18dp gaps. Wrapping each iteration in
            // its own Column collapses it back to 3 children = 2×18dp gaps,
            // matching iOS.
            trending
                .filter { it.title.isNotBlank() }
                .forEachIndexed { idx, article ->
                    Column {
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
                                modifier = Modifier.width(28.dp),
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
}

// MARK: - Stories rail

@Composable
private fun StoriesRail(
    stories: List<com.sabq.smart.data.Story>,
    onStoryClick: (com.sabq.smart.data.Story) -> Unit,
) {
    LazyRow(
        modifier = Modifier.padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(SabqTheme.dimens.railGap),
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
            // Brand-gradient ring — iOS uses `Circle().stroke(brand
            // gradient, lineWidth: 2.5)`. Compose can't paint a gradient
            // stroke directly, so we fake it: full 68dp gradient disc
            // with a 63dp surface disc on top, leaving exactly 2.5dp
            // of gradient visible at the edge. Previously the inner
            // disc was 60dp → a 4dp ring, which read as too thick.
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
            // Inner surface disc (63dp) — punches a hole through the
            // gradient so only the 2.5dp ring at the edge stays brand.
            Box(
                modifier = Modifier
                    .size(63.dp)
                    .clip(CircleShape)
                    .background(SabqTheme.colors.surface),
                contentAlignment = Alignment.Center,
            ) {
                // 60dp image — iOS exact. Sits inside the 63dp surface
                // disc with 1.5dp of surface visible around it.
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
private fun CalendarTodayCard(
    events: List<com.sabq.smart.data.CalendarEvent>,
    onSeeAllClick: () -> Unit = {},
) {
    val gold = SabqTheme.colors.gold
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(modifier = Modifier.weight(1f)) {
                SectionRow(title = "أحداث اليوم القادمة", icon = Icons.Filled.CalendarMonth, tint = gold)
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
private fun AudioNewsletterCard(
    newsletter: com.sabq.smart.data.AudioNewsletter,
    onClick: () -> Unit,
) {
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
                .clickable { onClick() }
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

/**
 * "آخر الأخبار" block header — newspaper icon + title + subtitle.
 * Ports iOS HomeFeedView.swift:834-848 (SectionHeader). Mirrors the
 * TrendingPreviewBlock header layout so all home blocks share the same
 * 19/bold title + 11/medium subtitle rhythm.
 */
@Composable
private fun LatestNewsHeader() {
    val accent = SabqTheme.colors.primaryEnd
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.Newspaper,
            contentDescription = null,
            tint = accent,
            modifier = Modifier
                .padding(top = 2.dp)
                .size(16.dp),
        )
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = "آخر الأخبار",
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 17.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = "تابع أحدث الأخبار المحلية والعالمية",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 11.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Medium,
                    color = SabqTheme.colors.tertiaryInk,
                ),
            )
        }
    }
}

/**
 * "تحميل المزيد" — explicit pagination trigger replacing the previous
 * scroll-end auto-loader. Ports iOS HomeFeedView.swift:863-879 button
 * behavior: shows a spinner while loading, hidden once `hasMore` is
 * false (handled by the caller).
 */
@Composable
private fun LoadMoreButton(isLoading: Boolean, onClick: () -> Unit) {
    val accent = SabqTheme.colors.primaryEnd
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))
            .clickable(enabled = !isLoading) { onClick() }
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                color = accent,
                strokeWidth = 2.dp,
                modifier = Modifier.size(18.dp),
            )
        } else {
            Text(
                text = "تحميل المزيد",
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 14.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                    color = accent,
                ),
            )
        }
    }
}

@Suppress("unused")
private val _markers = listOf<Any>(Color.Transparent)
