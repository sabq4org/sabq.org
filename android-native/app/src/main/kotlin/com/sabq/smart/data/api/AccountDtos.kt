package com.sabq.smart.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames

/**
 * Account-management request/response shapes. Each mirrors the
 * corresponding iOS APIClient call body — see lines 626-693 and
 * 809-957 of `Services/APIClient.swift`.
 */

@Serializable
data class ChangePasswordRequest(
    val currentPassword: String,
    val newPassword: String,
)

@Serializable
data class ForgotPasswordRequest(val email: String)

@Serializable
data class ResetPasswordRequest(
    val email: String,
    val code: String,
    val newPassword: String,
)

@Serializable
data class DeleteAccountRequest(val password: String)

@Serializable
data class UpdateProfileRequest(
    val firstName: String,
    val lastName: String? = null,
    val bio: String? = null,
    val city: String? = null,
    val gender: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiUpdateProfileResponse(
    val success: Boolean? = null,
    val message: String? = null,
    /** Backend wraps under `user` or `data` depending on path. */
    @JsonNames("data")
    val user: ApiUser? = null,
)

@Serializable
data class NewsletterSubscribeRequest(
    val email: String,
    val firstName: String? = null,
    val language: String = "ar",
    val source: String = "android-app",
)

@Serializable
data class NewsletterUnsubscribeRequest(
    val email: String,
    val reason: String? = null,
)

@Serializable
data class NewsletterStatusResponse(
    val subscribed: Boolean? = null,
)

@Serializable
data class ContactMessageRequest(
    val name: String,
    val phone: String,
    val email: String,
    val subject: String,
    val message: String,
)

/** Avatar upload — backend expects a base64 data URI in the JSON
 *  body (`{ "image": "data:image/png;base64,..." }`). Mirrors iOS
 *  `APIClient.uploadAvatar` at line 644. */
@Serializable
data class AvatarUploadRequest(val image: String)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiAvatarUploadResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val user: ApiUser? = null,
    val avatar: String? = null,
)

/** Article submission — opinion or news with up to N images encoded
 *  as base64 data URIs. Mirrors iOS `submitArticleDraft` at
 *  `APIClient.swift:867`. */
@Serializable
data class ArticleSubmissionRequest(
    val title: String,
    val content: String,
    /** "opinion" or "news" */
    val kind: String,
    val images: List<String> = emptyList(),
)

@Serializable
data class ApiArticleSubmissionResponse(
    val success: Boolean = false,
    val message: String = "",
    val article: SubmittedArticle? = null,
) {
    @OptIn(ExperimentalSerializationApi::class)
    @Serializable
    data class SubmittedArticle(
        val id: String = "",
        val title: String = "",
        val slug: String? = null,
        val kind: String = "",
        val status: String = "",
        @JsonNames("images_uploaded")
        val imagesUploaded: Int? = null,
    )
}
