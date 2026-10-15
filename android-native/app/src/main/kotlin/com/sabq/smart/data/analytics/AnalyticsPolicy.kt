package com.sabq.smart.data.analytics

import java.net.URLDecoder

/** Pure event boundary, also exercised without Android or a Google account. */
object AnalyticsPolicy {
    private val fields = mapOf(
        "screen_view" to setOf("screen_name", "screen_class"),
        "article_view" to setOf("article_id", "article_title", "content_type", "category"),
        "opinion_view" to setOf("article_id", "article_title", "author", "content_type"),
        "share_intent" to setOf("article_id", "method"),
        "share" to setOf("article_id", "method", "stage"),
        "bookmark_toggle" to setOf("article_id", "bookmarked"),
        "search" to setOf("search_term"),
        "article_like" to setOf("article_id", "liked"),
        "article_comment" to setOf("article_slug", "parent_comment_id"),
        "login" to setOf("method"), "sign_up" to setOf("method"),
        "push_open" to setOf("notification_type", "article_id"),
        "deep_link_open" to setOf("kind", "source", "article_id"),
        "scroll_depth" to setOf("article_id", "percent_scrolled"),
        "reading_time" to setOf("article_id", "reading_time_seconds"),
        "lite_mode_activated" to setOf("trigger"),
        "lite_mode_deactivated" to setOf("trigger"),
    )
    private val identifiers = setOf("article_id", "parent_comment_id")
    private val sensitive = Regex("(?:@|https?://|www\\.|(?:token|password|secret|email|phone|code)\\s*[=:])", RegexOption.IGNORE_CASE)
    private val phone = Regex("(?<![\\p{L}\\p{Nd}])\\+?\\p{Nd}[\\p{Nd}\\s().-]{5,}\\p{Nd}(?![\\p{L}\\p{Nd}])")
    private val privateScreen = Regex("admin|dashboard|profile|account|settings|login|signup|auth|password|survey|contact|draft|editor|more|bookmarks", RegexOption.IGNORE_CASE)

    fun canCollect(consented: Boolean, debug: Boolean, debugOptIn: Boolean, configured: Boolean) =
        consented && configured && (!debug || debugOptIn)

    fun readingDepth(index: Int, count: Int, visibleFraction: Float): Float =
        if (count <= 0 || index !in 0 until count) 0f
        else ((index + visibleFraction.coerceIn(0f, 1f)) / count).coerceIn(0f, 1f)

    fun publicScreen(name: String) = name.isNotBlank() && !privateScreen.containsMatchIn(name)

    fun sanitize(name: String, params: Map<String, Any>): Map<String, Any>? {
        val allowed = fields[name] ?: return null
        if (name == "screen_view" && !publicScreen(params["screen_name"] as? String ?: "")) return null
        val result = buildMap<String, Any> {
            params.forEach { (key, raw) ->
                if (key !in allowed) return@forEach
                when (raw) {
                    is String -> cleanString(key, raw)?.let { put(key, it) }
                    is Boolean -> put(key, if (raw) 1L else 0L)
                    is Int -> put(key, raw.toLong())
                    is Long -> put(key, raw)
                    is Float -> if (raw.isFinite()) put(key, raw.toDouble())
                    is Double -> if (raw.isFinite()) put(key, raw)
                }
            }
        }
        if (name == "search" && result["search_term"] == null) return null
        if (name == "screen_view" && result["screen_name"] == null) return null
        return result
    }

    private fun cleanString(key: String, raw: String): String? {
        var decoded = raw.trim()
        repeat(2) { decoded = runCatching { URLDecoder.decode(decoded, "UTF-8") }.getOrDefault(decoded) }
        if (decoded.isBlank() || sensitive.containsMatchIn(decoded)) return null
        if (key in identifiers) return decoded.takeIf { it.length <= 100 && Regex("[A-Za-z0-9_-]+").matches(it) }
        if (phone.containsMatchIn(decoded)) return null
        return decoded.take(100)
    }
}

/** One reading event per visible article visit; background time never accrues. */
class AnalyticsReadingSession(private val nowMs: () -> Long) {
    private var activeSince: Long? = null
    private var elapsedMs = 0L
    private var closed = false
    private val reached = mutableSetOf<Int>()

    fun active(active: Boolean) {
        if (closed) return
        val now = nowMs()
        activeSince?.let { elapsedMs += (now - it).coerceAtLeast(0) }
        activeSince = if (active) now else null
    }

    fun depth(percent: Int): List<Int> {
        if (closed || activeSince == null) return emptyList()
        return listOf(25, 50, 75, 90).filter { percent >= it && reached.add(it) }
    }

    fun finish(): Long? {
        if (closed) return null
        active(false)
        closed = true
        return (elapsedMs / 1000).takeIf { it >= 10 }
    }
}
