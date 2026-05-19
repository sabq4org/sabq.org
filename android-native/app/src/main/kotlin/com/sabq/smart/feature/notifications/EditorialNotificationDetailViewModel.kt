package com.sabq.smart.feature.notifications

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.EditorialNotification
import com.sabq.smart.data.EditorialNotificationsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Hydrates the detail screen for a single editorial notification.
 *
 * The repo doesn't hold a list cache, so we re-fetch the page on
 * appear and pluck the matching id. Same trade-off iOS makes when
 * the detail sheet is opened from a cold-start deep link.
 */
@HiltViewModel
class EditorialNotificationDetailViewModel @Inject constructor(
    private val repo: EditorialNotificationsRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val id: String = savedStateHandle.get<String>("id").orEmpty()

    sealed interface DetailState {
        data object Loading : DetailState
        data class Loaded(val item: EditorialNotification) : DetailState
        data object NotFound : DetailState
        data class Failed(val message: String) : DetailState
    }

    private val _state = MutableStateFlow<DetailState>(DetailState.Loading)
    val state: StateFlow<DetailState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            runCatching { repo.fetch() }
                .onSuccess { page ->
                    val match = page.items.firstOrNull { it.id == id }
                    _state.value = if (match == null) {
                        DetailState.NotFound
                    } else {
                        DetailState.Loaded(match)
                    }
                    // Match iOS behaviour: mark-read in the background
                    // when the user lands on the detail. Decrements the
                    // header bell badge optimistically via the repo's
                    // unread flow.
                    if (match != null && match.isUnread) {
                        runCatching { repo.markRead(match.id) }
                    }
                }
                .onFailure {
                    _state.value = DetailState.Failed("تعذر فتح الإشعار")
                }
        }
    }
}
