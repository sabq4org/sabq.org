package com.sabq.smart.feature.muqtarab

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apartment
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Book
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BusinessCenter
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CenterFocusStrong
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Eco
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.LocalCafe
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Rocket
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.sabq.smart.data.MuqTopic
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Visual helpers for «مُقترب», ported from iOS `MuqtarabView.swift`
 * (lines 25-139): the angle-colour theme, Lucide→Material icon map,
 * Arabic date formatting, reading-time estimate, and the duplicate-lead
 * stripper. Kept in the feature package so the screens read 1:1 against
 * the SwiftUI source.
 */

private val MuqFallbackColor = Color(0.39f, 0.40f, 0.95f, 1f)

/** Parse a `#RRGGBB` / `#RGB` hex into a Compose [Color]; falls back to
 *  the iOS indigo default when missing/malformed. Mirrors the
 *  `UIColor(muqHex:)` initialiser. */
fun muqColorFromHex(hex: String?): Color {
    if (hex.isNullOrBlank()) return MuqFallbackColor
    var s = hex.trim().removePrefix("#")
    if (s.length == 3) s = s.map { "$it$it" }.joinToString("")
    if (s.length != 6) return MuqFallbackColor
    val value = s.toLongOrNull(16) ?: return MuqFallbackColor
    return Color(
        red = ((value shr 16) and 0xFF) / 255f,
        green = ((value shr 8) and 0xFF) / 255f,
        blue = (value and 0xFF) / 255f,
        alpha = 1f,
    )
}

/**
 * Derived palette for an angle colour — the opacity ladder iOS uses for
 * pills, borders, and gradients (`MuqTheme` struct).
 */
@Immutable
class MuqTheme(hex: String?) {
    val color: Color = muqColorFromHex(hex)
    val soft: Color get() = color.copy(alpha = 0.12f)
    val softer: Color get() = color.copy(alpha = 0.06f)
    val border: Color get() = color.copy(alpha = 0.30f)
    val glow: Color get() = color.copy(alpha = 0.35f)
    fun gradient(): Brush = Brush.linearGradient(
        colors = listOf(color, color.copy(alpha = 0.82f)),
    )
}

/**
 * Lucide icon-key → Material icon. The SwiftUI source maps to SF
 * Symbols; we map the same keys to the closest Material equivalents so
 * the angle iconography reads the same. Default is a "scope"-like
 * crosshair, matching iOS.
 */
fun muqIcon(iconKey: String?): ImageVector {
    val key = iconKey?.lowercase()?.replace("-", "")?.replace("_", "") ?: return Icons.Filled.CenterFocusStrong
    return when (key) {
        "circle" -> Icons.Filled.Circle
        "sparkles" -> Icons.Filled.AutoAwesome
        "star" -> Icons.Filled.Star
        "pen", "pentool", "feather", "edit" -> Icons.Filled.Edit
        "bookopen" -> Icons.Filled.MenuBook
        "book" -> Icons.Filled.Book
        "lightbulb" -> Icons.Filled.Lightbulb
        "brain" -> Icons.Filled.Psychology
        "globe" -> Icons.Filled.Public
        "newspaper" -> Icons.Filled.Newspaper
        "trendingup" -> Icons.Filled.TrendingUp
        "heart" -> Icons.Filled.Favorite
        "camera" -> Icons.Filled.CameraAlt
        "mic" -> Icons.Filled.Mic
        "music" -> Icons.Filled.MusicNote
        "film" -> Icons.Filled.Movie
        "coffee" -> Icons.Filled.LocalCafe
        "compass" -> Icons.Filled.Explore
        "flag" -> Icons.Filled.Flag
        "zap", "bolt" -> Icons.Filled.Bolt
        "eye" -> Icons.Filled.Visibility
        "messagecircle" -> Icons.Filled.ChatBubble
        "users" -> Icons.Filled.Group
        "user", "person" -> Icons.Filled.Person
        "award" -> Icons.Filled.EmojiEvents
        "target" -> Icons.Filled.GpsFixed
        "bookmark" -> Icons.Filled.Bookmark
        "quote" -> Icons.Filled.FormatQuote
        "graduationcap" -> Icons.Filled.School
        "briefcase" -> Icons.Filled.BusinessCenter
        "building" -> Icons.Filled.Apartment
        "leaf" -> Icons.Filled.Eco
        "shield" -> Icons.Filled.Shield
        "rocket" -> Icons.Filled.Rocket
        else -> Icons.Filled.CenterFocusStrong
    }
}

private val muqArabicDateFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d MMMM yyyy", Locale("ar"))
        .withZone(ZoneId.systemDefault())

/** Format an ISO-8601 instant into an Arabic "d MMMM yyyy" date, or null
 *  when the input is blank/unparseable. Supports fractional seconds and
 *  offsets, matching the iOS dual-formatter approach. */
fun muqFormatDate(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    val instant: Instant = runCatching { Instant.parse(iso) }.getOrNull()
        ?: runCatching { OffsetDateTime.parse(iso).toInstant() }.getOrNull()
        ?: return null
    return runCatching { muqArabicDateFormatter.format(instant) }.getOrNull()
}

private fun muqStripTags(html: String): String =
    html.replace(Regex("<[^>]+>"), " ")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")

private fun muqNormalize(s: String): String =
    muqStripTags(s).replace(Regex("\\s+"), " ").trim()

/** Estimated reading time (180 wpm for Arabic), min 1. Mirrors
 *  `muqReadingMinutes`. */
fun muqReadingMinutes(topic: MuqTopic): Int {
    val parts = buildList {
        topic.excerpt?.let { add(it) }
        val plain = topic.plainText
        if (!plain.isNullOrEmpty()) add(plain)
        else topic.rawHtml?.let { add(muqStripTags(it)) }
    }
    val words = muqNormalize(parts.joinToString(" ")).split(" ").filter { it.isNotEmpty() }.size
    return maxOf(1, Math.ceil(words / 180.0).toInt())
}

/**
 * Removes a leading `<h*>`/`<p>` block whose text duplicates the topic
 * title or excerpt (the web does the same). Runs at most twice. Mirrors
 * `muqStripDuplicateLead`.
 */
fun muqStripDuplicateLead(html: String, title: String, excerpt: String?): String {
    var result = html.trim()
    val targets = listOfNotNull(title, excerpt).map { muqNormalize(it) }.filter { it.isNotEmpty() }
    if (targets.isEmpty()) return result
    val regex = Regex(
        "^\\s*<(h[1-6]|p)\\b[^>]*>([\\s\\S]*?)</\\1>\\s*",
        setOf(RegexOption.IGNORE_CASE),
    )
    repeat(2) {
        val match = regex.find(result) ?: return result
        val innerText = muqNormalize(match.groupValues[2])
        if (targets.contains(innerText)) {
            result = result.removeRange(match.range).trim()
        } else {
            return result
        }
    }
    return result
}

/** Absolutise a server-relative asset URL against the web origin —
 *  pass-through when already absolute. Mirrors iOS
 *  `URLConstants.absolutize`. */
fun muqAbsolutize(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
    return "https://sabq.org" + (if (raw.startsWith("/")) "" else "/") + raw
}
