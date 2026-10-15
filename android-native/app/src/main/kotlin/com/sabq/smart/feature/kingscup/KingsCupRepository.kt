package com.sabq.smart.feature.kingscup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

// طبقة قراءات كأس الملك — كل النقاط عامة (لا مصادقة) على api.sabq.org.
// واجهة Retrofit خاصة بالقسم (SabqApi في data/ مجمّدة عن هذا الفرع).

interface KingsCupApi {
    @GET("api/kings-cup/overview") suspend fun overview(): KcOverview
    @GET("api/kings-cup/fixtures") suspend fun fixtures(): KcFixturesResponse
    @GET("api/kings-cup/bracket") suspend fun bracket(): KcBracket
    @GET("api/kings-cup/teams") suspend fun teams(): KcTeamsResponse
    @GET("api/kings-cup/scorers") suspend fun scorers(): KcScorersResponse
    @GET("api/kings-cup/assists") suspend fun assists(): KcLeadersResponse
    @GET("api/kings-cup/cards") suspend fun cards(): KcCards
    @GET("api/kings-cup/history") suspend fun history(): KcHistory
    @GET("api/kings-cup/record") suspend fun record(): KcRecord
    @GET("api/kings-cup/match/{id}") suspend fun match(@Path("id") id: Int): KcMatchDetail
    @GET("api/kings-cup/match/{id}/prediction") suspend fun prediction(@Path("id") id: Int): KcPredictionEnvelope
    @GET("api/kings-cup/match/{id}/player-stats") suspend fun matchRatings(@Path("id") id: Int): KcMatchRatings
    @GET("api/kings-cup/match/{id}/tv") suspend fun tv(@Path("id") id: Int): KcTvListing
    @GET("api/kings-cup/team/{id}") suspend fun teamProfile(@Path("id") id: Int): KcTeamProfile
    @GET("api/kings-cup/team/{id}") suspend fun teamExtras(@Path("id") id: Int, @Query("with") with: String = "stats"): KcTeamExtras
    @GET("api/kings-cup/team/{id}/matches") suspend fun teamMatches(@Path("id") id: Int): KcTeamMatches
    @GET("api/kings-cup/squad/{teamId}") suspend fun squad(@Path("teamId") teamId: Int): KcSquad
    @GET("api/kings-cup/player/{id}") suspend fun player(@Path("id") id: Int): KcPlayerCard
    @GET("api/kings-cup/player/{id}") suspend fun playerExtras(@Path("id") id: Int, @Query("with") with: String = "extras"): KcPlayerExtras
    @GET("api/kings-cup/player/{id}/form") suspend fun playerForm(@Path("id") id: Int): KcPlayerForm
    @GET("api/kings-cup/player/{id}/market") suspend fun playerMarket(@Path("id") id: Int): KcPlayerMarket
}

@Module
@InstallIn(SingletonComponent::class)
object KingsCupNetworkModule {
    @Provides
    @Singleton
    fun provideKingsCupApi(retrofit: Retrofit): KingsCupApi = retrofit.create(KingsCupApi::class.java)
}

/**
 * نقاط الرياضة قد تعيد 5xx لثوانٍ بينما يسخن SWR على الخادم — [retryOnce]
 * يمنح أندرويد سلوك iOS `kcRetrying`: محاولة مؤجلة بدل فشل دائم.
 */
@Singleton
class KingsCupRepository @Inject constructor(private val api: KingsCupApi) {
    suspend fun overview() = retryOnce { api.overview() }
    suspend fun fixtures() = retryOnce { api.fixtures() }.fixtures
    suspend fun bracket() = retryOnce { api.bracket() }
    suspend fun teams() = retryOnce { api.teams() }.teams
    suspend fun scorers() = retryOnce { api.scorers() }.scorers
    suspend fun assists() = retryOnce { api.assists() }.leaders
    suspend fun cards() = retryOnce { api.cards() }
    suspend fun history() = retryOnce { api.history() }
    suspend fun record() = retryOnce { api.record() }
    suspend fun match(id: Int) = retryOnce { api.match(id) }
    suspend fun prediction(id: Int) = retryOnce { api.prediction(id) }.prediction
    suspend fun matchRatings(id: Int) = retryOnce { api.matchRatings(id) }
    suspend fun tv(id: Int) = retryOnce { api.tv(id) }
    suspend fun teamProfile(id: Int) = api.teamProfile(id)
    suspend fun teamExtras(id: Int) = retryOnce { api.teamExtras(id) }
    suspend fun teamMatches(id: Int) = retryOnce { api.teamMatches(id) }
    suspend fun player(id: Int) = retryOnce { api.player(id) }
    suspend fun playerExtras(id: Int) = retryOnce { api.playerExtras(id) }
    suspend fun playerForm(id: Int) = retryOnce { api.playerForm(id) }
    suspend fun playerMarket(id: Int) = retryOnce { api.playerMarket(id) }

    private suspend fun <T> retryOnce(block: suspend () -> T): T = try {
        block()
    } catch (e: Exception) {
        if (e is CancellationException || !isRetryable(e)) throw e
        delay(1_500)
        block()
    }

    private fun isRetryable(e: Exception): Boolean = when (e) {
        is HttpException -> e.code() == 429 || e.code() in 502..504
        is IOException -> true
        else -> false
    }
}

/**
 * مخزن نظرة كأس الملك المشترك — مرآة iOS `KingsCupHomeStore`: آخر نظرة تبقى
 * حيّة بين شريط الرئيسية وبقية الأسطح، بنضارة 30 ثانية.
 */
@Singleton
class KingsCupHomeStore @Inject constructor(private val repo: KingsCupRepository) {
    private val _overview = MutableStateFlow<KcOverview?>(null)
    val overview: StateFlow<KcOverview?> = _overview.asStateFlow()
    private var lastFetch = 0L
    private var fetching = false

    suspend fun loadIfNeeded() {
        if (fetching) return
        if (_overview.value != null && System.currentTimeMillis() - lastFetch < 30_000) return
        fetching = true
        try {
            runCatching { repo.overview() }.getOrNull()?.let {
                _overview.value = it
                lastFetch = System.currentTimeMillis()
            }
        } finally {
            fetching = false
        }
    }

    suspend fun refreshLive() {
        if (fetching) return
        fetching = true
        try {
            runCatching { repo.overview() }.getOrNull()?.let {
                _overview.value = it
                lastFetch = System.currentTimeMillis()
            }
        } finally {
            fetching = false
        }
    }

    val anyLive: Boolean
        get() {
            val ov = _overview.value ?: return false
            if (ov.live.any { it.status.live }) return true
            if ((ov.matchday?.liveCount ?: 0) > 0) return true
            return ov.nextMatch?.status?.live == true
        }

    /** أقرب انطلاقة قادمة — من يوم الجولة أو المباراة القادمة. */
    val nextKickoffTimestamp: Int?
        get() {
            val ov = _overview.value ?: return null
            ov.matchday?.nextKickoffTs?.let { return it }
            ov.nextMatch?.takeIf { !it.status.live && !it.status.finished }?.let { return it.timestamp }
            return null
        }
}

/**
 * شريط الرئيسية: استطلاع متدرّج يطابق iOS `KingsCupHomeStrip.task`:
 * 15ث أثناء اللعب، 20ث حول الصافرة (≤600ث)، 60ث خفيفة بعيدًا عنها،
 * وتوقف كامل بعد ربع ساعة من آخر انطلاقة أو بلا موعد.
 */
@HiltViewModel
class KingsCupStripViewModel @Inject constructor(private val store: KingsCupHomeStore) : ViewModel() {
    val overview: StateFlow<KcOverview?> = store.overview

    init {
        viewModelScope.launch {
            store.loadIfNeeded()
            while (isActive) {
                val interval: Long
                var lightRefresh = false
                val kickoff = store.nextKickoffTimestamp
                if (store.anyLive) {
                    interval = 15_000
                } else if (kickoff != null) {
                    val untilKickoff = kickoff.toLong() - System.currentTimeMillis() / 1000L
                    when {
                        untilKickoff <= -900 -> return@launch
                        untilKickoff <= 600 -> interval = 20_000
                        else -> { interval = 60_000; lightRefresh = true }
                    }
                } else {
                    return@launch
                }
                delay(interval)
                if (lightRefresh) store.loadIfNeeded() else store.refreshLive()
            }
        }
    }
}

/**
 * مركز البطولة — يطابق iOS `KingsCupView`: أقسام مستقلة الفشل، ونبضة 8 ثوانٍ:
 * تحديث كامل مع أي مباراة حية، وتحديث خفيف (overview+fixtures) كل ثالث نبضة
 * (~24ث) عندما تكون الصافرة في نافذة (-600ث..+900ث).
 */
@HiltViewModel
class KingsCupHubViewModel @Inject constructor(
    private val repo: KingsCupRepository,
    private val store: KingsCupHomeStore,
) : ViewModel() {
    data class State(
        val overview: KcOverview? = null,
        val fixtures: List<KcFixture> = emptyList(),
        val bracket: KcBracket? = null,
        val teams: List<KcTeam> = emptyList(),
        val scorers: List<KcScorer> = emptyList(),
        val assists: List<KcLeader> = emptyList(),
        val cards: KcCards? = null,
        val history: KcHistory? = null,
        val record: KcRecord? = null,
        val overviewLoading: Boolean = true,
        val fixturesLoading: Boolean = true,
        val bracketLoading: Boolean = true,
        val racesLoading: Boolean = true,
        val refreshing: Boolean = false,
    ) {
        val anyLive: Boolean
            get() = (overview?.live?.any { it.status.live } == true) || fixtures.any { it.status.live }
        val started: Boolean get() = fixtures.any { it.started }
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            loadAll()
            var tick = 0
            while (isActive) {
                delay(8_000)
                tick++
                val s = _state.value
                if (s.anyLive) {
                    loadAll(force = true)
                } else if (isKickoffImminent(s) && tick % 3 == 0) {
                    coroutineScope {
                        launch { loadOverview() }
                        launch { loadFixtures() }
                    }
                }
            }
        }
    }

    private fun isKickoffImminent(s: State): Boolean {
        val now = System.currentTimeMillis() / 1000L
        return s.fixtures.any {
            !it.status.live && !it.status.finished && it.timestamp - now <= 600 && now - it.timestamp <= 900
        }
    }

    fun refresh() = viewModelScope.launch {
        _state.update { it.copy(refreshing = true) }
        loadAll(force = true)
        _state.update { it.copy(refreshing = false) }
    }

    private suspend fun loadAll(force: Boolean = false) = coroutineScope {
        launch { loadOverview() }
        launch { loadFixtures() }
        launch { loadBracket() }
        launch { loadRaces() }
        launch { runCatching { repo.teams() }.getOrNull()?.let { t -> _state.update { it.copy(teams = t) } } }
        launch { runCatching { repo.history() }.getOrNull()?.let { h -> _state.update { it.copy(history = h) } } }
        launch { runCatching { repo.record() }.getOrNull()?.let { r -> _state.update { it.copy(record = r) } } }
    }

    private suspend fun loadOverview() {
        val r = runCatching { repo.overview() }.getOrNull()
        _state.update { it.copy(overview = r ?: it.overview, overviewLoading = false) }
        if (r != null) store.loadIfNeeded()
    }

    private suspend fun loadFixtures() {
        val r = runCatching { repo.fixtures() }.getOrNull()
        _state.update { it.copy(fixtures = r ?: it.fixtures, fixturesLoading = false) }
    }

    private suspend fun loadBracket() {
        val r = runCatching { repo.bracket() }.getOrNull()
        _state.update { it.copy(bracket = r ?: it.bracket, bracketLoading = false) }
    }

    private suspend fun loadRaces() = coroutineScope {
        val s = async { runCatching { repo.scorers() }.getOrNull() }
        val a = async { runCatching { repo.assists() }.getOrNull() }
        val c = async { runCatching { repo.cards() }.getOrNull() }
        val (rs, ra, rc) = Triple(s.await(), a.await(), c.await())
        _state.update {
            it.copy(
                scorers = rs ?: it.scorers,
                assists = ra ?: it.assists,
                cards = rc ?: it.cards,
                racesLoading = false,
            )
        }
    }

    /** بذر مركز المباراة من أي قائمة محمّلة — يفتح الترويسة فورًا. */
    fun seedFixture(id: Int): KcFixture? {
        val s = _state.value
        s.fixtures.firstOrNull { it.id == id }?.let { return it }
        val ov = s.overview ?: return null
        (ov.live + ov.today).firstOrNull { it.id == id }?.let { return it }
        if (ov.nextMatch?.id == id) return ov.nextMatch
        if (ov.matchOfTheDay?.fixture?.id == id) return ov.matchOfTheDay.fixture
        return null
    }
}

/**
 * مركز المباراة — نبض 8 ثوانٍ أثناء اللعب و16ث حول الصافرة (نافذة
 * -600..+900)، تقييمات بجلبة أولى + 60ث أثناء البث، وتوقّع + قنوات one-shot.
 */
@HiltViewModel
class KcMatchViewModel @Inject constructor(private val repo: KingsCupRepository) : ViewModel() {
    data class State(
        val loading: Boolean = true,
        val detail: KcMatchDetail? = null,
        val error: String? = null,
        val prediction: KcPrediction? = null,
        val channels: List<KcTvChannel> = emptyList(),
        val ratings: KcMatchRatings? = null,
        val ratingsLoaded: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var pulseJob: Job? = null
    private var sideJob: Job? = null

    fun load(fixtureId: Int, seed: KcFixture?) {
        pulseJob?.cancel()
        sideJob?.cancel()
        // البذرة ترسم الترويسة فورًا قبل وصول التفاصيل (نمط iOS seed).
        if (seed != null && _state.value.detail == null) {
            _state.update { it.copy(detail = KcMatchDetail(fixture = seed)) }
        }
        pulseJob = viewModelScope.launch {
            refreshDetail(fixtureId, initial = true)
            while (isActive) {
                val f = _state.value.detail?.fixture ?: break
                if (f.status.finished) break
                val untilKickoff = f.timestamp.toLong() - System.currentTimeMillis() / 1000L
                val interval: Long = when {
                    f.status.live -> 8_000
                    untilKickoff <= 600 && untilKickoff >= -900 -> 16_000
                    else -> 60_000
                }
                delay(interval)
                refreshDetail(fixtureId, initial = false)
            }
        }
        sideJob = viewModelScope.launch {
            coroutineScope {
                launch {
                    val f = _state.value.detail?.fixture
                    if (f?.status?.finished != true) {
                        runCatching { repo.prediction(fixtureId) }.getOrNull()?.let { p ->
                            _state.update { it.copy(prediction = p) }
                        }
                    }
                }
                launch {
                    runCatching { repo.tv(fixtureId) }.getOrNull()?.takeIf { it.available }?.let { t ->
                        _state.update { it.copy(channels = t.channels) }
                    }
                }
                launch {
                    loadRatings(fixtureId)
                    while (isActive && _state.value.detail?.fixture?.status?.live == true) {
                        delay(60_000)
                        loadRatings(fixtureId)
                    }
                }
            }
        }
    }

    private suspend fun refreshDetail(fixtureId: Int, initial: Boolean) {
        runCatching { repo.match(fixtureId) }
            .onSuccess { d -> _state.update { it.copy(loading = false, detail = d, error = null) } }
            .onFailure { e ->
                if (e is CancellationException) throw e
                if (initial) _state.update { it.copy(loading = false, error = "تعذر جلب تفاصيل المباراة") }
            }
    }

    private suspend fun loadRatings(fixtureId: Int) {
        runCatching { repo.matchRatings(fixtureId) }.getOrNull()?.let { r ->
            _state.update { it.copy(ratings = r, ratingsLoaded = true) }
        } ?: _state.update { it.copy(ratingsLoaded = true) }
    }

    fun retry(fixtureId: Int) {
        _state.update { it.copy(loading = true, error = null) }
        load(fixtureId, _state.value.detail?.fixture)
    }
}

/** صفحة النادي — الأساس أولًا (بمحاولة ثانية بعد 1.5ث)، ثم الإثراء بالتوازي بلا حجب. */
@HiltViewModel
class KcTeamViewModel @Inject constructor(private val repo: KingsCupRepository) : ViewModel() {
    data class State(
        val loading: Boolean = true,
        val profile: KcTeamProfile? = null,
        val extras: KcTeamExtras? = null,
        val matches: KcTeamMatches? = null,
        val record: KcRecord? = null,
        val error: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    fun load(teamId: Int) = viewModelScope.launch {
        _state.update { it.copy(loading = true, error = null) }
        coroutineScope {
            val extras = async { runCatching { repo.teamExtras(teamId) }.getOrNull() }
            val matches = async { runCatching { repo.teamMatches(teamId) }.getOrNull() }
            val record = async { runCatching { repo.record() }.getOrNull() }

            var base = runCatching { repo.teamProfile(teamId) }.getOrNull()
            if (base == null) {
                delay(1_500)
                base = runCatching { repo.teamProfile(teamId) }.getOrNull()
            }
            _state.update {
                it.copy(
                    loading = false, profile = base,
                    error = if (base == null) "تحقق من الاتصال ثم أعد المحاولة" else null,
                )
            }
            val (x, m, r) = Triple(extras.await(), matches.await(), record.await())
            _state.update { it.copy(extras = x, matches = m, record = r) }
        }
    }
}

/** بطاقة اللاعب — الأساس أولًا ثم الفورمة والقيمة السوقية والإثراء بالتوازي. */
@HiltViewModel
class KcPlayerViewModel @Inject constructor(private val repo: KingsCupRepository) : ViewModel() {
    data class State(
        val loading: Boolean = true,
        val player: KcPlayerCard? = null,
        val extras: KcPlayerExtras? = null,
        val form: KcPlayerForm? = null,
        val market: KcPlayerMarket? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    fun load(playerId: Int) = viewModelScope.launch {
        _state.value = State()
        val base = runCatching { repo.player(playerId) }.getOrNull()
        _state.update { it.copy(loading = false, player = base) }
        if (base == null) return@launch
        coroutineScope {
            val x = async { runCatching { repo.playerExtras(playerId) }.getOrNull() }
            val f = async { runCatching { repo.playerForm(playerId) }.getOrNull() }
            val m = async { runCatching { repo.playerMarket(playerId) }.getOrNull() }
            val (xr, fr, mr) = Triple(x.await(), f.await(), m.await())
            _state.update { it.copy(extras = xr, form = fr, market = mr) }
        }
    }
}
