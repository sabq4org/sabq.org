package com.sabq.smart.feature.gulfcup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.User
import com.sabq.smart.data.push.DeviceRegistrationManager
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.HttpException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime

@HiltViewModel
class GcPredictionsViewModel @Inject constructor(
    private val repo: GulfCupRepository,
    private val authRepository: AuthRepository,
    private val localStore: GcMajlisLocalStore,
    private val deviceRegistrationManager: DeviceRegistrationManager,
    private val json: Json,
) : ViewModel() {

    enum class Segment { MATCHES, LEADERBOARD, MAJLIS, FANTASY, LONG, MINE }
    enum class DetailSection { MATCHDAY, RANKING, FANTASY, CHAMPION, DUELS, HARVEST }
    data class ScoreInput(val home: Int = 0, val away: Int = 0)

    data class UiState(
        val user: User? = null,
        val segment: Segment = Segment.MATCHES,
        val loading: Boolean = true,
        val error: String? = null,
        val today: GcPredictionsTodayResponse? = null,
        val leaders: List<GcPredictionLeader> = emptyList(),
        val mine: List<GcMyPredictionRow> = emptyList(),
        val long: GcLongData? = null,
        val fantasyLeaders: List<GcFantasyLeader> = emptyList(),
        val scoreInputs: Map<Int, ScoreInput> = emptyMap(),
        val submittingFixtureIds: Set<Int> = emptySet(),
        val toast: String? = null,

        val majalis: List<GcMajlisSummary> = emptyList(),
        val majalisLoading: Boolean = false,
        val majalisLoaded: Boolean = false,
        val majalisError: String? = null,
        val notificationEnabled: Boolean = false,
        val preferenceLoading: Boolean = false,
        val invitePreview: GcMajlisInvitePreview? = null,
        val inviteLoading: Boolean = false,
        val pendingTarget: GcMajlisLocalStore.Target? = null,
        val mutationInFlight: Boolean = false,
        val mutationError: String? = null,
        val notice: String? = null,
        val onboardingMajlis: GcMajlisSummary? = null,

        val selectedMajlis: GcMajlisSummary? = null,
        val detailSection: DetailSection = DetailSection.MATCHDAY,
        val detailLoading: Boolean = false,
        val detailError: String? = null,
        val board: GcMajlisBoard? = null,
        val matchday: GcMajlisMatchdayResponse? = null,
        val majlisFantasy: GcMajlisFantasyResponse? = null,
        val championPicks: GcMajlisChampionPicksResponse? = null,
        val duels: GcMajlisDuelsResponse? = null,
        val harvest: GcMajlisHarvestResponse? = null,
        val highlightedFixtureId: Int? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            authRepository.user.collectLatest { user ->
                _state.update { it.copy(user = user) }
                if (user != null) {
                    loadMajalis(force = true)
                    loadPreference()
                    runCatching { deviceRegistrationManager.syncGulfCupToken() }
                } else {
                    _state.update {
                        it.copy(
                            majalis = emptyList(),
                            mine = emptyList(),
                            selectedMajlis = null,
                            onboardingMajlis = null,
                        )
                    }
                }
            }
        }
        viewModelScope.launch {
            localStore.target.collectLatest { target ->
                _state.update { it.copy(pendingTarget = target) }
                if (target != null) {
                    _state.update { it.copy(segment = Segment.MAJLIS) }
                    when (target) {
                        is GcMajlisLocalStore.Target.Invite -> loadInvitePreview(target.code)
                        is GcMajlisLocalStore.Target.Majlis -> resolvePendingMajlis(target)
                    }
                }
            }
        }
    }

    fun selectSegment(segment: Segment) {
        _state.update { it.copy(segment = segment, error = null) }
        when (segment) {
            Segment.MATCHES -> Unit
            Segment.LEADERBOARD -> Unit
            Segment.MAJLIS -> if (_state.value.user != null) loadMajalis()
            Segment.FANTASY -> loadFantasyLeaderboard()
            Segment.LONG -> Unit
            Segment.MINE -> Unit
        }
    }

    fun loadCore() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            val today = async { runCatching { repo.predictionsToday() } }
            val leaders = async { runCatching { repo.predictionsLeaderboard() } }
            val long = async { runCatching { repo.longPredictions() } }
            val todayResult = today.await()
            val leadersResult = leaders.await()
            val longResult = long.await()
            val todayData = todayResult.getOrNull()
            _state.update {
                it.copy(
                    loading = false,
                    today = todayData,
                    leaders = leadersResult.getOrDefault(it.leaders),
                    long = longResult.getOrNull() ?: it.long,
                    scoreInputs = seedInputs(todayData),
                    error = todayResult.exceptionOrNull()?.let(::message),
                )
            }
        }
    }

    fun loadToday() {
        viewModelScope.launch {
            val result = runCatching { repo.predictionsToday() }
            _state.update {
                val data = result.getOrNull()
                it.copy(today = data ?: it.today, scoreInputs = seedInputs(data ?: it.today), error = result.exceptionOrNull()?.let(::message))
            }
        }
    }

    fun loadLeaderboard() = viewModelScope.launch {
        val result = runCatching { repo.predictionsLeaderboard() }
        _state.update { it.copy(leaders = result.getOrDefault(it.leaders), error = result.exceptionOrNull()?.let(::message)) }
    }

    fun loadMine() = viewModelScope.launch {
        val result = runCatching { repo.myPredictions() }
        _state.update { it.copy(mine = result.getOrDefault(it.mine), error = result.exceptionOrNull()?.let(::message)) }
    }

    fun loadLong() = viewModelScope.launch {
        val result = runCatching { repo.longPredictions() }
        _state.update { it.copy(long = result.getOrNull() ?: it.long, error = result.exceptionOrNull()?.let(::message)) }
    }

    fun loadFantasyLeaderboard() = viewModelScope.launch {
        val result = runCatching { repo.fantasyLeaderboard() }
        _state.update { it.copy(fantasyLeaders = result.getOrDefault(it.fantasyLeaders), error = result.exceptionOrNull()?.let(::message)) }
    }

    fun setScore(fixtureId: Int, home: Int? = null, away: Int? = null) {
        _state.update { state ->
            val old = state.scoreInputs[fixtureId] ?: ScoreInput()
            val next = old.copy(
                home = home?.coerceIn(0, 9) ?: old.home,
                away = away?.coerceIn(0, 9) ?: old.away,
            )
            state.copy(scoreInputs = state.scoreInputs + (fixtureId to next))
        }
    }

    fun submitPrediction(fixtureId: Int) {
        val input = _state.value.scoreInputs[fixtureId] ?: return
        if (_state.value.user == null) return
        _state.update { it.copy(submittingFixtureIds = it.submittingFixtureIds + fixtureId, error = null) }
        viewModelScope.launch {
            val result = runCatching { repo.submitPrediction(fixtureId, input.home, input.away) }
            _state.update {
                it.copy(
                    submittingFixtureIds = it.submittingFixtureIds - fixtureId,
                    toast = if (result.isSuccess) "حُفظ توقّعك بنجاح" else null,
                    error = result.exceptionOrNull()?.let(::message),
                )
            }
            if (result.isSuccess) loadToday()
        }
    }

    fun submitLong(kind: String, teamId: Int? = null, playerName: String? = null) {
        if (_state.value.user == null) return
        _state.update { it.copy(mutationInFlight = true, mutationError = null) }
        viewModelScope.launch {
            val result = runCatching { repo.submitLongPrediction(kind, teamId, playerName) }
            _state.update {
                it.copy(
                    mutationInFlight = false,
                    notice = if (result.isSuccess) "تم حفظ التوقّع" else it.notice,
                    mutationError = result.exceptionOrNull()?.let(::message),
                )
            }
            if (result.isSuccess) loadLong()
        }
    }

    fun loadMajalis(force: Boolean = false) {
        if (_state.value.majalisLoading || (!force && _state.value.majalis.isNotEmpty())) return
        _state.update { it.copy(majalisLoading = true, majalisError = null) }
        viewModelScope.launch {
            val result = runCatching { repo.majalis() }
            _state.update { it.copy(majalis = result.getOrDefault(it.majalis), majalisLoading = false, majalisLoaded = result.isSuccess, majalisError = result.exceptionOrNull()?.let(::message)) }
            (_state.value.pendingTarget as? GcMajlisLocalStore.Target.Majlis)?.let(::resolvePendingMajlis)
        }
    }

    fun createMajlis(name: String, onSuccess: () -> Unit = {}) {
        val clean = name.trim().replace(Regex("\\s+"), " ")
        if (clean.length !in 2..60) {
            _state.update { it.copy(mutationError = "اسم المجلس بين حرفين و60 حرفًا") }
            return
        }
        mutateMembership({ repo.createMajlis(clean) }, "أُنشئ المجلس بنجاح", onSuccess)
    }

    fun joinMajlis(code: String, onSuccess: () -> Unit = {}) {
        val clean = normalizeGcMajlisInviteCode(code)
        if (clean == null) {
            _state.update { it.copy(mutationError = "رمز الدعوة غير صالح") }
            return
        }
        mutateMembership({ repo.joinMajlis(clean) }, "انضممت إلى المجلس 🎉", onSuccess, consumeTarget = true)
    }

    private fun mutateMembership(
        operation: suspend () -> GcMajlisSummary,
        notice: String,
        onSuccess: () -> Unit,
        consumeTarget: Boolean = false,
    ) {
        _state.update { it.copy(mutationInFlight = true, mutationError = null) }
        viewModelScope.launch {
            val result = runCatching { operation() }
            val majlis = result.getOrNull()
            _state.update {
                it.copy(
                    mutationInFlight = false,
                    mutationError = result.exceptionOrNull()?.let(::message),
                    notice = if (majlis != null) notice else it.notice,
                )
            }
            if (majlis != null) {
                if (consumeTarget) localStore.consume()
                loadMajalis(force = true)
                openAfterMembership(majlis)
                onSuccess()
            }
        }
    }

    fun dismissInvite() {
        localStore.consume()
        _state.update { it.copy(invitePreview = null, mutationError = null) }
    }

    fun loadInvitePreview(code: String) {
        _state.update { it.copy(inviteLoading = true, mutationError = null) }
        viewModelScope.launch {
            val result = runCatching { repo.invite(code) }
            _state.update { it.copy(invitePreview = result.getOrNull(), inviteLoading = false, mutationError = result.exceptionOrNull()?.let(::message)) }
        }
    }

    fun loadPreference() {
        if (_state.value.user == null) return
        _state.update { it.copy(preferenceLoading = true) }
        viewModelScope.launch {
            val result = runCatching { repo.notificationPreference() }
            _state.update { it.copy(notificationEnabled = result.getOrDefault(it.notificationEnabled), preferenceLoading = false) }
        }
    }

    fun setPreference(enabled: Boolean) {
        val previous = _state.value.notificationEnabled
        _state.update { it.copy(notificationEnabled = enabled, preferenceLoading = true) }
        viewModelScope.launch {
            val result = runCatching { repo.setNotificationPreference(enabled) }
            val saved = result.getOrNull()
            if (saved == true) runCatching { deviceRegistrationManager.syncGulfCupToken() }
            _state.update {
                it.copy(
                    notificationEnabled = saved ?: previous,
                    preferenceLoading = false,
                    notice = if (saved != null) {
                        if (saved) "فُعّلت إشعارات المجلس" else "أُوقفت إشعارات المجلس"
                    } else it.notice,
                    mutationError = result.exceptionOrNull()?.let(::message),
                )
            }
        }
    }

    fun openMajlis(majlis: GcMajlisSummary, fixtureId: Int? = null) {
        _state.update {
            it.copy(
                selectedMajlis = majlis,
                detailSection = DetailSection.MATCHDAY,
                detailError = null,
                board = null,
                matchday = null,
                majlisFantasy = null,
                championPicks = null,
                duels = null,
                harvest = null,
                highlightedFixtureId = fixtureId,
            )
        }
        loadSelectedInitial(fixtureId)
    }

    fun closeMajlis() = _state.update { it.copy(selectedMajlis = null, detailError = null, highlightedFixtureId = null) }

    fun selectDetailSection(section: DetailSection) {
        _state.update { it.copy(detailSection = section, detailError = null) }
        when (section) {
            DetailSection.MATCHDAY -> loadMatchday()
            DetailSection.RANKING -> loadBoard()
            DetailSection.FANTASY -> loadMajlisFantasy()
            DetailSection.CHAMPION -> loadChampionPicks()
            DetailSection.DUELS -> loadDuels()
            DetailSection.HARVEST -> loadHarvest()
        }
    }

    fun refreshSelected() {
        val id = _state.value.selectedMajlis?.id ?: return
        _state.update { it.copy(detailLoading = true, detailError = null) }
        viewModelScope.launch {
            val board = async { runCatching { repo.majlisBoard(id) } }
            val matchday = async { runCatching { repo.matchday(id, _state.value.matchday?.date) } }
            val fantasy = async { runCatching { repo.majlisFantasy(id) } }
            val champion = async { runCatching { repo.championPicks(id) } }
            val duels = async { runCatching { repo.duels(id) } }
            val harvest = async { runCatching { repo.harvest(id) } }
            val boardValue = board.await().getOrNull()
            val matchdayValue = matchday.await().getOrNull()
            val fantasyValue = fantasy.await().getOrNull()
            val championValue = champion.await().getOrNull()
            val duelsValue = duels.await().getOrNull()
            val harvestValue = harvest.await().getOrNull()
            _state.update {
                it.copy(
                    board = boardValue ?: it.board,
                    matchday = matchdayValue ?: it.matchday,
                    majlisFantasy = fantasyValue ?: it.majlisFantasy,
                    championPicks = championValue ?: it.championPicks,
                    duels = duelsValue ?: it.duels,
                    harvest = harvestValue ?: it.harvest,
                    detailLoading = false,
                )
            }
        }
    }

    private fun loadSelectedInitial(fixtureId: Int? = null) {
        _state.update { it.copy(detailLoading = true) }
        viewModelScope.launch {
            val id = _state.value.selectedMajlis?.id ?: return@launch
            val board = async { runCatching { repo.majlisBoard(id) } }
            val day = async {
                runCatching {
                    val date = fixtureId?.let { targetId ->
                        val fixture = repo.fixtures().firstOrNull { candidate -> candidate.id == targetId }
                            ?: runCatching { repo.match(targetId).fixture }.getOrNull()
                        fixture?.riyadhDay()
                    }
                    repo.matchday(id, date)
                }
            }
            val dayResult = day.await()
            val boardResult = board.await()
            _state.update {
                it.copy(
                    board = boardResult.getOrNull(),
                    matchday = dayResult.getOrNull(),
                    detailLoading = false,
                    detailError = dayResult.exceptionOrNull()?.let(::message),
                )
            }
        }
    }

    fun loadMatchday(date: String? = null) = loadDetail { id ->
        val value = repo.matchday(id, date)
        _state.update { it.copy(matchday = value, highlightedFixtureId = null) }
    }

    fun loadBoard() = loadDetail { id ->
        val value = repo.majlisBoard(id)
        _state.update { it.copy(board = value) }
    }
    fun loadMajlisFantasy() = loadDetail { id ->
        val value = repo.majlisFantasy(id)
        _state.update { it.copy(majlisFantasy = value) }
    }
    fun loadChampionPicks() = loadDetail { id ->
        val value = repo.championPicks(id)
        _state.update { it.copy(championPicks = value) }
    }
    fun loadDuels() = loadDetail { id ->
        val value = repo.duels(id)
        _state.update { it.copy(duels = value) }
    }
    fun loadHarvest() = loadDetail { id ->
        val value = repo.harvest(id)
        _state.update { it.copy(harvest = value) }
    }

    private fun loadDetail(block: suspend (String) -> Unit) = viewModelScope.launch {
        val id = _state.value.selectedMajlis?.id ?: return@launch
        _state.update { it.copy(detailLoading = true, detailError = null) }
        val result = runCatching { block(id) }
        _state.update { it.copy(detailLoading = false, detailError = result.exceptionOrNull()?.let(::message)) }
    }

    fun createDuel(opponentId: String, fixtureId: Int, stake: Int, onSuccess: () -> Unit = {}) {
        val id = _state.value.selectedMajlis?.id ?: return
        mutateDetail({ repo.createDuel(id, opponentId, fixtureId, stake) }) {
            loadDuels()
            onSuccess()
        }
    }

    fun mutateDuel(duelId: String, action: String) {
        mutateDetail({ repo.mutateDuel(duelId, action) }) { loadDuels() }
    }

    private fun mutateDetail(operation: suspend () -> Unit, onSuccess: () -> Unit) {
        _state.update { it.copy(mutationInFlight = true, mutationError = null) }
        viewModelScope.launch {
            val result = runCatching { operation() }
            _state.update { it.copy(mutationInFlight = false, mutationError = result.exceptionOrNull()?.let(::message)) }
            if (result.isSuccess) onSuccess()
        }
    }

    fun leaveSelected(onSuccess: () -> Unit = {}) {
        val majlis = _state.value.selectedMajlis ?: return
        _state.update { it.copy(mutationInFlight = true, mutationError = null) }
        viewModelScope.launch {
            val result = runCatching { repo.leaveMajlis(majlis.id) }
            _state.update {
                it.copy(
                    mutationInFlight = false,
                    mutationError = result.exceptionOrNull()?.let(::message),
                    selectedMajlis = if (result.isSuccess) null else it.selectedMajlis,
                    majalis = if (result.isSuccess) it.majalis.filterNot { row -> row.id == majlis.id } else it.majalis,
                )
            }
            if (result.isSuccess) onSuccess()
        }
    }

    fun finishOnboarding(openPredictions: Boolean, enableAlerts: Boolean) {
        val user = _state.value.user ?: return
        val majlis = _state.value.onboardingMajlis
        val onboarding = _state.value.onboardingMajlis ?: return
        localStore.markOnboardingSeen(user.id, onboarding.id)
        _state.update { it.copy(onboardingMajlis = null) }
        // The composable resolves Android's runtime notification permission first;
        // persist the effective value so the backend can never claim notifications
        // are enabled while the OS has denied them.
        setPreference(enableAlerts)
        if (openPredictions) selectSegment(Segment.MATCHES) else if (majlis != null) openMajlis(majlis)
    }

    fun clearToast() = _state.update { it.copy(toast = null, notice = null) }
    fun clearMutationError() = _state.update { it.copy(mutationError = null) }

    private fun openAfterMembership(majlis: GcMajlisSummary) {
        val user = _state.value.user
        if (user != null && localStore.shouldShowOnboarding(user.id, majlis.id)) {
            _state.update { it.copy(onboardingMajlis = majlis) }
        } else {
            openMajlis(majlis)
        }
    }

    private fun resolvePendingMajlis(target: GcMajlisLocalStore.Target.Majlis) {
        val majlis = _state.value.majalis.firstOrNull { it.id == target.id }
        if (majlis != null) {
            localStore.consume()
            openMajlis(majlis, target.fixtureId)
        } else if (_state.value.user != null && !_state.value.majalisLoaded && !_state.value.majalisLoading) {
            loadMajalis(force = true)
        } else if (_state.value.user != null && _state.value.majalisLoaded && !_state.value.majalisLoading) {
            // Deleted council or a council the current account does not belong to:
            // consume once so collection cannot trigger an endless reload loop.
            localStore.consume()
            _state.update { it.copy(majalisError = "هذا المجلس غير متاح لهذا الحساب أو تم حذفه") }
        }
    }

    private fun seedInputs(today: GcPredictionsTodayResponse?): Map<Int, ScoreInput> =
        today?.matches?.associate { row ->
            row.fixture.id to ScoreInput(row.myPrediction?.predHome ?: 0, row.myPrediction?.predAway ?: 0)
        }.orEmpty()

    /** Convert fixture kickoff to the matchday API's canonical Riyadh calendar day. */
    private fun GcFixture.riyadhDay(): String? {
        val zone = ZoneId.of("Asia/Riyadh")
        if (timestamp > 0) return Instant.ofEpochSecond(timestamp.toLong()).atZone(zone).toLocalDate().toString()
        val raw = date.trim()
        if (raw.isEmpty()) return null
        return sequenceOf<() -> LocalDate>(
            { Instant.parse(raw).atZone(zone).toLocalDate() },
            { OffsetDateTime.parse(raw).atZoneSameInstant(zone).toLocalDate() },
            { ZonedDateTime.parse(raw).withZoneSameInstant(zone).toLocalDate() },
            { LocalDateTime.parse(raw).atZone(zone).toLocalDate() },
            { LocalDate.parse(raw) },
        ).firstNotNullOfOrNull { parser -> runCatching(parser).getOrNull() }?.toString()
    }

    private fun message(error: Throwable): String {
        if (error is HttpException) {
            val raw = runCatching { error.response()?.errorBody()?.string() }.getOrNull()
            val server = raw?.let {
                runCatching { json.parseToJsonElement(it).jsonObject["message"]?.jsonPrimitive?.content }.getOrNull()
            }
            if (!server.isNullOrBlank()) return server
            if (error.code() == 401) return "يلزم تسجيل الدخول"
        }
        return error.localizedMessage?.takeIf { it.isNotBlank() } ?: "تعذّر تنفيذ الطلب حاليًا"
    }
}

/** Navigation-only observer used by the app shell for cold/warm App Links. */
@HiltViewModel
class GcMajlisLinkViewModel @Inject constructor(
    store: GcMajlisLocalStore,
) : ViewModel() {
    val target: StateFlow<GcMajlisLocalStore.Target?> = store.target
}
