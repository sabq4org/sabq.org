package com.sabq.smart.data

import com.sabq.smart.data.api.ApiUser

/**
 * Domain user model. Slimmed vs. iOS APIUser — pull richer fields
 * (passport profile, badges, social links, interests) only when the
 * specific screen needs them.
 */
data class User(
    val id: String,
    val displayName: String,
    val email: String?,
    val avatarUrl: String?,
    val role: String?,
    val jobTitle: String?,
    val createdAt: String?,
)

fun ApiUser.toDomain(): User {
    val combined = listOfNotNull(firstName, lastName)
        .filter { it.isNotBlank() }
        .joinToString(" ")
        .trim()
    val display = when {
        combined.isNotEmpty() -> combined
        !name.isNullOrBlank() -> name
        !email.isNullOrBlank() -> email.substringBefore("@")
        else -> "عضو سبق"
    }
    return User(
        id = id,
        displayName = display,
        email = email,
        avatarUrl = avatarUrl?.takeIf { it.isNotBlank() },
        role = role,
        jobTitle = jobTitle,
        createdAt = createdAt,
    )
}
