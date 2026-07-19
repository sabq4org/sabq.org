package com.sabq.smart.feature.gulfcup

import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable

object GcColors {
    val emerald = Color(0.05f, 0.45f, 0.32f)
    val emeraldSoft = Color(0.16f, 0.74f, 0.48f)
    val gold = Color(0.85f, 0.68f, 0.22f)
    val goldDeep = Color(0.72f, 0.55f, 0.12f)
    val crimson = Color(0.93f, 0.26f, 0.30f)
    val background = Color(0.02f, 0.06f, 0.05f)
    val card = Color(0.06f, 0.12f, 0.10f)
    val cardHi = Color(0.08f, 0.16f, 0.13f)
    val onDark = Color(0.95f, 0.97f, 0.96f)
    val onDarkDim = Color(0.65f, 0.72f, 0.68f)
    val outline = Color(0.18f, 0.28f, 0.24f)
}

/** Adaptive Majlis palette ported from iOS `GcTheme` values. */
@Immutable
data class GcMajlisPalette(
    val appBg: Color,
    val appBgMid: Color,
    val card: Color,
    val chip: Color,
    val line: Color,
    val ink: Color,
    val inkDim: Color,
    val inkFaint: Color,
    val emerald: Color,
    val emeraldDeep: Color,
    val sky: Color = Color(0xFF38BDF8),
    val skyLite: Color = Color(0xFF7DD3FC),
    val skyDeep: Color = Color(0xFF024F6C),
    val crimson: Color,
    val heroTop: Color = Color(0xFF041C22),
    val heroMid: Color = Color(0xFF05252A),
    val heroDeep: Color = Color(0xFF083338),
)

@Composable
fun rememberGcMajlisPalette(dark: Boolean = isSystemInDarkTheme()): GcMajlisPalette = if (dark) {
    GcMajlisPalette(
        appBg = Color(0xFF090E0F),
        appBgMid = Color(0xFF0B1214),
        card = Color(0xFF131B1D),
        chip = Color(0xFF1C2629),
        line = Color.White.copy(alpha = 0.10f),
        ink = Color(0xFFEDF4F5),
        inkDim = Color(0xFF9EB3B8),
        inkFaint = Color(0xFF6E8085),
        emerald = Color(0xFF38B8A8),
        emeraldDeep = Color(0xFF47C2B3),
        crimson = Color(0xFFF77070),
    )
} else {
    GcMajlisPalette(
        appBg = Color(0xFFEEF1F2),
        appBgMid = Color(0xFFEAF0F0),
        card = Color.White,
        chip = Color(0xFFE3E8EB),
        line = Color(0xFFD1D9DB),
        ink = Color(0xFF0E1C20),
        inkDim = Color(0xFF57696E),
        inkFaint = Color(0xFF7F8F94),
        emerald = Color(0xFF0E746B),
        emeraldDeep = Color(0xFF095752),
        crimson = Color(0xFFC93038),
    )
}
