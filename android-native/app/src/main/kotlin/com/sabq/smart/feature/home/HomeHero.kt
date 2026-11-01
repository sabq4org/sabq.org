package com.sabq.smart.feature.home

import com.sabq.smart.data.Article

/**
 * البارزة في الرئيسية: الكاروسيل يعرض أول ثلاث فقط (iOS `heroArticles`)،
 * و«آخر الأخبار» تستبعد المعروض منها فقط — لا الخمس المجلوبة كلها، وإلا
 * اختفى الرابع والخامس من الصفحة (iOS `latestTimelineArticles`).
 */
object HomeHero {
    const val MAX_SLIDES = 3

    fun shown(featured: List<Article>): List<Article> = featured.take(MAX_SLIDES)

    fun latestExcludingShown(latest: List<Article>, featured: List<Article>): List<Article> {
        val shownIds = shown(featured).map { it.id }.toSet()
        return latest.filterNot { it.id in shownIds }
    }
}
