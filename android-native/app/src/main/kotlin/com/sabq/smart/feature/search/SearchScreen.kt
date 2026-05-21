package com.sabq.smart.feature.search

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.Article
import com.sabq.smart.feature.explore.RecentSearchesViewModel
import com.sabq.smart.feature.explore.SearchUiState
import com.sabq.smart.feature.explore.SearchViewModel
import com.sabq.smart.ui.components.CompactArticleRow
import com.sabq.smart.ui.components.CompactScreenHeader
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.components.SabqSearchBar
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme

/**
 * "البحث" — dedicated search screen ported from iOS `SearchView`
 * (`Screens/SearchView.swift`). Reuses the same `SearchViewModel` and
 * `RecentSearchesViewModel` Explore depends on; the difference vs.
 * Explore is the framing — Explore opens with a categories grid and
 * uses search as a secondary mode, whereas SearchScreen opens with
 * the search bar focused and the idle content is just
 * recent-searches + trending tags. iOS ships both as separate tabs
 * (SearchView.swift:33–66).
 *
 * Layout (top → bottom):
 *   1. Back chevron top bar.
 *   2. CompactScreenHeader ("البحث" + "ابحث في آلاف الأخبار المحلية…")
 *   3. SabqSearchBar.
 *   4. Idle (no query): trending tags FlowRow + recent searches list.
 *   5. Searching: spinner.
 *   6. Results: count chip + CompactArticleRow list inside a SurfaceCard.
 *   7. Empty / error: shared EmptyStateView / ErrorStateView.
 */
@Composable
fun SearchScreen(
    onBack: () -> Unit,
    onArticleClick: (Article) -> Unit,
    onTagClick: (String) -> Unit,
    searchViewModel: SearchViewModel = hiltViewModel(),
    recentViewModel: RecentSearchesViewModel = hiltViewModel(),
    trendingTags: List<String> = DefaultTrendingTags,
) {
    val query by searchViewModel.query.collectAsStateWithLifecycle()
    val state by searchViewModel.state.collectAsStateWithLifecycle()
    val recents by recentViewModel.items.collectAsStateWithLifecycle()
    val hasQuery = query.trim().length >= 2

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        SearchTopBar(onBack = onBack)

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = SabqTheme.dimens.screenPaddingH,
                end = SabqTheme.dimens.screenPaddingH,
                top = 18.dp,
                bottom = SabqTheme.dimens.tabBarSafeArea,
            ),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item {
                CompactScreenHeader(
                    title = "البحث",
                    subtitle = "ابحث في آلاف الأخبار المحلية والعالمية",
                )
            }

            item {
                SabqSearchBar(
                    value = query,
                    onValueChange = { searchViewModel.setQuery(it) },
                )
            }

            if (!hasQuery) {
                if (trendingTags.isNotEmpty()) {
                    item {
                        TrendingTagsBlock(tags = trendingTags, onTagClick = onTagClick)
                    }
                }
                if (recents.isNotEmpty()) {
                    item {
                        RecentSearchesBlock(
                            recents = recents,
                            onPickRecent = { searchViewModel.setQuery(it) },
                            onClear = { recentViewModel.clear() },
                        )
                    }
                }
            } else {
                item {
                    SearchResultsBlock(
                        state = state,
                        onArticleClick = { article ->
                            recentViewModel.add(query.trim())
                            onArticleClick(article)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun SearchTopBar(onBack: () -> Unit) {
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
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TrendingTagsBlock(tags: List<String>, onTagClick: (String) -> Unit) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.4f), shape = shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SectionTitle(
            icon = Icons.Filled.LocalFireDepartment,
            title = "الأكثر بحثاً",
            tint = SabqTheme.colors.coral,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            tags.take(14).forEach { tag ->
                KeywordPill(keyword = tag, onClick = { onTagClick(tag) })
            }
        }
    }
}

@Composable
private fun KeywordPill(keyword: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(SabqTheme.colors.paleFill, CircleShape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.35f), shape = CircleShape)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        Text(
            text = "#$keyword",
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.ink,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RecentSearchesBlock(
    recents: List<String>,
    onPickRecent: (String) -> Unit,
    onClear: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SectionTitle(
                icon = Icons.Filled.History,
                title = "آخر عمليات البحث",
                tint = SabqTheme.colors.secondaryInk,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "مسح",
                style = SabqTheme.typography.smallActionButton,
                color = SabqTheme.colors.tertiaryInk,
                modifier = Modifier
                    .clip(CircleShape)
                    .clickable(onClick = onClear)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            recents.take(10).forEach { recent ->
                RecentPill(text = recent, onClick = { onPickRecent(recent) })
            }
        }
    }
}

@Composable
private fun RecentPill(text: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(SabqTheme.colors.softFill, CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.Search,
            contentDescription = null,
            tint = SabqTheme.colors.secondaryInk,
            modifier = Modifier.size(10.dp),
        )
        Text(
            text = text,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
        )
    }
}

@Composable
private fun SearchResultsBlock(
    state: SearchUiState,
    onArticleClick: (Article) -> Unit,
) {
    when (state) {
        SearchUiState.Idle -> {
            // Caller filters out hasQuery=false; if we land here while
            // hasQuery=true the VM hasn't yet emitted Searching — show
            // a brief hint while the debounce window settles.
            Box(
                modifier = Modifier.fillMaxWidth().padding(top = 32.dp),
                contentAlignment = Alignment.TopCenter,
            ) {
                Text(
                    text = "اكتب كلمتين على الأقل لبدء البحث",
                    fontSize = 13.sp,
                    color = SabqTheme.colors.tertiaryInk,
                )
            }
        }
        is SearchUiState.Searching -> Box(
            modifier = Modifier.fillMaxWidth().padding(top = 32.dp),
            contentAlignment = Alignment.TopCenter,
        ) {
            CircularProgressIndicator(
                color = SabqTheme.colors.primaryEnd,
                strokeWidth = 2.dp,
                modifier = Modifier.size(22.dp),
            )
        }
        is SearchUiState.Error -> EmptyStateView(
            icon = Icons.Filled.Search,
            tint = SabqTheme.colors.coral,
            title = "تعذّر البحث",
            subtitle = state.message,
        )
        is SearchUiState.Results -> {
            if (state.items.isEmpty()) {
                EmptyStateView(
                    icon = Icons.Filled.Search,
                    tint = SabqTheme.colors.tertiaryInk,
                    title = "لا توجد نتائج",
                    subtitle = "جرّب كلمات مختلفة أو تصفّح الأقسام.",
                )
                return
            }
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(
                    text = "${state.total.coerceAtLeast(state.items.size)} نتيجة",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.tertiaryInk,
                )
                SurfaceCard {
                    state.items.forEachIndexed { index, article ->
                        if (index > 0) {
                            HorizontalDivider(
                                color = SabqTheme.colors.outline.copy(alpha = 0.3f),
                                thickness = 0.5.dp,
                            )
                        }
                        CompactArticleRow(
                            article = article,
                            isBookmarked = false,
                            onBookmark = {},
                            onClick = { onArticleClick(article) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(
    icon: ImageVector,
    title: String,
    tint: Color,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(12.dp))
        Text(
            text = title,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
    }
}

/** iOS default trending tags from SearchView.swift:10. */
private val DefaultTrendingTags = listOf(
    "نيوم",
    "رؤية 2030",
    "الدوري السعودي",
    "أرامكو",
)
