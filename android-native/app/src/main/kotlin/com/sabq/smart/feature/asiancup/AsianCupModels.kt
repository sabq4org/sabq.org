package com.sabq.smart.feature.asiancup

import kotlinx.serialization.Serializable

@Serializable data class AcTeam(val id: Int = 0, val name: String = "", val logo: String = "")
@Serializable data class AcStatus(val code: String = "", val label: String = "", val elapsed: Int? = null, val live: Boolean = false, val finished: Boolean = false)
@Serializable data class AcScore(val home: Int? = null, val away: Int? = null)
@Serializable data class AcVenue(val name: String = "", val city: String = "")
@Serializable data class AcFixture(
    val id: Int = 0, val date: String = "", val timestamp: Int = 0,
    val status: AcStatus = AcStatus(), val round: String = "", val roundEn: String = "",
    val venue: AcVenue = AcVenue(), val home: AcTeam = AcTeam(), val away: AcTeam = AcTeam(),
    val goals: AcScore = AcScore(),
)
@Serializable data class AcStandingRow(
    val rank: Int = 0, val team: AcTeam = AcTeam(), val played: Int = 0,
    val win: Int = 0, val draw: Int = 0, val lose: Int = 0,
    val goalsFor: Int = 0, val goalsAgainst: Int = 0, val goalsDiff: Int = 0, val points: Int = 0,
)
@Serializable data class AcGroup(val name: String = "", val rows: List<AcStandingRow> = emptyList())
@Serializable data class AcSaudi(val team: AcTeam? = null, val group: String? = null, val fixtures: List<AcFixture> = emptyList())
@Serializable data class AcOverview(
    val startsAt: String? = null, val endsAt: String? = null, val teamsCount: Int = 0,
    val groupsCount: Int = 0, val host: String = "", val venues: List<AcVenue> = emptyList(),
    val started: Boolean = false, val saudi: AcSaudi = AcSaudi(), val nextMatch: AcFixture? = null,
)
@Serializable data class AcTeamsResponse(val teams: List<AcTeam> = emptyList())
@Serializable data class AcFixturesResponse(val fixtures: List<AcFixture> = emptyList())
@Serializable data class AcStandingsResponse(val groups: List<AcGroup> = emptyList())

@Serializable data class AcTeamStats(
    val groupName: String? = null, val rank: Int? = null, val played: Int = 0,
    val win: Int = 0, val draw: Int = 0, val lose: Int = 0,
    val goalsFor: Int = 0, val goalsAgainst: Int = 0, val goalsDiff: Int = 0,
    val points: Int = 0, val form: List<String> = emptyList(),
)
@Serializable data class AcSquadPlayer(
    val id: Int = 0, val name: String = "", val nameEn: String = "", val number: Int? = null,
    val position: String = "", val positionEn: String = "", val age: Int? = null, val photo: String = "",
)
@Serializable data class AcTeamProfile(
    val team: AcTeam = AcTeam(), val isSaudi: Boolean = false, val coach: String? = null,
    val group: AcGroup? = null, val stats: AcTeamStats? = null, val nextMatch: AcFixture? = null,
    val fixtures: List<AcFixture> = emptyList(), val squad: List<AcSquadPlayer> = emptyList(),
)

@Serializable data class AcMatchEvent(
    val minute: Int = 0, val extraMinute: Int? = null, val teamId: Int = 0,
    val type: String = "", val label: String = "", val detail: String = "",
    val player: String = "", val playerEn: String = "", val playerId: Int? = null,
    val assist: String? = null, val assistEn: String? = null, val assistId: Int? = null,
)
@Serializable data class AcStatistic(val key: String = "", val label: String = "", val home: String = "", val away: String = "")
@Serializable data class AcLineupPlayer(val id: Int = 0, val name: String = "", val nameEn: String = "", val number: Int? = null, val position: String? = null, val grid: String? = null)
@Serializable data class AcLineup(val teamId: Int = 0, val teamName: String = "", val formation: String? = null, val coach: String = "", val startXI: List<AcLineupPlayer> = emptyList(), val substitutes: List<AcLineupPlayer> = emptyList())
@Serializable data class AcPlayerRating(val id: Int = 0, val name: String = "", val nameEn: String = "", val photo: String = "", val teamId: Int = 0, val number: Int? = null, val position: String = "", val rating: Double = 0.0, val minutes: Int = 0, val goals: Int = 0, val assists: Int = 0, val captain: Boolean = false)
@Serializable data class AcMatchPrediction(val home: Int = 0, val draw: Int = 0, val away: Int = 0)
@Serializable data class AcMatchDetail(
    val fixture: AcFixture = AcFixture(), val events: List<AcMatchEvent> = emptyList(),
    val lineups: List<AcLineup> = emptyList(), val statistics: List<AcStatistic> = emptyList(),
    val ratings: List<AcPlayerRating> = emptyList(), val manOfTheMatch: AcPlayerRating? = null,
    val prediction: AcMatchPrediction? = null, val headToHead: List<AcFixture> = emptyList(),
)

@Serializable data class AcScorer(val rank: Int = 0, val id: Int = 0, val name: String = "", val nameEn: String = "", val photo: String = "", val team: AcTeam = AcTeam(), val goals: Int = 0, val assists: Int = 0, val penalties: Int = 0, val minutes: Int = 0, val matches: Int = 0)
@Serializable data class AcScorersResponse(val scorers: List<AcScorer> = emptyList())
@Serializable data class AcBracketRound(val round: String = "", val roundEn: String = "", val matches: List<AcFixture> = emptyList())
@Serializable data class AcBracket(val source: String = "", val rounds: List<AcBracketRound> = emptyList())

@Serializable data class AcModelProbs(val home: Double = 0.0, val draw: Double = 0.0, val away: Double = 0.0)
@Serializable data class AcPredictionCrowd(val home: Int = 0, val draw: Int = 0, val away: Int = 0, val total: Int = 0)
@Serializable data class AcMyPrediction(val predHome: Int = 0, val predAway: Int = 0, val status: String = "pending", val outcomeHit: Boolean? = null, val marginHit: Boolean? = null, val exactHit: Boolean? = null, val boldnessMult: Double? = null, val streakMult: Double? = null, val pointsAwarded: Int? = null)
@Serializable data class AcPredictableMatch(val fixture: AcFixture = AcFixture(), val locked: Boolean = false, val probs: AcModelProbs = AcModelProbs(), val crowd: AcPredictionCrowd = AcPredictionCrowd(), val predictionsCount: Int = 0, val myPrediction: AcMyPrediction? = null)
@Serializable data class AcPredictionMeStats(val points: Int = 0, val correct: Int = 0, val exact: Int = 0, val played: Int = 0, val currentStreak: Int = 0)
@Serializable data class AcPredictionLeader(val rank: Int = 0, val userId: String = "", val name: String = "", val avatar: String? = null, val totalPoints: Int = 0, val correctCount: Int = 0, val exactCount: Int = 0, val playedCount: Int = 0, val accuracy: Double = 0.0)
@Serializable data class AcPredictionsTodayResponse(val matches: List<AcPredictableMatch> = emptyList(), val me: AcPredictionMeStats? = null)
@Serializable data class AcPredictionLeaderboardResponse(val leaders: List<AcPredictionLeader> = emptyList())
@Serializable data class AcPredictionSubmitBody(val fixtureId: Int, val predHome: Int, val predAway: Int)
@Serializable data class AcPredictionSubmitResponse(val prediction: AcMyPrediction = AcMyPrediction())

object AcConstants { const val SAUDI_TEAM_ID = 23; const val TOURNAMENT_NAME = "كأس آسيا 2027" }
