package com.sabq.smart.data.auth

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.authDataStore by preferencesDataStore(name = "auth_prefs")
private val TOKEN_KEY = stringPreferencesKey("bearer_token")

/**
 * Bearer-token storage backed by DataStore Preferences. iOS persists
 * the same token in Keychain via `KeychainStore.save(forKey: "authToken")`
 * (Services/APIClient.swift line 7). Android DataStore is the
 * idiomatic equivalent — encrypted on-device, async-friendly.
 *
 * Excluded from auto-backup + cloud-restore via
 * `res/xml/backup_rules.xml`.
 */
@Singleton
class AuthTokenStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    val token: Flow<String?> = context.authDataStore.data.map { it[TOKEN_KEY] }

    // In-memory mirror of the persisted token. The auth interceptor runs
    // on every HTTP request; reading DataStore there via `runBlocking`
    // blocked an OkHttp dispatcher thread per call. We keep a volatile
    // copy here so the hot path is a plain field read. `primed` tells the
    // interceptor whether the mirror is trustworthy yet — before the
    // first read it falls back to a one-time blocking load.
    @Volatile
    private var cached: String? = null

    @Volatile
    private var primed: Boolean = false

    /** Non-blocking accessor for the hot path. Null when not [primed]. */
    fun cachedToken(): String? = cached

    fun isPrimed(): Boolean = primed

    suspend fun current(): String? {
        val value = token.first()
        cached = value
        primed = true
        return value
    }

    /** Load the token into memory once (call at app start to warm the cache). */
    suspend fun prime() {
        if (!primed) current()
    }

    suspend fun set(value: String?) {
        context.authDataStore.edit { prefs ->
            if (value.isNullOrBlank()) prefs.remove(TOKEN_KEY)
            else prefs[TOKEN_KEY] = value
        }
        cached = value?.takeIf { it.isNotBlank() }
        primed = true
    }

    suspend fun clear() = set(null)
}
