package com.sabq.smart.feature.gulfcup

import kotlinx.serialization.Serializable

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
