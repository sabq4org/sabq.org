package com.sabq.smart.feature.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.EditorialNotificationsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * Tiny VM whose only job is to surface the editorial-notifications
 * unread count to the Home header bell + trigger a one-shot fetch
 * on first composition. The repo's underlying StateFlow stays in sync
 * across screens so a delete on the list page also drops the badge.
 */
@HiltViewModel
class EditorialBellViewModel @Inject constructor(
    private val repo: EditorialNotificationsRepository,
) : ViewModel() {

    val unreadCount: StateFlow<Int> = repo.unreadCount

    /** Best-effort populate. Failures are silent — the badge just
     *  stays at whatever the previous fetch left it (0 on cold start). */
    fun refresh() {
        viewModelScope.launch {
            runCatching { repo.fetch() }
        }
    }
}
