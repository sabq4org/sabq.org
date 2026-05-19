package com.sabq.smart.feature.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.EditorialNotificationPreferences
import com.sabq.smart.data.EditorialNotificationsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Holds the four push-toggle states + auto-saves on each change.
 * Mirrors iOS `NotificationPreferencesView`, which uses
 * `.onChange(of: prefs)` to fire a PUT after the user lifts their
 * finger on any toggle.
 */
@HiltViewModel
class NotificationPreferencesViewModel @Inject constructor(
    private val repo: EditorialNotificationsRepository,
) : ViewModel() {

    data class UiState(
        val prefs: EditorialNotificationPreferences = EditorialNotificationPreferences.AllOn,
        val loaded: Boolean = false,
        val saving: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { load() }

    private fun load() {
        viewModelScope.launch {
            runCatching { repo.fetchPreferences() }
                .onSuccess { prefs ->
                    _state.update { it.copy(prefs = prefs, loaded = true) }
                }
                .onFailure {
                    // Keep the default (allOn) but flip loaded so toggles
                    // become responsive — failure is harmless, a save
                    // will recreate the row server-side.
                    _state.update { it.copy(loaded = true) }
                }
        }
    }

    fun setScheduled(value: Boolean) = update { it.copy(scheduledEnabled = value) }
    fun setPublished(value: Boolean) = update { it.copy(publishedEnabled = value) }
    fun setRejected(value: Boolean) = update { it.copy(rejectedEnabled = value) }
    fun setRevision(value: Boolean) = update { it.copy(revisionEnabled = value) }

    private fun update(transform: (EditorialNotificationPreferences) -> EditorialNotificationPreferences) {
        if (!_state.value.loaded) return
        val next = transform(_state.value.prefs)
        if (next == _state.value.prefs) return
        _state.update { it.copy(prefs = next, saving = true) }
        viewModelScope.launch {
            runCatching { repo.updatePreferences(next) }
            _state.update { it.copy(saving = false) }
        }
    }
}
