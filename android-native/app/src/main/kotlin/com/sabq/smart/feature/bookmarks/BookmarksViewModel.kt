package com.sabq.smart.feature.bookmarks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.data.BookmarksStore
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface BookmarksUiState {
    data object Loading : BookmarksUiState
    data object Empty : BookmarksUiState
    data class Loaded(val items: List<Article>) : BookmarksUiState
    data class Error(val message: String) : BookmarksUiState
}

@HiltViewModel
class BookmarksViewModel @Inject constructor(
    private val store: BookmarksStore,
    private val repo: ArticleRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<BookmarksUiState>(BookmarksUiState.Loading)
    val state: StateFlow<BookmarksUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            // Re-resolve the article list whenever the bookmark set
            // changes. Resolution hits `/api/articles/{slug}` per ID
            // — fine for the v1 list size (typically < 50 saves).
            // When we add an offline cache we'll read from that first.
            store.ids.collectLatest { ids ->
                if (ids.isEmpty()) {
                    _state.value = BookmarksUiState.Empty
                    return@collectLatest
                }
                _state.value = BookmarksUiState.Loading
                runCatching {
                    // The stored "id" might be either a UUID or a slug,
                    // depending on how the article was bookmarked. v1
                    // path: try slug-as-stored. Once we persist the
                    // full Article metadata in DataStore we can render
                    // offline without these round-trips.
                    ids.toList().map { idOrSlug ->
                        repo.getArticleBySlug(idOrSlug)
                    }
                }
                    .onSuccess { articles ->
                        _state.value = BookmarksUiState.Loaded(articles)
                    }
                    .onFailure {
                        _state.value = BookmarksUiState.Error(
                            it.localizedMessage ?: "تعذّر تحميل المحفوظات",
                        )
                    }
            }
        }
    }

    fun unbookmark(id: String) {
        viewModelScope.launch { store.toggle(id) }
    }
}
