package com.sabq.smart.feature.sports

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Singleton
import kotlin.math.ceil
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Query

/**
 * «مباريات اليوم» وشريط البوابة الرياضية — مرآة iOS `SportsTodayModels.swift`
 * (وهو نقل SportsMatchesBoard.tsx وsportsPortalHeadline.ts في الويب).
 * المصدر `GET /api/sports/today?date=` و`GET /api/sports/competitions`.
 */

@Serializable
data class SpTodayTeam(val id: Int = 0, val name: String = "", val logo: String? = null)

@Serializable
data class SpTodayStatus(
    val code: String? = null,
    val label: String? = null,
    val elapsed: Int? = null,
    val extra: Int? = null,
    val live: Boolean = false,
    val finished: Boolean = false,
) {
    /** «90+3′» أثناء اللعب. */
    val minuteText: String?
        get() {
            val e = elapsed ?: return null
            val x = extra
            return if (x != null && x > 0) "$e+$x′" else "$e′"
        }
}

@Serializable
data class SpTodayGoals(val home: Int? = null, val away: Int? = null)

@Serializable
data class SpTodayFixture(
    val id: Int,
    val timestamp: Long,
    val status: SpTodayStatus = SpTodayStatus(),
    val round: String? = null,
    val home: SpTodayTeam,
    val away: SpTodayTeam,
    val goals: SpTodayGoals? = null,
    val competition: String? = null,
    val competitionSlug: String? = null,
) {
    val started: Boolean get() = status.live || status.finished
    val kickoff: Instant get() = Instant.ofEpochSecond(timestamp)
}

@Serializable
data class SpCompetitionInfo(
    val slug: String = "",
    val name: String = "",
    val category: String? = null,
    val start: String? = null,
    val logo: String? = null,
)

@Serializable
data class SpCompetitionsPayload(val competitions: List<SpCompetitionInfo> = emptyList())

interface SportsTodayApi {
    /** يعيد JSON خامًا ليُفكّ كل عنصر وحده: مباراة تالفة لا تُسقط القائمة. */
    @GET("api/sports/today")
    suspend fun today(@Query("date") date: String? = null): JsonObject

    @GET("api/sports/competitions")
    suspend fun competitions(): SpCompetitionsPayload
}

@Module
@InstallIn(SingletonComponent::class)
object SportsTodayNetworkModule {
    @Provides
    @Singleton
    fun provideSportsTodayApi(retrofit: Retrofit): SportsTodayApi = retrofit.create(SportsTodayApi::class.java)
}

data class SpTodayPayload(val configured: Boolean?, val today: List<SpTodayFixture>)

object SportsTodayDecoder {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    fun decode(root: JsonObject): SpTodayPayload {
        val configured = root["configured"]?.let { runCatching { it.jsonPrimitive.booleanOrNull }.getOrNull() }
        val raw = runCatching { root["today"]?.jsonArray }.getOrNull().orEmpty()
        val fixtures = raw.mapNotNull { runCatching { json.decodeFromJsonElement<SpTodayFixture>(it) }.getOrNull() }
        return SpTodayPayload(configured, fixtures)
    }
}

/** روابط تطبيق VARA (`VaraAppPromo.tsx`): على أندرويد رابط المتجر. */
object VaraApp {
    const val PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.sabq.sports"
}

/** عنوان شريط البوابة الرياضية — منقول من `SportsHeadline` في iOS. */
object SportsHeadline {
    data class Headline(
        val live: Boolean,
        val tail: String,
        val match: SpTodayFixture? = null,
        val text: String? = null,
    )

    private val riyadh: ZoneId = ZoneId.of("Asia/Riyadh")

    private val marqueeSlugs = setOf(
        "world-cup", "club-world-cup", "intercontinental-cup", "afc-champions-league", "asian-cup",
        "champions-league", "europa-league",
        "premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1",
        "gulf-cup", "gulf-club-champions",
    )
    private val saudiCountdownSlugs = setOf("pro-league", "kings-cup", "super-cup")
    private val countdownSlugs = saudiCountdownSlugs + marqueeSlugs

    private val headlineClubs = listOf(
        "الهلال", "النصر", "الاتحاد", "الاهلي", "الشباب", "القادسيه", "التعاون",
        "الفيحاء", "الاتفاق", "الفتح", "الخليج", "ضمك", "نيوم", "الرياض", "الحزم", "النجمه",
        "ريال مدريد", "برشلونه", "اتلتيكو مدريد", "مانشستر سيتي", "مانشستر يونايتد",
        "ليفربول", "ارسنال", "تشيلسي", "توتنهام", "بايرن", "دورتموند",
        "باريس سان جيرمان", "يوفنتوس", "انتر", "ميلان", "نابولي",
    )

    fun normalizeName(raw: String): String = raw
        .replace(Regex("[آأإٱ]"), "ا")
        .replace("ى", "ي")
        .replace("ة", "ه")
        .replace(Regex("[\\u064B-\\u0652\\u0640]"), "")
        .replace(Regex("\\s+"), " ")
        .trim()

    private fun isHeadlineClub(name: String): Boolean {
        val n = normalizeName(name)
        return headlineClubs.any { n.contains(it) }
    }

    fun saudiSlugs(competitions: List<SpCompetitionInfo>): Set<String> =
        competitions.filter { (it.category ?: "saudi") == "saudi" }.map { it.slug }.toSet()

    private fun canHeadline(f: SpTodayFixture, saudi: Set<String>): Boolean {
        val slug = f.competitionSlug.orEmpty()
        if (slug !in saudi && slug !in marqueeSlugs) return false
        return slug in saudi || isHeadlineClub(f.home.name) || isHeadlineClub(f.away.name)
    }

    fun daysPhrase(d: Int): String = when {
        d <= 0 -> "ينطلق اليوم"
        d == 1 -> "ينطلق غدًا"
        d == 2 -> "ينطلق بعد يومين"
        d in 3..10 -> "ينطلق بعد $d أيام"
        else -> "ينطلق بعد $d يومًا"
    }

    /** أيام حتى منتصف ليل تاريخ البدء بتوقيت الرياض، مقرّبة للأعلى (‎-1 لتاريخ غير صالح). */
    fun daysUntil(iso: String, now: Instant): Int {
        val start = runCatching { LocalDate.parse(iso.take(10)) }.getOrNull() ?: return -1
        val startInstant = start.atStartOfDay(riyadh).toInstant()
        val seconds = (startInstant.epochSecond - now.epochSecond).toDouble()
        return ceil(seconds / 86_400.0).toInt()
    }

    private val kickoffFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("h:mm a", Locale.forLanguageTag("ar-SA")).withZone(riyadh)

    /** «8:30 م» بأرقام لاتينية وتوقيت الرياض. */
    fun kickoffText(at: Instant): String = kickoffFormatter.format(at)

    fun pick(
        today: List<SpTodayFixture>,
        competitions: List<SpCompetitionInfo>,
        now: Instant = Instant.now(),
    ): Headline {
        val saudi = saudiSlugs(competitions)
        val saudiRank = { f: SpTodayFixture -> if (f.competitionSlug.orEmpty() in saudi) 0 else 1 }
        val eligible = today.filter { canHeadline(it, saudi) }

        eligible.filter { it.status.live }
            .sortedWith(compareBy<SpTodayFixture>({ saudiRank(it) }, { it.timestamp }))
            .firstOrNull()
            ?.let { live ->
                val tail = live.status.elapsed?.let { "د$it — تابعها لحظة بلحظة" } ?: "تابعها لحظة بلحظة"
                return Headline(live = true, tail = tail, match = live)
            }
        eligible.filter { !it.status.live && !it.status.finished }
            .minByOrNull { it.timestamp }
            ?.let { upcoming ->
                return Headline(live = false, tail = "${kickoffText(upcoming.kickoff)} — التشكيل المتوقّع والترتيب", match = upcoming)
            }
        val pending = competitions
            .filter { it.slug in countdownSlugs && it.start != null && daysUntil(it.start, now) >= 0 }
            .sortedBy { it.start.orEmpty() }
        val next = pending.firstOrNull { it.slug in saudiCountdownSlugs } ?: pending.firstOrNull()
        if (next?.start != null) {
            return Headline(
                live = false,
                tail = "الجدول والترتيب والتوقّعات",
                text = "${next.name} ${daysPhrase(daysUntil(next.start, now))}",
            )
        }
        return Headline(
            live = false,
            tail = "نتائج مباشرة · ترتيب · توقّعات",
            text = if (competitions.isEmpty()) "كل البطولات في مكان واحد" else "${competitions.size} بطولة في مكان واحد",
        )
    }

    /** مجموعة بطولة في لوحة المباريات. */
    data class Group(val slug: String, val name: String, val logo: String?, val fixtures: List<SpTodayFixture>)

    /** الجارية أولًا، ثم السعودية، ثم ترتيب البطولات من الخادم — كما في iOS. */
    fun groups(fixtures: List<SpTodayFixture>, competitions: List<SpCompetitionInfo>): List<Group> {
        val saudi = saudiSlugs(competitions)
        val order = competitions.withIndex().associate { it.value.slug to it.index }
        return fixtures
            .groupBy { it.competitionSlug ?: it.competition ?: "other" }
            .map { (slug, items) ->
                val sorted = items.sortedWith(compareBy<SpTodayFixture>({ if (it.status.live) 0 else 1 }, { it.timestamp }))
                val comp = competitions.firstOrNull { it.slug == slug }
                Group(slug, comp?.name ?: items.firstOrNull()?.competition ?: slug, comp?.logo, sorted)
            }
            .sortedWith(
                compareBy<Group>(
                    { g -> if (g.fixtures.any { it.status.live }) 0 else 1 },
                    { g -> if (g.slug in saudi) 0 else 1 },
                    { g -> order[g.slug] ?: 999 },
                ),
            )
    }

    /** تاريخ الرياض بإزاحة أيام (YYYY-MM-DD). */
    fun isoDate(offset: Int, now: Instant = Instant.now()): String =
        now.atZone(riyadh).toLocalDate().plusDays(offset.toLong()).toString()
}
