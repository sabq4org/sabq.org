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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density

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
    // Width-adaptive scale: iOS sizes are points on a ~393pt-wide iPhone,
    // while Android widths span 360–480dp. Scaling type proportionally to
    // the width keeps every screen visually identical to iPhone; clamped
    // so extremes never distort. Dimens (paddings/radii) are NOT scaled —
    // they're layout-relative and fillMaxWidth absorbs width differences.
    val deviceScale = (LocalConfiguration.current.screenWidthDp / 393f).coerceIn(0.92f, 1.08f)
    val typography = SabqTypography.build(articleFontSize, deviceScale)

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

    // سقف تكبير الخط النظامي عند 1.3× حفاظًا على تطابق التخطيط مع iOS الذي يتجاهل Dynamic Type هنا.
    val density = LocalDensity.current
    val cappedDensity = Density(density.density, fontScale = density.fontScale.coerceAtMost(1.3f))

    CompositionLocalProvider(
        LocalSabqColors provides colors,
        LocalSabqTypography provides typography,
        LocalDensity provides cappedDensity,
    ) {
        MaterialTheme(colorScheme = m3, content = content)
    }
}
