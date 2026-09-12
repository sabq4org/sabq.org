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
private val ENCRYPTED_TOKEN_KEY = stringPreferencesKey("bearer_token_encrypted_v1")
private val TOKEN_KEY = stringPreferencesKey("bearer_token")

/** Keystore-encrypted bearer storage with atomic migration from legacy plaintext.
 * The DataStore file is excluded from both cloud backup and device transfer.
 */
@Singleton
class AuthTokenStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    val token: Flow<String?> = context.authDataStore.data.map { prefs ->
        prefs[ENCRYPTED_TOKEN_KEY]?.let(AuthTokenCipher::decrypt) ?: if (prefs[ENCRYPTED_TOKEN_KEY] == null) prefs[TOKEN_KEY] else null
    }

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
        context.authDataStore.edit { prefs ->
            val legacy = prefs[TOKEN_KEY]
            if (prefs[ENCRYPTED_TOKEN_KEY] == null && !legacy.isNullOrBlank()) {
                // If encryption fails, the transaction leaves the original intact.
                prefs[ENCRYPTED_TOKEN_KEY] = AuthTokenCipher.encrypt(legacy)
            }
            if (prefs[ENCRYPTED_TOKEN_KEY] != null) prefs.remove(TOKEN_KEY)
        }
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
            if (value.isNullOrBlank()) prefs.remove(ENCRYPTED_TOKEN_KEY)
            else prefs[ENCRYPTED_TOKEN_KEY] = AuthTokenCipher.encrypt(value)
            prefs.remove(TOKEN_KEY)
        }
        cached = value?.takeIf { it.isNotBlank() }
        primed = true
    }

    suspend fun clear() = set(null)
}
