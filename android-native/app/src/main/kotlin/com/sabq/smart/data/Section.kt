package com.sabq.smart.data

/**
 * Top-level section (category) from `/api/v1/sections`. Distinct from
 * the visual [ArticleCategory] enum: that one drives chip tints + icon
 * placeholders for the 8 "well-known" sections; this one is the live
 * backend list (currently 15 entries, mostly mapping 1:1 to the
 * well-known set with a handful of editorial extensions like "AI
 * News" and "Stations").
 */
data class Section(
    val id: String,
    val name: String,        // Arabic plural — e.g. "محليات"
    val nameEn: String?,
    val slug: String,        // English key — e.g. "saudi", "sports"
    val articlesCount: Int,
    val displayOrder: Int,
) {
    /** Map to the well-known visual [ArticleCategory] for tint + icon. */
    val visualCategory: ArticleCategory
        get() = ArticleCategory.fromSlug(slug)
}
