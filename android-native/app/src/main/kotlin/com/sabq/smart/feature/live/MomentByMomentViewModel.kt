package com.sabq.smart.feature.live

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.LiveRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * State container for Moment-by-moment. Ports iOS
 * `MomentByMomentView`'s `@State` bag of (items, nextCursor,
 * isLoading, isLoadingMore, loadError, filter).
 */
@HiltViewModel
class MomentByMomentViewModel @Inject constructor(
    private val repo: LiveRepository,
) : ViewModel() {

    /** API filter — iOS only supports "all" (no param) and "breaking".
     *  Other values are dropped server-side per iOS line 32-37. */
    enum class Filter(val label: String, val apiValue: String?) {
        ALL("كل الأخبار", null),
        BREAKING("عاجل فقط", "breaking"),
    }

    data class UiState(
        val items: List<Article> = emptyList(),
        val nextCursor: String? = null,
        val isLoading: Boolean = true,
        val isLoadingMore: Boolean = false,
        val loadError: String? = null,
        val filter: Filter = Filter.ALL,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { reload() }

    fun setFilter(filter: Filter) {
        if (_state.value.filter == filter) return
        _state.update { it.copy(filter = filter) }
        reload()
    }

    fun reload() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, loadError = null) }
            runCatching {
                repo.getMomentByMomentPage(cursor = null, filter = _state.value.filter.apiValue)
            }
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            items = page.items,
                            nextCursor = page.nextCursor,
                            isLoading = false,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            loadError = e.localizedMessage ?: "تعذر تحميل الأخبار",
                        )
                    }
                }
        }
    }

    fun loadMore() {
        val current = _state.value
        val cursor = current.nextCursor ?: return
        if (current.isLoadingMore) return
        viewModelScope.launch {
            _state.update { it.copy(isLoadingMore = true) }
            runCatching {
                repo.getMomentByMomentPage(cursor = cursor, filter = current.filter.apiValue)
            }
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            items = it.items + page.items,
                            nextCursor = page.nextCursor,
                            isLoadingMore = false,
                        )
                    }
                }
                .onFailure {
                    _state.update { it.copy(isLoadingMore = false) }
                }
        }
    }
}
