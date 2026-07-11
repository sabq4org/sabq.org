package com.sabq.smart.data.push

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
import java.util.UUID

private val Context.deviceStore by preferencesDataStore(name = "device_prefs")

private val LAST_REGISTERED_TOKEN = stringPreferencesKey("last_registered_token")
private val LAST_REGISTERED_USER = stringPreferencesKey("last_registered_user")
private val LAST_REGISTERED_DEVICE_ID = stringPreferencesKey("last_registered_device_id")
private val INSTALLATION_ID = stringPreferencesKey("installation_id")

/**
 * Stable record of the (FCM token, user id) pair that the
 * editorial-push backend most recently confirmed. Lets
 * [DeviceRegistrationManager] skip a no-op re-POST on every app
 * launch — we only hit `/devices/register` again when one of the two
 * keys actually changed.
 */
@Singleton
class DeviceRegistrationStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    data class Snapshot(
        val token: String?,
        val userId: String?,
        val deviceId: String?,
    )

    val snapshot: Flow<Snapshot> = context.deviceStore.data.map { prefs ->
        Snapshot(
            token = prefs[LAST_REGISTERED_TOKEN],
            userId = prefs[LAST_REGISTERED_USER],
            deviceId = prefs[LAST_REGISTERED_DEVICE_ID],
        )
    }

    suspend fun current(): Snapshot = snapshot.first()

    suspend fun set(token: String, userId: String?, deviceId: String?) {
        context.deviceStore.edit { prefs ->
            prefs[LAST_REGISTERED_TOKEN] = token
            if (userId != null) prefs[LAST_REGISTERED_USER] = userId else prefs.remove(LAST_REGISTERED_USER)
            if (deviceId != null) prefs[LAST_REGISTERED_DEVICE_ID] = deviceId else prefs.remove(LAST_REGISTERED_DEVICE_ID)
        }
    }

    /** Stable install identifier, equivalent to the iOS IDFV role. */
    suspend fun installationId(): String {
        context.deviceStore.data.first()[INSTALLATION_ID]?.let { return it }
        val generated = UUID.randomUUID().toString().lowercase()
        context.deviceStore.edit { it[INSTALLATION_ID] = generated }
        return generated
    }

    suspend fun clear() {
        context.deviceStore.edit { prefs ->
            prefs.remove(LAST_REGISTERED_TOKEN)
            prefs.remove(LAST_REGISTERED_USER)
            prefs.remove(LAST_REGISTERED_DEVICE_ID)
            // Keep INSTALLATION_ID stable across logout/account switches.
        }
    }
}
