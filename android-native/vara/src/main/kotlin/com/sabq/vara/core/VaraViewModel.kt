package com.sabq.vara.core

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

data class FavoriteTeam(
    val id: Int,
    val name: String,
    val logo: String = "",
    /** بطولة الدوري الأساسية — مصدر هب «فريقي». */
    val competitionSlug: String? = null,
    val competitionName: String? = null,
)

data class AccountState(
    val restoring: Boolean = true,
    val loggedIn: Boolean = false,
    val member: Member? = null,
    val follows: List<Follow> = emptyList(),
    val alerts: AlertPreferences = AlertPreferences(),
    val error: String? = null,
    val busy: Boolean = false,
    val theme: ThemeMode = ThemeMode.SYSTEM,
    val accentId: String = "emerald",
    val language: String = "ar",
    val onboardingSeen: Boolean = false,
    val twoFactorChallenge: String? = null,
    val smartSnapsVisible: Boolean = true,
)

class VaraViewModel(application: Application) : AndroidViewModel(application) {
    val preferences = VaraPreferences(application)
    val sessions = SecureSessionStore(application)
    val credentials = SecureCredentialsStore(application)
    val api = VaraApi(application, sessions, preferences)
    // محفوظ مؤقتًا أثناء تحدّي 2FA لعضوية سبق — يُكتب للجهاز بعد النجاح فقط.
    private var pendingMembershipCredentials: SavedMembershipCredentials? = null

    private val _account = MutableStateFlow(
        AccountState(
            loggedIn = sessions.read() != null,
            member = preferences.storedMemberJson?.let { raw ->
                runCatching { parseMember(Json.parseToJsonElement(raw)) }.getOrNull()
            }.takeIf { sessions.read() != null },
            theme = preferences.theme,
            accentId = preferences.accentId,
            language = preferences.language,
            onboardingSeen = preferences.onboardingSeen,
            smartSnapsVisible = preferences.smartSnapsVisible,
        ),
    )
    val account: StateFlow<AccountState> = _account.asStateFlow()
    val isLoggedIn: Boolean get() = _account.value.loggedIn

    // الفريق المفضّل والمتابعات كتدفقات حالة — القراءة المباشرة من SharedPreferences
    // داخل التركيب كانت لا تُعيد الرسم عند التغيير من شاشة أخرى.
    private val _favoriteTeam = MutableStateFlow(
        preferences.favoriteTeamId?.let {
            FavoriteTeam(
                it,
                preferences.favoriteTeamName,
                preferences.favoriteTeamLogo,
                preferences.favoriteTeamCompetitionSlug,
                preferences.favoriteTeamCompetitionName,
            )
        },
    )
    val favoriteTeam: StateFlow<FavoriteTeam?> = _favoriteTeam.asStateFlow()

    private val _followedFixtures = MutableStateFlow(loadFollowedFixtures())
    /** لقطات المباريات المتابَعة (نظير SpMatchFollows.items) مرتبة زمنيًا. */
    val followedFixtures: StateFlow<List<Fixture>> = _followedFixtures.asStateFlow()
    val followedMatchIds: Set<Int> get() = _followedFixtures.value.map(Fixture::id).toSet()

    // لحظة رصد انتهاء كل مباراة متابَعة — لإخفائها من «مبارياتي» بعد 5 دقائق.
    private val finishedAtById = mutableMapOf<Int, Long>()

    // يُرفع بعد الدخول ليطلب VaraApp إذن الإشعارات تلقائيًا (نظير enablePushNotifications).
    private val _wantsNotificationPermission = MutableStateFlow(false)
    val wantsNotificationPermission: StateFlow<Boolean> = _wantsNotificationPermission.asStateFlow()
    fun notificationPermissionRequested() { _wantsNotificationPermission.value = false }

    @Volatile private var unauthorizedProbeRunning = false

    init {
        VaraFormat.displayLang = preferences.language
        // تأكيد 401/403 أثناء التشغيل: طلب ملف ثانٍ قبل مسح الجلسة (يمنع عاصفة
        // مسح الجلسة على فشل عابر — نظير unauthorizedProbeTask في iOS).
        api.onUnauthorized = { confirmUnauthorized() }
        restore()
    }

    private fun confirmUnauthorized() {
        if (unauthorizedProbeRunning || sessions.read() == null) return
        unauthorizedProbeRunning = true
        viewModelScope.launch {
            delay(300)
            val confirmed = runCatching { api.memberGet("/members/profile", ignoreCache = true) }.exceptionOrNull() as? ApiFailure
            if (confirmed?.status == 401 || confirmed?.status == 403) clearSession()
            unauthorizedProbeRunning = false
        }
    }

    private fun clearSession() {
        sessions.write(null)
        preferences.storedMemberJson = null
        _account.value = _account.value.copy(loggedIn = false, member = null, follows = emptyList(), alerts = AlertPreferences(), twoFactorChallenge = null)
    }

    private fun restore() = viewModelScope.launch {
        if (sessions.read().isNullOrBlank()) {
            _account.value = _account.value.copy(restoring = false, loggedIn = false)
            return@launch
        }
        runCatching { api.memberGet("/members/profile", ignoreCache = true) }
            .onSuccess { root ->
                val o = root as? JsonObject
                applyMember(parseMember(o?.get("member") ?: o?.get("user") ?: root))
                _account.value = _account.value.copy(restoring = false)
                loadMemberData()
            }
            .onFailure { error ->
                if (error is ApiFailure && (error.status == 401 || error.status == 403)) {
                    delay(300)
                    val confirmed = runCatching { api.memberGet("/members/profile", ignoreCache = true) }.exceptionOrNull() as? ApiFailure
                    if (confirmed?.status == 401 || confirmed?.status == 403) clearSession()
                }
                _account.value = _account.value.copy(restoring = false)
            }
    }

    private fun applyMember(member: Member?) {
        if (member != null) {
            preferences.storedMemberJson = buildJsonObject {
                put("id", member.id); put("name", member.name); put("email", member.email)
                put("phone", member.phone); put("avatar", member.avatar)
                put("loyaltyPoints", member.loyaltyPoints); put("hasPassword", member.hasPassword)
                put("needsDisplayName", member.needsDisplayName)
            }.toString()
        }
        _account.value = _account.value.copy(member = member ?: _account.value.member, loggedIn = true)
    }

    private fun onSessionStarted(member: Member?) {
        applyMember(member)
        _wantsNotificationPermission.value = true
        loadMemberData()
        syncLocalFollowsToServer()
    }

    /** بيانات عضوية سبق المحفوظة على الجهاز (للإكمال التلقائي في شاشة الدخول). */
    fun savedMembershipCredentials(): SavedMembershipCredentials? = credentials.read()

    fun clearSavedMembershipCredentials() {
        pendingMembershipCredentials = null
        credentials.clear()
    }

    private fun rememberMembershipCredentials(identifier: String, password: String) {
        credentials.write(identifier, password)
        pendingMembershipCredentials = null
    }

    fun login(identifier: String, password: String, done: (Boolean) -> Unit) = viewModelScope.launch {
        _account.value = _account.value.copy(busy = true, error = null)
        runCatching { api.login(identifier, password) }
            .onSuccess { (_, member) ->
                rememberMembershipCredentials(identifier, password)
                _account.value = _account.value.copy(busy = false)
                onSessionStarted(member); done(true)
            }
            .onFailure {
                if (it is TwoFactorRequired) {
                    pendingMembershipCredentials = SavedMembershipCredentials(identifier.trim(), password)
                    _account.value = _account.value.copy(busy = false, error = null, twoFactorChallenge = it.challengeToken)
                } else {
                    _account.value = _account.value.copy(busy = false, error = it.message)
                }
                done(false)
            }
    }

    fun verifyTwoFactor(code: String, backupCode: String? = null, done: (Boolean) -> Unit) = viewModelScope.launch {
        val challenge = _account.value.twoFactorChallenge ?: return@launch done(false)
        _account.value = _account.value.copy(busy = true, error = null)
        runCatching { api.verifyTwoFactor(challenge, code, backupCode) }
            .onSuccess { (_, member) ->
                pendingMembershipCredentials?.let { rememberMembershipCredentials(it.identifier, it.password) }
                _account.value = _account.value.copy(busy = false, twoFactorChallenge = null)
                onSessionStarted(member); done(true)
            }
            .onFailure {
                if (it is TwoFactorRequired) _account.value = _account.value.copy(busy = false, error = null, twoFactorChallenge = it.challengeToken)
                else _account.value = _account.value.copy(busy = false, error = it.message)
                done(false)
            }
    }

    /// زر «رجوع» من خطوة التحقق بخطوتين — بدونها كانت الشاشة محبوسة على الرمز.
    fun cancelTwoFactor() {
        pendingMembershipCredentials = null
        _account.value = _account.value.copy(twoFactorChallenge = null, error = null)
    }

    fun sendPhone(phone: String, done: (Boolean) -> Unit) = viewModelScope.launch {
        _account.value = _account.value.copy(busy = true, error = null)
        runCatching { api.sendPhone(phone) }
            .onSuccess { _account.value = _account.value.copy(busy = false); done(true) }
            .onFailure { _account.value = _account.value.copy(busy = false, error = it.message); done(false) }
    }

    fun verifyPhone(phone: String, code: String, done: (Boolean) -> Unit) = viewModelScope.launch {
        _account.value = _account.value.copy(busy = true, error = null)
        runCatching { api.verifyPhone(phone, code) }
            .onSuccess { (_, member) -> _account.value = _account.value.copy(busy = false); onSessionStarted(member); done(true) }
            .onFailure {
                if (it is TwoFactorRequired) _account.value = _account.value.copy(busy = false, error = null, twoFactorChallenge = it.challengeToken)
                else _account.value = _account.value.copy(busy = false, error = it.message)
                done(false)
            }
    }

    fun logout() = viewModelScope.launch {
        val token = runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull()
        if (!token.isNullOrBlank()) runCatching {
            api.memberDelete("/devices/unregister", body = buildJsonObject { put("deviceToken", token) })
        }
        clearSession()
        _account.value = _account.value.copy(error = null)
    }

    fun loadMemberData() = viewModelScope.launch {
        if (!isLoggedIn) return@launch
        val member = runCatching { api.memberGet("/members/profile") }.getOrNull()?.let { root ->
            val o = root as? JsonObject
            parseMember(o?.get("member") ?: o?.get("user") ?: root)
        }
        val follows = runCatching { api.memberGet("/sports/follows") }.getOrNull()?.let(::parseFollows).orEmpty()
        val alerts = runCatching { api.memberGet("/sports/alert-prefs") }.getOrNull()?.let(::parseAlerts)
        member?.let(::applyMember)
        _account.value = _account.value.copy(
            follows = follows,
            alerts = alerts ?: _account.value.alerts,
        )
        registerDevice()
    }

    private suspend fun registerDevice() {
        val fcm = runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull() ?: return
        runCatching { api.registerDevice(fcm, _account.value.member?.id) }
    }

    fun toggleFollow(kind: String, refId: String, name: String, logo: String = "", requireLogin: () -> Unit) {
        if (!isLoggedIn) { requireLogin(); return }
        viewModelScope.launch {
            val old = _account.value.follows
            val existing = old.firstOrNull { it.kind == kind && it.refId == refId }
            val optimistic = if (existing == null) old + Follow("$kind:$refId", kind, refId, name, logo) else old - existing
            _account.value = _account.value.copy(follows = optimistic)
            val result = runCatching {
                if (existing == null) api.memberPost("/sports/follows", buildJsonObject {
                    put("kind", kind); put("refId", refId); put("refName", name); if (logo.isNotBlank()) put("refLogo", logo)
                }) else api.memberDelete("/sports/follows", mapOf("kind" to kind, "refId" to refId))
            }
            if (result.isFailure) _account.value = _account.value.copy(follows = old, error = result.exceptionOrNull()?.message)
        }
    }

    fun updateAlerts(value: AlertPreferences) = viewModelScope.launch {
        val old = _account.value.alerts
        _account.value = _account.value.copy(alerts = value)
        val result = runCatching { api.memberPut("/sports/alert-prefs", value.toJson()) }
        if (result.isFailure) _account.value = _account.value.copy(alerts = old, error = result.exceptionOrNull()?.message)
    }

    fun completeDisplayName(firstName: String, lastName: String, done: (Boolean) -> Unit) = viewModelScope.launch {
        _account.value = _account.value.copy(busy = true, error = null)
        runCatching {
            api.memberPut("/members/profile", buildJsonObject {
                put("firstName", firstName.trim())
                if (lastName.isNotBlank()) put("lastName", lastName.trim())
            })
        }
            .onSuccess { root ->
                val o = root as? JsonObject
                val member = parseMember(o?.get("member") ?: o?.get("user") ?: root)
                val fallback = _account.value.member?.copy(name = "$firstName $lastName".trim(), needsDisplayName = false)
                applyMember(member ?: fallback)
                _account.value = _account.value.copy(busy = false)
                done(true)
            }
            .onFailure { _account.value = _account.value.copy(busy = false, error = it.message); done(false) }
    }

    fun setTheme(mode: ThemeMode) { preferences.theme = mode; _account.value = _account.value.copy(theme = mode) }
    fun setAccent(id: String) { preferences.accentId = id; _account.value = _account.value.copy(accentId = id) }
    fun setLanguage(code: String) {
        preferences.language = code
        VaraFormat.displayLang = code
        // استجابات باللغة السابقة لا تُخدم من الكاش بعد التبديل.
        api.clearHttpCache()
        _account.value = _account.value.copy(language = code)
    }
    fun setSmartSnapsVisible(visible: Boolean) {
        preferences.smartSnapsVisible = visible
        _account.value = _account.value.copy(smartSnapsVisible = visible)
    }
    fun completeOnboarding() { preferences.onboardingSeen = true; _account.value = _account.value.copy(onboardingSeen = true) }

    // MARK: — الفريق المفضّل

    fun setFavoriteTeam(team: FavoriteTeam?) {
        preferences.favoriteTeamId = team?.id
        preferences.favoriteTeamName = team?.name.orEmpty()
        preferences.favoriteTeamLogo = team?.logo.orEmpty()
        preferences.favoriteTeamCompetitionSlug = team?.competitionSlug
        preferences.favoriteTeamCompetitionName = team?.competitionName
        _favoriteTeam.value = team
    }

    /** يحدّث بطولة المفضّل بعد اكتشافها من ملف النادي. */
    fun updateFavoriteCompetition(slug: String?, name: String?) {
        val current = _favoriteTeam.value ?: return
        val next = current.copy(
            competitionSlug = slug ?: current.competitionSlug,
            competitionName = name ?: current.competitionName,
        )
        setFavoriteTeam(next)
    }

    // MARK: — متابعة المباريات (لقطات كاملة — نظير SpMatchFollows)

    fun isFollowingMatch(id: Int): Boolean = _followedFixtures.value.any { it.id == id }

    fun followMatch(fixture: Fixture) {
        val next = (_followedFixtures.value.filterNot { it.id == fixture.id } + fixture).sortedBy { it.kickoffMs ?: Long.MAX_VALUE }
        _followedFixtures.value = next
        persistFollowedFixtures()
        if (isLoggedIn) toggleServerMatchFollow(fixture, follow = true)
    }

    fun unfollowMatch(fixture: Fixture) {
        _followedFixtures.value = _followedFixtures.value.filterNot { it.id == fixture.id }
        finishedAtById.remove(fixture.id)
        persistFollowedFixtures()
        if (isLoggedIn) toggleServerMatchFollow(fixture, follow = false)
    }

    /// تحديث لقطات المتابعات من أي جلب جدول أحدث (نظير SpMatchFollows.update).
    fun updateFollowedSnapshots(latest: List<Fixture>) {
        if (_followedFixtures.value.isEmpty()) return
        val byId = latest.associateBy(Fixture::id)
        var changed = false
        val next = _followedFixtures.value.map { old ->
            val fresh = byId[old.id] ?: return@map old
            changed = true
            // مسار lite قد يفقد اسم البطولة — نحتفظ به من اللقطة السابقة.
            if (fresh.competitionName.isBlank() && old.competitionName.isNotBlank()) fresh.copy(competitionName = old.competitionName, competitionSlug = fresh.competitionSlug.ifBlank { old.competitionSlug }) else fresh
        }
        if (changed) { _followedFixtures.value = next; persistFollowedFixtures() }
    }

    /// المتابَعات الظاهرة في «مبارياتي»: المنتهية تختفي بعد 5 دقائق من رصد نهايتها.
    fun visibleFollowedFixtures(nowMs: Long = System.currentTimeMillis()): List<Fixture> =
        _followedFixtures.value.filter { fx ->
            if (!fx.status.finished) true else {
                val seenAt = finishedAtById.getOrPut(fx.id) { nowMs }
                nowMs - seenAt < 5 * 60_000L
            }
        }

    private fun toggleServerMatchFollow(fixture: Fixture, follow: Boolean) = viewModelScope.launch {
        runCatching {
            if (follow) api.memberPost("/sports/follows", buildJsonObject {
                put("kind", "match"); put("refId", "${fixture.id}")
                put("refName", "${fixture.home.name} × ${fixture.away.name}")
            }) else api.memberDelete("/sports/follows", mapOf("kind" to "match", "refId" to "${fixture.id}"))
        }
    }

    /// بعد الدخول: رفع المتابعات المحلية للخادم كي تصل الإشعارات اللحظية (نظير syncAllToServer).
    private fun syncLocalFollowsToServer() = viewModelScope.launch {
        _followedFixtures.value.forEach { fx ->
            runCatching {
                api.memberPost("/sports/follows", buildJsonObject {
                    put("kind", "match"); put("refId", "${fx.id}")
                    put("refName", "${fx.home.name} × ${fx.away.name}")
                })
            }
        }
    }

    private fun loadFollowedFixtures(): List<Fixture> {
        val raw = preferences.followedFixturesJson
        if (raw.isNullOrBlank()) {
            // ترحيل من التخزين القديم (معرّفات فقط) — تُستكمل اللقطات عند أول جلب.
            return preferences.followedMatchIds.map { id -> Fixture(id, Team(0, ""), Team(0, "")) }
        }
        return runCatching {
            (Json.parseToJsonElement(raw) as? JsonArray)?.mapNotNull(::parseFixture).orEmpty()
        }.getOrDefault(emptyList())
    }

    private fun persistFollowedFixtures() {
        preferences.followedMatchIds = followedMatchIds
        preferences.followedFixturesJson = buildJsonArray {
            _followedFixtures.value.forEach { fx -> add(fixtureToJson(fx)) }
        }.toString()
    }

    private fun fixtureToJson(fx: Fixture): JsonObject = buildJsonObject {
        put("id", fx.id)
        put("home", buildJsonObject { put("id", fx.home.id); put("name", fx.home.name); put("logo", fx.home.logo) })
        put("away", buildJsonObject { put("id", fx.away.id); put("name", fx.away.name); put("logo", fx.away.logo) })
        fx.homeScore?.let { put("homeScore", it) }
        fx.awayScore?.let { put("awayScore", it) }
        put("status", buildJsonObject {
            put("code", fx.status.code); put("label", fx.status.label)
            fx.status.elapsed?.let { put("elapsed", it) }; fx.status.extra?.let { put("extra", it) }
            put("live", fx.status.live); put("finished", fx.status.finished)
            fx.status.clockStartEpoch?.let { put("clockStartEpoch", it) }
        })
        fx.timestamp?.let { put("timestamp", it) }
        fx.date?.let { put("date", it) }
        put("round", fx.round); put("venue", fx.venue)
        put("competitionSlug", fx.competitionSlug); put("competitionName", fx.competitionName)
        if (fx.hasPenalties) put("penalties", buildJsonObject { fx.penHome?.let { put("home", it) }; fx.penAway?.let { put("away", it) } })
    }
}

private fun parseFollows(root: kotlinx.serialization.json.JsonElement): List<Follow> {
    val rows = findArray(root, "follows", "items")
    return rows.mapNotNull { e ->
        val o = e as? JsonObject ?: return@mapNotNull null
        val kind = o.string("kind") ?: return@mapNotNull null
        val refId = o.string("refId", "ref_id") ?: return@mapNotNull null
        Follow(o.string("id") ?: "$kind:$refId", kind, refId, o.string("refName", "name") ?: refId, o.string("refLogo", "logo") ?: "")
    }
}

private fun parseAlerts(root: kotlinx.serialization.json.JsonElement): AlertPreferences {
    val o = (root as? JsonObject)?.obj("preferences", "prefs") ?: root as? JsonObject ?: return AlertPreferences()
    return AlertPreferences(
        kickoff = o.bool("kickoff") ?: true,
        goals = o.bool("goals") ?: true,
        cards = o.bool("cards") ?: true,
        varReview = o.bool("varReview", "var_review") ?: true,
        fulltime = o.bool("fulltime") ?: true,
        transfersSaudi = o.bool("transfersSaudi", "transfers_saudi") ?: true,
        transfersGlobal = o.bool("transfersGlobal", "transfers_global") ?: false,
        smartSnaps = o.bool("smartSnaps", "smart_snaps") ?: true,
    )
}

private fun AlertPreferences.toJson() = buildJsonObject {
    put("kickoff", kickoff); put("goals", goals); put("cards", cards); put("varReview", varReview)
    put("fulltime", fulltime); put("transfersSaudi", transfersSaudi); put("transfersGlobal", transfersGlobal); put("smartSnaps", smartSnaps)
}
