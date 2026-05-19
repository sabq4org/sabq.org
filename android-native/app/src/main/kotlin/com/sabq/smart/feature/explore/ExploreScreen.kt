package com.sabq.smart.feature.explore

import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.runtime.getValue
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.outlined.Podcasts
import androidx.compose.material3.Icon
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleCategory
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.data.Section
import com.sabq.smart.ui.components.CompactArticleRow
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
    private val repo: ArticleRepository,
) : ViewModel() {
    private val _sections = MutableStateFlow<List<Section>>(emptyList())
    val sections: StateFlow<List<Section>> = _sections.asStateFlow()

    init {
        viewModelScope.launch {
            runCatching { repo.getSections() }
                .onSuccess { _sections.value = it }
        }
    }
}

/**
 * Explore tab — sections grid + full-text search hybrid.
 *
 * When the search bar is empty: shows the 2-col grid of sections.
 * When the user types ≥ 2 chars: swaps the body to results from
 * `/api/v1/search?q=...` (debounced 350 ms). Hit-count shown at top
 * of the results.
 *
 * iOS counterpart: ExploreView + SearchView are separate; we merge
 * them under one tab because Android users expect search to be
 * reachable from the "discover" surface.
 */
@Composable
fun ExploreScreen(
    sectionsViewModel: ExploreViewModel = hiltViewModel(),
    searchViewModel: SearchViewModel = hiltViewModel(),
    onArticleClick: (Article) -> Unit = {},
    onOpinionsClick: () -> Unit = {},
    onMomentByMomentClick: () -> Unit = {},
) {
    val sections by sectionsViewModel.sections.collectAsStateWithLifecycle()
    val query by searchViewModel.query.collectAsStateWithLifecycle()
    val searchState by searchViewModel.state.collectAsStateWithLifecycle()
    val hasQuery = query.trim().length >= 2

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background)
            .statusBarsPadding()
            .padding(horizontal = SabqTheme.dimens.screenPaddingH)
            .padding(top = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("استكشف", style = SabqTheme.typography.screenTitle, color = SabqTheme.colors.ink)
        Text(
            "ابحث في 14 ألف مقال، أو تصفّح حسب القسم",
            style = SabqTheme.typography.meta,
            color = SabqTheme.colors.secondaryInk,
        )

        SabqSearchBar(
            value = query,
            onValueChange = { searchViewModel.setQuery(it) },
        )

        // Quick-entry rows above the sections grid — moment-by-moment
        // first (live indicator), then opinions. Hidden when the user
        // is actively searching.
        if (!hasQuery) {
            MomentByMomentEntryRow(onClick = onMomentByMomentClick)
            OpinionsEntryRow(onClick = onOpinionsClick)
        }

        Box(modifier = Modifier.fillMaxSize()) {
            if (hasQuery) {
                SearchResultsPane(searchState, onArticleClick)
            } else {
                SectionsGrid(sections)
            }
        }
    }
}

@Composable
private fun SearchResultsPane(
    state: SearchUiState,
    onArticleClick: (Article) -> Unit,
) {
    when (state) {
        SearchUiState.Idle -> EmptyHint("اكتب كلمتين على الأقل لبدء البحث")
        is SearchUiState.Searching -> Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.TopCenter,
        ) {
            CircularProgressIndicator(
                color = SabqTheme.colors.primaryEnd,
                strokeWidth = 2.dp,
                modifier = Modifier.padding(top = 24.dp),
            )
        }
        is SearchUiState.Error -> EmptyHint("تعذّر البحث: ${state.message}")
        is SearchUiState.Results -> ResultsList(state, onArticleClick)
    }
}

@Composable
private fun ResultsList(
    state: SearchUiState.Results,
    onArticleClick: (Article) -> Unit,
) {
    if (state.items.isEmpty()) {
        EmptyHint("لا توجد نتائج لـ \"${state.query}\"")
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            text = "${state.total.coerceAtLeast(state.items.size)} نتيجة لـ \"${state.query}\"",
            style = SabqTheme.typography.meta,
            color = SabqTheme.colors.tertiaryInk,
        )
        androidx.compose.foundation.lazy.LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            item {
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
private fun SectionsGrid(sections: List<Section>) {
    if (sections.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
        }
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(bottom = 120.dp, top = 4.dp),
    ) {
        items(sections, key = { it.id }) { section ->
            ExploreTile(section)
        }
    }
}

@Composable
private fun EmptyHint(text: String) {
    Box(modifier = Modifier.fillMaxSize().padding(top = 48.dp), contentAlignment = Alignment.TopCenter) {
        Text(
            text = text,
            style = SabqTheme.typography.meta,
            color = SabqTheme.colors.tertiaryInk,
        )
    }
}

/**
 * "لحظة بلحظة" entry — same outline-row pattern as
 * [OpinionsEntryRow] + [LoyaltyEntryRow], with a coral pulsing
 * radiowaves badge instead of a tinted square. Mirrors iOS
 * `HomeFeedView.swift` line 389-405 (NavigationLink to
 * `MomentByMomentRoute`) — Android's discovery surface is Explore
 * (not Home header) until we port the full home header strip.
 */
@Composable
private fun MomentByMomentEntryRow(onClick: () -> Unit) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.92f), shape)
            .border(
                BorderStroke(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.5f)),
                shape,
            )
            .clickable { onClick() }
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // Animated coral pulse — same easing as iOS HomeFeedView
        // line 422-426 (1.4 s linear repeat).
        val transition = androidx.compose.animation.core.rememberInfiniteTransition(label = "live-entry")
        val pulseScale by transition.animateFloat(
            initialValue = 1f,
            targetValue = 1.6f,
            animationSpec = androidx.compose.animation.core.infiniteRepeatable(
                animation = androidx.compose.animation.core.tween(
                    durationMillis = 1400,
                    easing = androidx.compose.animation.core.LinearEasing,
                ),
                repeatMode = androidx.compose.animation.core.RepeatMode.Restart,
            ),
            label = "pulse",
        )
        val pulseAlpha by transition.animateFloat(
            initialValue = 0.8f,
            targetValue = 0f,
            animationSpec = androidx.compose.animation.core.infiniteRepeatable(
                animation = androidx.compose.animation.core.tween(
                    durationMillis = 1400,
                    easing = androidx.compose.animation.core.LinearEasing,
                ),
                repeatMode = androidx.compose.animation.core.RepeatMode.Restart,
            ),
            label = "pulseAlpha",
        )
        Box(modifier = Modifier.size(44.dp), contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(androidx.compose.foundation.shape.CircleShape)
                    .background(SabqTheme.colors.coral.copy(alpha = 0.18f)),
            )
            Icon(
                imageVector = Icons.Outlined.Podcasts,
                contentDescription = null,
                tint = SabqTheme.colors.coral,
                modifier = Modifier.size(19.dp),
            )
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .scale(pulseScale)
                    .alpha(pulseAlpha)
                    .clip(androidx.compose.foundation.shape.CircleShape)
                    .border(
                        BorderStroke(width = 2.dp, color = SabqTheme.colors.coral.copy(alpha = 0.4f)),
                        androidx.compose.foundation.shape.CircleShape,
                    ),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "لحظة بلحظة",
                    style = SabqTheme.typography.compactCardTitle.copy(
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Black,
                        color = SabqTheme.colors.ink,
                    ),
                )
                Box(
                    modifier = Modifier
                        .clip(androidx.compose.foundation.shape.CircleShape)
                        .background(SabqTheme.colors.coral)
                        .padding(horizontal = 6.dp, vertical = 1.dp),
                ) {
                    Text(
                        text = "مباشر",
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = androidx.compose.ui.graphics.Color.White,
                        ),
                    )
                }
            }
            Text(
                text = "أحدث الأخبار العاجلة لحظة بلحظة",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            tint = SabqTheme.colors.secondaryInk,
            modifier = Modifier.size(13.dp),
        )
    }
}

@Composable
private fun OpinionsEntryRow(onClick: () -> Unit) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.92f), shape)
            .border(
                BorderStroke(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.5f)),
                shape,
            )
            .clickable { onClick() }
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.FormatQuote,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd,
                modifier = Modifier.size(19.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = "مقالات الرأي",
                style = SabqTheme.typography.compactCardTitle.copy(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = "آراء كتاب سبق وأقلامها المختارة",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            tint = SabqTheme.colors.secondaryInk,
            modifier = Modifier.size(13.dp),
        )
    }
}

@Composable
private fun ExploreTile(section: Section) {
    val visual = ArticleCategory.fromSlug(section.slug)
    val tint = visual.tint()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(6.dp, RoundedCornerShape(SabqTheme.dimens.tileRadius))
            .clip(RoundedCornerShape(SabqTheme.dimens.tileRadius))
            .background(SabqTheme.colors.surface)
            .clickable { /* TODO: navigate to a category-filtered list */ }
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SmallSquareBadge(icon = visual.icon, tint = tint)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = section.name,
                style = SabqTheme.typography.compactCardTitle,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = "${section.articlesCount} مقال",
                style = SabqTheme.typography.metaSmall,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
    }
}

