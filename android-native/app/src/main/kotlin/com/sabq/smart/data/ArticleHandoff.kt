package com.sabq.smart.data

/**
 * تمرير المقال المنقور من القائمة إلى شاشة التفاصيل كي تُفتح فورًا
 * بعنوانه وصورته ومقتطفه بدل شاشة تحميل فارغة تعيد جلب ما هو موجود
 * في الذاكرة أصلًا (تدقيق الأداء 2026-08-02). النص الكامل يُجلب في
 * الخلفية ويحلّ محل المقتطف عند وصوله.
 *
 * كائن مفرد بسيط لا Hilt — التسليم لحظي بين نقرة ووجهة واحدة، ويُصفَّر
 * عند الأخذ حتى لا يتسرب مقال قديم لفتحة لاحقة عبر رابط عميق.
 */
object ArticleHandoff {
    @Volatile
    private var last: Article? = null

    fun put(article: Article) {
        last = article
    }

    fun take(slug: String): Article? {
        val candidate = last ?: return null
        return if (candidate.slug == slug) {
            last = null
            candidate
        } else {
            null
        }
    }
}
