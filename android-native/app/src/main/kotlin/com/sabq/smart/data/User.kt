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
    /** Indicates the OAuth providers (Apple/Google) the account is linked
     *  to. Null on legacy email/password accounts. iOS counterpart:
     *  `APIUser.authProvider`. */
    val authProvider: String?,
    /** True when the account's basic profile fields are filled in. Used
     *  by the "أكمل بياناتك" banner alongside live field checks. iOS
     *  PR #58 dropped the dependency on this column for the banner gate
     *  (legacy rows defaulted to false even when complete) — Android
     *  follows the same dynamic approach via [hasMinimumBasicProfile]. */
    val isProfileComplete: Boolean?,
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
            // Mirrors iOS `APIUser.localizedRole` (`APIModels.swift:968-987`):
            //   1. preferredRoleLabel — server label OR translation of the
            //      primary non-reader role key (skips stale "قارئ"/"reader"
            //      labels so a writer with a stale roleLabel still resolves
            //      to "كاتب").
            //   2. jobTitle (membership label skipped — not yet decoded).
            //   3. translation of any role key, even reader.
            //   4. "قارئ".
            preferredRoleLabel()?.let { return it }
            jobTitle?.takeIf { it.isNotBlank() }?.let { return it }
            primaryRoleKey?.let { key ->
                roleTranslations[key.lowercase()]?.let { return it }
                return key
            }
            return "قارئ"
        }

    private fun preferredRoleLabel(): String? {
        val sanitizedLabel = roleLabel?.trim()?.takeIf { it.isNotEmpty() }
        if (sanitizedLabel != null && isNonReaderRoleLabel(sanitizedLabel)) {
            return sanitizedLabel
        }
        val key = primaryRoleKey ?: return null
        if (!isNonReaderRole(key)) return null
        return roleTranslations[key.lowercase()] ?: sanitizedLabel
    }

    val isWriter: Boolean
        get() = roles.plus(role).filterNotNull().any { it.lowercase() in WRITER_KEYS }

    val isReporter: Boolean
        get() = roles.plus(role).filterNotNull().any { it.lowercase() in REPORTER_KEYS }

    val isAdminLike: Boolean
        get() = roles.plus(role).filterNotNull().any { it.lowercase() in ADMIN_LIKE_KEYS }

    /** True when city + gender are filled in — drives the "البيانات
     *  الشخصية" half of the Settings completion banner. firstName /
     *  lastName are NOT in the gate because they're locked at
     *  registration ([[name-lock-policy]]) and can't be edited later;
     *  if we included them, accounts that signed up without sharing
     *  the name would see the banner forever. */
    val hasMinimumBasicProfile: Boolean
        get() = !city.isNullOrBlank() && !gender.isNullOrBlank()

    /** True when at least one interest category is selected. */
    val hasAtLeastOneInterest: Boolean
        get() = interests.isNotEmpty()

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
            "admin", "system_admin", "system-admin", "superadmin",
            "editor", "editor_in_chief", "editor-in-chief",
            "senior_editor", "senior-editor",
            "managing_editor", "managing-editor",
            "editorial_manager", "editorial-manager",
            "content_manager", "content-manager",
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
            "media_manager" to "مدير وسائط",
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

        /** Mirrors iOS `isNonReaderRoleLabel` (`APIModels.swift:1202`).
         *  Filters out stale Arabic "reader" labels so a writer with a
         *  bad server label still resolves to the correct role. */
        private fun isNonReaderRoleLabel(label: String): Boolean {
            val n = label.trim().lowercase()
            return n != "reader" && n != "قارئ" && n != "قاريء"
        }
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
        authProvider = authProvider?.takeIf { it.isNotBlank() },
        isProfileComplete = isProfileComplete,
        interests = interests.map { it.toDomain() },
    )
}
