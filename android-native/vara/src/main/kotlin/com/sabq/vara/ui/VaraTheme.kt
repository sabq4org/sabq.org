package com.sabq.vara.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.sabq.vara.R
import com.sabq.vara.core.ThemeMode
import com.sabq.vara.core.accents

@Immutable
data class VaraColors(
    val accent: Color,
    val accentDeep: Color,
    val gold: Color,
    val live: Color,
    val screenTop: Color,
    val screenBottom: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val text: Color,
    val textDim: Color,
    val textFaint: Color,
    val outline: Color,
    val chip: Color,
    val dark: Boolean,
)

val LocalVaraColors = staticCompositionLocalOf {
    VaraColors(Color(0xFF0F766E), Color(0xFF0B5953), Color(0xFFD19E29), Color(0xFFC64840), Color(0xFFF4F4F8), Color(0xFFF1F2F6), Color.White, Color.White, Color(0xFF0E0F10), Color(0xFF747579), Color(0xFFACADB4), Color(0xFFE3E4E7), Color(0xFFF0F0F2), false)
}

val VaraFont = FontFamily(
    Font(R.font.ibm_plex_sans_arabic_regular, FontWeight.Normal),
    Font(R.font.ibm_plex_sans_arabic_semibold, FontWeight.SemiBold),
    Font(R.font.ibm_plex_sans_arabic_bold, FontWeight.Bold),
)

private val VaraTypography = Typography(
    displaySmall = TextStyle(fontFamily = VaraFont, fontWeight = FontWeight.Bold, fontSize = 28.sp),
    headlineSmall = TextStyle(fontFamily = VaraFont, fontWeight = FontWeight.Bold, fontSize = 22.sp),
    titleLarge = TextStyle(fontFamily = VaraFont, fontWeight = FontWeight.Bold, fontSize = 20.sp),
    titleMedium = TextStyle(fontFamily = VaraFont, fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
    bodyLarge = TextStyle(fontFamily = VaraFont, fontSize = 16.sp),
    bodyMedium = TextStyle(fontFamily = VaraFont, fontSize = 14.sp),
    bodySmall = TextStyle(fontFamily = VaraFont, fontSize = 12.sp),
    labelLarge = TextStyle(fontFamily = VaraFont, fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
)

@Composable
fun VaraTheme(mode: ThemeMode, accentId: String, content: @Composable () -> Unit) {
    val dark = when (mode) { ThemeMode.SYSTEM -> isSystemInDarkTheme(); ThemeMode.LIGHT -> false; ThemeMode.DARK -> true }
    val palette = accents.firstOrNull { it.id == accentId } ?: accents.first()
    val accent = Color(if (dark) palette.dark else palette.light)
    val c = if (dark) {
        VaraColors(accent, accent.copy(red = accent.red * .8f, green = accent.green * .8f, blue = accent.blue * .8f), Color(0xFFF5C95C), Color(0xFFFA6673), Color(0xFF1B2129), Color(0xFF171C24), Color(0xFF252C36), Color(0xFF2C3440), Color(0xFFEDF2F7), Color(0xFFA3ADBA), Color(0xFF75808C), Color(0xFF373F4C), Color(0xFF323B47), true)
    } else {
        VaraColors(accent, accent.copy(red = accent.red * .76f, green = accent.green * .76f, blue = accent.blue * .76f), Color(0xFFD19E29), Color(0xFFC64840), Color(0xFFF4F4F8), Color(0xFFF1F2F6), Color.White, Color.White, Color(0xFF0E0F10), Color(0xFF747579), Color(0xFFACADB4), Color(0xFFE3E4E7), Color(0xFFF0F0F2), false)
    }
    val scheme = if (dark) darkColorScheme(primary = c.accent, surface = c.surface, background = c.screenBottom, onSurface = c.text, error = c.live)
    else lightColorScheme(primary = c.accent, surface = c.surface, background = c.screenBottom, onSurface = c.text, error = c.live)
    androidx.compose.runtime.CompositionLocalProvider(LocalVaraColors provides c) {
        MaterialTheme(colorScheme = scheme, typography = VaraTypography, content = content)
    }
}
