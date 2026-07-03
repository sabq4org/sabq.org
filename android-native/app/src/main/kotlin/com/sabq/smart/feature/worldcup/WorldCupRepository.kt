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

    // -- إثراء مركز المباراة (أفضل-جهد) --
    suspend fun matchFacts(fixtureId: Int): WcMatchFacts = api.getWorldCupMatchFacts(fixtureId)
    suspend fun xg(fixtureId: Int): WcXg = api.getWorldCupXg(fixtureId)
    suspend fun forecast(fixtureId: Int): WcForecast = api.getWorldCupForecast(fixtureId)
    suspend fun pressure(fixtureId: Int): WcPressure = api.getWorldCupPressure(fixtureId)
    suspend fun momentum(fixtureId: Int): WcMomentum = api.getWorldCupMomentum(fixtureId)
    suspend fun commentary(fixtureId: Int): WcCommentary = api.getWorldCupCommentary(fixtureId)
    suspend fun tv(fixtureId: Int): WcTvListing = api.getWorldCupTv(fixtureId)
    suspend fun pulse(fixtureId: Int): WcPulse = api.getWorldCupPulse(fixtureId)
    suspend fun playerMarket(playerId: Int): WcPlayerMarket = api.getWorldCupPlayerMarket(playerId)
    suspend fun playerForm(playerId: Int): WcPlayerForm = api.getWorldCupPlayerForm(playerId)
    suspend fun facts(): WcCompetitionFacts = api.getWorldCupFacts()
    suspend fun bracket(): WcBracket = api.getWorldCupBracket()
    suspend fun news(limit: Int = 8): List<WcNewsItem> = api.getWorldCupNews(limit).news
    suspend fun teamProfile(teamId: Int): WcTeamProfile = api.getWorldCupTeam(teamId)

    // -- المتابعة الرياضية + تنبيهات المباريات (Bearer) --
    suspend fun sportsFollows(): List<SportsFollow> = api.getSportsFollows().follows
    suspend fun addFollow(kind: String, refId: String, refName: String, refLogo: String?) =
        api.addSportsFollow(SportsFollowBody(kind, refId, refName, refLogo))
    suspend fun removeFollow(kind: String, refId: String) =
        api.removeSportsFollow(SportsFollowBody(kind = kind, refId = refId))
    suspend fun alertPrefs(): SportsAlertPreferences = api.getSportsAlertPrefs().preferences
    suspend fun updateAlertPrefs(prefs: SportsAlertPreferences) = api.updateSportsAlertPrefs(prefs)

    // -- مسابقة التوقّعات (Bearer) --
    suspend fun predictionsToday(): List<WcPredictableMatch> = api.getWcPredictionsToday().matches
    suspend fun submitPrediction(fixtureId: Int, predHome: Int, predAway: Int) =
        api.submitWcPrediction(WcPredictionSubmitBody(fixtureId, predHome, predAway))
    suspend fun myPredictions(): List<WcPredictionHistoryItem> = api.getWcMyPredictions().predictions
    suspend fun leaderboard(): List<WcPredLeader> = api.getWcLeaderboard().leaders

    // -- توقّعات البطولة: البطل + الهدّاف (Bearer) --
    suspend fun longPredictions(): WcLongData = api.getWcLongPredictions()
    suspend fun submitLong(kind: String, teamId: Int? = null, playerId: Int? = null): Boolean =
        api.submitWcLongPrediction(WcLongSubmitBody(kind, teamId, playerId)).ok
}
