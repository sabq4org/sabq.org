package com.sabq.smart.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames

/**
 * Editorial-notification API shapes — mirror the iOS
 * [APIEditorialNotification] / [EditorialNotificationsPage] decoders
 * in `Services/APIModels.swift:1750-1916`.
 *
 * The backend serves these under `/api/v1/notifications` (Bearer
 * token required). Same field tolerance as the rest of the codebase:
 * snake_case + camelCase both accepted via [JsonNames].
 */

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiEditorialNotification(
    val id: String = "",
    @JsonNames("user_id")
    val userId: String? = null,
    /** "scheduled" | "published" | "rejected" | "needs_revision" | "archived" */
    val type: String = "",
    val title: String = "",
    val body: String = "",
    @JsonNames("article_id")
    val articleId: String? = null,
    @JsonNames("article_title")
    val articleTitle: String? = null,
    @JsonNames("article_slug")
    val articleSlug: String? = null,
    @JsonNames("deep_link")
    val deepLink: String? = null,
    @JsonNames("reviewer_note")
    val reviewerNote: String? = null,
    @JsonNames("delivery_status")
    val deliveryStatus: String? = null,
    @JsonNames("read_at")
    val readAt: String? = null,
    @JsonNames("created_at")
    val createdAt: String = "",
)

@Serializable
data class ApiEditorialNotificationsPage(
    val success: Boolean = true,
    val items: List<ApiEditorialNotification> = emptyList(),
    val unread: Int = 0,
)

/** Per-type push toggles persisted on the server. */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiEditorialNotificationPreferences(
    @JsonNames("scheduled_enabled")
    val scheduledEnabled: Boolean = true,
    @JsonNames("published_enabled")
    val publishedEnabled: Boolean = true,
    @JsonNames("rejected_enabled")
    val rejectedEnabled: Boolean = true,
    @JsonNames("revision_enabled")
    val revisionEnabled: Boolean = true,
)

/** Wrapper shape `{ "preferences": { ... } }` returned by `GET
 *  /api/v1/notifications/preferences`. iOS handles the same envelope
 *  inline; we surface it as a typed wrapper. */
@Serializable
data class ApiEditorialNotificationPreferencesEnvelope(
    val preferences: ApiEditorialNotificationPreferences =
        ApiEditorialNotificationPreferences(),
)
