package com.sabq.smart.data.push

import android.content.Context
import android.os.Build
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import com.sabq.smart.BuildConfig
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.api.DeviceRegisterRequest
import com.sabq.smart.data.api.DeviceUnregisterRequest
import com.sabq.smart.data.api.SabqApi
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.Locale
import java.util.TimeZone

/**
 * Orchestrates FCM device registration with the editorial-push backend
 * (`POST /api/v1/devices/register`).
 *
 * Lifecycle:
 *   1. App start (via [SabqApplication]) → [start] is called once.
 *   2. We observe [AuthRepository.user]; whenever the signed-in user
 *      changes we re-register so the server can target pushes by
 *      `users.id`. Anonymous launches still register (server stores
 *      `userId = null`) so editorial broadcasts can hit guests too.
 *   3. [SabqMessagingService.onNewToken] calls [refresh] when Firebase
 *      rotates the FCM token.
 *   4. On sign-out, [unregister] drops the row.
 *
 * Registration is idempotent: [DeviceRegistrationStore] caches the
 * last successful (token, userId) pair, so re-launches don't pound the
 * endpoint unless something actually changed.
 *
 * **Firebase init dependency:** [FirebaseMessaging.getInstance].token
 * requires the default `FirebaseApp` to be initialized, which happens
 * automatically once `google-services.json` is dropped into `app/` and
 * the `com.google.gms.google-services` Gradle plugin is applied — see
 * `docs/FCM_SETUP.md`. Until then this manager logs the failure and
 * exits gracefully; nothing else in the app depends on it.
 */
@Singleton
class DeviceRegistrationManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: SabqApi,
    private val authRepo: AuthRepository,
    private val store: DeviceRegistrationStore,
) {

    /** Wire up. Call once from [SabqApplication.onCreate]. */
    fun start(scope: CoroutineScope) {
        scope.launch {
            authRepo.user
                .map { it?.id }
                .distinctUntilChanged()
                .collectLatest { userId -> reconcile(userId) }
        }
    }

    /** Called by [SabqMessagingService] when FCM rotates our token. */
    suspend fun onNewToken(token: String) {
        val userId = authRepo.user.value?.id
        registerToken(token = token, userId = userId)
    }

    /** Public re-trigger — useful for a "Resend registration" debug button. */
    suspend fun refresh() {
        val userId = authRepo.user.value?.id
        reconcile(userId)
    }

    /** Sign-out helper. Drops the row on the server and clears our cache. */
    suspend fun unregister() {
        val cached = store.current()
        val token = cached.token ?: return
        runCatching { api.unregisterDevice(DeviceUnregisterRequest(deviceToken = token)) }
            .onFailure { Log.w(TAG, "unregisterDevice failed", it) }
        store.clear()
    }

    private suspend fun reconcile(userId: String?) {
        val token = fetchFcmToken() ?: return
        val cached = store.current()
        val unchanged = cached.token == token && cached.userId == userId
        if (unchanged) {
            Log.d(TAG, "Device already registered for user=$userId, skipping")
            return
        }
        registerToken(token = token, userId = userId)
    }

    private suspend fun registerToken(token: String, userId: String?) {
        runCatching {
            api.registerDevice(buildRequest(token = token, userId = userId))
        }
            .onSuccess { response ->
                Log.i(TAG, "Device registered (deviceId=${response.deviceId}, userId=$userId)")
                store.set(token = token, userId = userId, deviceId = response.deviceId)
            }
            .onFailure { Log.w(TAG, "registerDevice failed", it) }
    }

    private suspend fun fetchFcmToken(): String? {
        return runCatching {
            FirebaseMessaging.getInstance().token.await()
        }
            .onFailure { Log.w(TAG, "FCM token unavailable (is google-services.json present?)", it) }
            .getOrNull()
            ?.takeIf { it.isNotBlank() }
    }

    private fun buildRequest(token: String, userId: String?): DeviceRegisterRequest =
        DeviceRegisterRequest(
            deviceToken = token,
            platform = "android",
            deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
            osVersion = "Android ${Build.VERSION.RELEASE}",
            appVersion = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
            locale = Locale.getDefault().toLanguageTag(),
            timezone = TimeZone.getDefault().id,
            userId = userId,
        )

    companion object {
        private const val TAG = "DeviceRegistrationMgr"
    }
}
