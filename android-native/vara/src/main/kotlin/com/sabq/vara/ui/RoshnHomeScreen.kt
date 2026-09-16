package com.sabq.vara.ui

// ════════════════════════════════════════════════════════════════════════
//  RoshnHomeScreen — واجهة «دوري روشن» (الرئيسية) لتطبيق VARA أندرويد.
//  نقل 1:1 من iOS: Screens/HomeView.swift + Services/VaraInsights.swift +
//  SpMyTeamCard/SpOutlookCard/SpCountdownChips من SportsComponents.swift.
//
//  ملاحظات دمج:
//  - `RoshnScreen` هنا بديل مباشر للدالة القديمة في MainScreens.kt (تُحذف عند الدمج).
//  - `RoshnStandingsScreen` و`RoshnScorersScreen` صفحتا «الكل» — تُسجَّلان في
//    VaraApp على المسارين `RoshnStandingsRoute` و`RoshnScorersRoute` أدناه.
// ════════════════════════════════════════════════════════════════════════

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Alarm
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.NotificationImportant
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.SportsScore
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Stars
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import com.sabq.vara.R
import com.sabq.vara.core.AccountState
import com.sabq.vara.core.FavoriteTeam
import com.sabq.vara.core.Fixture
import com.sabq.vara.core.Standing
import com.sabq.vara.core.Team
import com.sabq.vara.core.VaraFormat
import com.sabq.vara.core.VaraViewModel
import com.sabq.vara.core.bool
import com.sabq.vara.core.findArray
import com.sabq.vara.core.int
import com.sabq.vara.core.long
import com.sabq.vara.core.obj
import com.sabq.vara.core.parseFixture
import com.sabq.vara.core.parseStanding
import com.sabq.vara.core.parseTeam
import com.sabq.vara.core.string
import java.time.Duration
import java.time.Instant
import java.util.Locale
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/** مساران لصفحتَي «الكل» — يسجَّلان في VaraApp لاحقًا. */
const val RoshnStandingsRoute = "roshn-standings"
const val RoshnScorersRoute = "roshn-scorers"

// ────────────────────────────────────────────────────────────────────────
// نماذج محلية (فك مرن كي لا يعتمد الملف على تعديل core)
// ────────────────────────────────────────────────────────────────────────

/** دلاء المباريات كما يرسلها `/sports/pro-league/matches` (نظير SpMatchesResponse). */
private data class RhMatches(
    val live: List<Fixture>,
    val today: List<Fixture>,
    val upcoming: List<Fixture>,
    val results: List<Fixture>,
) {
    val all: List<Fixture> get() = live + today + upcoming + results
}

private fun rhParseMatches(root: JsonElement): RhMatches? {
    val o = root as? JsonObject ?: return null
    fun bucket(key: String) = (o[key] as? JsonArray)?.mapNotNull(::parseFixture).orEmpty()
    val m = RhMatches(bucket("live"), bucket("today"), bucket("upcoming"), bucket("results"))
    return if (m.all.isEmpty() && o["live"] == null && o["today"] == null && o["upcoming"] == null && o["results"] == null) null else m
}

/** نظرة الموسم (نظير SpOutlook) — من `/sports/pro-league/outlook`. */
private data class RhOutlook(
    val phase: String,
    val season: Int,
    val champion: Team?,
    val firstKickoffMs: Long?,
    val daysUntilKickoff: Int?,
    val openers: List<Fixture>,
)

private fun rhParseOutlook(root: JsonElement): RhOutlook? {
    val wrap = root as? JsonObject ?: return null
    val o = wrap.obj("outlook") ?: wrap.takeIf { it.string("phase") != null } ?: return null
    return RhOutlook(
        phase = o.string("phase") ?: "unknown",
        season = o.int("season") ?: 0,
        champion = (o["champion"] as? JsonObject)?.let { parseTeam(it) }?.takeIf { it.name.isNotBlank() },
        firstKickoffMs = o.long("firstKickoff"),
        daysUntilKickoff = o.int("daysUntilKickoff"),
        openers = (o["openers"] as? JsonArray)?.mapNotNull(::parseFixture).orEmpty(),
    )
}

/** هدّاف/صانع بمعرّف فريق (نظير SpScorer — الـLeader المشترك بلا team.id). */
private data class RhScorer(
    val rank: Int,
    val id: Int,
    val name: String,
    val photo: String,
    val team: Team,
    val goals: Int,
    val assists: Int,
)

private fun rhParseScorer(e: JsonElement): RhScorer? {
    val o = e as? JsonObject ?: return null
    val player = o.obj("player") ?: o
    val name = player.string("nameAr", "name", "playerName") ?: return null
    return RhScorer(
        rank = o.int("rank", "position") ?: 0,
        id = player.int("id", "playerId") ?: o.int("id") ?: 0,
        name = name,
        photo = player.string("photo", "image") ?: "",
        team = parseTeam(o["team"]),
        goals = o.int("goals") ?: player.int("goals") ?: 0,
        assists = o.int("assists") ?: player.int("assists") ?: 0,
    )
}

/** صفقة روشن بمعرّفات الأندية (نظير SpLeagueTransfer — النقر يفتح نادي الوجهة). */
private data class RhClub(val id: Int, val name: String, val logo: String)
private data class RhTransfer(
    val id: String,
    val playerId: Int?,
    val player: String,
    val from: RhClub,
    val to: RhClub,
    val inClubId: Int?,
    val kind: String,
)

private fun rhParseTransfer(e: JsonElement): RhTransfer? {
    val o = e as? JsonObject ?: return null
    val playerObj = o.obj("player") ?: o
    val name = playerObj.string("nameAr", "name", "playerName") ?: o.string("player") ?: return null
    fun club(vararg keys: String): RhClub {
        val c = o.obj(*keys)
        return RhClub(c?.int("id") ?: 0, c?.string("nameAr", "name") ?: "", c?.string("logo") ?: "")
    }
    val to = club("to", "toTeam", "clubTo")
    val playerId = playerObj.int("id", "playerId")
    return RhTransfer(
        id = o.string("id", "transferId") ?: "$playerId-${o.string("date")}-${to.name}",
        playerId = playerId,
        player = name,
        from = club("from", "fromTeam", "clubFrom"),
        to = to,
        inClubId = o.int("inClubId", "in_club_id"),
        kind = o.string("kind") ?: "",
    )
}

/** لقطة ذكية من الخادم (نظير SpSnap). */
data class RhSnap(
    val id: String,
    val icon: String,
    val headline: String,
    val body: String,
    val accent: String,
    val deeplink: String?,
)

private fun rhParseSnap(e: JsonElement): RhSnap? {
    val o = e as? JsonObject ?: return null
    val headline = o.string("headline", "title") ?: ""
    val body = o.string("body", "subtitle") ?: ""
    if (headline.isBlank() && body.isBlank()) return null
    return RhSnap(
        id = o.string("id") ?: "${o.string("kind")}-${o.string("generatedAt")}-$headline",
        icon = o.string("icon") ?: "",
        headline = headline,
        body = body,
        accent = o.string("accent") ?: "",
        deeplink = o.string("deeplink"),
    )
}

/** صف إحصائية من `/sports/match/{id}` (نظير SpStatRow). */
private data class RhStatRow(val type: String, val label: String, val home: String?, val away: String?)

private fun rhStatText(el: JsonElement?): String? = when (el) {
    is JsonPrimitive -> el.contentOrNull?.takeIf { it.isNotBlank() && it != "null" }
    is JsonObject -> el.string("text") ?: el.int("number")?.toString()
    else -> null
}

private fun rhParseStatRows(root: JsonElement): List<RhStatRow> {
    val o = root as? JsonObject ?: return emptyList()
    val rows = o.obj("statistics")?.get("rows") as? JsonArray ?: return emptyList()
    return rows.mapNotNull { e ->
        val r = e as? JsonObject ?: return@mapNotNull null
        RhStatRow(
            type = r.string("type") ?: "",
            label = r.string("label") ?: "",
            home = rhStatText(r["home"]),
            away = rhStatText(r["away"]),
        )
    }
}

/** الأهداف المتوقعة (نظير SpXg) — null إذا كانت غير متاحة. */
private data class RhXg(val home: Double, val away: Double)

private fun rhParseXg(root: JsonElement): RhXg? {
    val o = root as? JsonObject ?: return null
    if (o.bool("available") != true) return null
    fun side(key: String): Double? = ((o.obj(key)?.get("xg")) as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull()
    val h = side("home") ?: return null
    val a = side("away") ?: return null
    return RhXg(h, a)
}

/** عنصر تعليق لحظي (نظير SpCommentaryItem). */
private data class RhComment(
    val minute: Int,
    val extra: Int?,
    val goal: Boolean,
    val important: Boolean,
    val textAr: String,
    val textEn: String,
    val order: Int,
) {
    val displayText: String
        get() {
            if (VaraFormat.displayLang == "en" && textEn.isNotBlank()) return textEn
            return textAr
        }
}

private fun rhParseCommentary(root: JsonElement): List<RhComment> =
    findArray(root, "items").mapNotNull { e ->
        val o = e as? JsonObject ?: return@mapNotNull null
        RhComment(
            minute = o.int("minute") ?: 0,
            extra = o.int("extraMinute"),
            goal = o.bool("goal") ?: false,
            important = o.bool("important") ?: false,
            textAr = o.string("textAr", "text") ?: "",
            textEn = o.string("textEn") ?: "",
            order = o.int("order") ?: 0,
        )
    }

// ────────────────────────────────────────────────────────────────────────
// ذكاء VARA السلوكي — ترجمة حرفية لـVaraInsightsEngine (VaraInsights.swift)
// ────────────────────────────────────────────────────────────────────────

enum class RhInsightAccent { GREEN, GOLD, CRIMSON }

data class RhInsight(
    val id: String,
    val icon: ImageVector,
    val text: String,
    val accent: RhInsightAccent,
    val deeplink: String? = null,
)

data class RhInsightContext(
    val isLoggedIn: Boolean = false,
    val favoriteName: String? = null,
    val followsCount: Int = 0,
    val activeAlerts: Int = 0,
    /** عنوان مباراة الفريق المفضّل القادمة (مثل «النصر × الهلال») إن عُرفت. */
    val favoriteNextTitle: String? = null,
    /** موعد انطلاق مباراة المفضّل القادمة (ms) — للصياغة الزمنية. */
    val favoriteNextKickoffMs: Long? = null,
    val favoriteIsLive: Boolean = false,
    val serverSnaps: List<RhSnap> = emptyList(),
)

object RhInsightsEngine {
    /** يولّد عبارات ذكية مرتّبة حسب الأولوية (الأهمّ أولًا). `nowMs` للصياغة الزمنية. */
    fun generate(c: RhInsightContext, nowMs: Long): List<RhInsight> {
        val out = mutableListOf<RhInsight>()

        out += c.serverSnaps.take(4).map(::serverInsight)

        // 1) مباراة المفضّل جارية الآن — الأعلى أولوية.
        if (c.favoriteIsLive && c.favoriteName != null) {
            out += RhInsight(
                id = "fav-live", icon = Icons.Default.Sensors,
                text = "مباراة ${c.favoriteName} جارية الآن — افتح مركز المباراة وتابعها لحظة بلحظة.",
                accent = RhInsightAccent.CRIMSON,
            )
        }

        // 2) مباراة المفضّل قادمة قريبًا — تذكير + دعوة للتوقّع.
        if (!c.favoriteIsLive && c.favoriteNextKickoffMs != null) {
            val secs = (c.favoriteNextKickoffMs - nowMs) / 1000
            if (secs > 0 && secs <= 48 * 3600) {
                val title = c.favoriteNextTitle ?: "مباراة فريقك المفضّل"
                out += RhInsight(
                    id = "fav-soon", icon = Icons.Default.Alarm,
                    text = "$title ${relative(secs)} — هل سجّلت توقّعك في VARA؟",
                    accent = RhInsightAccent.GOLD,
                )
            }
        }

        // 3) لا فريق مفضّل — اقتراح التخصيص.
        if (c.favoriteName == null) {
            out += RhInsight(
                id = "no-fav", icon = Icons.Default.Star,
                text = "اجعل VARA لك: اختر فريقك المفضّل من نجمة صفحة أي نادٍ ليتصدّر شاشتك.",
                accent = RhInsightAccent.GREEN,
            )
        } else if (c.favoriteNextKickoffMs == null && !c.favoriteIsLive) {
            out += RhInsight(
                id = "fav-watch", icon = Icons.Default.AutoAwesome,
                text = "أنت من مشجّعي ${c.favoriteName} — نُبرز مبارياته وأخباره أولًا في VARA.",
                accent = RhInsightAccent.GREEN,
            )
        }

        // 4) متابعة وتنبيهات — حسب الحالة.
        if (c.isLoggedIn) {
            when {
                c.followsCount == 0 -> out += RhInsight(
                    id = "follow", icon = Icons.Default.FavoriteBorder,
                    text = "تابع فِرقك المفضّلة لتصلك تنبيهات مبارياتها اللحظية.",
                    accent = RhInsightAccent.GREEN,
                )
                c.activeAlerts == 0 -> out += RhInsight(
                    id = "alerts-off", icon = Icons.Default.NotificationImportant,
                    text = "تتابع ${c.followsCount} فِرق لكن التنبيهات متوقّفة — فعّلها لئلّا تفوتك أهدافهم.",
                    accent = RhInsightAccent.GOLD,
                )
                else -> out += RhInsight(
                    id = "watching", icon = Icons.Default.NotificationsActive,
                    text = "نراقب ${c.followsCount} من فِرقك — ستصلك تنبيهات الأهداف والنتائج فور وقوعها.",
                    accent = RhInsightAccent.GREEN,
                )
            }
        } else {
            out += RhInsight(
                id = "login", icon = Icons.Default.PersonAdd,
                text = "سجّل الدخول ليتذكّر VARA فِرقك وتوقّعاتك على كل أجهزتك.",
                accent = RhInsightAccent.GREEN,
            )
        }

        // 5) تلميح عام عن خوارزمية التوقّع (دائمًا كخيار أخير).
        out += RhInsight(
            id = "tip-pred", icon = Icons.Default.BarChart,
            text = "«توقّع VARA» يحلّل الترتيب والفورمة وأفضلية الأرض لكل مباراة — جرّبه قبل الصافرة.",
            accent = RhInsightAccent.GREEN,
        )

        return out
    }

    private fun serverInsight(snap: RhSnap): RhInsight = RhInsight(
        id = "server-${snap.id}",
        icon = icon(snap.icon),
        text = cleanPrefix(snap.body.ifEmpty { snap.headline }),
        accent = accent(snap.accent),
        deeplink = snap.deeplink,
    )

    private fun cleanPrefix(text: String): String =
        text.replace(Regex("""^\s*فريقك\s*[:：]\s*"""), "")

    private fun accent(raw: String): RhInsightAccent = when (raw) {
        "gold" -> RhInsightAccent.GOLD
        "crimson" -> RhInsightAccent.CRIMSON
        else -> RhInsightAccent.GREEN
    }

    private fun icon(raw: String): ImageVector = when (raw) {
        "calendar" -> Icons.Default.CalendarMonth
        "flag" -> Icons.Default.SportsScore
        "history" -> Icons.Default.History
        "timer" -> Icons.Default.Timer
        "table" -> Icons.Default.TableChart
        else -> Icons.Default.AutoAwesome
    }

    private fun relative(secs: Long): String {
        val h = secs / 3600
        if (h >= 24) return "بعد ${h / 24} يوم"
        if (h >= 1) return "بعد $h ساعة"
        val m = maxOf(1, secs / 60)
        return "بعد $m دقيقة"
    }
}

// ────────────────────────────────────────────────────────────────────────
// حالة الشاشة + الجلب (موجتان + إثراء الهيرو — نظير loadAll/refreshHero)
// ────────────────────────────────────────────────────────────────────────

/** بطولات جدول المفضّل حسب دوريه — ≤ 8 (حد الخادم). */
private fun rhTeamComps(slug: String?): String {
    val primary = slug?.takeIf { it.isNotBlank() } ?: "pro-league"
    val extra = when (primary) {
        "pro-league", "division-1", "division-2", "womens-league" ->
            listOf("kings-cup", "super-cup", "afc-champions-league", "club-world-cup")
        "premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1" ->
            listOf("champions-league", "europa-league", "uefa-super-cup")
        "uae-pro-league", "qatar-stars-league", "kuwait-premier-league",
        "bahrain-premier-league", "oman-pro-league",
        -> listOf("gulf-club-champions", "afc-champions-league")
        else -> emptyList()
    }
    return (listOf(primary) + extra).distinct().take(8).joinToString(",")
}

private class RhHomeModel(private val vm: VaraViewModel) {
    var loading by mutableStateOf(true)
    var loadedOnce by mutableStateOf(false)
    var refreshing by mutableStateOf(false)
    var loadError by mutableStateOf<String?>(null)
    /** بطولة هب فريقي (مثل egypt-premier-league) — null بلا مفضّل. */
    var hubSlug by mutableStateOf<String?>(null)
    var hubCompetitionName by mutableStateOf<String?>(null)
    var matches by mutableStateOf<RhMatches?>(null)
    var standings by mutableStateOf<List<Standing>>(emptyList())
    var outlook by mutableStateOf<RhOutlook?>(null)
    var scorers by mutableStateOf<List<RhScorer>>(emptyList())
    var assists by mutableStateOf<List<RhScorer>>(emptyList())
    var transfers by mutableStateOf<List<RhTransfer>>(emptyList())
    var snaps by mutableStateOf<List<RhSnap>>(emptyList())
    var featuredStats by mutableStateOf<List<RhStatRow>>(emptyList())
    var featuredXg by mutableStateOf<RhXg?>(null)
    var commentary by mutableStateOf<List<RhComment>>(emptyList())

    val isRoshnHub: Boolean get() = hubSlug == "pro-league"

    /** آخر جلب لحظي للترتيب أثناء البث — خانق 30ث (نظير lastLiveStandingsAt). */
    private var lastLiveStandingsAt = 0L

    /** أبرز مباراة تخصّ الفريق المفضّل عبر الدلاء بالأولوية. */
    fun favoriteMatch(favId: Int): Fixture? {
        val m = matches ?: return null
        for (bucket in listOf(m.live, m.today, m.upcoming, m.results)) {
            bucket.firstOrNull { it.home.id == favId || it.away.id == favId }?.let { return it }
        }
        return null
    }

    /** مباراة الواجهة: مباراة المفضّل أولًا وإلا الأبرز: مباشر ← اليوم ← قادم ← آخر نتيجة. */
    fun featured(favId: Int?): Fixture? {
        val m = matches ?: return null
        if (favId != null) favoriteMatch(favId)?.let { return it }
        return m.live.firstOrNull() ?: m.today.firstOrNull() ?: m.upcoming.firstOrNull() ?: m.results.firstOrNull()
    }

    private fun liveNow(favId: Int?): Boolean =
        featured(favId)?.status?.live == true || standings.any { it.live }

    private fun nearKickoff(favId: Int?): Boolean {
        if (liveNow(favId)) return false
        val k = featured(favId)?.kickoffMs ?: return false
        val d = k - System.currentTimeMillis()
        return d in 1..1_800_000L
    }

    fun isLiveOrNear(favId: Int?): Boolean = liveNow(favId) || nearKickoff(favId)

    /** السياسة الموحّدة: حيّ 10ث / قبل الانطلاق ≤30د 30ث / خامل 60ث. */
    fun pollDelayMs(favId: Int?): Long = when {
        liveNow(favId) -> 10_000L
        nearKickoff(favId) -> 30_000L
        else -> 60_000L
    }

    /** الموجة الأولى + الإثراء — هب بطولة المفضّل (لا روشن الثابت). */
    suspend fun loadAll(force: Boolean) {
        val fav = vm.favoriteTeam.value
        if (fav == null) {
            hubSlug = null
            hubCompetitionName = null
            matches = null
            standings = emptyList()
            outlook = null
            scorers = emptyList()
            assists = emptyList()
            transfers = emptyList()
            featuredStats = emptyList()
            featuredXg = null
            commentary = emptyList()
            loadError = null
            loading = false
            loadedOnce = true
            loadSmartSnaps(force)
            return
        }

        if (!force) loading = true
        var slug = fav.competitionSlug?.takeIf { it.isNotBlank() }
        var compName = fav.competitionName
        if (slug == null) {
            runCatching { vm.api.publicGet("/sports/team/${fav.id}", ignoreCache = force) }.getOrNull()?.jsonObject?.let { root ->
                slug = root.string("competitionSlug")?.takeIf { it.isNotBlank() }
                compName = root.string("competitionName") ?: compName
                if (slug != null) vm.updateFavoriteCompetition(slug, compName)
            }
        }
        if (slug == null) {
            hubSlug = null
            hubCompetitionName = compName
            matches = null
            standings = emptyList()
            loading = false
            loadedOnce = true
            loadError = null
            loadSmartSnaps(force)
            return
        }
        hubSlug = slug
        hubCompetitionName = compName

        coroutineScope {
            val m = async { runCatching { vm.api.publicGet("/sports/$slug/matches", ignoreCache = force) }.getOrNull() }
            val s = async { runCatching { vm.api.publicGet("/sports/$slug/standings", ignoreCache = force) }.getOrNull() }
            m.await()?.let { root -> rhParseMatches(root)?.let { matches = it } }
            s.await()?.let { root ->
                findArray(root, "standings", "table", "items").mapNotNull { parseStanding(it) }
                    .takeIf { it.isNotEmpty() }?.let { standings = it }
            }
        }
        loadError = if (matches == null && standings.isEmpty()) "تعذّر الاتصال بخادم البيانات" else null
        loading = false
        loadedOnce = true

        coroutineScope {
            val o = async {
                if (slug == "pro-league") runCatching { vm.api.publicGet("/sports/pro-league/outlook", ignoreCache = force) }.getOrNull()
                else null
            }
            val sc = async { runCatching { vm.api.publicGet("/sports/$slug/scorers", ignoreCache = force) }.getOrNull() }
            val asst = async { runCatching { vm.api.publicGet("/sports/$slug/assists", ignoreCache = force) }.getOrNull() }
            val tr = async {
                if (slug == "pro-league") runCatching { vm.api.publicGet("/sports/transfers", mapOf("since" to "4"), ignoreCache = force) }.getOrNull()
                else null
            }
            outlook = o.await()?.let { root -> rhParseOutlook(root) }
            sc.await()?.let { scorers = findArray(it, "scorers", "leaders", "items").mapNotNull(::rhParseScorer) }
                ?: run { scorers = emptyList() }
            asst.await()?.let { assists = findArray(it, "assists", "leaders", "items").mapNotNull(::rhParseScorer) }
                ?: run { assists = emptyList() }
            transfers = tr.await()?.let { findArray(it, "transfers", "topDeals", "items").mapNotNull(::rhParseTransfer) }.orEmpty()
        }
        if (matches == null && standings.isEmpty() && outlook == null) {
            loadError = "تعذّر الاتصال بخادم البيانات"
        }
        loadSmartSnaps(force)
        enrichFeatured(force)
    }

    /** لقطات الخادم: عضو `/sports/snaps` (v1)؛ ضيف بمفضّل `/sports/snaps/team/{id}` (عام). */
    suspend fun loadSmartSnaps(force: Boolean) {
        val account = vm.account.value
        if (!account.smartSnapsVisible || account.language == "en") { snaps = emptyList(); return }
        val fav = vm.favoriteTeam.value
        val root = when {
            vm.isLoggedIn -> runCatching { vm.api.memberGet("/sports/snaps", ignoreCache = force) }.getOrNull()
            fav != null -> runCatching { vm.api.publicGet("/sports/snaps/team/${fav.id}", ignoreCache = force) }.getOrNull()
            else -> null
        }
        snaps = root?.let { findArray(it, "snaps", "items").mapNotNull(::rhParseSnap) }.orEmpty()
    }

    /** إثراء الهيرو (أفضل جهد) لمباراة بدأت: إحصائيات + xG + آخر مجريات. */
    suspend fun enrichFeatured(force: Boolean) {
        val f = featured(vm.favoriteTeam.value?.id)
        if (f == null || !f.started) {
            featuredStats = emptyList(); featuredXg = null; commentary = emptyList()
            return
        }
        coroutineScope {
            val d = async { runCatching { vm.api.publicGet("/sports/match/${f.id}", ignoreCache = force) }.getOrNull() }
            val x = async { runCatching { vm.api.publicGet("/sports/match/${f.id}/xg", ignoreCache = force) }.getOrNull() }
            val cm = async {
                if (f.status.live) runCatching { vm.api.publicGet("/sports/match/${f.id}/commentary", ignoreCache = force) }.getOrNull() else null
            }
            d.await()?.let { featuredStats = rhParseStatRows(it) }
            // نجاح الجلب يحدّث (حتى لو كانت xG غير متاحة)؛ فشل التحديث لا يمحو المعروض.
            x.await()?.let { featuredXg = rhParseXg(it) }
            commentary = if (f.status.live) cm.await()?.let(::rhParseCommentary) ?: commentary else emptyList()
        }
    }

    /**
     * تحديث حيّ خفيف: المباريات + الترتيب اللحظي (خانق 30ث) + تفاصيل/تعليق مباراة
     * الهيرو الجارية. كسر الكاش فقط أثناء البث (نظير refreshHero في iOS).
     */
    suspend fun refreshHero(favId: Int?) {
        val slug = hubSlug ?: return
        val bust = liveNow(favId)
        runCatching { vm.api.publicGet("/sports/$slug/matches", ignoreCache = bust) }.getOrNull()
            ?.let { root -> rhParseMatches(root)?.let { matches = it } }
        if (System.currentTimeMillis() - lastLiveStandingsAt >= 30_000L) {
            runCatching { vm.api.publicGet("/sports/$slug/standings", ignoreCache = bust) }.getOrNull()?.let { root ->
                findArray(root, "standings", "table", "items").mapNotNull { parseStanding(it) }
                    .takeIf { it.isNotEmpty() }?.let {
                        standings = it
                        lastLiveStandingsAt = System.currentTimeMillis()
                    }
            }
        }
        val f = featured(favId) ?: return
        if (!f.started) return
        coroutineScope {
            val d = async { runCatching { vm.api.publicGet("/sports/match/${f.id}", ignoreCache = bust) }.getOrNull() }
            val cm = async {
                if (f.status.live) runCatching { vm.api.publicGet("/sports/match/${f.id}/commentary", ignoreCache = bust) }.getOrNull() else null
            }
            d.await()?.let { featuredStats = rhParseStatRows(it) }
            commentary = if (f.status.live) cm.await()?.let(::rhParseCommentary) ?: commentary else emptyList()
        }
    }
}

// ────────────────────────────────────────────────────────────────────────
// الشاشة الرئيسية
// ────────────────────────────────────────────────────────────────────────

@Composable
fun RoshnScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    val account by vm.account.collectAsState()
    val fav by vm.favoriteTeam.collectAsState()
    val followed by vm.followedFixtures.collectAsState()
    val model = remember { RhHomeModel(vm) }
    val scope = rememberCoroutineScope()

    val featured = model.featured(fav?.id)

    // إثراء الهيرو عند تبدّل المباراة المميّزة (بديل onChange في iOS).
    LaunchedEffect(featured?.id, featured?.started) {
        if (model.loadedOnce) model.enrichFeatured(false)
    }
    // إعادة بناء الهب عند تبدّل المفضّل (فريق عربي ≠ روشن).
    LaunchedEffect(fav?.id, fav?.competitionSlug) {
        model.loadAll(force = false)
    }
    // اللقطات تتبع الجلسة/المفضّل/مفتاح الإظهار/اللغة.
    LaunchedEffect(account.loggedIn, fav?.id, account.smartSnapsVisible, account.language) {
        if (model.loadedOnce) model.loadSmartSnaps(false)
    }
    // تغذية لقطات «مبارياتي» من أحدث جدول محمّل.
    LaunchedEffect(model.matches) {
        model.matches?.let { vm.updateFollowedSnapshots(it.all) }
    }
    // الاستطلاع الحيّ للهيرو: 10ث بث / 30ث قرب الانطلاق / فحص خامل 60ث بلا شبكة.
    // PollEffect يعمل فقط والشاشة بالمقدمة — التبويب المخفي لا يستهلك شبكة.
    PollEffect(
        delayProvider = { model.pollDelayMs(vm.favoriteTeam.value?.id) },
        onTick = {
            val favId = vm.favoriteTeam.value?.id
            if (model.loadedOnce && model.isLiveOrNear(favId)) model.refreshHero(favId)
        },
    )

    val outlookSnapshot = model.outlook
    val totalError = model.loadError != null && model.matches == null && model.standings.isEmpty() && outlookSnapshot == null
    val initialLoading = model.loading && model.matches == null && model.standings.isEmpty()
    val myMatches = if (followed.isEmpty()) emptyList() else vm.visibleFollowedFixtures().take(4)

    VaraPullRefresh(
        refreshing = model.refreshing,
        onRefresh = {
            scope.launch {
                model.refreshing = true
                model.loadAll(force = true)
                model.refreshing = false
            }
        },
        modifier = Modifier.fillMaxSize(),
    ) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
            LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                item(key = "topbar") { RhTopBar(nav, account) }

                val team = fav
                if (team == null) {
                    item(key = "my-team") {
                        RhMyTeamCard(
                            vm = vm,
                            fav = null,
                            openMatch = { nav.navigate("match/${it.id}") },
                            openTeam = { nav.navigate("team/$it") },
                            pickTeam = { runCatching { nav.navigate(Routes.Search) } },
                        )
                    }
                } else {
                item(key = "league-strip") {
                    RhTeamHubStrip(
                        fav = team,
                        competitionName = model.hubCompetitionName,
                        outlook = if (model.isRoshnHub) outlookSnapshot else null,
                        isRoshnHub = model.isRoshnHub,
                    )
                }

                if (myMatches.isNotEmpty()) {
                    item(key = "mine-title") { RhSectionTitle("مبارياتي", Modifier.padding(horizontal = 16.dp)) }
                    items(myMatches, key = { "mine-${it.id}" }) { fx ->
                        FixtureCard(fx, { nav.navigate("match/${fx.id}") }, Modifier.padding(horizontal = 16.dp))
                    }
                }

                if (featured != null) {
                    item(key = "hero") {
                        RhHeroCard(
                            f = featured,
                            isFavorite = featured.home.id == team.id || featured.away.id == team.id,
                            stats = rhHeroStats(featured, model.featuredStats, model.featuredXg),
                            commentLine = rhLatestCommentLine(model.commentary),
                            open = { nav.navigate("match/${featured.id}") },
                        )
                    }
                } else if (model.isRoshnHub && outlookSnapshot != null && !model.loading) {
                    item(key = "outlook") { RhOutlookCard(outlookSnapshot) }
                }

                item(key = "my-team") {
                    RhMyTeamCard(
                        vm = vm,
                        fav = team,
                        openMatch = { nav.navigate("match/${it.id}") },
                        openTeam = { nav.navigate("team/$it") },
                        pickTeam = { runCatching { nav.navigate(Routes.Search) } },
                    )
                }

                if (initialLoading) {
                    item(key = "loading") {
                        Box(Modifier.fillMaxWidth().padding(top = 26.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = c.accent)
                        }
                    }
                } else if (totalError) {
                    item(key = "error") {
                        VaraCard(Modifier.padding(horizontal = 16.dp)) {
                            EmptyState("تعذّر التحميل", model.loadError.orEmpty())
                        }
                    }
                } else {
                    // ذكاء VARA — يُخفى بالكامل بمفتاح الإظهار وفي الإنجليزية (نظير iOS).
                    if (account.smartSnapsVisible && account.language != "en") {
                        item(key = "insights") {
                            val favMatch = fav?.let { model.favoriteMatch(it.id) }
                            val upcoming = favMatch?.started == false
                            RhInsightCard(
                                nav = nav,
                                ctx = RhInsightContext(
                                    isLoggedIn = account.loggedIn,
                                    favoriteName = fav?.name,
                                    followsCount = account.follows.count { it.kind == "team" },
                                    activeAlerts = listOf(
                                        account.alerts.kickoff, account.alerts.goals, account.alerts.cards,
                                        account.alerts.varReview, account.alerts.fulltime,
                                    ).count { it },
                                    favoriteNextTitle = favMatch?.let { "${it.home.name} × ${it.away.name}" },
                                    favoriteNextKickoffMs = if (upcoming) favMatch?.kickoffMs else null,
                                    favoriteIsLive = favMatch?.status?.live == true,
                                    serverSnaps = model.snaps,
                                ),
                            )
                        }
                    }
                    if (model.standings.isNotEmpty() || model.scorers.isNotEmpty()) {
                        item(key = "pulse") { RhLeaguePulse(model.standings, model.scorers, fav) }
                    }
                    val gameweek = model.matches?.let { (it.today + it.upcoming).take(8) }.orEmpty()
                    if (gameweek.isNotEmpty()) {
                        item(key = "gameweek") { RhGameweekStrip(gameweek) { nav.navigate("match/${it.id}") } }
                    }
                    val displayResults = rhDisplayResults(model.matches, fav?.id)
                    if (displayResults.isNotEmpty()) {
                        item(key = "results") {
                            RhRecentResultsCard(displayResults, fav?.name) { nav.navigate("match/${it.id}") }
                        }
                    }
                    if (model.standings.isNotEmpty()) {
                        item(key = "title-race") {
                            RhTitleRaceCard(
                                standings = model.standings,
                                fav = fav,
                                openTeam = { nav.navigate("team/$it") },
                                openAll = { runCatching { nav.navigate(RoshnStandingsRoute) } },
                            )
                        }
                    }
                    if (rhDisplayScorers(model.scorers, fav?.id).isNotEmpty() || rhDisplayScorers(model.assists, fav?.id).isNotEmpty()) {
                        item(key = "scorers") {
                            RhScorersAssistsCard(
                                scorers = model.scorers,
                                assists = model.assists,
                                fav = fav,
                                openPlayer = { nav.navigate("player/$it") },
                                openAll = { runCatching { nav.navigate(RoshnScorersRoute) } },
                            )
                        }
                    }
                    if (model.transfers.isNotEmpty()) {
                        item(key = "transfers") {
                            RhTransfersCard(
                                transfers = model.transfers,
                                openTeam = { nav.navigate("team/$it") },
                                openCenter = { nav.navigate(Routes.Transfers) },
                            )
                        }
                    }
                }
                } // has favorite
                item(key = "bottom-space") { Spacer(Modifier.height(18.dp)) }
            }
        }
    }
}

// ────────────────────────────────────────────────────────────────────────
// الترويسة: شريط VARA + شريط الدوري
// ────────────────────────────────────────────────────────────────────────

@Composable
private fun RhTopBar(nav: NavHostController, account: AccountState) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Image(
            painterResource(R.drawable.ic_vara_foreground),
            contentDescription = null,
            modifier = Modifier.size(30.dp).clip(CircleShape).background(c.surface).border(1.dp, c.outline, CircleShape),
            contentScale = ContentScale.Crop,
        )
        Spacer(Modifier.width(3.dp))
        VaraWordmark(16)
        Spacer(Modifier.weight(1f))
        IconButton({ nav.navigate(Routes.Search) }) { Icon(Icons.Default.Search, "بحث", tint = c.text) }
        IconButton({ nav.navigate(Routes.ForYou) }) { Icon(Icons.Default.NotificationsNone, "لك", tint = c.text) }
        RhAccountButton(nav, account)
    }
}

/** مؤشّر الحساب: ضيف = حبّة «دخول» ذهبية؛ عضو = أفتار/حرف الاسم + نقطة خضراء. */
@Composable
private fun RhAccountButton(nav: NavHostController, account: AccountState) {
    val c = LocalVaraColors.current
    if (account.loggedIn) {
        Box(
            Modifier.size(36.dp).clickable { nav.navigate(Routes.Account) },
            contentAlignment = Alignment.Center,
        ) {
            val avatar = account.member?.avatar.orEmpty()
            if (avatar.isNotBlank()) {
                AsyncImage(
                    model = avatar,
                    contentDescription = "حسابي",
                    modifier = Modifier.size(32.dp).clip(CircleShape).border(1.dp, rhGreen(c).copy(alpha = .5f), CircleShape),
                    contentScale = ContentScale.Crop,
                )
            } else {
                val initial = account.member?.name?.trim().orEmpty().take(1).ifBlank { "؟" }
                Box(Modifier.size(32.dp).clip(CircleShape).background(rhGreen(c)), contentAlignment = Alignment.Center) {
                    Text(initial, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }
            Box(
                Modifier.align(Alignment.BottomEnd).size(10.dp).clip(CircleShape)
                    .background(Color(0xFF26C780)).border(2.dp, c.surface, CircleShape),
            )
        }
    } else {
        Button(
            onClick = { nav.navigate(Routes.Login) },
            contentPadding = PaddingValues(horizontal = 12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = c.gold, contentColor = Color(0xFF1C1405)),
        ) {
            Icon(Icons.Default.Person, null, Modifier.size(15.dp))
            Spacer(Modifier.width(6.dp))
            Text("دخول", fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/** ترويسة فريقي — شعار النادي (أو كأس لروشن) + الاسم + بطولته. */
@Composable
private fun RhTeamHubStrip(
    fav: FavoriteTeam,
    competitionName: String?,
    outlook: RhOutlook?,
    isRoshnHub: Boolean,
) {
    val c = LocalVaraColors.current
    val subtitle = competitionName?.takeIf { it.isNotBlank() }
        ?: fav.competitionName?.takeIf { it.isNotBlank() }
        ?: if (isRoshnHub) rhMetaText(outlook) else ""
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        if (isRoshnHub) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(c.surface).border(1.dp, c.outline, RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.EmojiEvents, null, tint = c.accent, modifier = Modifier.size(24.dp))
            }
        } else {
            RemoteLogo(fav.logo, fav.name, 40)
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(fav.name, color = c.text, fontSize = 19.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            if (subtitle.isNotBlank()) {
                Text(subtitle, color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
        }
    }
}

private fun rhMetaText(outlook: RhOutlook?): String {
    if (outlook != null) {
        return when (outlook.phase) {
            "in-season" -> "${outlook.season}/${outlook.season + 1}"
            "pre-season" -> outlook.daysUntilKickoff?.takeIf { it > 0 }?.let { "ينطلق خلال $it يومًا" }
                ?: "الموسم سينطلق قريبًا"
            "off-season" -> "خارج الموسم"
            else -> "${outlook.season}/${outlook.season + 1}"
        }
    }
    return "الموسم سينطلق قريبًا"
}

// ────────────────────────────────────────────────────────────────────────
// الهيرو
// ────────────────────────────────────────────────────────────────────────

private fun rhHeroStats(f: Fixture, rows: List<RhStatRow>, xg: RhXg?): List<Pair<String, String>> {
    if (!f.started) return emptyList()
    val out = mutableListOf<Pair<String, String>>()
    rhFindStat(rows, listOf("possession", "استحواذ"))?.let { out += "استحواذ" to it }
    rhFindStat(rows, listOf("total shots", "shots total", "إجمالي التسديدات", "تسديد"))?.let { out += "تسديدات" to it }
    if (xg != null) out += "xG" to String.format(Locale.US, "%.1f · %.1f", xg.home, xg.away)
    return out.take(3)
}

private fun rhFindStat(rows: List<RhStatRow>, keys: List<String>): String? {
    val row = rows.firstOrNull { r ->
        keys.any { k -> r.type.contains(k, ignoreCase = true) || r.label.contains(k, ignoreCase = true) }
    } ?: return null
    val h = row.home ?: return null
    val a = row.away ?: return null
    if (h == "—" && a == "—") return null
    return "$h · $a"
}

/** آخر مجرى بارز من التعليق الحي: أحدث مهم/هدف ضمن آخر 6 وإلا الأحدث مطلقًا. */
private fun rhLatestCommentLine(items: List<RhComment>): String? {
    if (items.isEmpty()) return null
    val sorted = items.sortedWith(compareByDescending<RhComment> { it.order }.thenByDescending { it.minute })
    val pick = sorted.take(6).firstOrNull { it.important || it.goal } ?: sorted.first()
    if (pick.displayText.isBlank()) return null
    val minute = pick.extra?.takeIf { it > 0 }?.let { "${pick.minute}+$it′" } ?: "${pick.minute}′"
    return "$minute · ${pick.displayText}"
}

/** سطر السياق للمباراة المنتهية: «انتهت بالتعادل» / «X حسمها/انتصر بفارق N». */
private fun rhHeroStoryLine(f: Fixture): String? {
    if (!f.status.finished) return null
    val home = f.homeScore ?: return null
    val away = f.awayScore ?: return null
    if (home == away) return "انتهت بالتعادل"
    val visualWinner = if (away > home) f.away.name else f.home.name
    val margin = kotlin.math.abs(home - away)
    return if (margin >= 3) "$visualWinner حسمها بفارق $margin" else "$visualWinner انتصر بفارق $margin"
}

private fun rhKickoffDay(f: Fixture): String {
    val instant = VaraFormat.instantOf(f) ?: return ""
    val date = VaraFormat.localDate(instant)
    val today = VaraFormat.today()
    return when (date) {
        today -> "اليوم"
        today.plusDays(1) -> "غدًا"
        else -> VaraFormat.weekdayName(instant)
    }
}

@Composable
private fun RhHeroCard(
    f: Fixture,
    isFavorite: Boolean,
    stats: List<Pair<String, String>>,
    commentLine: String?,
    open: () -> Unit,
) {
    val c = LocalVaraColors.current
    val shape = RoundedCornerShape(26.dp)
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(shape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), shape)
            .clickable(onClick = open).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(15.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.weight(1f)) {
                if (isFavorite) Icon(Icons.Default.Star, null, tint = c.accent, modifier = Modifier.size(11.dp))
                val head = if (isFavorite) "فريقي المفضّل" else "دوري روشن"
                Text(
                    if (f.round.isBlank()) head else "$head · ${f.round}",
                    color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            RhHeroStatusBadge(f)
            Icon(Icons.Default.ChevronLeft, null, tint = c.textFaint, modifier = Modifier.size(14.dp))
        }

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RhHeroTeam(f.home, Modifier.weight(1f))
            RhHeroScore(f)
            RhHeroTeam(f.away, Modifier.weight(1f))
        }

        if (f.status.finished) {
            rhHeroStoryLine(f)?.let { story -> RhHeroContextLine(Icons.Default.CheckCircle, story) }
        }

        if (stats.isNotEmpty()) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                stats.forEach { (label, value) ->
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(11.dp)).background(c.chip).padding(vertical = 7.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(label, color = c.textDim, fontSize = 9.5.sp, fontWeight = FontWeight.Bold)
                        ForceLtr { Text(value, color = c.text, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                    }
                }
            }
        }

        // آخر مجريات المباراة الحيّة — سطر واحد من التعليق العربي.
        if (f.status.live && commentLine != null) {
            RhHeroContextLine(Icons.Default.Bolt, commentLine)
        }
    }
}

@Composable
private fun RhHeroContextLine(icon: ImageVector, text: String) {
    val c = LocalVaraColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Icon(icon, null, tint = c.accent, modifier = Modifier.size(14.dp))
        Text(text, color = c.textDim, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun RhHeroTeam(team: Team, modifier: Modifier = Modifier) {
    val c = LocalVaraColors.current
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(9.dp)) {
        RemoteLogo(team.logo, team.name, 56)
        Text(
            team.name, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun RhHeroScore(f: Fixture) {
    val c = LocalVaraColors.current
    Column(
        Modifier.widthIn(min = 86.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (f.started) {
            // قاعدة النتيجة: الضيف أولًا داخل LTR كي يبقى المضيف يمينًا في RTL.
            ForceLtr {
                Text(
                    "${f.awayScore ?: 0} - ${f.homeScore ?: 0}",
                    color = c.text, fontSize = 36.sp, fontWeight = FontWeight.Bold,
                )
            }
            Text(if (f.status.finished) "انتهت" else "مباشر", color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
        } else {
            ForceLtr {
                Text(
                    VaraFormat.time(VaraFormat.instantOf(f)),
                    color = c.text, fontSize = 30.sp, fontWeight = FontWeight.Bold,
                )
            }
            Text(rhKickoffDay(f), color = c.textDim, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
    }
}

@Composable
private fun RhHeroStatusBadge(f: Fixture) {
    val c = LocalVaraColors.current
    when {
        f.status.live -> Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.clip(CircleShape).background(c.live).padding(horizontal = 9.dp, vertical = 5.dp),
        ) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(Color.White))
            Text("مباشر", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            LiveMinuteText(f.status, Color.White, 11)
        }
        f.status.finished -> Text(
            "انتهت", color = c.textDim, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(CircleShape).background(c.chip).padding(horizontal = 9.dp, vertical = 5.dp),
        )
        else -> Text(
            "قادمة", color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(CircleShape).background(c.accent.copy(alpha = .10f)).padding(horizontal = 9.dp, vertical = 5.dp),
        )
    }
}

// ────────────────────────────────────────────────────────────────────────
// بطاقة «نظرة الموسم» الاحتياطية (نظير SpOutlookCard) + العدّاد
// ────────────────────────────────────────────────────────────────────────

@Composable
private fun RhOutlookCard(outlook: RhOutlook) {
    val c = LocalVaraColors.current
    val green = rhGreen(c)
    VaraCard(Modifier.padding(horizontal = 16.dp)) {
        Column(Modifier.fillMaxWidth().padding(4.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Default.EmojiEvents, null, tint = green, modifier = Modifier.size(18.dp))
                Text("دوري روشن", color = c.text, fontSize = 19.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                RhOutlookStatusPill(outlook.phase)
            }

            outlook.champion?.let { champion -> RhChampionShowcase(champion, outlook.season) }

            Text(
                when (outlook.phase) {
                    "off-season" -> "بانتظار جدول الموسم الجديد — وإليك بطل الموسم الماضي."
                    "pre-season" -> "العدّ التنازلي لانطلاق الموسم الجديد ومبارياته الأولى."
                    else -> "كل ما يخصّ الموسم في مكان واحد."
                },
                color = c.textDim, fontSize = 12.sp, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )

            outlook.firstKickoffMs?.let { ts ->
                Column(
                    Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("انطلاق الموسم القادم", color = c.textDim, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    CountdownChips(ts)
                }
            }

            if (outlook.openers.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("مباريات الافتتاح", color = c.textDim, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    outlook.openers.take(3).forEach { f -> RhOpenerRow(f) }
                }
            }
        }
    }
}

@Composable
private fun RhOutlookStatusPill(phase: String) {
    val c = LocalVaraColors.current
    val green = rhGreen(c)
    val (label, icon) = when (phase) {
        "off-season" -> "في العطلة" to Icons.Default.WbSunny
        "pre-season" -> "استعداد للموسم" to Icons.Default.CalendarMonth
        else -> "نظرة الموسم" to Icons.Default.SportsSoccer
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
        modifier = Modifier.clip(CircleShape).background(green.copy(alpha = .12f)).padding(horizontal = 11.dp, vertical = 5.dp),
    ) {
        Icon(icon, null, tint = green, modifier = Modifier.size(12.dp))
        Text(label, color = green, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

/** منصّة تتويج: تاج + شعار البطل في حلقة خضراء + اسم البطل بارز. */
@Composable
private fun RhChampionShowcase(champion: Team, season: Int) {
    val c = LocalVaraColors.current
    val green = rhGreen(c)
    Column(
        Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Default.WorkspacePremium, null, tint = green, modifier = Modifier.size(22.dp))
        Box(
            Modifier.size(94.dp).clip(CircleShape).background(Color.White).border(3.dp, green, CircleShape).padding(14.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (champion.logo.isNotBlank()) {
                AsyncImage(model = champion.logo, contentDescription = champion.name, modifier = Modifier.fillMaxSize())
            } else {
                Text(champion.name.take(2), color = c.accentDeep, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            }
        }
        Text(
            "بطل موسم $season/${season + 1}",
            color = green, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(CircleShape).background(green.copy(alpha = .15f)).padding(horizontal = 12.dp, vertical = 4.dp),
        )
        Text(champion.name, color = c.text, fontSize = 26.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

@Composable
private fun RhOpenerRow(f: Fixture) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.chip).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // نفس ترتيب المواجهة الصحيح: اسم←شعار | وقت | شعار←اسم.
        TeamLabel(
            name = f.home.name, color = c.text, fontSize = 13.sp, maxLines = 2,
            textAlign = TextAlign.End, modifier = Modifier.weight(1f),
        )
        RemoteLogo(f.home.logo, f.home.name, 28)
        ForceLtr {
            Text(VaraFormat.time(VaraFormat.instantOf(f)), color = rhGreen(c), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        RemoteLogo(f.away.logo, f.away.name, 28)
        TeamLabel(
            name = f.away.name, color = c.text, fontSize = 13.sp, maxLines = 2,
            textAlign = TextAlign.Start, modifier = Modifier.weight(1f),
        )
    }
}

// ────────────────────────────────────────────────────────────────────────
// بطاقة الفريق المفضّل (نظير SpMyTeamCard) — جدول موحّد عبر 5 بطولات
// ────────────────────────────────────────────────────────────────────────

@Composable
private fun RhMyTeamCard(
    vm: VaraViewModel,
    fav: FavoriteTeam?,
    openMatch: (Fixture) -> Unit,
    openTeam: (Int) -> Unit,
    pickTeam: () -> Unit,
) {
    val c = LocalVaraColors.current
    var fixtures by remember(fav?.id) { mutableStateOf<List<Fixture>>(emptyList()) }
    var loaded by remember(fav?.id) { mutableStateOf(false) }

    LaunchedEffect(fav?.id) {
        if (fav == null) return@LaunchedEffect
        // أسبوعان للخلف (آخر النتائج) ← 60 يومًا للأمام (المباراة القادمة ولو بعيدة).
        runCatching {
            val now = Instant.now()
            vm.api.publicGet(
                "/sports/fixtures",
                mapOf(
                    "comps" to rhTeamComps(fav.competitionSlug),
                    "from" to VaraFormat.dateKey(now.minus(Duration.ofDays(14))),
                    "to" to VaraFormat.dateKey(now.plus(Duration.ofDays(60))),
                ),
            )
        }.getOrNull()?.let { root ->
            fixtures = findArray(root, "fixtures", "matches", "items").mapNotNull(::parseFixture)
        }
        loaded = true
    }

    if (fav == null) {
        // بطاقة الدعوة — النقر يفتح الترتيب الكامل (نظير onPickTeam → showAllStandings).
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(VaraCardShape).background(c.surface)
                .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape)
                .clickable(onClick = pickTeam).padding(13.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(13.dp),
        ) {
            Icon(Icons.Default.Stars, null, tint = rhGreen(c), modifier = Modifier.size(34.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text("اختر فريقك المفضّل", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Text(
                    "تابع مبارياته عبر كل البطولات من هنا — النجمة في صفحة النادي",
                    color = c.textDim, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, lineHeight = 16.sp,
                )
            }
            Icon(Icons.Default.ChevronLeft, null, tint = c.textFaint)
        }
        return
    }

    val mine = fixtures.filter { it.home.id == fav.id || it.away.id == fav.id }
    val upcoming = mine.filter { !it.started }.sortedBy { it.kickoffMs ?: Long.MAX_VALUE }.take(3)
    val lastResults = mine.filter { it.status.finished }.sortedByDescending { it.kickoffMs ?: 0L }.take(3)

    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(VaraCardShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape),
    ) {
        Row(
            Modifier.fillMaxWidth().clickable { openTeam(fav.id) }
                .padding(start = 14.dp, end = 14.dp, top = 14.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            RemoteLogo(fav.logo, fav.name, 22)
            Text(
                "مباريات ${fav.name} القادمة",
                color = c.text, fontSize = 16.sp, fontWeight = FontWeight.Bold,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
            )
            Text("صفحة الفريق", color = c.textDim, fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
            Icon(Icons.Default.ChevronLeft, null, tint = c.textDim, modifier = Modifier.size(13.dp))
        }
        if (upcoming.isNotEmpty()) {
            upcoming.forEachIndexed { idx, f ->
                if (idx > 0) Box(Modifier.padding(horizontal = 14.dp)) { VaraDivider() }
                Column(
                    Modifier.fillMaxWidth().clickable { openMatch(f) }.padding(horizontal = 14.dp, vertical = 11.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    RhScoreRow(f)
                    if (f.competitionName.isNotBlank()) {
                        Text(
                            f.competitionName, color = c.accent, fontSize = 9.5.sp, fontWeight = FontWeight.Bold,
                            modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        } else if (loaded) {
            Text(
                "لا مباريات قادمة مجدولة حاليًا",
                color = c.textDim, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            )
        }
        if (lastResults.isNotEmpty()) {
            Column(Modifier.padding(top = 6.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(
                    "آخر النتائج", color = c.textDim, fontSize = 10.5.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 14.dp),
                )
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    lastResults.forEach { f -> RhResultChip(f, fav.id) { openMatch(f) } }
                }
            }
        } else {
            Spacer(Modifier.height(10.dp))
        }
    }
}

/** صفّ مواجهة مضغوط داخل بطاقة المفضّل — المضيف يمينًا والمركز نتيجة/وقت. */
@Composable
private fun RhScoreRow(f: Fixture) {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TeamLabel(
                name = f.home.name, color = c.text, fontSize = 13.sp, maxLines = 2,
                textAlign = TextAlign.End, modifier = Modifier.weight(1f),
            )
            RemoteLogo(f.home.logo, f.home.name, 26)
        }
        Column(Modifier.padding(horizontal = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            FixtureCenter(f, scoreSize = 16)
        }
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            RemoteLogo(f.away.logo, f.away.name, 26)
            TeamLabel(
                name = f.away.name, color = c.text, fontSize = 13.sp, maxLines = 2,
                textAlign = TextAlign.Start, modifier = Modifier.weight(1f),
            )
        }
    }
}

/** شريحة نتيجة: حرف ف/ت/خ ملوّن + شعار الخصم + النتيجة (ضيف أولًا داخل LTR). */
@Composable
private fun RhResultChip(f: Fixture, favId: Int, open: () -> Unit) {
    val c = LocalVaraColors.current
    val isHome = f.home.id == favId
    val ours = (if (isHome) f.homeScore else f.awayScore) ?: 0
    val theirs = (if (isHome) f.awayScore else f.homeScore) ?: 0
    val (letter, tint) = when {
        ours > theirs -> "ف" to rhGreen(c)
        ours < theirs -> "خ" to c.live
        else -> "ت" to c.textFaint
    }
    val opponent = if (isHome) f.away else f.home
    Row(
        Modifier.clip(CircleShape).background(c.chip).border(1.dp, c.outline, CircleShape)
            .clickable(onClick = open).padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Box(Modifier.size(20.dp).clip(CircleShape).background(tint), contentAlignment = Alignment.Center) {
            Text(letter, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        RemoteLogo(opponent.logo, opponent.name, 18)
        ForceLtr {
            Text("${f.awayScore ?: 0}-${f.homeScore ?: 0}", color = c.text, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
        }
    }
}

// ────────────────────────────────────────────────────────────────────────
// بطاقة ذكاء VARA (نظير VaraInsightCard) — TabView أفقي بنقاط مؤشّر حقيقية
// ────────────────────────────────────────────────────────────────────────

@Composable
private fun RhInsightCard(nav: NavHostController, ctx: RhInsightContext) {
    val c = LocalVaraColors.current
    val green = rhGreen(c)
    val context = LocalContext.current
    // إعادة الحساب كل دقيقة (نظير TimelineView(.everyMinute)).
    val nowMs by produceState(System.currentTimeMillis(), ctx) {
        while (true) {
            delay(60_000L)
            value = System.currentTimeMillis()
        }
    }
    val items = remember(ctx, nowMs) { RhInsightsEngine.generate(ctx, nowMs).take(4) }
    if (items.isEmpty()) return
    val itemsState = rememberUpdatedState(items)
    val pager = rememberPagerState { itemsState.value.size }

    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(VaraCardShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Default.AutoAwesome, null, tint = green, modifier = Modifier.size(13.dp))
            ForceLtr { Text("ذكاء VARA", color = green, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
            Spacer(Modifier.weight(1f))
            if (items.size > 1) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    repeat(items.size) { i ->
                        Box(
                            Modifier.size(5.dp).clip(CircleShape).background(
                                if (i == pager.currentPage.coerceIn(0, items.size - 1)) green else c.textFaint.copy(alpha = .35f),
                            ),
                        )
                    }
                }
            }
        }
        HorizontalPager(state = pager, modifier = Modifier.fillMaxWidth()) { page ->
            val ins = itemsState.value.getOrNull(page) ?: return@HorizontalPager
            val accent = rhInsightColor(ins.accent, c)
            val link = ins.deeplink
            Row(
                Modifier.fillMaxWidth()
                    .let { m -> if (link != null) m.clickable { rhOpenDeeplink(nav, context, link) } else m },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(Modifier.size(38.dp).clip(CircleShape).background(accent.copy(alpha = .12f)), contentAlignment = Alignment.Center) {
                    Icon(ins.icon, null, tint = accent, modifier = Modifier.size(18.dp))
                }
                Text(
                    ins.text, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                    maxLines = 3, overflow = TextOverflow.Ellipsis, lineHeight = 19.sp, modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

private fun rhInsightColor(accent: RhInsightAccent, c: VaraColors): Color = when (accent) {
    RhInsightAccent.GREEN -> rhGreen(c)
    RhInsightAccent.GOLD -> c.gold
    RhInsightAccent.CRIMSON -> c.live
}

/** فتح deeplink اللقطة: sabqsports:// داخليًا، وغيره في المتصفح. */
private fun rhOpenDeeplink(nav: NavHostController, context: android.content.Context, link: String) {
    val uri = runCatching { Uri.parse(link) }.getOrNull() ?: return
    if (uri.scheme == "sabqsports" || uri.scheme == "sabq") {
        val id = uri.lastPathSegment?.toIntOrNull()
        val route = when (uri.host) {
            "match" -> id?.let { "match/$it" }
            "team" -> id?.let { "team/$it" }
            "player" -> id?.let { "player/$it" }
            "transfers" -> Routes.Transfers
            "predictions" -> Routes.Predictions
            "roshn" -> Routes.Roshn
            else -> null
        }
        route?.let { runCatching { nav.navigate(it) } }
    } else {
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
    }
}

// ────────────────────────────────────────────────────────────────────────
// نبض الدوري — بلاطات أفقية محسوبة محليًا (نظير leaguePulse)
// ────────────────────────────────────────────────────────────────────────

private data class RhPulseTile(val label: String, val value: String, val sub: String, val logo: String?)

private fun rhPulseTiles(
    favoriteRow: Standing?,
    leader: Standing?,
    topScorer: RhScorer?,
    bestAtk: Standing?,
    bestDef: Standing?,
    gap: Int?,
): List<RhPulseTile> {
    val tiles = mutableListOf<RhPulseTile>()
    if (favoriteRow != null) {
        tiles += RhPulseTile("المركز", "${favoriteRow.rank}", "${favoriteRow.points} نقطة", favoriteRow.team.logo)
        tiles += RhPulseTile("لعب", "${favoriteRow.played}", "${favoriteRow.won} فوز", null)
        tiles += RhPulseTile("سجّل", "${favoriteRow.goalsFor ?: 0}", "هدف", null)
        tiles += RhPulseTile("استقبل", "${favoriteRow.goalsAgainst ?: 0}", "هدف", null)
        if (topScorer != null && topScorer.team.id == favoriteRow.team.id) {
            tiles += RhPulseTile("هداف الفريق", topScorer.name, "${topScorer.goals} هدف", topScorer.team.logo)
        }
        return tiles
    }
    leader?.let { tiles += RhPulseTile("المتصدّر", it.team.name, "${it.points} نقطة", it.team.logo) }
    topScorer?.let { tiles += RhPulseTile("الهدّاف", it.name, "${it.goals} هدف", it.team.logo) }
    bestAtk?.let { tiles += RhPulseTile("أقوى هجوم", it.team.name, "${it.goalsFor ?: 0} هدف", it.team.logo) }
    bestDef?.let { tiles += RhPulseTile("أمنع دفاع", it.team.name, "${it.goalsAgainst ?: 0} عليه", it.team.logo) }
    gap?.let { tiles += RhPulseTile("فارق الصدارة", if (it == 0) "متساويان" else "$it نقطة", "على الوصيف", null) }
    return tiles
}

@Composable
private fun RhLeaguePulse(standings: List<Standing>, scorers: List<RhScorer>, fav: FavoriteTeam?) {
    val c = LocalVaraColors.current
    val leader = standings.firstOrNull()
    val favoriteRow = fav?.let { f -> standings.firstOrNull { it.team.id == f.id } }
    val topScorer = fav?.let { f -> scorers.firstOrNull { it.team.id == f.id } } ?: scorers.firstOrNull()
    val bestAtk = standings.maxByOrNull { it.goalsFor ?: 0 }
    val bestDef = standings.minByOrNull { it.goalsAgainst ?: Int.MAX_VALUE }
    val gap = if (standings.size >= 2) standings[0].points - standings[1].points else null
    val tiles = rhPulseTiles(favoriteRow, leader, topScorer, bestAtk, bestDef, gap)
    if (tiles.isEmpty()) return

    Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            RhSectionTitle(fav?.name?.let { "نبض $it" } ?: "نبض الدوري", Modifier.weight(1f))
            if (favoriteRow != null) {
                Text("المركز ${favoriteRow.rank}", color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            } else if (gap != null) {
                Text(
                    if (gap == 0) "صدارة مشتعلة" else "الفارق $gap نقطة",
                    color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                )
            }
        }
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            Row(
                Modifier.clip(VaraTileShape).background(c.surface)
                    .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraTileShape),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                tiles.forEachIndexed { idx, t ->
                    if (idx > 0) Box(Modifier.width(1.dp).height(38.dp).background(c.outline))
                    RhPulseTileView(t)
                }
            }
        }
    }
}

@Composable
private fun RhPulseTileView(t: RhPulseTile) {
    val c = LocalVaraColors.current
    // «الهدّاف» و«المتصدّر» وحدهما بذهبيّ التميّز؛ البقية رمادية.
    val highlight = if (t.label == "الهدّاف" || t.label == "المتصدّر") c.gold else c.textDim
    Column(
        Modifier.width(112.dp).padding(horizontal = 13.dp, vertical = 11.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Text(t.label, color = c.textDim, fontSize = 9.5.sp, fontWeight = FontWeight.Bold)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            t.logo?.takeIf { it.isNotBlank() }?.let { RemoteLogo(it, t.value, 17) }
            Text(
                t.value, color = c.text, fontSize = 12.5.sp, fontWeight = FontWeight.Bold,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Text(t.sub, color = highlight, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// ────────────────────────────────────────────────────────────────────────
// جولة هذا الأسبوع — شريط أفقي (نظير gameweekStrip)
// ────────────────────────────────────────────────────────────────────────

@Composable
private fun RhGameweekStrip(items: List<Fixture>, open: (Fixture) -> Unit) {
    val c = LocalVaraColors.current
    Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
        RhSectionTitle("جولة هذا الأسبوع", Modifier.padding(horizontal = 16.dp))
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items.forEach { f ->
                Column(
                    Modifier.width(212.dp).clip(RoundedCornerShape(18.dp)).background(c.surface)
                        .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), RoundedCornerShape(18.dp))
                        .clickable { open(f) }.padding(13.dp),
                ) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            rhKickoffDay(f), color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                            maxLines = 1, modifier = Modifier.weight(1f),
                        )
                        ForceLtr {
                            Text(VaraFormat.time(VaraFormat.instantOf(f)), color = c.textDim, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Spacer(Modifier.height(11.dp))
                    RhGameweekTeamLine(f.home)
                    Box(Modifier.padding(vertical = 4.dp)) { VaraDivider() }
                    RhGameweekTeamLine(f.away)
                }
            }
        }
    }
}

@Composable
private fun RhGameweekTeamLine(team: Team) {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
        RemoteLogo(team.logo, team.name, 28)
        Text(
            team.name, color = c.text, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

// ────────────────────────────────────────────────────────────────────────
// آخر النتائج (نظير recentResultsCard)
// ────────────────────────────────────────────────────────────────────────

private fun rhDisplayResults(matches: RhMatches?, favId: Int?): List<Fixture> {
    val rows = matches?.results.orEmpty()
    if (favId == null) return rows.take(4)
    return rows.filter { it.home.id == favId || it.away.id == favId }.take(4)
}

@Composable
private fun RhRecentResultsCard(results: List<Fixture>, favName: String?, open: (Fixture) -> Unit) {
    val c = LocalVaraColors.current
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
        RhSectionTitle(favName?.let { "آخر نتائج $it" } ?: "آخر النتائج")
        Column(
            Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)
                .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape),
        ) {
            results.forEachIndexed { idx, f ->
                if (idx > 0) VaraDivider()
                Row(
                    Modifier.fillMaxWidth().clickable { open(f) }.padding(horizontal = 14.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        TeamLabel(
                            name = f.home.name, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                            maxLines = 2, textAlign = TextAlign.End, modifier = Modifier.weight(1f),
                        )
                        RemoteLogo(f.home.logo, f.home.name, 26)
                    }
                    ForceLtr {
                        Text(
                            "${f.awayScore ?: 0} - ${f.homeScore ?: 0}",
                            color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center, modifier = Modifier.width(52.dp),
                        )
                    }
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        RemoteLogo(f.away.logo, f.away.name, 26)
                        TeamLabel(
                            name = f.away.name, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                            maxLines = 2, textAlign = TextAlign.Start, modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

// ────────────────────────────────────────────────────────────────────────
// سباق اللقب (نظير titleRaceCard) — نافذة حول المفضّل أو أعلى 3
// ────────────────────────────────────────────────────────────────────────

@Composable
private fun RhTitleRaceCard(
    standings: List<Standing>,
    fav: FavoriteTeam?,
    openTeam: (Int) -> Unit,
    openAll: () -> Unit,
) {
    val c = LocalVaraColors.current
    val leader = standings.firstOrNull()
    val favIdx = fav?.let { f -> standings.indexOfFirst { it.team.id == f.id }.takeIf { it >= 0 } }
    val rows = if (favIdx != null) {
        standings.subList(maxOf(0, favIdx - 1), minOf(standings.size, favIdx + 2))
    } else {
        standings.take(3)
    }

    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            RhSectionTitle(fav?.name?.let { "ترتيب $it" } ?: "سباق اللقب", Modifier.weight(1f))
            Row(Modifier.clickable(onClick = openAll), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                Text("الترتيب الكامل", color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Icon(Icons.Default.ChevronLeft, null, tint = c.accent, modifier = Modifier.size(13.dp))
            }
        }
        Column(
            Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)
                .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape)
                .padding(horizontal = 15.dp),
        ) {
            rows.forEachIndexed { idx, row ->
                val isFavorite = fav?.id == row.team.id
                if (idx > 0) VaraDivider()
                Row(
                    Modifier.fillMaxWidth()
                        .padding(vertical = 2.dp)
                        .clip(RoundedCornerShape(13.dp))
                        .background(if (isFavorite) c.accent.copy(alpha = .055f) else Color.Transparent)
                        .clickable { openTeam(row.team.id) }
                        .padding(vertical = 8.dp, horizontal = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp),
                ) {
                    Text(
                        "${row.rank}", color = rhZoneColor(row.rank, c), fontSize = 13.sp,
                        fontWeight = FontWeight.Bold, modifier = Modifier.width(16.dp),
                    )
                    RemoteLogo(row.team.logo, row.team.name, 28)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text(
                            row.team.name, color = c.text, fontSize = 13.5.sp, fontWeight = FontWeight.Bold,
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                        RhFormDots(row.form)
                    }
                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            buildAnnotatedString {
                                withStyle(SpanStyle(fontSize = 15.5.sp, fontWeight = FontWeight.Bold)) { append("${row.points}") }
                                withStyle(SpanStyle(fontSize = 9.5.sp, fontWeight = FontWeight.SemiBold, color = c.textDim)) { append(" نقطة") }
                            },
                            color = c.text,
                        )
                        Text(
                            rhTitleRaceGap(row, leader),
                            color = if (isFavorite || row.rank == 1) c.accent else c.textFaint,
                            fontSize = 9.5.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

private fun rhTitleRaceGap(row: Standing, leader: Standing?): String {
    leader ?: return ""
    if (row.rank == 1) return "المتصدر"
    val gap = leader.points - row.points
    return if (gap == 0) "متساوٍ" else "-$gap"
}

/** نقاط الفورمة (آخر 5): فوز دائرة معبأة، خسارة حلقة، تعادل باهت. */
@Composable
private fun RhFormDots(form: String) {
    val c = LocalVaraColors.current
    val chars = form.replace(" ", "").takeLast(5).toList()
    if (chars.isEmpty()) {
        Text("—", color = c.textFaint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        return
    }
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        chars.forEach { ch ->
            when (ch.uppercaseChar()) {
                'W' -> Box(Modifier.size(8.dp).clip(CircleShape).background(c.accent))
                'L' -> Box(Modifier.size(8.dp).clip(CircleShape).border(1.3.dp, c.textFaint, CircleShape))
                else -> Box(Modifier.size(8.dp).clip(CircleShape).background(c.textFaint.copy(alpha = .5f)))
            }
        }
    }
}

private fun rhZoneColor(rank: Int, c: VaraColors): Color = if (rank <= 3) c.accent else c.textFaint

// ────────────────────────────────────────────────────────────────────────
// الهدّافون ⇄ الصنّاع (نظير scorersAssistsCard)
// ────────────────────────────────────────────────────────────────────────

private fun rhDisplayScorers(rows: List<RhScorer>, favId: Int?): List<RhScorer> {
    if (favId == null) return rows.take(3)
    return rows.filter { it.team.id == favId }.take(3)
}

@Composable
private fun RhScorersAssistsCard(
    scorers: List<RhScorer>,
    assists: List<RhScorer>,
    fav: FavoriteTeam?,
    openPlayer: (Int) -> Unit,
    openAll: () -> Unit,
) {
    val c = LocalVaraColors.current
    var goalsMode by remember { mutableStateOf(true) }
    val rows = rhDisplayScorers(if (goalsMode) scorers else assists, fav?.id)

    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            RhSectionTitle(
                if (goalsMode) (fav?.name?.let { "هدّافو $it" } ?: "الهدّافون")
                else (fav?.name?.let { "صنّاع $it" } ?: "صنّاع الأهداف"),
                Modifier.weight(1f),
            )
            Row(Modifier.clickable(onClick = openAll), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                Text("الكل", color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Icon(Icons.Default.ChevronLeft, null, tint = c.accent, modifier = Modifier.size(13.dp))
            }
        }
        if (assists.isNotEmpty()) {
            RhScorerModeToggle(goalsMode) { goalsMode = it }
        }
        Column(
            Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)
                .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape),
        ) {
            if (rows.isEmpty()) {
                EmptyState("لا تتوفّر بيانات", "قد يكون الموسم لم يبدأ بعد")
            } else {
                rows.forEachIndexed { idx, s ->
                    if (idx > 0) VaraDivider()
                    RhScorerRow(s, goalsMode, compact = true) { openPlayer(s.id) }
                }
            }
        }
    }
}

@Composable
private fun RhScorerModeToggle(goalsMode: Boolean, choose: (Boolean) -> Unit) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.chip).padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        listOf(true to "هدّافون", false to "صنّاع").forEach { (mode, label) ->
            val active = goalsMode == mode
            Box(
                Modifier.weight(1f).clip(RoundedCornerShape(9.dp))
                    .background(if (active) c.surface else Color.Transparent)
                    .clickable { choose(mode) }.padding(vertical = 7.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label, fontSize = 12.5.sp,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.SemiBold,
                    color = if (active) c.text else c.textDim,
                )
            }
        }
    }
}

/** صفّ لاعب — الرقم الأساسي بلون البطولة والثانوي رمادي، وصورة بشارة شعار الفريق. */
@Composable
private fun RhScorerRow(s: RhScorer, goalsMode: Boolean, compact: Boolean, open: () -> Unit) {
    val c = LocalVaraColors.current
    val primary = if (goalsMode) s.goals else s.assists
    val primaryLabel = if (goalsMode) "هدف" else "صناعة"
    val secondary = if (goalsMode) s.assists else s.goals
    val secondaryLabel = if (goalsMode) "صناعة" else "هدف"
    val avatarSize = if (compact) 34 else 40
    Row(
        Modifier.fillMaxWidth().clickable(onClick = open)
            .padding(horizontal = 14.dp, vertical = if (compact) 8.dp else 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(if (compact) 9.dp else 11.dp),
    ) {
        Text(
            "${s.rank}", color = if (s.rank in 1..3) c.accent else c.textFaint,
            fontSize = if (compact) 12.5.sp else 13.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.width(if (compact) 18.dp else 22.dp),
        )
        RhPlayerAvatar(s.photo, s.team.logo, avatarSize)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                s.name, color = c.text, fontSize = if (compact) 13.5.sp else 14.sp, fontWeight = FontWeight.Bold,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Text(
                s.team.name, color = c.textDim, fontSize = if (compact) 10.5.sp else 11.sp,
                fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text("$primary", color = c.accent, fontSize = if (compact) 16.sp else 18.sp, fontWeight = FontWeight.Bold)
            Text(primaryLabel, color = c.textFaint, fontSize = 8.5.sp)
        }
        if (secondary > 0) {
            Column(
                Modifier.width(if (compact) 36.dp else 42.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(1.dp),
            ) {
                Text("$secondary", color = c.textDim, fontSize = if (compact) 13.5.sp else 15.sp, fontWeight = FontWeight.Bold)
                Text(secondaryLabel, color = c.textFaint, fontSize = 8.5.sp)
            }
        }
    }
}

/** صورة اللاعب الدائرية + شارة شعار فريقه (نظير playerAvatar). */
@Composable
private fun RhPlayerAvatar(photo: String, teamLogo: String, size: Int) {
    val c = LocalVaraColors.current
    Box(Modifier.size((size + 4).dp)) {
        Box(
            Modifier.size(size.dp).clip(CircleShape).background(c.chip).border(1.dp, c.outline, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (photo.isNotBlank()) {
                AsyncImage(model = photo, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            } else {
                Icon(Icons.Default.Person, null, tint = c.textFaint, modifier = Modifier.size((size / 2).dp))
            }
        }
        if (teamLogo.isNotBlank()) {
            Box(Modifier.align(Alignment.BottomEnd)) {
                RemoteLogo(teamLogo, "", (size * 0.46).toInt())
            }
        }
    }
}

// ────────────────────────────────────────────────────────────────────────
// مركز الانتقالات — معاينة 3 صفقات (نظير transfersCard/transferRow)
// ────────────────────────────────────────────────────────────────────────

@Composable
private fun RhTransfersCard(transfers: List<RhTransfer>, openTeam: (Int) -> Unit, openCenter: () -> Unit) {
    val c = LocalVaraColors.current
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
        Row(
            Modifier.fillMaxWidth().clickable(onClick = openCenter),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            RhSectionTitle("مركز الانتقالات", Modifier.weight(1f))
            Text("المركز الكامل", color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Icon(Icons.Default.ChevronLeft, null, tint = c.accent, modifier = Modifier.size(14.dp))
        }
        Column(
            Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)
                .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape),
        ) {
            transfers.take(3).forEachIndexed { idx, t ->
                if (idx > 0) VaraDivider()
                RhTransferRow(t, openTeam)
            }
        }
    }
}

/** صفّ انتقال روشن: أفتار + شارة نادي الوجهة + من ← إلى + وسوم — النقر يفتح نادي الوجهة. */
@Composable
private fun RhTransferRow(t: RhTransfer, openTeam: (Int) -> Unit) {
    val c = LocalVaraColors.current
    val toRoshn = t.inClubId != null
    val dest = if (toRoshn) t.to else t.from
    val photo = t.playerId?.let { "https://media.api-sports.io/football/players/$it.png" }.orEmpty()
    Row(
        Modifier.fillMaxWidth()
            .clickable(enabled = dest.id > 0) { openTeam(dest.id) }
            .padding(horizontal = 13.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        RhPlayerAvatar(photo, dest.logo, 38)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                t.player, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                RhPartyChip(t.from, emphasize = false)
                ForceLtr {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = c.textFaint, modifier = Modifier.size(12.dp))
                }
                RhPartyChip(t.to, emphasize = true)
            }
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            // وسم «مؤكّدة» — فيد روشن يعرض الصفقات المؤكّدة فقط (نظير TcCertaintyTag).
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                Icon(Icons.Default.CheckCircle, null, tint = rhGreen(c), modifier = Modifier.size(11.dp))
                Text("مؤكّدة", color = rhGreen(c), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
            when (t.kind) {
                "loan" -> Text("إعارة", color = rhTeal(c), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                "free" -> Text("انتقال حر", color = rhGreen(c), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

/** شعار نادٍ صغير + اسم (نظير TcPartyChip). */
@Composable
private fun RhPartyChip(club: RhClub, emphasize: Boolean) {
    val c = LocalVaraColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        if (club.logo.isNotBlank()) RemoteLogo(club.logo, club.name, 18)
        Text(
            club.name.ifBlank { "—" },
            color = if (emphasize) c.text else c.textDim,
            fontSize = 13.sp,
            fontWeight = if (emphasize) FontWeight.Bold else FontWeight.SemiBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

// ────────────────────────────────────────────────────────────────────────
// أدوات مشتركة داخل الملف
// ────────────────────────────────────────────────────────────────────────

@Composable
private fun RhSectionTitle(title: String, modifier: Modifier = Modifier) {
    Text(title, color = LocalVaraColors.current.text, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = modifier)
}

/** أخضر VARA الثابت (نظير SpTheme.green) — مستقل عن لون التمييز المتغيّر. */
private fun rhGreen(c: VaraColors): Color = if (c.dark) Color(0xFF4DCC8C) else Color(0xFF0D8C59)

/** teal وسم الإعارة (نظير SpTheme.teal). */
private fun rhTeal(c: VaraColors): Color = if (c.dark) Color(0xFF2DD4BF) else Color(0xFF0D9488)

// ────────────────────────────────────────────────────────────────────────
// صفحة الترتيب الكامل (نظير fullStandingsPage/standingsContent)
// يُسجَّل لها Route في VaraApp: composable(RoshnStandingsRoute) { RoshnStandingsScreen(nav, vm) }
// ────────────────────────────────────────────────────────────────────────

@Composable
fun RoshnStandingsScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    var revision by remember { androidx.compose.runtime.mutableIntStateOf(0) }
    var state by remember { mutableStateOf<LoadState<List<Standing>>>(LoadState.Loading) }

    suspend fun load(silent: Boolean, ignoreCache: Boolean) {
        val result = runCatching {
            findArray(vm.api.publicGet("/sports/pro-league/standings", ignoreCache = ignoreCache), "standings", "table", "items")
                .mapNotNull { parseStanding(it) }
        }
        result.onSuccess { state = LoadState.Data(it) }
            .onFailure { if (!silent && state !is LoadState.Data) state = LoadState.Error(it.message ?: "تعذّر تحميل الترتيب") }
    }

    LaunchedEffect(revision) { load(silent = revision > 0, ignoreCache = revision > 0) }
    // ترتيب لحظي أثناء الجولة: تحديث صامت كل 30ث ما دامت صفوف live موجودة.
    PollEffect(
        delayProvider = { if ((state as? LoadState.Data)?.value?.any { it.live } == true) 30_000L else null },
        onTick = { first -> if (!first) load(silent = true, ignoreCache = true) },
    )

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        Column(Modifier.fillMaxSize()) {
            BackHeader(nav, "ترتيب دوري روشن") {
                IconButton({ revision++ }) { Icon(Icons.Default.Refresh, "تحديث", tint = c.text) }
            }
            when (val s = state) {
                LoadState.Loading -> LoadStateHost(s, { revision++ }) {}
                is LoadState.Error -> LoadStateHost(s, { revision++ }) {}
                is LoadState.Data -> LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (s.value.isEmpty()) {
                        item { VaraCard(Modifier.padding(16.dp)) { EmptyState("لا يتوفّر ترتيب", "قد يكون الموسم لم يبدأ بعد") } }
                    } else {
                        item {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Column(
                                    Modifier.fillMaxWidth().clip(VaraCardShape).background(c.surface)
                                        .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape),
                                ) {
                                    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text("#", color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(32.dp))
                                        Text("النادي", color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                        Text("لعب", color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.width(36.dp))
                                        Text("+/-", color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.width(40.dp))
                                        Text("نقاط", color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.width(40.dp))
                                    }
                                    VaraDivider()
                                    s.value.forEachIndexed { idx, row ->
                                        if (idx > 0) Box(Modifier.padding(start = 14.dp)) { VaraDivider() }
                                        RhFullStandingRow(row) { nav.navigate("team/${row.team.id}") }
                                    }
                                }
                                Row(Modifier.padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                    RhLegendChip(c.accent, "أبطال آسيا")
                                    RhLegendChip(c.live, "الهبوط")
                                }
                            }
                        }
                    }
                    item { Spacer(Modifier.height(14.dp)) }
                }
            }
        }
    }
}

@Composable
private fun RhFullStandingRow(row: Standing, open: () -> Unit) {
    val c = LocalVaraColors.current
    val isLive = row.live
    val delta = row.liveDelta ?: 0
    Row(
        Modifier.fillMaxWidth()
            .background(if (isLive) c.live.copy(alpha = .04f) else Color.Transparent)
            .clickable(onClick = open)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(Modifier.width(32.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("${row.rank}", color = rhZoneColor(row.rank, c), fontSize = 13.sp, fontWeight = FontWeight.Bold)
            if (isLive) {
                Text(
                    if (delta > 0) "▲" else if (delta < 0) "▼" else "•",
                    color = if (delta > 0) rhGreen(c) else if (delta < 0) c.live else c.textFaint,
                    fontSize = 8.sp, fontWeight = FontWeight.Bold,
                )
            }
        }
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            RemoteLogo(row.team.logo, row.team.name, 26)
            Text(
                row.team.name, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, false),
            )
            if (isLive) {
                Text(
                    "مباشر", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clip(CircleShape).background(c.live).padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
        Text("${row.played}", color = c.textDim, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.width(36.dp))
        ForceLtr {
            Text(
                if (row.goalsDiff > 0) "+${row.goalsDiff}" else "${row.goalsDiff}",
                color = c.textDim, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.width(40.dp),
            )
        }
        Text("${row.points}", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.width(40.dp))
    }
}

@Composable
private fun RhLegendChip(color: Color, label: String) {
    val c = LocalVaraColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        Box(Modifier.size(8.dp).clip(RoundedCornerShape(2.dp)).background(color))
        Text(label, color = c.textDim, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

// ────────────────────────────────────────────────────────────────────────
// صفحة الهدّافين الكاملة (نظير fullScorersPage/scorersContent)
// يُسجَّل لها Route في VaraApp: composable(RoshnScorersRoute) { RoshnScorersScreen(nav, vm) }
// ────────────────────────────────────────────────────────────────────────

private data class RhScorersData(val scorers: List<RhScorer>, val assists: List<RhScorer>)

@Composable
fun RoshnScorersScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    var revision by remember { androidx.compose.runtime.mutableIntStateOf(0) }
    var goalsMode by remember { mutableStateOf(true) }
    var state by remember { mutableStateOf<LoadState<RhScorersData>>(LoadState.Loading) }

    LaunchedEffect(revision) {
        state = coroutineScope {
            val sc = async { runCatching { vm.api.publicGet("/sports/pro-league/scorers", ignoreCache = revision > 0) }.getOrNull() }
            val asst = async { runCatching { vm.api.publicGet("/sports/pro-league/assists", ignoreCache = revision > 0) }.getOrNull() }
            val scRoot = sc.await()
            val asstRoot = asst.await()
            if (scRoot == null && asstRoot == null) {
                (state as? LoadState.Data) ?: LoadState.Error("تعذّر تحميل الهدّافين")
            } else {
                LoadState.Data(
                    RhScorersData(
                        scorers = scRoot?.let { findArray(it, "scorers", "leaders", "items").mapNotNull(::rhParseScorer) }.orEmpty(),
                        assists = asstRoot?.let { findArray(it, "assists", "leaders", "items").mapNotNull(::rhParseScorer) }.orEmpty(),
                    ),
                )
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        Column(Modifier.fillMaxSize()) {
            BackHeader(nav, "هدّافو دوري روشن") {
                IconButton({ revision++ }) { Icon(Icons.Default.Refresh, "تحديث", tint = c.text) }
            }
            when (val s = state) {
                LoadState.Loading -> LoadStateHost(s, { revision++ }) {}
                is LoadState.Error -> LoadStateHost(s, { revision++ }) {}
                is LoadState.Data -> LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    item {
                        Box(Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp)) {
                            RhScorerModeToggle(goalsMode) { goalsMode = it }
                        }
                    }
                    val rows = if (goalsMode) s.value.scorers else s.value.assists
                    item {
                        Column(
                            Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(VaraCardShape).background(c.surface)
                                .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraCardShape),
                        ) {
                            if (rows.isEmpty()) {
                                EmptyState("لا تتوفّر بيانات", "قد يكون الموسم لم يبدأ بعد")
                            } else {
                                rows.forEachIndexed { idx, row ->
                                    if (idx > 0) Box(Modifier.padding(start = 14.dp)) { VaraDivider() }
                                    RhScorerRow(row, goalsMode, compact = false) { nav.navigate("player/${row.id}") }
                                }
                            }
                        }
                    }
                    item { Spacer(Modifier.height(14.dp)) }
                }
            }
        }
    }
}
