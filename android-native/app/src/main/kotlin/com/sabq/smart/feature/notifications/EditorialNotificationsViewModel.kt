package com.sabq.smart.feature.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.EditorialNotification
import com.sabq.smart.data.EditorialNotificationsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * State container for the editorial-notifications list. Mirrors the
 * iOS `EditorialNotificationsView` state bag:
 *   - `items` / `unreadCount` / `loadState`
 *   - optimistic delete + mark-all-read flows that roll back on
 *     network failure.
 */
@HiltViewModel
class EditorialNotificationsViewModel @Inject constructor(
    private val repo: EditorialNotificationsRepository,
) : ViewModel() {

    sealed interface LoadState {
        data object Loading : LoadState
        data object Loaded : LoadState
        data class Failed(val message: String) : LoadState
    }

    data class UiState(
        val items: List<EditorialNotification> = emptyList(),
        val unread: Int = 0,
        val load: LoadState = LoadState.Loading,
        val isRefreshing: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            runCatching { repo.fetch() }
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            items = page.items,
                            unread = page.unread,
                            load = LoadState.Loaded,
                            isRefreshing = false,
                        )
                    }
                }
                .onFailure {
                    _state.update {
                        it.copy(
                            load = LoadState.Failed("تعذر جلب الإشعارات"),
                            isRefreshing = false,
                        )
                    }
                }
        }
    }

    fun refresh() {
        _state.update { it.copy(isRefreshing = true) }
        load()
    }

    /** Optimistic delete — drops the row from UI immediately, restores
     *  it if the server rejects the request. */
    fun deleteItem(item: EditorialNotification) {
        val snapshot = _state.value
        val index = snapshot.items.indexOfFirst { it.id == item.id }
        if (index < 0) return
        val newItems = snapshot.items.toMutableList().apply { removeAt(index) }
        val newUnread = if (item.isUnread) (snapshot.unread - 1).coerceAtLeast(0) else snapshot.unread
        _state.update { it.copy(items = newItems, unread = newUnread) }

        viewModelScope.launch {
            runCatching { repo.delete(item.id, wasUnread = item.isUnread) }
                .onFailure {
                    _state.update {
                        val restored = it.items.toMutableList().apply { add(index, item) }
                        it.copy(
                            items = restored,
                            unread = if (item.isUnread) it.unread + 1 else it.unread,
                        )
                    }
                }
        }
    }

    fun markAllRead() {
        if (_state.value.unread == 0) return
        viewModelScope.launch {
            runCatching { repo.markAllRead() }
                .onSuccess { load() }
        }
    }

    fun markRead(item: EditorialNotification) {
        if (!item.isUnread) return
        viewModelScope.launch {
            runCatching { repo.markRead(item.id) }
            _state.update {
                val updated = it.items.map { row ->
                    if (row.id == item.id) row.copy(readAt = nowIso()) else row
                }
                it.copy(
                    items = updated,
                    unread = (it.unread - 1).coerceAtLeast(0),
                )
            }
        }
    }

    fun clearAll() {
        if (_state.value.items.isEmpty()) return
        val snapshot = _state.value
        _state.update { it.copy(items = emptyList(), unread = 0) }
        viewModelScope.launch {
            runCatching { repo.deleteAll() }
                .onFailure {
                    _state.update { it.copy(items = snapshot.items, unread = snapshot.unread) }
                }
        }
    }

    private fun nowIso(): String = java.time.Instant.now().toString()
}
