package com.sabq.smart.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.data.BookmarksStore
import com.sabq.smart.data.Section
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface HomeFeedUiState {
    data object Loading : HomeFeedUiState
    data class Error(val message: String) : HomeFeedUiState
    data class Loaded(
        val sections: List<Section>,
        val featured: List<Article>,
        val articles: List<Article>,
        val selectedSlug: String?,    // null = "الكل"
        val currentPage: Int,
        val hasMore: Boolean,
        val isRefreshing: Boolean = false,
        val isLoadingMore: Boolean = false,
        val bookmarkedIds: Set<String> = emptySet(),
    ) : HomeFeedUiState
}

@HiltViewModel
class HomeFeedViewModel @Inject constructor(
    private val repo: ArticleRepository,
    private val bookmarks: BookmarksStore,
) : ViewModel() {

    private val _state = MutableStateFlow<HomeFeedUiState>(HomeFeedUiState.Loading)
    val state: StateFlow<HomeFeedUiState> = _state.asStateFlow()

    init {
        initialLoad()
        // Mirror persisted bookmark IDs into the Loaded state so the
        // home feed's bookmark icons stay in sync with the Bookmarks
        // tab + survive process death.
        viewModelScope.launch {
            bookmarks.ids.collectLatest { ids ->
                _state.update { c ->
                    if (c is HomeFeedUiState.Loaded) c.copy(bookmarkedIds = ids) else c
                }
            }
        }
    }

    fun refresh() {
        val current = _state.value
        val slug = if (current is HomeFeedUiState.Loaded) current.selectedSlug else null
        loadFeed(slug = slug, page = 1, append = false)
    }

    fun selectSection(slug: String?) {
        val current = _state.value
        if (current is HomeFeedUiState.Loaded && current.selectedSlug == slug) return
        loadFeed(slug = slug, page = 1, append = false)
    }

    fun loadMore() {
        val current = _state.value
        if (current !is HomeFeedUiState.Loaded) return
        if (!current.hasMore || current.isLoadingMore) return
        loadFeed(slug = current.selectedSlug, page = current.currentPage + 1, append = true)
    }

    fun toggleBookmark(id: String) {
        viewModelScope.launch { bookmarks.toggle(id) }
        // Optimistic local flip — the persistent flow will re-emit the
        // canonical set in the next tick and re-update state.
        _state.update { c ->
            if (c is HomeFeedUiState.Loaded) {
                val ids = if (id in c.bookmarkedIds) c.bookmarkedIds - id else c.bookmarkedIds + id
                c.copy(bookmarkedIds = ids)
            } else c
        }
    }

    private fun initialLoad() {
        viewModelScope.launch {
            _state.value = HomeFeedUiState.Loading
            runCatching {
                val featuredJob = async { repo.getArticles(page = 1, limit = 5, featuredOnly = true) }
                val articlesJob = async { repo.getArticles(page = 1, limit = 20) }
                val sectionsJob = async { repo.getSections() }
                Triple(featuredJob.await(), articlesJob.await(), sectionsJob.await())
            }
                .onSuccess { (featured, articles, sections) ->
                    _state.value = HomeFeedUiState.Loaded(
                        sections = sections.take(10),
                        featured = featured.items,
                        articles = articles.items.filterNot { f ->
                            featured.items.any { it.id == f.id }
                        },
                        selectedSlug = null,
                        currentPage = articles.page,
                        hasMore = articles.hasMore,
                    )
                }
                .onFailure { e ->
                    _state.value = HomeFeedUiState.Error(
                        message = e.localizedMessage ?: "تعذّر تحميل الأخبار",
                    )
                }
        }
    }

    private fun loadFeed(slug: String?, page: Int, append: Boolean) {
        viewModelScope.launch {
            // Flip the right indicator (refresh vs. load-more) without
            // dropping currently-loaded content.
            _state.update { c ->
                if (c is HomeFeedUiState.Loaded) {
                    if (append) c.copy(isLoadingMore = true)
                    else c.copy(isRefreshing = true)
                } else c
            }

            runCatching { repo.getArticles(page = page, section = slug) }
                .onSuccess { page2 ->
                    _state.update { c ->
                        if (c !is HomeFeedUiState.Loaded) return@update c
                        val newArticles = if (append)
                            c.articles + page2.items
                        else page2.items
                        c.copy(
                            articles = newArticles,
                            selectedSlug = slug,
                            currentPage = page2.page,
                            hasMore = page2.hasMore,
                            isRefreshing = false,
                            isLoadingMore = false,
                        )
                    }
                }
                .onFailure {
                    _state.update { c ->
                        if (c is HomeFeedUiState.Loaded)
                            c.copy(isRefreshing = false, isLoadingMore = false)
                        else c
                    }
                }
        }
    }
}
