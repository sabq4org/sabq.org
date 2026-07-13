package com.sabq.smart.data

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.FlightTakeoff
import androidx.compose.material.icons.filled.LocationCity
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Signpost
import androidx.compose.material.icons.filled.SportsBasketball
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import java.util.Locale

/**
 * Ports iOS [ArticleCategory] (Models/SabqModels.swift:172-283).
 * Twelve fixed categories — the Kotlin [title] values are the iOS
 * enum raw values ("محليات", "أعمال", "العالم"…) because the backend
 * ships those exact Arabic names in `category.nameAr` and iOS matches
 * them verbatim in `init(fromSection:)`. Server string ↔ enum mapping
 * happens in [fromSection] (Arabic name first, then slug, then Local).
 */
enum class ArticleCategory(
    val key: String,
    val title: String,
    val subtitle: String,
    val icon: ImageVector,
) {
    // Keys are the iOS `slug` values (SabqModels.swift:224-239);
    // titles are the iOS rawValues (line 172-184). Order mirrors iOS.
    Local(      "saudi",      "محليات", "أخبار المملكة والمدن الرئيسية",  Icons.Filled.LocationCity),
    Regions(    "regions",    "مناطق",  "تغطيات من مختلف مناطق المملكة",  Icons.Filled.Map),
    Culture(    "culture",    "ثقافة",  "فنون وتراث وأدب ومشهد ثقافي",    Icons.Filled.MusicNote),
    Community(  "community",  "مجتمع",  "مجتمع وتعليم وقضايا يومية",      Icons.Filled.People),
    Sports(     "sports",     "رياضة",  "رياضة محلية وعالمية",            Icons.Filled.SportsBasketball),
    Tourism(    "tourism",    "سياحة",  "وجهات وفعاليات وسفر",            Icons.Filled.FlightTakeoff),
    Technology( "technology", "تقنية",  "تقنية وابتكار ورقمنة",           Icons.Filled.Computer),
    Business(   "business",   "أعمال",  "اقتصاد وأسواق وأعمال",           Icons.Filled.TrendingUp),
    Life(       "life",       "حياتنا", "نمط حياة وصحة وعائلة",           Icons.Outlined.Flag),
    Cars(       "cars",       "سيارات", "سيارات وطرق ومواصلات",           Icons.Filled.DirectionsCar),
    Stations(   "stations",   "محطات",  "محطات وقصص وملفات",              Icons.Filled.Signpost),
    World(      "world",      "العالم", "أخبار عربية ودولية",             Icons.Filled.Public),
    ;

    /**
     * Category tints — exact hex literals from iOS
     * [ArticleCategory.tint] in `Models/SabqModels.swift:241-256`.
     *
     * We deliberately do NOT route through [SabqTheme] tokens because
     * iOS encodes these as fixed hex values; theme tokens (primaryEnd,
     * leaf, gold, teal, coral, sky) carry different hues and previously
     * caused visible drift (e.g. World rendered blue instead of red,
     * Technology turquoise instead of indigo). Keep these 1:1 with iOS.
     */
    fun tint(): Color = when (this) {
        Local -> Color(0xFF3498DB)      // iOS hex 3498db
        Regions -> Color(0xFF84CC16)    // iOS hex 84cc16
        Culture -> Color(0xFFD946EF)    // iOS hex d946ef
        Community -> Color(0xFFF97316)  // iOS hex f97316
        Sports -> Color(0xFF2ECC71)     // iOS hex 2ecc71
        Tourism -> Color(0xFF14B8A6)    // iOS hex 14b8a6
        Technology -> Color(0xFF6366F1) // iOS hex 6366f1
        Business -> Color(0xFFCA8A04)   // iOS hex ca8a04
        Life -> Color(0xFFF472B6)       // iOS hex F472B6
        Cars -> Color(0xFF0EA5E9)       // iOS hex 0EA5E9
        Stations -> Color(0xFFFBBF24)   // iOS hex FBBF24
        World -> Color(0xFFE74C3C)      // iOS hex e74c3c
    }

    companion object {
        fun fromKey(key: String?): ArticleCategory =
            entries.firstOrNull { it.key == key } ?: Local

        /** Backend `slug` to category enum. Identical to [fromKey] but
         *  the call-site name is clearer for non-enum-typed slug strings. */
        fun fromSlug(slug: String?): ArticleCategory = fromKey(slug)

        /**
         * Port of iOS `ArticleCategory.init(fromSection:)`
         * (SabqModels.swift:258-270): exact Arabic-title match first
         * (the backend's `category.nameAr` — "محليات", "أعمال",
         * "العالم"…), then lowercase-slug match, then [Local]. The
         * old Android-only fuzzy stem matcher (drop "ات"/"ون"/"ين")
         * is gone — iOS never did that and it produced different
         * chips than iOS for the same payload.
         */
        fun fromSection(raw: String?): ArticleCategory {
            val trimmed = raw?.trim().orEmpty()
            if (trimmed.isEmpty()) return Local
            entries.firstOrNull { it.title == trimmed }?.let { return it }
            val lower = trimmed.lowercase(Locale.ROOT)
            return entries.firstOrNull { it.key == lower } ?: Local
        }

        /** Legacy alias — call sites migrated to [fromSection]. */
        fun fromArabicSection(arabic: String?): ArticleCategory = fromSection(arabic)
    }
}
