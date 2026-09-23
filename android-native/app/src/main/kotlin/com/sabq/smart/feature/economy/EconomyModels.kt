package com.sabq.smart.feature.economy

import java.time.Instant
import java.time.OffsetDateTime
import java.util.Locale
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.roundToLong
import kotlinx.serialization.Serializable

// «الاقتصاد الحي» — نماذج نقاط النهاية العامة (نقل الويب #1493–#1506) ونظير
// iOS `EconomyModels.swift`. كل «لا بيانات» يأتي null فيُخفى السطح بصمت.

@Serializable
data class EconomySnapshot(
    val updatedAt: String? = null,
    val indicators: List<EconomyIndicator> = emptyList(),
    val fx: List<EconomyFxRate> = emptyList(),
    val fxAsOf: String? = null,
    val weekly: EconomyWeeklySummary? = null,
    val moneySupply: EconomyMoneySupply? = null,
    val monthly: EconomyMonthlySummary? = null,
    val samaNews: List<EconomySamaNews> = emptyList(),
    val decision: EconomyDecision? = null,
) {
    /** آخر «بيان» صدر من ساما: أكبر تاريخ بين asOf المؤشرات وfxAsOf ونهاية أسبوع نقاط البيع. */
    val latestAsOf: String?
        get() = (indicators.mapNotNull { it.asOf } + listOfNotNull(fxAsOf, weekly?.periodEnd))
            .filter { it.isNotEmpty() }.maxOrNull()
}

@Serializable
data class EconomyIndicator(
    val key: String = "",
    val titleAr: String = "",
    val shortAr: String = "",
    val unit: String = "",
    val cadence: String = "",
    val value: Double = 0.0,
    val valueText: String = "",
    val asOf: String? = null,
    val quarter: String? = null,
    val year: String? = null,
    val previousValue: Double? = null,
) {
    companion object {
        /** ترتيب الشريط في الويب: الأسرع تغيرًا أولًا. */
        val order = listOf("inflation", "m3Growth", "gdp", "repo", "reverseRepo")
    }
}

@Serializable
data class EconomyFxRate(
    val code: String = "",
    val nameAr: String = "",
    val rate: Double = 0.0,
    val prevRate: Double? = null,
    val date: String = "",
    val prevDate: String? = null,
    val changePct: Double? = null,
    val isGcc: Boolean = false,
) {
    companion object {
        val tickerCodes = listOf("USD", "EUR", "GBP", "EGP", "INR")
    }
}

@Serializable
data class EconomyStoryCard(
    val key: String = "",
    val headline: String = "",
    val cardTitle: String = "",
    val figure: String = "",
    val detailAr: String = "",
    val tone: String = "neutral",
    val weight: Double? = null,
)

@Serializable
data class EconomyKpi(
    val key: String = "",
    val labelAr: String = "",
    val value: Double = 0.0,
    val unitAr: String = "",
    val changePct: Double? = null,
    val noteAr: String? = null,
    val series: List<Double> = emptyList(),
)

@Serializable
data class EconomySectorSummary(
    val en: String = "",
    val ar: String = "",
    val value: Double = 0.0,
    val share: Double = 0.0,
    val changePct: Double = 0.0,
)

@Serializable
data class EconomyWeeklySummary(
    val weekLabelAr: String = "",
    val periodEnd: String = "",
    val totalValue: Double = 0.0,
    val totalChangePct: Double = 0.0,
    val headline: String = "",
    val stories: List<EconomyStoryCard> = emptyList(),
    val kpis: List<EconomyKpi> = emptyList(),
    val topSectors: List<EconomySectorSummary> = emptyList(),
    val totalCount: Double = 0.0,
    val ingestedAt: String? = null,
)

@Serializable
data class EconomyMoneySupply(
    val asOf: String = "",
    val m3Billion: Double? = null,
    val m3WeeklyChangePct: Double? = null,
    val m3PeriodChangePct: Double? = null,
)

@Serializable
data class EconomySeriesPoint(val period: String = "", val value: Double = 0.0)

@Serializable
data class EconomyMonthlyCard(
    val key: String = "",
    val cardTitle: String = "",
    val headline: String = "",
    val figure: String = "",
    val detailAr: String = "",
    val tone: String = "neutral",
    val weight: Double? = null,
    val unit: String? = null,
    val seriesLabelAr: String? = null,
    val series: List<EconomySeriesPoint> = emptyList(),
)

@Serializable
data class EconomyMonthlySummary(
    val month: String = "",
    val monthLabelAr: String = "",
    val headline: String = "",
    val cards: List<EconomyMonthlyCard> = emptyList(),
    val ingestedAt: String? = null,
)

@Serializable
data class EconomySamaNews(
    val id: Int? = null,
    val url: String = "",
    val title: String = "",
    val summary: String? = null,
    val publishedAt: String? = null,
) {
    val stableId: String get() = id?.toString() ?: url
}

@Serializable
data class EconomyDecision(val isDecisionNight: Boolean = false, val nextDecisionDate: String? = null)

// تقرير الأسبوع الكامل (`/api/economy/weekly-story`)
@Serializable
data class EconomyLead(val headline: String = "", val subheadline: String? = null, val intro: String? = null)

@Serializable
data class EconomySector(
    val en: String = "",
    val ar: String = "",
    val value: Double = 0.0,
    val count: Double? = null,
    val changePct: Double? = null,
    val countChangePct: Double? = null,
    val share: Double? = null,
    val isGroup: Boolean = false,
    val group: String? = null,
    val series: List<Double> = emptyList(),
)

@Serializable
data class EconomyCity(
    val en: String = "",
    val ar: String = "",
    val value: Double = 0.0,
    val count: Double? = null,
    val changePct: Double? = null,
    val share: Double? = null,
    val avgTicket: Double? = null,
    val series: List<Double> = emptyList(),
)

@Serializable
data class EconomyCityShare(val ar: String = "", val share: Double = 0.0)

@Serializable
data class EconomyMover(val ar: String = "", val changePct: Double = 0.0)

@Serializable
data class EconomyTotals(
    val value: Double = 0.0,
    val count: Double = 0.0,
    val series: List<Double> = emptyList(),
    val countSeries: List<Double> = emptyList(),
)

@Serializable
data class EconomyWeeklyStory(
    val weekLabelAr: String = "",
    val weeks: List<String> = emptyList(),
    val ingestedAt: String? = null,
    val periodStart: String? = null,
    val periodEnd: String? = null,
    val kpis: List<EconomyKpi> = emptyList(),
    val stories: List<EconomyStoryCard> = emptyList(),
    val lead: EconomyLead = EconomyLead(),
    val sectors: List<EconomySector> = emptyList(),
    val cities: List<EconomyCity> = emptyList(),
    val citiesShareTop: List<EconomyCityShare> = emptyList(),
    val otherCitiesShare: Double = 0.0,
    val risers: List<EconomyMover> = emptyList(),
    val fallers: List<EconomyMover> = emptyList(),
    val totals: EconomyTotals = EconomyTotals(),
)

// النشرة الشهرية الكاملة (`/api/economy/monthly-story`)
@Serializable
data class EconomyTracker(
    val key: String = "",
    val titleAr: String = "",
    val unit: String = "",
    val series: List<EconomySeriesPoint> = emptyList(),
)

@Serializable
data class EconomyMonthlyStory(
    val month: String = "",
    val monthLabelAr: String = "",
    val cards: List<EconomyMonthlyCard> = emptyList(),
    val lead: EconomyLead = EconomyLead(),
    val trackers: List<EconomyTracker> = emptyList(),
    val ingestedAt: String? = null,
)

/**
 * المنسّقات — نقل `client/src/components/economy/format.ts` حرفيًا (ونظير iOS
 * `EconomyFormat`). أرقام غربية؛ `fmtPct` تعيد القيمة المطلقة والاتجاه يحمله السهم.
 */
object EconomyFormat {
    const val FRESH_HOURS = 48.0
    val monthsAr = listOf("يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
        "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر")
    val monthsShort = listOf("ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس")

    private fun group(v: Double, maxDigits: Int, minDigits: Int = 0): String {
        val f = java.text.NumberFormat.getNumberInstance(Locale.US)
        f.maximumFractionDigits = maxDigits
        f.minimumFractionDigits = minDigits
        f.isGroupingUsed = true
        return f.format(v)
    }

    /** `Number(n.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d })` — يسقط الأصفار الزائدة. */
    fun trimNum(v: Double, d: Int): String {
        if (!v.isFinite()) return "—"
        val p = 10.0.pow(d)
        val rounded = (v * p).roundToLong() / p
        return group(rounded, d)
    }

    /** ≥ مليار → «x مليار» (منزلتان)؛ ≥ مليون → «x مليون» (منزلة)؛ وإلا عدد صحيح مجمّع. */
    fun fmtSar(riyals: Double, digits: Int = 2): String {
        if (!riyals.isFinite()) return "—"
        val a = abs(riyals)
        if (a >= 1e9) return "${trimNum(riyals / 1e9, digits)} مليار"
        if (a >= 1e6) return "${trimNum(riyals / 1e6, 1)} مليون"
        return trimNum(Math.rint(riyals), 0)
    }

    /** ≥ مليون → «x مليون» (منزلة)؛ ≥ ألف → «x ألف»؛ وإلا عدد صحيح مجمّع. */
    fun fmtCount(n: Double): String {
        if (!n.isFinite()) return "—"
        val a = abs(n)
        if (a >= 1e6) return "${trimNum(n / 1e6, 1)} مليون"
        if (a >= 1e3) return "${trimNum(n / 1e3, 0)} ألف"
        return trimNum(Math.rint(n), 0)
    }

    /** «—» عند الغياب؛ وإلا القيمة المطلقة + «%». */
    fun fmtPct(p: Double?, d: Int = 1): String {
        if (p == null || !p.isFinite()) return "—"
        return "${trimNum(abs(p), d)}%"
    }

    /** سعر الصرف: ≥100 → منزلتان؛ ≥1 → أربع؛ وإلا خمس. */
    fun fmtRate(r: Double): String {
        if (!r.isFinite()) return "—"
        if (r >= 100) return trimNum(r, 2)
        if (r >= 1) return group(r, 4, 2)
        return group(r, 5, 2)
    }

    /** "2026-08-28" → «28 أغسطس 2026» (أو بلا سنة). */
    fun fmtDateAr(iso: String?, withYear: Boolean = true): String {
        val (y, m, d) = ymd(iso) ?: return "—"
        val month = monthsAr[m - 1]
        return if (withYear) "$d $month $y" else "$d $month"
    }

    /** "2026-08-28" → «أغسطس 2026». */
    fun fmtMonthAr(iso: String?): String {
        val (y, m, _) = ymd(iso) ?: return "—"
        return "${monthsAr[m - 1]} $y"
    }

    /** "2026-07" أو "2026-07-31" → «يول»؛ و"2026-Q2" → «ر2 26» كما في الويب. */
    fun fmtMonthShort(period: String): String {
        val comps = period.split("-")
        if (comps.size < 2) return period
        val second = comps[1].uppercase()
        if (second.startsWith("Q") && comps[0].length == 4) {
            val q = second.drop(1).toIntOrNull() ?: return period
            return "ر$q ${comps[0].takeLast(2)}"
        }
        val m = second.toIntOrNull() ?: return period
        if (m !in 1..12) return period
        return monthsShort[m - 1]
    }

    private fun ymd(iso: String?): Triple<Int, Int, Int>? {
        if (iso == null || iso.length < 10) return null
        val head = iso.take(10).split("-")
        if (head.size != 3) return null
        val y = head[0].toIntOrNull() ?: return null
        val m = head[1].toIntOrNull() ?: return null
        val d = head[2].toIntOrNull() ?: return null
        if (m !in 1..12 || d !in 1..31) return null
        return Triple(y, m, d)
    }

    fun parseInstant(iso: String?): Instant? {
        if (iso.isNullOrBlank()) return null
        return runCatching { OffsetDateTime.parse(iso).toInstant() }
            .recoverCatching { Instant.parse(iso) }
            .getOrNull()
    }

    /** شارة «جديد» خلال 48 ساعة من إدخال التقرير عندنا (`ingestedAt`) لا من تاريخ ساما. */
    fun isFresh(iso: String?, hours: Double = FRESH_HOURS, now: Instant = Instant.now()): Boolean {
        val at = parseInstant(iso) ?: return false
        return (now.toEpochMilli() - at.toEpochMilli()) < hours * 3600_000
    }

    /** سطر المؤشر تحت القيمة: قرار → «منذ {تاريخ}»؛ ربعي → «الربع n · سنة»؛ شهري → «شهر سنة». */
    fun indicatorSub(i: EconomyIndicator): String = when (i.cadence) {
        "decision" -> "منذ ${fmtDateAr(i.asOf, withYear = false)}"
        "quarterly" -> if (!i.quarter.isNullOrEmpty() && !i.year.isNullOrEmpty()) "الربع ${i.quarter} · ${i.year}" else fmtMonthAr(i.asOf)
        else -> fmtMonthAr(i.asOf)
    }

    /** قيمة بحسب وحدة بطاقة النشرة الشهرية. */
    fun fmtUnit(v: Double, unit: String?): String = when (unit) {
        "sar" -> "${fmtSar(v)} ريال"
        "count" -> if (v < 1e6) trimNum(Math.rint(v), 0) else fmtCount(v)
        "pct" -> "${trimNum(v, 1)}%"
        else -> trimNum(v, 1)
    }

    enum class HomeMode { Monthly, Weekly, Hidden }

    /** نشرة شهرية جديدة (< 48 ساعة، ≥ 3 بطاقات) تسبق الأسبوعي؛ وبلا أسبوعي بقطاعات يختفي البلوك. */
    fun homeMode(s: EconomySnapshot?, now: Instant = Instant.now()): HomeMode {
        if (s == null) return HomeMode.Hidden
        val m = s.monthly
        if (m != null && isFresh(m.ingestedAt, now = now) && m.cards.size >= 3) return HomeMode.Monthly
        val w = s.weekly
        if (w != null && w.topSectors.isNotEmpty()) return HomeMode.Weekly
        return HomeMode.Hidden
    }
}
