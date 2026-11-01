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

    // عائلة «الرأي والزوايا» بهوية سبق (دليل الهوية V2) — نظيرتها في iOS
    // sectionCard/sectionSeparator/brandSky/brandBlue بنفس المكوّنات.
    val sectionCard: Color,
    /** سطح البلوكات الجانبية بدرجة الويب: #F4F8FB فاتح / #172330 داكن (نقل #1610). */
    val publicSurface: Color,
    val sectionSeparator: Color,
    /** سماوي سبق #4CBCFD — ثابت في الوضعين، لون العلامة نفسه. */
    val brandSky: Color,
    /** أزرق سبق العميق #0E76B8 للنصوص التفاعلية؛ سماوي في الداكن. */
    val brandBlue: Color,

    // هوية «مكتب سبق» (iOS SabqDesignSystem.swift، #2039–#2041): فواصل الصفوف،
    // تعبئة الشرائح، والسطح السماوي الهادئ، وأحمر العاجل وأخضر «جديد».
    val separator: Color,
    val chipFill: Color,
    val skyTint: Color,
    val skyOutline: Color,
    val breaking: Color,
    val success: Color,

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
        // هوية «مكتب سبق» — القيم الفاتحة من SabqTheme في
        // `sabq app ios/sabq/Components/SabqDesignSystem.swift` (#2039–#2041).
        background  = Color(0xFFF4F7FB),
        surface     = Color.White,
        ink         = Color(0xFF1B2B3A),
        secondaryInk = Color(0xFF55667A),
        tertiaryInk = Color(0xFF617183),
        outline     = Color(0xFFCFDCE8),
        shadow      = Color(0x0F1B2B3A),                 // #1B2B3A بشفافية 6%
        deepShadow  = Color(0x0D000000),                 // أسود 5%
        paleFill    = Color(0xFFEFF6FC),                 // surfaceMuted
        softFill    = Color(0xFFDFECF7),                 // surfaceStrong
        warmGlow    = Color(0xFFEFF6FC),
        teal        = Color(0xFF08785F),
        sky         = Color(0xFF096EBD),
        gold        = Color(0xFF946000),
        coral       = Color(0xFFBF3038),
        leaf        = Color(0xFF13734E),
        dawnTint    = Color(0.96f, 0.72f, 0.18f, 1f),
        noonTint    = Color(0.93f, 0.58f, 0.22f, 1f),
        duskTint    = Color(0.95f, 0.45f, 0.20f, 1f),
        nightTint   = Color(0.46f, 0.52f, 0.95f, 1f),
        trendingAccent = Color(1.00f, 0.58f, 0.00f, 1f),
        mediaScrim  = Color(0.04f, 0.04f, 0.06f, 0.55f),
        journeyGradientStart = Color(0.55f, 0.36f, 0.92f, 1f),
        sectionCard      = Color(0xFFF3F8FD),             // skyTint
        publicSurface    = Color(0xFFEFF6FC),
        sectionSeparator = Color(0xFFE2E9F0),
        brandSky         = Color(0xFF4CBCFD),
        brandBlue        = Color(0xFF096EBD),
        separator        = Color(0xFFE2E9F0),
        chipFill         = Color(0xFFEBF0F6),
        skyTint          = Color(0xFFF3F8FD),
        skyOutline       = Color(0xFFDCEAF7),
        breaking         = Color(0xFFC8102E),
        success          = Color(0xFF13734E),
        primaryStart = accent.light,
        primaryEnd   = accent.light,
        isDark      = false,
    )

    fun dark(accent: SabqAccent = SabqAccent.Blue): SabqColors = SabqColors(
        // القيم الداكنة من SabqTheme في iOS (SabqDesignSystem.swift).
        background  = Color(0xFF0B121A),
        surface     = Color(0xFF141D27),
        ink         = Color(0xFFF0F4F8),
        secondaryInk = Color(0xFFA6B5C4),
        tertiaryInk = Color(0xFF8E9EAE),
        outline     = Color(0xFF334354),
        shadow      = Color(0x0F1B2B3A),
        deepShadow  = Color(0x0D000000),
        paleFill    = Color(0xFF152230),
        softFill    = Color(0xFF1F3145),
        warmGlow    = Color(0xFF152230),
        teal        = Color(0xFF70DCC0),
        sky         = Color(0xFF5CC4FF),
        gold        = Color(0xFFF2C76D),
        coral       = Color(0xFFFF9297),
        leaf        = Color(0xFF73D9A9),
        dawnTint    = Color(0.96f, 0.72f, 0.18f, 1f),
        noonTint    = Color(0.93f, 0.58f, 0.22f, 1f),
        duskTint    = Color(0.95f, 0.45f, 0.20f, 1f),
        nightTint   = Color(0.46f, 0.52f, 0.95f, 1f),
        trendingAccent = Color(1.00f, 0.62f, 0.04f, 1f),
        mediaScrim  = Color(0.00f, 0.00f, 0.02f, 0.65f),
        journeyGradientStart = Color(0.55f, 0.36f, 0.92f, 1f),
        sectionCard      = Color(0xFF13202E),
        publicSurface    = Color(0xFF152230),
        sectionSeparator = Color(0xFF24313F),
        brandSky         = Color(0xFF4CBCFD),
        brandBlue        = Color(0xFF5CC4FF),
        separator        = Color(0xFF24313F),
        chipFill         = Color(0xFF1F2A36),
        skyTint          = Color(0xFF13202E),
        skyOutline       = Color(0xFF22364A),
        breaking         = Color(0xFFFF6B6B),
        success          = Color(0xFF73D9A9),
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
    Blue(   "blue",   "أزرق",    Color(0xFF096EBD), Color(0xFF5CC4FF)),
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
