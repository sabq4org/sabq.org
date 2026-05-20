package com.sabq.smart.data

import com.sabq.smart.data.api.ApiPassport
import com.sabq.smart.data.api.ApiPassportAIBody
import com.sabq.smart.data.api.ApiPassportAICover
import com.sabq.smart.data.api.ApiPassportAIExplanation
import com.sabq.smart.data.api.ApiPassportAIFootprint
import com.sabq.smart.data.api.ApiPassportAIImage
import com.sabq.smart.data.api.ApiPassportAIPercentages
import com.sabq.smart.data.api.ApiPassportAISEO
import com.sabq.smart.data.api.ApiPassportArticle
import com.sabq.smart.data.api.ApiPassportCategory
import com.sabq.smart.data.api.ApiPassportPeople
import com.sabq.smart.data.api.ApiPassportPerson
import com.sabq.smart.data.api.ApiPassportPublisher
import com.sabq.smart.data.api.ApiPassportSEOEntry
import com.sabq.smart.data.api.ApiPassportSource
import com.sabq.smart.data.api.ApiPassportTimelineEvent
import com.sabq.smart.data.api.ApiPassportTrustBadge
import com.sabq.smart.data.api.ApiPassportTrustLabel

/**
 * Domain projection of [ApiPassport]. Mirrors iOS `APIPassport`
 * (`Services/APIPassport.swift`) 1:1 — field names match so the
 * Passport UI reads the same property paths SwiftUI does.
 */
data class Passport(
    val language: String,
    val viewerIsStaff: Boolean,
    val article: PassportArticle,
    val source: PassportSource,
    val people: PassportPeople,
    val publisher: PassportPublisher?,
    val aiFootprint: PassportAIFootprint,
    val trustBadge: PassportTrustBadge,
    val aiImageGenerations: List<PassportAIImage>,
    val seoHistoryLatest: PassportSEOEntry?,
    val timeline: List<PassportTimelineEvent>,
)

data class PassportArticle(
    val id: String,
    val title: String,
    val subtitle: String?,
    val slug: String,
    val publishedAt: String?,
    val credibilityScore: Double?,
    val verifiedAt: String?,
    val isPublisherNews: Boolean,
    val canonicalUrl: String?,
)

data class PassportSource(
    val channel: String,
    val rawSource: String?,
    val sourceUrl: String?,
)

data class PassportPerson(
    val id: String,
    val firstName: String?,
    val lastName: String?,
    val firstNameEn: String?,
    val lastNameEn: String?,
    val profileImageUrl: String?,
    val role: String?,
) {
    /** Same precedence iOS uses (`APIPassport.Person.displayName`): Arabic
     *  first+last → English first+last → empty. */
    val displayName: String
        get() {
            val ar = listOfNotNull(firstName, lastName).filter { it.isNotBlank() }.joinToString(" ")
            if (ar.isNotEmpty()) return ar
            return listOfNotNull(firstNameEn, lastNameEn).filter { it.isNotBlank() }.joinToString(" ")
        }
}

data class PassportPeople(
    val author: PassportPerson?,
    val submitter: PassportPerson?,
    val reporter: PassportPerson?,
    val reviewer: PassportPerson?,
    val verifier: PassportPerson?,
    val publisherApprover: PassportPerson?,
)

data class PassportPublisher(
    val id: String,
    val agencyName: String,
    val agencyNameEn: String?,
    val logoUrl: String?,
)

data class PassportAIFootprint(
    val body: PassportAIBody,
    val cover: PassportAICover,
    val seo: PassportAISEO,
    val percentages: PassportAIPercentages,
    val explanation: PassportAIExplanation,
)

data class PassportAIBody(
    val tier: String,
    val aiGenerated: Boolean,
    val hasSummary: Boolean,
    val hasBullets: Boolean,
    val aiEditCount: Int,
)

data class PassportAICover(
    val isAiGenerated: Boolean,
    val model: String?,
    val prompt: String?,
)

data class PassportAISEO(
    val status: String?,
    val version: Int?,
    val provider: String?,
    val model: String?,
    val generatedBy: String?,
    val manualOverride: Boolean?,
)

data class PassportAIPercentages(
    val body: Int,
    val cover: Int,
    val seo: Int,
    val total: Int,
)

data class PassportAIExplanation(
    val ar: String,
    val en: String,
    val ur: String,
)

data class PassportTrustBadge(
    val tier: String,
    val labelAr: String,
    val labelEn: String,
    val labelUr: String,
    val credibilityScore: Double?,
)

data class PassportAIImage(
    val id: String,
    val prompt: String?,
    val model: String,
    val imageUrl: String?,
    val thumbnailUrl: String?,
    val aspectRatio: String?,
    val createdAt: String,
)

data class PassportSEOEntry(
    val id: String,
    val version: Int,
    val provider: String,
    val model: String,
    val status: String?,
    val manualOverride: Boolean?,
    val generatedBy: String?,
    val generatedByName: String?,
    val createdAt: String,
)

data class PassportTimelineEvent(
    val id: String,
    val eventType: String,
    val summary: String?,
    val createdAt: String,
    val actor: PassportPerson?,
    val source: String,
    /** Staff-only details — already serialised to a `key: value` map by
     *  the mapper so the UI doesn't need to know about JsonElement. */
    val details: Map<String, String>?,
)

// =========================================================
// Mappers
// =========================================================

fun ApiPassportPerson.toDomain(): PassportPerson = PassportPerson(
    id = id,
    firstName = firstName,
    lastName = lastName,
    firstNameEn = firstNameEn,
    lastNameEn = lastNameEn,
    profileImageUrl = profileImageUrl,
    role = role,
)

fun ApiPassportPeople.toDomain(): PassportPeople = PassportPeople(
    author = author?.toDomain(),
    submitter = submitter?.toDomain(),
    reporter = reporter?.toDomain(),
    reviewer = reviewer?.toDomain(),
    verifier = verifier?.toDomain(),
    publisherApprover = publisherApprover?.toDomain(),
)

fun ApiPassportPublisher.toDomain(): PassportPublisher = PassportPublisher(
    id = id,
    agencyName = agencyName,
    agencyNameEn = agencyNameEn,
    logoUrl = logoUrl,
)

fun ApiPassportAIBody.toDomain() = PassportAIBody(tier, aiGenerated, hasSummary, hasBullets, aiEditCount)
fun ApiPassportAICover.toDomain() = PassportAICover(isAiGenerated, model, prompt)
fun ApiPassportAISEO.toDomain() = PassportAISEO(status, version, provider, model, generatedBy, manualOverride)
fun ApiPassportAIPercentages.toDomain() = PassportAIPercentages(body, cover, seo, total)
fun ApiPassportAIExplanation.toDomain() = PassportAIExplanation(ar, en, ur)

fun ApiPassportAIFootprint.toDomain() = PassportAIFootprint(
    body = body.toDomain(),
    cover = cover.toDomain(),
    seo = seo.toDomain(),
    percentages = percentages.toDomain(),
    explanation = explanation.toDomain(),
)

fun ApiPassportTrustBadge.toDomain() = PassportTrustBadge(
    tier = tier,
    labelAr = label.ar,
    labelEn = label.en,
    labelUr = label.ur,
    credibilityScore = credibilityScore,
)

fun ApiPassportAIImage.toDomain() = PassportAIImage(
    id = id, prompt = prompt, model = model,
    imageUrl = imageUrl, thumbnailUrl = thumbnailUrl,
    aspectRatio = aspectRatio, createdAt = createdAt,
)

fun ApiPassportSEOEntry.toDomain() = PassportSEOEntry(
    id, version, provider, model, status, manualOverride,
    generatedBy, generatedByName, createdAt,
)

fun ApiPassportArticle.toDomain() = PassportArticle(
    id = id, title = title, subtitle = subtitle, slug = slug,
    publishedAt = publishedAt,
    credibilityScore = credibilityScore,
    verifiedAt = verifiedAt,
    isPublisherNews = isPublisherNews,
    canonicalUrl = canonicalUrl,
)

fun ApiPassportSource.toDomain() = PassportSource(channel, rawSource, sourceUrl)

fun ApiPassportTimelineEvent.toDomain(): PassportTimelineEvent {
    // Flatten the staff-only `details` JsonElement into a flat
    // `key: displayString` map so the UI can render it without knowing
    // about kotlinx.serialization. iOS does the same flattening at
    // render time via `JSONValue.displayString`.
    val detailsMap: Map<String, String>? = details
        ?.let { runCatching { it as? kotlinx.serialization.json.JsonObject }.getOrNull() }
        ?.mapValues { (_, v) -> displayValue(v) }
    return PassportTimelineEvent(
        id = id,
        eventType = eventType,
        summary = summary,
        createdAt = createdAt,
        actor = actor?.toDomain(),
        source = source,
        details = detailsMap,
    )
}

private fun displayValue(el: kotlinx.serialization.json.JsonElement): String {
    return when (el) {
        is kotlinx.serialization.json.JsonNull -> "—"
        is kotlinx.serialization.json.JsonPrimitive -> el.content
        is kotlinx.serialization.json.JsonArray -> el.joinToString(", ", "[", "]") { displayValue(it) }
        is kotlinx.serialization.json.JsonObject -> el.entries.sortedBy { it.key }
            .joinToString(", ", "{", "}") { "${it.key}: ${displayValue(it.value)}" }
    }
}

fun ApiPassport.toDomain(): Passport = Passport(
    language = language,
    viewerIsStaff = viewer.isStaff,
    article = article.toDomain(),
    source = source.toDomain(),
    people = people.toDomain(),
    publisher = publisher?.toDomain(),
    aiFootprint = aiFootprint.toDomain(),
    trustBadge = trustBadge.toDomain(),
    aiImageGenerations = aiImageGenerations.map { it.toDomain() },
    seoHistoryLatest = seoHistoryLatest?.toDomain(),
    timeline = timeline.map { it.toDomain() },
)
