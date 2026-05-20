package com.sabq.smart.feature.opinions

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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import com.sabq.smart.ui.components.OpinionCard
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Opinions list — ports iOS `OpinionsView`
 * (Screens/OpinionsView.swift). Single-column scroll of opinion
 * cards. Each card shows:
 *   - author column (small portrait + name + role)
 *   - title 17 sp bold
 *   - excerpt 14 sp tertiary
 *   - small "مقال رأي" pill + reading time + date
 */
sealed interface OpinionsUiState {
    data object Loading : OpinionsUiState
    data class Error(val message: String) : OpinionsUiState
    data class Loaded(
        val items: List<Article>,
        val currentPage: Int,
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
            runCatching { repo.getOpinions(page = 1) }
                .onSuccess {
                    _state.value = OpinionsUiState.Loaded(
                        items = it.items,
                        currentPage = it.page,
                        hasMore = it.hasMore,
                    )
                }
                .onFailure { e ->
                    _state.value = OpinionsUiState.Error(e.localizedMessage ?: "تعذّر تحميل المقالات")
                }
        }
    }

    fun loadMore() {
        val current = _state.value
        if (current !is OpinionsUiState.Loaded) return
        if (!current.hasMore || current.isLoadingMore) return
        viewModelScope.launch {
            _state.update { (it as? OpinionsUiState.Loaded)?.copy(isLoadingMore = true) ?: it }
            runCatching { repo.getOpinions(page = current.currentPage + 1) }
                .onSuccess { page ->
                    _state.update {
                        val c = it as? OpinionsUiState.Loaded ?: return@update it
                        c.copy(
                            items = c.items + page.items,
                            currentPage = page.page,
                            hasMore = page.hasMore,
                            isLoadingMore = false,
                        )
                    }
                }
                .onFailure {
                    _state.update {
                        (it as? OpinionsUiState.Loaded)?.copy(isLoadingMore = false) ?: it
                    }
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        OpinionsTopBar(onBack = onBack)

        Box(modifier = Modifier.fillMaxSize()) {
            when (val s = state) {
                OpinionsUiState.Loading -> Center { CircularProgressIndicator(color = SabqTheme.colors.primaryEnd) }
                is OpinionsUiState.Error -> Center {
                    Text(
                        s.message,
                        style = SabqTheme.typography.meta,
                        color = SabqTheme.colors.secondaryInk,
                    )
                }
                is OpinionsUiState.Loaded -> OpinionsList(
                    state = s,
                    onArticleClick = onArticleClick,
                    onEndReached = viewModel::loadMore,
                )
            }
        }
    }
}

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
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "مقالات الرأي",
            style = SabqTheme.typography.cardTitle.copy(fontSize = 17.sp),
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(40.dp))
    }
}

@Composable
private fun OpinionsList(
    state: OpinionsUiState.Loaded,
    onArticleClick: (Article) -> Unit,
    onEndReached: () -> Unit,
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

    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            horizontal = SabqTheme.dimens.screenPaddingH,
            vertical = 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        items(state.items, key = { it.id }) { article ->
            OpinionCard(article = article, onClick = { onArticleClick(article) })
            HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.4f))
        }
        if (state.isLoadingMore) {
            item {
                Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
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

// OpinionCard is now imported from com.sabq.smart.ui.components.OpinionCard

@Composable
private fun Center(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}
