package com.sabq.smart.feature.mawaeed

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonPrimitive
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * «مواعيدك» — مرآة iOS `Screens/Mawaeed/MawaeedModels.swift` (نقل /mawaeed و
 * /services/… من الويب). المصدر `GET /api/mawaeed?region=` و`/api/mawaeed/:slug`
 * (عامّان). الخادم يرسل النصوص جاهزة، وهذا الملف ينقل منطق الصفحة النقي من
 * shared/mawaeed/{home,dates,display}.ts: أقرب موعد، ترتيب السلاسل، العدّاد
 * الحي بتوقيت الرياض، واختصار العناوين.
 */

enum class MawaeedKind(val wire: String) {
    SchoolHoliday("school_holiday"),
    Salary("salary"),
    Pension("pension"),
    SocialSecurity("social_security"),
    CitizenAccount("citizen_account"),
    Other("other");

    companion object {
        fun from(raw: String?): MawaeedKind = entries.firstOrNull { it.wire == raw } ?: Other
    }
}

private fun String?.nonBlank(): String? = this?.takeIf { it.isNotBlank() }

@Serializable
data class MawaeedCard(
    val id: JsonPrimitive? = null,
    val seriesSlug: String = "",
    val seriesTitle: String = "",
    val kind: String? = null,
    val title: String = "",
    val startsOn: String = "",
    val gregorianLabel: String = "",
    val hijriLabel: String = "",
    val countdownText: String = "",
    val todayLabel: String = "اليوم",
    val isPast: Boolean = false,
    val isOngoing: Boolean = false,
    val endLabel: String? = null,
    val pastLabel: String? = null,
    val certainty: String? = null,
    val certaintyLabel: String = "",
    val expectedHint: String? = null,
    val publicNote: String? = null,
    val sourceUrl: String? = null,
    val sourceTitle: String? = null,
    val regionGroup: String? = null,
) {
    val key: String get() = id?.content ?: "$seriesSlug-$startsOn-$title"
    val mwKind: MawaeedKind get() = MawaeedKind.from(kind)
    val end: String? get() = endLabel.nonBlank()
    val past: String? get() = pastLabel.nonBlank()
    val hint: String? get() = expectedHint.nonBlank()
    val note: String? get() = publicNote.nonBlank()
    val source: String? get() = sourceUrl.nonBlank()?.takeIf { it.startsWith("https://") || it.startsWith("http://") }
    val isExpected: Boolean get() = certainty == "expected"
    val badgeText: String get() = if (isPast) past ?: "انتهى" else certaintyLabel
}

@Serializable
data class MawaeedSeriesBlock(
    val slug: String = "",
    val title: String = "",
    val kind: String? = null,
    val href: String = "",
    val summary: String? = null,
    val next: MawaeedCard? = null,
    val upcoming: List<MawaeedCard> = emptyList(),
    val answerLine: String = "",
) {
    val mwKind: MawaeedKind get() = MawaeedKind.from(kind)

    /** معرّف صفحة الخدمة في الويب لملف التقويم `/api/service-pages/:id/calendar.ics`. */
    val servicePageId: String?
        get() = if (href.startsWith("/services/")) href.substringAfterLast('/').nonBlank() else null
}

@Serializable
data class MawaeedRegion(val id: String = "", val label: String = "")

@Serializable
data class MawaeedFaq(val question: String = "", val answer: String = "")

@Serializable
data class MawaeedSection(val id: String = "", val title: String = "", val cards: List<MawaeedCard> = emptyList())

@Serializable
data class MawaeedPageMeta(val title: String? = null, val description: String? = null, val h1: String? = null)

@Serializable
data class MawaeedViewPayload(
    val dateModifiedLabel: String? = null,
    val region: String = MawaeedPrefs.DEFAULT_REGION,
    val regions: List<MawaeedRegion> = emptyList(),
    val page: MawaeedPageMeta? = null,
    val series: List<MawaeedSeriesBlock> = emptyList(),
    val sections: List<MawaeedSection> = emptyList(),
    val faq: List<MawaeedFaq> = emptyList(),
)

interface MawaeedApi {
    @GET("api/mawaeed")
    suspend fun overview(@Query("region") region: String? = null): MawaeedViewPayload

    @GET("api/mawaeed/{slug}")
    suspend fun service(@Path("slug") slug: String, @Query("region") region: String? = null): MawaeedViewPayload
}

@Module
@InstallIn(SingletonComponent::class)
object MawaeedNetworkModule {
    @Provides
    @Singleton
    fun provideMawaeedApi(retrofit: Retrofit): MawaeedApi = retrofit.create(MawaeedApi::class.java)
}

/** المنطقة المختارة للتقويم الدراسي — المفتاح نفسه في الويب وiOS (`mawaeed-region`). */
object MawaeedPrefs {
    const val DEFAULT_REGION = "riyadh"
    private const val FILE = "mawaeed"
    private const val REGION_PREF_ID = "mawaeed-region"

    fun region(context: Context): String =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(REGION_PREF_ID, null) ?: DEFAULT_REGION

    fun setRegion(context: Context, id: String) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(REGION_PREF_ID, id).apply()
    }

    /** الخادم يفترض الرياض، فلا نرسل المنطقة إلا إن اختلفت (كما iOS). */
    fun query(region: String): String? = region.takeIf { it != DEFAULT_REGION }
}

object MawaeedLogic {
    private val riyadh: ZoneId = ZoneId.of("Asia/Riyadh")

    /** أقرب موعد قادم عبر كل السلاسل. */
    fun nearestCard(series: List<MawaeedSeriesBlock>): MawaeedCard? =
        series.mapNotNull { it.next }.minByOrNull { it.startsOn }

    fun schoolBlock(series: List<MawaeedSeriesBlock>): MawaeedSeriesBlock? =
        series.firstOrNull { it.mwKind == MawaeedKind.SchoolHoliday }

    fun schoolRows(block: MawaeedSeriesBlock?, limit: Int = 6): List<MawaeedCard> =
        block?.upcoming?.filter { !it.isPast }?.take(limit).orEmpty()

    private val byNextDate = Comparator<MawaeedSeriesBlock> { a, b ->
        val x = a.next
        val y = b.next
        when {
            x != null && y != null -> x.startsOn.compareTo(y.startsOn)
            x != null -> -1
            y != null -> 1
            else -> 0
        }
    }

    /** شريط اختيار الخدمة: كل السلاسل من الأقرب. */
    fun pulseBlocks(series: List<MawaeedSeriesBlock>): List<MawaeedSeriesBlock> = series.sortedWith(byNextDate)

    /** «مواعيد الصرف الأخرى»: كل السلاسل عدا المدارس وسلسلة البطل. */
    fun boardBlocks(series: List<MawaeedSeriesBlock>, hero: MawaeedCard?): List<MawaeedSeriesBlock> =
        series.filter { it.mwKind != MawaeedKind.SchoolHoliday && (hero == null || it.slug != hero.seriesSlug) }
            .sortedWith(byNextDate)

    fun shortTitle(block: MawaeedSeriesBlock): String = when (block.mwKind) {
        MawaeedKind.SchoolHoliday -> "الإجازة القادمة"
        MawaeedKind.Salary -> "رواتب الدولة"
        MawaeedKind.Pension -> "معاشات التقاعد"
        MawaeedKind.SocialSecurity -> "الضمان المطوّر"
        MawaeedKind.CitizenAccount -> "حساب المواطن"
        MawaeedKind.Other -> block.title
    }

    private val gregorianMonths = listOf(
        "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
        "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
    )

    /** يحذف الشهر والسنة المطابقين لتاريخ الموعد من آخر العنوان. */
    fun compactTitle(title: String, startsOn: String): String {
        val parts = startsOn.split("-")
        val m = parts.getOrNull(1)?.toIntOrNull()
        if (parts.size != 3 || m == null || m !in 1..12) return title.trim()
        val monthYear = "${gregorianMonths[m - 1]}\\s*${Regex.escape(parts[0])}"
        val patterns = listOf(
            "\\s*\\(\\s*$monthYear\\s*\\)\\s*$",
            "\\s*[—–-]\\s*$monthYear\\s*$",
            "\\s*معاش\\s+$monthYear\\s*$",
        )
        var compact = title
        var removedPeriod = false
        for (p in patterns) {
            val re = Regex(p)
            if (re.containsMatchIn(compact)) {
                compact = compact.replace(re, "")
                removedPeriod = true
                break
            }
        }
        compact = compact
            .replace(Regex("\\(\\s*\\)"), "")
            .replace(Regex("\\s{2,}"), " ")
            .replace(Regex("\\s*([,،:؛|])\\s*$"), "")
            .replace(Regex("\\s*[-–—]\\s*$"), "")
            .trim()
        if (removedPeriod) {
            compact = compact.replace(Regex("\\s*[-–—]\\s*معاش$"), "").trim()
        }
        return compact.ifEmpty { title.trim() }
    }

    /** يبقى اسم الخدمة واضحًا حتى لو كتب المحرر عنوانًا لا يبدأ به. */
    fun overviewTitle(card: MawaeedCard): String {
        val title = compactTitle(card.title, card.startsOn)
        val normalize = { s: String -> s.replace(Regex("[\\u064B-\\u065F\\u0670\\u0640]"), "").trim() }
        return if (normalize(title).startsWith(normalize(card.seriesTitle))) title else "${card.seriesTitle} — $title"
    }

    fun riyadhDateISO(now: Instant): String = now.atZone(riyadh).toLocalDate().toString()

    private fun day(iso: String): LocalDate? = runCatching { LocalDate.parse(iso) }.getOrNull()

    fun diffIsoDays(from: String, to: String): Int {
        val a = day(from) ?: return 0
        val b = day(to) ?: return 0
        return java.time.temporal.ChronoUnit.DAYS.between(a, b).toInt()
    }

    /** منتصف ليل الرياض ليوم مدني. */
    fun riyadhMidnight(iso: String): Instant? = day(iso)?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.minusSeconds(3 * 3600)

    fun dayUnitWord(n: Int): String {
        val rest = kotlin.math.abs(n) % 100
        return when {
            rest == 0 -> "يوم"
            rest in 3..10 -> "أيام"
            else -> "يوماً"
        }
    }

    fun daysPhrase(days: Int, todayLabel: String): String = when {
        days <= 0 -> todayLabel
        days == 1 -> "بعد يوم واحد"
        days == 2 -> "بعد يومين"
        else -> "بعد $days ${dayUnitWord(days)}"
    }

    fun hoursPhrase(hours: Int): String = when {
        hours <= 0 -> ""
        hours == 1 -> "وساعة"
        hours == 2 -> "وساعتين"
        hours <= 10 -> "و$hours ساعات"
        else -> "و$hours ساعة"
    }

    /** العدّاد الحي حتى منتصف ليل بداية الموعد بتوقيت الرياض. */
    fun liveText(now: Instant, startsOn: String, todayLabel: String): String {
        val calendarDays = diffIsoDays(riyadhDateISO(now), startsOn)
        if (calendarDays <= 0) return todayLabel
        val midnight = riyadhMidnight(startsOn) ?: return daysPhrase(calendarDays, todayLabel)
        val totalHours = maxOf(0L, (midnight.epochSecond - now.epochSecond) / 3600).toInt()
        val days = totalHours / 24
        val hours = totalHours % 24
        if (days <= 0) {
            var text = hoursPhrase(hours)
            if (text.startsWith("و")) text = "بعد " + text.drop(1)
            if (text.isEmpty()) text = "بعد أقل من ساعة"
            return if (text.startsWith("بعد")) text else "بعد $text"
        }
        if (hours <= 0) return daysPhrase(days, todayLabel)
        val dayPart = daysPhrase(days, todayLabel).replace("بعد ", "")
        return "بعد $dayPart ${hoursPhrase(hours)}"
    }

    /** نص العدّاد: الجاري والمنتهي من الخادم، والقادم محسوب من الساعة. */
    fun countdown(card: MawaeedCard, now: Instant): String = when {
        card.isPast -> card.past ?: "انتهى"
        card.isOngoing -> card.countdownText
        else -> liveText(now, card.startsOn, card.todayLabel)
    }

    data class ClockParts(val days: Int, val hours: Int, val minutes: Int, val word: String?)

    /** أيام / ساعات / دقائق للبطل، أو نص الحالة عند حلول الموعد. */
    fun clockParts(card: MawaeedCard, now: Instant): ClockParts {
        if (card.isPast) return ClockParts(0, 0, 0, card.past ?: "انتهى")
        if (card.isOngoing) return ClockParts(0, 0, 0, card.countdownText)
        if (diffIsoDays(riyadhDateISO(now), card.startsOn) <= 0) return ClockParts(0, 0, 0, card.todayLabel)
        val midnight = riyadhMidnight(card.startsOn) ?: return ClockParts(0, 0, 0, card.countdownText)
        val totalMinutes = maxOf(0L, (midnight.epochSecond - now.epochSecond) / 60).toInt()
        return ClockParts(totalMinutes / 1440, (totalMinutes / 60) % 24, totalMinutes % 60, null)
    }

    fun hoursWord(h: Int): String = if (h in 3..10) "ساعات" else "ساعة"
}
