package com.sabq.smart.feature.keyword

import com.sabq.smart.data.readerErrorMessage
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.data.FollowedKeywordsStore
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

sealed interface KeywordArticlesUiState {
    data object Loading : KeywordArticlesUiState
    data class Error(val message: String) : KeywordArticlesUiState
    data class Loaded(
        val keyword: String,
        val articles: List<Article>,
        val isFollowed: Boolean,
        val newsCount: Int,
        val opinionsCount: Int,
    ) : KeywordArticlesUiState
}

@HiltViewModel
class KeywordArticlesViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val repo: ArticleRepository,
    private val followedStore: FollowedKeywordsStore,
) : ViewModel() {

    val keyword: String = savedState["keyword"] ?: ""

    private val _state = MutableStateFlow<KeywordArticlesUiState>(KeywordArticlesUiState.Loading)
    val state: StateFlow<KeywordArticlesUiState> = _state.asStateFlow()

    init {
        load()
        observeFollowStatus()
    }

    fun retry() = load()

    private fun load() {
        if (keyword.isBlank()) {
            _state.value = KeywordArticlesUiState.Error("لم يتم تحديد الوسم")
            return
        }
        viewModelScope.launch {
            _state.value = KeywordArticlesUiState.Loading
            runCatching { repo.getArticlesByKeyword(keyword) }
                .onSuccess { articles ->
                    val isFollowed = followedStore.isFollowed(keyword)
                    val news = articles.count { !it.isOpinion }
                    val opinions = articles.count { it.isOpinion }
                    _state.value = KeywordArticlesUiState.Loaded(
                        keyword = keyword,
                        articles = articles,
                        isFollowed = isFollowed,
                        newsCount = news,
                        opinionsCount = opinions,
                    )
                }
                .onFailure { e ->
                    _state.value = KeywordArticlesUiState.Error(
                        readerErrorMessage(e, "تعذر تحميل مقالات الوسم")
                    )
                }
        }
    }

    private fun observeFollowStatus() {
        viewModelScope.launch {
            followedStore.keywords.collectLatest { followedSet ->
                val current = _state.value
                if (current is KeywordArticlesUiState.Loaded) {
                    _state.value = current.copy(
                        isFollowed = followedSet.contains(keyword)
                    )
                }
            }
        }
    }

    fun toggleFollow() {
        viewModelScope.launch {
            followedStore.toggle(keyword)
        }
    }
}
