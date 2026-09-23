package com.sabq.smart.data.api

import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.data.ArticleCategory
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException

class KeywordArticlesApiTest {
    private var requestedPath: String? = null

    private fun api(body: String, status: Int = 200) = stubReaderApi(body, status) { requestedPath = it }

    @Test
    fun decodesWrappedArticlesAndEncodesArabicKeywordOnce() = runBlocking {
        val response = api("""
            {"articles":[
                {"id":"news-1","title":"خبر الرياض","articleType":"news"},
                {"id":"opinion-1","title":"رأي","articleType":"opinion"}
            ],"muqtarabTopics":[{"id":"topic-1","title":"موضوع"}]}
        """.trimIndent()).getArticlesByKeyword("الرياض")

        assertEquals(listOf("news-1", "opinion-1"), response.articles.map { it.id })
        assertEquals("خبر الرياض", response.articles.first().title)
        assertEquals("opinion", response.articles.last().articleType)
        assertEquals("/api/keyword/%D8%A7%D9%84%D8%B1%D9%8A%D8%A7%D8%B6", requestedPath)
    }

    @Test
    fun repositoryMapsCategoryFromTheKeywordEnvelope() = runBlocking {
        val repository = ArticleRepository(api("""{"articles":[
            {"id":"news-1","title":"نيوم","categoryName":"رياضة","categorySlug":"sports"}
        ],"muqtarabTopics":[]}"""))
        val article = repository.getArticlesByKeyword("نيوم").single()
        assertEquals("رياضة", article.categoryLabel)
        assertEquals(ArticleCategory.Sports, article.category)
    }

    @Test
    fun malformedArticlesFailInsteadOfPretendingThereAreNoResults() = runBlocking {
        val error = runCatching {
            api("""{"articles":{},"muqtarabTopics":[]}""").getArticlesByKeyword("نيوم")
        }.exceptionOrNull()
        assertTrue(error is kotlinx.serialization.SerializationException)
    }

    @Test
    fun decodesEmptyResults() = runBlocking {
        val response = api("""{"articles":[],"muqtarabTopics":[]}""")
            .getArticlesByKeyword("كلمة بلا نتائج")
        assertTrue(response.articles.isEmpty())
    }

    @Test
    fun preservesHttpFailureForRetry() = runBlocking {
        val failure = runCatching {
            api("""{"message":"Failed to fetch articles"}""", 500)
                .getArticlesByKeyword("الرياض")
        }.exceptionOrNull()
        assertTrue(failure is HttpException)
        assertEquals(500, (failure as HttpException).code())
    }
}

internal fun stubReaderApi(body: String, status: Int = 200, onPath: (String) -> Unit = {}): SabqApi {
        val client = OkHttpClient.Builder().addInterceptor { chain ->
            onPath(chain.request().url.encodedPath)
            Response.Builder()
                .request(chain.request())
                .protocol(Protocol.HTTP_1_1)
                .code(status)
                .message("Test response")
                .body(body.toResponseBody("application/json".toMediaType()))
                .build()
        }.build()
        return NetworkModule.provideSabqApi(
            NetworkModule.provideRetrofit(client, NetworkModule.provideJson())
        )
    }
