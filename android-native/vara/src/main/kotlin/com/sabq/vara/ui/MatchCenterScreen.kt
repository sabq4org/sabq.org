package com.sabq.vara.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.EventSeat
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.GppMaybe
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.SportsScore
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Thermostat
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.TrackChanges
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.WbSunny
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.sabq.vara.core.Fixture
import com.sabq.vara.core.Team
import com.sabq.vara.core.VaraFormat
import com.sabq.vara.core.VaraViewModel
import com.sabq.vara.core.array
import com.sabq.vara.core.bool
import com.sabq.vara.core.findArray
import com.sabq.vara.core.int
import com.sabq.vara.core.obj
import com.sabq.vara.core.parseFixture
import com.sabq.vara.core.parseStanding
import com.sabq.vara.core.parseTeam
import com.sabq.vara.core.string
import com.sabq.vara.push.MatchReminderScheduler
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import java.util.Locale
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

// مركز المباراة — نقل 1:1 عن MatchCenterView في iOS: ترويسة مسطّحة، 8 أقسام
// شرطية (تقديم·الأحداث·التعليق·التحليل·التقييمات·التشكيلة·الإحصاءات·المواجهات)،
// إثراء كسول حسب القسم، واستطلاع حيّ أثناء اللعب. كل المساعدات private ببادئة Mc.

// ألوان الأحداث المطابقة لويب سبق (كأس العالم): تبديل sky-500 · فار purple-500.
private val McSubSky = Color(0xFF0EA5E9)
private val McVarPurple = Color(0xFFA855F7)
private val McYellowCard = Color(0xFFEAB308)
private val McGreen = Color(0xFF16A34A)
private val McTeal = Color(0xFF14B8A6)
private val McPitchTop = Color(0xFF248561)
private val McPitchBottom = Color(0xFF125740)
private val McCardShape = RoundedCornerShape(20.dp)

private enum class McSegment(val label: String) {
    PREVIEW("تقديم"), EVENTS("الأحداث"), COMMENTARY("التعليق"), ANALYSIS("التحليل"),
    RATINGS("التقييمات"), LINEUPS("التشكيلة"), STATS("الإحصاءات"), H2H("المواجهات"),
}

// MARK: - نماذج مفكوكة typed (مفاتيح JSON مطابقة لـ SportsModels.swift)

private data class McStatValue(val text: String, val number: Double?)
private data class McStatRow(val type: String, val label: String, val home: McStatValue?, val away: McStatValue?)
private data class McEvent(
    val minute: Int?, val extra: Int?, val teamId: Int, val team: String,
    val player: String, val assist: String?, val type: String, val label: String,
)
private data class McLineupPlayer(val id: Int, val number: Int?, val name: String, val pos: String, val grid: String?)
private data class McLineup(val team: Team, val formation: String?, val coach: String?, val startXI: List<McLineupPlayer>, val substitutes: List<McLineupPlayer>)
private data class McDetail(val fixture: Fixture, val events: List<McEvent>, val statRows: List<McStatRow>, val lineups: List<McLineup>)
private data class McXgPlayer(val name: String, val location: String, val xg: Double)
private data class McXg(val available: Boolean, val homeXg: Double, val homeXgot: Double, val awayXg: Double, val awayXgot: Double, val topPlayers: List<McXgPlayer>)
private data class McFlowPoint(val minute: Int, val net: Double)
private data class McFlow(val available: Boolean, val points: List<McFlowPoint>)
private data class McWeather(val temp: Int?, val description: String?, val humidity: String?)
private data class McAbsentee(val name: String, val location: String, val reason: String)
private data class McFacts(val available: Boolean, val weather: McWeather?, val absentees: List<McAbsentee>, val halftimeHome: Int?, val halftimeAway: Int?)
private data class McCommentaryItem(val minute: Int, val extraMinute: Int?, val goal: Boolean, val important: Boolean, val text: String, val order: Int)
private data class McCommentary(val available: Boolean, val live: Boolean, val items: List<McCommentaryItem>)
private data class McMotm(val id: Int, val name: String, val team: String, val rating: Double)
private data class McRatedPlayer(
    val id: Int, val name: String, val photo: String, val team: String, val number: Int?,
    val pos: String?, val rating: Double?, val minutes: Int?, val goals: Int?, val captain: Boolean,
)
private data class McRatings(val motm: McMotm?, val players: List<McRatedPlayer>)
private data class McH2HSummary(val total: Int, val homeWins: Int, val draws: Int, val awayWins: Int)
private data class McH2HMeeting(val id: Int, val competition: String, val home: Team, val away: Team, val homeGoals: Int?, val awayGoals: Int?)
private data class McH2H(val summary: McH2HSummary?, val meetings: List<McH2HMeeting>)
private data class McReferee(val available: Boolean, val name: String, val photo: String, val country: String, val matches: Int?, val yellow: Int?, val red: Int?, val penalties: Int?, val varMoments: Int?)
private data class McTv(val channels: List<String>)
private data class McScorer(val id: Int, val name: String, val photo: String, val goals: Int, val assists: Int)
private data class McExpectedPlayer(val name: String, val jersey: Int?, val grid: String?)
private data class McExpectedSide(val formation: String?, val starters: List<McExpectedPlayer>, val bench: List<McExpectedPlayer>)
private data class McExpected(val available: Boolean, val home: McExpectedSide?, val away: McExpectedSide?)

private sealed interface McTimelineItem {
    data class Ev(val e: McEvent) : McTimelineItem
    data class Halftime(val home: Int, val away: Int) : McTimelineItem
}

// MARK: - الفكّ

private fun JsonObject.mcDouble(vararg keys: String): Double? = keys.firstNotNullOfOrNull { key ->
    val p = this[key] as? JsonPrimitive
    p?.doubleOrNull ?: p?.contentOrNull?.toDoubleOrNull()
}

private fun mcStatValue(e: JsonElement?): McStatValue? {
    val p = e as? JsonPrimitive ?: return null
    if (p is JsonNull) return null
    p.intOrNull?.let { return McStatValue("$it", it.toDouble()) }
    p.doubleOrNull?.let { return McStatValue(if (it % 1.0 == 0.0) "${it.toInt()}" else "$it", it) }
    val s = p.contentOrNull ?: return null
    return McStatValue(s, s.takeWhile { it.isDigit() || it == '.' }.toDoubleOrNull())
}

private fun mcParseEvent(e: JsonElement): McEvent? {
    val o = e as? JsonObject ?: return null
    return McEvent(
        minute = o.int("minute"), extra = o.int("extra"), teamId = o.int("teamId") ?: 0,
        team = o.string("team") ?: "", player = o.string("player") ?: "",
        assist = o.string("assist"), type = o.string("type") ?: "", label = o.string("label") ?: "",
    )
}

private fun mcParseLineupPlayer(e: JsonElement): McLineupPlayer? {
    val o = e as? JsonObject ?: return null
    return McLineupPlayer(o.int("id") ?: 0, o.int("number"), o.string("name") ?: return null, o.string("pos") ?: "", o.string("grid"))
}

private fun mcParseDetail(root: JsonElement): McDetail? {
    val o = root as? JsonObject ?: return null
    val fixture = parseFixture(o["fixture"] ?: o) ?: return null
    val events = o.array("events")?.mapNotNull(::mcParseEvent).orEmpty()
    val statRows = o.obj("statistics")?.array("rows")?.mapNotNull { row ->
        val r = row as? JsonObject ?: return@mapNotNull null
        McStatRow(r.string("type") ?: "", r.string("label") ?: "", mcStatValue(r["home"]), mcStatValue(r["away"]))
    }.orEmpty()
    val lineups = o.array("lineups")?.mapNotNull { lu ->
        val l = lu as? JsonObject ?: return@mapNotNull null
        McLineup(
            team = parseTeam(l["team"]),
            formation = l.string("formation"), coach = l.string("coach"),
            startXI = l.array("startXI")?.mapNotNull(::mcParseLineupPlayer).orEmpty(),
            substitutes = l.array("substitutes")?.mapNotNull(::mcParseLineupPlayer).orEmpty(),
        )
    }.orEmpty()
    return McDetail(fixture, events, statRows, lineups)
}

private fun mcParseCommentary(root: JsonElement): McCommentary? {
    val o = root as? JsonObject ?: return null
    val items = o.array("items")?.mapNotNull { e ->
        val i = e as? JsonObject ?: return@mapNotNull null
        McCommentaryItem(
            minute = i.int("minute") ?: 0, extraMinute = i.int("extraMinute"),
            goal = i.bool("goal") ?: false, important = i.bool("important") ?: false,
            text = i.string("textAr") ?: i.string("textEn") ?: "", order = i.int("order") ?: 0,
        )
    }.orEmpty().filter { it.text.isNotBlank() }
    return McCommentary(o.bool("available") ?: false, o.bool("live") ?: false, items)
}

private fun mcParseXg(root: JsonElement): McXg? {
    val o = root as? JsonObject ?: return null
    val h = o.obj("home"); val a = o.obj("away")
    return McXg(
        available = o.bool("available") ?: false,
        homeXg = h?.mcDouble("xg") ?: 0.0, homeXgot = h?.mcDouble("xgot") ?: 0.0,
        awayXg = a?.mcDouble("xg") ?: 0.0, awayXgot = a?.mcDouble("xgot") ?: 0.0,
        topPlayers = o.array("topPlayers")?.mapNotNull { e ->
            val p = e as? JsonObject ?: return@mapNotNull null
            McXgPlayer(p.string("name") ?: return@mapNotNull null, p.string("location") ?: "", p.mcDouble("xg") ?: 0.0)
        }.orEmpty(),
    )
}

private fun mcParseFlow(root: JsonElement): McFlow? {
    val o = root as? JsonObject ?: return null
    val points = o.array("points")?.mapNotNull { e ->
        val p = e as? JsonObject ?: return@mapNotNull null
        McFlowPoint(p.int("minute") ?: 0, p.mcDouble("net") ?: ((p.mcDouble("home") ?: 0.0) - (p.mcDouble("away") ?: 0.0)))
    }.orEmpty()
    return McFlow(o.bool("available") ?: false, points)
}

private fun mcParseFacts(root: JsonElement): McFacts? {
    val o = root as? JsonObject ?: return null
    val w = o.obj("weather")?.let { McWeather(it.int("temp"), it.string("description"), it.string("humidity")) }
    val ht = o.obj("halftime")
    return McFacts(
        available = o.bool("available") ?: false,
        weather = w,
        absentees = o.array("absentees")?.mapNotNull { e ->
            val a = e as? JsonObject ?: return@mapNotNull null
            McAbsentee(a.string("name") ?: return@mapNotNull null, a.string("location") ?: "", a.string("reason") ?: "")
        }.orEmpty(),
        halftimeHome = ht?.int("home"), halftimeAway = ht?.int("away"),
    )
}

private fun mcParseRatings(root: JsonElement): McRatings? {
    val o = root as? JsonObject ?: return null
    val motm = o.obj("motm")?.let {
        McMotm(it.int("id") ?: 0, it.string("name") ?: "", it.string("team") ?: "", it.mcDouble("rating") ?: 0.0)
    }
    val players = o.array("players")?.mapNotNull { e ->
        val p = e as? JsonObject ?: return@mapNotNull null
        McRatedPlayer(
            id = p.int("id") ?: 0, name = p.string("name") ?: return@mapNotNull null,
            photo = p.string("photo") ?: "", team = p.string("team") ?: "",
            number = p.int("number"), pos = p.string("pos"), rating = p.mcDouble("rating"),
            minutes = p.int("minutes"), goals = p.int("goals"), captain = p.bool("captain") ?: false,
        )
    }.orEmpty()
    return McRatings(motm, players)
}

private fun mcParseH2H(root: JsonElement): McH2H? {
    val o = root as? JsonObject ?: return null
    val summary = o.obj("summary")?.let {
        McH2HSummary(it.int("total") ?: 0, it.int("homeWins") ?: 0, it.int("draws") ?: 0, it.int("awayWins") ?: 0)
    }
    val meetings = o.array("meetings")?.mapNotNull { e ->
        val m = e as? JsonObject ?: return@mapNotNull null
        val goals = m.obj("goals")
        McH2HMeeting(
            id = m.int("id") ?: return@mapNotNull null, competition = m.string("competition") ?: "",
            home = parseTeam(m["home"]), away = parseTeam(m["away"]),
            homeGoals = goals?.int("home"), awayGoals = goals?.int("away"),
        )
    }.orEmpty()
    return McH2H(summary, meetings)
}

private fun mcParseReferee(root: JsonElement): McReferee? {
    val o = root as? JsonObject ?: return null
    val s = o.obj("stats")
    val matches = s?.int("matches")
    // أعداد صحيحة لا متوسطات كسرية — كما في ويب المونديال: count وإلا avg×matches.
    val yellow = s?.int("yellowCount") ?: s?.mcDouble("yellowAvg")?.let { avg -> matches?.let { (avg * it).roundToInt() } }
    val pens = s?.int("penaltiesCount") ?: s?.mcDouble("penaltiesAvg")?.let { avg -> matches?.let { (avg * it).roundToInt() } }
    return McReferee(
        available = o.bool("available") ?: false, name = o.string("name") ?: "",
        photo = o.string("photo") ?: "", country = o.string("countryName") ?: "",
        matches = matches, yellow = yellow, red = s?.int("redCount"), penalties = pens, varMoments = s?.int("varMoments"),
    )
}

private fun mcParseTv(root: JsonElement): McTv? {
    val o = root as? JsonObject ?: return null
    return McTv(o.array("channels")?.mapNotNull { (it as? JsonObject)?.string("name") }.orEmpty())
}

private fun mcParseScorers(root: JsonElement): List<McScorer> =
    findArray(root, "scorers").mapNotNull { e ->
        val o = e as? JsonObject ?: return@mapNotNull null
        McScorer(o.int("id") ?: 0, o.string("name") ?: return@mapNotNull null, o.string("photo") ?: "", o.int("goals") ?: 0, o.int("assists") ?: 0)
    }

private fun mcParseExpectedPlayer(e: JsonElement): McExpectedPlayer? {
    val o = e as? JsonObject ?: return null
    return McExpectedPlayer(o.string("name") ?: return null, o.int("jersey"), o.string("grid"))
}

private fun mcParseExpected(root: JsonElement): McExpected? {
    val o = root as? JsonObject ?: return null
    fun side(x: JsonObject?): McExpectedSide? = x?.let {
        McExpectedSide(
            it.string("formation"),
            it.array("starters")?.mapNotNull(::mcParseExpectedPlayer).orEmpty(),
            it.array("bench")?.mapNotNull(::mcParseExpectedPlayer).orEmpty(),
        )
    }
    return McExpected(o.bool("available") ?: false, side(o.obj("home")), side(o.obj("away")))
}

/// خريطة فورمة الفريقين من ترتيب البطولة (يدعم شكل المجموعات في المونديال).
private fun mcFormMap(root: JsonElement): Map<Int, String> {
    val rows = findArray(root, "standings", "table", "rows", "items").mapNotNull(::parseStanding).toMutableList()
    if (rows.isEmpty()) {
        findArray(root, "groups").forEach { g ->
            val o = g as? JsonObject ?: return@forEach
            rows += findArray(o, "rows", "standings", "table", "items").mapNotNull(::parseStanding)
        }
    }
    return rows.filter { it.form.isNotBlank() && it.team.id > 0 }.associate { it.team.id to it.form }
}

// MARK: - الحالة والجلب

private class McState {
    var detail by mutableStateOf<McDetail?>(null)
    var loading by mutableStateOf(true)
    var loadError by mutableStateOf<String?>(null)
    var segment by mutableStateOf(McSegment.EVENTS)
    var xg by mutableStateOf<McXg?>(null)
    var momentum by mutableStateOf<McFlow?>(null)
    var pressure by mutableStateOf<McFlow?>(null)
    var facts by mutableStateOf<McFacts?>(null)
    var ratings by mutableStateOf<McRatings?>(null)
    var h2h by mutableStateOf<McH2H?>(null)
    var commentary by mutableStateOf<McCommentary?>(null)
    var referee by mutableStateOf<McReferee?>(null)
    var expected by mutableStateOf<McExpected?>(null)
    var forms by mutableStateOf<Map<Int, String>>(emptyMap())
    var previewText by mutableStateOf<String?>(null)
    var tv by mutableStateOf<McTv?>(null)
    var homeScorers by mutableStateOf<List<McScorer>>(emptyList())
    var awayScorers by mutableStateOf<List<McScorer>>(emptyList())
    // جلبة لحظية واحدة في كل لحظة (نظير refreshInFlight في iOS).
    @Volatile var refreshInFlight = false
    var recorded = false
}

/// التحميل الكامل: التفاصيل أولًا (تفتح الشاشة فورًا)، ثم موجة الإثراء الأولى،
/// ثم الحقائق. فشل أي نداء منفرد لا يحجب الشاشة.
private suspend fun mcLoadAll(vm: VaraViewModel, fixtureId: Int, preview: Fixture?, st: McState) {
    runCatching { mcParseDetail(vm.api.publicGet("/sports/match/$fixtureId")) ?: error("بيانات المباراة غير مكتملة") }
        .onSuccess { st.detail = it; st.loadError = null; vm.updateFollowedSnapshots(listOf(it.fixture)) }
        .onFailure { err ->
            if (st.detail == null) {
                // فشل التفاصيل مع لقطة متابعة معروفة → ترويسة من اللقطة بلا خطأ.
                if (preview != null) st.detail = McDetail(preview, emptyList(), emptyList(), emptyList())
                else { st.loadError = err.message ?: "تعذّر تحميل المباراة"; return }
            }
        }
    // تسجيل مشاهدة للأعضاء — مرة واحدة.
    if (vm.isLoggedIn && !st.recorded) (st.detail?.fixture ?: preview)?.let { fx ->
        st.recorded = true
        runCatching { vm.api.recordMatchView(fx) }
    }
    val f = st.detail?.fixture ?: preview
    // موجة 1: التعليق + المتوقعة (لغير المنتهية بلا startXI) + المواجهات + الفورمة + القنوات.
    coroutineScope {
        val commentaryD = async { runCatching { mcParseCommentary(vm.api.publicGet("/sports/match/$fixtureId/commentary")) }.getOrNull() }
        val needExpected = st.detail?.let { d -> !d.fixture.status.finished && d.lineups.none { it.startXI.isNotEmpty() } } ?: false
        val expectedD = async { if (needExpected && st.expected == null) runCatching { mcParseExpected(vm.api.publicGet("/sports/match/$fixtureId/expected-lineup")) }.getOrNull() else null }
        val h2hD = async {
            f?.takeIf { it.home.id > 0 && it.away.id > 0 && st.h2h == null }?.let { fx ->
                runCatching { mcParseH2H(vm.api.publicGet("/sports/h2h", mapOf("home" to "${fx.home.id}", "away" to "${fx.away.id}"))) }.getOrNull()
            }
        }
        val formsD = async {
            val slug = f?.competitionSlug.orEmpty()
            // الفورمة تُعرض في «تقديم» فقط (قبل الانطلاق) — لا داعي لجلبها لمباراة منطلقة.
            if (slug.isBlank() || f?.started != false || st.forms.isNotEmpty()) null
            else runCatching { mcFormMap(vm.api.publicGet(if (slug == "world-cup") "/world-cup/standings" else "/sports/$slug/standings")) }.getOrNull()
        }
        val tvD = async { if (f != null && !f.started && st.tv == null) runCatching { mcParseTv(vm.api.publicGet("/sports/match/$fixtureId/tv")) }.getOrNull() else null }
        commentaryD.await()?.let { st.commentary = it }
        expectedD.await()?.let { st.expected = it }
        h2hD.await()?.let { st.h2h = it }
        formsD.await()?.let { st.forms = it }
        tvD.await()?.let { st.tv = it }
    }
    // موجة 2: الحقائق مسبقًا (تخدم الأحداث والطقس في «تقديم»).
    if (st.facts == null) st.facts = runCatching { mcParseFacts(vm.api.publicGet("/sports/match/$fixtureId/facts")) }.getOrNull()
}

/// تحديث لحظي خفيف بلا كاش: التفاصيل + التعليق (+ المتوقعة إن بقيت الرسمية فارغة).
private suspend fun mcRefreshLive(vm: VaraViewModel, fixtureId: Int, st: McState) {
    if (st.refreshInFlight) return
    st.refreshInFlight = true
    try {
        runCatching { mcParseDetail(vm.api.publicGet("/sports/match/$fixtureId", ignoreCache = true)) }.getOrNull()?.let {
            st.detail = it
            vm.updateFollowedSnapshots(listOf(it.fixture))
        }
        // التعليق أفضل جهد دائمًا — قد يبدأ بعد فتح الشاشة فيظهر تبويبه حال توفّره.
        runCatching { mcParseCommentary(vm.api.publicGet("/sports/match/$fixtureId/commentary", ignoreCache = true)) }.getOrNull()?.let { st.commentary = it }
        // إن بقيت الرسمية فارغة أعد جلب المتوقعة — قد تصدر بعد أول فتح للشاشة.
        val needExpected = st.detail?.let { d ->
            !d.fixture.status.finished && d.lineups.none { it.startXI.isNotEmpty() }
        } == true
        if (needExpected) {
            runCatching { mcParseExpected(vm.api.publicGet("/sports/match/$fixtureId/expected-lineup", ignoreCache = true)) }
                .getOrNull()?.let { st.expected = it }
        }
    } finally {
        st.refreshInFlight = false
    }
}

/// الحكم: نقطة الدوري الموحّدة أولًا ثم المونديال احتياطيًا (أفضل جهد).
private suspend fun mcLoadReferee(vm: VaraViewModel, fixtureId: Int, st: McState) {
    if (st.referee != null) return
    val primary = runCatching { mcParseReferee(vm.api.publicGet("/sports/match/$fixtureId/referee")) }.getOrNull()
    if (primary?.available == true) { st.referee = primary; return }
    st.referee = runCatching { mcParseReferee(vm.api.publicGet("/world-cup/match/$fixtureId/referee")) }.getOrNull() ?: primary
}

/// جلب كسول لإثراء التبويب الحالي — يمنع عاصفة طلبات SportMonks عند الفتح.
private suspend fun mcEnsureSegment(vm: VaraViewModel, fixtureId: Int, st: McState, s: McSegment, fixture: Fixture?) {
    when (s) {
        McSegment.PREVIEW -> {
            val f = fixture ?: return
            if (f.started) return
            if (st.previewText == null) st.previewText = runCatching {
                (vm.api.publicGet("/sports/match/$fixtureId/preview") as? JsonObject)?.string("text")
            }.getOrNull()
            if (st.homeScorers.isEmpty() && f.home.id > 0) st.homeScorers =
                runCatching { mcParseScorers(vm.api.publicGet("/sports/team/${f.home.id}/scorers")) }.getOrDefault(emptyList())
            if (st.awayScorers.isEmpty() && f.away.id > 0) st.awayScorers =
                runCatching { mcParseScorers(vm.api.publicGet("/sports/team/${f.away.id}/scorers")) }.getOrDefault(emptyList())
        }
        McSegment.ANALYSIS -> coroutineScope {
            val xgD = async { if (st.xg == null) runCatching { mcParseXg(vm.api.publicGet("/sports/match/$fixtureId/xg")) }.getOrNull() else null }
            val momD = async { if (st.momentum == null) runCatching { mcParseFlow(vm.api.publicGet("/sports/match/$fixtureId/momentum")) }.getOrNull() else null }
            val presD = async { if (st.pressure == null) runCatching { mcParseFlow(vm.api.publicGet("/sports/match/$fixtureId/pressure")) }.getOrNull() else null }
            xgD.await()?.let { st.xg = it }
            momD.await()?.let { st.momentum = it }
            presD.await()?.let { st.pressure = it }
            if (st.facts == null) st.facts = runCatching { mcParseFacts(vm.api.publicGet("/sports/match/$fixtureId/facts")) }.getOrNull()
        }
        McSegment.RATINGS -> {
            if (st.ratings == null) st.ratings = runCatching { mcParseRatings(vm.api.publicGet("/sports/match/$fixtureId/players")) }.getOrNull()
        }
        McSegment.STATS -> {
            if (st.xg == null) st.xg = runCatching { mcParseXg(vm.api.publicGet("/sports/match/$fixtureId/xg")) }.getOrNull()
            if (st.facts == null) st.facts = runCatching { mcParseFacts(vm.api.publicGet("/sports/match/$fixtureId/facts")) }.getOrNull()
        }
        McSegment.EVENTS -> {
            if (st.facts == null) st.facts = runCatching { mcParseFacts(vm.api.publicGet("/sports/match/$fixtureId/facts")) }.getOrNull()
        }
        McSegment.COMMENTARY, McSegment.LINEUPS, McSegment.H2H -> Unit
    }
}

// MARK: - الشاشة

@Composable
fun MatchScreen(nav: NavHostController, vm: VaraViewModel, fixtureId: Int) {
    val c = LocalVaraColors.current
    val context = LocalContext.current
    val st = remember(fixtureId) { McState() }
    var revision by remember { mutableIntStateOf(0) }
    // معاينة فورية من لقطة المتابعة المحفوظة (إن وُجدت) — ترسم الترويسة قبل الشبكة.
    val preview = remember(fixtureId) { vm.followedFixtures.value.firstOrNull { it.id == fixtureId && it.home.name.isNotBlank() } }
    val follows by vm.followedFixtures.collectAsState()
    val following = follows.any { it.id == fixtureId }
    val fixture = st.detail?.fixture ?: preview

    LaunchedEffect(fixtureId, revision) {
        if (st.detail == null) st.loading = true
        mcLoadAll(vm, fixtureId, preview, st)
        st.loading = false
    }
    // الحكم بعد وصول التفاصيل — لا يزاحم الطلب الأساسي.
    LaunchedEffect(st.detail?.fixture?.id) { if (st.detail != null) mcLoadReferee(vm, fixtureId, st) }

    // الأقسام المتاحة (تُخفى الفارغة) + السقوط لأول متاح.
    val hasCommentary = st.commentary?.items?.isNotEmpty() == true
    val hasRatings = st.ratings?.players?.any { (it.rating ?: 0.0) > 0.0 } == true
    val hasH2H = st.h2h?.meetings?.isNotEmpty() == true
    val hasExpected = st.expected?.let { it.available && (it.home != null || it.away != null) } == true
    val hasAnalysis = fixture?.started == true ||
        st.xg?.available == true || st.momentum?.available == true || st.pressure?.available == true || st.facts?.available == true
    // نافذة انتظار التشكيلة: نُظهر التبويب بحالة فارغة بدل إخفائه قبيل الانطلاق.
    val hasOfficialLineup = st.detail?.lineups?.any { it.startXI.isNotEmpty() } == true
    val awaitingLineups = fixture?.let { f ->
        !f.status.finished && !hasOfficialLineup && !hasExpected && run {
            val secs = f.timestamp - System.currentTimeMillis() / 1000
            secs <= 2 * 3600 && secs > -3 * 3600
        }
    } == true
    val segments = buildList {
        val d = st.detail
        if (d != null) {
            // «تقديم» يتصدّر تبويبات المباراة القادمة (قبل الانطلاق).
            if (fixture?.started == false) add(McSegment.PREVIEW)
            if (d.events.isNotEmpty()) add(McSegment.EVENTS)
            if (hasCommentary) add(McSegment.COMMENTARY)
            if (hasAnalysis) add(McSegment.ANALYSIS)
            if (hasRatings) add(McSegment.RATINGS)
            if (d.lineups.isNotEmpty() || hasExpected || awaitingLineups) add(McSegment.LINEUPS)
            if (d.statRows.isNotEmpty()) add(McSegment.STATS)
            if (hasH2H) add(McSegment.H2H)
        }
    }
    val effective = if (st.segment in segments) st.segment else (segments.firstOrNull() ?: McSegment.EVENTS)

    // إثراء ثقيل حسب التبويب الفعّال فقط.
    LaunchedEffect(effective, st.detail?.fixture?.id) {
        if (st.detail != null || effective == McSegment.PREVIEW) mcEnsureSegment(vm, fixtureId, st, effective, fixture)
    }

    // استطلاع حي: 10ث أثناء اللعب / 25ث داخل نافذة التشكيلات (~75د) / نوم للبعيدة.
    // أول نبضة كل عودة للمقدمة = تحديث فوري للمباراة الجارية.
    PollEffect(fixtureId, st.detail?.fixture?.id ?: -1, delayProvider = {
        val f = st.detail?.fixture
        when {
            f == null || f.status.finished -> null
            f.status.live -> 10_000L
            else -> {
                val kick = f.kickoffMs
                val secs = if (kick == null) Long.MAX_VALUE / 2000 else (kick - System.currentTimeMillis()) / 1000
                // كانت 30د فتفوت صدور التشكيلة (~ساعة قبل الانطلاق).
                if (secs > 4500) (secs - 4400).coerceIn(30, 3600) * 1000 else 25_000L
            }
        }
    }) { first ->
        if (first) { if (st.detail?.fixture?.status?.live == true) mcRefreshLive(vm, fixtureId, st) }
        else mcRefreshLive(vm, fixtureId, st)
    }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(16.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            item(key = "bar") {
                BackHeader(nav, "مركز المباراة") {
                    IconButton({ mcShare(context, mcShareTitle(fixture), "https://sabq.org/sports/match/$fixtureId") }) {
                        Icon(Icons.Default.Share, "مشاركة", tint = c.accent)
                    }
                    IconButton({
                        val fx = fixture
                        if (!vm.isLoggedIn) nav.navigate(Routes.Login)
                        else if (fx != null) {
                            if (following) vm.unfollowMatch(fx) else vm.followMatch(fx)
                            MatchReminderScheduler.sync(context, fx, !following)
                        }
                    }) {
                        Icon(if (following) Icons.Default.Star else Icons.Default.StarBorder, "متابعة المباراة", tint = if (following) c.gold else c.accent)
                    }
                }
            }
            if (fixture != null) item(key = "header") { McHeader(fixture, nav) }
            if (fixture != null && !fixture.started) {
                item(key = "prematch") { McPreMatchCard(fixture) }
                // حكم المباراة القادمة تحت «الوقت المتبقّي» مباشرة (قرار 2026-07-09).
                st.referee?.takeIf { it.available && it.name.isNotBlank() }?.let { r -> item(key = "referee") { McRefereeCard(r) } }
            }
            when {
                st.loading && st.detail == null -> item(key = "loading") {
                    Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = c.accent) }
                }
                st.loadError != null && st.detail == null -> item(key = "error") {
                    Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("تعذّر التحميل", color = c.text, fontWeight = FontWeight.Bold)
                        Text(st.loadError.orEmpty(), color = c.textDim, textAlign = TextAlign.Center)
                        Button({ revision++ }, colors = ButtonDefaults.buttonColors(containerColor = c.accent)) {
                            Icon(Icons.Default.Refresh, null); Spacer(Modifier.width(6.dp)); Text("إعادة المحاولة")
                        }
                    }
                }
                st.detail != null && segments.isEmpty() -> item(key = "empty") {
                    EmptyState("لا تفاصيل بعد", "ستظهر الأحداث والإحصاءات والتشكيلة فور توفّرها")
                }
                st.detail != null -> {
                    val d = st.detail!!
                    if (segments.size > 1) item(key = "tabs") { McTabBar(segments, effective) { st.segment = it } }
                    when (effective) {
                        McSegment.PREVIEW -> item(key = "preview") { McPreviewTab(st, fixture!!, nav) }
                        McSegment.EVENTS -> item(key = "events") { McEventsSection(d) }
                        McSegment.COMMENTARY -> {
                            val comm = st.commentary
                            if (comm != null) {
                                if (comm.live) item(key = "comm-live") { McCommentaryLiveBanner() }
                                itemsIndexed(comm.items, key = { i, itm -> "comm-$i-${itm.order}" }) { _, itm -> McCommentaryRow(itm) }
                            }
                        }
                        McSegment.ANALYSIS -> item(key = "analysis") { McAnalysisTab(st, d.fixture) }
                        McSegment.RATINGS -> item(key = "ratings") { McRatingsTab(st.ratings, nav) }
                        McSegment.LINEUPS -> item(key = "lineups") { McLineupsSection(d, st, nav) }
                        McSegment.STATS -> item(key = "stats") { McStatsSection(d.statRows) }
                        McSegment.H2H -> item(key = "h2h") { McH2HTab(st.h2h, d.fixture, nav) }
                    }
                }
            }
        }
    }
}

// MARK: - المشاركة

/// «الفريق1 2 - 1 الفريق2 — البطولة · عبر VARA» (+ «(ترجيح h-a)») — نظير shareTitle.
private fun mcShareTitle(f: Fixture?): String {
    f ?: return "مباراة عبر VARA"
    val middle = if (f.started) {
        var score = "${f.homeScore ?: 0} - ${f.awayScore ?: 0}"
        if (f.penHome != null && f.penAway != null) score += " (ترجيح ${f.penHome}-${f.penAway})"
        score
    } else "×"
    val comp = f.competitionName.ifBlank { "دوري روشن" }
    return "${f.home.name} $middle ${f.away.name} — $comp · عبر VARA"
}

private fun mcShare(context: android.content.Context, title: String, url: String) {
    val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(android.content.Intent.EXTRA_SUBJECT, title)
        putExtra(android.content.Intent.EXTRA_TEXT, "$title\n$url")
    }
    context.startActivity(android.content.Intent.createChooser(intent, "مشاركة"))
}

// MARK: - الترويسة (مسطّحة بلا كرت)

@Composable
private fun McHeader(f: Fixture, nav: NavHostController) {
    val c = LocalVaraColors.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            McHeaderTeam(f.home, Modifier.weight(1f), nav)
            McHeaderCenter(f, Modifier.widthIn(min = 96.dp))
            McHeaderTeam(f.away, Modifier.weight(1f), nav)
        }
        // حسم الترجيح — الأرقام في نص مستقل LTR (دمجها بالجملة يقلبها بيديًّا).
        val penHome = f.penHome; val penAway = f.penAway
        if (f.status.finished && penHome != null && penAway != null && penHome != penAway) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("فاز ${if (penHome > penAway) f.home.name else f.away.name} بركلات الترجيح", color = c.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                ForceLtr { Text("${max(penHome, penAway)}-${minOf(penHome, penAway)}", color = c.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
            }
        }
        val meta = mcHeaderMeta(f)
        if (meta.isNotBlank()) Text(meta, color = c.textDim, fontSize = 11.sp, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
        val stadium = mcHeaderStadium(f)
        if (stadium.isNotBlank()) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Default.Place, null, tint = c.textDim, modifier = Modifier.size(12.dp))
                Text(stadium, color = c.textDim, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/// «البطولة · الدور · اليوم» — التاريخ بتوقيت الرياض عبر VaraFormat.
private fun mcHeaderMeta(f: Fixture): String {
    val comp = f.competitionName.ifBlank { f.round }
    val parts = mutableListOf<String>()
    if (comp.isNotBlank()) parts += comp
    if (f.round.isNotBlank() && f.round != comp) parts += f.round
    VaraFormat.instantOf(f)?.let { parts += "${VaraFormat.weekdayName(it)} ${VaraFormat.dayMonthLabel(it)}" }
    return parts.joinToString(" · ")
}

private fun mcHeaderStadium(f: Fixture): String {
    val name = f.venue.trim(); val city = f.venueCity.trim()
    return when {
        name.isEmpty() -> city
        city.isEmpty() -> name
        else -> "$name — $city"
    }
}

@Composable
private fun McHeaderTeam(t: Team, modifier: Modifier, nav: NavHostController) {
    val c = LocalVaraColors.current
    Column(
        modifier.clip(VaraTileShape).clickable(enabled = t.id > 0) { nav.navigate("team/${t.id}") }.padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        RemoteLogo(t.logo, t.name, 58)
        Text(t.name, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun McHeaderCenter(f: Fixture, modifier: Modifier) {
    val c = LocalVaraColors.current
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (f.started) {
            // قاعدة النتيجة: الضيف أولًا داخل LTR كي يبقى المضيف يمينًا في RTL.
            ForceLtr { Text("${f.awayScore ?: 0} - ${f.homeScore ?: 0}", color = c.text, fontSize = 38.sp, fontWeight = FontWeight.Bold) }
        } else {
            // قبل الانطلاق: وقت البداية (لا "VS").
            ForceLtr { Text(VaraFormat.time(VaraFormat.instantOf(f)).ifBlank { "—" }, color = c.accent, fontSize = 28.sp, fontWeight = FontWeight.Bold) }
        }
        // أثناء الترجيح فقط: النتيجة الجارية ركلةً بركلة بدل شارة الحالة.
        if (f.shootoutLive && f.hasPenalties) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Text("ركلات الترجيح", color = c.live, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                ForceLtr { Text("${f.penAway ?: 0} - ${f.penHome ?: 0}", color = c.live, fontSize = 16.sp, fontWeight = FontWeight.Bold) }
            }
        } else {
            StatusPill(f)
        }
    }
}

// MARK: - ما قبل المباراة + الحكم

@Composable
private fun McPreMatchCard(f: Fixture) {
    val kick = f.kickoffMs ?: return
    val c = LocalVaraColors.current
    McCard(Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Default.HourglassEmpty, null, tint = c.accent, modifier = Modifier.size(16.dp))
            Text("الوقت المتبقّي على المباراة", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        }
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CountdownChips(kick) }
    }
}

@Composable
private fun McRefereeCard(r: McReferee) {
    val c = LocalVaraColors.current
    McCard(Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
            RemoteLogo(r.photo, r.name, 40)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("حكم المباراة", color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text(r.name, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (r.country.isNotBlank()) Text(r.country, color = c.textDim, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            }
            r.matches?.let { m ->
                Text("$m ${if (m == 1) "مباراة" else "مباريات"} بالبطولة", color = c.textDim, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        if (r.matches != null) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                r.yellow?.let { McRefereeChip("🟨 $it صفراء") }
                r.red?.let { McRefereeChip("🟥 $it حمراء") }
                r.penalties?.let { McRefereeChip("⚽ $it ${if (it == 1) "ركلة جزاء" else "ركلات جزاء"}") }
                r.varMoments?.let { McRefereeChip("فار ×$it") }
            }
        }
    }
}

@Composable
private fun McRefereeChip(text: String) {
    val c = LocalVaraColors.current
    Text(
        text, color = c.text, fontSize = 11.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.clip(RoundedCornerShape(9.dp)).background(c.chip).padding(horizontal = 9.dp, vertical = 5.dp),
    )
}

// MARK: - شريط التبويبات (حبوب أفقية تتمركز تلقائيًا)

@Composable
private fun McTabBar(segments: List<McSegment>, effective: McSegment, choose: (McSegment) -> Unit) {
    val c = LocalVaraColors.current
    val listState = rememberLazyListState()
    // تمركز التبويب الفعّال في منتصف الشريط تلقائيًا (نظير scrollTo(anchor: .center)).
    LaunchedEffect(effective, segments.size) {
        val idx = segments.indexOf(effective)
        if (idx < 0) return@LaunchedEffect
        val info = listState.layoutInfo
        val item = info.visibleItemsInfo.firstOrNull { it.index == idx }
        if (item == null) listState.animateScrollToItem(idx)
        else listState.animateScrollBy((item.offset + item.size / 2 - (info.viewportStartOffset + info.viewportEndOffset) / 2).toFloat())
    }
    LazyRow(state = listState, horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(horizontal = 16.dp)) {
        itemsIndexed(segments, key = { _, s -> s.name }) { _, s ->
            val active = s == effective
            Text(
                s.label,
                color = if (active) Color.White else c.textDim,
                fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(CircleShape).background(if (active) c.accent else c.chip)
                    .clickable { choose(s) }.padding(horizontal = 14.dp, vertical = 8.dp),
            )
        }
    }
}

// MARK: - عناصر مشتركة

@Composable
private fun McCard(modifier: Modifier = Modifier, tint: Color? = null, borderTint: Color? = null, content: @Composable ColumnScope.() -> Unit) {
    val c = LocalVaraColors.current
    Column(
        modifier.fillMaxWidth().clip(McCardShape)
            .background(tint ?: c.surface)
            .border(1.dp, borderTint ?: c.outline.copy(alpha = if (c.dark) .6f else 1f), McCardShape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}

@Composable
private fun McSectionTitle(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color = LocalVaraColors.current.accent) {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(16.dp))
        Text(title, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    }
}

/// صفّ مقارنة رقمية بشريطين نسبيين — المضيف بالمحوري (يمينًا في RTL) والضيف رمادي.
/// الأشرطة بلا ForceLtr: صف RTL يبدأ من اليمين فيبقى المضيف يمينًا.
@Composable
private fun McCompareRow(title: String, home: Double, away: Double, fmt: String) {
    val c = LocalVaraColors.current
    val total = max(home + away, 0.0001)
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            ForceLtr { Text(String.format(Locale.US, fmt, home), color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
            Spacer(Modifier.weight(1f))
            Text(title, color = c.textDim, fontSize = 11.sp)
            Spacer(Modifier.weight(1f))
            ForceLtr { Text(String.format(Locale.US, fmt, away), color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
        }
        Row(Modifier.fillMaxWidth().height(6.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            Box(Modifier.weight((home / total).toFloat().coerceAtLeast(0.0001f)).fillMaxHeight().clip(CircleShape).background(c.accent))
            Box(Modifier.weight((away / total).toFloat().coerceAtLeast(0.0001f)).fillMaxHeight().clip(CircleShape).background(c.textFaint))
        }
    }
}

@Composable
private fun McLegend(homeName: String, awayName: String) {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(c.accent))
            Text(homeName, color = c.textDim, fontSize = 11.sp, maxLines = 1)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(c.textDim))
            Text(awayName, color = c.textDim, fontSize = 11.sp, maxLines = 1)
        }
    }
}

// MARK: - تبويب «تقديم» (المباراة القادمة)

@Composable
private fun McPreviewTab(st: McState, f: Fixture, nav: NavHostController) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        McVisionCard(st.previewText)
        McFormCompareCard(f, st.forms)
        st.h2h?.summary?.takeIf { it.total > 0 }?.let { s ->
            McH2HSummaryCard(s, f.home, f.away, Modifier.padding(horizontal = 16.dp))
        }
        McStarVsStarCard(f, st.homeScorers.firstOrNull(), st.awayScorers.firstOrNull())
        McBroadcastCard(st.facts?.weather, st.tv)
    }
}

/// حارس المراهنات — يشطب أي جملة تذكر الرهان/التوصية قبل العرض (حساسية المتاجر).
private fun mcSanitizeVision(text: String): String {
    val banned = listOf("رهان", "مراهن", "الرهان", "الرهانات", "bet", "odds", "توصية المزوّد", "توصية")
    val kept = text.split('.', '\n').map(String::trim).filter { s ->
        s.isNotEmpty() && banned.none { s.lowercase().contains(it) }
    }
    return if (kept.isEmpty()) "" else kept.joinToString(". ") + "."
}

@Composable
private fun McVisionCard(raw: String?) {
    val text = raw?.let(::mcSanitizeVision).orEmpty()
    if (text.isBlank()) return
    val c = LocalVaraColors.current
    McCard(Modifier.padding(horizontal = 16.dp), tint = c.gold.copy(alpha = .06f), borderTint = c.gold.copy(alpha = .28f)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Default.AutoAwesome, null, tint = c.gold, modifier = Modifier.size(16.dp))
            Text("رؤية VARA", color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        }
        McVisionText(text)
    }
}

/// قص 3 أسطر مع «اقرأ المزيد» — الزر يظهر فقط حين يتجاوز النص الحدّ فعلًا.
@Composable
private fun McVisionText(text: String) {
    val c = LocalVaraColors.current
    var expanded by remember(text) { mutableStateOf(false) }
    var truncated by remember(text) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text, color = c.textDim, fontSize = 13.sp, lineHeight = 22.sp,
            maxLines = if (expanded) Int.MAX_VALUE else 3,
            overflow = TextOverflow.Ellipsis,
            onTextLayout = { if (!expanded) truncated = it.hasVisualOverflow },
        )
        if (truncated) {
            Text(
                if (expanded) "عرض أقل" else "اقرأ المزيد",
                color = c.gold, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable { expanded = !expanded }.padding(vertical = 2.dp),
            )
        }
    }
}

// الفورمة الأخيرة — آخر 5 نتائج لكل فريق من سلسلة form في الترتيب (W/D/L).
@Composable
private fun McFormCompareCard(f: Fixture, forms: Map<Int, String>) {
    val homeForm = forms[f.home.id]; val awayForm = forms[f.away.id]
    if (homeForm.isNullOrBlank() && awayForm.isNullOrBlank()) return
    McCard(Modifier.padding(horizontal = 16.dp)) {
        McSectionTitle("الفورمة الأخيرة", Icons.AutoMirrored.Filled.TrendingUp)
        McFormRow(f.home, homeForm)
        VaraDivider()
        McFormRow(f.away, awayForm)
    }
}

@Composable
private fun McFormRow(team: Team, form: String?) {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        RemoteLogo(team.logo, team.name, 26)
        Text(team.name, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (form.isNullOrBlank()) Text("—", color = c.textFaint, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        else ForceLtr {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                form.takeLast(5).forEach { ch -> McFormChip(ch) }
            }
        }
    }
}

@Composable
private fun McFormChip(ch: Char) {
    val c = LocalVaraColors.current
    val (label, color) = when (ch.uppercaseChar()) {
        'W' -> "ف" to McGreen
        'D' -> "ت" to c.textDim
        'L' -> "خ" to c.live
        else -> "•" to c.textFaint
    }
    Box(Modifier.size(20.dp).clip(CircleShape).background(color), contentAlignment = Alignment.Center) {
        Text(label, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}

// نجما الفريقين — هدّاف كل فريق ومقارنة أهداف/صناعة الموسم.
@Composable
private fun McStarVsStarCard(f: Fixture, home: McScorer?, away: McScorer?) {
    if (home == null && away == null) return
    McCard(Modifier.padding(horizontal = 16.dp)) {
        McSectionTitle("هدّافو الفريقين", Icons.Default.Star)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            McScorerHead(home, f.home, Modifier.weight(1f))
            McScorerHead(away, f.away, Modifier.weight(1f))
        }
        if (home != null && away != null) {
            VaraDivider()
            McCompareRow("أهداف الموسم", home.goals.toDouble(), away.goals.toDouble(), "%.0f")
            if (home.assists + away.assists > 0) McCompareRow("صناعة", home.assists.toDouble(), away.assists.toDouble(), "%.0f")
        }
    }
}

@Composable
private fun McScorerHead(s: McScorer?, team: Team, modifier: Modifier) {
    val c = LocalVaraColors.current
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        RemoteLogo(s?.photo.orEmpty(), s?.name ?: "—", 46)
        Text(s?.name ?: "—", color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
        Text(team.name, color = c.textDim, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        s?.let { ForceLtr { Text("${it.goals} ⚽", color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold) } }
    }
}

// أجواء المباراة — الطقس + القنوات الناقلة.
@Composable
private fun McBroadcastCard(weather: McWeather?, tv: McTv?) {
    val c = LocalVaraColors.current
    val weatherText = mcWeatherLine(weather)
    val channels = tv?.channels?.filter { it.isNotBlank() }.orEmpty()
    if (weatherText == null && channels.isEmpty()) return
    McCard(Modifier.padding(horizontal = 16.dp)) {
        McSectionTitle("أجواء المباراة", Icons.Default.WbSunny)
        if (weatherText != null) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Default.Thermostat, null, tint = c.accent, modifier = Modifier.size(16.dp))
                Text("الطقس", color = c.textDim, fontSize = 13.sp)
                Spacer(Modifier.weight(1f))
                Text(weatherText, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (channels.isNotEmpty()) {
            if (weatherText != null) VaraDivider()
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Default.Tv, null, tint = c.accent, modifier = Modifier.size(15.dp))
                Text("القنوات الناقلة", color = c.textDim, fontSize = 13.sp)
            }
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                channels.take(12).forEach { ch ->
                    Text(
                        ch, color = c.text, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1,
                        modifier = Modifier.clip(CircleShape).background(c.chip).padding(horizontal = 9.dp, vertical = 5.dp),
                    )
                }
            }
        }
    }
}

private fun mcWeatherLine(w: McWeather?): String? {
    w ?: return null
    val parts = listOfNotNull(w.temp?.let { "$it°" }, w.description, w.humidity?.let { "رطوبة $it" }).filter { it.isNotBlank() }
    return if (parts.isEmpty()) null else parts.joinToString(" · ")
}

// MARK: - الأحداث (خطّ زمني مرئي ثنائي المحور — كتصميم الويب)

private fun mcEff(e: McEvent): Double = (e.minute ?: 0) + (e.extra ?: 0) / 100.0
private fun mcIsFirstHalf(e: McEvent): Boolean = (e.minute ?: 0) <= 45

private fun mcPillMinute(e: McEvent): String {
    val m = e.minute ?: return "—"
    val x = e.extra
    return if (x != null && x > 0) "$m'+$x" else "$m'"
}

// سطر نوع الهدف بالأخضر: فقط لما يحمل معلومة إضافية (ركلة جزاء/عكسي/رأسية…).
private fun mcGoalTypeLine(e: McEvent): String? {
    if (e.type != "goal") return null
    val l = e.label
    return if (l.isNotEmpty() && l != "هدف" && l != e.player) l else null
}

// السطر الرمادي: «بديلًا عن:» للتبديل، «صناعة:» للهدف، وصف البطاقة/الفار للبقية.
private fun mcDetailSubtitle(e: McEvent): String? = when (e.type) {
    "substitution" -> e.assist?.takeIf { it.isNotEmpty() }?.let { "بديلًا عن: $it" }
    "goal" -> e.assist?.takeIf { it.isNotEmpty() }?.let { "صناعة: $it" }
    else -> e.label.takeIf { it.isNotEmpty() && it != e.player }
}

/// ترتيب تنازلي بكسر تعادل الدقيقة بتسلسل المزوّد + حقن فاصل «نتيجة الشوط الأول»
/// عند حدّ الدقيقة 45 (الهدف العكسي يُحتسب للخصم).
private fun mcTimelineItems(events: List<McEvent>, homeId: Int, fixture: Fixture): List<McTimelineItem> {
    val sorted = events.withIndex()
        .sortedWith(compareByDescending<IndexedValue<McEvent>> { mcEff(it.value) }.thenByDescending { it.index })
        .map { it.value }
    val secondHalfReached = sorted.any { !mcIsFirstHalf(it) } || fixture.status.finished || (fixture.status.elapsed ?: 0) > 45
    var htHome = 0; var htAway = 0
    for (e in events) if (e.type == "goal" && mcIsFirstHalf(e)) {
        val ownGoal = e.label.contains("عكسي")
        if ((e.teamId == homeId) != ownGoal) htHome++ else htAway++
    }
    val items = mutableListOf<McTimelineItem>()
    var inserted = false
    for (e in sorted) {
        if (secondHalfReached && !inserted && mcIsFirstHalf(e)) { items += McTimelineItem.Halftime(htHome, htAway); inserted = true }
        items += McTimelineItem.Ev(e)
    }
    if (secondHalfReached && !inserted) items += McTimelineItem.Halftime(htHome, htAway)
    return items
}

@Composable
private fun McEventsSection(d: McDetail) {
    val c = LocalVaraColors.current
    val homeId = d.fixture.home.id
    val items = remember(d) { mcTimelineItems(d.events, homeId, d.fixture) }
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        McTimelineBar(d)
        McEventsTeamsHeader(d.fixture)
        Box(Modifier.fillMaxWidth()) {
            // المحور الأخضر المركزي (تغطّيه شارات الدقائق فتبدو متّصلة).
            Box(Modifier.matchParentSize().padding(vertical = 10.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.fillMaxHeight().width(2.dp).clip(CircleShape).background(c.accent.copy(alpha = .28f)))
            }
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items.forEach { item ->
                    when (item) {
                        is McTimelineItem.Ev -> McTimelineRow(item.e, homeId)
                        is McTimelineItem.Halftime -> McHalftimeMarker(item.home, item.away)
                    }
                }
            }
        }
    }
}

// رأس الفريقين فوق الخطّ الزمني: الضيف يسارًا، المضيف يمينًا (LTR قسري).
@Composable
private fun McEventsTeamsHeader(f: Fixture) {
    ForceLtr {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            McTeamMini(f.away, logoLeading = true)
            Spacer(Modifier.weight(1f))
            McTeamMini(f.home, logoLeading = false)
        }
    }
}

@Composable
private fun McTeamMini(t: Team, logoLeading: Boolean) {
    val c = LocalVaraColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        if (logoLeading) RemoteLogo(t.logo, t.name, 24)
        Text(t.name, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (!logoLeading) RemoteLogo(t.logo, t.name, 24)
    }
}

// صفّ حدث: شارة الدقيقة في الوسط دائمًا وبطاقة الحدث على جهة فريقها
// (المضيف يمين/الضيف يسار داخل LTR قسري — نظير grid-cols-[1fr_auto_1fr]).
@Composable
private fun McTimelineRow(e: McEvent, homeId: Int) {
    val isHome = e.teamId == homeId
    ForceLtr {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) { if (!isHome) McEventCard(e, isHome = false) }
            McMinutePill(e)
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) { if (isHome) McEventCard(e, isHome = true) }
        }
    }
}

@Composable
private fun McMinutePill(e: McEvent) {
    val c = LocalVaraColors.current
    Box(Modifier.widthIn(min = 40.dp).clip(CircleShape).background(c.accent), contentAlignment = Alignment.Center) {
        ForceLtr {
            Text(mcPillMinute(e), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
        }
    }
}

@Composable
private fun McEventCard(e: McEvent, isHome: Boolean) {
    val c = LocalVaraColors.current
    val isGoal = e.type == "goal"
    val title = e.player.ifEmpty { e.label }
    val typeLine = mcGoalTypeLine(e)
    val detailLine = mcDetailSubtitle(e)
    Row(
        Modifier.clip(VaraChipShape)
            .background(if (isGoal) c.accent.copy(alpha = .10f) else c.chip)
            .border(1.dp, if (isGoal) c.accent.copy(alpha = .25f) else Color.Transparent, VaraChipShape)
            .padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        // الأيقونة عند الحافة الداخلية الملاصقة للمحور.
        if (isHome) McEventBadge(e)
        Column(Modifier.widthIn(max = 150.dp), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(title, color = c.text, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.End)
            if (typeLine != null) Text(typeLine, color = c.accent, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.End)
            if (detailLine != null) Text(detailLine, color = c.textDim, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.End)
        }
        if (!isHome) McEventBadge(e)
    }
}

// أيقونات الأنواع الثمانية — مطابقة لألوان الويب: فار بنفسجي، تبديل أزرق سماوي.
@Composable
private fun McEventBadge(e: McEvent) {
    val c = LocalVaraColors.current
    Box(Modifier.size(18.dp), contentAlignment = Alignment.Center) {
        when (e.type) {
            "goal", "score-summary" -> Icon(Icons.Default.SportsSoccer, null, tint = c.accent, modifier = Modifier.size(15.dp))
            "shootout-summary" -> Icon(Icons.Default.Verified, null, tint = c.gold, modifier = Modifier.size(15.dp))
            "missed-penalty" -> Icon(Icons.Default.GppMaybe, null, tint = c.live, modifier = Modifier.size(15.dp))
            "var" -> Icon(Icons.Default.Tv, null, tint = McVarPurple, modifier = Modifier.size(15.dp))
            "yellow-card" -> McCardChip(McYellowCard)
            "red-card" -> McCardChip(c.live)
            "substitution" -> Icon(Icons.Default.SwapHoriz, null, tint = McSubSky, modifier = Modifier.size(15.dp))
            else -> Icon(Icons.Default.Sensors, null, tint = c.textFaint, modifier = Modifier.size(14.dp))
        }
    }
}

@Composable
private fun McCardChip(color: Color) {
    Box(Modifier.size(width = 11.dp, height = 15.dp).clip(RoundedCornerShape(2.dp)).background(color))
}

// فاصل «نتيجة الشوط الأول h - a» يغطّي المحور (الضيف أولًا داخل LTR).
@Composable
private fun McHalftimeMarker(home: Int, away: Int) {
    val c = LocalVaraColors.current
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Row(
            Modifier.clip(CircleShape).background(c.chip).border(1.dp, c.outline, CircleShape).padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Text("نتيجة الشوط الأول", color = c.textDim, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            ForceLtr { Text("$away - $home", color = c.text, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
        }
    }
}

// خطّ زمن المباراة — شريط أفقي يلخّص الأهداف والكروت: الدقيقة 0 يمينًا (RTL يدوي)،
// المضيف فوق المحور والضيف تحته، بعلامات '0/'45/'90.
@Composable
private fun McTimelineBar(d: McDetail) {
    val evs = d.events.filter { it.type == "goal" || it.type == "yellow-card" || it.type == "red-card" }
    if (evs.isEmpty()) return
    val c = LocalVaraColors.current
    val homeId = d.fixture.home.id
    val maxMin = max(90, d.events.maxOfOrNull { (it.minute ?: 0) + (it.extra ?: 0) } ?: 90)
    val marks = if (maxMin > 95) listOf(0, 45, 90, maxMin) else listOf(0, 45, 90)
    McCard {
        Text("خطّ زمن المباراة", color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        ForceLtr {
            BoxWithConstraints(Modifier.fillMaxWidth().height(96.dp)) {
                val w = maxWidth
                val inset = 16.dp
                val usable = w - inset * 2
                fun barX(minute: Int) = inset + usable * (1f - (minute.toFloat() / maxMin).coerceIn(0f, 1f))
                // المحور الأفقي
                Box(Modifier.padding(horizontal = inset).fillMaxWidth().height(2.dp).offset(y = 41.dp).background(c.accent.copy(alpha = .22f)))
                marks.forEach { m ->
                    val x = barX(m)
                    Box(Modifier.width(1.dp).height(74.dp).offset(x = x).background(c.accent.copy(alpha = .12f)))
                    Box(Modifier.width(28.dp).offset(x = x - 14.dp, y = 82.dp), contentAlignment = Alignment.Center) {
                        Text("$m'", color = c.textFaint, fontSize = 8.sp)
                    }
                }
                evs.forEach { ev ->
                    val isHome = ev.teamId == homeId
                    val x = barX((ev.minute ?: 0) + (ev.extra ?: 0))
                    Column(
                        Modifier.width(36.dp).offset(x = x - 18.dp, y = if (isHome) 4.dp else 46.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(1.dp),
                    ) {
                        if (isHome) { McBarMinuteTiny(ev); McBarMarker(ev) }
                        else { McBarMarker(ev); McBarMinuteTiny(ev) }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Box(Modifier.size(7.dp).clip(CircleShape).background(c.accent))
                Text("${d.fixture.home.name} · أعلى", color = c.textDim, fontSize = 10.sp, maxLines = 1)
            }
            Spacer(Modifier.weight(1f))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Text("${d.fixture.away.name} · أسفل", color = c.textDim, fontSize = 10.sp, maxLines = 1)
                Box(Modifier.size(7.dp).clip(CircleShape).background(c.textDim))
            }
        }
    }
}

@Composable
private fun McBarMinuteTiny(ev: McEvent) {
    val c = LocalVaraColors.current
    ForceLtr { Text(mcPillMinute(ev), color = c.textFaint, fontSize = 8.sp, fontWeight = FontWeight.SemiBold) }
}

@Composable
private fun McBarMarker(ev: McEvent) {
    val c = LocalVaraColors.current
    when (ev.type) {
        "goal" -> Box(
            Modifier.size(18.dp).clip(CircleShape).background(Color.White).border(1.dp, c.accent.copy(alpha = .6f), CircleShape),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Default.SportsSoccer, null, tint = c.accent, modifier = Modifier.size(12.dp)) }
        "yellow-card" -> Box(Modifier.size(width = 9.dp, height = 13.dp).clip(RoundedCornerShape(2.dp)).background(McYellowCard))
        "red-card" -> Box(Modifier.size(width = 9.dp, height = 13.dp).clip(RoundedCornerShape(2.dp)).background(c.live))
    }
}

// MARK: - التعليق اللحظي (أبرز اللحظات المُعرَّبة)

/// نوع اللحظة مستنتج من نصها العربي (نظير commentaryKind في iOS).
private fun mcCommentaryKind(item: McCommentaryItem): String {
    val t = item.text.lowercase()
    return when {
        item.goal || t.startsWith("هدف") || t.startsWith("goal") -> "goal"
        t.contains("بطاقة حمراء") || t.contains("red card") -> "red"
        t.contains("بطاقة صفراء") || t.contains("yellow card") -> "yellow"
        t.contains("ضربة جزاء") || t.contains("ركلة جزاء") || t.contains("penalty") -> "penalty"
        t.contains("ركلة ركنية") || t.contains("corner") -> "corner"
        t.contains("تبديل") || t.contains("substitution") -> "substitution"
        t.startsWith("تصدٍّ") || t.contains("تصدّى") || t.contains("save") -> "shot-saved"
        t.startsWith("تسديدة محالة") || t.startsWith("أهدر") || t.contains("miss") -> "shot-missed"
        t.contains("صافرة النهاية") || t.contains("full time") || t.contains("full-time") -> "fulltime"
        t.contains("الوقت بدل الضائع") || t.contains("added time") || t.contains("stoppage") -> "added-time"
        t.contains("بداية الشوط") || t.contains("نهاية الشوط") || t.contains("half") || t.contains("kick-off") || t.contains("kick off") -> "period"
        else -> "other"
    }
}

@Composable
private fun McCommentaryLiveBanner() {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(c.live))
        Text("التعليق يتحدّث مباشرةً", color = c.live, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun McCommentaryRow(item: McCommentaryItem) {
    val c = LocalVaraColors.current
    val kind = mcCommentaryKind(item)
    val highlight = kind == "goal" || item.important
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            .clip(VaraTileShape)
            .background(if (highlight) c.accent.copy(alpha = .07f) else c.surface)
            .border(1.dp, if (highlight) c.accent.copy(alpha = .28f) else c.outline.copy(alpha = if (c.dark) 0f else 1f), VaraTileShape)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.width(42.dp), contentAlignment = Alignment.Center) {
            ForceLtr {
                Text(
                    if (item.minute > 0) { val x = item.extraMinute; if (x != null && x > 0) "${item.minute}'+$x" else "${item.minute}'" } else "—",
                    color = if (highlight) c.accent else c.textDim, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                )
            }
        }
        Box(Modifier.width(20.dp), contentAlignment = Alignment.Center) { McCommentaryIcon(kind) }
        Text(item.text, color = c.text, fontSize = 13.sp, lineHeight = 21.sp, fontWeight = if (highlight) FontWeight.SemiBold else FontWeight.Normal, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun McCommentaryIcon(kind: String) {
    val c = LocalVaraColors.current
    when (kind) {
        "goal" -> Icon(Icons.Default.SportsSoccer, null, tint = c.accent, modifier = Modifier.size(14.dp))
        "yellow" -> Box(Modifier.size(width = 12.dp, height = 16.dp).clip(RoundedCornerShape(2.dp)).background(McYellowCard))
        "red" -> Box(Modifier.size(width = 12.dp, height = 16.dp).clip(RoundedCornerShape(2.dp)).background(c.live))
        "penalty" -> Icon(Icons.Default.SportsSoccer, null, tint = McTeal, modifier = Modifier.size(14.dp))
        "corner" -> Icon(Icons.Default.Flag, null, tint = McTeal, modifier = Modifier.size(13.dp))
        "substitution" -> Icon(Icons.Default.SwapHoriz, null, tint = McTeal, modifier = Modifier.size(13.dp))
        "shot-saved" -> Icon(Icons.Default.PanTool, null, tint = c.accent, modifier = Modifier.size(13.dp))
        "shot-missed" -> Icon(Icons.AutoMirrored.Filled.Send, null, tint = c.textFaint, modifier = Modifier.size(13.dp))
        "fulltime" -> Icon(Icons.Default.SportsScore, null, tint = c.live, modifier = Modifier.size(13.dp))
        "period", "added-time" -> Icon(Icons.Default.Timer, null, tint = c.textDim, modifier = Modifier.size(13.dp))
        else -> Icon(Icons.Default.Sensors, null, tint = c.textFaint, modifier = Modifier.size(13.dp))
    }
}

// MARK: - الإحصاءات (صفوف مسطّحة بلا كرت)

@Composable
private fun McStatsSection(rows: List<McStatRow>) {
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        rows.forEach { McStatRowView(it) }
    }
}

@Composable
private fun McStatRowView(row: McStatRow) {
    val c = LocalVaraColors.current
    val h = max(0.0, row.home?.number ?: 0.0)
    val a = max(0.0, row.away?.number ?: 0.0)
    val total = max(h + a, 1.0)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            ForceLtr { Text(row.home?.text ?: "—", color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
            Spacer(Modifier.weight(1f))
            Text(row.label, color = c.textDim, fontSize = 11.sp)
            Spacer(Modifier.weight(1f))
            ForceLtr { Text(row.away?.text ?: "—", color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
        }
        // بلا ForceLtr: صف RTL يبدأ يمينًا فيبقى شريط المضيف يمينًا.
        Row(Modifier.fillMaxWidth().height(6.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            Box(Modifier.weight((h / total).toFloat().coerceAtLeast(0.0001f)).fillMaxHeight().clip(CircleShape).background(c.accent))
            Box(Modifier.weight((a / total).toFloat().coerceAtLeast(0.0001f)).fillMaxHeight().clip(CircleShape).background(c.textFaint))
        }
    }
}

// MARK: - التشكيلة (ملعب ثنائي الأبعاد + دكة البدلاء)

@Composable
private fun McLineupsSection(d: McDetail, st: McState, nav: NavHostController) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        // حكم المباراة المنطلقة يبقى ضمن تبويب التشكيلة (قرار 2026-07-04).
        if (d.fixture.started) st.referee?.takeIf { it.available && it.name.isNotBlank() }?.let { McRefereeCard(it) }
        val official = d.lineups.any { it.startXI.isNotEmpty() }
        val expected = st.expected
        when {
            official -> McLineupCards(d.lineups, nav)
            expected != null && expected.available && (expected.home != null || expected.away != null) -> {
                McExpectedBadge()
                McLineupCards(mcExpectedAsLineups(expected, d.fixture), nav)
            }
            d.lineups.isEmpty() || d.lineups.none { it.startXI.isNotEmpty() } -> {
                EmptyState(
                    "لم تُعلَن التشكيلة بعد",
                    "تنزل تشكيلتا الفريقين عادةً قبل المباراة بساعة. عُد لاحقًا لاختيار الهداف.",
                )
            }
            else -> McLineupCards(d.lineups, nav)
        }
    }
}

/// «تشكيلة متوقعة» — ترشيح المزوّد قبل صدور الرسمية.
@Composable
private fun McExpectedBadge() {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(VaraChipShape).background(c.chip.copy(alpha = .5f)).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            "تشكيلة متوقعة", color = c.text, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(CircleShape).background(c.chip).padding(horizontal = 10.dp, vertical = 3.dp),
        )
        Text("ترشيح المزوّد قبل الإعلان الرسمي — قد تتغيّر", color = c.textDim, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/// تحويل المتوقعة لشكل التشكيلة الرسمية لتُرسم بنفس الملعب. id=0 يعطّل فتح اللاعب.
private fun mcExpectedAsLineups(e: McExpected, f: Fixture): List<McLineup> {
    fun convert(side: McExpectedSide?, team: Team): McLineup? = side?.let {
        McLineup(
            team = team, formation = it.formation, coach = null,
            startXI = it.starters.map { p -> McLineupPlayer(0, p.jersey, p.name, "", p.grid ?: "2:1") },
            substitutes = it.bench.map { p -> McLineupPlayer(0, p.jersey, p.name, "", null) },
        )
    }
    return listOfNotNull(convert(e.home, f.home), convert(e.away, f.away))
}

@Composable
private fun McLineupCards(lineups: List<McLineup>, nav: NavHostController) {
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        lineups.forEach { McLineupCard(it, nav) }
    }
}

@Composable
private fun McLineupCard(lu: McLineup, nav: NavHostController) {
    val c = LocalVaraColors.current
    val rows = remember(lu) { mcPitchRows(lu) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            RemoteLogo(lu.team.logo, lu.team.name, 32)
            Text(lu.team.name, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            lu.formation?.takeIf { it.isNotBlank() }?.let { fo ->
                ForceLtr {
                    Text(fo, color = c.accentDeep, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(CircleShape).background(c.chip).padding(horizontal = 10.dp, vertical = 3.dp))
                }
            }
        }
        if (rows.isEmpty()) {
            // لا إحداثيات شبكة — سقوط للقائمة النصّية.
            Column { lu.startXI.forEach { McPlayerTextRow(it, nav) } }
        } else {
            McPitch(rows, nav)
        }
        lu.coach?.takeIf { it.isNotBlank() }?.let { coach ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Icon(Icons.Default.Person, null, tint = c.textDim, modifier = Modifier.size(13.dp))
                Text("المدرب: $coach", color = c.textDim, fontSize = 11.sp)
            }
        }
        if (lu.substitutes.isNotEmpty()) McBenchGrid(lu.substitutes, nav)
    }
}

/// صفوف اللاعبين من الشبكة "صف:عمود" (الصف 1 = الحارس).
private fun mcPitchRows(lu: McLineup): List<List<McLineupPlayer>> {
    val byRow = mutableMapOf<Int, MutableList<Pair<Int, McLineupPlayer>>>()
    for (p in lu.startXI) {
        val parts = (p.grid ?: "0:0").split(':').map { it.toIntOrNull() ?: 0 }
        byRow.getOrPut(parts.getOrElse(0) { 0 }) { mutableListOf() }.add((parts.getOrElse(1) { 0 }) to p)
    }
    return byRow.keys.filter { it > 0 }.sorted().map { r -> byRow[r]!!.sortedBy { it.first }.map { it.second } }
}

@Composable
private fun McPitch(rows: List<List<McLineupPlayer>>, nav: NavHostController) {
    BoxWithConstraints(
        Modifier.fillMaxWidth().aspectRatio(3f / 4f).clip(RoundedCornerShape(18.dp))
            .background(Brush.verticalGradient(listOf(McPitchTop, McPitchBottom))),
    ) {
        val h = maxHeight
        ForceLtr {
            Box(Modifier.fillMaxSize()) {
                Box(Modifier.fillMaxSize().padding(8.dp).border(1.dp, Color.White.copy(alpha = .25f), RoundedCornerShape(12.dp)))
                Box(Modifier.fillMaxWidth().height(1.dp).align(Alignment.Center).background(Color.White.copy(alpha = .2f)))
                Box(Modifier.size(64.dp).align(Alignment.Center).border(1.dp, Color.White.copy(alpha = .25f), CircleShape))
                rows.forEachIndexed { ri, players ->
                    val y = h * (1f - (ri + 0.6f) / (rows.size + 0.4f))
                    Row(Modifier.fillMaxWidth().height(56.dp).offset(y = y - 28.dp), verticalAlignment = Alignment.CenterVertically) {
                        players.forEach { p ->
                            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { McPitchDot(p, nav) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun McPitchDot(p: McLineupPlayer, nav: NavHostController) {
    // id=0 (تشكيلة متوقعة) — لا صفحة لاعب لفتحها.
    Column(
        Modifier.clip(VaraChipShape).clickable(enabled = p.id > 0) { nav.navigate("player/${p.id}") }.padding(2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Box(Modifier.size(28.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
            Text(p.number?.toString() ?: "•", color = McPitchBottom, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        Text(p.name, color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 60.dp))
    }
}

@Composable
private fun McBenchGrid(subs: List<McLineupPlayer>, nav: NavHostController) {
    val c = LocalVaraColors.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Default.EventSeat, null, tint = c.accent, modifier = Modifier.size(13.dp))
            Text("دكة البدلاء", color = c.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("(${subs.size})", color = c.textDim, fontSize = 11.sp)
        }
        subs.chunked(2).forEach { pair ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pair.forEach { p -> McBenchRow(p, nav, Modifier.weight(1f)) }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun McBenchRow(p: McLineupPlayer, nav: NavHostController, modifier: Modifier) {
    val c = LocalVaraColors.current
    Row(
        modifier.clip(RoundedCornerShape(10.dp)).background(c.chip)
            .clickable(enabled = p.id > 0) { nav.navigate("player/${p.id}") }
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(22.dp).clip(CircleShape).background(c.accent.copy(alpha = .15f)), contentAlignment = Alignment.Center) {
            Text(p.number?.toString() ?: "•", color = c.accentDeep, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        Text(p.name, color = c.text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun McPlayerTextRow(p: McLineupPlayer, nav: NavHostController) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().clickable(enabled = p.id > 0) { nav.navigate("player/${p.id}") }.padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.width(26.dp)) { ForceLtr { Text(p.number?.toString() ?: "—", color = c.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold) } }
        Text(p.name, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (p.pos.isNotEmpty()) Text(p.pos, color = c.textFaint, fontSize = 10.sp)
    }
}

// MARK: - التحليل (إثراء SportMonks)

@Composable
private fun McAnalysisTab(st: McState, f: Fixture) {
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        st.xg?.takeIf { it.available }?.let { McXgCard(it) }
        st.momentum?.takeIf { it.available && it.points.isNotEmpty() }?.let { m ->
            McCard {
                McSectionTitle("الزخم", Icons.Default.GraphicEq)
                McFlowChart(m.points)
                McLegend(f.home.name, f.away.name)
            }
        }
        st.pressure?.takeIf { it.available && it.points.isNotEmpty() }?.let { p ->
            McCard {
                McSectionTitle("مؤشّر الضغط", Icons.Default.Speed)
                McFlowChart(mcDownsample(p.points, 24))
                McLegend(f.home.name, f.away.name)
            }
        }
        st.facts?.takeIf { it.available }?.let { McFactsCard(it) }
    }
}

@Composable
private fun McXgCard(x: McXg) {
    val c = LocalVaraColors.current
    McCard {
        McSectionTitle("الأهداف المتوقّعة (xG)", Icons.Default.TrackChanges)
        McCompareRow("xG", x.homeXg, x.awayXg, "%.2f")
        McCompareRow("على المرمى (xGOT)", x.homeXgot, x.awayXgot, "%.2f")
        if (x.topPlayers.isNotEmpty()) {
            VaraDivider()
            x.topPlayers.take(4).forEach { p ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(if (p.location == "home") c.accent else c.textDim))
                    Text(p.name, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    ForceLtr { Text(String.format(Locale.US, "%.2f", p.xg), color = c.accentDeep, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                }
            }
        }
    }
}

/// مخطّط تدفّق (زخم/ضغط) — أعمدة فوق/تحت خط المنتصف: net موجب = أفضلية المضيف.
@Composable
private fun McFlowChart(points: List<McFlowPoint>) {
    val c = LocalVaraColors.current
    val homeColor = c.accent; val awayColor = c.textDim; val midColor = c.outline
    Canvas(Modifier.fillMaxWidth().height(92.dp)) {
        if (points.isEmpty()) return@Canvas
        val maxAbs = max(points.maxOf { abs(it.net) }, 0.001)
        val mid = size.height / 2
        val slot = size.width / points.size
        val barW = max(1.5f, slot * 0.66f)
        points.forEachIndexed { i, p ->
            val x = i * slot + (slot - barW) / 2
            val h = ((abs(p.net) / maxAbs) * (mid - 2)).toFloat()
            val isHome = p.net >= 0
            drawRoundRect(
                color = if (isHome) homeColor else awayColor,
                topLeft = Offset(x, if (isHome) mid - h else mid),
                size = Size(barW, max(h, 0.5f)),
                cornerRadius = CornerRadius(1f, 1f),
            )
        }
        drawLine(midColor, Offset(0f, mid), Offset(size.width, mid), 1f)
    }
}

private fun mcDownsample(points: List<McFlowPoint>, maxCount: Int): List<McFlowPoint> {
    if (points.size <= maxCount) return points
    val step = ceil(points.size / maxCount.toDouble()).toInt()
    return points.filterIndexed { i, _ -> i % step == 0 }
}

@Composable
private fun McFactsCard(f: McFacts) {
    val c = LocalVaraColors.current
    McCard {
        McSectionTitle("وقائع المباراة", Icons.Default.AutoAwesome)
        val hth = f.halftimeHome; val hta = f.halftimeAway
        if (hth != null && hta != null) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("نتيجة الشوط الأول", color = c.textDim, fontSize = 13.sp)
                Spacer(Modifier.weight(1f))
                ForceLtr { Text("$hth - $hta", color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold) }
            }
        }
        mcWeatherLine(f.weather)?.let { w ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("الطقس", color = c.textDim, fontSize = 13.sp)
                Spacer(Modifier.weight(1f))
                Text(w, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (f.absentees.isNotEmpty()) {
            VaraDivider()
            Text("الغيابات", color = c.accentDeep, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            f.absentees.take(6).forEach { ab ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(if (ab.location == "home") c.accent else c.textDim))
                    Text(ab.name, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(ab.reason, color = c.textFaint, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

// MARK: - التقييمات

@Composable
private fun McRatingsTab(ratings: McRatings?, nav: NavHostController) {
    ratings ?: return
    val c = LocalVaraColors.current
    val rated = ratings.players.filter { (it.rating ?: 0.0) > 0.0 }.sortedByDescending { it.rating ?: 0.0 }
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        ratings.motm?.let { m -> McMotmCard(m, rated.firstOrNull { it.id == m.id }?.photo.orEmpty(), nav) }
        Column(Modifier.clip(McCardShape).background(c.surface).border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), McCardShape)) {
            rated.forEachIndexed { idx, p ->
                if (idx > 0) VaraDivider()
                McRatingRow(p, nav)
            }
        }
    }
}

/// «أفضل لاعب في المباراة» — تميّز بالذهبي لا اللون المحوري.
@Composable
private fun McMotmCard(m: McMotm, photo: String, nav: NavHostController) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().clip(McCardShape).background(c.gold.copy(alpha = .07f))
            .border(1.dp, c.gold.copy(alpha = .3f), McCardShape)
            .clickable(enabled = m.id > 0) { nav.navigate("player/${m.id}") }
            .padding(13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        RemoteLogo(photo, m.name, 52)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Icon(Icons.Default.Star, null, tint = c.gold, modifier = Modifier.size(11.dp))
                Text("أفضل لاعب في المباراة", color = c.gold, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
            Text(m.name, color = c.text, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(m.team, color = c.textDim, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        McRatingBadge(m.rating)
    }
}

@Composable
private fun McRatingRow(p: McRatedPlayer, nav: NavHostController) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().clickable(enabled = p.id > 0) { nav.navigate("player/${p.id}") }.padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        RemoteLogo(p.photo, p.name, 36)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                p.number?.let { Text("$it", color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.Bold) }
                Text(p.name, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (p.captain) {
                    // شارة الكابتن — نظير c.square.fill.
                    Box(Modifier.size(14.dp).clip(RoundedCornerShape(3.dp)).background(c.accent), contentAlignment = Alignment.Center) {
                        Text("C", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(p.team, color = c.textDim, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                p.pos?.takeIf { it.isNotBlank() }?.let { Text("· $it", color = c.textFaint, fontSize = 10.sp) }
                p.minutes?.takeIf { it > 0 }?.let { ForceLtr { Text("· $it′", color = c.textFaint, fontSize = 10.sp) } }
            }
        }
        p.goals?.takeIf { it > 0 }?.let { g ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                Icon(Icons.Default.SportsSoccer, null, tint = c.accent, modifier = Modifier.size(12.dp))
                Text("$g", color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
        p.rating?.takeIf { it > 0 }?.let { McRatingBadge(it) }
    }
}

/// شارة التقييم: ≥7 ذهبي التميّز · 6–7 محايد · أقل قرمزي.
@Composable
private fun McRatingBadge(r: Double) {
    val c = LocalVaraColors.current
    val bg = when {
        r >= 7 -> c.gold
        r >= 6 -> c.textDim
        else -> c.live
    }
    ForceLtr {
        Text(
            String.format(Locale.US, "%.1f", r), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(CircleShape).background(bg).padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

// MARK: - المواجهات المباشرة

@Composable
private fun McH2HTab(h2h: McH2H?, f: Fixture, nav: NavHostController) {
    h2h ?: return
    val summary = h2h.summary ?: return
    val c = LocalVaraColors.current
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        McH2HSummaryCard(summary, f.home, f.away)
        Column(Modifier.clip(McCardShape).background(c.surface).border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else 1f), McCardShape)) {
            h2h.meetings.forEachIndexed { idx, m ->
                if (idx > 0) VaraDivider()
                McH2HMeetingRow(m, nav)
            }
        }
    }
}

@Composable
private fun McH2HSummaryCard(s: McH2HSummary, home: Team, away: Team, modifier: Modifier = Modifier) {
    val c = LocalVaraColors.current
    val total = max(1, s.total)
    McCard(modifier) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            McH2HStat("${s.homeWins}", home.name, c.accent, Modifier.weight(1f))
            McH2HStat("${s.draws}", "تعادل", c.textDim, Modifier.weight(1f))
            McH2HStat("${s.awayWins}", away.name, c.text, Modifier.weight(1f))
        }
        // بلا ForceLtr: صف RTL يبدأ يمينًا فيبقى شريط المضيف يمينًا.
        Row(Modifier.fillMaxWidth().height(8.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Box(Modifier.weight((s.homeWins.toFloat() / total).coerceAtLeast(0.0001f)).fillMaxHeight().clip(CircleShape).background(c.accent))
            Box(Modifier.weight((s.draws.toFloat() / total).coerceAtLeast(0.0001f)).fillMaxHeight().clip(CircleShape).background(c.textFaint.copy(alpha = .45f)))
            Box(Modifier.weight((s.awayWins.toFloat() / total).coerceAtLeast(0.0001f)).fillMaxHeight().clip(CircleShape).background(c.textDim))
        }
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Text("آخر ${s.total} لقاءات بين الفريقين", color = c.textFaint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun McH2HStat(value: String, label: String, color: Color, modifier: Modifier) {
    val c = LocalVaraColors.current
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(value, color = color, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Text(label, color = c.textDim, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
    }
}

/// صفّ لقاء سابق — النقر يفتح مركز ذلك اللقاء.
@Composable
private fun McH2HMeetingRow(m: McH2HMeeting, nav: NavHostController) {
    val c = LocalVaraColors.current
    Column(
        Modifier.fillMaxWidth().clickable { nav.navigate("match/${m.id}") }.padding(horizontal = 14.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(m.home.name, color = c.text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
                RemoteLogo(m.home.logo, m.home.name, 22)
            }
            Box(Modifier.width(46.dp), contentAlignment = Alignment.Center) {
                ForceLtr { Text("${m.awayGoals ?: 0} - ${m.homeGoals ?: 0}", color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold) }
            }
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                RemoteLogo(m.away.logo, m.away.name, 22)
                Text(m.away.name, color = c.text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            }
        }
        if (m.competition.isNotBlank()) Text(m.competition, color = c.textFaint, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
