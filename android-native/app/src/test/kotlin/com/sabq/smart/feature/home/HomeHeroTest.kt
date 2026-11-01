package com.sabq.smart.feature.home

import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleCategory
import org.junit.Assert.assertEquals
import org.junit.Test

/** الكاروسيل ثلاث شرائح، و«آخر الأخبار» تستبعد المعروض فقط. */
class HomeHeroTest {
    private fun article(id: String) = Article(
        id = id,
        title = "خبر $id",
        excerpt = "",
        category = ArticleCategory.Local,
        imageUrl = null,
        readingTime = "",
        dateFormatted = "",
    )

    @Test fun showsFirstThreeFeatured() {
        val featured = (1..5).map { article("f$it") }
        assertEquals(listOf("f1", "f2", "f3"), HomeHero.shown(featured).map { it.id })
    }

    @Test fun latestKeepsFeaturedThatAreNotShown() {
        val featured = (1..5).map { article("f$it") }
        val latest = listOf("f2", "f4", "a1", "f5", "a2").map { article(it) }
        assertEquals(
            listOf("f4", "a1", "f5", "a2"),
            HomeHero.latestExcludingShown(latest, featured).map { it.id },
        )
    }
}
