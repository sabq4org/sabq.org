package com.sabq.smart.feature.opinions

import com.sabq.smart.ui.components.sabqNewsSurface

import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft

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
            OpinionsUiState.Loading -> com.sabq.smart.ui.components.ArticleListSkeleton(
                rows = 6,
                modifier = Modifier.padding(top = 16.dp),
            )
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
                .size(44.dp)
                .sabqNewsSurface(CircleShape)
                .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
                .clickable { onBack() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                contentDescription = "رجوع",
                tint = SabqTheme.colors.ink,
                modifier = Modifier.size(28.dp),
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
                .height(135.dp)
                .clip(shape)
                .background(SabqTheme.colors.paleFill, shape),
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
            // iOS mostViewedCard: رقم الترتيب في مربع أبيض بحدّ رفيع أعلى الصورة.
            val badge = RoundedCornerShape(8.dp)
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp)
                    .size(28.dp)
                    .clip(badge)
                    .background(SabqTheme.colors.surface, badge)
                    .border(width = 0.75.dp, color = SabqTheme.colors.separator, shape = badge),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = rank.toString(),
                    style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold),
                    color = SabqTheme.colors.primaryEnd,
                )
            }
        }

        Text(
            text = article.title,
            style = SabqTheme.typography.compactCardTitle,
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
                AuthorAvatar(name = name, size = 24.dp)
                Text(
                    text = name,
                    style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold),
                    color = SabqTheme.colors.primaryEnd,
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
        val listShape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
        Column(
            Modifier
                .fillMaxWidth()
                .sabqNewsSurface(listShape)
                .background(SabqTheme.colors.surface, listShape)
                .padding(horizontal = 12.dp),
        ) {
            items.forEachIndexed { idx, article ->
                if (idx > 0) com.sabq.smart.ui.components.SabqRowDivider()
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
    // iOS opinionRow: العنوان، ثم «رأي · الوقت»، ثم الكاتب والمشاهدات،
    // والصورة 104×78 على الطرف الآخر (يسارًا).
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(vertical = 16.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = article.title,
                style = SabqTheme.typography.compactCardTitle,
                color = SabqTheme.colors.ink,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text("رأي", style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold), color = SabqTheme.colors.primaryEnd)
                Text("·", style = SabqTheme.typography.meta, color = SabqTheme.colors.tertiaryInk)
                Text(article.dateFormatted, style = SabqTheme.typography.metaSmall, color = SabqTheme.colors.tertiaryInk, maxLines = 1)
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                article.authorName?.takeIf { it.isNotBlank() }?.let { name ->
                    AuthorAvatar(name = name, size = 24.dp)
                    Text(
                        text = name,
                        style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold),
                        color = SabqTheme.colors.primaryEnd,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                }
                Spacer(Modifier.weight(1f))
                // عدد المشاهدات بأرقام لاتينية مجمّعة (نقل الويب #1605)
                article.viewsCount?.let { views ->
                    Text(
                        text = "${java.text.NumberFormat.getIntegerInstance(java.util.Locale.US).format(views)} مشاهدة",
                        style = SabqTheme.typography.meta,
                        color = SabqTheme.colors.tertiaryInk,
                        maxLines = 1,
                    )
                }
            }
        }
        val thumb = RoundedCornerShape(8.dp)
        Box(
            modifier = Modifier
                .size(width = 104.dp, height = 78.dp)
                .clip(thumb)
                .background(SabqTheme.colors.paleFill)
                .border(0.75.dp, SabqTheme.colors.separator, thumb),
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
                    tint = SabqTheme.colors.tertiaryInk.copy(alpha = 0.5f),
                    modifier = Modifier.size(24.dp),
                )
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
    @Suppress("UNUSED_PARAMETER") iconTint: Color,
    @Suppress("UNUSED_PARAMETER") icon: androidx.compose.ui.graphics.vector.ImageVector,
) {
    // الرأس الموحّد (شريط أزرق + عنوان 20 + سياق قصير) بدل مربع الأيقونة.
    com.sabq.smart.ui.components.HomeSectionHeader(title = title, context = subtitle)
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
