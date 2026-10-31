package com.sabq.smart.data.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * «كلماتي» في حساب القارئ. مرآة iOS `APIClient`
 * (fetchFollowedKeywords / syncFollowedKeywords / setKeywordFollow).
 * الخادم: `server/routes/keywordFollowingMobile.ts`.
 */
@Serializable
data class ApiFollowedKeyword(
    val tagId: String? = null,
    val name: String,
    val articleCount: Int = 0,
)

@Serializable
data class ApiFollowedKeywords(val keywords: List<ApiFollowedKeyword> = emptyList())

@Serializable
data class KeywordSyncBody(val keywords: List<String>)

@Serializable
data class KeywordFollowBody(val keyword: String)

@Serializable
data class ApiKeywordFollowResult(val success: Boolean = false)

interface KeywordSyncApi {
    @GET("api/v1/keywords/followed")
    suspend fun followed(): ApiFollowedKeywords

    @POST("api/v1/keywords/sync")
    suspend fun sync(@Body body: KeywordSyncBody): ApiFollowedKeywords

    @POST("api/v1/keywords/follow")
    suspend fun follow(@Body body: KeywordFollowBody): ApiKeywordFollowResult

    @POST("api/v1/keywords/unfollow")
    suspend fun unfollow(@Body body: KeywordFollowBody): ApiKeywordFollowResult
}

@Module
@InstallIn(SingletonComponent::class)
object KeywordSyncNetworkModule {
    @Provides
    @Singleton
    fun provideKeywordSyncApi(retrofit: Retrofit): KeywordSyncApi =
        retrofit.create(KeywordSyncApi::class.java)
}
