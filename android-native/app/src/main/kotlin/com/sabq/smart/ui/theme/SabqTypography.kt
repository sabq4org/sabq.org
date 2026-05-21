package com.sabq.smart.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.Font
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import com.sabq.smart.R

/**
 * Typography pipeline mirrors iOS:
 *   - IBM Plex Sans Arabic for ALL Arabic text (editorial + chrome)
 *   - System default fallback while the font downloads on first launch
 *
 * iOS bundles IBM Plex Sans Arabic .woff2 files and registers them at
 * launch via CoreText. Android uses Compose Downloadable Fonts to fetch
 * the same family from Google's font provider — no APK bloat, fonts
 * are cached across apps that depend on Plex.
 *
 * Why Downloadable Fonts:
 *   1. ~900KB APK savings vs. bundling Regular/SemiBold/Bold TTFs.
 *   2. The Saudi market is 100% Google-Play-Services certified, so
 *      Provider availability is not a concern.
 *   3. First-launch shows the bold fallback briefly while downloading;
 *      subsequent launches read from the shared system cache instantly.
 *
 * iOS counterpart: `Services/FontRegistration.swift::SabqFonts`.
 */
private val GoogleFontsProvider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage = "com.google.android.gms",
    certificates = R.array.com_google_android_gms_fonts_certs,
)

private val IbmPlexSansArabicGoogle = GoogleFont("IBM Plex Sans Arabic")

val IbmPlexSansArabic: FontFamily = FontFamily(
    Font(googleFont = IbmPlexSansArabicGoogle, fontProvider = GoogleFontsProvider, weight = FontWeight.Normal, style = FontStyle.Normal),
    Font(googleFont = IbmPlexSansArabicGoogle, fontProvider = GoogleFontsProvider, weight = FontWeight.Medium, style = FontStyle.Normal),
    Font(googleFont = IbmPlexSansArabicGoogle, fontProvider = GoogleFontsProvider, weight = FontWeight.SemiBold, style = FontStyle.Normal),
    Font(googleFont = IbmPlexSansArabicGoogle, fontProvider = GoogleFontsProvider, weight = FontWeight.Bold, style = FontStyle.Normal),
)

/**
 * Sabq text styles. Sizes match the iOS table:
 *   screenTitle = 30 / bold
 *   sectionHeader = 19 / bold
 *   featuredCardTitle = 20 / bold (carousel)
 *   compactCardTitle = 16 / bold (row)
 *   articleDetailTitle = fontSize + 6 / bold
 *   chipLabel = 14 / semibold
 *   statusChip = 12 / semibold
 *   meta = 12-13 / medium
 *   body = articleFontSize (17 default) / regular, line spacing +8
 */
@Immutable
data class SabqTypography(
    val screenTitle: TextStyle,
    val sectionHeader: TextStyle,
    val cardTitle: TextStyle,
    val articleDetailTitle: TextStyle,
    val featuredCardTitle: TextStyle,
    val compactCardTitle: TextStyle,
    val excerpt: TextStyle,
    val body: TextStyle,
    val chipLabel: TextStyle,
    val statusChip: TextStyle,
    val meta: TextStyle,
    val metaSmall: TextStyle,
    val breakingPill: TextStyle,
    val ctaButton: TextStyle,
    val tabLabel: TextStyle,
) {
    companion object {
        /** Build typography keyed off the user's articleFontSize preference. */
        fun build(articleFontSize: Float = 17f): SabqTypography {
            val lineHeight = LineHeightStyle(
                alignment = LineHeightStyle.Alignment.Center,
                trim = LineHeightStyle.Trim.None,
            )
            // Letter-spacing tracking: heavy Arabic glyphs ride too close
            // together at default `0.sp` and lose the premium-editorial
            // feel iOS gets for free from SF Pro's optical kerning. Slight
            // positive tracking on titles + headings restores the breath.
            // Body/meta stay at 0 so reading rhythm is untouched.
            fun base(
                weight: FontWeight,
                size: Float,
                lh: Float = size * 1.35f,
                tracking: Float = 0f,
            ) = TextStyle(
                fontFamily = IbmPlexSansArabic,
                fontWeight = weight,
                fontSize = size.sp,
                lineHeight = lh.sp,
                lineHeightStyle = lineHeight,
                letterSpacing = tracking.sp,
                textAlign = TextAlign.Start,
            )
            return SabqTypography(
                screenTitle        = base(FontWeight.Bold, 30f, tracking = 0.3f),
                sectionHeader      = base(FontWeight.Bold, 19f, tracking = 0.3f),
                cardTitle          = base(FontWeight.Bold, 20f, tracking = 0.2f),
                articleDetailTitle = base(FontWeight.Bold, articleFontSize + 6f, tracking = 0.2f),
                featuredCardTitle  = base(FontWeight.Bold, 20f, lh = 28f, tracking = 0.2f),
                compactCardTitle   = base(FontWeight.Bold, 16f, lh = 22f, tracking = 0.2f),
                excerpt            = base(FontWeight.Normal, 15f, lh = 22f),
                body               = base(FontWeight.Normal, articleFontSize, lh = articleFontSize + 8f),
                chipLabel          = base(FontWeight.SemiBold, 14f),
                statusChip         = base(FontWeight.SemiBold, 12f),
                meta               = base(FontWeight.Medium, 13f),
                metaSmall          = base(FontWeight.Medium, 11f),
                breakingPill       = base(FontWeight.Bold, 11f, tracking = 0.3f),
                ctaButton          = base(FontWeight.Bold, 17f, tracking = 0.2f),
                tabLabel           = base(FontWeight.Bold, 12.5f, tracking = 0.2f),
            )
        }
    }
}
