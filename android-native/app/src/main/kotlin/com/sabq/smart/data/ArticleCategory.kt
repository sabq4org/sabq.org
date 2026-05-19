package com.sabq.smart.data

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.LocationCity
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.SportsBasketball
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Ports iOS [ArticleCategory] (sabq/Models/ArticleCategory.swift).
 * Eight fixed categories, each with a colour token + Material icon.
 * Server-side category string ↔ enum mapping happens in the API layer.
 */
enum class ArticleCategory(
    val key: String,
    val title: String,
    val subtitle: String,
    val icon: ImageVector,
) {
    // Keys match the backend `slug` values from `/api/v1/sections`.
    // Backend ships 15 sections — these 8 are the headline ones that
    // get explicit visual treatment. Anything unmatched falls back to
    // [Local] tint via [fromSlug].
    Local(      "saudi",      "محلية",   "أخبار المملكة من كل اتجاه",      Icons.Filled.LocationCity),
    Sports(     "sports",     "رياضة",   "بطولات ودوريات ولاعبون",          Icons.Filled.SportsBasketball),
    Business(   "business",   "اقتصاد",  "أسواق ومؤشرات وصفقات",            Icons.Filled.TrendingUp),
    Technology( "technology", "تقنية",   "ابتكار وذكاء اصطناعي ومنتجات",    Icons.Filled.Computer),
    Culture(    "culture",    "ثقافة",   "فنون وأدب وموسيقى ومسرح",         Icons.Filled.MusicNote),
    Community(  "community",  "مجتمع",   "حياة الناس وقضاياهم",             Icons.Filled.People),
    World(      "world",      "دولية",   "العالم في تقارير سريعة",         Icons.Filled.Public),
    Life(       "life",       "حياتنا",  "صحة وأسرة وأسلوب حياة",            Icons.Outlined.Flag),
    ;

    @Composable
    @ReadOnlyComposable
    fun tint(): Color = when (this) {
        Local -> SabqTheme.colors.primaryEnd
        Sports -> SabqTheme.colors.leaf
        Business -> SabqTheme.colors.gold
        Technology -> SabqTheme.colors.teal
        Culture -> Color(0xFFA666CC)   // iOS purple (0.65, 0.40, 0.80)
        Community -> SabqTheme.colors.coral
        World -> SabqTheme.colors.sky
        Life -> Color(0xFFE57788) // soft rose
    }

    companion object {
        fun fromKey(key: String?): ArticleCategory =
            entries.firstOrNull { it.key == key } ?: Local

        /** Backend `slug` to category enum. Identical to [fromKey] but
         *  the call-site name is clearer for non-enum-typed slug strings. */
        fun fromSlug(slug: String?): ArticleCategory = fromKey(slug)

        /**
         * Resolve a category from whatever the backend ships in the
         * `section` field — typically an Arabic plural like "محليات",
         * "رياضات", "اقتصاديات". We match by the singular Arabic
         * title-stem (drop trailing "ات") so plural forms route to
         * the same enum case as the singular `title` we defined above.
         * Falls back to [Local] when no match.
         */
        fun fromArabicSection(arabic: String?): ArticleCategory {
            if (arabic.isNullOrBlank()) return Local
            val normalised = arabic.trim()
                .removeSuffix("ات")
                .removeSuffix("ون")
                .removeSuffix("ين")
            return entries.firstOrNull { cat ->
                cat.title == arabic
                    || cat.title == normalised
                    || arabic.contains(cat.title)
            } ?: Local
        }
    }
}
