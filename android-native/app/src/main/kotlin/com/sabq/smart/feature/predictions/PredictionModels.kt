package com.sabq.smart.feature.predictions

import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

// نماذج «المنصة المركزية للتوقّعات» — مرآة عقود الخادم في shared/predictions.ts
// عبر /api/v1/predictions/* (Bearer تلقائي من AuthInterceptor). نظام موحّد لكل
// البطولات ما عدا مونديال 2026 (يبقى على feature/worldcup حتى نهايته).
// كل الحقول بقيم افتراضية — عرف التطبيق لتحمّل المفاتيح الغائبة.

@Serializable
data class PredCompetitionSummary(
    val id: String = "",
    val slug: String = "",
    val nameAr: String = "",
    val seasonKey: String = "",
    val status: String = "",
    val openContests: Int = 0,
    val myPoints: Int? = null,
)

@Serializable
data class PredCompetitionsResponse(
    val competitions: List<PredCompetitionSummary> = emptyList(),
)

@Serializable
data class PredTeamMeta(val name: String? = null, val logo: String? = null)

@Serializable
data class PredContestMeta(
    val home: PredTeamMeta? = null,
    val away: PredTeamMeta? = null,
    val round: String? = null,
    val venue: String? = null,
)

/** حمولة توقّع نتيجة مباراة — اختيارية الحقول لتمرير حمولات الأنواع الأخرى. */
@Serializable
data class PredScorePayload(val predHome: Int? = null, val predAway: Int? = null)

@Serializable
data class PredMyEntry(val id: String = "", val payload: PredScorePayload? = null)

@Serializable
data class PredScoreResult(val finalHome: Int? = null, val finalAway: Int? = null)

@Serializable
data class PredContest(
    val id: String = "",
    val contestType: String = "",
    val status: String = "", // open | locked | ready | settled | void
    val locksAt: String = "",
    val settledAt: String? = null,
    val metadata: PredContestMeta? = null,
    val result: PredScoreResult? = null,
    /** عدد المشاركين النشطين — رقم فقط، بلا أسماء (الأسماء في المتصدرين). */
    val entriesCount: Int = 0,
    val myEntry: PredMyEntry? = null,
) {
    val isMatchScore: Boolean get() = contestType == "match_score"
}

@Serializable
data class PredCompetitionRow(
    val id: String = "",
    val slug: String = "",
    val nameAr: String = "",
    val seasonKey: String = "",
)

@Serializable
data class PredCompetitionDetailResponse(
    val competition: PredCompetitionRow = PredCompetitionRow(),
    val contests: List<PredContest> = emptyList(),
)

@Serializable
data class PredRuleTiers(
    val exact: Double? = null,
    val signedMargin: Double? = null,
    val outcome: Double? = null,
)

@Serializable
data class PredRuleParams(
    val basePool: Int? = null,
    val tiers: PredRuleTiers? = null,
    val winCriterion: String? = null,
)

@Serializable
data class PredRule(
    val strategyKey: String = "",
    val version: Int = 0,
    val params: PredRuleParams? = null,
) {
    /** نص القاعدة المولّد من ملف الاحتساب الفعّال — لا نص ثابت يتقادم. */
    fun summaryAr(): String {
        val p = params ?: return "تُحتسب النقاط بعد صافرة النهاية"
        return when (strategyKey) {
            "tiered_pool" -> {
                val exact = ((p.tiers?.exact ?: 0.0) * 100).toInt()
                val margin = ((p.tiers?.signedMargin ?: 0.0) * 100).toInt()
                val outcome = ((p.tiers?.outcome ?: 0.0) * 100).toInt()
                "جائزة المباراة ${p.basePool ?: 0} نقطة: $exact٪ للنتيجة الدقيقة، $margin٪ للفارق الصحيح، $outcome٪ للاتجاه — وما لا يُوزَّع يتراكم للمباراة التالية"
            }
            "shared_pool" ->
                if (p.winCriterion == "exact")
                    "جائزة ${p.basePool ?: 0} نقطة تُقسم بالتساوي على أصحاب النتيجة الدقيقة"
                else
                    "جائزة ${p.basePool ?: 0} نقطة تُقسم بالتساوي على من أصابوا اتجاه المباراة"
            "skill_weighted" -> "نقاط مهارية: دقة توقّعك × جرأته × سلسلة إصاباتك"
            "fixed_points" -> "نقاط ثابتة حسب دقة التوقّع"
            else -> "تُحتسب النقاط بعد صافرة النهاية"
        }
    }
}

@Serializable
data class PredContestDetailResponse(
    val id: String = "",
    val contestType: String = "",
    val status: String = "",
    val locksAt: String = "",
    val metadata: PredContestMeta? = null,
    val result: PredScoreResult? = null,
    val entriesCount: Int = 0,
    val myEntry: PredMyEntry? = null,
    val rule: PredRule? = null,
)

@Serializable
data class PredEntryBody(val prediction: PredScorePayload)

@Serializable
data class PredEntrySaved(val id: String = "")

@Serializable
data class PredEntrySaveResponse(val entry: PredEntrySaved = PredEntrySaved())

@Serializable
data class PredLedgerItem(
    val id: String = "",
    val points: Int = 0,
    val reasonCode: String = "",
    val reasonLabelAr: String = "",
    val createdAt: String = "",
)

@Serializable
data class PredLedgerResponse(
    val items: List<PredLedgerItem> = emptyList(),
    val nextCursor: String? = null,
)

@Serializable
data class PredLeaderEntry(
    val rank: Int = 0,
    val userId: String = "",
    val name: String = "",
    val profileImageUrl: String? = null,
    val points: Int = 0,
    val exactCount: Int = 0,
)

@Serializable
data class PredMyRank(val rank: Int = 0, val points: Int = 0)

@Serializable
data class PredLeaderboardResponse(
    val nameAr: String = "",
    val seasonKey: String? = null,
    val entries: List<PredLeaderEntry> = emptyList(),
    val myRank: PredMyRank? = null,
)

@Serializable
data class PredAwardPool(
    val base: Int? = null,
    val carriedIn: Int? = null,
    val tierShare: Double? = null,
    val tierPoints: Int? = null,
    val winners: Int? = null,
)

@Serializable
data class PredAwardBreakdown(
    val prediction: String? = null,
    val finalScore: String? = null,
    val pool: PredAwardPool? = null,
)

@Serializable
data class PredAwardWallet(
    val multiplier: Double = 1.0,
    val walletPoints: Int = 0,
    val delivered: Boolean = false,
)

@Serializable
data class PredMyAward(
    val points: Int = 0,
    val reasonCode: String = "",
    val reasonLabelAr: String = "",
    val breakdown: PredAwardBreakdown? = null,
    val referenceId: String = "",
    val wallet: PredAwardWallet? = null,
)

@Serializable
data class PredSettlementResponse(
    val contestId: String = "",
    val result: PredScoreResult? = null,
    val settledAt: String? = null,
    val myAwards: List<PredMyAward> = emptyList(),
)

// ---------------------------------------------------------------------------
// تواريخ ISO — نفس منهج GcPredictionsViewModel (تعدد الصيغ، توقيت الرياض)
// ---------------------------------------------------------------------------

object PredDates {
    private val riyadh: ZoneId = ZoneId.of("Asia/Riyadh")

    fun parse(raw: String?): Instant? {
        if (raw.isNullOrBlank()) return null
        return runCatching { Instant.parse(raw) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(raw).toInstant() }.getOrNull()
    }

    /** «يُقفل بعد ٢س ١٤د» — عدّ تنازلي حتى الإغلاق، أو null إن مضى. */
    fun countdownAr(locksAt: String, now: Instant = Instant.now()): String? {
        val lock = parse(locksAt) ?: return null
        val seconds = lock.epochSecond - now.epochSecond
        if (seconds <= 0) return null
        val days = seconds / 86_400
        val hours = (seconds % 86_400) / 3_600
        val minutes = (seconds % 3_600) / 60
        return when {
            days > 0 -> "يُقفل بعد ${days}ي ${hours}س"
            hours > 0 -> "يُقفل بعد ${hours}س ${minutes}د"
            else -> "يُقفل بعد ${maxOf(minutes, 1)}د"
        }
    }

    fun kickoffTimeAr(locksAt: String): String {
        val instant = parse(locksAt) ?: return "—"
        return DateTimeFormatter.ofPattern("HH:mm").withZone(riyadh).format(instant)
    }

    fun dayAr(iso: String): String {
        val instant = parse(iso) ?: return ""
        return DateTimeFormatter.ofPattern("d MMMM", java.util.Locale("ar")).withZone(riyadh).format(instant)
    }
}
