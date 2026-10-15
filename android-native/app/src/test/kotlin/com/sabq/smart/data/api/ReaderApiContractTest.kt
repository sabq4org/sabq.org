package com.sabq.smart.data.api

import com.sabq.smart.data.ArticleRepository
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class ReaderApiContractTest {
    @Test fun articleFeedRetainsPaginationAndCategory() = runBlocking {
        val repo = ArticleRepository(stubReaderApi("""{
            "articles":[{"id":"a1","title":"عنوان","categorySlug":"sports"}],
            "total":41,"limit":20,"offset":20,"hasMore":true
        }"""))
        val page = repo.getArticles(page = 2)
        assertEquals("a1", page.items.single().id)
        assertEquals("رياضة", page.items.single().categoryLabel)
        assertEquals(2, page.page)
        assertEquals(41, page.total)
        assertTrue(page.hasMore)
    }

    @Test fun searchKeepsQueryCountsAndResults() = runBlocking {
        val repo = ArticleRepository(stubReaderApi("""{
            "query":"نيوم","articles":[{"id":"a1","title":"نيوم"}],"total":1,"hasMore":false
        }"""))
        val result = repo.search(" نيوم ")
        assertEquals("نيوم", result.query)
        assertEquals("a1", result.items.single().id)
        assertEquals(1, result.total)
        assertFalse(result.hasMore)
    }

    @Test fun sectionsDecodeArabicNamesAndDisplayOrder() = runBlocking {
        val repo = ArticleRepository(stubReaderApi("""{"sections":[
            {"id":"sport","nameAr":"رياضة","slug":"sports","displayOrder":2},
            {"id":"local","nameAr":"محليات","slug":"saudi","displayOrder":1}
        ]}"""))
        val sections = repo.getSections()
        assertEquals(listOf("saudi", "sports"), sections.map { it.slug })
        assertEquals(listOf("محليات", "رياضة"), sections.map { it.name })
    }
}
