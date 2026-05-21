package com.sabq.smart.feature.loyalty

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.LoyaltyHistoryEvent
import com.sabq.smart.data.LoyaltyRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * State container for "سجل نقاطي". Ports iOS `LoyaltyHistoryView`'s
 * `@State` quadruple of (items, page, hasMore, isLoading) — same
 * pagination semantics: page 1 on enter / refresh, infinite scroll on
 * tail (silent failure mirrors iOS so the next scroll retries).
 */
@HiltViewModel
class LoyaltyHistoryViewModel @Inject constructor(
    private val repo: LoyaltyRepository,
) : ViewModel() {

    data class UiState(
        val items: List<LoyaltyHistoryEvent> = emptyList(),
        val page: Int = 1,
        val hasMore: Boolean = true,
        val isLoading: Boolean = false,
        val isRefreshing: Boolean = false,
        val loadError: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { reload() }

    fun reload() {
        viewModelScope.launch {
            _state.update { it.copy(isRefreshing = true, loadError = null) }
            runCatching { repo.getHistory(page = 1, limit = 20) }
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            items = page.items,
                            page = page.page,
                            hasMore = page.hasMore,
                            isRefreshing = false,
                            isLoading = false,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            isRefreshing = false,
                            isLoading = false,
                            loadError = e.localizedMessage ?: "تعذر تحميل السجل",
                        )
                    }
                }
        }
    }

    fun loadMore() {
        val current = _state.value
        if (!current.hasMore || current.isLoading) return
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            runCatching { repo.getHistory(page = current.page + 1, limit = 20) }
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            items = it.items + page.items,
                            page = page.page,
                            hasMore = page.hasMore,
                            isLoading = false,
                        )
                    }
                }
                .onFailure {
                    // Silent fail on pagination — next scroll retries.
                    _state.update { it.copy(isLoading = false) }
                }
        }
    }
}
