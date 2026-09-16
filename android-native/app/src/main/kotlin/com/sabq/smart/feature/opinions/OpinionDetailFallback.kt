package com.sabq.smart.feature.opinions

import com.sabq.smart.data.Article
import com.sabq.smart.data.api.ApiArticle
import com.sabq.smart.data.toDomain
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Path

/**
 * جلب احتياطي لتفاصيل مقال رأي: بعض مقالات الرأي لا تُخدم عبر
 * `api/articles/{slug}` وتنجح فقط على `api/opinion/{slug}`. الغلاف
 * غير مستقر بين الإصدارات ({data|item|opinion|article: ...} أو الكائن
 * مباشرة) فنقرأ JsonElement ونفكّه بتسامح عبر نفس محوّل ApiArticle.
 */
interface OpinionDetailApi {
    @GET("api/opinion/{slug}")
    suspend fun getOpinion(@Path("slug") slug: String): JsonElement
}

@Module
@InstallIn(SingletonComponent::class)
object OpinionDetailNetworkModule {
    @Provides
    @Singleton
    fun provideOpinionDetailApi(retrofit: Retrofit): OpinionDetailApi =
        retrofit.create(OpinionDetailApi::class.java)
}

@Singleton
class OpinionDetailRepository @Inject constructor(
    private val api: OpinionDetailApi,
    private val json: Json,
) {
    /** null = غير موجود / الشكل غير قابل للفك — يبقى خطأ الشاشة الأصلي. */
    suspend fun fetchOpinion(slug: String): Article? {
        val element = runCatching { api.getOpinion(slug) }.getOrNull() ?: return null
        val payload = unwrap(element) ?: return null
        val apiArticle = runCatching {
            json.decodeFromJsonElement(ApiArticle.serializer(), payload)
        }.getOrNull() ?: return null
        if (apiArticle.id.isBlank() && apiArticle.title.isBlank()) return null
        // toDomain يُبقي body وexcerpt منفصلين تماماً — ممنوع body=excerpt
        // (خطأ iOS القديم: الموجز الذكي كان يُعرض كنص المقال).
        return apiArticle.toDomain()
    }

    private fun unwrap(element: JsonElement): JsonElement? {
        val obj = element as? JsonObject ?: return null
        for (key in listOf("data", "item", "opinion", "article")) {
            val nested = obj[key]
            if (nested is JsonObject) return nested
        }
        // الكائن نفسه هو المقال إن حمل عنواناً
        return if (obj.containsKey("title") || obj.containsKey("id")) obj else null
    }
}

sealed interface OpinionFallbackState {
    data object Idle : OpinionFallbackState
    data object Loading : OpinionFallbackState
    data object Failed : OpinionFallbackState
    data class Loaded(val article: Article) : OpinionFallbackState
}

@HiltViewModel
class OpinionFallbackViewModel @Inject constructor(
    private val repo: OpinionDetailRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<OpinionFallbackState>(OpinionFallbackState.Idle)
    val state = _state.asStateFlow()

    private var triedSlug: String? = null

    fun tryLoad(slug: String) {
        if (slug.isBlank() || triedSlug == slug) return
        triedSlug = slug
        viewModelScope.launch {
            _state.value = OpinionFallbackState.Loading
            val article = repo.fetchOpinion(slug)
            _state.value = if (article != null) {
                OpinionFallbackState.Loaded(article)
            } else {
                OpinionFallbackState.Failed
            }
        }
    }
}
