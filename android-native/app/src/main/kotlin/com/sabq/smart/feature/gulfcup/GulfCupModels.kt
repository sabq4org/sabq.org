package com.sabq.smart.feature.gulfcup

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName

@Serializable data class GcTeam(val id: Int = 0, val name: String = "", val logo: String = "")
@Serializable data class GcStatus(val code: String = "", val label: String = "", val elapsed: Int? = null, val live: Boolean = false, val finished: Boolean = false)
@Serializable data class GcScore(val home: Int? = null, val away: Int? = null)
@Serializable data class GcVenue(val name: String = "", val city: String = "")
@Serializable
data class GcFixture(
    val id: Int = 0,
    val matchNo: Int? = null,
    val date: String = "",
    val timestamp: Int = 0,
    val status: GcStatus = GcStatus(),
    val round: String = "",
    val roundEn: String = "",
    val venue: GcVenue = GcVenue(),
    val home: GcTeam = GcTeam(),
    val away: GcTeam = GcTeam(),
    val goals: GcScore = GcScore(),
    val penalties: GcScore = GcScore(),
)

@Serializable data class GcStandingRow(val rank: Int = 0, val team: GcTeam = GcTeam(), val played: Int = 0, val win: Int = 0, val draw: Int = 0, val lose: Int = 0, val goalsFor: Int = 0, val goalsAgainst: Int = 0, val goalsDiff: Int = 0, val points: Int = 0)
@Serializable data class GcGroup(val name: String = "", val rows: List<GcStandingRow> = emptyList())

@Serializable
data class GcOverview(
    val startsAt: String? = null,
    val endsAt: String? = null,
    val teamsCount: Int = 0,
    val groupsCount: Int = 0,
    val host: String = "",
    val venues: List<GcVenue> = emptyList(),
    val started: Boolean = false,
    val nextMatch: GcFixture? = null,
)

@Serializable data class GcTeamsResponse(val teams: List<GcTeam> = emptyList())
@Serializable data class GcFixturesResponse(val fixtures: List<GcFixture> = emptyList())
@Serializable data class GcStandingsResponse(val groups: List<GcGroup> = emptyList())

@Serializable
data class GcTeamStats(
    val groupName: String? = null,
    val rank: Int? = null,
    val played: Int = 0,
    val win: Int = 0,
    val draw: Int = 0,
    val lose: Int = 0,
    val goalsFor: Int = 0,
    val goalsAgainst: Int = 0,
    val goalsDiff: Int = 0,
    val points: Int = 0,
    val form: List<String> = emptyList(),
)

@Serializable
data class GcTeamProfile(
    val team: GcTeam = GcTeam(),
    val isSaudi: Boolean = false,
    val coach: String? = null,
    val group: GcGroup? = null,
    val stats: GcTeamStats = GcTeamStats(),
    val nextMatch: GcFixture? = null,
    val fixtures: List<GcFixture> = emptyList(),
)

@Serializable data class GcMatchEvent(val minute: Int = 0, val teamId: Int = 0, val type: String = "", val label: String = "", val player: String? = null)
@Serializable data class GcStatistic(val key: String = "", val label: String = "", val home: String = "", val away: String = "")

@Serializable
data class GcMatchDetail(
    val fixture: GcFixture = GcFixture(),
    val events: List<GcMatchEvent> = emptyList(),
    val statistics: List<GcStatistic> = emptyList(),
    val headToHead: List<GcFixture> = emptyList(),
)

object GcConstants {
    const val SAUDI_TEAM_ID = 23
    const val TOURNAMENT_NAME = "خليجي 27"
}

// ---------------------------------------------------------------------------
// Predictions — mirrors the native iOS GulfCupModels contracts.
// ---------------------------------------------------------------------------

@Serializable data class GcModelProbs(val home: Double = 0.0, val draw: Double = 0.0, val away: Double = 0.0)
@Serializable data class GcPredictionCrowd(val home: Int = 0, val draw: Int = 0, val away: Int = 0, val total: Int = 0)
@Serializable data class GcMyPrediction(
    val predHome: Int = 0,
    val predAway: Int = 0,
    val status: String = "pending",
    val tier: String? = null,
    val outcomeHit: Boolean? = null,
    val marginHit: Boolean? = null,
    val exactHit: Boolean? = null,
    val pointsAwarded: Int? = null,
)
@Serializable data class GcMatchSettlement(
    val status: String = "open",
    val finalHome: Int? = null,
    val finalAway: Int? = null,
    val predictionsCount: Int = 0,
    val exactWinners: Int = 0,
    val marginWinners: Int = 0,
    val outcomeWinners: Int = 0,
    val poolBase: Int? = null,
    val poolCarryIn: Int? = null,
    val carryOut: Int? = null,
)
@Serializable data class GcPredictableMatch(
    val fixture: GcFixture = GcFixture(),
    val locked: Boolean = false,
    val probs: GcModelProbs = GcModelProbs(),
    val crowd: GcPredictionCrowd = GcPredictionCrowd(),
    val predictionsCount: Int = 0,
    val poolAvailable: Int = 0,
    val myPrediction: GcMyPrediction? = null,
    val settlement: GcMatchSettlement? = null,
)
@Serializable data class GcPredictionMeStats(
    val points: Int = 0,
    val correct: Int = 0,
    val exact: Int = 0,
    val played: Int = 0,
    val currentStreak: Int = 0,
    val badges: List<String>? = null,
)
@Serializable data class GcPredictionLeader(
    val rank: Int = 0,
    val userId: String = "",
    val name: String = "",
    val avatar: String? = null,
    val totalPoints: Int = 0,
    val correctCount: Int = 0,
    val exactCount: Int = 0,
    val playedCount: Int = 0,
    val accuracy: Double = 0.0,
)
@Serializable data class GcPredictionsTodayResponse(
    val matches: List<GcPredictableMatch> = emptyList(),
    val me: GcPredictionMeStats? = null,
    val jackpot: Int = 0,
)
@Serializable data class GcPredictionLeaderboardResponse(val leaders: List<GcPredictionLeader> = emptyList())
@Serializable data class GcMyPredictionRow(
    val fixtureId: String = "",
    val predHome: Int = 0,
    val predAway: Int = 0,
    val status: String = "pending",
    val tier: String? = null,
    val outcomeHit: Boolean? = null,
    val marginHit: Boolean? = null,
    val exactHit: Boolean? = null,
    val pointsAwarded: Int? = null,
    val kickoffAt: String? = null,
    val homeTeamName: String? = null,
    val homeTeamLogo: String? = null,
    val awayTeamName: String? = null,
    val awayTeamLogo: String? = null,
    val finalHome: Int? = null,
    val finalAway: Int? = null,
    val matchStatus: String? = null,
)
@Serializable data class GcMyPredictionsResponse(val predictions: List<GcMyPredictionRow> = emptyList())
@Serializable data class GcPredictionSubmitBody(val fixtureId: Int, val predHome: Int, val predAway: Int)
@Serializable data class GcSubmittedPrediction(val predHome: Int = 0, val predAway: Int = 0, val status: String = "pending")
@Serializable data class GcPredictionSubmitResponse(val prediction: GcSubmittedPrediction = GcSubmittedPrediction())
@Serializable data class GcTeamLite(val id: Int = 0, val name: String = "", val logo: String = "")
@Serializable data class GcLongPools(val champion: Int = 0, @SerialName("top_scorer") val topScorer: Int = 0)
@Serializable data class GcLongVote(val kind: String = "", val teamId: Int? = null, val n: Int = 0)
@Serializable data class GcLongMine(
    val kind: String = "",
    val teamId: Int? = null,
    val teamName: String? = null,
    val playerName: String? = null,
    val status: String = "pending",
    val pointsAwarded: Int = 0,
)
@Serializable data class GcLongData(
    val teams: List<GcTeamLite> = emptyList(),
    val pools: GcLongPools = GcLongPools(),
    val championVotes: List<GcLongVote> = emptyList(),
    val mine: List<GcLongMine> = emptyList(),
)
@Serializable data class GcLongSubmitBody(val kind: String, val teamId: Int? = null, val playerName: String? = null)
@Serializable data class GcOkResponse(val ok: Boolean? = null, val success: Boolean? = null, val saved: Boolean? = null)

// ---------------------------------------------------------------------------
// Majalis — private social read models.
// ---------------------------------------------------------------------------

@Serializable data class GcMajlisSummary(
    val id: String = "",
    val name: String = "",
    val code: String = "",
    val isOwner: Boolean = false,
    val membersCount: Int = 0,
    val createdAt: String? = null,
    val joinedNow: Boolean? = null,
)
@Serializable data class GcMajalisResponse(val majalis: List<GcMajlisSummary> = emptyList())
@Serializable data class GcMajlisNameBody(val name: String)
@Serializable data class GcMajlisCodeBody(val code: String)
@Serializable data class GcLeaveResponse(val deleted: Boolean = false)
@Serializable data class GcMajlisInvitePreview(
    val code: String = "",
    val name: String = "",
    val membersCount: Int = 0,
    val maxMembers: Int = 50,
    val full: Boolean = false,
    val joinUrl: String = "",
)
@Serializable data class GcMajlisLeaderRow(
    val rank: Int = 0,
    val userId: String = "",
    val name: String = "",
    val avatar: String? = null,
    val isOwner: Boolean = false,
    val totalPoints: Int = 0,
    val correctCount: Int = 0,
    val exactCount: Int = 0,
    val playedCount: Int = 0,
)
@Serializable data class GcMajlisBoard(
    val majlis: GcMajlisSummary = GcMajlisSummary(),
    val rows: List<GcMajlisLeaderRow> = emptyList(),
)
@Serializable data class GcMajlisMatchResult(val home: Int? = null, val away: Int? = null, val status: String = "")
@Serializable data class GcMajlisRevealedPrediction(
    val home: Int = 0,
    val away: Int = 0,
    val evaluation: String = "pending",
    val provisional: Boolean = false,
    val points: Int = 0,
)
@Serializable data class GcMajlisMemberPrediction(
    val userId: String = "",
    val name: String = "",
    val avatar: String? = null,
    val isOwner: Boolean = false,
    val isViewer: Boolean = false,
    val hasPredicted: Boolean = false,
    val prediction: GcMajlisRevealedPrediction? = null,
)
@Serializable data class GcMajlisMatchdayMatch(
    val fixture: GcFixture = GcFixture(),
    val revealAt: String = "",
    val visibility: String = "sealed",
    val result: GcMajlisMatchResult? = null,
    val members: List<GcMajlisMemberPrediction> = emptyList(),
)
@Serializable data class GcMajlisDayChampionWinner(
    val userId: String = "",
    val name: String = "",
    val avatar: String? = null,
    val points: Int = 0,
    val exact: Int = 0,
    val correct: Int = 0,
)
@Serializable data class GcMajlisDayChampion(
    val status: String = "pending",
    val settledMatches: Int = 0,
    val totalMatches: Int = 0,
    val winners: List<GcMajlisDayChampionWinner> = emptyList(),
)
@Serializable data class GcMajlisMatchdayResponse(
    val date: String = "",
    val timezone: String = "Asia/Riyadh",
    val majlis: GcMajlisSummary = GcMajlisSummary(),
    val matches: List<GcMajlisMatchdayMatch> = emptyList(),
    val dayChampion: GcMajlisDayChampion = GcMajlisDayChampion(),
)
@Serializable data class GcMajlisFantasyRow(
    val rank: Int = 0,
    val userId: String = "",
    val name: String = "",
    val avatar: String? = null,
    val isOwner: Boolean = false,
    val isViewer: Boolean = false,
    val hasSquad: Boolean = false,
    val totalPoints: Int = 0,
)
@Serializable data class GcMajlisFantasyResponse(
    val majlis: GcMajlisSummary = GcMajlisSummary(),
    val rows: List<GcMajlisFantasyRow> = emptyList(),
)
@Serializable data class GcMajlisChampionTeamPick(
    val teamId: Int = 0,
    val teamName: String = "",
    val status: String = "pending",
    val points: Int = 0,
)
@Serializable data class GcMajlisChampionMember(
    val userId: String = "",
    val name: String = "",
    val avatar: String? = null,
    val isOwner: Boolean = false,
    val isViewer: Boolean = false,
    val hasPicked: Boolean = false,
    val pick: GcMajlisChampionTeamPick? = null,
)
@Serializable data class GcMajlisChampionPicksResponse(
    val majlis: GcMajlisSummary = GcMajlisSummary(),
    val visibility: String = "sealed",
    val lockedAt: String? = null,
    val members: List<GcMajlisChampionMember> = emptyList(),
)
@Serializable data class GcMajlisHarvestChampion(
    val userId: String = "",
    val name: String = "",
    val avatar: String? = null,
    val totalPoints: Int = 0,
    val exactCount: Int = 0,
    val correctCount: Int = 0,
    val badgeCode: String = "majlis_champion",
)
@Serializable data class GcMajlisHarvestAccurate(
    val userId: String = "",
    val name: String = "",
    val avatar: String? = null,
    val accuracy: Double = 0.0,
    val correctCount: Int = 0,
    val playedCount: Int = 0,
)
@Serializable data class GcMajlisHarvestBold(
    val userId: String = "",
    val name: String = "",
    val avatar: String? = null,
    val pickProb: Double = 0.0,
    val fixtureId: Int = 0,
)
@Serializable data class GcMajlisHarvestStubborn(
    val userId: String = "",
    val name: String = "",
    val avatar: String? = null,
    val teamId: Int = 0,
    val teamName: String = "",
    val picksCount: Int = 0,
)
@Serializable data class GcMajlisHarvestAwards(
    val champions: List<GcMajlisHarvestChampion> = emptyList(),
    val mostAccurate: List<GcMajlisHarvestAccurate> = emptyList(),
    val boldest: List<GcMajlisHarvestBold> = emptyList(),
    val stubborn: List<GcMajlisHarvestStubborn> = emptyList(),
)
@Serializable data class GcMajlisHarvestResponse(
    val status: String = "pending",
    val majlis: GcMajlisSummary = GcMajlisSummary(),
    val finalAt: String? = null,
    val generatedAt: String = "",
    val awards: GcMajlisHarvestAwards = GcMajlisHarvestAwards(),
)
@Serializable data class GcMajlisDuelParticipant(val userId: String = "", val name: String = "", val avatar: String? = null)
@Serializable data class GcMajlisDuel(
    val id: String = "",
    val majlisId: String = "",
    val fixtureId: Int = 0,
    val stake: Int = 0,
    val status: String = "pending",
    val challenger: GcMajlisDuelParticipant = GcMajlisDuelParticipant(),
    val challenged: GcMajlisDuelParticipant = GcMajlisDuelParticipant(),
    val winnerId: String? = null,
    val createdAt: String = "",
    val acceptedAt: String? = null,
    val expiresAt: String? = null,
    val settledAt: String? = null,
)
@Serializable data class GcMajlisDuelsResponse(
    val majlis: GcMajlisSummary = GcMajlisSummary(),
    val duels: List<GcMajlisDuel> = emptyList(),
    val eligibleMembers: List<GcMajlisDuelParticipant> = emptyList(),
)
@Serializable data class GcMajlisDuelCreateBody(val fixtureId: Int, val challengedUserId: String, val stake: Int)
@Serializable data class GcMajlisDuelMutationResponse(val duel: GcMajlisDuel = GcMajlisDuel())
@Serializable data class GcMajlisNotificationPreference(val enabled: Boolean = true)
@Serializable data class GcMajlisNotificationPreferenceBody(val enabled: Boolean)

// Global mini-fantasy segment used by the predictions hub.
@Serializable data class GcFantasyLeader(
    val rank: Int = 0,
    val userId: String = "",
    val name: String = "",
    val avatar: String? = null,
    val totalPoints: Int = 0,
)
@Serializable data class GcFantasyLeaderboardResponse(val leaders: List<GcFantasyLeader> = emptyList())
