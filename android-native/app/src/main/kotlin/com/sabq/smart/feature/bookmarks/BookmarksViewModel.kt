package com.sabq.smart.feature.bookmarks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.BookmarksStore
import com.sabq.smart.data.api.ApiBookmarkArticle
import com.sabq.smart.data.api.SabqApi
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    private val api: SabqApi,
) : ViewModel() {

    private val _state = MutableStateFlow<BookmarksUiState>(BookmarksUiState.Loading)
    val state: StateFlow<BookmarksUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = BookmarksUiState.Loading
            try {
                val response = api.getBookmarks()
                if (response.articles.isEmpty()) {
                    _state.value = BookmarksUiState.Empty
                } else {
                    _state.value = BookmarksUiState.Loaded(
                        response.articles.map { it.toArticle() }
                    )
                }
            } catch (e: Exception) {
                val localIds = store.current()
                if (localIds.isEmpty()) {
                    _state.value = BookmarksUiState.Empty
                } else {
                    _state.value = BookmarksUiState.Error(
                        e.localizedMessage ?: "تعذّر تحميل المحفوظات"
                    )
                }
            }
        }
    }

    fun unbookmark(id: String) {
        viewModelScope.launch {
            store.toggle(id)
            val current = (_state.value as? BookmarksUiState.Loaded)?.items ?: return@launch
            val updated = current.filter { it.id != id }
            _state.value = if (updated.isEmpty()) BookmarksUiState.Empty else BookmarksUiState.Loaded(updated)
        }
    }
}

private fun ApiBookmarkArticle.toArticle(): Article = Article(
    id = id,
    title = title,
    slug = slug,
    imageUrl = imageUrl,
    excerpt = "",
    category = com.sabq.smart.data.ArticleCategory.fromSlug(categoryName ?: ""),
    readingTime = "",
    dateFormatted = "",
    publishedAtIso = publishedAt,
)
