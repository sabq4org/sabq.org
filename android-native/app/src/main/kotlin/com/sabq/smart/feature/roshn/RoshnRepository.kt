package com.sabq.smart.feature.roshn

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.api.SabqApi
import dagger.hilt.android.lifecycle.HiltViewModel
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

/**
 * قراءات روشن — كل النقاط عامة (لا مصادقة) على `api.sabq.org` مباشرة.
 * نقاط الرياضة قد تعيد 503 لثوانٍ بينما يكمل الخادم تسخين SWR في الخلفية؛
 * [retryOnce] يمنح أندرويد نفس سلوك iOS (`roshnGet`): محاولة واحدة مؤجلة
 * ثانيتين بدل تحويل الاستجابة المؤقتة إلى فشل دائم.
 */
@Singleton
class RoshnRepository @Inject constructor(private val api: SabqApi) {
    suspend fun hero() = retryOnce { api.getRoshnHero() }
    suspend fun matches() = retryOnce { api.getRoshnMatches() }
    suspend fun rounds() = retryOnce { api.getRoshnRounds() }
    suspend fun roundFixtures(key: String) = retryOnce { api.getRoshnRoundFixtures(key) }.fixtures
    suspend fun standings() = retryOnce { api.getRoshnStandings() }.standings
    suspend fun scorers(season: Int?) = retryOnce { api.getRoshnScorers(season) }.scorers
    suspend fun assists(season: Int?) = retryOnce { api.getRoshnAssists(season) }.assists
    suspend fun cards(season: Int?) = retryOnce { api.getRoshnCards(season) }
    suspend fun match(id: Int) = retryOnce { api.getRoshnMatch(id) }
    suspend fun matchRatings(id: Int) = retryOnce { api.getRoshnMatchRatings(id) }
    suspend fun teamProfile(id: Int) = retryOnce { api.getRoshnTeamProfile(id) }

    private suspend fun <T> retryOnce(block: suspend () -> T): T = try {
        block()
    } catch (e: Exception) {
        if (e is CancellationException || !isRetryable(e)) throw e
        delay(2_000)
        block()
    }

    private fun isRetryable(e: Exception): Boolean = when (e) {
        is HttpException -> e.code() == 429 || e.code() in 502..504
        is IOException -> true
        else -> false
    }
}

/**
 * مخزن نظرة دوري روشن المشترك — يطابق iOS `RoshnHomeStore`: آخر hero يبقى
 * حيًّا بين شريط الرئيسية ومركز الدوري، بنضارة 30 ثانية، وفشل الجلبة
 * الأولى يعاد مرة واحدة بعد ثانيتين حتى لا يختفي البانر حتى إعادة التشغيل.
 */
@Singleton
class RoshnHeroStore @Inject constructor(private val repo: RoshnRepository) {
    private val _hero = MutableStateFlow<RsHero?>(null)
    val hero: StateFlow<RsHero?> = _hero.asStateFlow()
    private var lastFetch = 0L
    private var fetching = false

    suspend fun loadIfNeeded() {
        if (fetching) return
        if (_hero.value != null && System.currentTimeMillis() - lastFetch < 30_000) return
        fetching = true
        try {
            val result = runCatching { repo.hero() }.getOrNull()
            if (result != null) {
                _hero.value = result
                lastFetch = System.currentTimeMillis()
            } else if (_hero.value == null) {
                delay(2_000)
                runCatching { repo.hero() }.getOrNull()?.let {
                    _hero.value = it
                    lastFetch = System.currentTimeMillis()
                }
            }
        } finally {
            fetching = false
        }
    }

    suspend fun refreshLive() {
        if (fetching) return
        fetching = true
        try {
            runCatching { repo.hero() }.getOrNull()?.let {
                _hero.value = it
                lastFetch = System.currentTimeMillis()
            }
        } finally {
            fetching = false
        }
    }

    val anyLive: Boolean
        get() {
            val h = _hero.value ?: return false
            if (h.live.any { it.status.live }) return true
            if ((h.matchday?.liveCount ?: 0) > 0) return true
            return h.nextMatch?.status?.live == true
        }

    /** أقرب انطلاقة قادمة — من يوم الجولة أو المباراة القادمة أو انطلاقة الموسم. */
    val nextKickoffTimestamp: Int?
        get() {
            val h = _hero.value ?: return null
            h.matchday?.nextKickoffTs?.let { return it }
            h.nextMatch?.takeIf { !it.status.live && !it.status.finished }?.let { return it.timestamp }
            if (h.preSeason) return h.outlook.firstKickoffTs
            return null
        }
}

/**
 * شريط الرئيسية: تحميل انتهازي + استطلاع متدرّج يطابق iOS
 * `RoshnHomeStrip.task`: 15ث أثناء اللعب، 20ث حول الصافرة، 60ث خفيفة
 * بعيدًا عنها، وتوقف كامل بعد ربع ساعة من آخر انطلاقة أو بلا موعد.
 */
@HiltViewModel
class RoshnStripViewModel @Inject constructor(private val store: RoshnHeroStore) : ViewModel() {
    val hero: StateFlow<RsHero?> = store.hero

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
 * مركز الدوري — يطابق iOS `RoshnHubStore`: أقسام مستقلة الفشل (مباريات/
 * ترتيب/سباقات)، سباقات بحارس أرشيف الموسم الماضي، ومتصفّح جولات كسول
 * لا يُطلب إلا عند أول فتح لتبويب «الجدول».
 */
@HiltViewModel
class RoshnHubViewModel @Inject constructor(
    private val repo: RoshnRepository,
    private val store: RoshnHeroStore,
) : ViewModel() {
    enum class Tab { MATCHES, STANDINGS, RACES, SCHEDULE }

    data class State(
        val tab: Tab = Tab.MATCHES,
        val buckets: RsMatchBuckets? = null,
        val standings: List<RsStandingRow> = emptyList(),
        val scorers: List<RsScorer> = emptyList(),
        val assists: List<RsLeader> = emptyList(),
        val cards: RsCards? = null,
        /** لوحات معروضة من أرشيف الموسم الماضي (قبل انطلاق الجديد). */
        val racesFromArchive: Boolean = false,
        val loadingMatches: Boolean = false,
        val loadingStandings: Boolean = false,
        val loadingRaces: Boolean = false,
        val refreshing: Boolean = false,
        val matchesError: String? = null,
        val standingsError: String? = null,
        val racesError: String? = null,
        // متصفّح الجولات (تبويب «الجدول»)
        val rounds: List<RsRound> = emptyList(),
        val currentRoundKey: String? = null,
        val selectedRoundKey: String? = null,
        val roundFixtures: List<RsFixture> = emptyList(),
        val loadingSchedule: Boolean = false,
        val loadingRound: Boolean = false,
        val scheduleError: String? = null,
        val didLoadSchedule: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    val hero: StateFlow<RsHero?> = store.hero

    init {
        viewModelScope.launch {
            store.loadIfNeeded()
            coroutineScope {
                launch { loadMatches() }
                launch { loadStandings() }
                launch { loadRaces() }
            }
        }
    }

    fun select(tab: Tab) {
        _state.update { it.copy(tab = tab) }
        // متصفّح الجولات كسل: لا يُطلب إلا عند فتح تبويب «الجدول» أول مرة.
        if (tab == Tab.SCHEDULE && !_state.value.didLoadSchedule) {
            viewModelScope.launch { loadSchedule() }
        }
    }

    fun refresh() = viewModelScope.launch {
        _state.update { it.copy(refreshing = true) }
        store.refreshLive()
        coroutineScope {
            launch { loadMatches(force = true) }
            launch { loadStandings(force = true) }
            launch { loadRaces(force = true) }
            if (_state.value.didLoadSchedule) launch { loadSchedule(force = true) }
        }
        _state.update { it.copy(refreshing = false) }
    }

    suspend fun loadMatches(force: Boolean = false) {
        if (_state.value.loadingMatches) return
        _state.update { it.copy(loadingMatches = true) }
        runCatching { repo.matches() }
            .onSuccess { b -> _state.update { it.copy(buckets = b, matchesError = null, loadingMatches = false) } }
            .onFailure { e ->
                if (e is CancellationException) throw e
                _state.update { it.copy(matchesError = FALLBACK_ERROR, loadingMatches = false) }
            }
    }

    suspend fun loadStandings(force: Boolean = false) {
        if (_state.value.loadingStandings) return
        _state.update { it.copy(loadingStandings = true) }
        runCatching { repo.standings() }
            .onSuccess { rows -> _state.update { it.copy(standings = rows, standingsError = null, loadingStandings = false) } }
            .onFailure { e ->
                if (e is CancellationException) throw e
                _state.update { it.copy(standingsError = FALLBACK_ERROR, loadingStandings = false) }
            }
    }

    /**
     * السباقات بحارس الأرشيف: الموسم الحالي أولًا، وإن كنا قبل الموسم نعرض
     * لوحات الموسم الماضي موسومة (نفس منطق الويب وiOS حرفيًا). الطلبات
     * الثلاثة مستقلة: فشل الهدافين المؤقت لا يخفي الصناعة والبطاقات.
     */
    suspend fun loadRaces(force: Boolean = false) {
        if (_state.value.loadingRaces) return
        _state.update { it.copy(loadingRaces = true) }

        val hero = store.hero.value
        val archiveSeason: Int? = hero?.takeIf { !it.inSeason }?.let {
            it.lastSeason?.previousSeason ?: it.outlook.nextSeason?.minus(1)
        }

        coroutineScope {
            val scorersResult = async { runCatching { repo.scorers(archiveSeason) }.getOrNull() }
            val assistsResult = async { runCatching { repo.assists(archiveSeason) }.getOrNull() }
            val cardsResult = async { runCatching { repo.cards(archiveSeason) }.getOrNull() }
            val (newScorers, newAssists, newCards) = Triple(scorersResult.await(), assistsResult.await(), cardsResult.await())

            val failures = listOf(newScorers == null, newAssists == null, newCards == null).count { it }
            _state.update {
                it.copy(
                    scorers = newScorers ?: it.scorers,
                    assists = newAssists ?: it.assists,
                    cards = newCards ?: it.cards,
                    racesFromArchive = archiveSeason != null,
                    loadingRaces = false,
                    racesError = when (failures) {
                        0 -> null
                        3 -> "تعذّر تحميل لوحات الموسم. أعد المحاولة بعد لحظات."
                        else -> "اكتملت بعض اللوحات فقط؛ سنعيد تحميل البقية عند المحاولة."
                    },
                )
            }
        }
    }

    fun retryRaces() = viewModelScope.launch { loadRaces(force = true) }
    fun retryMatches() = viewModelScope.launch { loadMatches(force = true) }
    fun retryStandings() = viewModelScope.launch { loadStandings(force = true) }
    fun retrySchedule() = viewModelScope.launch { loadSchedule(force = true) }

    /** قائمة الجولات + الحالية، ثم مباريات الجولة المختارة — مع إبقاء آخر اختيار. */
    suspend fun loadSchedule(force: Boolean = false) {
        val s = _state.value
        if (s.loadingSchedule) return
        if (s.didLoadSchedule && !force) return
        _state.update { it.copy(loadingSchedule = true) }
        runCatching { repo.rounds() }
            .onSuccess { res ->
                _state.update { st ->
                    val selected = st.selectedRoundKey?.takeIf { key -> res.rounds.any { it.key == key } }
                        ?: res.current ?: res.rounds.firstOrNull()?.key
                    st.copy(
                        rounds = res.rounds, currentRoundKey = res.current, selectedRoundKey = selected,
                        didLoadSchedule = true, scheduleError = null, loadingSchedule = false,
                    )
                }
                _state.value.selectedRoundKey?.let { loadRoundFixtures(it, force) }
            }
            .onFailure { e ->
                if (e is CancellationException) throw e
                _state.update { it.copy(scheduleError = FALLBACK_ERROR, loadingSchedule = false) }
            }
    }

    fun selectRound(key: String) {
        val s = _state.value
        if (key == s.selectedRoundKey || s.loadingRound) return
        _state.update { it.copy(selectedRoundKey = key) }
        viewModelScope.launch { loadRoundFixtures(key) }
    }

    suspend fun loadRoundFixtures(key: String, force: Boolean = false) {
        if (_state.value.loadingRound) return
        _state.update { it.copy(loadingRound = true) }
        runCatching { repo.roundFixtures(key) }
            .onSuccess { fixtures -> _state.update { it.copy(roundFixtures = fixtures, scheduleError = null, loadingRound = false) } }
            .onFailure { e ->
                if (e is CancellationException) throw e
                _state.update { it.copy(scheduleError = FALLBACK_ERROR, loadingRound = false) }
            }
    }

    fun retryRound() {
        _state.value.selectedRoundKey?.let { key -> viewModelScope.launch { loadRoundFixtures(key, force = true) } }
    }

    private companion object {
        const val FALLBACK_ERROR = "تعذّر الاتصال بمصدر البيانات حاليًا"
    }
}

/**
 * مركز المباراة — يطابق نبض iOS `RoshnMatchCenter.task`: 8 ثوانٍ أثناء
 * اللعب (وتيرة المونديال)، 25ث حول الصافرة، 60ث بعيدًا، وتوقف عند النهاية.
 * التقييمات تُطلب كسلًا عند أول فتح لتبويبها.
 */
@HiltViewModel
class RoshnMatchViewModel @Inject constructor(private val repo: RoshnRepository) : ViewModel() {
    data class State(
        val loading: Boolean = true,
        val detail: RsMatchDetail? = null,
        val error: String? = null,
        val ratings: RsMatchRatings? = null,
        val ratingsRequested: Boolean = false,
        val ratingsError: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var pulseJob: Job? = null

    fun load(fixtureId: Int) {
        pulseJob?.cancel()
        pulseJob = viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            runCatching { repo.match(fixtureId) }
                .onSuccess { d -> _state.update { it.copy(loading = false, detail = d, error = null) } }
                .onFailure { e ->
                    if (e is CancellationException) throw e
                    _state.update { it.copy(loading = false, error = "تعذّر الاتصال بمصدر المباراة") }
                    return@launch
                }
            // نبض لحظي أثناء اللعب — 8 ثوانٍ (وتيرة مركز المونديال).
            while (isActive) {
                val d = _state.value.detail ?: return@launch
                if (d.fixture.status.finished) return@launch
                val untilKickoff = d.fixture.timestamp.toLong() - System.currentTimeMillis() / 1000L
                val interval: Long = when {
                    d.fixture.status.live -> 8_000
                    untilKickoff <= 1800 && untilKickoff > -7200 -> 25_000
                    else -> 60_000
                }
                delay(interval)
                runCatching { repo.match(fixtureId) }.getOrNull()?.let { fresh ->
                    _state.update { it.copy(detail = fresh) }
                }
            }
        }
    }

    fun requestRatings(fixtureId: Int, force: Boolean = false) {
        if (_state.value.ratingsRequested && !force) return
        _state.update { it.copy(ratingsRequested = true, ratingsError = null) }
        viewModelScope.launch {
            runCatching { repo.matchRatings(fixtureId) }
                .onSuccess { r -> _state.update { it.copy(ratings = r, ratingsError = null) } }
                .onFailure { e ->
                    if (e is CancellationException) throw e
                    _state.update { it.copy(ratingsError = "تعذّر تحميل تقييمات اللاعبين") }
                }
        }
    }
}

/** صفحة النادي — نداء واحد متكامل `/api/sports/team/:id?with=stats`. */
@HiltViewModel
class RoshnTeamViewModel @Inject constructor(private val repo: RoshnRepository) : ViewModel() {
    data class State(val loading: Boolean = true, val profile: RsTeamProfile? = null, val error: String? = null)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    fun load(teamId: Int) = viewModelScope.launch {
        _state.update { it.copy(loading = true, error = null) }
        runCatching { repo.teamProfile(teamId) }
            .onSuccess { p -> _state.update { State(loading = false, profile = p) } }
            .onFailure { e ->
                if (e is CancellationException) throw e
                _state.update { it.copy(loading = false, error = "تحقق من الاتصال ثم أعد المحاولة") }
            }
    }
}
