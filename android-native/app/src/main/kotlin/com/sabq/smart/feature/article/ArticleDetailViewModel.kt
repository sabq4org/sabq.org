package com.sabq.smart.feature.article

import com.sabq.smart.data.readerErrorMessage
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
        /** المحتوى المعروض من بطاقة القائمة والنص الكامل ما زال يُجلب. */
        val hydrating: Boolean = false,
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
            // فتح فوري من بطاقة القائمة إن توفرت — الشاشة الفارغة كانت أسوأ
            // مسار إحساسًا بالبطء (تدقيق الأداء 2026-08-02).
            val seed = com.sabq.smart.data.ArticleHandoff.take(slug)
            _state.value = if (seed != null) {
                ArticleDetailUiState.Loaded(article = seed, hydrating = true)
            } else {
                ArticleDetailUiState.Loading
            }
            runCatching { repo.getArticleBySlug(slug) }
                .onSuccess { article ->
                    _state.value = ArticleDetailUiState.Loaded(article = article)
                    loadRelated()
                    loadMediaAssets(article.id)
                }
                .onFailure { e ->
                    val current = _state.value
                    if (current is ArticleDetailUiState.Loaded) {
                        // البذرة معروضة — نبقيها بدل استبدالها بشاشة خطأ.
                        _state.value = current.copy(hydrating = false)
                    } else {
                        _state.value = ArticleDetailUiState.Error(
                            readerErrorMessage(e, "تعذّر تحميل المقال"),
                        )
                    }
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
