package com.sabq.smart.feature.roshn

import java.util.Locale
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

// مرآة لـiOS `Services/RoshnModels.swift`: ما ترسله /api/rsl/hero (تركيبة
// البانر بحالات الموسم) ونقاط /api/sports/pro-league/* العامة
// (مباريات/ترتيب/هدّافون) ونقاط /api/sports/match/:id (مركز المباراة)
// و/api/sports/team/:id?with=stats (صفحة النادي). أسماء الأنواع Rs* مطابقة.

@Serializable data class RsTeam(val id: Int = 0, val name: String = "", val logo: String = "", val winner: Boolean? = null)
@Serializable data class RsStatus(val code: String = "", val label: String = "", val elapsed: Int? = null, val extra: Int? = null, val live: Boolean = false, val finished: Boolean = false)
@Serializable data class RsScore(val home: Int? = null, val away: Int? = null)
@Serializable data class RsVenue(val name: String = "", val city: String = "")
@Serializable data class RsFixture(
    val id: Int = 0, val date: String = "", val timestamp: Int = 0,
    val status: RsStatus = RsStatus(), val round: String = "", val venue: RsVenue = RsVenue(),
    val home: RsTeam = RsTeam(), val away: RsTeam = RsTeam(),
    val goals: RsScore = RsScore(), val penalties: RsScore? = null,
) {
    val started: Boolean get() = status.live || status.finished
}

// ── حالة الموسم (hero → outlook) ──

@Serializable data class RsChampion(val id: Int = 0, val name: String = "", val logo: String = "")
@Serializable data class RsOutlook(
    /** in-season · pre-season · off-season · unknown */
    val phase: String = "unknown", val season: Int = 0, val status: String = "",
    val start: String? = null, val end: String? = null, val champion: RsChampion? = null,
    val nextSeason: Int? = null, val nextSeasonStart: String? = null,
    /** بالمللي ثانية (خلاف بقية الأختام) — انظر [firstKickoffTs]. */
    val firstKickoff: Long? = null, val daysUntilKickoff: Int? = null,
    val openers: List<RsFixture> = emptyList(),
) {
    /** ختم أول انطلاقة بالثواني — للعدّادات. */
    val firstKickoffTs: Int? get() = firstKickoff?.let { (it / 1000L).toInt() }
}

@Serializable data class RsMatchday(
    val count: Int = 0, val round: String? = null, val date: String = "",
    val nextKickoffTs: Int? = null, val sameKickoff: Boolean = false,
    val liveCount: Int = 0, val finishedCount: Int = 0,
)

@Serializable data class RsTopScorerLegacy(val id: Int = 0, val name: String = "", val photo: String = "", val team: RsTeam = RsTeam(), val goals: Int = 0)
@Serializable data class RsLastSeason(val previousSeason: Int? = null, val champion: RsChampion? = null, val topScorer: RsTopScorerLegacy? = null)

/** استجابة /api/rsl/hero — تركيبة البانر والمركز بحالات الموسم الأربع. */
@Serializable data class RsHero(
    val outlook: RsOutlook = RsOutlook(),
    val live: List<RsFixture> = emptyList(), val today: List<RsFixture> = emptyList(),
    val nextMatch: RsFixture? = null, val matchday: RsMatchday? = null,
    val lastSeason: RsLastSeason? = null,
    /** يخفي بلوك الواجهة فقط — يُضبط من لوحة التحكم (نفس مفتاح الويب حرفيًا). */
    val blockHidden: Boolean = false,
    val predictionsEnabled: Boolean = false, val updatedAt: String = "",
) {
    val inSeason: Boolean get() = outlook.phase == "in-season"
    val preSeason: Boolean get() = outlook.phase == "pre-season"
}

// ── الترتيب والسباقات (/api/sports/pro-league/*) ──

@Serializable data class RsStandingRow(
    val rank: Int = 0, val team: RsTeam = RsTeam(), val played: Int = 0,
    val win: Int = 0, val draw: Int = 0, val lose: Int = 0,
    val goalsFor: Int = 0, val goalsAgainst: Int = 0, val goalsDiff: Int = 0, val points: Int = 0,
    /** سلسلة WDL بالإنجليزية من المزوّد (الأحدث أولًا). */
    val form: String? = null, val trend: String? = null, val live: Boolean? = null,
)

@Serializable data class RsScorer(
    val rank: Int = 0, @SerialName("id") val playerId: Int? = null,
    val name: String = "", val photo: String = "", val team: RsTeam = RsTeam(),
    val goals: Int = 0, val assists: Int = 0, val penalties: Int = 0, val matches: Int = 0,
)

/**
 * صفّ لوحة (صناعة/بطاقات). عقد البطاقات التاريخي يعيد `team` كنص +
 * `teamLogo` منفصلًا، بينما الصناعة تعيده ككائن — [teamRef] يطبّع الشكلين
 * لواجهة واحدة (مطابق iOS `RsLeader.init(from:)`، موثّق في
 * docs/systems/sports-tournaments/SYSTEM.md «عقد البطاقات القديم»).
 */
@Serializable data class RsLeader(
    val rank: Int = 0, @SerialName("id") val playerId: Int? = null,
    val name: String = "", val photo: String = "",
    val team: JsonElement? = null, val teamLogo: String = "",
    val goals: Int? = null, val assists: Int? = null,
    val yellow: Int? = null, val red: Int? = null,
) {
    val teamRef: RsTeam
        get() = when (val t = team) {
            is JsonObject -> RsTeam(
                id = (t["id"] as? JsonPrimitive)?.intOrNull ?: 0,
                name = (t["name"] as? JsonPrimitive)?.contentOrNull ?: "",
                logo = (t["logo"] as? JsonPrimitive)?.contentOrNull ?: "",
            )
            is JsonPrimitive -> RsTeam(id = 0, name = t.contentOrNull ?: "", logo = teamLogo)
            else -> RsTeam(id = 0, name = "", logo = teamLogo)
        }
}

@Serializable data class RsCards(val yellow: List<RsLeader> = emptyList(), val red: List<RsLeader> = emptyList())

/** دلاء /api/sports/pro-league/matches الجاهزة — نفس تقسيم الويب وiOS. */
@Serializable data class RsMatchBuckets(
    val live: List<RsFixture> = emptyList(), val today: List<RsFixture> = emptyList(),
    val upcoming: List<RsFixture> = emptyList(), val results: List<RsFixture> = emptyList(),
)

// ── متصفّح الجولات (/rounds + /round?name=<key>) ──
// المفتاح التقني إنجليزي ("Regular Season - 1") وlabel عربي للعرض؛
// مباريات الجولة تُطلب بالمفتاح لا بالتسمية.

@Serializable data class RsRound(val key: String = "", val label: String = "")
@Serializable data class RsRoundsResponse(val configured: Boolean? = null, val rounds: List<RsRound> = emptyList(), val current: String? = null)
@Serializable data class RsRoundFixturesResponse(val configured: Boolean? = null, val fixtures: List<RsFixture> = emptyList())

// ── مركز المباراة (/api/sports/match/:id — نفس شكل كأس الملك) ──

@Serializable data class RsMatchEvent(
    val minute: Int? = null, val extra: Int? = null, val teamId: Int = 0,
    val team: String = "", val player: String = "", val assist: String? = null,
    val type: String = "", val label: String = "",
) {
    val minuteLabel: String get() = "${minute ?: 0}${extra?.takeIf { it > 0 }?.let { "+$it" } ?: ""}'"
}

/** صفّ إحصائي — home/away قد تصل نصًّا أو رقمًا أو null، فنطبّعها لنصّ عرض. */
@Serializable data class RsStatRow(
    val type: String = "", val label: String = "",
    val home: JsonElement? = null, val away: JsonElement? = null,
) {
    val homeText: String get() = statText(home)
    val awayText: String get() = statText(away)
}

private fun statText(e: JsonElement?): String = when {
    e == null || e is JsonNull -> "-"
    e is JsonPrimitive && e.isString -> e.content
    e is JsonPrimitive -> {
        val d = e.doubleOrNull
        when {
            d == null -> "-"
            d == Math.floor(d) -> d.toInt().toString()
            else -> String.format(Locale.US, "%.1f", d)
        }
    }
    else -> "-"
}

@Serializable data class RsStatSide(val id: Int = 0, val name: String = "")
@Serializable data class RsStatistics(val home: RsStatSide = RsStatSide(), val away: RsStatSide = RsStatSide(), val rows: List<RsStatRow> = emptyList())

@Serializable data class RsLineupPlayer(val id: Int = 0, val number: Int? = null, val name: String = "", val pos: String = "", val grid: String? = null)
@Serializable data class RsLineupTeam(val id: Int = 0, val name: String = "", val logo: String = "")
@Serializable data class RsLineup(
    val team: RsLineupTeam = RsLineupTeam(), val formation: String? = null, val coach: String? = null,
    val startXI: List<RsLineupPlayer> = emptyList(), val substitutes: List<RsLineupPlayer> = emptyList(),
)

@Serializable data class RsMatchDetail(
    val fixture: RsFixture = RsFixture(), val events: List<RsMatchEvent> = emptyList(),
    val statistics: RsStatistics? = null, val lineups: List<RsLineup> = emptyList(),
    val leagueId: Int? = null,
)

// ── تقييمات اللاعبين (/api/sports/match/:id/players) ──

@Serializable data class RsRatedPlayer(
    val id: Int = 0, val name: String = "", val photo: String = "", val teamId: Int = 0,
    val team: String = "", val number: Int? = null, val pos: String = "",
    val rating: Double? = null, val minutes: Int = 0, val goals: Int = 0,
    val assists: Int = 0, val yellow: Int = 0, val red: Int = 0, val captain: Boolean = false,
)
@Serializable data class RsMotm(val id: Int = 0, val name: String = "", val team: String = "", val rating: Double = 0.0)
@Serializable data class RsMatchRatings(val motm: RsMotm? = null, val players: List<RsRatedPlayer> = emptyList())

// ── صفحة النادي المتكاملة (/api/sports/team/:id?with=stats) ──

@Serializable data class RsTeamVenue(val name: String = "", val city: String = "", val capacity: Int? = null, val image: String? = null)
@Serializable data class RsTeamInfo(
    val id: Int = 0, val name: String = "", val logo: String = "",
    val country: String? = null, val founded: Int? = null, val venue: RsTeamVenue? = null,
)
@Serializable data class RsSquadPlayer(
    val id: Int = 0, val name: String = "", val number: Int? = null,
    val position: String = "", val positionEn: String = "", val age: Int? = null, val photo: String = "",
)
@Serializable data class RsStatTriple(val total: Int = 0, val home: Int = 0, val away: Int = 0)
@Serializable data class RsTeamStatFixtures(
    val played: RsStatTriple = RsStatTriple(), val wins: RsStatTriple = RsStatTriple(),
    val draws: RsStatTriple = RsStatTriple(), val loses: RsStatTriple = RsStatTriple(),
)
@Serializable data class RsGoalSide(val total: Int = 0, val average: String? = null)
@Serializable data class RsTeamStatGoals(@SerialName("for") val scored: RsGoalSide = RsGoalSide(), val against: RsGoalSide = RsGoalSide())
@Serializable data class RsTeamCards(val yellowTotal: Int = 0, val redTotal: Int = 0)
@Serializable data class RsTeamStatSummary(
    val cleanSheets: RsStatTriple = RsStatTriple(), val failedToScore: RsStatTriple = RsStatTriple(),
    val cards: RsTeamCards = RsTeamCards(), val mostUsedFormation: String? = null,
)
@Serializable data class RsTeamStatBiggest(
    val winsHome: String? = null, val winsAway: String? = null,
    val losesHome: String? = null, val losesAway: String? = null,
    val streakWin: Int? = null, val streakLose: Int? = null, val streakDraw: Int? = null,
)
@Serializable data class RsTeamStats(
    val leagueId: Int? = null, val season: Int? = null,
    val fixtures: RsTeamStatFixtures = RsTeamStatFixtures(),
    val goals: RsTeamStatGoals = RsTeamStatGoals(),
    val summary: RsTeamStatSummary = RsTeamStatSummary(),
    val biggest: RsTeamStatBiggest? = null,
)
@Serializable data class RsCoachCareer(val team: String = "", val start: String? = null, val end: String? = null)
@Serializable data class RsCoach(
    val id: Int = 0, val name: String = "", val photo: String = "", val nationality: String = "",
    val age: Int? = null, val startDate: String? = null, val career: List<RsCoachCareer> = emptyList(),
)
@Serializable data class RsTeamScorer(
    val rank: Int = 0, val id: Int = 0, val name: String = "", val photo: String = "",
    val goals: Int = 0, val assists: Int = 0, val penalties: Int = 0, val matches: Int = 0,
)
@Serializable data class RsTeamProfile(
    val team: RsTeamInfo = RsTeamInfo(), val standing: RsStandingRow? = null,
    val competitionSlug: String? = null, val competitionName: String? = null,
    val fixtures: List<RsFixture> = emptyList(), val squad: List<RsSquadPlayer> = emptyList(),
    val stats: RsTeamStats? = null, val coach: RsCoach? = null,
    val topScorers: List<RsTeamScorer> = emptyList(),
)

// ── أغلفة الاستجابات ──

@Serializable data class RsStandingsResponse(val standings: List<RsStandingRow> = emptyList())
@Serializable data class RsScorersResponse(val scorers: List<RsScorer> = emptyList())
@Serializable data class RsAssistsResponse(val assists: List<RsLeader> = emptyList())
