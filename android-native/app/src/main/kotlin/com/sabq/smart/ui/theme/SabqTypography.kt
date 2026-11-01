package com.sabq.smart.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import com.sabq.smart.R

/**
 * Typography pipeline mirrors iOS:
 *   - IBM Plex Sans Arabic for ALL Arabic text (editorial + chrome)
 *   - Bundled locally in res/font — same three weights iOS ships
 *
 * iOS bundles IBM Plex Sans Arabic .woff2 files and registers them at
 * launch via CoreText. Android bundles the TTFs in res/font so the
 * family is available from the very first frame on EVERY device.
 *
 * Why local bundling (replaced Downloadable/GoogleFonts on 2026-07-13):
 *   1. Devices/emulators without Google Play Services never resolved
 *      the provider — the whole app rendered a system-font fallback,
 *      which was the owner's main complaint.
 *   2. Even on certified devices the first launch flashed the fallback
 *      while the font downloaded. Bundling kills both failure modes for
 *      ~700KB of APK, matching the iOS decision exactly.
 *
 * The app text uses it through [SabqTextFamily].
 *
 * iOS counterpart: `Services/FontRegistration.swift::SabqFonts`.
 */
val IbmPlexSansArabic: FontFamily = FontFamily(
    Font(R.font.ibm_plex_sans_arabic_regular, weight = FontWeight.Normal, style = FontStyle.Normal),
    Font(R.font.ibm_plex_sans_arabic_semibold, weight = FontWeight.SemiBold, style = FontStyle.Normal),
    Font(R.font.ibm_plex_sans_arabic_bold, weight = FontWeight.Bold, style = FontStyle.Normal),
)

/**
 * خط النصوص في التطبيق: IBM Plex Sans Arabic (اعتماد المالك 2026-11-01)،
 * مع أدوار الأحجام والأوزان من iOS. الملفات المضمّنة ثلاثة أوزان فقط،
 * فيُرسم «المتوسط» بأقرب وزن متاح.
 */
val SabqTextFamily: FontFamily = IbmPlexSansArabic

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
         * Build typography keyed off the user's articleFontSize preference.
         *
         * [deviceScale] is the width-adaptive factor computed in [SabqTheme]
         * (screenWidthDp / 393f, clamped) — iOS sizes are points on a
         * ~393pt-wide iPhone, so a 360dp phone renders ~8% smaller and a
         * wide device slightly larger, keeping proportions identical to
         * iPhone. It multiplies font sizes AND line heights only; paddings
         * and radii in [SabqDimens] stay unscaled (layout-relative).
         */
        fun build(articleFontSize: Float = 17f, deviceScale: Float = 1f): SabqTypography {
            val lineHeight = LineHeightStyle(
                alignment = LineHeightStyle.Alignment.Center,
                trim = LineHeightStyle.Trim.None,
            )
            // Strict iOS parity: zero letter-spacing everywhere (iOS uses
            // no kerning/tracking anywhere in SabqComponents.swift). Sizes
            // and nominal weights below are the iOS call-site values; the
            // weights follow the iOS SabqType roles.
            fun base(
                nominal: FontWeight,
                size: Float,
                lh: Float = size * 1.35f,
            ) = TextStyle(
                fontFamily = SabqTextFamily,
                fontWeight = nominal,
                fontSize = (size * deviceScale).sp,
                lineHeight = (lh * deviceScale).sp,
                lineHeightStyle = lineHeight,
                letterSpacing = 0.sp,
                textAlign = TextAlign.Start,
            )
            return SabqTypography(
                screenTitle        = base(FontWeight.Bold, 26f),
                // iOS SabqType.sectionHeading 20 bold.
                sectionHeader      = base(FontWeight.Bold, 20f, lh = 26f),
                cardTitle          = base(FontWeight.Bold, 19f),
                // iOS articleTitle 23 bold = حجم القراءة الافتراضي (17) + 6.
                articleDetailTitle = base(FontWeight.Bold, articleFontSize + 6f, lh = (articleFontSize + 6f) * 1.3f + 3f),
                // iOS leadTitle 21 bold — عنوان شريحة البارزة.
                featuredCardTitle  = base(FontWeight.Bold, 21f, lh = 29f),
                // iOS rowTitle 16 medium، تباعد سطري 2.
                compactCardTitle   = base(FontWeight.Medium, 16f, lh = 23f),
                excerpt            = base(FontWeight.Normal, 15f, lh = 21f),
                // iOS articleBody 18 regular بتباعد 5 فوق الارتفاع الطبيعي؛
                // القارئ يغيّر الحجم بالقدر نفسه (الافتراضي 17 + 1 = 18).
                body               = base(FontWeight.Normal, articleFontSize + 1f, lh = (articleFontSize + 1f) * 1.45f + 5f),
                chipLabel          = base(FontWeight.SemiBold, 14f),
                // iOS tag 12 semibold — شارة القسم و«جديد».
                statusChip         = base(FontWeight.SemiBold, 12f, lh = 16f),
                meta               = base(FontWeight.Normal, 13f),
                // iOS timestamp 11 regular — توقيت النشر في كل التطبيق.
                metaSmall          = base(FontWeight.Normal, 11f),
                breakingPill       = base(FontWeight.Bold, 10f),
                ctaButton          = base(FontWeight.SemiBold, 16f),
                tabLabel           = base(FontWeight.SemiBold, 12f),
                statValue          = base(FontWeight.SemiBold, 22f),
                tileTitle          = base(FontWeight.SemiBold, 16f),
                greetingHeadline   = base(FontWeight.Bold, 15f),
                mostViewedCardTitle = base(FontWeight.Medium, 15f, lh = 21f),
                microMeta          = base(FontWeight.Normal, 10f),
                smallActionButton  = base(FontWeight.SemiBold, 12f),
                searchBarText      = base(FontWeight.Normal, 16f),
            )
        }
    }
}
