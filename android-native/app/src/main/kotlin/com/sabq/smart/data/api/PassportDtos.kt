package com.sabq.smart.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNames

/**
 * Kotlinx-serializable mirror of iOS `APIPassport`
 * (`Services/APIPassport.swift`). Decodes the JSON returned by
 * `GET /api/articles/<slug>/passport`. Staff-only fields (prompts,
 * audit details) come back null for public viewers — that's expected,
 * not an error. We only model the subset of the response that the UI
 * actually renders today.
 */
@Serializable
data class ApiPassport(
    val language: String = "ar",
    val viewer: ApiPassportViewer = ApiPassportViewer(),
    val article: ApiPassportArticle = ApiPassportArticle(),
    val source: ApiPassportSource = ApiPassportSource(),
    val people: ApiPassportPeople = ApiPassportPeople(),
    val publisher: ApiPassportPublisher? = null,
    val aiFootprint: ApiPassportAIFootprint = ApiPassportAIFootprint(),
    val trustBadge: ApiPassportTrustBadge = ApiPassportTrustBadge(),
    val aiImageGenerations: List<ApiPassportAIImage> = emptyList(),
    val seoHistoryLatest: ApiPassportSEOEntry? = null,
    val timeline: List<ApiPassportTimelineEvent> = emptyList(),
)

@Serializable
data class ApiPassportViewer(
    val isStaff: Boolean = false,
)

@Serializable
data class ApiPassportArticle(
    val id: String = "",
    val title: String = "",
    val subtitle: String? = null,
    val slug: String = "",
    val publishedAt: String? = null,
    val category: ApiPassportCategory? = null,
    val credibilityScore: Double? = null,
    val verifiedAt: String? = null,
    val isPublisherNews: Boolean = false,
    val canonicalUrl: String? = null,
)

@Serializable
data class ApiPassportCategory(
    val id: String = "",
    val name: String = "",
    val slug: String = "",
)

@Serializable
data class ApiPassportSource(
    /** "manual" | "email" | "whatsapp" | "publisher" | "external" */
    val channel: String = "manual",
    val rawSource: String? = null,
    val sourceUrl: String? = null,
)

@Serializable
data class ApiPassportPerson(
    val id: String = "",
    val firstName: String? = null,
    val lastName: String? = null,
    val firstNameEn: String? = null,
    val lastNameEn: String? = null,
    val profileImageUrl: String? = null,
    val role: String? = null,
)

@Serializable
data class ApiPassportPeople(
    val author: ApiPassportPerson? = null,
    val submitter: ApiPassportPerson? = null,
    val reporter: ApiPassportPerson? = null,
    val reviewer: ApiPassportPerson? = null,
    val verifier: ApiPassportPerson? = null,
    val publisherApprover: ApiPassportPerson? = null,
)

@Serializable
data class ApiPassportPublisher(
    val id: String = "",
    val agencyName: String = "",
    val agencyNameEn: String? = null,
    val logoUrl: String? = null,
)

@Serializable
data class ApiPassportAIFootprint(
    val body: ApiPassportAIBody = ApiPassportAIBody(),
    val cover: ApiPassportAICover = ApiPassportAICover(),
    val seo: ApiPassportAISEO = ApiPassportAISEO(),
    val percentages: ApiPassportAIPercentages = ApiPassportAIPercentages(),
    val explanation: ApiPassportAIExplanation = ApiPassportAIExplanation(),
)

@Serializable
data class ApiPassportAIBody(
    /** "human" | "assisted" | "ai_drafted" */
    val tier: String = "human",
    val aiGenerated: Boolean = false,
    val hasSummary: Boolean = false,
    val hasBullets: Boolean = false,
    val aiEditCount: Int = 0,
)

@Serializable
data class ApiPassportAICover(
    val isAiGenerated: Boolean = false,
    val model: String? = null,
    /** Staff-only — null for public viewers. */
    val prompt: String? = null,
)

@Serializable
data class ApiPassportAISEO(
    val status: String? = null,
    val version: Int? = null,
    val provider: String? = null,
    val model: String? = null,
    val generatedBy: String? = null,
    val manualOverride: Boolean? = null,
)

/** 0 / 50 / 100 per surface; `total` is the weighted average. */
@Serializable
data class ApiPassportAIPercentages(
    val body: Int = 0,
    val cover: Int = 0,
    val seo: Int = 0,
    val total: Int = 0,
)

@Serializable
data class ApiPassportAIExplanation(
    val ar: String = "",
    val en: String = "",
    val ur: String = "",
)

@Serializable
data class ApiPassportTrustBadge(
    /** "human_edited" | "ai_assisted" | "ai_drafted_human_reviewed" */
    val tier: String = "human_edited",
    val label: ApiPassportTrustLabel = ApiPassportTrustLabel(),
    val credibilityScore: Double? = null,
)

@Serializable
data class ApiPassportTrustLabel(
    val ar: String = "",
    val en: String = "",
    val ur: String = "",
)

@Serializable
data class ApiPassportAIImage(
    val id: String = "",
    /** Staff-only — null for public viewers. */
    val prompt: String? = null,
    val model: String = "",
    val imageUrl: String? = null,
    val thumbnailUrl: String? = null,
    val aspectRatio: String? = null,
    val enableSearchGrounding: Boolean? = null,
    val createdAt: String = "",
)

@Serializable
data class ApiPassportSEOEntry(
    val id: String = "",
    val version: Int = 0,
    val provider: String = "",
    val model: String = "",
    val status: String? = null,
    val manualOverride: Boolean? = null,
    val generatedBy: String? = null,
    val generatedByName: String? = null,
    val createdAt: String = "",
)

@Serializable
data class ApiPassportTimelineEvent(
    val id: String = "",
    /** "created"/"submitted"/"approved"/"published"/"updated"/"verified"/"unpublish" */
    val eventType: String = "",
    val summary: String? = null,
    val createdAt: String = "",
    val actor: ApiPassportPerson? = null,
    /** "article_events" | "audit_log" | "synthetic" */
    val source: String = "",
    /** Sensitive change details — populated only for staff viewers.
     *  Kept as raw [JsonElement] because the shape varies per event. */
    val details: JsonElement? = null,
)
