package com.sabq.smart.feature.explore

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.History
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleCategory
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.data.RecentSearchesStore
import com.sabq.smart.data.Section
import com.sabq.smart.ui.components.CompactArticleRow
import com.sabq.smart.ui.components.CompactScreenHeader
import com.sabq.smart.ui.components.SabqSearchBar
import com.sabq.smart.ui.components.SmallSquareBadge
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class ExploreViewModel @Inject constructor(
    @Suppress("unused") savedState: SavedStateHandle,
    private val repo: ArticleRepository,
) : ViewModel() {
    private val _sections = MutableStateFlow<List<Section>>(emptyList())
    val sections: StateFlow<List<Section>> = _sections.asStateFlow()

    private val _trendingKeywords = MutableStateFlow<List<String>>(emptyList())
    val trendingKeywords: StateFlow<List<String>> = _trendingKeywords.asStateFlow()

    init {
        viewModelScope.launch {
            runCatching { repo.getSections() }
                .onSuccess { _sections.value = it }
        }
        viewModelScope.launch {
            runCatching { repo.getTrendingKeywords() }
                .onSuccess { _trendingKeywords.value = it }
        }
    }
}

/**
 * Explore tab — 1:1 port of iOS `ExploreView`
 * (`Screens/ExploreView.swift`).
 *
 * Layout (top → bottom):
 *   1. CompactScreenHeader ("استكشف" + subtitle)
 *   2. SabqSearchBar
 *   3a. Idle: trending pills (الأكثر بحثاً) → sections grid → recent searches
 *   3b. Searching: result count + CompactArticleRow list
 */
@Composable
fun ExploreScreen(
    sectionsViewModel: ExploreViewModel = hiltViewModel(),
    searchViewModel: SearchViewModel = hiltViewModel(),
    recentSearchesViewModel: RecentSearchesViewModel = hiltViewModel(),
    onArticleClick: (Article) -> Unit = {},
) {
    val sections by sectionsViewModel.sections.collectAsStateWithLifecycle()
    val trending by sectionsViewModel.trendingKeywords.collectAsStateWithLifecycle()
    val query by searchViewModel.query.collectAsStateWithLifecycle()
    val searchState by searchViewModel.state.collectAsStateWithLifecycle()
    val recentSearches by recentSearchesViewModel.items.collectAsStateWithLifecycle()
    val hasQuery = query.trim().length >= 2

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background)
            .statusBarsPadding(),
        contentPadding = PaddingValues(
            start = SabqTheme.dimens.screenPaddingH,
            end = SabqTheme.dimens.screenPaddingH,
            top = 18.dp,
            bottom = SabqTheme.dimens.tabBarSafeArea,
        ),
        verticalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        item {
            CompactScreenHeader(
                title = "استكشف",
                subtitle = "تصفّح الأقسام والمواضيع الأكثر تأثيراً",
            )
        }

        item {
            SabqSearchBar(
                value = query,
                onValueChange = { searchViewModel.setQuery(it) },
            )
        }

        if (hasQuery) {
            item {
                SearchResultsBody(
                    state = searchState,
                    onArticleClick = { article ->
                        recentSearchesViewModel.add(query.trim())
                        onArticleClick(article)
                    },
                )
            }
        } else {
            if (trending.isNotEmpty()) {
                item { TrendingPillsSection(keywords = trending) }
            }
            item { SectionsGridSection(sections = sections) }
            if (recentSearches.isNotEmpty()) {
                item {
                    RecentSearchesSection(
                        recents = recentSearches,
                        onPickRecent = { searchViewModel.setQuery(it) },
                        onClear = { recentSearchesViewModel.clear() },
                    )
                }
            }
        }
    }
}

// ============================================================
// Trending pills (الأكثر بحثاً)
// ============================================================

@Composable
private fun TrendingPillsSection(keywords: List<String>) {
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
        FlowChips(items = keywords.take(14)) { keyword ->
            // No-op for now — keyword nav lands via KeywordArticlesScreen
            // in a follow-up wire (the screen already exists; explore is
            // missing the link). Until then the pills are read-only.
            KeywordPill(keyword = keyword)
        }
    }
}

@Composable
private fun KeywordPill(keyword: String) {
    val shape = CircleShape
    Box(
        modifier = Modifier
            .clip(shape)
            .background(SabqTheme.colors.paleFill, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.35f), shape = shape)
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

// ============================================================
// Sections grid (تصفّح حسب التصنيف)
// ============================================================

@Composable
private fun SectionsGridSection(sections: List<Section>) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle(
            icon = Icons.Outlined.GridView,
            title = "تصفّح حسب التصنيف",
            tint = SabqTheme.colors.primaryEnd,
        )
        if (sections.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    color = SabqTheme.colors.primaryEnd,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(22.dp),
                )
            }
        } else {
            // 2-col grid as Compose Rows (avoids nesting LazyVerticalGrid
            // inside an outer LazyColumn — Compose forbids that).
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                sections.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        pair.forEach { section ->
                            ExploreTile(section = section, modifier = Modifier.weight(1f))
                        }
                        if (pair.size == 1) {
                            androidx.compose.foundation.layout.Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

/**
 * 1:1 port of iOS `CategoryTile`
 * (`Components/SabqComponents.swift:1483-1550`).
 *
 * Key visual notes the user called out:
 *   - **No heavy shadow** — iOS uses `shadow(SabqTheme.shadow, radius:8, y:3)`
 *     which is 0.05 opacity. Compose equivalent: tiny elevation 1.dp with
 *     spotColor = SabqTheme.colors.shadow. Ambient color is transparent
 *     so the shadow only sits *below* the tile, matching iOS y:3.
 *   - **Gradient background** — `tint.opacity(0.08) → surface`, top-leading
 *     to bottom-trailing.
 *   - **Tint stroke** — `tint.opacity(0.18), 0.6dp`.
 *   - **Chevron** — `chevron.left` at top-trailing, font 11pt heavy,
 *     `tint.opacity(0.6)`.
 *   - **No article count** — iOS removed it because it dominated the
 *     tile; we follow.
 *   - Title: 17sp Bold (matches iOS `system(size:17, weight: .bold, design: .rounded)`).
 *   - Subtitle: 12sp Medium tertiaryInk, max 2 lines.
 */
@Composable
private fun ExploreTile(section: Section, modifier: Modifier = Modifier) {
    val visual = ArticleCategory.fromSlug(section.slug)
    val tint = visual.tint()
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .shadow(
                elevation = 1.dp,
                shape = shape,
                ambientColor = Color.Transparent,
                spotColor = SabqTheme.colors.shadow,
            )
            .clip(shape)
            .background(
                brush = androidx.compose.ui.graphics.Brush.linearGradient(
                    colors = listOf(
                        tint.copy(alpha = 0.08f),
                        SabqTheme.colors.surface,
                    ),
                ),
                shape = shape,
            )
            .border(width = 0.6.dp, color = tint.copy(alpha = 0.18f), shape = shape)
            .clickable { /* TODO: navigate to a category-filtered list */ }
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
        ) {
            SmallSquareBadge(icon = visual.icon, tint = tint)
            androidx.compose.foundation.layout.Spacer(modifier = Modifier.weight(1f))
            // iOS uses `chevron.left` because content is always RTL.
            // Compose's AutoMirrored.KeyboardArrowLeft flips with layout
            // direction — in RTL it visually becomes a left chevron,
            // matching iOS exactly.
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                contentDescription = null,
                tint = tint.copy(alpha = 0.6f),
                modifier = Modifier
                    .padding(top = 6.dp)
                    .size(14.dp),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = section.name,
                style = SabqTheme.typography.tileTitle,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = visual.subtitle,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
                maxLines = 2,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
        }
    }
}

// ============================================================
// Recent searches (آخر عمليات البحث)
// ============================================================

@Composable
private fun RecentSearchesSection(
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
                icon = Icons.Outlined.History,
                title = "آخر عمليات البحث",
                tint = SabqTheme.colors.secondaryInk,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "مسح",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.tertiaryInk,
                modifier = Modifier
                    .clip(CircleShape)
                    .clickable(onClick = onClear)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
        FlowChips(items = recents.take(10)) { recent ->
            RecentPill(text = recent, onClick = { onPickRecent(recent) })
        }
    }
}

@Composable
private fun RecentPill(text: String, onClick: () -> Unit) {
    val shape = CircleShape
    Row(
        modifier = Modifier
            .clip(shape)
            .background(SabqTheme.colors.softFill, shape)
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

// ============================================================
// Search results body
// ============================================================

@Composable
private fun SearchResultsBody(
    state: SearchUiState,
    onArticleClick: (Article) -> Unit,
) {
    when (state) {
        SearchUiState.Idle -> EmptyHint("اكتب كلمتين على الأقل لبدء البحث")
        is SearchUiState.Searching -> Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 24.dp),
            contentAlignment = Alignment.TopCenter,
        ) {
            CircularProgressIndicator(
                color = SabqTheme.colors.primaryEnd,
                strokeWidth = 2.dp,
                modifier = Modifier.size(22.dp),
            )
        }
        is SearchUiState.Error -> EmptyHint("تعذّر البحث: ${state.message}")
        is SearchUiState.Results -> ResultsBlock(state = state, onArticleClick = onArticleClick)
    }
}

@Composable
private fun ResultsBlock(state: SearchUiState.Results, onArticleClick: (Article) -> Unit) {
    if (state.items.isEmpty()) {
        EmptyHint("لا توجد نتائج لـ \"${state.query}\"")
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

@Composable
private fun EmptyHint(text: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 32.dp),
        contentAlignment = Alignment.TopCenter,
    ) {
        Text(
            text = text,
            fontSize = 13.sp,
            color = SabqTheme.colors.tertiaryInk,
        )
    }
}

// ============================================================
// Atoms
// ============================================================

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

/** Simple flow layout via chunked Rows — Compose Foundation 1.6+
 *  ships a real FlowRow but we stay 1.5-compatible by chunking. */
@Composable
private fun <T> FlowChips(items: List<T>, content: @Composable (T) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { content(it) }
            }
        }
    }
}
