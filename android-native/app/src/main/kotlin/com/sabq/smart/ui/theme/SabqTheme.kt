package com.sabq.smart.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Sabq's design system entrypoint — equivalent to the iOS [SabqTheme]
 * enum-as-singleton. Use [SabqTheme.colors] / .typography / .dimens /
 * .shapes from any composable. A thin MaterialTheme wraps everything so
 * Compose libraries (M3 chips, ripples, content-color cascades) still
 * function, but app-level surfaces should read from [SabqTheme]
 * directly, not MaterialTheme.
 */
object SabqTheme {
    val colors: SabqColors
        @Composable @ReadOnlyComposable get() = LocalSabqColors.current
    val typography: SabqTypography
        @Composable @ReadOnlyComposable get() = LocalSabqTypography.current
    val dimens: SabqDimens
        @Composable @ReadOnlyComposable get() = LocalSabqDimens.current
    val shapes: SabqShapes
        @Composable @ReadOnlyComposable get() = LocalSabqShapes.current
}

private val LocalSabqColors = staticCompositionLocalOf<SabqColors> {
    error("SabqColors not provided — wrap your composable in SabqTheme { … }")
}
private val LocalSabqTypography = staticCompositionLocalOf<SabqTypography> {
    error("SabqTypography not provided — wrap your composable in SabqTheme { … }")
}
private val LocalSabqDimens = staticCompositionLocalOf { SabqDimens() }
private val LocalSabqShapes = staticCompositionLocalOf { SabqShapes() }

/**
 * Top-level theme wrapper. Resolves Light/Dark from the OS unless a
 * manual override is in effect (Settings → الوضع المظلم). The accent
 * defaults to Blue; once the SettingsStore is ported it should read
 * from DataStore "appAccent".
 */
@Composable
fun SabqTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    accent: SabqAccent = SabqAccent.Blue,
    articleFontSize: Float = 17f,
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) SabqColorPalette.dark(accent) else SabqColorPalette.light(accent)
    val typography = SabqTypography.build(articleFontSize)

    // Material3 fallback scheme — kept narrow on purpose; almost
    // nothing should read MaterialTheme.colorScheme directly.
    val m3 = if (darkTheme) {
        darkColorScheme(
            background = colors.background,
            onBackground = colors.ink,
            surface = colors.surface,
            onSurface = colors.ink,
            primary = colors.primaryEnd,
            onPrimary = Color.White,
        )
    } else {
        lightColorScheme(
            background = colors.background,
            onBackground = colors.ink,
            surface = colors.surface,
            onSurface = colors.ink,
            primary = colors.primaryEnd,
            onPrimary = Color.White,
        )
    }

    CompositionLocalProvider(
        LocalSabqColors provides colors,
        LocalSabqTypography provides typography,
    ) {
        MaterialTheme(colorScheme = m3, content = content)
    }
}
