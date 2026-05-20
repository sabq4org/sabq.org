package com.sabq.smart.data

import com.sabq.smart.data.api.ApiUser
import com.sabq.smart.data.api.ApiUserInterest
import com.sabq.smart.data.api.roleDisplayName
import com.sabq.smart.data.api.rolesList

/** Domain representation of a member's interest category. Mirrors iOS
 *  `APIUserInterest` (`Services/APIModels.swift:876`) with the same
 *  optional name/slug/color triple — the chip grid + suggestions filter
 *  consume these. */
data class MemberInterest(
    val id: String,
    val name: String?,
    val slug: String?,
    val color: String?,
)

fun ApiUserInterest.toDomain(): MemberInterest = MemberInterest(
    id = id,
    name = name?.takeIf { it.isNotBlank() },
    slug = slug?.takeIf { it.isNotBlank() },
    color = color?.takeIf { it.isNotBlank() },
)

/**
 * Domain user model. Mirrors the subset of iOS `APIUser`
 * (`Services/APIModels.swift:866-1107`) that the profile + settings
 * surfaces actually read.
 */
data class User(
    val id: String,
    val displayName: String,
    val firstName: String?,
    val lastName: String?,
    val email: String?,
    val avatarUrl: String?,
    val role: String?,
    val roles: List<String>,
    /** Server-supplied Arabic role label (e.g. "كاتب مقال رأي"). Wins
     *  over the client-side translation table in [localizedRole]. */
    val roleLabel: String?,
    val jobTitle: String?,
    val department: String?,
    val bio: String?,
    val city: String?,
    val gender: String?,
    val phone: String?,
    val emailVerified: Boolean?,
    val verificationBadge: String?,
    val hasPressCard: Boolean?,
    val createdAt: String?,
    /** Member's chosen interest categories. Empty when the user hasn't
     *  picked any yet — the DailyBrief screen surfaces an onboarding
     *  card in that case. */
    val interests: List<MemberInterest> = emptyList(),
) {
    /** Mirrors iOS `APIUser.isVerified`: any non-"none" badge counts. */
    val isVerified: Boolean
        get() = !verificationBadge.isNullOrBlank() && verificationBadge != "none"

    /** The role most likely to be the user's "main" identity — same
     *  precedence iOS uses (first non-reader role from the list, then
     *  the singular role field, then anything). */
    val primaryRoleKey: String?
        get() {
            roles.firstOrNull { isNonReaderRole(it) }?.let { return it }
            if (!role.isNullOrBlank() && isNonReaderRole(role)) return role
            return roles.firstOrNull() ?: role
        }

    val localizedRole: String
        get() {
            // Server-rendered label wins — backend already resolves the
            // canonical Arabic name from the RBAC `roleAr` column.
            roleLabel?.takeIf { it.isNotBlank() }?.let { return it }
            jobTitle?.takeIf { it.isNotBlank() }?.let { return it }
            primaryRoleKey?.let { key ->
                roleTranslations[key.lowercase()]?.let { return it }
                return key
            }
            return "قارئ"
        }

    val isWriter: Boolean
        get() = roles.plus(role).filterNotNull().any { it.lowercase() in WRITER_KEYS }

    val isReporter: Boolean
        get() = roles.plus(role).filterNotNull().any { it.lowercase() in REPORTER_KEYS }

    val isAdminLike: Boolean
        get() = roles.plus(role).filterNotNull().any { it.lowercase() in ADMIN_LIKE_KEYS }

    companion object {
        private val WRITER_KEYS = setOf(
            "writer", "author", "article_writer", "article-writer",
            "article_author", "article-author", "opinion_author",
            "opinion-author", "columnist",
        )
        private val REPORTER_KEYS = setOf(
            "reporter", "correspondent", "journalist",
        )
        private val ADMIN_LIKE_KEYS = setOf(
            "admin", "system_admin", "system-admin",
            "editor", "editor_in_chief", "editor-in-chief",
            "senior_editor", "senior-editor",
            "managing_editor", "managing-editor",
            "editorial_manager", "editorial-manager",
        )

        /** Subset of iOS `APIUser.roleTranslations`. */
        private val roleTranslations: Map<String, String> = mapOf(
            "system_admin" to "مدير النظام",
            "admin" to "مسؤول",
            "editor" to "محرر",
            "editor_in_chief" to "رئيس التحرير",
            "senior_editor" to "محرر أول",
            "reporter" to "مراسل",
            "journalist" to "صحفي",
            "writer" to "كاتب",
            "author" to "كاتب",
            "article_writer" to "كاتب مقال",
            "article_author" to "كاتب مقال",
            "opinion_author" to "كاتب مقال رأي",
            "columnist" to "كاتب عمود",
            "correspondent" to "مراسل",
            "managing_editor" to "مدير تحرير",
            "editorial_manager" to "مدير تحرير",
            "content_manager" to "مدير محتوى",
            "comments_moderator" to "مشرف تعليقات",
            "moderator" to "مشرف",
            "publisher" to "ناشر",
            "photographer" to "مصور",
            "contributor" to "مساهم",
            "reader" to "قارئ",
        ).let { base ->
            val expanded = base.toMutableMap()
            for ((key, value) in base) {
                expanded[key.replace('_', '-')] = value
                expanded[key.replace("_", "")] = value
            }
            expanded
        }

        private fun isNonReaderRole(key: String): Boolean =
            key.lowercase() !in setOf("reader", "")
    }
}

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
        firstName = firstName?.takeIf { it.isNotBlank() },
        lastName = lastName?.takeIf { it.isNotBlank() },
        email = email,
        avatarUrl = avatarUrl?.takeIf { it.isNotBlank() },
        role = role,
        roles = rolesList(),
        roleLabel = roleDisplayName(),
        jobTitle = jobTitle,
        department = department,
        bio = bio,
        city = city,
        gender = gender,
        phone = phone,
        emailVerified = emailVerified,
        verificationBadge = verificationBadge,
        hasPressCard = hasPressCard,
        createdAt = createdAt,
        interests = interests.map { it.toDomain() },
    )
}
