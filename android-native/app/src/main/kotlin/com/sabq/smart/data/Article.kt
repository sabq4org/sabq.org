package com.sabq.smart.data

import androidx.compose.runtime.Immutable
import com.sabq.smart.ui.components.ImageFocalPoint

/**
 * Placeholder Article model for the design-showcase phase. The real
 * Retrofit `@Serializable` model + `formatArticleForMobile` mapping
 * lands in Pillar 3 (APIClient + APIModels).
 */
@Immutable
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
    val isReading: Boolean = false,
    val slug: String? = null,
    val authorName: String? = null,
    /** صورة كاتب الرأي (رابط مطلق) — تُعرض في قائمة «الرأي» بالرئيسية. */
    val authorImageUrl: String? = null,
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
    /** اسم القسم الحقيقي من الخادم — الشارة كانت تعرض عنوان دلو التصنيف
     *  الثابت فتُوسم كل المواد غير المطابقة «محلية» (ملاحظة المالك 2026-08-02). */
    val categoryLabel: String = "",
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
    /** Server-computed reading time in whole minutes. Kept separate
     *  from the formatted [readingTime] string so screens that need
     *  to sum minutes (e.g. Bookmarks stats) can do so without
     *  parsing Arabic. Null when the backend omits the field. */
    val readingMinutesInt: Int? = null,
    /** Editorial "صور الأسبوع" gallery. Non-empty only when the
     *  backend tagged this article as a weekly-photos pack
     *  (`articleType == "weekly_photos"`, nested at
     *  `weeklyPhotosData.photos`). Renders as a numbered timeline
     *  in the article body — iOS `weeklyPhotosGallery`. */
    val weeklyPhotos: List<WeeklyPhoto> = emptyList(),
    val albumImages: List<String> = emptyList(),
    /** زر واتساب في نهاية المقال (من whatsappCta). الإدراج داخل النص عبر HTML. */
    val whatsappCta: WhatsAppCta? = null,
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

@Immutable
data class WhatsAppCta(
    val phone: String,
    val phrase: String,
    val message: String? = null,
    val placement: String = "end",
) {
    val isActiveEndPlacement: Boolean
        get() = placement == "end" && phone.any { it.isDigit() }

    val waUrl: String
        get() {
            val digits = phone.filter { it.isDigit() }
            val base = "https://wa.me/$digits"
            val text = message?.trim().orEmpty()
            return if (text.isNotEmpty()) {
                "$base?text=${java.net.URLEncoder.encode(text, Charsets.UTF_8.name())}"
            } else {
                base
            }
        }
}

/**
 * One photo inside a `weekly_photos` article — image + Arabic caption +
 * photographer/source credit. Mirrors iOS `APIWeeklyPhoto`. The
 * lightbox identifies entries by [imageUrl].
 */
@Immutable
data class WeeklyPhoto(
    val imageUrl: String,
    val caption: String,
    val credit: String,
)
