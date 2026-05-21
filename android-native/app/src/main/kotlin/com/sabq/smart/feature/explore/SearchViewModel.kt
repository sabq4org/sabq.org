package com.sabq.smart.feature.explore

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.data.analytics.SabqAnalytics
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn

/** Search UI state — three buckets that the screen renders 1:1. */
sealed interface SearchUiState {
    data object Idle : SearchUiState
    data class Searching(val query: String) : SearchUiState
    data class Results(
        val query: String,
        val items: List<Article>,
        val total: Int,
        val hasMore: Boolean,
    ) : SearchUiState
    data class Error(val query: String, val message: String) : SearchUiState
}

@OptIn(FlowPreview::class, kotlinx.coroutines.ExperimentalCoroutinesApi::class)
@HiltViewModel
class SearchViewModel @Inject constructor(
    private val repo: ArticleRepository,
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    val state: StateFlow<SearchUiState> = _query
        .debounce(350) // user-typing pause; iOS uses ~300ms
        .distinctUntilChanged()
        .flatMapLatest { q ->
            val trimmed = q.trim()
            if (trimmed.length < 2) {
                flow { emit(SearchUiState.Idle) }
            } else {
                flow<SearchUiState> {
                    emit(SearchUiState.Searching(trimmed))
                    SabqAnalytics.search(trimmed)
                    runCatching { repo.search(trimmed) }
                        .onSuccess {
                            emit(
                                SearchUiState.Results(
                                    query = it.query,
                                    items = it.items,
                                    total = it.total,
                                    hasMore = it.hasMore,
                                ),
                            )
                        }
                        .onFailure { e ->
                            emit(SearchUiState.Error(trimmed, e.localizedMessage ?: "تعذّر البحث"))
                        }
                }
            }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = SearchUiState.Idle,
        )

    fun setQuery(value: String) {
        _query.value = value
    }
}
