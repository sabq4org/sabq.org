package com.sabq.smart.feature.trending

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * State container for the dedicated "الأكثر تداولاً" screen. Ports
 * iOS `TrendingView`'s `@State` triple of (articles, tags, isLoading).
 * No pagination, no filter — the backend returns the full top-N
 * trending window (last 48 h by views) in a single call.
 */
@HiltViewModel
class TrendingViewModel @Inject constructor(
    private val repo: ArticleRepository,
) : ViewModel() {

    data class UiState(
        val articles: List<Article> = emptyList(),
        val tags: List<String> = emptyList(),
        val isLoading: Boolean = true,
        val loadError: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { reload() }

    fun reload() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, loadError = null) }
            runCatching { repo.getTrendingPage() }
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            articles = page.articles,
                            tags = page.tags,
                            isLoading = false,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            loadError = e.localizedMessage ?: "تعذر تحميل الأكثر تداولاً",
                        )
                    }
                }
        }
    }
}
