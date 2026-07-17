package com.sabq.smart.feature.predictions

import com.sabq.smart.data.api.SabqApi
import javax.inject.Inject
import javax.inject.Singleton

/** طبقة رقيقة فوق SabqApi — نفس نمط WorldCupRepository. */
@Singleton
class PredictionsRepository @Inject constructor(private val api: SabqApi) {
    suspend fun competitions(): PredCompetitionsResponse = api.getPredCompetitions()

    suspend fun competition(slug: String): PredCompetitionDetailResponse =
        api.getPredCompetition(slug)

    suspend fun contest(id: String): PredContestDetailResponse = api.getPredContest(id)

    suspend fun submitEntry(contestId: String, predHome: Int, predAway: Int): PredEntrySaveResponse =
        api.putPredEntry(contestId, PredEntryBody(PredScorePayload(predHome, predAway)))

    suspend fun ledger(competitionSlug: String): PredLedgerResponse =
        api.getPredLedger(competitionSlug)

    suspend fun leaderboard(competitionSlug: String): PredLeaderboardResponse =
        api.getPredLeaderboard(competitionSlug)

    suspend fun settlement(contestId: String): PredSettlementResponse =
        api.getPredSettlement(contestId)
}
