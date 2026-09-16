package com.sabq.smart.feature.revisions

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import javax.inject.Qualifier
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Path

/**
 * مسودات الكاتب — نقاط «المقالات المعادة للتعديل». مرآة iOS:
 * `APIClient.fetchMyRevisions` / `fetchArticleDraft` / `resubmitArticle`
 * (Services/APIClient.swift:1184-1241).
 */

@Serializable
data class ApiRevisionSummary(
    val id: String = "",
    val title: String = "",
    val imageUrl: String? = null,
    val kind: String = "",
    val reviewNotes: String = "",
    val requestedAt: String? = null,
) {
    val isOpinion: Boolean get() = kind == "opinion"
}

@Serializable
data class ApiRevisionsListResponse(
    val success: Boolean = false,
    val count: Int = 0,
    val articles: List<ApiRevisionSummary> = emptyList(),
)

@Serializable
data class ApiArticleDraft(
    val id: String = "",
    val title: String = "",
    val body: String = "",
    val excerpt: String = "",
    val imageUrl: String? = null,
    val albumImages: List<String>? = null,
    val kind: String = "",
    val reviewNotes: String = "",
    val requestedAt: String? = null,
    val reviewStatus: String? = null,
    val status: String? = null,
) {
    val isOpinion: Boolean get() = kind == "opinion"

    /** المقال ما زال ينتظر تعديل الكاتب فعلاً. أي حالة أخرى تعني أن
     *  نافذة إعادة الإرسال أُغلقت — بوابة «التعديل المزدوج» من إشعار
     *  needs_revision قديم (iOS ArticleDraftPayload.awaitingEdits). */
    val awaitingEdits: Boolean get() = reviewStatus == "needs_changes" && status == "draft"
}

@Serializable
data class ApiArticleDraftResponse(
    val success: Boolean = false,
    val article: ApiArticleDraft = ApiArticleDraft(),
)

/** null في heroImage/albumImages = «أبقِ الصور الحالية» — لا يُرسل
 *  الحقل على السلك أصلاً (explicitNulls = false في Json المشترك). */
@Serializable
data class ResubmitRequest(
    val title: String,
    val content: String,
    val heroImage: String? = null,
    val albumImages: List<String>? = null,
)

@Serializable
data class ApiResubmitResponse(
    val success: Boolean = false,
    val message: String = "",
)

interface RevisionsApi {

    @GET("api/v1/articles/my-revisions")
    suspend fun getMyRevisions(): ApiRevisionsListResponse

    @GET("api/v1/articles/{id}/draft")
    suspend fun getDraft(@Path("id") id: String): ApiArticleDraftResponse

    @PUT("api/v1/articles/{id}/resubmit")
    suspend fun resubmit(
        @Path("id") id: String,
        @Body body: ResubmitRequest,
    ): ApiResubmitResponse
}

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class RevisionsRetrofit

@Module
@InstallIn(SingletonComponent::class)
object RevisionsNetworkModule {

    /**
     * resubmit يحمل صوراً base64 داخل جسم JSON — مهلة القراءة/الكتابة
     * الافتراضية (30/15 ثانية) كانت ستقطع الرفع على شبكات بطيئة.
     * ‏newBuilder يشارك pool الاتصالات وinterceptor التوثيق مع العميل
     * الأساسي، فلا تكلفة إضافية لغير هذه النداءات.
     */
    @Provides
    @Singleton
    @RevisionsRetrofit
    fun provideRevisionsRetrofit(retrofit: Retrofit, okHttpClient: okhttp3.OkHttpClient): Retrofit {
        val longClient = okHttpClient.newBuilder()
            .readTimeout(90, TimeUnit.SECONDS)
            .writeTimeout(90, TimeUnit.SECONDS)
            .build()
        return retrofit.newBuilder().client(longClient).build()
    }

    @Provides
    @Singleton
    fun provideRevisionsApi(@RevisionsRetrofit retrofit: Retrofit): RevisionsApi =
        retrofit.create(RevisionsApi::class.java)
}
