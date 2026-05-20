package com.sabq.smart.data

import android.util.Log
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Thread-safe stub queue for loyalty events on Android.
 * To be fully implemented in Task D5.
 */
@Singleton
class LoyaltyEventQueue @Inject constructor() {

    fun enqueue(action: LoyaltyAction, articleId: String? = null, duration: Int? = null) {
        val source = articleId?.let { "article:$it" }
        enqueue(
            LoyaltyEventPayload(
                action = action.value,
                source = source,
                articleId = articleId,
                duration = duration
            )
        )
    }

    fun enqueue(event: LoyaltyEventPayload) {
        Log.d("LoyaltyEventQueue", "Enqueued event: $event")
    }

    companion object {
        // Expose a static shared singleton for ease of access matching iOS.
        val shared = LoyaltyEventQueue()
    }
}
