package com.sabq.smart.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNames

/**
 * One comment node — mirrors iOS [APIComment]
 * (Services/APIModels.swift line 455-523). Tolerant to both nested
 * `user: { firstName, lastName, avatar }` and flat `user_name` /
 * `user_avatar` shapes; we accept `user` as raw [JsonElement] and
 * resolve in the mapper.
 *
 * Body field varies between `content` (current), `body`, and the
 * legacy `text`.
 *
 * Backend default status is "pending" (AI moderation runs async).
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiComment(
    val id: String = "",

    @JsonNames("content", "body", "text")
    val body: String = "",

    val user: JsonElement? = null,

    @JsonNames("user_name", "author")
    val userNameFlat: String? = null,

    @JsonNames("user_avatar")
    val userAvatarFlat: String? = null,

    @JsonNames("createdAt", "created_at")
    val createdAt: String = "",

    @JsonNames("likes_count", "likesCount")
    val likesCount: Int? = null,

    val status: String? = null,

    @JsonNames("parentId", "parent_id")
    val parentId: String? = null,

    val replies: List<ApiComment> = emptyList(),
)

@Serializable
data class CommentSubmitBody(
    val content: String,
    val parentId: String? = null,
    /** Source platform — drives the platform pill in the admin Smart
     *  Moderation dashboard. Fixed to "android" here. */
    val platform: String = "android",
)
