package com.sabq.smart.data

import com.sabq.smart.data.api.SabqApi
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LoyaltyRepository @Inject constructor(
    private val api: SabqApi,
) {
    suspend fun getSummary(): LoyaltySummary {
        val response = api.getLoyaltyMe()
        val pts = response.points
        return LoyaltySummary(
            totalPoints = pts?.totalPoints ?: 0,
            lifetimePoints = pts?.lifetimePoints ?: 0,
            currentRank = pts?.currentRank,
            rankLevel = pts?.rankLevel,
            weekPoints = response.weekPoints,
            monthPoints = response.monthPoints,
            streakDays = response.streakDays,
            lastActivityAt = pts?.lastActivityAt,
        )
    }
}
