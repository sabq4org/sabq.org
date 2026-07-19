package com.sabq.smart.feature.gulfcup

import com.sabq.smart.data.api.SabqApi
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class GulfCupRepository @Inject constructor(private val api: SabqApi) {
    suspend fun overview(): GcOverview = api.getGulfCupOverview()
    suspend fun fixtures(): List<GcFixture> = api.getGulfCupFixtures().fixtures
    suspend fun standings(): List<GcGroup> = api.getGulfCupStandings().groups
    suspend fun teams(): List<GcTeam> = api.getGulfCupTeams().teams
    suspend fun teamProfile(teamId: Int): GcTeamProfile = api.getGulfCupTeam(teamId)
    suspend fun match(fixtureId: Int): GcMatchDetail = api.getGulfCupMatch(fixtureId)

    suspend fun predictionsToday(): GcPredictionsTodayResponse = api.getGcPredictionsToday()
    suspend fun submitPrediction(fixtureId: Int, home: Int, away: Int): GcSubmittedPrediction =
        api.submitGcPrediction(GcPredictionSubmitBody(fixtureId, home, away)).prediction
    suspend fun predictionsLeaderboard(): List<GcPredictionLeader> = api.getGcPredictionsLeaderboard().leaders
    suspend fun myPredictions(): List<GcMyPredictionRow> = api.getGcMyPredictions().predictions
    suspend fun longPredictions(): GcLongData = api.getGcLongPredictions()
    suspend fun submitLongPrediction(kind: String, teamId: Int? = null, playerName: String? = null) {
        api.submitGcLongPrediction(GcLongSubmitBody(kind, teamId, playerName))
    }

    suspend fun majalis(): List<GcMajlisSummary> = api.getGcMajalis().majalis
    suspend fun createMajlis(name: String): GcMajlisSummary = api.createGcMajlis(GcMajlisNameBody(name))
    suspend fun joinMajlis(code: String): GcMajlisSummary = api.joinGcMajlis(GcMajlisCodeBody(code))
    suspend fun invite(code: String): GcMajlisInvitePreview = api.getGcMajlisInvite(code)
    suspend fun majlisBoard(id: String): GcMajlisBoard = api.getGcMajlisBoard(id)
    suspend fun leaveMajlis(id: String): GcLeaveResponse = api.leaveGcMajlis(id)
    suspend fun matchday(id: String, date: String? = null): GcMajlisMatchdayResponse =
        api.getGcMajlisMatchday(id, date)
    suspend fun majlisFantasy(id: String): GcMajlisFantasyResponse = api.getGcMajlisFantasy(id)
    suspend fun championPicks(id: String): GcMajlisChampionPicksResponse = api.getGcMajlisChampionPicks(id)
    suspend fun harvest(id: String): GcMajlisHarvestResponse = api.getGcMajlisHarvest(id)
    suspend fun duels(id: String): GcMajlisDuelsResponse = api.getGcMajlisDuels(id)
    suspend fun createDuel(id: String, opponentId: String, fixtureId: Int, stake: Int): GcMajlisDuel =
        api.createGcMajlisDuel(id, GcMajlisDuelCreateBody(fixtureId, opponentId, stake)).duel
    suspend fun mutateDuel(id: String, action: String): GcMajlisDuel =
        api.mutateGcMajlisDuel(id, action).duel
    suspend fun notificationPreference(): Boolean = api.getGcMajlisNotificationPreference().enabled
    suspend fun setNotificationPreference(enabled: Boolean): Boolean =
        api.updateGcMajlisNotificationPreference(GcMajlisNotificationPreferenceBody(enabled)).enabled
    suspend fun fantasyLeaderboard(): List<GcFantasyLeader> = api.getGcFantasyLeaderboard().leaders
}
