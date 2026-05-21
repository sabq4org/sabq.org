package com.sabq.smart.data

import com.sabq.smart.data.api.ApiAudioNewsletter
import com.sabq.smart.data.api.ApiCalendarEvent
import com.sabq.smart.data.api.ApiHajjArticle
import com.sabq.smart.data.api.ApiHajjBlockResponse
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
    /** Optional editorial description shown on the dedicated calendar
     *  screen. Null when the backend omits it (most rows). */
    val description: String? = null,
    /** "GLOBAL" | "NATIONAL" | "INTERNAL" — drives the chip label +
     *  tint on the calendar screen. Null falls back to "حدث" / grey. */
    val type: String? = null,
    /** ISO-8601 start timestamp. Empty string when missing — the date
     *  grouping logic guards on that. */
    val dateStart: String = "",
)

/** Domain model for the seasonal "صدى الحج" block. Mirrors iOS
 *  `APIHajjBlockResponse` + `APIHajjArticle` collapsed into a single
 *  "visible" struct — repos return `null` for "hidden" instead of
 *  shipping an isVisible flag downstream. */
data class HajjBlock(
    val title: String,
    val subtitle: String?,
    val articles: List<HajjArticle>,
    val hajjDay: Int?,
    val daysToArafat: Int?,
    /** tarwiyah | arafat | nahr | tashreeq | before | after */
    val hajjPhase: String?,
    val lastUpdatedAt: String?,
)

data class HajjArticle(
    val id: String,
    val title: String,
    val slug: String?,
    val imageUrl: String?,
    val publishedAt: String?,
    val isPinned: Boolean,
    val hajjTag: String,
    val hajjEmoji: String,
)

data class AudioNewsletter(
    val id: String,
    val title: String,
    val slug: String,
    val durationSeconds: Int?,
    /** Short editorial blurb shown under the title in the dedicated
     *  AudioNewsletters screen. iOS counterpart: `APIAudioNewsletter
     *  .description`. Null/empty when the editor didn't ship one. */
    val description: String? = null,
    /** Cover image URL — absolutized at the boundary. Falls back to
     *  the gradient placeholder when null. */
    val coverImageUrl: String? = null,
    /** MP3 stream URL. Required for playback. Newsletters with a
     *  null `audioUrl` render the row with a disabled play button —
     *  matches iOS `.disabled(n.audioUrl == nil)`. */
    val audioUrl: String? = null,
    /** Lifetime listen count surfaced as a small headphones badge in
     *  the row. Only displayed when > 0. */
    val totalListens: Int? = null,
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

    /** Full list for the dedicated AudioNewsletters screen. iOS uses
     *  the same `/api/audio-newsletters` endpoint. */
    suspend fun getAllAudioNewsletters(): List<AudioNewsletter> =
        api.getAudioNewsletters().newsletters.map { it.toDomain() }

    /** Seasonal Hajj block. Returns `null` when the backend hides the
     *  block (out of season / disabled / no matching articles) or when
     *  the response carries no articles — both cases should render
     *  nothing on Home, same as iOS [[HajjBlockView]]. */
    suspend fun getHajjBlock(): HajjBlock? =
        api.getHajjBlock().toDomainOrNull()
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
    description = description?.takeIf { it.isNotBlank() },
    type = type?.takeIf { it.isNotBlank() },
    dateStart = dateStart,
)

private fun ApiAudioNewsletter.toDomain(): AudioNewsletter = AudioNewsletter(
    id = id.takeIf { it.isNotBlank() } ?: slug,
    title = title,
    slug = slug,
    durationSeconds = duration,
    description = description?.trim()?.takeIf { it.isNotEmpty() },
    coverImageUrl = coverImageUrl?.let { absolutize(it) },
    audioUrl = audioUrl?.let { absolutize(it) },
    totalListens = totalListens?.takeIf { it > 0 },
)

private fun ApiHajjBlockResponse.toDomainOrNull(): HajjBlock? {
    if (!isVisible) return null
    if (articles.isEmpty()) return null
    return HajjBlock(
        title = title?.takeIf { it.isNotBlank() } ?: "صدى الحج",
        subtitle = subtitle?.takeIf { it.isNotBlank() },
        articles = articles.map { it.toDomain() },
        hajjDay = hajjDay,
        daysToArafat = daysToArafat,
        hajjPhase = hajjPhase?.takeIf { it.isNotBlank() },
        lastUpdatedAt = lastUpdatedAt,
    )
}

private fun ApiHajjArticle.toDomain(): HajjArticle = HajjArticle(
    id = id.takeIf { it.isNotBlank() } ?: (slug ?: title),
    title = title,
    slug = slug?.takeIf { it.isNotBlank() },
    imageUrl = imageUrl?.let { absolutize(it) },
    publishedAt = publishedAt?.takeIf { it.isNotBlank() },
    isPinned = isPinned == true,
    hajjTag = hajjTag,
    hajjEmoji = hajjEmoji.takeIf { it.isNotBlank() } ?: "🕋",
)

/** Absolute-URL guard. iOS prefixes relative paths with the web origin
 *  inside the decoder; we do it once at the boundary. */
private fun absolutize(raw: String): String =
    if (raw.startsWith("http://") || raw.startsWith("https://")) raw
    else "https://sabq.org${if (raw.startsWith("/")) "" else "/"}$raw"
