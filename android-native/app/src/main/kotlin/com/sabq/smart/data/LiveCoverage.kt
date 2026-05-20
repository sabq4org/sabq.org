package com.sabq.smart.data

import com.sabq.smart.data.api.ApiLiveCountry
import com.sabq.smart.data.api.ApiLiveEvent
import com.sabq.smart.data.api.ApiLiveResponse
import com.sabq.smart.data.api.ApiLiveStats

/**
 * Domain model for the LiveCoverage screen — ports iOS
 * `APILiveResponse` + family (APIModels.swift line 1394+). Distinct
 * from the MomentByMoment feed: this one is the multi-country curated
 * timeline (Gulf attacks etc.) with stats + country filter.
 */
data class LiveCoverage(
    val titleAr: String,
    val isLive: Boolean,
    val countries: List<LiveCountry>,
    val events: List<LiveEvent>,
    val stats: LiveStats?,
    val total: Int,
)

data class LiveCountry(
    val key: String,
    val nameAr: String,
    val count: Int,
)

data class LiveStats(
    val totalEvents: Int,
    val intercepted: Int,
    val injuries: Int,
    val martyrdom: Int,
    val lastUpdated: String?,
)

data class LiveEvent(
    val id: String,
    val content: String,
    val country: String,
    val countryNameAr: String,
    val eventType: String,
    val eventTypeLabelAr: String,
    val severity: String,
    val priority: String,
    val sourceName: String?,
    val isPinned: Boolean,
    val isUpdate: Boolean,
    val publishedAt: String,
)

private val COUNTRY_NAME_AR = mapOf(
    "saudi_arabia" to "السعودية",
    "uae" to "الإمارات",
    "bahrain" to "البحرين",
    "kuwait" to "الكويت",
    "qatar" to "قطر",
    "oman" to "عُمان",
    "yemen" to "اليمن",
)

private val EVENT_TYPE_LABELS_AR = mapOf(
    "drone_intercepted" to "صد مسيّرة",
    "ballistic_intercepted" to "صد صاروخ باليستي",
    "cruise_intercepted" to "صد صاروخ كروز",
    "ballistic_and_drone" to "صد صاروخ ومسيّرة",
    "debris_fallen" to "سقوط شظايا",
    "no_damage" to "لا أضرار",
    "injuries" to "إصابات",
    "martyrdom" to "استشهاد",
    "official_statement" to "بيان رسمي",
    "official_comment" to "تصريح مسؤول",
    "military_action" to "تحرك عسكري",
    "international_condemnation" to "إدانة دولية",
)

private val EVENT_TYPE_SEVERITY = mapOf(
    "drone_intercepted" to "success",
    "ballistic_intercepted" to "success",
    "cruise_intercepted" to "success",
    "ballistic_and_drone" to "success",
    "debris_fallen" to "warning",
    "no_damage" to "info",
    "injuries" to "danger",
    "martyrdom" to "critical",
    "official_statement" to "info",
    "official_comment" to "info",
    "military_action" to "danger",
    "international_condemnation" to "info",
)

fun ApiLiveEvent.toDomain(fallbackCountry: String? = null, fallbackCountryName: String? = null): LiveEvent {
    val resolvedCountry = country.ifEmpty { fallbackCountry.orEmpty() }
    val resolvedCountryName = countryNameAr
        ?.takeIf { it.isNotBlank() }
        ?: fallbackCountryName
        ?: COUNTRY_NAME_AR[resolvedCountry]
        ?: resolvedCountry
    val type = eventType.orEmpty()
    return LiveEvent(
        id = id,
        content = content,
        country = resolvedCountry,
        countryNameAr = resolvedCountryName,
        eventType = type,
        eventTypeLabelAr = eventTypeLabelAr?.takeIf { it.isNotBlank() }
            ?: EVENT_TYPE_LABELS_AR[type]
            ?: type,
        severity = severity?.takeIf { it.isNotBlank() }
            ?: EVENT_TYPE_SEVERITY[type]
            ?: "info",
        priority = priority?.takeIf { it.isNotBlank() } ?: "normal",
        sourceName = sourceName?.takeIf { it.isNotBlank() },
        isPinned = isPinned,
        isUpdate = isUpdate,
        publishedAt = publishedAt,
    )
}

fun ApiLiveCountry.toDomain(): LiveCountry = LiveCountry(
    key = key,
    nameAr = nameAr?.takeIf { it.isNotBlank() }
        ?: COUNTRY_NAME_AR[key]
        ?: key,
    count = count,
)

fun ApiLiveStats.toDomain(): LiveStats = LiveStats(
    totalEvents = totalEvents ?: 0,
    intercepted = intercepted ?: 0,
    injuries = injuries ?: 0,
    martyrdom = martyrdom ?: 0,
    lastUpdated = lastUpdated,
)

fun ApiLiveResponse.toDomain(): LiveCoverage {
    val derivedEvents = if (events.isNotEmpty()) {
        events.map { it.toDomain() }
    } else {
        coverages
            .flatMap { cov ->
                cov.events.map { event ->
                    event.toDomain(
                        fallbackCountry = cov.country,
                        fallbackCountryName = COUNTRY_NAME_AR[cov.country],
                    )
                }
            }
            .sortedByDescending { it.publishedAt }
    }
    val derivedCountries = if (countries.isNotEmpty()) {
        countries.map { it.toDomain() }
    } else {
        coverages.map { LiveCountry(it.country, COUNTRY_NAME_AR[it.country] ?: it.country, it.count) }
    }
    val hasCoverages = coverages.isNotEmpty()
    return LiveCoverage(
        titleAr = titleAr?.takeIf { it.isNotBlank() }
            ?: "البث الحي — الاعتداءات على دول الخليج",
        isLive = isLive ?: hasCoverages,
        countries = derivedCountries,
        events = derivedEvents,
        stats = stats?.toDomain(),
        total = total ?: coverages.sumOf { it.count },
    )
}

fun countryFlag(key: String): String = when (key) {
    "saudi_arabia" -> "🇸🇦"
    "uae" -> "🇦🇪"
    "bahrain" -> "🇧🇭"
    "kuwait" -> "🇰🇼"
    "qatar" -> "🇶🇦"
    "oman" -> "🇴🇲"
    "yemen" -> "🇾🇪"
    else -> "🏳"
}
