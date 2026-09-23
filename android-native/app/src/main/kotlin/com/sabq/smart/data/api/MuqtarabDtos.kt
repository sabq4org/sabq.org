package com.sabq.smart.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNames

/**
 * DTOs for the «مُقترب» (Muqtarab) analytical-angles surface. Paths:
 * `/api/muqtarab/…` (public namespace, NO auth) — same contract iOS
 * consumes in `Services/MuqtarabModels.swift`.
 *
 * مُقترب = analytical angles owned by individual writers, each
 * publishing topics after editorial review. The reader app only reads
 * the public routes; the writer dashboard (`my-angle`) is out of scope.
 */

/**
 * An analytical angle. Used in the angle list and the angle-page hero.
 * `withStats=true` adds `topicCount`/`writerName`/`writerAvatar`.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMuqAngle(
    val id: String = "",
    @JsonNames("nameAr", "name_ar")
    val nameAr: String = "",
    @JsonNames("nameEn", "name_en")
    val nameEn: String? = null,
    val slug: String = "",
    @JsonNames("colorHex", "color_hex", "themeColor", "theme_color")
    val colorHex: String? = null,
    @JsonNames("iconKey", "icon_key", "icon")
    val iconKey: String? = null,
    @JsonNames("coverImageUrl", "cover_image_url", "coverImage", "cover_image")
    val coverImageUrl: String? = null,
    @JsonNames("shortDesc", "short_desc", "description")
    val shortDesc: String? = null,
    @JsonNames("writerSignature", "writer_signature")
    val writerSignature: String? = null,
    @JsonNames("sortOrder", "sort_order")
    val sortOrder: Int? = null,
    @JsonNames("isActive", "is_active")
    val isActive: Boolean? = null,
    @JsonNames("topicCount", "topic_count", "topicsCount", "topics_count")
    val topicCount: Int? = null,
    @JsonNames("writerName", "writer_name")
    val writerName: String? = null,
    @JsonNames("writerAvatar", "writer_avatar")
    val writerAvatar: String? = null,
)

/**
 * Compact angle attached to a topic in feed responses. The server
 * sends two shapes: `topics/featured` → `nameAr`/`iconKey`,
 * `latest-topics` → `name`/`icon`. `@JsonNames` unifies both.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMuqTopicAngle(
    val id: String? = null,
    @JsonNames("nameAr", "name_ar", "name")
    val name: String? = null,
    val slug: String? = null,
    @JsonNames("colorHex", "color_hex", "themeColor")
    val colorHex: String? = null,
    @JsonNames("iconKey", "icon_key", "icon")
    val icon: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMuqTopicContent(
    @JsonNames("rawHtml", "raw_html", "html")
    val rawHtml: String? = null,
    @JsonNames("plainText", "plain_text", "text")
    val plainText: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMuqSeoMeta(
    val keywords: List<String> = emptyList(),
)

/** A topic published inside an angle. */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMuqTopic(
    val id: String = "",
    @JsonNames("angleId", "angle_id")
    val angleId: String? = null,
    val title: String = "",
    val slug: String = "",
    val excerpt: String? = null,
    val content: ApiMuqTopicContent? = null,
    @JsonNames("heroImageUrl", "hero_image_url", "coverImageUrl", "cover_image_url")
    val heroImageUrl: String? = null,
    @JsonNames("seoMeta", "seo_meta")
    val seoMeta: ApiMuqSeoMeta? = null,
    @JsonNames("publishedAt", "published_at")
    val publishedAt: String? = null,
    @JsonNames("viewCount", "view_count", "viewsCount", "views_count")
    val viewCount: Int? = null,
    /** Present in feed responses (`featured`/`latest-topics`), absent
     *  in the per-angle topic list. */
    val angle: ApiMuqTopicAngle? = null,
    /** كاتب الزاوية — أرفقه الخادم في خلاصات الرئيسية بتوسعة 2026-08. */
    val writer: ApiMuqWriter? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMuqWriter(
    val id: String? = null,
    val name: String? = null,
    val avatar: String? = null,
    val slug: String? = null,
    val bio: String? = null,
)

// ── Response envelopes ───────────────────────────────────────────────

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMuqTopicsResponse(
    val topics: List<ApiMuqTopic> = emptyList(),
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMuqTopicDetailResponse(
    val topic: ApiMuqTopic,
    val angle: ApiMuqAngle,
    val writer: ApiMuqWriter? = null,
)

/**
 * `GET /api/muqtarab/angles/:slug` returns the angle fields at the top
 * level with `writer` nested — so this DTO flattens the angle fields
 * and adds `writer`. Mirrors iOS `MuqAngleDetail`'s custom decoder.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMuqAngleDetail(
    val id: String = "",
    @JsonNames("nameAr", "name_ar")
    val nameAr: String = "",
    @JsonNames("nameEn", "name_en")
    val nameEn: String? = null,
    val slug: String = "",
    @JsonNames("colorHex", "color_hex", "themeColor", "theme_color")
    val colorHex: String? = null,
    @JsonNames("iconKey", "icon_key", "icon")
    val iconKey: String? = null,
    @JsonNames("coverImageUrl", "cover_image_url", "coverImage", "cover_image")
    val coverImageUrl: String? = null,
    @JsonNames("shortDesc", "short_desc", "description")
    val shortDesc: String? = null,
    @JsonNames("writerSignature", "writer_signature")
    val writerSignature: String? = null,
    val writer: ApiMuqWriter? = null,
)

// ── Writer profile (`GET /api/muqtarab/writers/:id`) ─────────────────

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMuqWriterInfo(
    val id: String = "",
    val name: String = "",
    val avatar: String? = null,
    val bio: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMuqWriterAngle(
    val slug: String = "",
    @JsonNames("nameAr", "name_ar")
    val nameAr: String = "",
    @JsonNames("colorHex", "color_hex", "themeColor")
    val colorHex: String? = null,
    @JsonNames("iconKey", "icon_key", "icon")
    val iconKey: String? = null,
    @JsonNames("coverImageUrl", "cover_image_url")
    val coverImageUrl: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMuqWriterTopic(
    val id: String = "",
    val title: String = "",
    val slug: String = "",
    val excerpt: String? = null,
    @JsonNames("heroImageUrl", "hero_image_url")
    val heroImageUrl: String? = null,
    @JsonNames("publishedAt", "published_at")
    val publishedAt: String? = null,
    @JsonNames("viewCount", "view_count", "viewsCount", "views_count")
    val viewCount: Int? = null,
    @JsonNames("angleSlug", "angle_slug")
    val angleSlug: String = "",
    @JsonNames("angleName", "angle_name")
    val angleName: String = "",
    @JsonNames("colorHex", "color_hex", "themeColor")
    val colorHex: String? = null,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMuqWriterProfile(
    val writer: ApiMuqWriterInfo,
    val angles: List<ApiMuqWriterAngle> = emptyList(),
    val topics: List<ApiMuqWriterTopic> = emptyList(),
)
