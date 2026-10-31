package com.sabq.smart.feature.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.EditorialNotificationsRepository
import com.sabq.smart.feature.inbox.ReaderInboxStore
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * عدّاد جرس الرئيسية. الجرس يفتح صندوق القارئ (/v1/inbox)، وفي أعلاه للطاقم
 * «إشعاراتي التحريرية»، فالنقطة = غير المقروء في الاثنين (نظير iOS
 * `NotificationsStore.totalUnread`).
 */
@HiltViewModel
class EditorialBellViewModel @Inject constructor(
    private val repo: EditorialNotificationsRepository,
    private val reader: ReaderInboxStore,
) : ViewModel() {

    val unreadCount: StateFlow<Int> = combine(repo.unreadCount, reader.unread) { a, b -> a + b }
        .stateIn(viewModelScope, SharingStarted.Eagerly, 0)

    /** Best-effort populate. Failures are silent — the badge just
     *  stays at whatever the previous fetch left it (0 on cold start). */
    fun refresh() {
        viewModelScope.launch { runCatching { repo.fetch() } }
        viewModelScope.launch { reader.refreshUnread() }
    }
}
