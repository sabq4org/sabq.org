package com.sabq.smart.feature.worldcup

import com.sabq.smart.data.api.SabqApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * طبقة الوصول لبيانات كأس العالم — تغلّف نقاط /api/world-cup/… العامة.
 * الخادم يكاش كل شيء (SWR) فلا حاجة لكاش محلي. مطابقة لـiOS APIClient.
 */
@Singleton
class WorldCupRepository @Inject constructor(
    private val api: SabqApi,
) {
    suspend fun overview(): WcOverview = api.getWorldCupOverview()
    suspend fun fixtures(): List<WcFixture> = api.getWorldCupFixtures().fixtures
    suspend fun standings(): List<WcGroup> = api.getWorldCupStandings().groups
    suspend fun scorers(): List<WcScorer> = api.getWorldCupScorers().scorers
    suspend fun assists(): List<WcLeader> = api.getWorldCupAssists().leaders
    suspend fun cards(): List<WcLeader> = api.getWorldCupCards().leaders
    suspend fun teams(): List<WcTeam> = api.getWorldCupTeams().teams
    suspend fun squad(teamId: Int): WcSquad = api.getWorldCupSquad(teamId)
    suspend fun match(fixtureId: Int): WcMatchDetail = api.getWorldCupMatch(fixtureId)
    suspend fun player(playerId: Int): WcPlayerCard = api.getWorldCupPlayer(playerId)
}
