package com.sabq.smart.data

import android.util.Log
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import retrofit2.HttpException

/** Reader-facing copy never includes exception messages or response bodies. */
internal fun Throwable.toReaderMessage(fallback: String): String {
    val causes = generateSequence(this) { it.cause }.take(16).toList()
    causes.filterIsInstance<CancellationException>().firstOrNull()?.let { throw it }
    val http = causes.filterIsInstance<HttpException>().firstOrNull()
    return when {
        causes.any { it is SocketTimeoutException } -> "استغرق الاتصال وقتًا أطول من المعتاد. حاول مرة أخرى."
        causes.any { it is UnknownHostException || it is ConnectException } -> "تعذّر الاتصال بالإنترنت. تحقّق من الشبكة وحاول مرة أخرى."
        http != null -> when (http.code()) {
            401 -> "يرجى تسجيل الدخول ثم المحاولة مرة أخرى."
            403 -> "هذا المحتوى غير متاح لحسابك."
            404 -> "المحتوى المطلوب غير متاح حاليًا."
            429 -> "يرجى الانتظار قليلًا ثم المحاولة مرة أخرى."
            in 500..599 -> "الخدمة غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل."
            else -> fallback
        }
        causes.any { it is SerializationException } -> "تعذّر عرض المحتوى حاليًا. حاول مرة أخرى لاحقًا."
        causes.any { it is IOException } -> "تعذّر إكمال الاتصال. تحقّق من الشبكة وحاول مرة أخرى."
        else -> fallback
    }
}

fun readerErrorMessage(error: Throwable, fallback: String): String {
    val message = error.toReaderMessage(fallback)
    // Log diagnostic types/status only: no tokens, URLs, JSON, or user content.
    val diagnostic = generateSequence(error) { it.cause }.take(16).joinToString(" -> ") {
        it.javaClass.simpleName + if (it is HttpException) " HTTP ${it.code()}" else ""
    }
    Log.w("SabqReader", diagnostic)
    return message
}
