package com.sabq.smart.feature.kingscup

import java.util.Locale
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

// مرآة iOS `Services/KingsCupModels.swift`: نقاط /api/kings-cup/* العامة
// (بطولة إقصائية — لا مجموعات ولا ترتيب). كل الحقول بقيم افتراضية —
// عرف التطبيق لتحمّل المفاتيح الغائبة.

@Serializable data class KcTeam(val id: Int = 0, val name: String = "", val logo: String = "", val winner: Boolean? = null)
@Serializable data class KcStatus(val code: String = "", val label: String = "", val elapsed: Int? = null, val extra: Int? = null, val live: Boolean = false, val finished: Boolean = false)
@Serializable data class KcScore(val home: Int? = null, val away: Int? = null)
@Serializable data class KcVenue(val name: String = "", val city: String = "")

@Serializable data class KcFixture(
    val id: Int = 0, val date: String = "", val timestamp: Int = 0,
    val status: KcStatus = KcStatus(), val round: String = "", val venue: KcVenue = KcVenue(),
    val home: KcTeam = KcTeam(), val away: KcTeam = KcTeam(),
    val goals: KcScore = KcScore(), val penalties: KcScore? = null,
) {
    val started: Boolean get() = status.live || status.finished

    /** نتيجة الترجيح «الفائز أولًا» دائمًا كي لا تنقلب بصريًّا في RTL. */
    val penaltyOutcome: KcPenaltyOutcome?
        get() {
            val p = penalties ?: return null
            val h = p.home ?: return null
            val a = p.away ?: return null
            if (h == a) return null
            val homeWon = h > a
            return KcPenaltyOutcome(
                winnerName = if (homeWon) home.name else away.name,
                winnerScore = if (homeWon) h else a,
                loserScore = if (homeWon) a else h,
            )
        }
}

data class KcPenaltyOutcome(val winnerName: String, val winnerScore: Int, val loserScore: Int)

/** البطل بعد حسم النهائي — النتائج بترتيب «الفائز أولًا» من الخادم. */
@Serializable data class KcChampion(
    val team: KcTeam = KcTeam(), val runnerUp: KcTeam? = null,
    val score: String? = null, val penalties: String? = null,
    val decidedAt: String? = null, val source: String = "",
)

/** ملخّص «يوم الجولة» — الأدوار المبكرة تُلعب دفعة واحدة. */
@Serializable data class KcMatchday(
    val count: Int = 0, val round: String? = null, val date: String = "",
    val nextKickoffTs: Int? = null, val sameKickoff: Boolean = false,
    val liveCount: Int = 0, val finishedCount: Int = 0,
)

@Serializable data class KcPrediction(
    val homePct: Int = 0, val drawPct: Int = 0, val awayPct: Int = 0,
    val winnerId: Int? = null, val winnerName: String? = null, val advice: String? = null,
)

@Serializable data class KcMatchOfDay(val fixture: KcFixture = KcFixture(), val prediction: KcPrediction? = null)

@Serializable data class KcOverview(
    /** يخفي بلوك الواجهة فقط — يُضبط من لوحة التحكم (نفس مفتاح الويب). */
    val blockHidden: Boolean? = null,
    val live: List<KcFixture> = emptyList(), val today: List<KcFixture> = emptyList(),
    val nextMatch: KcFixture? = null, val matchOfTheDay: KcMatchOfDay? = null,
    val matchday: KcMatchday? = null, val started: Boolean = false,
    val champion: KcChampion? = null, val updatedAt: String = "",
)

// ── السباقات الفردية ──

@Serializable data class KcScorer(
    val rank: Int = 0, @SerialName("id") val playerId: Int? = null,
    val name: String = "", val photo: String = "", val team: KcTeam = KcTeam(),
    val goals: Int = 0, val assists: Int = 0, val penalties: Int = 0, val matches: Int = 0,
)

@Serializable data class KcLeader(
    val rank: Int = 0, @SerialName("id") val playerId: Int? = null,
    val name: String = "", val photo: String = "", val team: KcTeam = KcTeam(),
    val goals: Int? = null, val assists: Int? = null,
    val yellow: Int? = null, val red: Int? = null,
)

@Serializable data class KcCards(val yellow: List<KcLeader> = emptyList(), val red: List<KcLeader> = emptyList())

// ── شجرة الأدوار (/kings-cup/bracket) ──

@Serializable data class KcBracketRound(val round: String = "", val matches: List<KcFixture> = emptyList())
@Serializable data class KcBracket(val rounds: List<KcBracketRound> = emptyList())

// ── تفاصيل المباراة (/kings-cup/match/:id) ──

@Serializable data class KcMatchEvent(
    val minute: Int? = null, val extra: Int? = null, val teamId: Int = 0,
    val team: String = "", val player: String = "", val assist: String? = null,
    val type: String = "", val label: String = "",
) {
    val minuteLabel: String get() = "${minute ?: 0}${extra?.takeIf { it > 0 }?.let { "+$it" } ?: ""}'"
}

/** صفّ إحصائي — home/away قد تصل نصًّا أو رقمًا أو null، فتُطبَّع لنصّ عرض. */
@Serializable data class KcStatRow(
    val type: String = "", val label: String = "",
    val home: JsonElement? = null, val away: JsonElement? = null,
) {
    val homeText: String get() = kcStatText(home)
    val awayText: String get() = kcStatText(away)
}

private fun kcStatText(e: JsonElement?): String = when {
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

@Serializable data class KcStatSide(val id: Int = 0, val name: String = "")
@Serializable data class KcStatistics(val home: KcStatSide = KcStatSide(), val away: KcStatSide = KcStatSide(), val rows: List<KcStatRow> = emptyList())

@Serializable data class KcLineupPlayer(val id: Int = 0, val number: Int? = null, val name: String = "", val pos: String = "", val grid: String? = null)
@Serializable data class KcLineupTeam(val id: Int = 0, val name: String = "", val logo: String = "")
@Serializable data class KcLineup(
    val team: KcLineupTeam = KcLineupTeam(), val formation: String? = null, val coach: String? = null,
    val startXI: List<KcLineupPlayer> = emptyList(), val substitutes: List<KcLineupPlayer> = emptyList(),
)

@Serializable data class KcMatchDetail(
    val fixture: KcFixture = KcFixture(), val events: List<KcMatchEvent> = emptyList(),
    val statistics: KcStatistics? = null, val lineups: List<KcLineup> = emptyList(),
    val leagueId: Int? = null,
)

// ── تقييمات اللاعبين (/kings-cup/match/:id/player-stats) ──

@Serializable data class KcMatchMotm(val id: Int = 0, val name: String = "", val team: String = "", val rating: Double = 0.0)
@Serializable data class KcMatchRating(
    val id: Int = 0, val name: String = "", val photo: String = "", val teamId: Int = 0,
    val team: String = "", val number: Int? = null, val pos: String = "",
    val rating: Double? = null, val minutes: Int = 0, val goals: Int = 0,
    val assists: Int = 0, val yellow: Int = 0, val red: Int = 0, val captain: Boolean = false,
)
@Serializable data class KcMatchRatings(val motm: KcMatchMotm? = null, val players: List<KcMatchRating> = emptyList())

// ── قنوات البث (/kings-cup/match/:id/tv) ──

@Serializable data class KcTvChannel(val name: String = "", val country: String? = null, val url: String? = null, val logo: String? = null)
@Serializable data class KcTvListing(val available: Boolean = false, val channels: List<KcTvChannel> = emptyList())

// ── النسخة السابقة + سجلّ الأبطال ──

@Serializable data class KcHistoryChampion(val id: Int = 0, val name: String = "", val logo: String = "")
@Serializable data class KcHistoryScorer(val id: Int = 0, val name: String = "", val photo: String = "", val team: KcTeam = KcTeam(), val goals: Int = 0)
@Serializable data class KcHistory(
    val previousSeason: Int? = null,
    val champion: KcHistoryChampion? = null,
    val topScorer: KcHistoryScorer? = null,
) {
    val hasContent: Boolean get() = champion != null || topScorer != null
}

@Serializable data class KcRecordTitleRow(val id: Int = 0, val name: String = "", val logo: String = "", val titles: Int = 0, val lastSeason: Int = 0)
@Serializable data class KcRecordEdition(
    val season: Int = 0, val champion: KcHistoryChampion? = null, val runnerUp: KcHistoryChampion? = null,
    /** نتيجة النهائي بمنظور «الفائز أولًا» — لا تنقلب في RTL. */
    val score: String? = null, val penalties: String? = null,
)
@Serializable data class KcRecord(
    val sinceSeason: Int? = null,
    val editions: List<KcRecordEdition> = emptyList(),
    val titles: List<KcRecordTitleRow> = emptyList(),
)

// ── صفحة النادي ──

@Serializable data class KcTeamVenue(val name: String = "", val city: String = "", val capacity: Int? = null, val image: String? = null)
@Serializable data class KcTeamInfo(
    val id: Int = 0, val name: String = "", val logo: String = "",
    val country: String? = null, val founded: Int? = null, val venue: KcTeamVenue? = null,
)
@Serializable data class KcSquadPlayer(
    val id: Int = 0, val name: String = "", val number: Int? = null,
    val position: String = "", val positionEn: String = "", val age: Int? = null, val photo: String = "",
)
@Serializable data class KcCoachStop(val team: String = "", val start: String? = null, val end: String? = null)
@Serializable data class KcCoach(
    val id: Int = 0, val name: String = "", val photo: String = "",
    val age: Int? = null, val nationality: String? = null,
    val startDate: String? = null, val career: List<KcCoachStop> = emptyList(),
)
@Serializable data class KcTeamTopScorer(val id: Int = 0, val name: String = "", val photo: String = "", val goals: Int = 0)
@Serializable data class KcTeamProfile(
    val team: KcTeamInfo = KcTeamInfo(), val competitionName: String? = null,
    val fixtures: List<KcFixture> = emptyList(), val squad: List<KcSquadPlayer> = emptyList(),
    val coach: KcCoach? = null, val topScorers: List<KcTeamTopScorer> = emptyList(),
)
@Serializable data class KcSquad(val team: KcTeam = KcTeam(), val players: List<KcSquadPlayer> = emptyList())

// إحصائيات النادي الموسمية (teams/statistics — دوري أو كأس)

@Serializable data class KcStatTriple(val total: Int = 0, val home: Int = 0, val away: Int = 0)
@Serializable data class KcTeamStatsFixtures(
    val played: KcStatTriple = KcStatTriple(), val wins: KcStatTriple = KcStatTriple(),
    val draws: KcStatTriple = KcStatTriple(), val loses: KcStatTriple = KcStatTriple(),
)
@Serializable data class KcGoalsSide(val total: Int = 0, val average: String = "", val home: String = "", val away: String = "")
@Serializable data class KcTeamStatsGoals(@SerialName("for") val scored: KcGoalsSide = KcGoalsSide(), val against: KcGoalsSide = KcGoalsSide())
@Serializable data class KcTeamStatsBiggest(
    val winsHome: String? = null, val winsAway: String? = null,
    val losesHome: String? = null, val losesAway: String? = null,
    val streakWin: Int? = null, val streakLose: Int? = null, val streakDraw: Int? = null,
)
@Serializable data class KcCardsTotal(val yellowTotal: Int = 0, val redTotal: Int = 0)
@Serializable data class KcTeamStatsSummary(
    val cleanSheets: KcStatTriple = KcStatTriple(), val failedToScore: KcStatTriple = KcStatTriple(),
    val cards: KcCardsTotal = KcCardsTotal(), val mostUsedFormation: String? = null,
)
@Serializable data class KcGoalTiming(val bucket: String = "", @SerialName("for") val scored: Int = 0, val against: Int = 0)
@Serializable data class KcTeamStats(
    val leagueId: Int = 0, val season: Int = 0,
    val fixtures: KcTeamStatsFixtures = KcTeamStatsFixtures(),
    val goals: KcTeamStatsGoals = KcTeamStatsGoals(),
    val biggest: KcTeamStatsBiggest? = null,
    val summary: KcTeamStatsSummary = KcTeamStatsSummary(),
    val timing: List<KcGoalTiming> = emptyList(),
)
@Serializable data class KcTeamCupStats(val season: Int = 0, val stats: KcTeamStats = KcTeamStats())

@Serializable data class KcTeamTransfer(
    val date: String = "", val type: String = "", val playerId: Int = 0, val player: String = "",
    val teamId: Int = 0, val team: String = "", val teamLogo: String = "",
)
@Serializable data class KcTeamTransfers(val arrivals: List<KcTeamTransfer> = emptyList(), val departures: List<KcTeamTransfer> = emptyList())

/** إثراء صفحة النادي (?with=stats) — الحقول الثقيلة فقط. */
@Serializable data class KcTeamExtras(
    val stats: KcTeamStats? = null, val kcStats: KcTeamCupStats? = null,
    val coach: KcCoach? = null, val topScorers: List<KcTeamTopScorer>? = null,
    val transfers: KcTeamTransfers? = null,
)

@Serializable data class KcPrevRun(val season: Int = 0, val fixtures: List<KcFixture> = emptyList())
@Serializable data class KcTeamMatches(val season: Int? = null, val fixtures: List<KcFixture> = emptyList(), val previous: KcPrevRun? = null)

// ── صفحة اللاعب ──

@Serializable data class KcPlayerSeasonStats(
    val competition: String = "", val team: KcTeam = KcTeam(),
    val matches: Int = 0, val lineups: Int = 0, val minutes: Int = 0,
    val rating: Double? = null, val goals: Int = 0, val assists: Int = 0,
    val yellow: Int = 0, val red: Int = 0, val saves: Int = 0, val conceded: Int = 0,
) {
    val isKingsCup: Boolean get() = competition.contains("خادم الحرمين") || competition.contains("كأس الملك")
}

@Serializable data class KcPlayerCareerStop(val teamId: Int = 0, val team: String = "", val logo: String = "", val seasons: List<Int> = emptyList())
@Serializable data class KcPlayerTrophy(
    val competition: String = "", val country: String = "", val season: String = "",
    val place: String = "", val winner: Boolean = false,
)
@Serializable data class KcCurrentTeam(val id: Int = 0, val name: String = "", val logo: String = "")

@Serializable data class KcPlayerCard(
    val id: Int = 0, val name: String = "", val fullName: String? = null, val photo: String = "",
    val position: String = "", val number: Int? = null, val age: Int? = null,
    val birthDate: String? = null, val birthPlace: String? = null, val nationality: String? = null,
    val height: Int? = null, val weight: Int? = null,
    val seasonStats: List<KcPlayerSeasonStats> = emptyList(),
    val career: List<KcPlayerCareerStop> = emptyList(),
    val trophies: List<KcPlayerTrophy> = emptyList(),
    val currentTeam: KcCurrentTeam? = null,
) {
    val isGoalkeeper: Boolean get() = position.contains("حراسة") || position.contains("حارس")
}

@Serializable data class KcPlayerSeasonPoint(val season: Int = 0, val competition: String = "", val matches: Int = 0, val goals: Int = 0, val assists: Int = 0)
@Serializable data class KcPlayerTransfer(
    val date: String = "", val type: String = "",
    val fromId: Int = 0, val from: String = "", val fromLogo: String = "",
    val toId: Int = 0, val to: String = "", val toLogo: String = "",
)
@Serializable data class KcPlayerInjury(val date: String = "", val type: String = "", val reason: String = "", val team: String = "", val competition: String = "")

/** إثراء صفحة اللاعب (?with=extras). */
@Serializable data class KcPlayerExtras(
    val history: List<KcPlayerSeasonPoint>? = null,
    val transfers: List<KcPlayerTransfer>? = null,
    val injuries: List<KcPlayerInjury>? = null,
)

@Serializable data class KcFormMatch(
    val date: String = "", val opponent: String = "", val opponentLogo: String = "",
    val homeAway: String = "", val result: String = "",
    val scoreFor: Int = 0, val scoreAgainst: Int = 0, val xg: Double? = null,
    val goals: Int = 0, val rating: Double? = null, val league: String = "",
)
@Serializable data class KcPlayerForm(val available: Boolean = false, val matches: List<KcFormMatch> = emptyList())

@Serializable data class KcMarketPoint(val time: Long = 0, val value: Double = 0.0)
@Serializable data class KcPlayerMarket(
    val available: Boolean = false, val value: Double? = null, val currency: String = "",
    val peak: Double? = null, val history: List<KcMarketPoint> = emptyList(),
)

// ── أغلفة الاستجابات ──

@Serializable data class KcFixturesResponse(val fixtures: List<KcFixture> = emptyList())
@Serializable data class KcTeamsResponse(val teams: List<KcTeam> = emptyList())
@Serializable data class KcScorersResponse(val scorers: List<KcScorer> = emptyList())
@Serializable data class KcLeadersResponse(val leaders: List<KcLeader> = emptyList())
@Serializable data class KcPredictionEnvelope(val prediction: KcPrediction? = null)
