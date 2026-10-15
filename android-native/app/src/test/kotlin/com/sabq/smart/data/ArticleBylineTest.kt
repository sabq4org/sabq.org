package com.sabq.smart.data

import com.sabq.smart.data.api.ApiArticle
import com.sabq.smart.data.api.ApiSeoMetadata
import com.sabq.smart.data.api.ApiStaffNested
import org.junit.Assert.*
import org.junit.Test

/** سطر الكاتب (الدفعة 3) — نظير اختبارات iOS للبند 8. */
class ArticleBylineTest {
    @Test fun roleFollowsWebRules() {
        assertEquals("مراسل صحفي", ArticleByline.resolveAuthorRole("أحمد", "u1", "u1", null))
        assertEquals("كاتب الخبر", ArticleByline.resolveAuthorRole("أحمد", "u1", "u2", null))
        assertEquals("كاتب الخبر", ArticleByline.resolveAuthorRole("أحمد", null, null, " "))
        assertEquals("صحيفة إلكترونية سعودية", ArticleByline.resolveAuthorRole("صحيفة سبق", "admin", "r", null))
        assertEquals("محرر اقتصادي", ArticleByline.resolveAuthorRole("صحيفة سبق", "u1", "u1", " محرر اقتصادي "))
    }

    @Test fun riyadhDatesUseLatinDigits() {
        val iso = "2026-09-12T19:22:53.434Z"
        assertEquals("12 سبتمبر 2026", ArticleByline.publicationDate(iso))
        assertEquals("10:22 م", ArticleByline.publicationClock(iso))
        assertEquals("12 سبتمبر 2026، 10:22 م", ArticleByline.lastUpdatedLabel(iso))
        assertNull(ArticleByline.lastUpdatedLabel(null))
        assertNull(ArticleByline.publicationDate("garbage"))
        assertEquals("قراءة 4 دقيقة", ArticleByline.readingLabel(4))
        assertEquals("قراءة 1 دقيقة", ArticleByline.readingLabel(null))
        assertEquals("07:23 2026", ArticleByline.latinDigits("٠٧:٢٣ ٢٠٢٦"))
    }

    @Test fun mapperCarriesStaffAndEditorialFields() {
        val a = ApiArticle(
            authorName = "صحيفة سبق",
            authorId = "admin-sabq", reporterId = "r1",
            staff = ApiStaffNested(slug = "shyfh-sbq", isVerified = true, title = null),
            seoMetadata = ApiSeoMetadata(editorialModifiedAt = "2026-09-13T07:19:50Z"),
        ).toDomain()
        assertEquals("صحيفة إلكترونية سعودية", a.authorRole)
        assertEquals("shyfh-sbq", a.authorSlug)
        assertTrue(a.isAuthorVerified)
        assertEquals("2026-09-13T07:19:50Z", a.editorialModifiedAtIso)
        val plain = ApiArticle(authorName = "x").toDomain()
        assertNull(plain.editorialModifiedAtIso)
        assertFalse(plain.isAuthorVerified)
    }
}
