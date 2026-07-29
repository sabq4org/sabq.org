package com.sabq.vara.core

import android.content.Context
import android.os.Build
import android.net.Uri
import android.provider.Settings
import android.util.Base64
import java.security.KeyStore
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.TimeZone
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

internal const val PUBLIC_API = "https://api.sabq.org/api"
internal const val MEMBER_API = "https://api.sabq.org/api/v1"
internal const val WEB_ORIGIN = "https://sabq.org"

data class Team(val id: Int, val name: String, val logo: String = "")
data class MatchStatus(
    val code: String = "NS",
    val label: String = "قادمة",
    val elapsed: Int? = null,
    val extra: Int? = null,
    val live: Boolean = false,
    val finished: Boolean = false,
    val clockStartEpoch: Long? = null,
)
data class Fixture(
    val id: Int,
    val home: Team,
    val away: Team,
    val homeScore: Int? = null,
    val awayScore: Int? = null,
    val status: MatchStatus = MatchStatus(),
    val timestamp: Long? = null,
    val date: String? = null,
    val round: String = "",
    val venue: String = "",
    val venueCity: String = "",
    val competitionSlug: String = "",
    val competitionName: String = "",
    // نتيجة ركلات الترجيح — لحظية أثناء الترجيح (code=P) ونهائية بعده (PEN).
    val penHome: Int? = null,
    val penAway: Int? = null,
    // من لوحة world-live: الدولة/العلم/شعار البطولة (competition يصل نصًا هناك).
    val countryAr: String = "",
    val flag: String = "",
    val leagueLogo: String = "",
) {
    val shootoutLive: Boolean get() = status.live && status.code.uppercase() == "P"
    val hasPenalties: Boolean get() = penHome != null || penAway != null
    val started: Boolean get() = status.live || status.finished
    val kickoffMs: Long? get() = timestamp?.let { if (it > 10_000_000_000L) it else it * 1000L }
        ?: date?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
}
data class Competition(
    val id: String,
    val slug: String,
    val name: String,
    val nameEn: String = "",
    val logo: String = "",
    val category: String = "",
    val status: String = "",
)
data class Standing(
    val rank: Int,
    val team: Team,
    val played: Int,
    val won: Int,
    val draw: Int,
    val lost: Int,
    val goalsDiff: Int,
    val points: Int,
    val form: String = "",
    val goalsFor: Int? = null,
    val goalsAgainst: Int? = null,
    // ترتيب لحظي أثناء الجولة: live=true وliveDelta فرق المركز عن الجدول الرسمي.
    val live: Boolean = false,
    val liveDelta: Int? = null,
    val group: String = "",
)
data class Leader(
    val id: Int,
    val name: String,
    val image: String = "",
    val team: String = "",
    val teamLogo: String = "",
    val value: Int = 0,
    val rank: Int? = null,
    val matches: Int? = null,
    // الرقم الثانوي: صناعة للهدّاف، أهداف للصانع، حمراء للبطاقات.
    val secondary: Int? = null,
)
data class Article(val id: String, val title: String, val slug: String, val image: String = "", val excerpt: String = "")
data class Transfer(
    val id: String,
    val playerId: Int? = null,
    val player: String,
    val playerImage: String = "",
    val position: String = "",
    val from: String = "",
    val fromLogo: String = "",
    val to: String = "",
    val toLogo: String = "",
    val date: String = "",
    val fee: String = "",
    // درجة الاحتمال النصية من المزوّد: LOW / MEDIUM / HIGH / IMMINENT.
    val probability: String? = null,
    val confirmed: Boolean = false,
    // نوع الصفقة: transfer / loan / free / loanend / extension.
    val kind: String = "",
    // النص العربي الجاهز من فيد روشن (يحمل النوع/المبلغ أحيانًا).
    val typeAr: String = "",
    val hereWeGo: Boolean = false,
    val sourceTier: String = "",
) {
    val probabilityLabelAr: String get() = when (probability?.uppercase()) {
        "IMMINENT" -> "وشيكة"; "HIGH" -> "قوية"; "MEDIUM" -> "متوسطة"; "LOW" -> "ضعيفة"; else -> ""
    }
}
data class Member(
    val id: String,
    val name: String,
    val email: String = "",
    val phone: String = "",
    val avatar: String = "",
    val loyaltyPoints: Int = 0,
    val hasPassword: Boolean = true,
    val needsDisplayName: Boolean = false,
) {
    // البريد الاصطناعي لحسابات الجوال (05x@phone.sabq.org) لا يُعرض للمستخدم.
    val displayEmail: String get() = if (email.endsWith("@phone.sabq.org")) "" else email
}
data class Follow(val id: String, val kind: String, val refId: String, val name: String, val logo: String = "")
data class AlertPreferences(
    val kickoff: Boolean = true,
    val goals: Boolean = true,
    val cards: Boolean = true,
    val varReview: Boolean = true,
    val fulltime: Boolean = true,
    val transfersSaudi: Boolean = true,
    val transfersGlobal: Boolean = false,
    val smartSnaps: Boolean = true,
)
data class PredictionCompetition(val slug: String, val name: String, val status: String, val contests: Int = 0, val points: Int = 0)
data class PredictionContest(
    val id: String,
    val home: Team,
    val away: Team,
    val locksAt: String,
    val status: String,
    val predHome: Int? = null,
    val predAway: Int? = null,
)
data class PredictionLedger(val id: String, val label: String, val points: Int, val createdAt: String)
data class PredictionLeader(val rank: Int, val name: String, val points: Int, val avatar: String = "", val isMe: Boolean = false)

class ApiFailure(val status: Int, override val message: String) : Exception(message)
class TwoFactorRequired(val challengeToken: String) : Exception("أدخل رمز التحقق بخطوتين")

private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }
private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

fun JsonObject.string(vararg keys: String): String? = keys.firstNotNullOfOrNull { key ->
    (this[key] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() && it != "null" }
}
fun JsonObject.int(vararg keys: String): Int? = keys.firstNotNullOfOrNull { key ->
    val p = this[key] as? JsonPrimitive
    p?.intOrNull ?: p?.contentOrNull?.toDoubleOrNull()?.toInt()
}
fun JsonObject.long(vararg keys: String): Long? = keys.firstNotNullOfOrNull { key ->
    val p = this[key] as? JsonPrimitive
    p?.longOrNull ?: p?.contentOrNull?.toDoubleOrNull()?.toLong()
}
fun JsonObject.bool(vararg keys: String): Boolean? = keys.firstNotNullOfOrNull { key ->
    val p = this[key] as? JsonPrimitive
    p?.booleanOrNull ?: when (p?.contentOrNull?.lowercase()) { "1", "yes", "true" -> true; "0", "no", "false" -> false; else -> null }
}
fun JsonObject.obj(vararg keys: String): JsonObject? = keys.firstNotNullOfOrNull { this[it] as? JsonObject }
fun JsonObject.array(vararg keys: String): JsonArray? = keys.firstNotNullOfOrNull { this[it] as? JsonArray }

private fun normalizeUrl(raw: String?): String = when {
    raw.isNullOrBlank() -> ""
    raw.startsWith("http") -> raw
    else -> WEB_ORIGIN + if (raw.startsWith('/')) raw else "/$raw"
}

fun parseTeam(value: JsonElement?, fallbackName: String = ""): Team {
    val o = value as? JsonObject ?: return Team(0, (value as? JsonPrimitive)?.contentOrNull ?: fallbackName)
    return Team(
        id = o.int("id", "teamId", "team_id") ?: 0,
        name = o.string("nameAr", "name_ar", "name", "shortName", "title") ?: fallbackName,
        logo = normalizeUrl(o.string("logo", "image", "teamLogo", "team_logo", "crest")),
    )
}

fun parseFixture(element: JsonElement): Fixture? {
    val root = element as? JsonObject ?: return null
    val fixture = root.obj("fixture", "match") ?: root
    val teams = root.obj("teams") ?: fixture.obj("teams")
    val home = parseTeam(root["home"] ?: teams?.get("home") ?: fixture["home"], "المضيف")
    val away = parseTeam(root["away"] ?: teams?.get("away") ?: fixture["away"], "الضيف")
    val score = root.obj("score", "goals") ?: fixture.obj("score", "goals")
    val goals = root.obj("goals") ?: fixture.obj("goals")
    val rawStatus = root.obj("status") ?: fixture.obj("status") ?: JsonObject(emptyMap())
    val code = rawStatus.string("code", "short", "status") ?: root.string("statusCode", "status") ?: "NS"
    val finishedCodes = setOf("FT", "AET", "PEN", "ENDED", "FINISHED")
    val liveCodes = setOf("1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INPLAY")
    val competition = root.obj("competition", "league", "tournament") ?: fixture.obj("competition", "league")
    // /sports/world-live يعيد competition كسلسلة نصية لا ككائن.
    val competitionText = (root["competition"] as? JsonPrimitive)?.contentOrNull
        ?: (fixture["competition"] as? JsonPrimitive)?.contentOrNull
    val penalties = root.obj("penalties") ?: fixture.obj("penalties") ?: score?.obj("penalty") ?: goals?.obj("penalty")
    val timestamp = fixture.long("timestamp", "kickoffTimestamp", "kickoff_timestamp")
        ?: root.long("timestamp", "kickoffTimestamp", "kickoff_timestamp")
    val venueObj = root.obj("venue") ?: fixture.obj("venue")
    val id = fixture.int("id", "fixtureId", "fixture_id", "matchId") ?: root.int("id", "fixtureId", "matchId") ?: return null
    return Fixture(
        id = id,
        home = home,
        away = away,
        homeScore = score?.int("home", "homeScore") ?: goals?.int("home") ?: root.int("homeScore", "home_score"),
        awayScore = score?.int("away", "awayScore") ?: goals?.int("away") ?: root.int("awayScore", "away_score"),
        status = MatchStatus(
            code = code,
            label = rawStatus.string("label", "long", "name") ?: root.string("statusLabel") ?: code,
            elapsed = rawStatus.int("elapsed", "minute") ?: root.int("elapsed", "minute"),
            extra = rawStatus.int("extra") ?: root.int("extra"),
            live = rawStatus.bool("live", "isLive") ?: root.bool("live", "isLive") ?: liveCodes.contains(code.uppercase()),
            finished = rawStatus.bool("finished", "isFinished") ?: root.bool("finished", "isFinished") ?: finishedCodes.contains(code.uppercase()),
            clockStartEpoch = rawStatus.long("clockStartEpoch", "clock_start_epoch") ?: root.long("clockStartEpoch"),
        ),
        timestamp = timestamp,
        date = fixture.string("date", "kickoff", "startsAt") ?: root.string("date", "kickoff", "startsAt"),
        round = root.string("round", "roundName") ?: fixture.string("round") ?: "",
        venue = venueObj?.string("name", "stadium") ?: root.string("venue") ?: "",
        venueCity = venueObj?.string("city") ?: "",
        competitionSlug = competition?.string("slug", "key", "code") ?: root.string("competitionSlug", "competition_slug", "comp") ?: "",
        competitionName = competition?.string("nameAr", "name_ar", "name") ?: competitionText
            ?: root.string("competitionName", "leagueName") ?: "",
        penHome = penalties?.int("home"),
        penAway = penalties?.int("away"),
        countryAr = root.string("countryAr", "country_ar") ?: root.string("country") ?: "",
        flag = normalizeUrl(root.string("flag")),
        leagueLogo = normalizeUrl(root.string("leagueLogo", "league_logo") ?: competition?.string("logo")),
    )
}

fun findArray(root: JsonElement, vararg preferredKeys: String): JsonArray {
    if (root is JsonArray) return root
    val obj = root as? JsonObject ?: return JsonArray(emptyList())
    preferredKeys.forEach { key -> (obj[key] as? JsonArray)?.let { return it } }
    for ((_, value) in obj) {
        if (value is JsonObject) {
            preferredKeys.forEach { key -> (value[key] as? JsonArray)?.let { return it } }
        }
    }
    return JsonArray(emptyList())
}

fun parseFixtureBuckets(root: JsonElement): List<Fixture> {
    if (root is JsonArray) return root.mapNotNull(::parseFixture).distinctBy(Fixture::id)
    val obj = root as? JsonObject ?: return emptyList()
    val keys = listOf("fixtures", "matches", "live", "today", "upcoming", "results", "items")
    val arrays = buildList {
        keys.forEach { key -> (obj[key] as? JsonArray)?.let(::add) }
        obj.values.filterIsInstance<JsonObject>().forEach { nested -> keys.forEach { key -> (nested[key] as? JsonArray)?.let(::add) } }
    }
    return arrays.flatMap { it.mapNotNull(::parseFixture) }.distinctBy(Fixture::id)
}

fun parseCompetition(e: JsonElement): Competition? {
    val o = e as? JsonObject ?: return null
    val slug = o.string("slug", "key", "code", "id") ?: return null
    return Competition(
        id = o.string("id") ?: slug,
        slug = slug,
        name = o.string("nameAr", "name_ar", "name", "title") ?: slug,
        nameEn = o.string("nameEn", "name_en") ?: "",
        logo = normalizeUrl(o.string("logo", "image", "emblem")),
        category = o.string("category", "region", "type") ?: "",
        status = o.string("status") ?: "",
    )
}

fun parseStanding(e: JsonElement, group: String = ""): Standing? {
    val o = e as? JsonObject ?: return null
    val goalsObj = o.obj("goals", "all")
    return Standing(
        rank = o.int("rank", "position") ?: return null,
        team = parseTeam(o["team"]),
        played = o.int("played", "allPlayed", "p") ?: 0,
        won = o.int("won", "win", "w") ?: 0,
        draw = o.int("draw", "d") ?: 0,
        lost = o.int("lost", "lose", "l") ?: 0,
        goalsDiff = o.int("goalsDiff", "goals_diff", "gd") ?: 0,
        points = o.int("points", "pts") ?: 0,
        form = o.string("form") ?: "",
        goalsFor = o.int("goalsFor", "goals_for", "gf") ?: goalsObj?.int("for"),
        goalsAgainst = o.int("goalsAgainst", "goals_against", "ga") ?: goalsObj?.int("against"),
        live = o.bool("live", "isLive") ?: false,
        liveDelta = o.int("liveDelta", "live_delta", "delta"),
        group = group.ifBlank { o.string("group", "groupName") ?: "" },
    )
}

fun parseLeader(e: JsonElement, valueKeys: Array<String> = arrayOf("goals", "assists", "total", "value", "count")): Leader? {
    val o = e as? JsonObject ?: return null
    val player = o.obj("player") ?: o
    val team = o.obj("team")
    val primary = valueKeys.firstNotNullOfOrNull { o.int(it) ?: player.int(it) } ?: 0
    val secondaryKeys = when (valueKeys.firstOrNull()) {
        "assists" -> arrayOf("goals")
        "cards" -> arrayOf("red", "redCards")
        else -> arrayOf("assists")
    }
    return Leader(
        id = player.int("id", "playerId") ?: o.int("id") ?: 0,
        name = player.string("nameAr", "name", "playerName") ?: o.string("name") ?: return null,
        image = normalizeUrl(player.string("photo", "image", "avatar")),
        team = team?.string("nameAr", "name") ?: o.string("team", "teamName") ?: "",
        teamLogo = normalizeUrl(team?.string("logo") ?: o.string("teamLogo")),
        value = primary,
        rank = o.int("rank", "position"),
        matches = o.int("matches", "played", "appearances") ?: player.int("matches"),
        secondary = secondaryKeys.firstNotNullOfOrNull { o.int(it) ?: player.int(it) },
    )
}

/** تخزين مشفّر عبر Android Keystore + AES-GCM (جلسة / بيانات دخول). */
private class SecureBlobStore(context: Context, prefsName: String, private val alias: String, private val keyName: String) {
    private val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private fun key(): SecretKey {
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance("AES", "AndroidKeyStore").apply {
            init(
                android.security.keystore.KeyGenParameterSpec.Builder(
                    alias,
                    android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT,
                ).setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setUserAuthenticationRequired(false)
                    .build(),
            )
        }.generateKey()
    }

    @Volatile private var cached: String? = null
    @Volatile private var cacheLoaded = false

    fun read(): String? {
        if (cacheLoaded) return cached
        synchronized(this) {
            if (cacheLoaded) return cached
            cached = runCatching {
                val packed = Base64.decode(prefs.getString(keyName, null) ?: return@runCatching null, Base64.NO_WRAP)
                val ivSize = packed.first().toInt() and 0xff
                val iv = packed.copyOfRange(1, 1 + ivSize)
                val encrypted = packed.copyOfRange(1 + ivSize, packed.size)
                Cipher.getInstance("AES/GCM/NoPadding").run {
                    init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
                    String(doFinal(encrypted), Charsets.UTF_8)
                }
            }.getOrNull()
            cacheLoaded = true
        }
        return cached
    }

    fun write(value: String?) {
        synchronized(this) {
            cached = value?.takeIf { it.isNotBlank() }
            cacheLoaded = true
        }
        if (value.isNullOrBlank()) { prefs.edit().remove(keyName).apply(); return }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val packed = byteArrayOf(cipher.iv.size.toByte()) + cipher.iv + encrypted
        prefs.edit().putString(keyName, Base64.encodeToString(packed, Base64.NO_WRAP)).apply()
    }
}

class SecureSessionStore(context: Context) {
    private val blob = SecureBlobStore(context, "vara_secure_session", "vara_member_token_v1", "token")
    fun read(): String? = blob.read()
    fun write(token: String?) = blob.write(token)
}

data class SavedMembershipCredentials(val identifier: String, val password: String)

/** بيانات دخول عضوية سبق مربوطة بالجهاز — تُملأ تلقائيًا في شاشة الدخول بعد أول نجاح. */
class SecureCredentialsStore(context: Context) {
    private val blob = SecureBlobStore(context, "vara_secure_credentials", "vara_member_credentials_v1", "membership")

    fun read(): SavedMembershipCredentials? {
        val raw = blob.read() ?: return null
        val sep = raw.indexOf('\u0000')
        if (sep <= 0 || sep >= raw.length - 1) return null
        val id = raw.substring(0, sep).trim()
        val pw = raw.substring(sep + 1)
        if (id.isEmpty() || pw.isEmpty()) return null
        return SavedMembershipCredentials(id, pw)
    }

    fun write(identifier: String, password: String) {
        val id = identifier.trim()
        if (id.isEmpty() || password.isEmpty()) return
        blob.write("$id\u0000$password")
    }

    fun clear() = blob.write(null)
}

enum class ThemeMode { SYSTEM, LIGHT, DARK }
data class Accent(val id: String, val arName: String, val light: Long, val dark: Long)
val accents = listOf(
    Accent("emerald", "أخضر", 0xFF0F766EL, 0xFF4DBAA6L),
    Accent("blue", "أزرق", 0xFF25639EL, 0xFF6CA3E8L),
    Accent("teal", "سماوي", 0xFF0E7685L, 0xFF55BDCEL),
    Accent("indigo", "نيلي", 0xFF4B5696L, 0xFF909CE2L),
    Accent("purple", "بنفسجي", 0xFF6E549EL, 0xFFAE95DEL),
    Accent("pink", "وردي", 0xFFA24A77L, 0xFFE08CB0L),
    Accent("red", "أحمر VARA", 0xFFBB3734L, 0xFFEA6863L),
    Accent("orange", "نحاسي", 0xFFAD6426L, 0xFFEA9E5EL),
    Accent("amber", "ذهبي", 0xFFA67B15L, 0xFFE0B647L),
    Accent("graphite", "رصاصي", 0xFF46505DL, 0xFF9CA8BAL),
)

class VaraPreferences(context: Context) {
    private val prefs = context.getSharedPreferences("vara_preferences", Context.MODE_PRIVATE)
    var language: String
        get() = prefs.getString("language", "ar") ?: "ar"
        set(value) { prefs.edit().putString("language", value).apply() }
    var theme: ThemeMode
        get() = runCatching { ThemeMode.valueOf(prefs.getString("theme", "SYSTEM")!!) }.getOrDefault(ThemeMode.SYSTEM)
        set(value) { prefs.edit().putString("theme", value.name).apply() }
    var accentId: String
        get() = prefs.getString("accent", "emerald") ?: "emerald"
        set(value) { prefs.edit().putString("accent", value).apply() }
    var onboardingSeen: Boolean
        get() = prefs.getBoolean("onboarding_v2", false)
        set(value) { prefs.edit().putBoolean("onboarding_v2", value).apply() }
    var favoriteCompetitionSlugs: Set<String>
        get() = prefs.getStringSet("favorite_competitions", null)?.toSet()
            ?: setOf("pro-league", "world-cup", "kings-cup", "uefa-super-cup", "la-liga", "premier-league")
        set(value) { prefs.edit().putStringSet("favorite_competitions", value).apply() }
    var followedMatchIds: Set<Int>
        get() = prefs.getStringSet("followed_matches", emptySet()).orEmpty().mapNotNull(String::toIntOrNull).toSet()
        set(value) { prefs.edit().putStringSet("followed_matches", value.map(Int::toString).toSet()).apply() }
    var favoriteTeamId: Int?
        get() = prefs.getInt("favorite_team_id", 0).takeIf { it > 0 }
        set(value) { if (value == null) prefs.edit().remove("favorite_team_id").apply() else prefs.edit().putInt("favorite_team_id", value).apply() }
    var favoriteTeamName: String
        get() = prefs.getString("favorite_team_name", "") ?: ""
        set(value) { prefs.edit().putString("favorite_team_name", value).apply() }
    var favoriteTeamLogo: String
        get() = prefs.getString("favorite_team_logo", "") ?: ""
        set(value) { prefs.edit().putString("favorite_team_logo", value).apply() }
    var favoriteTeamCompetitionSlug: String?
        get() = prefs.getString("favorite_team_comp_slug", null)?.takeIf { it.isNotBlank() }
        set(value) {
            prefs.edit().apply {
                if (value.isNullOrBlank()) remove("favorite_team_comp_slug") else putString("favorite_team_comp_slug", value)
            }.apply()
        }
    var favoriteTeamCompetitionName: String?
        get() = prefs.getString("favorite_team_comp_name", null)?.takeIf { it.isNotBlank() }
        set(value) {
            prefs.edit().apply {
                if (value.isNullOrBlank()) remove("favorite_team_comp_name") else putString("favorite_team_comp_name", value)
            }.apply()
        }
    // لقطة العضو الأخيرة — ترسم شاشة الحساب فورًا عند الإقلاع قبل تجديد الشبكة.
    var storedMemberJson: String?
        get() = prefs.getString("stored_member", null)
        set(value) { prefs.edit().apply { if (value == null) remove("stored_member") else putString("stored_member", value) }.apply() }
    // لقطات المباريات المتابَعة كاملة (نظير SpMatchFollows) — تعرض «مبارياتي» بلا شبكة.
    var followedFixturesJson: String?
        get() = prefs.getString("followed_fixtures", null)
        set(value) { prefs.edit().apply { if (value == null) remove("followed_fixtures") else putString("followed_fixtures", value) }.apply() }
    // إظهار بطاقات اللقطات الذكية داخل الواجهة (مفتاح محلي مستقل عن إشعار الدفع).
    var smartSnapsVisible: Boolean
        get() = prefs.getBoolean("smart_snaps_visible", true)
        set(value) { prefs.edit().putBoolean("smart_snaps_visible", value).apply() }
}

class VaraApi(private val context: Context, private val sessions: SecureSessionStore, private val preferences: VaraPreferences) {
    // كاش HTTP قرصي — يخدم الفتح المتكرر ووضع عدم الاتصال؛ ignoreCache يتجاوزه للتحديث القسري.
    private val httpCache = okhttp3.Cache(java.io.File(context.cacheDir, "vara_http_cache"), 20L * 1024 * 1024)
    private val client = OkHttpClient.Builder()
        .cache(httpCache)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS)
        .build()

    // يُستدعى من الـViewModel عند 401/403 على /api/v1 خارج مسارات الاعتماد —
    // لتأكيد انتهاء الجلسة بطلب ثانٍ قبل المسح (نظير spSessionUnauthorized في iOS).
    var onUnauthorized: (() -> Unit)? = null

    fun clearHttpCache() { runCatching { httpCache.evictAll() } }

    suspend fun publicGet(path: String, query: Map<String, String> = emptyMap(), ignoreCache: Boolean = false): JsonElement =
        request("GET", path, false, query = query, ignoreCache = ignoreCache)
    suspend fun memberGet(path: String, query: Map<String, String> = emptyMap(), ignoreCache: Boolean = false): JsonElement =
        request("GET", path, true, query = query, ignoreCache = ignoreCache)
    suspend fun memberPost(path: String, body: JsonObject): JsonElement = request("POST", path, true, body)
    suspend fun memberPut(path: String, body: JsonObject): JsonElement = request("PUT", path, true, body)
    suspend fun memberDelete(path: String, query: Map<String, String> = emptyMap(), body: JsonObject? = null): JsonElement = request("DELETE", path, true, body, query)

    private suspend fun request(
        method: String,
        path: String,
        memberApi: Boolean,
        body: JsonObject? = null,
        query: Map<String, String> = emptyMap(),
        ignoreCache: Boolean = false,
    ): JsonElement = withContext(Dispatchers.IO) {
        val root = if (memberApi) MEMBER_API else PUBLIC_API
        val builder = (root + if (path.startsWith('/')) path else "/$path").toHttpUrl().newBuilder()
        query.forEach { (key, value) -> builder.addQueryParameter(key, value) }
        val url = builder.build()
        val requestBody = (body ?: JsonObject(emptyMap())).toString().toRequestBody(jsonMediaType)
        val request = Request.Builder().url(url)
            .header("Accept", "application/json")
            .header("Accept-Language", preferences.language)
            .header("X-Platform", "android")
            .apply {
                if (ignoreCache) cacheControl(okhttp3.CacheControl.FORCE_NETWORK)
                // الحاجز الأهم: لا Bearer إلا لجذر /api/v1، مطابقة لإصلاح iOS.
                if (memberApi && url.encodedPath.startsWith("/api/v1/")) {
                    sessions.read()?.let { header("Authorization", "Bearer $it") }
                }
                when (method) {
                    "GET" -> get()
                    "POST" -> post(requestBody)
                    "PUT" -> put(requestBody)
                    "DELETE" -> if (body == null) delete() else delete(requestBody)
                }
            }.build()
        client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            val parsed = runCatching { json.parseToJsonElement(raw) }.getOrElse { JsonObject(emptyMap()) }
            if (!response.isSuccessful) {
                val serverMessage = (parsed as? JsonObject)?.string("message", "error")
                val message = serverMessage ?: when (response.code) {
                    401 -> "البيانات المدخلة غير صحيحة"
                    403 -> "هذا الحساب غير مفعّل أو محظور"
                    429 -> "محاولات كثيرة، حاول بعد قليل"
                    else -> "تعذّر إكمال الطلب (${response.code})"
                }
                // 401/403 على /api/v1 مع Bearer وخارج مسارات الاعتماد = جلسة يُشتبه بانتهائها.
                if (memberApi && (response.code == 401 || response.code == 403)) {
                    val p = url.encodedPath
                    val isCredentialCheck = p.contains("/auth/") || p.endsWith("/members/account") || p.contains("/members/change-password")
                    if (!isCredentialCheck && sessions.read() != null) onUnauthorized?.invoke()
                }
                throw ApiFailure(response.code, message)
            }
            parsed
        }
    }

    private val appVersionLabel: String
        get() = runCatching {
            val info = context.packageManager.getPackageInfo(context.packageName, 0)
            val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
            "${info.versionName} ($code)"
        }.getOrDefault("1.0.0 (1)")

    private fun deviceInfoJson(): JsonObject = buildJsonObject {
        put("platform", "android")
        put("osVersion", Build.VERSION.RELEASE)
        put("appVersion", appVersionLabel)
        put("deviceName", Build.MODEL)
        put("deviceId", Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID))
    }

    suspend fun login(identifier: String, password: String): Pair<String, Member?> {
        val isEmail = identifier.contains('@')
        val body = buildJsonObject {
            if (isEmail) put("email", identifier.trim().lowercase()) else put("phone", identifier.trim())
            put("password", password)
            put("deviceInfo", deviceInfoJson())
        }
        val root = memberPost("/auth/login", body).jsonObject
        if (root.bool("requires2FA") == true) {
            throw TwoFactorRequired(root.string("challengeToken") ?: throw ApiFailure(422, "تحدّي التحقق غير مكتمل"))
        }
        val token = root.string("token", "accessToken", "sessionToken")
            ?: root.obj("session")?.string("token")
            ?: throw ApiFailure(422, root.string("message") ?: "لم يُرجع الخادم جلسة")
        sessions.write(token)
        return token to parseMember(root["member"] ?: root["user"])
    }

    suspend fun verifyTwoFactor(challengeToken: String, code: String, backupCode: String? = null): Pair<String, Member?> {
        val root = memberPost("/auth/verify-2fa", buildJsonObject {
            put("challengeToken", challengeToken)
            if (backupCode.isNullOrBlank()) put("token", code) else put("backupCode", backupCode.trim())
            put("deviceInfo", deviceInfoJson())
        }).jsonObject
        val token = root.string("token", "accessToken", "sessionToken") ?: throw ApiFailure(422, root.string("message") ?: "لم يُرجع الخادم جلسة")
        sessions.write(token)
        return token to parseMember(root["member"] ?: root["user"])
    }

    suspend fun sendPhone(phone: String): JsonElement = memberPost("/auth/phone/send", buildJsonObject { put("phone", phone) })
    suspend fun verifyPhone(phone: String, code: String): Pair<String, Member?> {
        val root = memberPost("/auth/phone/verify", buildJsonObject {
            put("phone", phone); put("code", code)
            put("deviceInfo", deviceInfoJson())
        }).jsonObject
        if (root.bool("requires2FA") == true) {
            throw TwoFactorRequired(root.string("challengeToken") ?: throw ApiFailure(422, "تحدّي التحقق غير مكتمل"))
        }
        val token = root.string("token", "accessToken", "sessionToken") ?: throw ApiFailure(422, "لم يُرجع الخادم جلسة")
        sessions.write(token)
        return token to parseMember(root["member"] ?: root["user"])
    }

    suspend fun registerDevice(fcmToken: String, memberId: String?) {
        memberPost("/devices/register", buildJsonObject {
            put("deviceToken", fcmToken); put("platform", "android"); put("tokenProvider", "fcm")
            if (!memberId.isNullOrBlank()) put("userId", memberId)
            put("language", preferences.language); put("appVersion", appVersionLabel)
            put("osVersion", Build.VERSION.RELEASE); put("timezone", TimeZone.getDefault().id)
            put("bundleId", context.packageName)
            put("installationId", Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID))
        })
    }

    // تسجيل مشاهدة مركز المباراة للأعضاء — يغذّي «مبني على اهتمامك» ولوحة الولاء.
    suspend fun recordMatchView(fixture: Fixture) {
        memberPost("/sports/engagement", buildJsonObject {
            put("kind", "match_view")
            put("fixtureId", fixture.id)
            put("homeId", fixture.home.id)
            put("awayId", fixture.away.id)
            if (fixture.competitionSlug.isNotBlank()) put("competitionSlug", fixture.competitionSlug)
        })
    }

    suspend fun uploadAvatar(uri: Uri): Member? = withContext(Dispatchers.IO) {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw ApiFailure(422, "تعذّر قراءة الصورة")
        if (bytes.size > 5 * 1024 * 1024) throw ApiFailure(422, "حجم الصورة يجب أن يكون أقل من 5 ميجابايت")
        val mime = context.contentResolver.getType(uri)?.takeIf { it in setOf("image/jpeg", "image/png", "image/webp", "image/gif") }
            ?: when {
                bytes.size >= 2 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() -> "image/jpeg"
                bytes.size >= 4 && bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte() -> "image/png"
                else -> "image/jpeg"
            }
        val root = memberPost("/members/profile/image", buildJsonObject {
            put("image", "data:$mime;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}")
        }).jsonObject
        parseMember(root["member"] ?: root["user"])
    }
}

fun parseMember(e: JsonElement?): Member? {
    val o = e as? JsonObject ?: return null
    val points = o.int("loyaltyPoints", "points") ?: o.obj("loyalty")?.int("points", "balance") ?: 0
    val first = o.string("firstName")
    val last = o.string("lastName")
    val explicitName = o.string("name", "displayName")
    val resolvedName = explicitName ?: listOfNotNull(first, last).joinToString(" ").takeIf(String::isNotBlank)
    return Member(
        id = o.string("id", "userId") ?: return null,
        name = resolvedName ?: "عضو سبق",
        email = o.string("email") ?: "",
        phone = o.string("phone") ?: "",
        avatar = normalizeUrl(o.string("avatar", "profileImageUrl", "image")),
        loyaltyPoints = points,
        hasPassword = o.bool("hasPassword") ?: true,
        needsDisplayName = o.bool("needsDisplayName") ?: (explicitName.isNullOrBlank() && first.isNullOrBlank()),
    )
}

// تنسيق موحّد بتوقيت الرياض — نظير SpFormat في iOS: أسماء عربية + أرقام
// لاتينية + تقويم ميلادي (نتجنّب ar-SA الهجري)، والمنطقة Asia/Riyadh دائمًا
// كي يرى كل المستخدمين نفس اليوم/الوقت الذي يراه iOS والويب.
object VaraFormat {
    val riyadh: ZoneId = ZoneId.of("Asia/Riyadh")

    // تُحدَّث من VaraViewModel عند تبديل اللغة.
    @Volatile var displayLang: String = "ar"

    private val cache = java.util.concurrent.ConcurrentHashMap<String, DateTimeFormatter>()

    private fun fmt(pattern: String): DateTimeFormatter {
        val key = "$pattern|$displayLang"
        return cache.getOrPut(key) {
            val locale = if (displayLang == "en") Locale.US else Locale.forLanguageTag("ar")
            DateTimeFormatter.ofPattern(pattern, locale)
                .withDecimalStyle(java.time.format.DecimalStyle.STANDARD)
                .withZone(riyadh)
        }
    }

    fun instantOf(fixture: Fixture): Instant? = fixture.kickoffMs?.let(Instant::ofEpochMilli)

    fun time(instant: Instant?): String = instant?.let { fmt("HH:mm").format(it) } ?: ""
    fun weekdayName(instant: Instant): String = fmt("EEEE").format(instant)
    fun dayOfMonth(instant: Instant): String = fmt("d").format(instant)
    fun monthName(instant: Instant): String = fmt("MMMM").format(instant)
    fun dayMonthLabel(instant: Instant): String = fmt("d MMMM").format(instant)
    fun mediumDate(instant: Instant): String = fmt("d MMMM yyyy").format(instant)
    fun dateKey(instant: Instant): String = DateTimeFormatter.ISO_LOCAL_DATE.format(instant.atZone(riyadh).toLocalDate())

    fun localDate(instant: Instant): LocalDate = instant.atZone(riyadh).toLocalDate()
    fun today(): LocalDate = LocalDate.now(riyadh)

    /// «اليوم · الأحد 5 أكتوبر» / «غدًا · …» / «أمس · …» أو «الأحد · 5 أكتوبر».
    fun dateLabel(date: LocalDate): String {
        val en = displayLang == "en"
        val today = today()
        val rel = when (date) {
            today -> if (en) "Today" else "اليوم"
            today.plusDays(1) -> if (en) "Tomorrow" else "غدًا"
            today.minusDays(1) -> if (en) "Yesterday" else "أمس"
            else -> null
        }
        val instant = date.atStartOfDay(riyadh).toInstant()
        val body = "${weekdayName(instant)} ${dayMonthLabel(instant)}"
        return if (rel != null) "$rel · $body" else body
    }
}

fun fixtureKickoff(fixture: Fixture): String {
    val instant = VaraFormat.instantOf(fixture) ?: return fixture.date.orEmpty()
    return "${VaraFormat.time(instant)} · ${VaraFormat.dayMonthLabel(instant)}"
}

fun latinNumber(value: Int?): String = value?.toString() ?: "–"

// ساعة المباراة الموحّدة — نظير SpMatchClock في iOS: دقيقة ذاتية العدّ من
// مرساة الخادم clockStartEpoch، ونص المزوّد في بدل الضائع والحالات الموقوفة.
object MatchClock {
    /// أقصى دقيقة منطقية (120 + بدل ضائع) — صمّام أمان ضد مرساة فاسدة.
    const val SANITY_CAP_MINUTES = 130

    /// نص الحالات الموقوفة (استراحة/ترجيح/…) — null إن كانت الساعة تعمل.
    fun pausedLabel(status: MatchStatus): String? = when (status.code.uppercase()) {
        "HT", "HALF_TIME" -> "استراحة"
        "BT", "BREAK" -> "استراحة إضافي"
        "P", "PEN" -> "ركلات"
        "SUSP" -> "موقوفة"
        "INT" -> "متوقّفة"
        else -> null
    }

    /// دقيقة المزوّد الثابتة («63'» أو «45+2'») — المرجع بلا مرساة وفي بدل الضائع.
    fun providerMinute(status: MatchStatus): String {
        val e = status.elapsed ?: return status.label
        val extra = status.extra
        return if (extra != null && extra > 0) "$e+$extra'" else "$e'"
    }

    /// هل العدّاد الذاتي هو المعروض الآن؟ (جارية + مرساة + خارج بدل الضائع)
    fun isSelfTicking(status: MatchStatus): Boolean =
        status.live && !status.finished &&
            (status.clockStartEpoch ?: 0L) > 0L &&
            (status.extra ?: 0) == 0 &&
            pausedLabel(status) == null

    /// الدقيقة للعرض لحظة nowMs: من المرساة إن كانت الساعة جارية، وإلا نص المزوّد.
    fun minuteText(status: MatchStatus, nowMs: Long = System.currentTimeMillis()): String {
        pausedLabel(status)?.let { return it }
        val provider = providerMinute(status)
        val epoch = status.clockStartEpoch ?: return provider
        if (!isSelfTicking(status)) return provider
        val elapsedSec = nowMs / 1000.0 - epoch
        if (elapsedSec < 0) return provider
        val m = maxOf(1, (elapsedSec / 60.0).toInt() + 1)
        if (m > SANITY_CAP_MINUTES) return provider
        return "$m'"
    }
}
