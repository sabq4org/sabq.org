package com.sabq.smart.feature.comments

import com.sabq.smart.data.Comment
import com.sabq.smart.data.api.ApiComment
import com.sabq.smart.data.toDomain
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class CommentSafetyTest {
    private fun comment(id: String, userId: String?, replies: List<Comment> = emptyList()) = Comment(
        id = id, body = "b", userId = userId, userName = "n", userAvatar = null,
        createdAt = "", likesCount = 0, status = "approved", parentId = null, replies = replies,
    )

    @Test
    fun hidesBlockedAuthorsAndReportedCommentsIncludingReplies() {
        val list = listOf(
            comment("1", "u1", replies = listOf(comment("1a", "blocked"), comment("1b", "u3"))),
            comment("2", "blocked"),
            comment("3", "u4"),
        )
        val state = CommentSafetyStore.State(
            blockedUsers = listOf(ApiBlockedUser(id = "blocked")),
            reportedCommentIds = setOf("3"),
        )
        val visible = visibleComments(list, state)
        assertEquals(listOf("1"), visible.map { it.id })
        assertEquals(listOf("1b"), visible.first().replies.map { it.id })
    }

    @Test
    fun decodesTheAuthorIdFromFlatOrNestedUser() {
        val json = Json { ignoreUnknownKeys = true; useAlternativeNames = true }
        val flat = json.decodeFromString(ApiComment.serializer(), """{"id":"c1","content":"x","userId":"u1"}""")
        val nested = json.decodeFromString(ApiComment.serializer(), """{"id":"c2","content":"x","user":{"id":"u2"}}""")
        assertEquals("u1", flat.toDomain().userId)
        assertEquals("u2", nested.toDomain().userId)
    }
}
