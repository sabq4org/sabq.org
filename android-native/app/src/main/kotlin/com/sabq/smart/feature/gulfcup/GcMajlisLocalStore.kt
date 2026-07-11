package com.sabq.smart.feature.gulfcup

import android.content.Context
import android.net.Uri
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

internal fun sanitizeGcMajlisInviteInput(raw: String): String = raw
    .trim()
    .uppercase(Locale.ROOT)
    .filter { it in 'A'..'Z' || it in '0'..'9' }
    .take(8)

internal fun normalizeGcMajlisInviteCode(raw: String?): String? {
    val code = raw?.let(::sanitizeGcMajlisInviteInput) ?: return null
    return code.takeIf { it.length in 4..8 }
}

/**
 * Persistent bridge for App Links, custom-scheme links and notification taps.
 * The target deliberately survives login and process death; it is consumed only
 * after the member explicitly joins/cancels an invite or opens the addressed
 * council. This mirrors `GcAppRouter` on iOS.
 */
@Singleton
class GcMajlisLocalStore @Inject constructor(
    @ApplicationContext context: Context,
) {
    sealed interface Target {
        data class Invite(val code: String) : Target
        data class Majlis(val id: String, val fixtureId: Int? = null) : Target
    }

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val _target = MutableStateFlow(restoreTarget())
    val target: StateFlow<Target?> = _target.asStateFlow()

    fun capture(uri: Uri?): Boolean {
        uri ?: return false
        val scheme = uri.scheme.orEmpty().lowercase()
        val host = uri.host.orEmpty().lowercase()
        val path = uri.path.orEmpty().lowercase().trimEnd('/')
        val universal = scheme in setOf("https", "http") &&
            host in setOf("sabq.org", "www.sabq.org") &&
            (path == "/gulf-cup/majlis" || path.startsWith("/gulf-cup/majlis/"))
        val custom = scheme in setOf("sabqgulfcup", "gulfcup") &&
            (host == "majlis" || path == "/majlis")
        if (!universal && !custom) return false

        val code = validCode(uri.getQueryParameter("code"))
        if (code != null) {
            setTarget(Target.Invite(code))
            return true
        }
        val pathId = if (universal) {
            val segments = uri.pathSegments
            val majlisIndex = segments.indexOfFirst { it.equals("majlis", ignoreCase = true) }
            if (majlisIndex >= 0) segments.getOrNull(majlisIndex + 1) else null
        } else null
        val id = (uri.getQueryParameter("id") ?: pathId)?.trim()?.takeIf { it.isNotEmpty() && it.length <= 128 }
        if (id != null) {
            setTarget(Target.Majlis(id, validFixture(uri.getQueryParameter("fixture"))))
            return true
        }
        return false
    }

    fun captureMajlis(code: String? = null, id: String? = null, fixtureId: String? = null): Boolean {
        validCode(code)?.let {
            setTarget(Target.Invite(it))
            return true
        }
        id?.trim()?.takeIf { it.isNotEmpty() && it.length <= 128 }?.let {
            setTarget(Target.Majlis(it, validFixture(fixtureId)))
            return true
        }
        return false
    }

    fun consume() {
        prefs.edit().remove(KEY_CODE).remove(KEY_ID).remove(KEY_FIXTURE).apply()
        _target.value = null
    }

    fun shouldShowOnboarding(userId: String, majlisId: String): Boolean =
        prefs.getInt("$KEY_ONBOARDING_PREFIX$userId:$majlisId", 0) < ONBOARDING_VERSION

    fun markOnboardingSeen(userId: String, majlisId: String) {
        prefs.edit().putInt("$KEY_ONBOARDING_PREFIX$userId:$majlisId", ONBOARDING_VERSION).apply()
    }

    private fun setTarget(target: Target) {
        prefs.edit().apply {
            when (target) {
                is Target.Invite -> putString(KEY_CODE, target.code).remove(KEY_ID).remove(KEY_FIXTURE)
                is Target.Majlis -> {
                    putString(KEY_ID, target.id).remove(KEY_CODE)
                    if (target.fixtureId != null) putInt(KEY_FIXTURE, target.fixtureId) else remove(KEY_FIXTURE)
                }
            }
        }.apply()
        _target.value = target
    }

    private fun restoreTarget(): Target? {
        validCode(prefs.getString(KEY_CODE, null))?.let { return Target.Invite(it) }
        return prefs.getString(KEY_ID, null)
            ?.trim()
            ?.takeIf { it.isNotEmpty() && it.length <= 128 }
            ?.let { id ->
                val storedFixture = when (val value = prefs.all[KEY_FIXTURE]) {
                    is Int -> value.takeIf { it > 0 }
                    is String -> validFixture(value)
                    else -> null
                }
                Target.Majlis(id, storedFixture)
            }
    }

    private fun validCode(raw: String?): String? {
        return normalizeGcMajlisInviteCode(raw)
    }

    private fun validFixture(raw: String?): Int? = raw?.trim()?.toIntOrNull()?.takeIf { it > 0 }

    companion object {
        private const val PREFS = "gc_majlis_v1"
        private const val KEY_CODE = "pending_invite_code"
        private const val KEY_ID = "pending_majlis_id"
        private const val KEY_FIXTURE = "pending_fixture_id"
        private const val KEY_ONBOARDING_PREFIX = "onboarding_version_"
        private const val ONBOARDING_VERSION = 1
    }
}
