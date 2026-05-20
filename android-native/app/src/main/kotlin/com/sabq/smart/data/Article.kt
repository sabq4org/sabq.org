package com.sabq.smart.data

import com.sabq.smart.ui.components.ImageFocalPoint

/**
 * Placeholder Article model for the design-showcase phase. The real
 * Retrofit `@Serializable` model + `formatArticleForMobile` mapping
 * lands in Pillar 3 (APIClient + APIModels).
 */
data class Article(
    val id: String,
    val title: String,
    val excerpt: String,
    val category: ArticleCategory,
    val imageUrl: String?,
    val focalPoint: ImageFocalPoint? = null,
    val readingTime: String,
    val dateFormatted: String,
    val isBreaking: Boolean = false,
    val isFeatured: Boolean = false,
    val slug: String? = null,
    val authorName: String? = null,
    val body: String? = null,
    val articleType: String? = null,
    val authorGender: String? = null,
    /** AI-generated summary string. Kept separate from [excerpt] so the
     *  Smart Summary card on the detail screen can prefer the AI text
     *  over the editor's excerpt — mirrors iOS `displayArticle.aiSummary
     *  || displayArticle.excerpt` at `ArticleDetailView.swift:614`. */
    val aiSummary: String? = null,
    /** Article tags / keywords. Empty when the backend omits them.
     *  Surfaced as chips under the article body. */
    val tags: List<String> = emptyList(),
    /** Canonical public article URL (used by the share sheet). When
     *  null we fall back to `${webOrigin}/article/${slug}`. */
    val articleUrl: String? = null,
    /** When true the hero shows the small "صورة من الذكاء الاصطناعي"
     *  badge overlay (iOS `aiImageBadgeOverlay`). */
    val isAiGeneratedImage: Boolean = false,
    val aiImageModel: String? = null,
    /** Raw ISO-8601 publish timestamp from the backend. Kept separate
     *  from [dateFormatted] (which is the human "اليوم 14:32" string)
     *  so callers can sort by it. Null when the backend omits the
     *  field. */
    val publishedAtIso: String? = null,
) {
    /**
     * Stable identifier used by [BookmarksStore] (and any persistent
     * store that needs to re-fetch the article later). We prefer the
     * slug because the public article-detail endpoint is keyed on it;
     * the bare UUID `id` works only on the v1 detail path.
     */
    val bookmarkKey: String get() = slug?.takeIf { it.isNotBlank() } ?: id

    /**
     * True when this article should render as an opinion piece —
     * shows the "مقال رأي" pill + gendered byline instead of the
     * default category chip + plain author. Matches iOS
     * `APIArticle.isOpinionContent` (Services/APIModels.swift line
     * 254-284).
     */
    val isOpinion: Boolean
        get() {
            val markers = listOf(articleType, category.key)
                .mapNotNull { it?.lowercase()?.replace('-', '_')?.replace(' ', '_') }
            val exact = setOf("opinion", "opinions", "op_ed", "column", "columns")
            return markers.any { m ->
                m in exact || m.contains("opinion") || m.contains("الرأي") ||
                    m.contains("مقالات_الرأي") || m.contains("كتاب_الرأي")
            }
        }

    /**
     * Gendered byline label — "الكاتبة" for female authors,
     * "الكاتب" for male, neutral "بقلم" otherwise. Mirrors iOS
     * `OpinionArticle.bylineLabel` (Models/SabqModels.swift line 672).
     * Backend reads `users.gender` (`"male" | "female"`).
     */
    val bylineLabel: String
        get() = when (authorGender?.trim()?.lowercase()) {
            "female", "f", "أنثى" -> "الكاتبة"
            "male", "m", "ذكر" -> "الكاتب"
            else -> "بقلم"
        }
}
