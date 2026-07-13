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
    // Black (900) registers IBM Plex's heaviest weight so styles tagged
    // `FontWeight.Black` resolve correctly instead of falling back to Bold.
    // iOS uses `.heavy` (800) on the greeting headline (HomeFeedView.swift:980)
    // and a few other UI accents; this gives us the closest match.
    Font(googleFont = IbmPlexSansArabicGoogle, fontProvider = GoogleFontsProvider, weight = FontWeight.Black, style = FontStyle.Normal),
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
    // ── Phase 2: ported from inline iOS usages flagged in the
    //   strict-parity audit. Each one had been baked into a single call
    //   site as a literal fontSize/fontWeight pair; centralising means
    //   adjustments propagate everywhere automatically.
    /** 22 sp Bold — used in StatTile values (Bookmarks count, reading
     *  time) and TrendingView hero "الأكثر تداولاً".
     *  iOS: BookmarksView.swift:91, TrendingView.swift:71. */
    val statValue: TextStyle,
    /** 17 sp Bold — used in CategoryTile title in the Explore grid.
     *  iOS: SabqComponents.swift:1516. */
    val tileTitle: TextStyle,
    /** 15 sp Black (heavy) — greeting block headline ("صباح الخير").
     *  iOS: HomeFeedView.swift:980 (size:15, weight:.heavy, design:.rounded). */
    val greetingHeadline: TextStyle,
    /** 14.5 sp Bold — Opinion most-viewed carousel card title.
     *  iOS: OpinionsView.swift:124. */
    val mostViewedCardTitle: TextStyle,
    /** 10 sp Medium — micro-metadata captions like the journey-metric
     *  labels under each cell.
     *  iOS: HomeFeedView.swift:1159. */
    val microMeta: TextStyle,
    /** 13 sp SemiBold — used in the small action button (e.g. "عرض الكل")
     *  on screen headers.
     *  iOS: SabqComponents.swift:992. */
    val smallActionButton: TextStyle,
    /** 16 sp Medium — search-bar text-field input.
     *  iOS: SabqComponents.swift:1791. */
    val searchBarText: TextStyle,
) {
    companion object {
        /**
         * iOS weight-softening policy — an exact port of
         * `FontRegistration.swift::SabqFonts.app(size:weight:)`:
         * only Regular/SemiBold/Bold ship on iOS, so
         *   - any size ≤ 13pt renders Regular (captions),
         *   - Medium always renders Regular,
         *   - Bold at > 13pt softens to SemiBold,
         *   - Heavy/Black soften to Bold.
         * Android must apply the SAME mapping or every title renders one
         * weight heavier than iOS (strict-parity audit 2026-07-13).
         */
        private fun iosWeight(size: Float, nominal: FontWeight): FontWeight {
            if (size <= 13f) return FontWeight.Normal
            return when {
                nominal.weight >= FontWeight.ExtraBold.weight -> FontWeight.Bold
                nominal.weight >= FontWeight.SemiBold.weight -> FontWeight.SemiBold
                else -> FontWeight.Normal // Regular + Medium
            }
        }

        /** Build typography keyed off the user's articleFontSize preference. */
        fun build(articleFontSize: Float = 17f): SabqTypography {
            val lineHeight = LineHeightStyle(
                alignment = LineHeightStyle.Alignment.Center,
                trim = LineHeightStyle.Trim.None,
            )
            // Strict iOS parity: zero letter-spacing everywhere (iOS uses
            // no kerning/tracking anywhere in SabqComponents.swift). Sizes
            // and nominal weights below are the iOS call-site values; the
            // effective weight comes from [iosWeight].
            fun base(
                nominal: FontWeight,
                size: Float,
                lh: Float = size * 1.35f,
            ) = TextStyle(
                fontFamily = IbmPlexSansArabic,
                fontWeight = iosWeight(size, nominal),
                fontSize = size.sp,
                lineHeight = lh.sp,
                lineHeightStyle = lineHeight,
                letterSpacing = 0.sp,
                textAlign = TextAlign.Start,
            )
            return SabqTypography(
                screenTitle        = base(FontWeight.Bold, 30f),
                sectionHeader      = base(FontWeight.Bold, 19f),
                cardTitle          = base(FontWeight.Bold, 19f),
                articleDetailTitle = base(FontWeight.Bold, articleFontSize + 6f),
                featuredCardTitle  = base(FontWeight.Bold, 20f, lh = 28f),
                compactCardTitle   = base(FontWeight.Bold, 16f, lh = 22f),
                excerpt            = base(FontWeight.Normal, 15f, lh = 22f),
                // iOS body: lineSpacing(8) is ADDITIVE over the font's
                // natural line height (~1.35×size for Plex Arabic).
                body               = base(FontWeight.Normal, articleFontSize, lh = articleFontSize * 1.35f + 8f),
                chipLabel          = base(FontWeight.SemiBold, 14f),
                statusChip         = base(FontWeight.SemiBold, 11f),
                meta               = base(FontWeight.Medium, 13f),
                metaSmall          = base(FontWeight.Medium, 11f),
                breakingPill       = base(FontWeight.Bold, 10f),
                ctaButton          = base(FontWeight.Bold, 17f),
                tabLabel           = base(FontWeight.Bold, 12.5f),
                statValue          = base(FontWeight.SemiBold, 22f),
                tileTitle          = base(FontWeight.SemiBold, 17f),
                // iOS nominal .heavy → renders Bold under the softening policy.
                greetingHeadline   = base(FontWeight.Black, 15f),
                mostViewedCardTitle = base(FontWeight.SemiBold, 14.5f, lh = 20f),
                microMeta          = base(FontWeight.Medium, 10f),
                smallActionButton  = base(FontWeight.SemiBold, 13f),
                searchBarText      = base(FontWeight.Medium, 16f),
            )
        }
    }
}
