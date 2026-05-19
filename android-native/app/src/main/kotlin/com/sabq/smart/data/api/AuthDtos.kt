package com.sabq.smart.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
)

@Serializable
data class RegisterRequest(
    val name: String,
    val email: String,
    val password: String,
    @SerialName("password_confirmation") val passwordConfirmation: String,
)

/**
 * Successful auth response. The backend sometimes nests user data
 * under `data` instead of `user`; iOS handles both via FlexKey, we
 * do the same via [JsonNames].
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiLoginResponse(
    val message: String? = null,
    @JsonNames("access_token")
    val token: String? = null,
    @JsonNames("data")
    val user: ApiUser? = null,
    @JsonNames("emailSent", "email_sent")
    val emailSent: Boolean? = null,
)

/**
 * 401 / 4xx response from the auth endpoints. The same `success` +
 * `message` shape is used for other v1 errors too.
 */
@Serializable
data class ApiErrorResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val error: String? = null,
)

/**
 * Slimmed-down APIUser — iOS has 200+ fields. We pull only the
 * essentials needed for the profile card; richer fields land when
 * we port the full member profile screen.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiUser(
    val id: String = "",
    @JsonNames("firstName")
    val firstName: String? = null,
    @JsonNames("lastName")
    val lastName: String? = null,
    val name: String? = null,
    val email: String? = null,
    @JsonNames("avatar_url", "avatarUrl", "profileImage", "profile_image")
    val avatarUrl: String? = null,
    @JsonNames("role", "user_role")
    val role: String? = null,
    @JsonNames("job_title", "jobTitle")
    val jobTitle: String? = null,
    val phone: String? = null,
    @JsonNames("created_at", "createdAt")
    val createdAt: String? = null,
)
