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
}
