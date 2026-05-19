package com.sabq.smart.data

import com.sabq.smart.data.api.ApiLiveUpdate
import com.sabq.smart.ui.components.ImageFocalPoint
import java.time.Duration
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Build an [Article] shell from an [ApiLiveUpdate]. The list cell
 * uses CompactArticleRow, which needs an `Article` — iOS does the
 * same trick (see `articleFromUpdate` in MomentByMomentView.swift
 * line 327). The detail screen refetches the full payload via
 * `getArticleBySlug` anyway, so we only need enough to render the
 * row + carry the slug forward.
 */
fun ApiLiveUpdate.toArticleShell(webOrigin: String = "https://sabq.org"): Article {
    val resolvedCategory = ArticleCategory.fromArabicSection(categoryNameAr)

    val absoluteImageUrl = imageUrl
        ?.takeIf { it.isNotBlank() }
        ?.let { if (it.startsWith("http")) it else webOrigin + (if (it.startsWith("/")) it else "/$it") }

    val focal = ImageFocalPoint.normalised(imageFocalPoint?.x, imageFocalPoint?.y)

    return Article(
        id = id.ifBlank { slug.ifBlank { "anon-${hashCode()}" } },
        title = title.ifBlank { "(بدون عنوان)" },
        excerpt = summary?.take(280) ?: "",
        category = resolvedCategory,
        imageUrl = absoluteImageUrl,
        focalPoint = focal,
        readingTime = "دقيقة", // unknown for live updates; safe default
        dateFormatted = formatLiveRelative(publishedAt),
        isBreaking = isBreaking,
        isFeatured = false,
        slug = slug,
        authorName = "سبق",
        body = null,
        articleType = null,
        authorGender = null,
    )
}

/**
 * "قبل X دقيقة / ساعة / يوم" — iOS uses RelativeDateTimeFormatter with
 * `ar-u-nu-latn` (Latin digits per editorial preference). The format
 * differs slightly from regular articles to fit the live-feed style.
 */
private fun formatLiveRelative(iso: String): String {
    if (iso.isBlank()) return ""
    val date = parseIso(iso) ?: return iso
    val now = ZonedDateTime.now(ZoneId.of("Asia/Riyadh"))
    val diff = Duration.between(date, now)
    return when {
        diff.isNegative -> "الآن"
        diff.toSeconds() < 60 -> "قبل لحظات"
        diff.toMinutes() < 60 -> "قبل ${diff.toMinutes()} دقيقة"
        diff.toHours() < 24 -> "قبل ${diff.toHours()} ساعة"
        diff.toDays() < 2 -> "أمس"
        diff.toDays() < 7 -> "قبل ${diff.toDays()} أيام"
        else -> date.format(DateTimeFormatter.ofPattern("d MMM", Locale("ar")))
    }
}

private fun parseIso(s: String): ZonedDateTime? {
    if (s.isBlank()) return null
    return runCatching { OffsetDateTime.parse(s).atZoneSameInstant(ZoneId.of("Asia/Riyadh")) }
        .recoverCatching { ZonedDateTime.parse(s) }
        .getOrNull()
}
