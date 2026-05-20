package com.sabq.smart.data

import com.sabq.smart.data.api.ApiAuthorCategory
import com.sabq.smart.data.api.ApiAuthorPage
import com.sabq.smart.data.api.ApiAuthorProfile
import com.sabq.smart.data.api.ApiAuthorStats

data class AuthorPage(
    val author: AuthorProfile,
    val stats: AuthorStats,
    val topCategories: List<AuthorCategory>,
    val recentArticles: List<Article>,
)

data class AuthorProfile(
    val id: String,
    val name: String,
    val role: String,
    val avatarUrl: String?,
    val bio: String?,
    val jobTitle: String?,
    val department: String?,
    val joinedAt: String?,
)

data class AuthorStats(
    val articleCount: Int,
    val totalViews: Int,
    val earliestPublish: String?,
)

data class AuthorCategory(
    val id: String,
    val nameAr: String,
    val color: String?,
    val icon: String?,
    val count: Int,
)

fun ApiAuthorProfile.toDomain(): AuthorProfile = AuthorProfile(
    id = id,
    name = name,
    role = role,
    avatarUrl = avatarUrl,
    bio = bio,
    jobTitle = jobTitle,
    department = department,
    joinedAt = joinedAt,
)

fun ApiAuthorStats.toDomain(): AuthorStats = AuthorStats(
    articleCount = articleCount,
    totalViews = totalViews,
    earliestPublish = earliestPublish,
)

fun ApiAuthorCategory.toDomain(): AuthorCategory = AuthorCategory(
    id = id,
    nameAr = nameAr,
    color = color,
    icon = icon,
    count = count,
)

fun ApiAuthorPage.toDomain(webOrigin: String = "https://sabq.org"): AuthorPage = AuthorPage(
    author = author.toDomain(),
    stats = stats?.toDomain() ?: AuthorStats(0, 0, null),
    topCategories = topCategories.map { it.toDomain() },
    // Defensive dedupe + newest-first sort:
    //   - The backend mostly orders by `published_at DESC` but not for
    //     every author (some return undated rows). Sort here so the UI
    //     always reads top-down newest → oldest regardless.
    //   - The backend also occasionally returns the same id twice
    //     (writer who has both a published draft and a republication).
    //     `distinctBy { it.id }` keeps the LazyColumn `key = { it.id }`
    //     stable so Compose doesn't crash on duplicate keys.
    recentArticles = recentArticles
        .map { it.toDomain(webOrigin) }
        .distinctBy { it.id }
        .sortedByDescending { it.publishedAtIso ?: "" },
)
