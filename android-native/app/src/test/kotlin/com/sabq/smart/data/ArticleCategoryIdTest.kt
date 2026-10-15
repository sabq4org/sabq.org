package com.sabq.smart.data

import com.sabq.smart.data.api.ApiArticle
import com.sabq.smart.data.api.ApiCategoryNested
import org.junit.Assert.*
import org.junit.Test

/** معرّف التصنيف لبلوك «مقالات قد تهمك» والمشاهدات لبطاقة الرأي (الدفعة 2). */
class ArticleCategoryIdTest {
    @Test fun nestedCategoryIdWins() {
        val a = ApiArticle(category = ApiCategoryNested(id = "c1", name = "محليات", slug = "saudi"), sectionId = "s1").toDomain()
        assertEquals("c1", a.categoryId)
    }

    @Test fun fallsBackToV1SectionId() {
        assertEquals("s1", ApiArticle(sectionId = "s1").toDomain().categoryId)
        assertNull(ApiArticle().toDomain().categoryId)
        assertNull(ApiArticle(category = ApiCategoryNested(id = " ")).toDomain().categoryId)
    }

    @Test fun viewsCountReachesDomain() {
        assertEquals(1240, ApiArticle(viewsCount = 1240).toDomain().viewsCount)
        assertNull(ApiArticle().toDomain().viewsCount)
    }
}
