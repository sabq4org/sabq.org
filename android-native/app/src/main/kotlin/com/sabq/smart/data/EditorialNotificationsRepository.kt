package com.sabq.smart.data

import com.sabq.smart.data.api.ApiEditorialNotification
import com.sabq.smart.data.api.ApiEditorialNotificationPreferences
import com.sabq.smart.data.api.SabqApi
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Editorial notifications gateway — wraps the five
 * `/api/v1/notifications*` endpoints. Holds a process-wide unread
 * count so the Home-header bell can show a red dot without re-fetching
 * on every screen visit.
 *
 * Matches the iOS pattern where `NotificationsStore.shared.unreadCount`
 * is mutated by every fetch + delete + mark-read call.
 */
@Singleton
class EditorialNotificationsRepository @Inject constructor(
    private val api: SabqApi,
) {
    private val _unreadCount = MutableStateFlow(0)
    val unreadCount: StateFlow<Int> = _unreadCount.asStateFlow()

    suspend fun fetch(): EditorialNotificationsPage {
        val page = api.getEditorialNotifications()
        _unreadCount.value = page.unread
        return EditorialNotificationsPage(
            items = page.items.map { it.toDomain() },
            unread = page.unread,
        )
    }

    suspend fun markRead(id: String) {
        api.markEditorialNotificationRead(id)
        if (_unreadCount.value > 0) {
            _unreadCount.value = _unreadCount.value - 1
        }
    }

    suspend fun markAllRead() {
        api.markAllEditorialNotificationsRead()
        _unreadCount.value = 0
    }

    suspend fun delete(id: String, wasUnread: Boolean) {
        api.deleteEditorialNotification(id)
        if (wasUnread && _unreadCount.value > 0) {
            _unreadCount.value = _unreadCount.value - 1
        }
    }

    suspend fun deleteAll() {
        api.deleteAllEditorialNotifications()
        _unreadCount.value = 0
    }

    suspend fun fetchPreferences(): EditorialNotificationPreferences =
        api.getNotificationPreferences().preferences.toDomain()

    suspend fun updatePreferences(prefs: EditorialNotificationPreferences) {
        api.updateNotificationPreferences(prefs.toApi())
    }
}

private fun ApiEditorialNotification.toDomain(): EditorialNotification =
    EditorialNotification(
        id = id,
        type = type,
        title = title,
        body = body,
        articleId = articleId,
        articleTitle = articleTitle,
        articleSlug = articleSlug,
        deepLink = deepLink,
        reviewerNote = reviewerNote,
        readAt = readAt,
        createdAt = createdAt,
    )

private fun ApiEditorialNotificationPreferences.toDomain(): EditorialNotificationPreferences =
    EditorialNotificationPreferences(
        scheduledEnabled = scheduledEnabled,
        publishedEnabled = publishedEnabled,
        rejectedEnabled = rejectedEnabled,
        revisionEnabled = revisionEnabled,
    )

private fun EditorialNotificationPreferences.toApi(): ApiEditorialNotificationPreferences =
    ApiEditorialNotificationPreferences(
        scheduledEnabled = scheduledEnabled,
        publishedEnabled = publishedEnabled,
        rejectedEnabled = rejectedEnabled,
        revisionEnabled = revisionEnabled,
    )
