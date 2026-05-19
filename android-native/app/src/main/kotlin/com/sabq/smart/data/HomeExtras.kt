package com.sabq.smart.data

import com.sabq.smart.data.api.ApiAudioNewsletter
import com.sabq.smart.data.api.ApiCalendarEvent
import com.sabq.smart.data.api.ApiStory
import com.sabq.smart.data.api.SabqApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Domain models + gateway for the secondary Home blocks: stories
 * rail, calendar events, audio newsletters. iOS counterparts live
 * in `Services/APIDeepContent.swift` + `APIModels.swift:420+`.
 */

data class Story(
    val id: String,
    val title: String,
    val imageUrl: String?,
    /** Slug of the underlying article the story wraps. Stories on
     *  Sabq are curated bundles around a `rootArticleId`; the bubble
     *  tap should open that article in the standard ArticleDetail
     *  screen rather than a dedicated story page. */
    val rootArticleSlug: String?,
)

data class CalendarEvent(
    val id: String,
    val title: String,
    val importance: Int?,
)

data class AudioNewsletter(
    val id: String,
    val title: String,
    val slug: String,
    val durationSeconds: Int?,
)

@Singleton
class HomeExtrasRepository @Inject constructor(
    private val api: SabqApi,
) {
    suspend fun getStories(): List<Story> =
        api.getStories().items.map { it.toDomain() }

    suspend fun getCalendarUpcoming(days: Int = 14): List<CalendarEvent> =
        api.getCalendarUpcoming(days = days).events.map { it.toDomain() }

    suspend fun getLatestAudioNewsletter(): AudioNewsletter? =
        api.getAudioNewsletters().newsletters.firstOrNull()?.toDomain()
}

private fun ApiStory.toDomain(): Story = Story(
    id = id.takeIf { it.isNotBlank() } ?: title,
    title = title,
    imageUrl = imageUrl?.let { absolutize(it) },
    rootArticleSlug = rootArticle?.slug ?: rootArticleSlug,
)

private fun ApiCalendarEvent.toDomain(): CalendarEvent = CalendarEvent(
    id = id.takeIf { it.isNotBlank() } ?: title,
    title = title,
    importance = importance,
)

private fun ApiAudioNewsletter.toDomain(): AudioNewsletter = AudioNewsletter(
    id = id.takeIf { it.isNotBlank() } ?: slug,
    title = title,
    slug = slug,
    durationSeconds = duration,
)

/** Absolute-URL guard. iOS prefixes relative paths with the web origin
 *  inside the decoder; we do it once at the boundary. */
private fun absolutize(raw: String): String =
    if (raw.startsWith("http://") || raw.startsWith("https://")) raw
    else "https://sabq.org${if (raw.startsWith("/")) "" else "/"}$raw"
