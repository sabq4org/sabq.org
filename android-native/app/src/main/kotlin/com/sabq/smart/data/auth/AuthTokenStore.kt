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

    suspend fun current(): String? = token.first()

    suspend fun set(value: String?) {
        context.authDataStore.edit { prefs ->
            if (value.isNullOrBlank()) prefs.remove(TOKEN_KEY)
            else prefs[TOKEN_KEY] = value
        }
    }

    suspend fun clear() = set(null)
}
