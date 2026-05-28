package com.sabq.smart.feature.article

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.data.MediaAsset
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface ArticleDetailUiState {
    data object Loading : ArticleDetailUiState
    data class Error(val message: String) : ArticleDetailUiState
    data class Loaded(
        val article: Article,
        val related: List<Article> = emptyList(),
        val mediaAssets: List<MediaAsset> = emptyList(),
    ) : ArticleDetailUiState
}

@HiltViewModel
class ArticleDetailViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val repo: ArticleRepository,
) : ViewModel() {

    private val slug: String = savedState["slug"] ?: ""

    private val _state = MutableStateFlow<ArticleDetailUiState>(ArticleDetailUiState.Loading)
    val state: StateFlow<ArticleDetailUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun retry() = load()

    private fun load() {
        if (slug.isBlank()) {
            _state.value = ArticleDetailUiState.Error("لم يتم تحديد المقال")
            return
        }
        viewModelScope.launch {
            _state.value = ArticleDetailUiState.Loading
            runCatching { repo.getArticleBySlug(slug) }
                .onSuccess { article ->
                    _state.value = ArticleDetailUiState.Loaded(article = article)
                    loadRelated()
                    loadMediaAssets(article.id)
                }
                .onFailure { e ->
                    _state.value = ArticleDetailUiState.Error(
                        e.localizedMessage ?: "تعذّر تحميل المقال",
                    )
                }
        }
    }

    private fun loadRelated() {
        viewModelScope.launch {
            runCatching { repo.getRelated(slug) }
                .onSuccess { related ->
                    _state.update { c ->
                        if (c is ArticleDetailUiState.Loaded) c.copy(related = related) else c
                    }
                }
                .onFailure { e ->
                    android.util.Log.e("ArticleDetailVM", "Failed to load related articles", e)
                }
        }
    }

    private fun loadMediaAssets(articleId: String) {
        viewModelScope.launch {
            runCatching { repo.getMediaAssets(articleId) }
                .onSuccess { assets ->
                    _state.update { c ->
                        if (c is ArticleDetailUiState.Loaded) c.copy(mediaAssets = assets) else c
                    }
                }
        }
    }
}
