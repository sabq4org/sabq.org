package com.sabq.smart.feature.asiancup

import androidx.compose.runtime.Composable
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import com.sabq.smart.data.auth.AuthTokenStore
import com.sabq.smart.feature.worldcup.MatchCenterSource
import com.sabq.smart.feature.worldcup.MatchCenterViewModel
import com.sabq.smart.feature.worldcup.WcCommentary
import com.sabq.smart.feature.worldcup.WcForecast
import com.sabq.smart.feature.worldcup.WcMatchDetail
import com.sabq.smart.feature.worldcup.WcMatchFacts
import com.sabq.smart.feature.worldcup.WcMomentum
import com.sabq.smart.feature.worldcup.WcPlayerCard
import com.sabq.smart.feature.worldcup.WcPressure
import com.sabq.smart.feature.worldcup.WcTvListing
import com.sabq.smart.feature.worldcup.WcXg
import com.sabq.smart.feature.worldcup.WorldCupMatchCenterScreen
import com.sabq.smart.feature.worldcup.WorldCupRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Path

/**
 * نقاط مركز مباراة كأس آسيا (server/routes/asianCup.ts). الخادم يعيد أشكال
 * كأس العالم نفسها (التعليق/الحقائق/xG عبر الدوال المشتركة، والتفاصيل والزخم
 * والضغط بحقول متطابقة)، فنفكّها في نماذج Wc ونعيد استخدام مركز المباراة كاملًا.
 */
interface AsianCupMatchCenterApi {
    @GET("https://api.sabq.org/api/asian-cup/match/{id}")
    suspend fun match(@Path("id") fixtureId: Int): WcMatchDetail

    @GET("https://api.sabq.org/api/asian-cup/player/{id}")
    suspend fun player(@Path("id") playerId: Int): WcPlayerCard

    @GET("https://api.sabq.org/api/asian-cup/match-facts/{id}")
    suspend fun matchFacts(@Path("id") fixtureId: Int): WcMatchFacts

    @GET("https://api.sabq.org/api/asian-cup/xg/{id}")
    suspend fun xg(@Path("id") fixtureId: Int): WcXg

    @GET("https://api.sabq.org/api/asian-cup/pressure/{id}")
    suspend fun pressure(@Path("id") fixtureId: Int): WcPressure

    @GET("https://api.sabq.org/api/asian-cup/momentum/{id}")
    suspend fun momentum(@Path("id") fixtureId: Int): WcMomentum

    @GET("https://api.sabq.org/api/asian-cup/commentary/{id}")
    suspend fun commentary(@Path("id") fixtureId: Int): WcCommentary

    @GET("https://api.sabq.org/api/asian-cup/match/{id}/tv")
    suspend fun tv(@Path("id") fixtureId: Int): WcTvListing
}

@Module
@InstallIn(SingletonComponent::class)
object AsianCupMatchCenterModule {
    @Provides
    @Singleton
    fun provideAsianCupMatchCenterApi(retrofit: Retrofit): AsianCupMatchCenterApi =
        retrofit.create(AsianCupMatchCenterApi::class.java)
}

class AsianCupMatchSource @Inject constructor(private val api: AsianCupMatchCenterApi) : MatchCenterSource {
    override val supportsLiveFollow = false
    override val supportsMatchAlerts = true
    override suspend fun match(fixtureId: Int) = api.match(fixtureId)
    override suspend fun player(playerId: Int) = api.player(playerId)
    override suspend fun matchFacts(fixtureId: Int) = api.matchFacts(fixtureId)
    override suspend fun xg(fixtureId: Int) = api.xg(fixtureId)

    /** نسب الفوز تأتي ضمن التفاصيل (prediction)؛ لا سوق احتمالات لكأس آسيا. */
    override suspend fun forecast(fixtureId: Int): WcForecast? = null
    override suspend fun pressure(fixtureId: Int) = api.pressure(fixtureId)
    override suspend fun momentum(fixtureId: Int) = api.momentum(fixtureId)
    override suspend fun commentary(fixtureId: Int) = api.commentary(fixtureId)
    override suspend fun tv(fixtureId: Int) = api.tv(fixtureId)
}

@HiltViewModel
class AsianCupMatchCenterViewModel @Inject constructor(
    source: AsianCupMatchSource,
    repo: WorldCupRepository,
    tokenStore: AuthTokenStore,
    savedStateHandle: SavedStateHandle,
) : MatchCenterViewModel(source, repo, tokenStore, savedStateHandle)

/** مركز مباراة كأس آسيا المتقدّم — الواجهة نفسها لمركز كأس العالم (كما في iOS). */
@Composable
fun AsianCupMatchCenterScreen(
    onBack: () -> Unit,
    onRequireLogin: () -> Unit,
    viewModel: AsianCupMatchCenterViewModel = hiltViewModel(),
) {
    WorldCupMatchCenterScreen(onBack = onBack, onRequireLogin = onRequireLogin, viewModel = viewModel)
}
