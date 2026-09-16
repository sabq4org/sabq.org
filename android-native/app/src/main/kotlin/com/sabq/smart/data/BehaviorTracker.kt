package com.sabq.smart.data

import android.util.Log
import com.sabq.smart.data.api.ApiBehaviorEventRequest
import com.sabq.smart.data.api.SabqApi
import com.sabq.smart.feature.lite.LiteModeManager
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * Unified reader-side analytics for Android. Mirrors iOS [BehaviorTracker]
 * (Services/BehaviorTracker.swift) 1:1.
 *
 * وضع Lite يطفئ التتبع السلوكي بالكامل (بوابة iOS نفسها) — لا دورة
 * DI هنا: LiteModeManager يعتمد على SettingsStore + OkHttp فقط.
 */
@Singleton
class BehaviorTracker @Inject constructor(
    private val api: SabqApi,
    private val loyaltyQueue: LoyaltyEventQueue,
    private val liteModeManager: LiteModeManager,
) {
    private var activeArticleId: String? = null
    private var startedAt: Long? = null
    private var maxScrollPercent: Double = 0.0
    private var endedForCurrentSession = false

    @Synchronized
    fun startSession(articleId: String) {
        if (liteModeManager.isLiteActive.value) return
        // Idempotent — if the view re-appears (push/pop) we keep the
        // same session running rather than double-counting.
        if (activeArticleId == articleId && !endedForCurrentSession) {
            return
        }

        // If a previous session was open and never ended (foreground
        // bug or rapid nav), close it best-effort before opening a
        // new one.
        if (activeArticleId != null && !endedForCurrentSession) {
            flushReadEventBestEffort()
        }

        activeArticleId = articleId
        startedAt = System.currentTimeMillis()
        maxScrollPercent = 0.0
        endedForCurrentSession = false

        CoroutineScope(Dispatchers.IO).launch {
            try {
                api.trackBehavior(
                    ApiBehaviorEventRequest(
                        articleId = articleId,
                        eventType = "view",
                        platform = "android"
                    )
                )
            } catch (e: Exception) {
                // Silent — tracking is best-effort.
            }
            loyaltyQueue.enqueue(LoyaltyAction.READ_OPEN, articleId)
        }
    }

    /**
     * Pass the normalized scroll position (0...1) from the article
     * scroll callback. We only post the high-water mark, not every
     * delta.
     */
    @Synchronized
    fun updateScroll(percent: Double) {
        if (activeArticleId == null) return
        val clamped = percent.coerceIn(0.0, 1.0)
        if (clamped > maxScrollPercent) {
            maxScrollPercent = clamped
        }
    }

    /**
     * Closes the current session. Safe to call multiple times.
     */
    @Synchronized
    fun endSession() {
        if (liteModeManager.isLiteActive.value) return
        if (endedForCurrentSession || activeArticleId == null) return
        endedForCurrentSession = true

        val articleId = activeArticleId ?: return
        val dwell = elapsedSeconds()
        val scrollPct = (maxScrollPercent * 100).roundToInt()
        val completion = estimateCompletion(maxScrollPercent, dwell)

        CoroutineScope(Dispatchers.IO).launch {
            try {
                api.trackBehavior(
                    ApiBehaviorEventRequest(
                        articleId = articleId,
                        eventType = "read",
                        dwellSeconds = dwell,
                        scrollDepth = scrollPct,
                        completionRate = completion,
                        platform = "android"
                    )
                )
            } catch (e: Exception) {
                // Best effort.
            }

            // Loyalty: deep read deep reward
            if (dwell >= 60) {
                loyaltyQueue.enqueue(LoyaltyAction.READ_DEEP, articleId, duration = dwell)
            }
        }

        activeArticleId = null
        startedAt = null
        maxScrollPercent = 0.0
    }

    private fun elapsedSeconds(): Int {
        val start = startedAt ?: return 0
        val deltaMs = System.currentTimeMillis() - start
        val deltaSecs = (deltaMs / 1000.0).roundToInt()
        // Cap at 1 hour so a screen left open overnight doesn't poison averages.
        return deltaSecs.coerceIn(0, 3600)
    }

    /**
     * Heuristic for "did the user actually read this." Combine max of
     * (scroll, dwell-saturating-at-3min).
     */
    private fun estimateCompletion(scrollPercent: Double, dwellSeconds: Int): Int {
        val dwellComponent = (dwellSeconds.toDouble() / 180.0).coerceIn(0.0, 1.0)
        val combined = maxOf(scrollPercent, dwellComponent)
        return (combined * 100).roundToInt()
    }

    private fun flushReadEventBestEffort() {
        val articleId = activeArticleId ?: return
        val dwell = elapsedSeconds()
        val scrollPct = (maxScrollPercent * 100).roundToInt()
        val completion = estimateCompletion(maxScrollPercent, dwell)

        CoroutineScope(Dispatchers.IO).launch {
            try {
                api.trackBehavior(
                    ApiBehaviorEventRequest(
                        articleId = articleId,
                        eventType = "read",
                        dwellSeconds = dwell,
                        scrollDepth = scrollPct,
                        completionRate = completion,
                        platform = "android"
                    )
                )
            } catch (e: Exception) {
                // Best effort
            }
        }
    }
}
