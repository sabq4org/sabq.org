package com.sabq.smart.data

import com.sabq.smart.data.api.ApiArticle
import com.sabq.smart.data.api.ApiCategoryNested
import org.junit.Assert.assertEquals
import org.junit.Test

class ArticleCategoryLabelTest {
    @Test fun usesRealNameAndSportsColour() {
        val article = ApiArticle(categoryName = "رياضة", categorySlug = "sports").toDomain()
        assertEquals("رياضة", article.categoryLabel)
        assertEquals(ArticleCategory.Sports, article.category)
    }

    @Test fun keepsServerNamesOutsideTheFixedCategoryList() {
        assertEquals("سياحة", ApiArticle(categoryName = "سياحة", categorySlug = "tourism").toDomain().categoryLabel)
    }

    @Test fun missingAndUnknownCategoriesDoNotClaimLocalNews() {
        for (api in listOf(ApiArticle(), ApiArticle(categoryName = " "), ApiArticle(categorySlug = "unknown"))) {
            assertEquals("أخبار", api.toDomain().categoryLabel)
        }
    }

    @Test fun knownSlugsAndNestedNamesKeepTheirLabels() {
        assertEquals("رياضة", ApiArticle(categorySlug = "sports").toDomain().categoryLabel)
        assertEquals("محلية", ApiArticle(categorySlug = "saudi").toDomain().categoryLabel)
        assertEquals("اقتصاد", ApiArticle(category = ApiCategoryNested(name = "اقتصاد", slug = "business")).toDomain().categoryLabel)
    }
}
