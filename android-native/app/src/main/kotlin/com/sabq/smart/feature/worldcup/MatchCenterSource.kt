package com.sabq.smart.feature.worldcup

import javax.inject.Inject

/**
 * مصدر بيانات مركز المباراة. مركز كأس العالم ومركز كأس آسيا يعرضان الواجهة
 * نفسها (التعليق، الأحداث، الزخم، الضغط، التشكيلات، الإحصائيات، التقييمات،
 * التوقعات)، والخادم يعيد الأشكال نفسها للبطولتين، فيختلف المصدر فقط.
 */
interface MatchCenterSource {
    /** تُظهر زر «تابع على شاشة القفل» (كأس العالم فقط، كما في iOS). */
    val supportsLiveFollow: Boolean

    /** تُظهر زر «تابع المباراة» لتنبيهات المتابعة الرياضية (كأس آسيا، كما في iOS). */
    val supportsMatchAlerts: Boolean

    suspend fun match(fixtureId: Int): WcMatchDetail
    suspend fun player(playerId: Int): WcPlayerCard
    suspend fun matchFacts(fixtureId: Int): WcMatchFacts
    suspend fun xg(fixtureId: Int): WcXg

    /** null حين لا تقدّم البطولة سوق احتمالات (كأس آسيا: نسب الفوز في التفاصيل). */
    suspend fun forecast(fixtureId: Int): WcForecast?
    suspend fun pressure(fixtureId: Int): WcPressure
    suspend fun momentum(fixtureId: Int): WcMomentum
    suspend fun commentary(fixtureId: Int): WcCommentary
    suspend fun tv(fixtureId: Int): WcTvListing
}

class WorldCupMatchSource @Inject constructor(private val repo: WorldCupRepository) : MatchCenterSource {
    override val supportsLiveFollow = true
    override val supportsMatchAlerts = false
    override suspend fun match(fixtureId: Int) = repo.match(fixtureId)
    override suspend fun player(playerId: Int) = repo.player(playerId)
    override suspend fun matchFacts(fixtureId: Int) = repo.matchFacts(fixtureId)
    override suspend fun xg(fixtureId: Int) = repo.xg(fixtureId)
    override suspend fun forecast(fixtureId: Int): WcForecast? = repo.forecast(fixtureId)
    override suspend fun pressure(fixtureId: Int) = repo.pressure(fixtureId)
    override suspend fun momentum(fixtureId: Int) = repo.momentum(fixtureId)
    override suspend fun commentary(fixtureId: Int) = repo.commentary(fixtureId)
    override suspend fun tv(fixtureId: Int) = repo.tv(fixtureId)
}
