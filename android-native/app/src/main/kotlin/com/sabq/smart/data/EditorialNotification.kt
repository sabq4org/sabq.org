package com.sabq.smart.data

/**
 * Domain model for an editorial push history row. Mapped from
 * [com.sabq.smart.data.api.ApiEditorialNotification]; same field set
 * as iOS `APIEditorialNotification`.
 */
data class EditorialNotification(
    val id: String,
    /** "scheduled" | "published" | "rejected" | "needs_revision" | "archived" */
    val type: String,
    val title: String,
    val body: String,
    val articleId: String?,
    val articleTitle: String?,
    val articleSlug: String?,
    val deepLink: String?,
    val reviewerNote: String?,
    val readAt: String?,
    val createdAt: String,
) {
    val isUnread: Boolean get() = readAt.isNullOrBlank()
}

data class EditorialNotificationsPage(
    val items: List<EditorialNotification>,
    val unread: Int,
)

data class EditorialNotificationPreferences(
    val scheduledEnabled: Boolean,
    val publishedEnabled: Boolean,
    val rejectedEnabled: Boolean,
    val revisionEnabled: Boolean,
) {
    companion object {
        val AllOn = EditorialNotificationPreferences(
            scheduledEnabled = true,
            publishedEnabled = true,
            rejectedEnabled = true,
            revisionEnabled = true,
        )
    }
}
