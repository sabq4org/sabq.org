package com.sabq.smart.feature.opinions

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.ui.components.CompactScreenHeader
import com.sabq.smart.ui.components.FocalCachedAsyncImage
import com.sabq.smart.ui.components.StatusChip
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Opinions screen — 1:1 port of iOS `OpinionsView`
 * (`Screens/OpinionsView.swift`).
 *
 * Layout:
 *   - CompactScreenHeader ("المقالات" + subtitle)
 *   - ترند المقالات — horizontal scroll of 240×140 cards with
 *     rank badges 1, 2, 3… (fed by `sort=trending`).
 *   - أحدث المقالات — SurfaceCard list with 88×88 image + "رأي"
 *     status chip + relative date + title + author pill.
 */
sealed interface OpinionsUiState {
    data object Loading : OpinionsUiState
    data class Error(val message: String) : OpinionsUiState
    data class Loaded(
        val mostViewed: List<Article>,
        val latest: List<Article>,
        val latestPage: Int,
        val hasMore: Boolean,
        val isLoadingMore: Boolean = false,
    ) : OpinionsUiState
}

@HiltViewModel
class OpinionsListViewModel @Inject constructor(
    @Suppress("unused") savedState: SavedStateHandle,
    private val repo: ArticleRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<OpinionsUiState>(OpinionsUiState.Loading)
    val state: StateFlow<OpinionsUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = OpinionsUiState.Loading
            // Two parallel fetches: trending (last-48h by views) for the
            // top carousel, and the latest list (default ordering) for
            // the bottom. Same pattern iOS uses at
            // `OpinionsView.swift:304-305`.
            val trendingJob = async { runCatching { repo.getOpinions(page = 1, limit = 8, sort = "trending") }.getOrNull() }
            val latestJob = async { runCatching { repo.getOpinions(page = 1, limit = 20) }.getOrNull() }
            val trending = trendingJob.await()
            val latest = latestJob.await()
            if (trending == null && latest == null) {
                _state.value = OpinionsUiState.Error("تعذّر تحميل المقالات")
                return@launch
            }
            _state.value = OpinionsUiState.Loaded(
                mostViewed = trending?.items.orEmpty(),
                latest = latest?.items.orEmpty(),
                latestPage = latest?.page ?: 1,
                hasMore = latest?.hasMore ?: false,
            )
        }
    }

    fun loadMore() {
        val current = _state.value
        if (current !is OpinionsUiState.Loaded) return
        if (!current.hasMore || current.isLoadingMore) return
        viewModelScope.launch {
            _state.update { (it as? OpinionsUiState.Loaded)?.copy(isLoadingMore = true) ?: it }
            runCatching { repo.getOpinions(page = current.latestPage + 1) }
                .onSuccess { page ->
                    _state.update {
                        val c = it as? OpinionsUiState.Loaded ?: return@update it
                        c.copy(
                            latest = c.latest + page.items,
                            latestPage = page.page,
                            hasMore = page.hasMore,
                            isLoadingMore = false,
                        )
                    }
                }
                .onFailure {
                    _state.update { (it as? OpinionsUiState.Loaded)?.copy(isLoadingMore = false) ?: it }
                }
        }
    }
}

@Composable
fun OpinionsListScreen(
    onBack: () -> Unit,
    onArticleClick: (Article) -> Unit,
    viewModel: OpinionsListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        when (val s = state) {
            OpinionsUiState.Loading -> CenterContent {
                CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
            }
            is OpinionsUiState.Error -> CenterContent {
                // iOS wraps the error EmptyStateView in a SurfaceCard
                // with coral accent (OpinionsView.swift:277-287).
                com.sabq.smart.ui.components.ErrorStateView(
                    message = s.message,
                    onRetry = { viewModel.load() },
                )
            }
            is OpinionsUiState.Loaded -> OpinionsContent(
                state = s,
                onArticleClick = onArticleClick,
                onEndReached = viewModel::loadMore,
                onBack = onBack,
            )
        }
    }
}

@Composable
private fun OpinionsContent(
    state: OpinionsUiState.Loaded,
    onArticleClick: (Article) -> Unit,
    onEndReached: () -> Unit,
    onBack: () -> Unit,
) {
    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    val endReached by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            val total = info.totalItemsCount
            val lastVisible = info.visibleItemsInfo.lastOrNull()?.index ?: return@derivedStateOf false
            total > 0 && lastVisible >= total - 3
        }
    }
    LaunchedEffect(endReached) { if (endReached) onEndReached() }

    Column(modifier = Modifier.fillMaxSize()) {
        OpinionsTopBar(onBack = onBack)
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                horizontal = SabqTheme.dimens.screenPaddingH,
                vertical = 18.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            item {
                CompactScreenHeader(
                    title = "المقالات",
                    subtitle = "أكثر مقالات الرأي قراءةً، وأحدث ما نشر",
                )
            }

            if (state.mostViewed.isNotEmpty()) {
                item { MostViewedSection(items = state.mostViewed, onArticleClick = onArticleClick) }
            }

            if (state.latest.isNotEmpty()) {
                item { LatestSection(items = state.latest, onArticleClick = onArticleClick) }
            }

            if (state.isLoadingMore) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(
                            color = SabqTheme.colors.primaryEnd,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }
            }
        }
    }
}

// ============================================================
// Top bar
// ============================================================

@Composable
private fun OpinionsTopBar(onBack: () -> Unit) {
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

// ============================================================
// ترند المقالات — horizontal rail of 240×140 cards + rank badges
// ============================================================

@Composable
private fun MostViewedSection(items: List<Article>, onArticleClick: (Article) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionHeader(
            title = "ترند المقالات",
            subtitle = "الأكثر تفاعلاً خلال آخر 48 ساعة",
            iconTint = SabqTheme.colors.coral,
            icon = Icons.Filled.LocalFireDepartment,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            items.take(8).forEachIndexed { idx, article ->
                MostViewedCard(
                    rank = idx + 1,
                    article = article,
                    onClick = { onArticleClick(article) },
                )
            }
        }
    }
}

@Composable
private fun MostViewedCard(rank: Int, article: Article, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(240.dp)
            .clickable { onClick() },
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
        Box(
            modifier = Modifier
                .width(240.dp)
                .height(140.dp)
                .clip(shape)
                .background(
                    Brush.linearGradient(
                        listOf(
                            SabqTheme.colors.primaryEnd.copy(alpha = 0.18f),
                            SabqTheme.colors.coral.copy(alpha = 0.10f),
                        ),
                    ),
                    shape,
                ),
        ) {
            if (!article.imageUrl.isNullOrBlank()) {
                FocalCachedAsyncImage(
                    url = article.imageUrl,
                    focalPoint = article.focalPoint,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(
                    imageVector = Icons.Filled.FormatQuote,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd.copy(alpha = 0.30f),
                    modifier = Modifier
                        .align(Alignment.Center)
                        .size(48.dp),
                )
            }
            // Rank badge — top-leading corner (visual top-right in RTL).
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(10.dp)
                    .shadow(
                        elevation = 6.dp,
                        shape = CircleShape,
                        spotColor = SabqTheme.colors.coral,
                    )
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(
                            listOf(SabqTheme.colors.coral, SabqTheme.colors.primaryEnd),
                        ),
                        CircleShape,
                    )
                    .border(width = 2.dp, color = Color.White.copy(alpha = 0.9f), shape = CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = rank.toString(),
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                )
            }
        }

        Text(
            text = article.title,
            fontSize = 14.5.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(240.dp),
        )

        article.authorName?.takeIf { it.isNotBlank() }?.let { name ->
            Row(
                modifier = Modifier.width(240.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                AuthorAvatar(name = name, size = 22.dp)
                Text(
                    text = name,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.secondaryInk,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

// ============================================================
// أحدث المقالات — SurfaceCard list with iOS-style rows
// ============================================================

@Composable
private fun LatestSection(items: List<Article>, onArticleClick: (Article) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionHeader(
            title = "أحدث المقالات",
            subtitle = "كل ما نُشر مرتباً زمنياً",
            iconTint = SabqTheme.colors.primaryEnd,
            icon = Icons.Filled.FormatQuote,
        )
        SurfaceCard {
            items.forEachIndexed { idx, article ->
                if (idx > 0) {
                    HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.4f))
                }
                OpinionLatestRow(
                    article = article,
                    onClick = { onArticleClick(article) },
                )
            }
        }
    }
}

@Composable
private fun OpinionLatestRow(article: Article, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // 88×88 image on the leading edge (visual right in RTL).
        Box(
            modifier = Modifier
                .size(88.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.08f)),
            contentAlignment = Alignment.Center,
        ) {
            if (!article.imageUrl.isNullOrBlank()) {
                FocalCachedAsyncImage(
                    url = article.imageUrl,
                    focalPoint = article.focalPoint,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(
                    imageVector = Icons.Filled.FormatQuote,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd.copy(alpha = 0.45f),
                    modifier = Modifier.size(24.dp),
                )
            }
        }

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StatusChip(title = "رأي", tint = SabqTheme.colors.primaryEnd)
                Text(
                    text = article.dateFormatted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.tertiaryInk,
                )
            }
            Text(
                text = article.title,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 22.sp,
            )
            article.authorName?.takeIf { it.isNotBlank() }?.let { name ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    AuthorAvatar(name = name, size = 26.dp)
                    Text(
                        text = name,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SabqTheme.colors.secondaryInk,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

// ============================================================
// Helpers
// ============================================================

@Composable
private fun SectionHeader(
    title: String,
    subtitle: String,
    iconTint: Color,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = title,
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = subtitle,
                fontSize = 13.sp,
                color = SabqTheme.colors.secondaryInk,
            )
        }
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(13.dp))
                .background(iconTint.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun AuthorAvatar(name: String, size: androidx.compose.ui.unit.Dp) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = name.firstOrNull()?.toString() ?: "—",
            fontSize = (size.value * 0.42f).sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.primaryEnd,
        )
    }
}

@Composable
private fun CenterContent(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}
