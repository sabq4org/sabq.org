package com.sabq.smart.feature.comments

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * الإعجاب بالتعليقات والإبلاغ والحظر. مرآة iOS `APIClient`
 * (setCommentLike / reportComment / fetchBlockedUsers / blockUser / unblockUser).
 * الخادم: `server/routes/commentReactionsMobile.ts` و`commentSafetyMobile.ts`.
 */
@Serializable
data class ApiCommentLikeResult(
    val likesCount: Int = 0,
    val liked: Boolean = false,
)

@Serializable
data class CommentReportBody(
    val reason: String,
    val details: String? = null,
)

@Serializable
data class ApiBlockedUser(
    val id: String = "",
    val name: String? = null,
    val profileImageUrl: String? = null,
)

@Serializable
data class ApiBlockedUsersResponse(
    val success: Boolean = false,
    val users: List<ApiBlockedUser> = emptyList(),
)

@Serializable
data class BlockUserBody(val userId: String)

@Serializable
data class ApiSuccess(
    val success: Boolean = false,
    val message: String? = null,
)

interface CommentSafetyApi {
    @POST("api/v1/comments/{id}/like")
    suspend fun like(@Path("id") id: String): ApiCommentLikeResult

    @DELETE("api/v1/comments/{id}/like")
    suspend fun unlike(@Path("id") id: String): ApiCommentLikeResult

    @GET("api/v1/articles/{slug}/comments/my-likes")
    suspend fun myLikes(@Path("slug") slug: String): List<String>

    @POST("api/v1/comments/{id}/report")
    suspend fun report(@Path("id") id: String, @Body body: CommentReportBody): ApiSuccess

    @GET("api/v1/members/blocks")
    suspend fun blockedUsers(): ApiBlockedUsersResponse

    @POST("api/v1/members/blocks")
    suspend fun block(@Body body: BlockUserBody): ApiSuccess

    @DELETE("api/v1/members/blocks/{userId}")
    suspend fun unblock(@Path("userId") userId: String): ApiSuccess
}

@Module
@InstallIn(SingletonComponent::class)
object CommentSafetyNetworkModule {
    @Provides
    @Singleton
    fun provideCommentSafetyApi(retrofit: Retrofit): CommentSafetyApi =
        retrofit.create(CommentSafetyApi::class.java)
}
