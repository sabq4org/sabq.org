package com.sabq.smart.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNames
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

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

@Serializable
data class ApiErrorResponse(
    val success: Boolean? = null,
    val message: String? = null,
    val error: String? = null,
)

/** `GET /api/v1/members/profile` envelope. Backend ships
 *  `{ success, user: {...} }` — see `mobileApiRoutes.ts:1605`. */
@Serializable
data class MemberProfileResponse(
    val success: Boolean? = null,
    val user: ApiUser? = null,
)

/** Mirrors iOS `APIUser` from `Services/APIModels.swift:866-1107`. We
 *  decode the same flexible field set so the profile card can render
 *  verified seal, bio, job-title + department, email-not-verified
 *  warning, and role-gated submission cards. */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiUser(
    val id: String = "",
    @JsonNames("first_name")
    val firstName: String? = null,
    @JsonNames("last_name")
    val lastName: String? = null,
    val name: String? = null,
    val email: String? = null,
    @JsonNames("avatar_url", "profileImage", "profile_image", "profileImageUrl", "profile_image_url", "avatar")
    val avatarUrl: String? = null,
    @JsonNames("user_role")
    val role: String? = null,
    /** Backend can ship any of: a comma-separated string, a string
     *  array, OR an array of `{key, displayName}` objects (see
     *  `mobileApiRoutes.ts:1617`). We accept whichever shape arrives
     *  and normalise via [rolesList]. */
    val roles: JsonElement? = null,
    /** Server-rendered Arabic role label (`mobileApiRoutes.ts:1610`).
     *  Wins over the client-side translation table when present. */
    @JsonNames("role_label")
    val roleLabel: String? = null,
    @JsonNames("job_title", "title_ar", "title", "position", "staff_title", "staffTitle")
    val jobTitle: String? = null,
    val department: String? = null,
    val bio: String? = null,
    val city: String? = null,
    val country: String? = null,
    val gender: String? = null,
    @JsonNames("birth_date")
    val birthDate: String? = null,
    @JsonNames("phone_number", "phoneNumber")
    val phone: String? = null,
    @JsonNames("email_verified")
    val emailVerified: Boolean? = null,
    @JsonNames("phone_verified")
    val phoneVerified: Boolean? = null,
    @JsonNames("verification_badge")
    val verificationBadge: String? = null,
    @JsonNames("has_press_card")
    val hasPressCard: Boolean? = null,
    @JsonNames("auth_provider")
    val authProvider: String? = null,
    @JsonNames("created_at")
    val createdAt: String? = null,
)

/** Normalise [ApiUser.roles] into a flat list of role keys regardless
 *  of which of the three backend shapes arrived (string / string[] /
 *  {key, displayName}[]). Always merged with the singular [role]
 *  field so a single-role user still shows up. */
fun ApiUser.rolesList(): List<String> {
    val fromRoles: List<String> = when (val el = roles) {
        null -> emptyList()
        is JsonPrimitive -> el.contentOrNull
            ?.split(',', ';')
            ?.map { it.trim() }
            ?.filter { it.isNotEmpty() }
            ?: emptyList()
        is JsonArray -> el.mapNotNull { element ->
            when (element) {
                is JsonPrimitive -> element.contentOrNull?.takeIf { it.isNotBlank() }
                is JsonObject -> element["key"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
                else -> null
            }
        }
        else -> emptyList()
    }
    val fromRole = role?.takeIf { it.isNotBlank() }?.let { listOf(it) } ?: emptyList()
    return (fromRoles + fromRole).distinct()
}

/** Read the server-supplied Arabic role label, if any. */
fun ApiUser.roleDisplayName(): String? {
    val labelFromField = roleLabel?.takeIf { it.isNotBlank() }
    if (labelFromField != null) return labelFromField
    val firstObjectDisplay = (roles as? JsonArray)
        ?.firstNotNullOfOrNull { el ->
            (el as? JsonObject)?.get("displayName")?.jsonPrimitive?.contentOrNull
        }
        ?.takeIf { it.isNotBlank() }
    return firstObjectDisplay
}
