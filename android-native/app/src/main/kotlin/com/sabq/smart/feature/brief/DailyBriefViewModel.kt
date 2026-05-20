package com.sabq.smart.feature.brief

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.BookmarksStore
import com.sabq.smart.data.User
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * State container for "موجزك في سبق". Ports iOS `DailyBriefView`'s two
 * modes (guest landing + member dashboard) into a single Hilt VM.
 *
 *  - **User** is read live from [AuthRepository] so login/logout while
 *    the screen is open swaps the body without manual refresh.
 *  - **Bookmarks count** comes from [BookmarksStore] (DataStore-backed,
 *    same source the bookmarks tab uses).
 *  - **Suggestions** are top-N articles whose section slug matches one
 *    of the user's interest slugs — mirrors iOS
 *    `suggestedArticles(for:)` which filters `articlesStore.allArticles`
 *    by interest slug. We refetch a fresh first-page on init so the
 *    rail is populated even on cold launch.
 */
@HiltViewModel
class DailyBriefViewModel @Inject constructor(
    private val authRepo: AuthRepository,
    private val articleRepo: ArticleRepository,
    bookmarksStore: BookmarksStore,
) : ViewModel() {

    private val _articles = MutableStateFlow<List<Article>>(emptyList())

    private val bookmarksCount: StateFlow<Int> =
        bookmarksStore.ids.map { it.size }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.Eagerly,
            initialValue = 0,
        )

    val state: StateFlow<UiState> = combine(
        authRepo.user,
        _articles,
        bookmarksCount,
    ) { user, articles, bookmarks ->
        UiState(
            user = user,
            suggestions = computeSuggestions(user, articles),
            bookmarksCount = bookmarks,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.Eagerly,
        initialValue = UiState(),
    )

    init {
        // Cold-load a first page of articles so the suggestions rail has
        // a candidate pool to filter by interest slug.
        viewModelScope.launch {
            runCatching { articleRepo.getArticles(page = 1, limit = 40) }
                .onSuccess { _articles.value = it.items }
        }
    }

    private fun computeSuggestions(user: User?, articles: List<Article>): List<Article> {
        if (user == null) return emptyList()
        val interestSlugs = user.interests.mapNotNull { it.slug?.lowercase() }.toSet()
        if (interestSlugs.isEmpty()) return emptyList()
        return articles.filter { it.category.key.lowercase() in interestSlugs }.take(8)
    }

    data class UiState(
        val user: User? = null,
        val suggestions: List<Article> = emptyList(),
        val bookmarksCount: Int = 0,
    )
}
