package com.sabq.smart.feature.author

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.data.AuthorPage
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface AuthorProfileUiState {
    data object Loading : AuthorProfileUiState
    data class Error(val message: String) : AuthorProfileUiState
    data class Loaded(
        val authorPage: AuthorPage,
    ) : AuthorProfileUiState
}

@HiltViewModel
class AuthorArticlesViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val repo: ArticleRepository,
) : ViewModel() {

    val name: String = savedState["name"] ?: ""

    private val _state = MutableStateFlow<AuthorProfileUiState>(AuthorProfileUiState.Loading)
    val state: StateFlow<AuthorProfileUiState> = _state.asStateFlow()

    private val _isLoadingMore = MutableStateFlow(false)
    val isLoadingMore: StateFlow<Boolean> = _isLoadingMore.asStateFlow()

    private var currentPage = 1
    var isLastPage = false
        private set

    init {
        load()
    }

    fun retry() = load()

    private fun load() {
        if (name.isBlank()) {
            _state.value = AuthorProfileUiState.Error("لم يتم تحديد الكاتب")
            return
        }
        viewModelScope.launch {
            _state.value = AuthorProfileUiState.Loading
            currentPage = 1
            isLastPage = false
            runCatching { repo.getAuthorPage(name, page = 1, limit = 20) }
                .onSuccess { authorPage ->
                    _state.value = AuthorProfileUiState.Loaded(authorPage = authorPage)
                    if (authorPage.recentArticles.size >= authorPage.stats.articleCount || authorPage.recentArticles.size < 20) {
                        isLastPage = true
                    }
                }
                .onFailure { e ->
                    _state.value = AuthorProfileUiState.Error(
                        e.localizedMessage ?: "تعذر تحميل بيانات الكاتب"
                    )
                }
        }
    }

    fun loadMore() {
        if (isLastPage || _isLoadingMore.value) return
        val currentState = _state.value as? AuthorProfileUiState.Loaded ?: return

        viewModelScope.launch {
            _isLoadingMore.value = true
            val nextPage = currentPage + 1
            runCatching { repo.getAuthorPage(name, page = nextPage, limit = 20) }
                .onSuccess { nextPageData ->
                    val newArticles = nextPageData.recentArticles
                    val existing = currentState.authorPage.recentArticles
                    // Defensive dedupe: backend `/api/v1/authors/by-name`
                    // currently ignores the `page` query param, so a
                    // naive concat would render every article twice (or
                    // crash LazyColumn on duplicate `key = { it.id }`).
                    // We compare by id, drop dupes, and treat "no new
                    // ids arrived" as end-of-list.
                    val existingIds = existing.mapTo(HashSet()) { it.id }
                    val freshOnly = newArticles.filterNot { it.id in existingIds }

                    if (freshOnly.isEmpty()) {
                        // Backend returned the same page again → we
                        // have everything it's going to give us.
                        isLastPage = true
                    } else {
                        currentPage = nextPage
                        val accumulated = (existing + freshOnly)
                            .sortedByDescending { it.publishedAtIso ?: "" }
                        val updatedAuthorPage = currentState.authorPage.copy(recentArticles = accumulated)
                        _state.value = AuthorProfileUiState.Loaded(authorPage = updatedAuthorPage)

                        if (accumulated.size >= nextPageData.stats.articleCount || freshOnly.size < 20) {
                            isLastPage = true
                        }
                    }
                    _isLoadingMore.value = false
                }
                .onFailure {
                    _isLoadingMore.value = false
                }
        }
    }
}
