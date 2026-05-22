package com.sabq.smart.nav

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * App-scope event bus that fires when the user taps a bottom-tab they
 * are already on. Mirrors iOS [SabqTabBar.onSelect] firing even when
 * the selected tab doesn't change — used here to give the Home tab
 * "tap-to-scroll-to-top + refresh" behaviour that the user expects
 * from native social/news apps.
 *
 * Why a singleton object: the emitter (SabqApp's tab bar callback)
 * lives in the NavHost scope while the consumer (HomeFeedScreen) is
 * inside a NavGraph composable two layers deeper. Threading a
 * callback through every screen would bloat the API; a tiny shared
 * flow keeps the wiring O(1).
 *
 * Emit `Unit` is intentional — the only signal we care about is the
 * re-tap event. Consumers map it to whatever action they need
 * (scroll to top, reload feed, etc.).
 */
object TabReselectBus {
    // Replay = 0 — late subscribers should NOT receive past events;
    // re-tap is a transient interaction.
    private val _home = MutableSharedFlow<Unit>(replay = 0, extraBufferCapacity = 1)
    val home: SharedFlow<Unit> = _home.asSharedFlow()

    fun emitHome() {
        // tryEmit: never block the UI thread on subscriber count.
        _home.tryEmit(Unit)
    }
}
