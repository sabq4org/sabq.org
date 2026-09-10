package com.sabq.smart.data

import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class ReaderErrorTest {
    private val fallback = "تعذّر تحميل الأخبار. حاول مرة أخرى."
    private fun http(code: Int) = HttpException(Response.error<String>(
        code, "private response".toResponseBody("application/json".toMediaType())
    ))

    @Test fun distinguishesOfflineAndTimeout() {
        val offline = UnknownHostException("private host").toReaderMessage(fallback)
        assertTrue(offline.contains("الإنترنت"))
        assertEquals(offline, ConnectException().toReaderMessage(fallback))
        assertTrue(SocketTimeoutException().toReaderMessage(fallback).contains("وقتًا أطول"))
        assertNotEquals(offline, IOException().toReaderMessage(fallback))
    }

    @Test fun unwrapsCausesAndPrefersSpecificNetworkFailure() {
        val error = IOException("wrapper", SocketTimeoutException("private URL"))
        assertEquals(SocketTimeoutException().toReaderMessage(fallback), error.toReaderMessage(fallback))
    }

    @Test fun distinguishesHttpFailures() {
        assertTrue(http(401).toReaderMessage(fallback).contains("تسجيل الدخول"))
        assertTrue(http(403).toReaderMessage(fallback).contains("لحسابك"))
        assertTrue(http(404).toReaderMessage(fallback).contains("المحتوى المطلوب"))
        assertTrue(http(429).toReaderMessage(fallback).contains("الانتظار"))
        for (code in listOf(500, 502, 503, 504)) {
            assertTrue(http(code).toReaderMessage(fallback).contains("الخدمة غير متاحة مؤقتًا"))
        }
        assertEquals(fallback, http(400).toReaderMessage(fallback))
    }

    @Test fun neverExposesJsonOrUnknownExceptionText() {
        val raw = "Unexpected JSON token at offset 0: {articles: secret}"
        val message = SerializationException(raw).toReaderMessage(fallback)
        assertTrue(message.contains("تعذّر عرض المحتوى"))
        assertFalse(message.contains("JSON"))
        assertFalse(message.contains("secret"))
        assertEquals(fallback, IllegalStateException(raw).toReaderMessage(fallback))
    }

    @Test fun cancellationIsRethrownEvenInsideAnotherFailure() {
        val cancelled = CancellationException("screen closed")
        for (error in listOf(cancelled, IOException("wrapper", cancelled))) {
            val actual = runCatching { error.toReaderMessage(fallback) }.exceptionOrNull()
            assertSame(cancelled, actual)
        }
    }
}
