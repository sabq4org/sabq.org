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

    // Time-of-day tints for the greeting block (HomeFeedView.swift:887-1010
    // greetingTintFor). Same hues for light + dark so the warm-cold scale
    // reads identically on both schemes.
    val dawnTint: Color,
    val noonTint: Color,
    val duskTint: Color,
    val nightTint: Color,

    // Trending preview accent — saturated orange, distinct from `gold`.
    // iOS uses this hue for the flame icon + "الكل" link tint.
    val trendingAccent: Color,

    // Overlay scrim drawn over media (opinion card bottom gradient, etc.).
    // Slightly cooler + softer than pure-black 70%, which felt harsh under
    // the IBM Plex weight. iOS uses a similar near-black gradient.
    val mediaScrim: Color,

    // Purple anchor for the personal-journey gradient badge (the 40 dp
    // sparkles circle in PersonalJourneyBlock). iOS literal:
    // `Color(red: 0.55, green: 0.36, blue: 0.92)` at HomeFeedView.swift:1048
    // and SabqComponents.swift:1242. Theme-independent (same hue both
    // schemes) per iOS.
    val journeyGradientStart: Color,

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
        paleFill    = Color(0.91f, 0.93f, 0.96f, 1f),
        softFill    = Color(0.89f, 0.91f, 0.94f, 1f),
        warmGlow    = Color(0.92f, 0.94f, 0.96f, 1f),
        teal        = Color(0.16f, 0.65f, 0.55f, 1f),
        sky         = Color(0.22f, 0.52f, 0.95f, 1f),
        gold        = Color(0.92f, 0.68f, 0.20f, 1f),
        coral       = Color(0.90f, 0.35f, 0.32f, 1f),
        leaf        = Color(0.40f, 0.73f, 0.22f, 1f),
        dawnTint    = Color(0.96f, 0.72f, 0.18f, 1f),
        noonTint    = Color(0.93f, 0.58f, 0.22f, 1f),
        duskTint    = Color(0.95f, 0.45f, 0.20f, 1f),
        nightTint   = Color(0.46f, 0.52f, 0.95f, 1f),
        trendingAccent = Color(0.98f, 0.45f, 0.09f, 1f),
        mediaScrim  = Color(0.04f, 0.04f, 0.06f, 0.55f),
        journeyGradientStart = Color(0.55f, 0.36f, 0.92f, 1f),
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
        dawnTint    = Color(0.96f, 0.72f, 0.18f, 1f),
        noonTint    = Color(0.93f, 0.58f, 0.22f, 1f),
        duskTint    = Color(0.95f, 0.45f, 0.20f, 1f),
        nightTint   = Color(0.55f, 0.62f, 1.00f, 1f),
        trendingAccent = Color(1.00f, 0.55f, 0.20f, 1f),
        mediaScrim  = Color(0.00f, 0.00f, 0.02f, 0.65f),
        journeyGradientStart = Color(0.55f, 0.36f, 0.92f, 1f),
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
enum class SabqAccent(
    val key: String,
    val arabicName: String,
    val light: Color,
    val dark: Color,
) {
    Blue(   "blue",   "أزرق",    Color(0.36f, 0.74f, 0.91f, 1f), Color(0.45f, 0.80f, 0.96f, 1f)),
    Teal(   "teal",   "أخضر",    Color(0.16f, 0.65f, 0.55f, 1f), Color(0.25f, 0.78f, 0.65f, 1f)),
    Purple( "purple", "بنفسجي", Color(0.55f, 0.35f, 0.85f, 1f), Color(0.68f, 0.50f, 0.95f, 1f)),
    Rose(   "rose",   "وردي",   Color(0.88f, 0.34f, 0.46f, 1f), Color(0.95f, 0.48f, 0.58f, 1f)),
    Orange( "orange", "برتقالي", Color(0.95f, 0.55f, 0.20f, 1f), Color(1.00f, 0.65f, 0.30f, 1f)),
    ;

    companion object {
        fun fromKey(key: String?): SabqAccent =
            entries.firstOrNull { it.key == key } ?: Blue
    }
}
