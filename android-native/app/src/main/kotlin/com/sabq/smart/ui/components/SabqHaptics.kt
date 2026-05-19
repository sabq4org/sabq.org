package com.sabq.smart.ui.components

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalView

/**
 * Haptic feedback shortcuts mirroring [SabqHaptics] on iOS. Android's
 * vocabulary is narrower than iOS's UIImpactFeedback* family — we map
 * "light" / "medium" / "soft" / "selection" / "success" / "error" to
 * the closest available HapticFeedbackConstants:
 *
 *   light, soft       → CLOCK_TICK   (subtlest available)
 *   medium            → CONTEXT_CLICK
 *   selection         → TEXT_HANDLE_MOVE
 *   success           → CONFIRM (API 30+) else LONG_PRESS
 *   error             → REJECT  (API 30+) else LONG_PRESS
 *
 * Use via `LocalHaptics.current.light()`.
 */
class SabqHaptics(private val view: View) {
    fun light() = view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    fun medium() = view.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
    fun soft() = view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    fun selection() = view.performHapticFeedback(HapticFeedbackConstants.TEXT_HANDLE_MOVE)
    fun success() = view.performHapticFeedback(
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
            HapticFeedbackConstants.CONFIRM
        else HapticFeedbackConstants.LONG_PRESS,
    )
    fun error() = view.performHapticFeedback(
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
            HapticFeedbackConstants.REJECT
        else HapticFeedbackConstants.LONG_PRESS,
    )
}

@Composable
fun rememberSabqHaptics(): SabqHaptics {
    val view = LocalView.current
    return remember(view) { SabqHaptics(view) }
}
