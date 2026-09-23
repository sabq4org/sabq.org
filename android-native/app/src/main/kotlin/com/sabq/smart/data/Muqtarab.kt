package com.sabq.smart.data

import com.sabq.smart.data.api.ApiMuqAngle
import com.sabq.smart.data.api.ApiMuqAngleDetail
import com.sabq.smart.data.api.ApiMuqTopic
import com.sabq.smart.data.api.ApiMuqTopicAngle
import com.sabq.smart.data.api.ApiMuqWriter
import com.sabq.smart.data.api.ApiMuqWriterAngle
import com.sabq.smart.data.api.ApiMuqWriterInfo
import com.sabq.smart.data.api.ApiMuqWriterProfile
import com.sabq.smart.data.api.ApiMuqWriterTopic

/**
 * Domain models for «مُقترب». Plain data classes consumed by the UI —
 * the `Api*` DTOs in `data/api/MuqtarabDtos.kt` map into these via the
 * `toDomain()` extensions below. Mirrors iOS `MuqtarabModels.swift`.
 */

data class MuqAngle(
    val id: String,
    val nameAr: String,
    val nameEn: String?,
    val slug: String,
    val colorHex: String?,
    val iconKey: String?,
    val coverImageUrl: String?,
    val shortDesc: String?,
    val writerSignature: String?,
    val topicCount: Int?,
    val writerName: String?,
    val writerAvatar: String?,
)

/** Compact angle embedded in a topic feed item. */
data class MuqTopicAngle(
    val id: String?,
    val name: String?,
    val slug: String?,
    val colorHex: String?,
    val icon: String?,
)

data class MuqTopic(
    val id: String,
    val angleId: String?,
    val title: String,
    val slug: String,
    val excerpt: String?,
    val rawHtml: String?,
    val plainText: String?,
    val heroImageUrl: String?,
    val keywords: List<String>,
    val publishedAt: String?,
    val viewCount: Int?,
    val angle: MuqTopicAngle?,
    /** كاتب الزاوية — يصل في خلاصات الرئيسية بعد توسعة الخادم 2026-08؛
     *  null مع الخوادم الأقدم فيُعرض اسم الزاوية بدلًا منه. */
    val writer: MuqWriter? = null,
) {
    /** Best HTML for rendering (the editor stores `content.rawHtml`). */
    val html: String get() = rawHtml ?: ""

    /** Fallback text when no HTML is present. */
    val fallbackText: String get() = plainText ?: excerpt ?: ""
}

data class MuqWriter(
    val id: String?,
    val name: String?,
    val avatar: String?,
    val slug: String?,
    val bio: String?,
)

/** Angle header + its writer (from `GET /angles/:slug`). */
data class MuqAngleDetail(
    val angle: MuqAngle,
    val writer: MuqWriter?,
)

/** Topic + its angle + writer (from `GET /angles/:slug/topics/:slug`). */
data class MuqTopicDetail(
    val topic: MuqTopic,
    val angle: MuqAngle,
    val writer: MuqWriter?,
)

// ── Writer profile ───────────────────────────────────────────────────

data class MuqWriterInfo(
    val id: String,
    val name: String,
    val avatar: String?,
    val bio: String?,
)

data class MuqWriterAngle(
    val slug: String,
    val nameAr: String,
    val colorHex: String?,
    val iconKey: String?,
    val coverImageUrl: String?,
)

data class MuqWriterTopic(
    val id: String,
    val title: String,
    val slug: String,
    val excerpt: String?,
    val heroImageUrl: String?,
    val publishedAt: String?,
    val viewCount: Int?,
    val angleSlug: String,
    val angleName: String,
    val colorHex: String?,
)

data class MuqWriterProfile(
    val writer: MuqWriterInfo,
    val angles: List<MuqWriterAngle>,
    val topics: List<MuqWriterTopic>,
)

// ── Mappers ──────────────────────────────────────────────────────────

fun ApiMuqAngle.toDomain(): MuqAngle = MuqAngle(
    id = id,
    nameAr = nameAr,
    nameEn = nameEn,
    slug = slug,
    colorHex = colorHex,
    iconKey = iconKey,
    coverImageUrl = coverImageUrl,
    shortDesc = shortDesc,
    writerSignature = writerSignature,
    topicCount = topicCount,
    writerName = writerName,
    writerAvatar = writerAvatar,
)

fun ApiMuqTopicAngle.toDomain(): MuqTopicAngle = MuqTopicAngle(
    id = id,
    name = name,
    slug = slug,
    colorHex = colorHex,
    icon = icon,
)

fun ApiMuqTopic.toDomain(): MuqTopic = MuqTopic(
    id = id,
    angleId = angleId,
    title = title,
    slug = slug,
    excerpt = excerpt,
    rawHtml = content?.rawHtml,
    plainText = content?.plainText,
    heroImageUrl = heroImageUrl,
    keywords = seoMeta?.keywords.orEmpty(),
    publishedAt = publishedAt,
    viewCount = viewCount,
    angle = angle?.toDomain(),
    writer = writer?.toDomain(),
)

fun ApiMuqWriter.toDomain(): MuqWriter = MuqWriter(
    id = id,
    name = name,
    avatar = avatar,
    slug = slug,
    bio = bio,
)

fun ApiMuqAngleDetail.toDomain(): MuqAngleDetail = MuqAngleDetail(
    angle = MuqAngle(
        id = id,
        nameAr = nameAr,
        nameEn = nameEn,
        slug = slug,
        colorHex = colorHex,
        iconKey = iconKey,
        coverImageUrl = coverImageUrl,
        shortDesc = shortDesc,
        writerSignature = writerSignature,
        topicCount = null,
        writerName = writer?.name,
        writerAvatar = writer?.avatar,
    ),
    writer = writer?.toDomain(),
)

fun ApiMuqWriterInfo.toDomain(): MuqWriterInfo = MuqWriterInfo(
    id = id,
    name = name,
    avatar = avatar,
    bio = bio,
)

fun ApiMuqWriterAngle.toDomain(): MuqWriterAngle = MuqWriterAngle(
    slug = slug,
    nameAr = nameAr,
    colorHex = colorHex,
    iconKey = iconKey,
    coverImageUrl = coverImageUrl,
)

fun ApiMuqWriterTopic.toDomain(): MuqWriterTopic = MuqWriterTopic(
    id = id,
    title = title,
    slug = slug,
    excerpt = excerpt,
    heroImageUrl = heroImageUrl,
    publishedAt = publishedAt,
    viewCount = viewCount,
    angleSlug = angleSlug,
    angleName = angleName,
    colorHex = colorHex,
)

fun ApiMuqWriterProfile.toDomain(): MuqWriterProfile = MuqWriterProfile(
    writer = writer.toDomain(),
    angles = angles.map { it.toDomain() },
    topics = topics.map { it.toDomain() },
)
