package com.sabq.smart.data

import com.sabq.smart.data.api.ApiComment
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Domain comment model. Mirrors iOS `APIComment` after the resolution
 * step in the decoder — i.e. the user info is already flattened.
 */
data class Comment(
    val id: String,
    val body: String,
    val userName: String?,
    val userAvatar: String?,
    val createdAt: String,
    val likesCount: Int?,
    val status: String?, // "pending" / "approved" / "rejected" / null
    val parentId: String?,
    val replies: List<Comment>,
) {
    val isPending: Boolean get() = status?.equals("pending", ignoreCase = true) == true
    val isApproved: Boolean get() = status?.equals("approved", ignoreCase = true) == true
    val isRejected: Boolean get() = status?.equals("rejected", ignoreCase = true) == true
}

fun ApiComment.toDomain(): Comment {
    val resolvedName = userNameFlat?.takeIf { it.isNotBlank() }
        ?: resolveUserName(user)
    val resolvedAvatar = userAvatarFlat?.takeIf { it.isNotBlank() }
        ?: resolveUserAvatar(user)
    return Comment(
        id = id.ifBlank { "anon-${hashCode()}" },
        body = body,
        userName = resolvedName,
        userAvatar = resolvedAvatar,
        createdAt = createdAt,
        likesCount = likesCount,
        status = status,
        parentId = parentId,
        replies = replies.map { it.toDomain() },
    )
}

private fun resolveUserName(element: kotlinx.serialization.json.JsonElement?): String? {
    if (element !is JsonObject) return null
    val obj = element.jsonObject
    val first = obj["firstName"]?.jsonPrimitive?.contentOrNull
        ?: obj["first_name"]?.jsonPrimitive?.contentOrNull
        ?: ""
    val last = obj["lastName"]?.jsonPrimitive?.contentOrNull
        ?: obj["last_name"]?.jsonPrimitive?.contentOrNull
        ?: ""
    val combined = "$first $last".trim()
    return combined.takeIf { it.isNotEmpty() }
        ?: obj["name"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
}

private fun resolveUserAvatar(element: kotlinx.serialization.json.JsonElement?): String? {
    if (element !is JsonObject) return null
    val obj = element.jsonObject
    return obj["avatar"]?.jsonPrimitive?.contentOrNull
        ?: obj["profileImageUrl"]?.jsonPrimitive?.contentOrNull
        ?: obj["profile_image_url"]?.jsonPrimitive?.contentOrNull
}
