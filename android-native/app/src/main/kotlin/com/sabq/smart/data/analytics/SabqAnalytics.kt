package com.sabq.smart.data.analytics

import android.util.Log

/**
 * No-op analytics facade. 1:1 port of iOS `Services/SabqAnalytics.swift`.
 *
 * Firebase Analytics was removed from iOS in build 9.0.6 (2026051806)
 * while investigating App Store auto-rejection that may have been
 * triggered by the bundled FirebaseAnalytics / GoogleAppMeasurement /
 * GoogleAdsOnDeviceConversion frameworks. We mirror that decision on
 * Android — every call here is a no-op (debug log only) so the
 * call-sites stay stable and a replacement provider can drop in later
 * without touching every screen.
 *
 * Two ways to wire a real provider later:
 *   1. Replace the function bodies here with the provider SDK calls.
 *   2. Add a Hilt-injected `AnalyticsClient` interface and forward
 *      each call through it; flip via build variant or remote config.
 *
 * Call sites already live on Android in:
 *   - ArticleDetailScreen → [articleView] on first compose.
 *   - SearchViewModel     → [search] when a query commits.
 *   - BookmarksStore /
 *     ArticleDetailScreen → [bookmarkToggle] on save.
 *
 * Add `screen("...")` from any top-level destination's
 * `LaunchedEffect(Unit) { ... }` if you want per-screen tracking.
 */
object SabqAnalytics {

    private const val TAG = "SabqAnalytics"

    /** Generic event with optional parameters. Mirrors
     *  `Analytics.logEvent(name, parameters:)` on Firebase. */
    fun log(name: String, parameters: Map<String, Any>? = null) {
        Log.d(TAG, "log: $name${parameters?.let { " $it" } ?: ""}")
    }

    /** Per-screen tracking. iOS uses a SwiftUI modifier
     *  (`.sabqScreen(...)`) that wraps `screen(name)`. */
    fun screen(name: String, screenClass: String? = null) {
        Log.d(TAG, "screen: $name${screenClass?.let { " ($it)" } ?: ""}")
    }

    fun articleView(id: String, title: String, category: String?) {
        Log.d(TAG, "articleView: id=$id title=\"$title\" category=${category ?: "-"}")
    }

    fun opinionView(id: String, title: String, authorName: String) {
        Log.d(TAG, "opinionView: id=$id title=\"$title\" author=$authorName")
    }

    fun articleShare(id: String, platform: String) {
        Log.d(TAG, "articleShare: id=$id platform=$platform")
    }

    fun bookmarkToggle(id: String, isBookmarked: Boolean) {
        Log.d(TAG, "bookmarkToggle: id=$id ${if (isBookmarked) "saved" else "removed"}")
    }

    fun search(query: String) {
        Log.d(TAG, "search: \"$query\"")
    }
}
