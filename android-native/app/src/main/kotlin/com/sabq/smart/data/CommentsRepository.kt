package com.sabq.smart.data

import com.sabq.smart.data.api.CommentSubmitBody
import com.sabq.smart.data.api.SabqApi
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CommentsRepository @Inject constructor(
    private val api: SabqApi,
) {
    suspend fun getComments(slug: String): List<Comment> =
        api.getComments(slug).map { it.toDomain() }

    /**
     * Submit a comment / reply. Bearer-token required upstream — the
     * AuthInterceptor adds the header from [AuthTokenStore] when a
     * token is stored.
     */
    suspend fun submit(slug: String, content: String, parentId: String? = null): Comment {
        val response = api.postComment(slug, CommentSubmitBody(content = content, parentId = parentId))
        return response.toDomain()
    }
}
