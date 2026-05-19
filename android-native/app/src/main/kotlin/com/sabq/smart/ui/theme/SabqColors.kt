package com.sabq.smart.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Sabq color tokens — ported 1:1 from iOS [SabqTheme] in
 * `sabq app ios/sabq/Components/SabqComponents.swift` (lines 723-825).
 *
 * Each Light/Dark pair matches the iOS dynamic UIColor declarations to
 * within rounding precision. Do not "improve" these values without
 * cross-checking with the iOS build — the user has explicitly asked for
 * visual parity, which means the exact same pixels.
 */
@Immutable
data class SabqColors(
    val background: Color,
    val surface: Color,
    val ink: Color,
    val secondaryInk: Color,
    val tertiaryInk: Color,
    val outline: Color,
    val shadow: Color,
    val deepShadow: Color,
    val paleFill: Color,
    val softFill: Color,
    val warmGlow: Color,

    // Fixed category tints (not theme-reactive).
    val teal: Color,
    val sky: Color,
    val gold: Color,
    val coral: Color,
    val leaf: Color,

    // Resolved accent for the user's appAccent preference.
    val primaryStart: Color,
    val primaryEnd: Color,

    val isDark: Boolean,
)

/** Brand gradient drawn from accent start → end, top-leading → bottom-trailing. */
fun SabqColors.brandGradient(): Brush = Brush.linearGradient(
    colors = listOf(primaryStart, primaryEnd),
)

object SabqColorPalette {
    /**
     * iOS uses fractional UIColor components. We map the same components
     * into Color() with the 0-1 range so rounding stays identical.
     */
    fun light(accent: SabqAccent = SabqAccent.Blue): SabqColors = SabqColors(
        background  = Color(0.95f, 0.97f, 0.99f, 1f),
        surface     = Color.White,
        ink         = Color(0.10f, 0.10f, 0.14f, 1f),
        secondaryInk = Color(0.38f, 0.40f, 0.46f, 1f),
        tertiaryInk = Color(0.56f, 0.58f, 0.64f, 1f),
        outline     = Color(0.88f, 0.90f, 0.93f, 1f),
        shadow      = Color(0f, 0f, 0f, 0.05f),
        deepShadow  = Color(0f, 0f, 0f, 0.08f),
        paleFill    = Color(0.94f, 0.97f, 0.99f, 1f),
        softFill    = Color(0.92f, 0.95f, 0.98f, 1f),
        warmGlow    = Color(0.95f, 0.97f, 0.99f, 1f),
        teal        = Color(0.16f, 0.65f, 0.55f, 1f),
        sky         = Color(0.22f, 0.52f, 0.95f, 1f),
        gold        = Color(0.92f, 0.68f, 0.20f, 1f),
        coral       = Color(0.90f, 0.35f, 0.32f, 1f),
        leaf        = Color(0.40f, 0.73f, 0.22f, 1f),
        primaryStart = accent.light,
        primaryEnd   = accent.light,
        isDark      = false,
    )

    fun dark(accent: SabqAccent = SabqAccent.Blue): SabqColors = SabqColors(
        background  = Color(0.07f, 0.07f, 0.09f, 1f),
        surface     = Color(0.12f, 0.12f, 0.14f, 1f),
        ink         = Color(0.95f, 0.95f, 0.97f, 1f),
        secondaryInk = Color(0.68f, 0.68f, 0.72f, 1f),
        tertiaryInk = Color(0.50f, 0.50f, 0.55f, 1f),
        outline     = Color(0.20f, 0.20f, 0.23f, 1f),
        shadow      = Color(0f, 0f, 0f, 0.30f),
        deepShadow  = Color(0f, 0f, 0f, 0.40f),
        paleFill    = Color(0.14f, 0.14f, 0.16f, 1f),
        softFill    = Color(0.16f, 0.16f, 0.18f, 1f),
        warmGlow    = Color(0.12f, 0.12f, 0.14f, 1f),
        teal        = Color(0.16f, 0.65f, 0.55f, 1f),
        sky         = Color(0.22f, 0.52f, 0.95f, 1f),
        gold        = Color(0.92f, 0.68f, 0.20f, 1f),
        coral       = Color(0.90f, 0.35f, 0.32f, 1f),
        leaf        = Color(0.40f, 0.73f, 0.22f, 1f),
        primaryStart = accent.dark,
        primaryEnd   = accent.dark,
        isDark      = true,
    )
}

/**
 * User-selectable accent. Persisted under DataStore key "appAccent",
 * mirroring iOS @AppStorage("appAccent"). Values ported from
 * [AppAccent] in the iOS Models/.
 */
enum class SabqAccent(val key: String, val light: Color, val dark: Color) {
    Blue(   "blue",   Color(0.36f, 0.74f, 0.91f, 1f), Color(0.45f, 0.80f, 0.96f, 1f)),
    Teal(   "teal",   Color(0.16f, 0.65f, 0.55f, 1f), Color(0.25f, 0.78f, 0.65f, 1f)),
    Purple( "purple", Color(0.55f, 0.35f, 0.85f, 1f), Color(0.68f, 0.50f, 0.95f, 1f)),
    Rose(   "rose",   Color(0.88f, 0.34f, 0.46f, 1f), Color(0.95f, 0.48f, 0.58f, 1f)),
    Orange( "orange", Color(0.95f, 0.55f, 0.20f, 1f), Color(1.00f, 0.65f, 0.30f, 1f)),
    ;

    companion object {
        fun fromKey(key: String?): SabqAccent =
            entries.firstOrNull { it.key == key } ?: Blue
    }
}
