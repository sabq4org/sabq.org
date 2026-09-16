package com.sabq.vara.ui

// صفحتا النادي واللاعب — نقل 1:1 من iOS TeamPlayerPages.swift (SpTeamPage/SpPlayerPage):
// تمرير واحد متواصل بلا تبويبات، ترويسة بطلة، بلاطات حقائق، وشبكات أرقام.
// الجلب مطابق: النادي /sports/team/{id}?with=stats + إثراء متوازٍ غير حاجب
// (injuries?comp=pro-league و transfers {arrivals, departures})، واللاعب
// /sports/player/{id}?with=extras + /form + /market. فشل الإثراء لا يحجب الصفحة،
// والتحديث الفاشل لا يمحو بيانات معروضة.

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Cake
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Checkroom
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Healing
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Stadium
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.SwapHoriz
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import coil.compose.AsyncImage
import com.sabq.vara.core.FavoriteTeam
import com.sabq.vara.core.Fixture
import com.sabq.vara.core.VaraFormat
import com.sabq.vara.core.VaraViewModel
import com.sabq.vara.core.bool
import com.sabq.vara.core.findArray
import com.sabq.vara.core.int
import com.sabq.vara.core.latinNumber
import com.sabq.vara.core.obj
import com.sabq.vara.core.parseFixture
import com.sabq.vara.core.string
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import java.time.LocalDate
import java.util.Locale

// MARK: - صفحة النادي

@Composable
fun TeamScreen(nav: NavHostController, vm: VaraViewModel, teamId: Int) {
    val c = LocalVaraColors.current
    val context = LocalContext.current
    val account by vm.account.collectAsState()
    val favorite by vm.favoriteTeam.collectAsState()
    val scope = rememberCoroutineScope()
    var data by remember(teamId) { mutableStateOf<TpTeamData?>(null) }
    var error by remember(teamId) { mutableStateOf<String?>(null) }
    var refreshing by remember(teamId) { mutableStateOf(false) }
    var revision by remember(teamId) { mutableIntStateOf(0) }

    // فشل التحديث لا يمحو المعروض: الخطأ يُسجَّل فقط عند غياب أي بيانات.
    val load: suspend (Boolean, Boolean) -> Unit = { full, ignoreCache ->
        tpFetchTeam(vm, teamId, full, ignoreCache, data)
            .onSuccess { data = it; error = null }
            .onFailure { if (data == null) error = it.message ?: "تعذّر تحميل النادي" }
    }

    // أول نداء فوري عند كل عودة للمقدمة، ثم استطلاع فقط عند وجود مباراة جارية/
    // قريبة (idleMs=null يوقف الاستطلاع الخامل). التكرارات تجدد الأساسي فقط.
    PollEffect(teamId, revision, delayProvider = { adaptivePollDelayMs(data?.fixtures ?: emptyList(), idleMs = null) }) { first ->
        load(first, !first)
    }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        val d = data
        if (d == null) {
            val state: LoadState<Unit> = error?.let { LoadState.Error(it) } ?: LoadState.Loading
            Column {
                BackHeader(nav, "النادي") { TpShareButton(context, "https://sabq.org/sports/team/$teamId") }
                LoadStateHost(state, { error = null; revision++ }) {}
            }
        } else VaraPullRefresh(
            refreshing = refreshing,
            onRefresh = { scope.launch { refreshing = true; load(true, true); refreshing = false } },
        ) {
            val isFav = favorite?.id == teamId
            val isFollowing = account.follows.any { it.kind == "team" && it.refId == "$teamId" }
            val live = d.fixtures.filter { it.started && !it.status.finished }
            val upcoming = d.fixtures.filter { !it.started }.take(6)
            val finished = d.fixtures.filter { it.status.finished }.takeLast(8).reversed()
            val squadGroups = d.squad.groupBy { it.positionEn }.entries.sortedBy { tpPositionRank(it.key) }
            LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item("header") { BackHeader(nav, d.name) { TpShareButton(context, "https://sabq.org/sports/team/$teamId") } }
                item("hero") { TpTeamHero(d) }
                item("follow") {
                    TpFollowBar(
                        isFav = isFav,
                        isFollowing = isFollowing,
                        loggedIn = account.loggedIn,
                        onFavorite = {
                            vm.setFavoriteTeam(
                                if (isFav) null else FavoriteTeam(
                                    teamId, d.name, d.logo,
                                    d.competitionSlug.takeIf { it.isNotBlank() },
                                    d.competitionName.takeIf { it.isNotBlank() },
                                ),
                            )
                        },
                        onFollow = { vm.toggleFollow("team", "$teamId", d.name, d.logo) { nav.navigate(Routes.Login) } },
                    )
                }
                if (d.rank != null || d.points != null || d.founded != null || d.squad.isNotEmpty()) item("facts") { TpTeamFacts(d) }
                d.coach?.let { coach -> item("coach") { TpCoachCard(coach) } }
                d.venue?.let { venue -> item("venue") { TpVenueCard(venue) } }
                if (d.injuries.isNotEmpty()) item("injuries") { TpInjuriesSection(d.injuries) }
                d.stats?.let { st -> item("stats") { TpTeamStatsGrid(st) } }
                if (d.arrivals.isNotEmpty() || d.departures.isNotEmpty()) item("transfers") { TpTransfersSection(d.arrivals, d.departures) }
                item("matches-title") {
                    Text("المباريات", color = c.text, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp))
                }
                if (d.fixtures.isEmpty()) item("matches-empty") {
                    Text(
                        "لا توجد مباريات معلنة بعد",
                        color = c.textDim, fontSize = 13.sp, textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 20.dp),
                    )
                } else {
                    tpMatchGroup("مباشر الآن", live, nav)
                    tpMatchGroup("المباريات القادمة", upcoming, nav)
                    tpMatchGroup("النتائج", finished, nav)
                }
                if (d.scorers.isNotEmpty()) item("scorers") { TpScorersSection(d.scorers) { nav.navigate("player/$it") } }
                item("squad-title") {
                    Text("القائمة", color = c.text, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp))
                }
                if (d.squad.isEmpty()) item("squad-empty") {
                    Text(
                        "القائمة الرسمية لم تُعلن بعد",
                        color = c.textDim, fontSize = 13.sp, textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 20.dp),
                    )
                } else squadGroups.forEach { (posEn, players) ->
                    item("squad-h-$posEn") {
                        Text(
                            players.first().position.ifBlank { tpPositionAr(posEn) },
                            color = c.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 16.dp),
                        )
                    }
                    items(players, key = { "sq-${it.id}" }) { pl ->
                        Box(Modifier.padding(horizontal = 16.dp)) { TpSquadRow(pl) { nav.navigate("player/${pl.id}") } }
                    }
                }
                item("bottom") { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

// MARK: - صفحة اللاعب

@Composable
fun PlayerScreen(nav: NavHostController, vm: VaraViewModel, playerId: Int) {
    val c = LocalVaraColors.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var data by remember(playerId) { mutableStateOf<TpPlayerData?>(null) }
    var form by remember(playerId) { mutableStateOf<TpForm?>(null) }
    var market by remember(playerId) { mutableStateOf<TpMarket?>(null) }
    var error by remember(playerId) { mutableStateOf<String?>(null) }
    var refreshing by remember(playerId) { mutableStateOf(false) }
    var revision by remember(playerId) { mutableIntStateOf(0) }

    // الأساسي (?with=extras يتضمن history/transfers/injuries) + /form و/market
    // بالتوازي — فشل أيٍّ من الإثراءين لا يحجب البطاقة ولا يمحو قيمة معروضة.
    val load: suspend (Boolean) -> Unit = { ignoreCache ->
        coroutineScope {
            val formD = async { runCatching { vm.api.publicGet("/sports/player/$playerId/form", ignoreCache = ignoreCache) }.getOrNull() }
            val marketD = async { runCatching { vm.api.publicGet("/sports/player/$playerId/market", ignoreCache = ignoreCache) }.getOrNull() }
            runCatching { vm.api.publicGet("/sports/player/$playerId", mapOf("with" to "extras"), ignoreCache).jsonObject }
                .onSuccess { data = tpParsePlayer(it); error = null }
                .onFailure { if (data == null) error = it.message ?: "تعذّر تحميل اللاعب" }
            formD.await()?.let { form = tpParseForm(it) }
            marketD.await()?.let { market = tpParseMarket(it) }
        }
    }

    LaunchedEffect(playerId, revision) { load(revision > 0) }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        val d = data
        if (d == null) {
            val state: LoadState<Unit> = error?.let { LoadState.Error(it) } ?: LoadState.Loading
            Column {
                BackHeader(nav, "بطاقة اللاعب") { TpShareButton(context, "https://sabq.org/sports/player/$playerId") }
                LoadStateHost(state, { error = null; revision++ }) {}
            }
        } else VaraPullRefresh(
            refreshing = refreshing,
            onRefresh = { scope.launch { refreshing = true; load(true); refreshing = false } },
        ) {
            val birthParts = tpBirthParts(d)
            val visibleMarket = market?.takeIf { it.available && (it.value ?: 0.0) > 0.0 }
            val visibleForm = form?.takeIf { it.available && it.matches.isNotEmpty() }
            LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item("header") { BackHeader(nav, "بطاقة اللاعب") { TpShareButton(context, "https://sabq.org/sports/player/$playerId") } }
                item("identity") { TpPlayerIdentity(d) }
                if (d.age != null || d.height != null || d.weight != null) item("facts") { TpPlayerFacts(d) }
                if (birthParts.isNotEmpty()) item("birth") {
                    Row(
                        Modifier.padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(Icons.Default.Cake, null, tint = c.textDim, modifier = Modifier.size(13.dp))
                        Text(birthParts.joinToString(" — "), color = c.textDim, fontSize = 12.sp)
                    }
                }
                visibleMarket?.let { m -> item("market") { TpMarketSection(m) } }
                if (d.seasonStats.isNotEmpty()) item("season-stats") { TpSeasonStatsSection(d.seasonStats) }
                visibleForm?.let { f -> item("form") { TpFormSection(f.matches) } }
                if (d.history.isNotEmpty()) item("history") { TpHistorySection(d.history) }
                if (d.career.isNotEmpty()) item("career") { TpCareerSection(d.career) }
                if (d.trophies.isNotEmpty()) item("trophies") { TpTrophiesSection(d.trophies) }
                item("bottom") { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

// MARK: - نماذج خاصة (Tp)

private data class TpVenue(val name: String, val city: String, val capacity: Int?)
private data class TpCoach(val name: String, val photo: String, val nationality: String, val age: Int?)
private data class TpPlayerNationality(val name: String?, val flag: String?, val code: String?)
private data class TpSquadPlayer(
    val id: Int, val name: String, val number: Int?, val position: String, val positionEn: String,
    val age: Int?, val photo: String, val captain: Boolean? = null,
    val nationality: TpPlayerNationality? = null, val detailedPosition: String? = null,
)
private data class TpScorer(val rank: Int, val id: Int, val name: String, val photo: String, val goals: Int, val assists: Int, val matches: Int)
private data class TpInjury(val player: String, val reason: String?, val until: String?)
private data class TpTransferItem(val player: String, val team: String, val teamLogo: String, val type: String)
private data class TpTeamStats(
    val played: Int, val wins: Int, val draws: Int, val loses: Int,
    val goalsFor: Int, val goalsAgainst: Int, val cleanSheets: Int,
    val yellow: Int, val red: Int, val formation: String?, val streakWin: Int?,
)
private data class TpTeamData(
    val id: Int, val name: String, val logo: String, val founded: Int?,
    val venue: TpVenue?, val rank: Int?, val points: Int?,
    val competitionSlug: String, val competitionName: String, val coach: TpCoach?, val stats: TpTeamStats?,
    val fixtures: List<Fixture>, val squad: List<TpSquadPlayer>, val scorers: List<TpScorer>,
    val injuries: List<TpInjury>, val arrivals: List<TpTransferItem>, val departures: List<TpTransferItem>,
)

private data class TpSeasonStat(
    val competition: String, val teamLogo: String,
    val matches: Int, val lineups: Int, val minutes: Int, val rating: Double?,
    val goals: Int, val assists: Int, val yellow: Int, val red: Int, val saves: Int, val conceded: Int,
)
private data class TpCareerStop(val teamId: Int, val team: String, val logo: String, val seasons: List<Int>)
private data class TpTrophy(val competition: String, val country: String, val season: String, val place: String, val winner: Boolean)
private data class TpHistoryRow(val season: Int, val competition: String, val matches: Int, val goals: Int, val assists: Int)
private data class TpFormMatch(
    val date: String, val opponent: String, val opponentLogo: String?, val homeAway: String?,
    val result: String, val scoreFor: Int?, val scoreAgainst: Int?,
    val xg: Double?, val goals: Int?, val rating: Double?, val league: String?,
)
private data class TpForm(val available: Boolean, val matches: List<TpFormMatch>)
private data class TpMarket(val available: Boolean, val value: Double?, val currency: String?, val peak: Double?)
private data class TpPlayerData(
    val id: Int, val name: String, val fullName: String?, val photo: String,
    val position: String, val number: Int?, val age: Int?,
    val birthDate: String?, val birthPlace: String?, val nationality: String?,
    val height: Int?, val weight: Int?,
    val seasonStats: List<TpSeasonStat>, val career: List<TpCareerStop>,
    val trophies: List<TpTrophy>, val history: List<TpHistoryRow>,
)

// MARK: - الجلب والفكّ

private fun JsonObject.tpDouble(vararg keys: String): Double? = keys.firstNotNullOfOrNull { key ->
    val p = this[key] as? JsonPrimitive
    p?.doubleOrNull ?: p?.contentOrNull?.toDoubleOrNull()
}

/// النادي: الأساسي ?with=stats؛ ومع full الإثراءان بالتوازي — injuries تتطلب
/// ?comp (بدونها يرجع الخادم [])، وtransfers ردّه {arrivals, departures}.
private suspend fun tpFetchTeam(
    vm: VaraViewModel,
    teamId: Int,
    full: Boolean,
    ignoreCache: Boolean,
    previous: TpTeamData?,
): Result<TpTeamData> = runCatching {
    coroutineScope {
        val injuriesD = if (full) async {
            runCatching { vm.api.publicGet("/sports/team/$teamId/injuries", mapOf("comp" to "pro-league"), ignoreCache) }.getOrNull()
        } else null
        val transfersD = if (full) async {
            runCatching { vm.api.publicGet("/sports/team/$teamId/transfers", ignoreCache = ignoreCache) }.getOrNull()
        } else null
        val root = vm.api.publicGet("/sports/team/$teamId", mapOf("with" to "stats"), ignoreCache).jsonObject
        val base = tpParseTeamProfile(root)
        val transfers = transfersD?.await()?.let(::tpParseTransfers)
        base.copy(
            injuries = injuriesD?.await()?.let(::tpParseInjuries) ?: previous?.injuries.orEmpty(),
            arrivals = transfers?.first ?: previous?.arrivals.orEmpty(),
            departures = transfers?.second ?: previous?.departures.orEmpty(),
        )
    }
}

private fun tpParseTeamProfile(root: JsonObject): TpTeamData {
    val team = root.obj("team") ?: root
    val venueObj = team.obj("venue")
    val standing = root.obj("standing")
    val coachObj = root.obj("coach")
    return TpTeamData(
        id = team.int("id") ?: 0,
        name = team.string("name", "nameAr") ?: "النادي",
        logo = team.string("logo") ?: "",
        founded = team.int("founded"),
        venue = venueObj?.string("name")?.let { TpVenue(it, venueObj.string("city") ?: "", venueObj.int("capacity")) },
        rank = standing?.int("rank"),
        points = standing?.int("points"),
        competitionSlug = root.string("competitionSlug") ?: "",
        competitionName = root.string("competitionName") ?: "",
        coach = coachObj?.string("name")?.let {
            TpCoach(it, coachObj.string("photo") ?: "", coachObj.string("nationality") ?: "", coachObj.int("age"))
        },
        stats = root.obj("stats")?.let(::tpParseTeamStats),
        fixtures = findArray(root, "fixtures").mapNotNull(::parseFixture),
        squad = findArray(root, "squad").mapNotNull(::tpParseSquadPlayer).distinctBy { it.id },
        scorers = findArray(root, "topScorers").mapNotNull(::tpParseScorer),
        injuries = emptyList(), arrivals = emptyList(), departures = emptyList(),
    )
}

/// SpTeamStats المتداخل: fixtures.played.total إلخ + goals.for/against.total +
/// summary.cleanSheets/cards/mostUsedFormation + biggest.streakWin.
private fun tpParseTeamStats(o: JsonObject): TpTeamStats? {
    val fixtures = o.obj("fixtures") ?: return null
    fun total(key: String) = fixtures.obj(key)?.int("total") ?: 0
    val goals = o.obj("goals")
    val summary = o.obj("summary")
    val cards = summary?.obj("cards")
    return TpTeamStats(
        played = total("played"), wins = total("wins"), draws = total("draws"), loses = total("loses"),
        goalsFor = goals?.obj("for")?.int("total") ?: 0,
        goalsAgainst = goals?.obj("against")?.int("total") ?: 0,
        cleanSheets = summary?.obj("cleanSheets")?.int("total") ?: 0,
        yellow = cards?.int("yellowTotal") ?: 0,
        red = cards?.int("redTotal") ?: 0,
        formation = summary?.string("mostUsedFormation"),
        streakWin = o.obj("biggest")?.int("streakWin"),
    )
}

private fun tpParseSquadPlayer(e: JsonElement): TpSquadPlayer? {
    val o = e as? JsonObject ?: return null
    val natObj = o.obj("nationality")
    val nat = if (natObj != null) {
        TpPlayerNationality(
            name = natObj.string("name"),
            flag = natObj.string("flag"),
            code = natObj.string("code"),
        )
    } else null
    return TpSquadPlayer(
        id = o.int("id") ?: return null,
        name = o.string("name") ?: return null,
        number = o.int("number"),
        position = o.string("position") ?: "",
        positionEn = o.string("positionEn") ?: "",
        age = o.int("age"),
        photo = o.string("photo") ?: "",
        captain = o.bool("captain"),
        nationality = nat,
        detailedPosition = o.string("detailedPosition"),
    )
}

private fun tpParseScorer(e: JsonElement): TpScorer? {
    val o = e as? JsonObject ?: return null
    return TpScorer(
        rank = o.int("rank") ?: 0,
        id = o.int("id") ?: 0,
        name = o.string("name") ?: return null,
        photo = o.string("photo") ?: "",
        goals = o.int("goals") ?: 0,
        assists = o.int("assists") ?: 0,
        matches = o.int("matches") ?: 0,
    )
}

private fun tpParseInjuries(root: JsonElement): List<TpInjury> =
    findArray(root, "injuries").mapNotNull { e ->
        val o = e as? JsonObject ?: return@mapNotNull null
        o.string("player")?.let { TpInjury(it, o.string("reason"), o.string("until")) }
    }

private fun tpParseTransfers(root: JsonElement): Pair<List<TpTransferItem>, List<TpTransferItem>> {
    val o = root as? JsonObject ?: return emptyList<TpTransferItem>() to emptyList()
    fun list(key: String) = (o[key] as? JsonArray).orEmpty().mapNotNull { e ->
        val item = e as? JsonObject ?: return@mapNotNull null
        item.string("player")?.let {
            TpTransferItem(it, item.string("team") ?: "", item.string("teamLogo") ?: "", item.string("type") ?: "")
        }
    }
    return list("arrivals") to list("departures")
}

private fun tpParsePlayer(root: JsonObject): TpPlayerData {
    val p = root.obj("player", "profile") ?: root
    return TpPlayerData(
        id = p.int("id") ?: 0,
        name = p.string("name", "nameAr") ?: "اللاعب",
        fullName = p.string("fullName"),
        photo = p.string("photo") ?: "",
        position = p.string("position") ?: "",
        number = p.int("number"),
        age = p.int("age"),
        birthDate = p.string("birthDate"),
        birthPlace = p.string("birthPlace"),
        nationality = p.string("nationality"),
        height = p.int("height"),
        weight = p.int("weight"),
        seasonStats = findArray(root, "seasonStats").mapNotNull(::tpParseSeasonStat),
        career = findArray(root, "career").mapNotNull(::tpParseCareerStop),
        trophies = findArray(root, "trophies").mapNotNull(::tpParseTrophy),
        history = findArray(root, "history").mapNotNull(::tpParseHistory),
    )
}

private fun tpParseSeasonStat(e: JsonElement): TpSeasonStat? {
    val o = e as? JsonObject ?: return null
    return TpSeasonStat(
        competition = o.string("competition") ?: return null,
        teamLogo = o.obj("team")?.string("logo") ?: "",
        matches = o.int("matches") ?: 0,
        lineups = o.int("lineups") ?: 0,
        minutes = o.int("minutes") ?: 0,
        rating = o.tpDouble("rating"),
        goals = o.int("goals") ?: 0,
        assists = o.int("assists") ?: 0,
        yellow = o.int("yellow") ?: 0,
        red = o.int("red") ?: 0,
        saves = o.int("saves") ?: 0,
        conceded = o.int("conceded") ?: 0,
    )
}

private fun tpParseCareerStop(e: JsonElement): TpCareerStop? {
    val o = e as? JsonObject ?: return null
    return TpCareerStop(
        teamId = o.int("teamId") ?: 0,
        team = o.string("team") ?: return null,
        logo = o.string("logo") ?: "",
        seasons = (o["seasons"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.intOrNull },
    )
}

private fun tpParseTrophy(e: JsonElement): TpTrophy? {
    val o = e as? JsonObject ?: return null
    return TpTrophy(
        competition = o.string("competition") ?: return null,
        country = o.string("country") ?: "",
        season = o.string("season") ?: o.int("season")?.toString() ?: "",
        place = o.string("place") ?: "",
        winner = o.bool("winner") ?: false,
    )
}

private fun tpParseHistory(e: JsonElement): TpHistoryRow? {
    val o = e as? JsonObject ?: return null
    return TpHistoryRow(
        season = o.int("season") ?: return null,
        competition = o.string("competition") ?: "",
        matches = o.int("matches") ?: 0,
        goals = o.int("goals") ?: 0,
        assists = o.int("assists") ?: 0,
    )
}

private fun tpParseForm(root: JsonElement): TpForm {
    val o = root as? JsonObject ?: return TpForm(false, emptyList())
    val matches = findArray(o, "matches").mapNotNull { e ->
        val m = e as? JsonObject ?: return@mapNotNull null
        TpFormMatch(
            date = m.string("date") ?: "",
            opponent = m.string("opponent") ?: "",
            opponentLogo = m.string("opponentLogo"),
            homeAway = m.string("homeAway"),
            result = m.string("result") ?: "D",
            scoreFor = m.int("scoreFor"),
            scoreAgainst = m.int("scoreAgainst"),
            xg = m.tpDouble("xg"),
            goals = m.int("goals"),
            rating = m.tpDouble("rating"),
            league = m.string("league"),
        )
    }
    return TpForm(o.bool("available") ?: false, matches)
}

private fun tpParseMarket(root: JsonElement): TpMarket {
    val o = root as? JsonObject ?: return TpMarket(false, null, null, null)
    return TpMarket(o.bool("available") ?: false, o.tpDouble("value"), o.string("currency"), o.tpDouble("peak"))
}

// MARK: - مساعدات عامة

/// «85 مليون €» — نظير formatMoney في iOS (يسقط .0 للأعداد الصحيحة).
private fun tpMoney(value: Double, currency: String?): String {
    val symbol = when (currency?.uppercase()) {
        "EUR" -> "€"; "GBP" -> "£"; "USD" -> "$"; "SAR" -> "ر.س"
        else -> currency?.takeIf { it.isNotBlank() } ?: "€"
    }
    return when {
        value >= 1_000_000 -> {
            val m = value / 1_000_000.0
            val num = if (m % 1.0 == 0.0) "${m.toInt()}" else String.format(Locale.US, "%.1f", m)
            "$num مليون $symbol"
        }
        value >= 1_000 -> "${(value / 1_000).toInt()} ألف $symbol"
        else -> "${value.toInt()} $symbol"
    }
}

private fun tpBirthParts(d: TpPlayerData): List<String> {
    val dateLabel = d.birthDate?.let { raw ->
        runCatching { LocalDate.parse(raw.take(10)) }.getOrNull()
            ?.let { VaraFormat.mediumDate(it.atStartOfDay(VaraFormat.riyadh).toInstant()) } ?: raw
    }
    return listOfNotNull(dateLabel, d.birthPlace).filter { it.isNotBlank() }
}

private fun tpPositionRank(en: String): Int = when (en.uppercase()) {
    "GOALKEEPER", "GK" -> 0
    "DEFENDER", "DF" -> 1
    "MIDFIELDER", "MF" -> 2
    "ATTACKER", "FORWARD", "FW" -> 3
    else -> 9
}

private fun tpPositionAr(en: String): String = when (en.uppercase()) {
    "GOALKEEPER", "GK" -> "حراسة المرمى"
    "DEFENDER", "DF" -> "الدفاع"
    "MIDFIELDER", "MF" -> "الوسط"
    "ATTACKER", "FORWARD", "FW" -> "الهجوم"
    else -> en
}

private fun tpResultLabel(result: String): String = when (result.uppercase()) {
    "W" -> "ف"; "L" -> "خ"; else -> "ت"
}

private fun tpResultColor(result: String, c: VaraColors): Color = when (result.uppercase()) {
    "W" -> c.accent; "L" -> c.live; else -> c.textFaint
}

/// شارة التقييم: ≥7 ذهبي، 6-7 محايد، أقل من 6 قرمزي.
private fun tpRatingColor(r: Double, c: VaraColors): Color = when {
    r >= 7 -> c.gold
    r >= 6 -> c.textDim
    else -> c.live
}

private fun tpShare(context: android.content.Context, url: String) {
    val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
        type = "text/plain"; putExtra(android.content.Intent.EXTRA_TEXT, url)
    }
    context.startActivity(android.content.Intent.createChooser(intent, "مشاركة"))
}

@Composable
private fun TpShareButton(context: android.content.Context, url: String) {
    val c = LocalVaraColors.current
    IconButton({ tpShare(context, url) }) { Icon(Icons.Default.Share, "مشاركة", tint = c.accent) }
}

// MARK: - لبنات واجهة مشتركة (Tp)

/// بلاطة حقيقة: قيمة كبيرة فوق وصف صغير — نظير SpFactTile.
@Composable
private fun TpFactTile(value: String, label: String, modifier: Modifier = Modifier, accent: Color? = null) {
    val c = LocalVaraColors.current
    Column(
        modifier
            .clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .7f), VaraTileShape)
            .padding(vertical = 10.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        ForceLtr { Text(value, color = accent ?: c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1) }
        Text(label, color = c.textDim, fontSize = 10.sp, maxLines = 1)
    }
}

/// صورة دائرية (لاعب/مدرب) ببديل أيقوني — نظير photoCircle، الحلقة accent.
@Composable
private fun TpPhotoCircle(url: String, size: Int, ring: Boolean = false) {
    val c = LocalVaraColors.current
    Box(
        Modifier.size(size.dp).clip(CircleShape).background(c.chip)
            .border(if (ring) 3.dp else 1.dp, if (ring) c.accent else c.outline, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (url.isBlank()) Icon(Icons.Default.Person, null, tint = c.textFaint, modifier = Modifier.size((size * 0.42).dp))
        else AsyncImage(model = url, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
    }
}

/// صف بخلفية ناعمة — نظير softTile في iOS.
@Composable
private fun TpTile(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable RowScope.() -> Unit) {
    val c = LocalVaraColors.current
    Row(
        modifier
            .fillMaxWidth().clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .7f), VaraTileShape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}

/// قسم بعنوان صغير ملوّن بأيقونة — نظير ترويسات الأقسام في iOS.
@Composable
private fun TpSection(
    icon: ImageVector,
    title: String,
    tint: Color = LocalVaraColors.current.accent,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(15.dp))
            Text(title, color = tint, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            if (trailing != null) { Spacer(Modifier.weight(1f)); trailing() }
        }
        content()
    }
}

/// شبكة بلاطات بصفوف متساوية — نظير LazyVGrid adaptive في iOS.
@Composable
private fun TpTileGrid(tiles: List<Pair<String, String>>, perRow: Int = 3) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        tiles.chunked(perRow).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (value, label) -> TpFactTile(value, label, Modifier.weight(1f)) }
                repeat(perRow - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun TpChip(text: String, fill: Color, fg: Color) {
    Text(
        text, color = fg, fontSize = 11.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.clip(CircleShape).background(fill).padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable
private fun TpRatingBadge(r: Double, small: Boolean = false) {
    val c = LocalVaraColors.current
    ForceLtr {
        Text(
            String.format(Locale.US, "%.1f", r),
            color = Color.White, fontSize = if (small) 11.sp else 13.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier
                .clip(RoundedCornerShape(if (small) 7.dp else 8.dp))
                .background(tpRatingColor(r, c))
                .padding(horizontal = if (small) 6.dp else 7.dp, vertical = if (small) 2.dp else 3.dp),
        )
    }
}

// MARK: - أقسام صفحة النادي

/// الترويسة البطلة بتدرج accent: الشعار + الاسم + المركز/النقاط + البطولة + المدرّب.
@Composable
private fun TpTeamHero(d: TpTeamData) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth()
            .background(Brush.verticalGradient(listOf(c.accent, c.accentDeep)))
            .padding(horizontal = 18.dp, vertical = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RemoteLogo(d.logo, d.name, 72)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(d.name, color = Color.White, fontSize = 23.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (d.rank != null || d.points != null) {
                val parts = listOfNotNull(
                    d.rank?.let { "المركز ${latinNumber(it)}" },
                    d.points?.let { "${latinNumber(it)} نقطة" },
                )
                Text(parts.joinToString(" · "), color = Color.White.copy(.85f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
            if (d.competitionName.isNotBlank()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Default.EmojiEvents, null, tint = Color.White.copy(.8f), modifier = Modifier.size(12.dp))
                    Text(d.competitionName, color = Color.White.copy(.8f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            d.coach?.let { Text("المدرّب: ${it.name}", color = Color.White.copy(.75f), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
    }
}

/// شريط المتابعة: حبة المفضّل + حبة التنبيهات (للمسجل فقط) — نظير followBar.
@Composable
private fun TpFollowBar(isFav: Boolean, isFollowing: Boolean, loggedIn: Boolean, onFavorite: () -> Unit, onFollow: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        TpPill(
            active = isFav,
            icon = if (isFav) Icons.Default.Star else Icons.Default.StarBorder,
            label = if (isFav) "المفضّل" else "اجعله المفضّل",
            onClick = onFavorite,
        )
        if (loggedIn) TpPill(
            active = isFollowing,
            icon = if (isFollowing) Icons.Default.NotificationsActive else Icons.Default.NotificationsNone,
            label = if (isFollowing) "تتابع التنبيهات" else "تابع التنبيهات",
            onClick = onFollow,
        )
    }
}

@Composable
private fun TpPill(active: Boolean, icon: ImageVector, label: String, onClick: () -> Unit) {
    val c = LocalVaraColors.current
    Row(
        Modifier.clip(CircleShape)
            .background(if (active) c.accent else Color.Transparent)
            .border(1.dp, if (active) Color.Transparent else c.accent.copy(.5f), CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(icon, null, tint = if (active) Color.White else c.accent, modifier = Modifier.size(14.dp))
        Text(label, color = if (active) Color.White else c.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

/// بلاطات الحقائق: المركز (accent) · النقاط · التأسيس · حجم القائمة.
@Composable
private fun TpTeamFacts(d: TpTeamData) {
    val c = LocalVaraColors.current
    val facts = buildList {
        d.rank?.let { add(Triple("#${latinNumber(it)}", "المركز", true)) }
        d.points?.let { add(Triple(latinNumber(it), "نقطة", false)) }
        d.founded?.let { add(Triple(latinNumber(it), "التأسيس", false)) }
        if (d.squad.isNotEmpty()) add(Triple(latinNumber(d.squad.size), "حجم القائمة", false))
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        facts.forEach { (value, label, accented) ->
            TpFactTile(value, label, Modifier.weight(1f), if (accented) c.accent else null)
        }
    }
}

@Composable
private fun TpCoachCard(coach: TpCoach) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            .clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .7f), VaraTileShape)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        TpPhotoCircle(coach.photo, 52)
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("المدرّب", color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Text(coach.name, color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val sub = listOfNotNull(
                coach.nationality.takeIf { it.isNotBlank() },
                coach.age?.let { "${latinNumber(it)} سنة" },
            ).joinToString(" · ")
            if (sub.isNotBlank()) Text(sub, color = c.textDim, fontSize = 11.sp)
        }
    }
}

@Composable
private fun TpVenueCard(venue: TpVenue) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            .clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .7f), VaraTileShape)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(c.chip),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Default.Stadium, null, tint = c.accent, modifier = Modifier.size(22.dp)) }
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("الملعب", color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Text(venue.name, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (venue.city.isNotBlank()) Text(venue.city, color = c.textDim, fontSize = 11.sp, maxLines = 1)
                venue.capacity?.let { cap ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                        Icon(Icons.Default.Groups, null, tint = c.textDim, modifier = Modifier.size(11.dp))
                        ForceLtr { Text(String.format(Locale.US, "%,d", cap), color = c.textDim, fontSize = 11.sp) }
                    }
                }
            }
        }
    }
}

/// الإصابات والغيابات — تظهر فقط عند وجود بيانات (تتطلب ?comp في الجلب).
@Composable
private fun TpInjuriesSection(injuries: List<TpInjury>) {
    val c = LocalVaraColors.current
    TpSection(Icons.Default.Healing, "الإصابات والغيابات", tint = c.live) {
        injuries.forEach { inj ->
            TpTile {
                Box(Modifier.size(7.dp).clip(CircleShape).background(c.live.copy(.8f)))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(inj.player, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (!inj.reason.isNullOrBlank()) Text(inj.reason, color = c.textDim, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (!inj.until.isNullOrBlank()) Text("العودة: ${inj.until}", color = c.textDim, fontSize = 10.sp)
            }
        }
    }
}

/// أرقام الفريق في الموسم — شبكة بلاطات من stats المتداخل.
@Composable
private fun TpTeamStatsGrid(st: TpTeamStats) {
    val tiles = buildList {
        add(latinNumber(st.played) to "مباريات")
        add(latinNumber(st.wins) to "فوز")
        add(latinNumber(st.draws) to "تعادل")
        add(latinNumber(st.loses) to "خسارة")
        add(latinNumber(st.goalsFor) to "أهداف له")
        add(latinNumber(st.goalsAgainst) to "أهداف عليه")
        add(latinNumber(st.cleanSheets) to "شِباك نظيفة")
        add("${st.yellow}/${st.red}" to "بطاقات")
        st.formation?.takeIf { it.isNotBlank() }?.let { add(it to "التشكيل الأكثر") }
        st.streakWin?.takeIf { it > 0 }?.let { add(latinNumber(it) to "أطول سلسلة فوز") }
    }
    TpSection(Icons.Default.BarChart, "أرقام الفريق في الموسم") { TpTileGrid(tiles) }
}

/// آخر الانتقالات: مجموعتا «واصلون»/«مغادرون» (8 لكل مجموعة).
@Composable
private fun TpTransfersSection(arrivals: List<TpTransferItem>, departures: List<TpTransferItem>) {
    TpSection(Icons.Default.SwapHoriz, "آخر الانتقالات") {
        if (arrivals.isNotEmpty()) TpTransferGroup("واصلون", arrivals, toClub = true)
        if (departures.isNotEmpty()) TpTransferGroup("مغادرون", departures, toClub = false)
    }
}

@Composable
private fun TpTransferGroup(title: String, items: List<TpTransferItem>, toClub: Boolean) {
    val c = LocalVaraColors.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, color = c.textDim, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        items.take(8).forEach { tr ->
            TpTile {
                RemoteLogo(tr.teamLogo, tr.team, 26)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(tr.player, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text((if (toClub) "من " else "إلى ") + tr.team, color = c.textDim, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (tr.type.isNotBlank()) Text(tr.type, color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
    }
}

/// مجموعة مباريات بعنوان + عدّاد + خط فاصل — نظير matchGroup.
private fun LazyListScope.tpMatchGroup(label: String, list: List<Fixture>, nav: NavHostController) {
    if (list.isEmpty()) return
    item("mg-$label") { TpMatchGroupHeader(label, list.size) }
    items(list, key = { "fx-${it.id}" }) { fx ->
        FixtureCard(fx, { nav.navigate("match/${fx.id}") }, Modifier.padding(horizontal = 16.dp))
    }
}

@Composable
private fun TpMatchGroupHeader(label: String, count: Int) {
    val c = LocalVaraColors.current
    Column(Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(c.accent))
            Text(label, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Text("(${latinNumber(count)})", color = c.textDim, fontSize = 12.sp)
        }
        Spacer(Modifier.height(8.dp))
        VaraDivider()
    }
}

/// هدّافو الفريق — ترتيب + صورة + مباريات/صناعة + أهداف؛ النقر يفتح اللاعب.
@Composable
private fun TpScorersSection(scorers: List<TpScorer>, openPlayer: (Int) -> Unit) {
    val c = LocalVaraColors.current
    TpSection(Icons.Default.SportsSoccer, "هدّافو الفريق") {
        scorers.forEach { s ->
            TpTile(onClick = { if (s.id > 0) openPlayer(s.id) }) {
                Text(
                    latinNumber(s.rank),
                    color = if (s.rank <= 3) c.accent else c.textFaint,
                    fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(20.dp),
                )
                TpPhotoCircle(s.photo, 36)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(s.name, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${latinNumber(s.matches)} مباراة · ${latinNumber(s.assists)} صناعة", color = c.textDim, fontSize = 11.sp)
                }
                ForceLtr {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Default.SportsSoccer, null, tint = c.accent, modifier = Modifier.size(12.dp))
                        Text(latinNumber(s.goals), color = c.text, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun TpSquadRow(pl: TpSquadPlayer, open: () -> Unit) {
    val c = LocalVaraColors.current
    TpTile(onClick = open) {
        Box(contentAlignment = Alignment.TopEnd) {
            TpPhotoCircle(pl.photo, 36)
            if (pl.captain == true) {
                Box(
                    modifier = Modifier.offset(x = 2.dp, y = (-2).dp).size(14.dp).clip(CircleShape).background(Color(0xFFF2C94C)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("C", color = Color.Black, fontSize = 8.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                pl.nationality?.flag?.let { flagUrl ->
                    AsyncImage(
                        model = flagUrl, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.size(width = 14.dp, height = 10.dp).clip(RoundedCornerShape(1.5.dp)),
                    )
                }
                Text(pl.name, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (!pl.detailedPosition.isNullOrEmpty() && pl.detailedPosition != pl.position) {
                    Text(pl.detailedPosition, color = c.textDim, fontSize = 10.sp)
                }
                pl.age?.let { Text("${latinNumber(it)} سنة", color = c.textDim, fontSize = 10.sp) }
            }
        }
        ForceLtr { Text(pl.number?.let(::latinNumber) ?: "—", color = c.textDim, fontSize = 15.sp, fontWeight = FontWeight.Bold) }
        Icon(Icons.Default.ChevronLeft, null, tint = c.textFaint.copy(.6f), modifier = Modifier.size(14.dp))
    }
}

// MARK: - أقسام صفحة اللاعب

/// ترويسة الهوية المسطّحة: صورة بحلقة accent + الاسم + الاسم الكامل + الشرائح.
@Composable
private fun TpPlayerIdentity(d: TpPlayerData) {
    val c = LocalVaraColors.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        TpPhotoCircle(d.photo, 76, ring = true)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(d.name, color = c.text, fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (!d.fullName.isNullOrBlank() && d.fullName != d.name) {
                Text(d.fullName, color = c.textDim, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (d.position.isNotBlank()) TpChip(d.position, c.accent.copy(.12f), c.accent)
                d.number?.let { n ->
                    ForceLtr {
                        Row(
                            Modifier.clip(CircleShape).background(c.chip).padding(horizontal = 8.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(3.dp),
                        ) {
                            Icon(Icons.Default.Checkroom, null, tint = c.text, modifier = Modifier.size(10.dp))
                            Text(latinNumber(n), color = c.text, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                if (!d.nationality.isNullOrBlank()) TpChip(d.nationality, c.chip, c.textDim)
            }
        }
    }
}

/// بلاطات الحقائق: العمر/الطول/الوزن.
@Composable
private fun TpPlayerFacts(d: TpPlayerData) {
    val facts = buildList {
        d.age?.let { add("${latinNumber(it)} سنة" to "العمر") }
        d.height?.let { add("${latinNumber(it)} سم" to "الطول") }
        d.weight?.let { add("${latinNumber(it)} كجم" to "الوزن") }
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        facts.forEach { (value, label) -> TpFactTile(value, label, Modifier.weight(1f)) }
    }
}

/// القيمة السوقية — تُعرض فقط عند available && value>0؛ «الذروة» عند اختلافها.
@Composable
private fun TpMarketSection(m: TpMarket) {
    val c = LocalVaraColors.current
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            .clip(VaraTileShape).background(c.surface)
            .border(1.dp, c.outline.copy(alpha = if (c.dark) 0f else .7f), VaraTileShape)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.AutoMirrored.Filled.TrendingUp, null, tint = c.accent, modifier = Modifier.size(14.dp))
            Text("القيمة السوقية", color = c.accent, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            ForceLtr { Text(tpMoney(m.value ?: 0.0, m.currency), color = c.text, fontSize = 15.sp, fontWeight = FontWeight.Bold) }
        }
        m.peak?.takeIf { it > 0 && it != m.value }?.let { peak ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("الذروة", color = c.textDim, fontSize = 11.sp)
                Spacer(Modifier.weight(1f))
                ForceLtr { Text(tpMoney(peak, m.currency), color = c.textDim, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
            }
        }
    }
}

/// أرقام الموسم: بطاقة لكل بطولة (شعار + اسم + شارة تقييم + شبكة).
@Composable
private fun TpSeasonStatsSection(stats: List<TpSeasonStat>) {
    val c = LocalVaraColors.current
    TpSection(Icons.Default.BarChart, "أرقام الموسم") {
        stats.forEach { s ->
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RemoteLogo(s.teamLogo, s.competition, 22)
                    Text(s.competition, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    s.rating?.let { TpRatingBadge(it) }
                }
                val tiles = buildList {
                    add(latinNumber(s.matches) to "مباريات")
                    add(latinNumber(s.minutes) to "دقائق")
                    add(latinNumber(s.lineups) to "أساسي")
                    add(latinNumber(s.goals) to "أهداف")
                    add(latinNumber(s.assists) to "صناعة")
                    if (s.saves > 0 || s.conceded > 0) {
                        add(latinNumber(s.saves) to "تصديات")
                        add(latinNumber(s.conceded) to "استقبلها")
                    }
                    if (s.yellow > 0 || s.red > 0) add("${s.yellow}/${s.red}" to "بطاقات")
                }
                TpTileGrid(tiles)
            }
        }
    }
}

/// الفورمة الأخيرة: شريط ف/ت/خ (الأحدث يمينًا داخل ForceLtr) + أعمدة xG + صفوف.
@Composable
private fun TpFormSection(matches: List<TpFormMatch>) {
    val c = LocalVaraColors.current
    val hasXg = matches.any { (it.xg ?: 0.0) > 0.0 }
    TpSection(
        Icons.AutoMirrored.Filled.TrendingUp,
        if (hasXg) "الفورمة الأخيرة · xG" else "الفورمة الأخيرة",
        trailing = {
            Text(
                "آخر ${latinNumber(matches.size)}",
                color = c.textDim, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clip(CircleShape).background(c.chip).padding(horizontal = 7.dp, vertical = 2.dp),
            )
        },
    ) {
        TpResultsStrip(matches)
        if (hasXg) TpXgChart(matches)
        matches.take(10).forEach { TpFormRow(it) }
    }
}

/// شريط النتائج — الترتيب معكوس داخل ForceLtr كي يكون الأحدث يمينًا.
@Composable
private fun TpResultsStrip(matches: List<TpFormMatch>) {
    val c = LocalVaraColors.current
    ForceLtr {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            matches.take(12).reversed().forEach { m ->
                Box(
                    Modifier.size(24.dp).clip(CircleShape).background(tpResultColor(m.result, c)),
                    contentAlignment = Alignment.Center,
                ) { Text(tpResultLabel(m.result), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
            }
        }
    }
}

/// رسم أعمدة xG بسيط بـCanvas — الأحدث يمينًا (رسم LTR على قائمة معكوسة).
@Composable
private fun TpXgChart(matches: List<TpFormMatch>) {
    val c = LocalVaraColors.current
    val bars = matches.take(10).reversed()
    val maxXg = (bars.maxOfOrNull { it.xg ?: 0.0 } ?: 0.0).coerceAtLeast(0.1)
    val accent = c.accent
    val track = c.chip
    Canvas(Modifier.fillMaxWidth().height(96.dp)) {
        val n = bars.size
        if (n == 0) return@Canvas
        val gap = 6.dp.toPx()
        val barWidth = (size.width - gap * (n - 1)) / n
        val radius = CornerRadius(3.dp.toPx(), 3.dp.toPx())
        bars.forEachIndexed { index, m ->
            val x = index * (barWidth + gap)
            // مسار خلفي خافت لكل عمود ليُقرأ الرسم حتى مع قيم صغيرة.
            drawRoundRect(color = track, topLeft = Offset(x, 0f), size = Size(barWidth, size.height), cornerRadius = radius)
            val h = (((m.xg ?: 0.0) / maxXg) * size.height).toFloat()
            if (h > 0f) drawRoundRect(color = accent, topLeft = Offset(x, size.height - h), size = Size(barWidth, h), cornerRadius = radius)
        }
    }
}

@Composable
private fun TpFormRow(m: TpFormMatch) {
    val c = LocalVaraColors.current
    TpTile {
        Box(
            Modifier.size(22.dp).clip(CircleShape).background(tpResultColor(m.result, c)),
            contentAlignment = Alignment.Center,
        ) { Text(tpResultLabel(m.result), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
        if (!m.opponentLogo.isNullOrBlank()) RemoteLogo(m.opponentLogo, m.opponent, 24)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(m.opponent.ifBlank { "—" }, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(if (m.homeAway == "home") "أرضه" else "خارج أرضه", color = c.textDim, fontSize = 10.sp)
                if (!m.league.isNullOrBlank()) Text("· ${m.league}", color = c.textDim, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            m.xg?.takeIf { it > 0 }?.let { x ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text("xG", color = c.textFaint, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                    ForceLtr { Text(String.format(Locale.US, "%.1f", x), color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                }
            }
            m.goals?.takeIf { it > 0 }?.let { g ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    Icon(Icons.Default.SportsSoccer, null, tint = c.accent, modifier = Modifier.size(10.dp))
                    Text(latinNumber(g), color = c.text, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
            if (m.scoreFor != null && m.scoreAgainst != null) {
                ForceLtr { Text("${m.scoreFor}-${m.scoreAgainst}", color = c.text, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
            }
            m.rating?.takeIf { it > 0 }?.let { TpRatingBadge(it, small = true) }
        }
    }
}

/// سجل المواسم من ?with=extras — موسم بموسم.
@Composable
private fun TpHistorySection(history: List<TpHistoryRow>) {
    val c = LocalVaraColors.current
    TpSection(Icons.Default.CalendarMonth, "سجل المواسم") {
        history.take(12).forEach { h ->
            TpTile {
                ForceLtr {
                    Text(latinNumber(h.season), color = c.accent, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(42.dp))
                }
                Text(h.competition, color = c.text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                TpHistoryStat(latinNumber(h.matches), "مباراة")
                TpHistoryStat(latinNumber(h.goals), "هدف")
                TpHistoryStat(latinNumber(h.assists), "صناعة")
            }
        }
    }
}

@Composable
private fun TpHistoryStat(value: String, label: String) {
    val c = LocalVaraColors.current
    Column(Modifier.width(42.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(1.dp)) {
        ForceLtr { Text(value, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold) }
        Text(label, color = c.textFaint, fontSize = 9.sp)
    }
}

/// المسيرة: شعار + النادي + مدى المواسم.
@Composable
private fun TpCareerSection(career: List<TpCareerStop>) {
    val c = LocalVaraColors.current
    TpSection(Icons.Default.History, "المسيرة") {
        career.forEach { stop ->
            TpTile {
                RemoteLogo(stop.logo, stop.team, 30)
                Text(stop.team, color = c.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                val mn = stop.seasons.minOrNull()
                val mx = stop.seasons.maxOrNull()
                if (mn != null && mx != null) {
                    ForceLtr {
                        Text(if (mn == mx) "$mn" else "$mn–$mx", color = c.textDim, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

/// الألقاب: عداد البطولات + أيقونة ذهبية للفائز + المركز + الموسم.
@Composable
private fun TpTrophiesSection(trophies: List<TpTrophy>) {
    val c = LocalVaraColors.current
    val titles = trophies.count { it.winner }
    TpSection(
        Icons.Default.EmojiEvents,
        "الألقاب",
        trailing = if (titles > 0) {
            {
                Text(
                    "${latinNumber(titles)} بطولة",
                    color = c.textDim, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clip(CircleShape).background(c.chip).padding(horizontal = 7.dp, vertical = 2.dp),
                )
            }
        } else null,
    ) {
        trophies.take(24).forEach { t ->
            TpTile {
                Icon(
                    Icons.Default.EmojiEvents, null,
                    tint = if (t.winner) c.gold else c.textFaint.copy(.5f),
                    modifier = Modifier.size(16.dp),
                )
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(t.competition, color = c.text, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (t.country.isNotBlank()) Text(t.country, color = c.textDim, fontSize = 10.sp)
                }
                if (t.place.isNotBlank()) TpChip(t.place, if (t.winner) c.accent else c.chip, if (t.winner) Color.White else c.textDim)
                if (t.season.isNotBlank()) ForceLtr { Text(t.season, color = c.textDim, fontSize = 11.sp, fontWeight = FontWeight.SemiBold) }
            }
        }
    }
}
