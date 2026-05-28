package com.sabq.smart.data

import com.sabq.smart.data.api.ApiArticle
import com.sabq.smart.ui.components.ImageFocalPoint
import java.time.Duration
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.serialization.json.*

/**
 * Map an [ApiArticle] from the backend to the domain [Article] our
 * design system already renders.
 *
 * iOS counterpart: ArticlesStore.processArticles + a handful of
 * computed properties on APIArticle. We do the mapping eagerly here
 * so the UI gets stable values without recomputing on every recomposition.
 */
fun ApiArticle.toDomain(webOrigin: String = "https://sabq.org"): Article {
    // Category resolution priority:
    //   1. nested category slug (English key) — when shipped
    //   2. flat categorySlug (English key)
    //   3. Arabic section string (e.g. "محليات", "اقتصاديات")
    val resolvedCategory = when {
        category?.slug != null -> ArticleCategory.fromKey(category.slug.lowercase(Locale.ROOT))
        categorySlug != null -> ArticleCategory.fromKey(categorySlug.lowercase(Locale.ROOT))
        else -> ArticleCategory.fromArabicSection(category?.name ?: categoryName)
    }

    val resolvedTitle = title.ifBlank { "(بدون عنوان)" }
    val resolvedExcerpt = excerpt
        ?: aiSummary
        ?: summary
        ?: ""

    val resolvedImageUrl = imageUrl ?: thumbnailUrl
    val absoluteImageUrl = resolvedImageUrl
        ?.takeIf { it.isNotBlank() }
        ?.let { if (it.startsWith("http")) it else webOrigin + (if (it.startsWith("/")) it else "/$it") }

    val focal = ImageFocalPoint.normalised(imageFocalPoint?.x, imageFocalPoint?.y)

    val parsedDate = parseDate(publishedAt)

    val breaking = isBreaking == true || newsType?.equals("breaking", ignoreCase = true) == true

    val resolvedAuthor = authorName?.takeIf { it.isNotBlank() } ?: resolveAuthor(author)

    val resolvedTags: List<String> = extractTags(seo, tags)
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .distinct()

    val resolvedArticleUrl = articleUrl?.takeIf { it.isNotBlank() }
        ?: slug?.takeIf { it.isNotBlank() }?.let { "$webOrigin/article/$it" }

    // Weekly-photos pack: prefix relative URLs with the site origin
    // (iOS does the same — APIWeeklyPhoto.init line 32-38). Drop
    // entries whose imageUrl is blank so the gallery never renders a
    // dead row.
    val resolvedWeeklyPhotos: List<WeeklyPhoto> = weeklyPhotosContainer?.photos
        .orEmpty()
        .mapNotNull { raw ->
            val url = raw.imageUrl.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val absolute = when {
                url.startsWith("http") -> url
                url.startsWith("/") -> "$webOrigin$url"
                else -> "$webOrigin/$url"
            }
            WeeklyPhoto(
                imageUrl = absolute,
                caption = raw.caption.trim(),
                credit = raw.credit.trim(),
            )
        }

    return Article(
        id = id.ifBlank { slug ?: "anon-${hashCode()}" },
        title = resolvedTitle,
        excerpt = resolvedExcerpt,
        category = resolvedCategory,
        imageUrl = absoluteImageUrl,
        focalPoint = focal,
        readingTime = formatReadingMinutes(readingMinutes) ?: estimateReadingTime(resolvedExcerpt),
        dateFormatted = formatRelativeDate(parsedDate),
        isBreaking = breaking,
        isFeatured = isFeatured == true,
        slug = slug,
        authorName = resolvedAuthor,
        body = body?.takeIf { it.isNotBlank() },
        articleType = articleType,
        authorGender = authorGender,
        aiSummary = aiSummary?.trim()?.takeIf { it.isNotBlank() },
        tags = resolvedTags,
        articleUrl = resolvedArticleUrl,
        isAiGeneratedImage = isAiGeneratedImage == true,
        aiImageModel = aiImageModel?.takeIf { it.isNotBlank() },
        publishedAtIso = publishedAt?.takeIf { it.isNotBlank() },
        readingMinutesInt = readingMinutes?.takeIf { it > 0 },
        weeklyPhotos = resolvedWeeklyPhotos,
        albumImages = albumImages.orEmpty()
            .filter { it.isNotBlank() }
            .map { url ->
                when {
                    url.startsWith("http") -> url
                    url.startsWith("/") -> "$webOrigin$url"
                    else -> "$webOrigin/$url"
                }
            },
    )
}

/**
 * Resolve a display author name from the raw `author` JSON field,
 * which switches between a plain string (list endpoint) and a nested
 * `{ firstName, lastName }` object (detail endpoint).
 */
private fun resolveAuthor(element: kotlinx.serialization.json.JsonElement?): String? {
    if (element == null) return null
    return when {
        element is JsonPrimitive && element.isString ->
            element.content.takeIf { it.isNotBlank() }
        element is JsonObject -> {
            val obj = element.jsonObject
            val first = obj["firstName"]?.jsonPrimitive?.contentOrNull
                ?: obj["first_name"]?.jsonPrimitive?.contentOrNull
                ?: ""
            val last = obj["lastName"]?.jsonPrimitive?.contentOrNull
                ?: obj["last_name"]?.jsonPrimitive?.contentOrNull
                ?: ""
            val combined = "$first $last".trim()
            combined.takeIf { it.isNotEmpty() }
                ?: obj["name"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
        }
        else -> null
    }
}

private fun formatReadingMinutes(minutes: Int?): String? {
    if (minutes == null || minutes <= 0) return null
    return when (minutes) {
        1 -> "دقيقة"
        2 -> "دقيقتان"
        in 3..10 -> "$minutes دقائق"
        else -> "$minutes دقيقة"
    }
}

/** Backend ships ISO-8601 in publishedAt. Tolerate missing or malformed input. */
private fun parseDate(raw: String?): ZonedDateTime? {
    if (raw.isNullOrBlank()) return null
    return runCatching { OffsetDateTime.parse(raw).atZoneSameInstant(ZoneId.of("Asia/Riyadh")) }
        .recoverCatching { ZonedDateTime.parse(raw) }
        .recoverCatching {
            ZonedDateTime.parse(
                raw,
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss", Locale.ROOT)
                    .withZone(ZoneId.of("Asia/Riyadh")),
            )
        }
        .getOrNull()
}

/**
 * Compact Arabic relative-date string used in feed metadata rows.
 * iOS uses `RelativeDateTimeFormatter` with `Locale("ar")` — we mirror
 * its breakpoints by hand because Android's
 * `RelativeDateTimeFormatter` doesn't perfectly round-trip the iOS
 * output for Arabic.
 */
private fun formatRelativeDate(date: ZonedDateTime?): String {
    if (date == null) return ""
    val now = ZonedDateTime.now(ZoneId.of("Asia/Riyadh"))
    val diff = Duration.between(date, now)
    return when {
        diff.isNegative -> "الآن"
        diff.toMinutes() < 1 -> "الآن"
        diff.toMinutes() < 60 -> "منذ ${diff.toMinutes()} دقيقة"
        diff.toHours() < 6 -> "منذ ${diff.toHours()} ساعات"
        diff.toHours() < 24 && date.dayOfYear == now.dayOfYear ->
            "اليوم ${date.format(DateTimeFormatter.ofPattern("HH:mm"))}"
        diff.toDays() < 2 -> "أمس"
        diff.toDays() < 7 -> "منذ ${diff.toDays()} أيام"
        else -> date.format(DateTimeFormatter.ofPattern("d MMM", Locale("ar")))
    }
}

/**
 * Rough reading-time estimate. The list endpoint doesn't ship the full
 * body, only an excerpt — we extrapolate based on a 200-words/minute
 * pace and the excerpt length, then clamp to [2, 8] minutes which
 * matches what iOS surfaces in the home feed.
 */
private fun estimateReadingTime(excerpt: String): String {
    val wordCount = excerpt.split(Regex("\\s+")).filter { it.isNotBlank() }.size
    // Excerpt ≈ first ~10% of a typical article — multiply for whole body.
    val estimatedTotalWords = wordCount * 10
    val minutes = (estimatedTotalWords / 200).coerceIn(2, 8)
    return "$minutes ${if (minutes == 1) "دقيقة" else "دقائق"}"
}

private fun extractTags(seo: com.sabq.smart.data.api.ApiSeo?, tagsElement: JsonElement?): List<String> {
    val list = mutableListOf<String>()

    // 1. Check SEO keywords
    if (seo?.keywords != null) {
        val keywordsEl = seo.keywords
        if (keywordsEl is JsonArray) {
            for (element in keywordsEl) {
                val content = (element as? JsonPrimitive)?.content
                if (!content.isNullOrBlank()) {
                    list.add(content)
                }
            }
        } else if (keywordsEl is JsonPrimitive) {
            val csv = keywordsEl.content
            if (csv.isNotBlank()) {
                list.addAll(csv.split(",").map { it.trim() }.filter { it.isNotEmpty() })
            }
        }
    }

    if (list.isNotEmpty()) return list

    // 2. Check tagsElement
    if (tagsElement != null) {
        if (tagsElement is JsonArray) {
            for (element in tagsElement) {
                if (element is JsonObject) {
                    val name = (element["name"] as? JsonPrimitive)?.content
                        ?: (element["nameAr"] as? JsonPrimitive)?.content
                    if (!name.isNullOrBlank()) {
                        list.add(name)
                    }
                } else {
                    val content = (element as? JsonPrimitive)?.content
                    if (!content.isNullOrBlank()) {
                        list.add(content)
                    }
                }
            }
        } else if (tagsElement is JsonPrimitive) {
            val csv = tagsElement.content
            if (csv.isNotBlank()) {
                list.addAll(csv.split(",").map { it.trim() }.filter { it.isNotEmpty() })
            }
        }
    }

    return list
}
