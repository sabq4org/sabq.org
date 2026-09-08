package com.sabq.smart.feature.category

import com.sabq.smart.data.readerErrorMessage
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface CategoryArticlesUiState {
    data object Loading : CategoryArticlesUiState
    data class Error(val message: String) : CategoryArticlesUiState
    data class Loaded(
        val slug: String,
        val name: String,
        val articles: List<Article>,
        val hasMore: Boolean,
        val isLoadingMore: Boolean,
    ) : CategoryArticlesUiState
}

@HiltViewModel
class CategoryArticlesViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val repo: ArticleRepository,
) : ViewModel() {

    val slug: String = savedState["slug"] ?: ""
    val name: String = savedState["name"] ?: ""
    private var currentPage = 1

    private val _state = MutableStateFlow<CategoryArticlesUiState>(CategoryArticlesUiState.Loading)
    val state: StateFlow<CategoryArticlesUiState> = _state.asStateFlow()

    init { load() }

    fun retry() = load()

    private fun load() {
        if (slug.isBlank()) {
            _state.value = CategoryArticlesUiState.Error("لم يتم تحديد التصنيف")
            return
        }
        viewModelScope.launch {
            _state.value = CategoryArticlesUiState.Loading
            currentPage = 1
            runCatching { repo.getArticles(page = 1, limit = 30, section = slug) }
                .onSuccess { page ->
                    _state.value = CategoryArticlesUiState.Loaded(
                        slug = slug,
                        name = name,
                        articles = page.items,
                        hasMore = page.hasMore,
                        isLoadingMore = false,
                    )
                }
                .onFailure { e ->
                    _state.value = CategoryArticlesUiState.Error(
                        readerErrorMessage(e, "تعذر تحميل مقالات التصنيف")
                    )
                }
        }
    }

    fun loadMore() {
        val current = _state.value as? CategoryArticlesUiState.Loaded ?: return
        if (!current.hasMore || current.isLoadingMore) return
        _state.value = current.copy(isLoadingMore = true)
        viewModelScope.launch {
            currentPage++
            runCatching { repo.getArticles(page = currentPage, limit = 30, section = slug) }
                .onSuccess { page ->
                    val merged = current.articles + page.items.filter { new ->
                        current.articles.none { it.id == new.id }
                    }
                    _state.value = current.copy(
                        articles = merged,
                        hasMore = page.hasMore,
                        isLoadingMore = false,
                    )
                }
                .onFailure {
                    currentPage--
                    _state.value = current.copy(isLoadingMore = false)
                }
        }
    }
}
