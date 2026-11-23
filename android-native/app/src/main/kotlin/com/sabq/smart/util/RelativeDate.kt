package com.sabq.smart.util

import java.time.Duration
import java.time.OffsetDateTime
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Parses an ISO-8601 / RFC-3339 timestamp string and returns a
 * compact Arabic relative-time label ("الآن", "منذ 3 دقيقة",
 * "اليوم 14:32", "أمس", "منذ 5 أيام", or a "d MMM" fallback).
 *
 * iOS uses `RelativeDateTimeFormatter` with `Locale("ar-u-nu-latn")`
 * — the bucketing here matches its output for the bucket sizes
 * the in-app feed actually exposes.
 */
fun formatRelativeDateAr(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val zone = displayZone()
    val zoned = runCatching { OffsetDateTime.parse(iso).toInstant().atZone(zone) }.getOrNull()
        ?: runCatching { ZonedDateTime.parse(iso).withZoneSameInstant(zone) }.getOrNull()
        ?: return iso
    val now = ZonedDateTime.now(zone)
    val diff = Duration.between(zoned, now)
    return when {
        diff.isNegative -> "الآن"
        diff.toMinutes() < 1 -> "الآن"
        diff.toMinutes() < 60 -> "منذ ${diff.toMinutes()} دقيقة"
        diff.toHours() < 6 -> "منذ ${diff.toHours()} ساعات"
        diff.toHours() < 24 && zoned.dayOfYear == now.dayOfYear ->
            "اليوم ${zoned.format(DateTimeFormatter.ofPattern("HH:mm"))}"
        diff.toDays() < 2 -> "أمس"
        diff.toDays() < 7 -> "منذ ${diff.toDays()} أيام"
        else -> zoned.format(DateTimeFormatter.ofPattern("d MMM", Locale("ar")))
    }
}
