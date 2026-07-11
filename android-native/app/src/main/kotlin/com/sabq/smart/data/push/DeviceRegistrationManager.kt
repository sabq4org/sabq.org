package com.sabq.smart.data.push

import android.content.Context
import android.os.Build
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import com.sabq.smart.BuildConfig
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.api.DeviceRegisterRequest
import com.sabq.smart.data.api.DeviceUnregisterRequest
import com.sabq.smart.data.api.MemberPushTokenDeleteRequest
import com.sabq.smart.data.api.MemberPushTokenRequest
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
        val registered = registerToken(token = token, userId = userId)
        if (registered && userId != null) registerGulfCupToken(token)
    }

    /** Public re-trigger — useful for a "Resend registration" debug button. */
    suspend fun refresh() {
        val userId = authRepo.user.value?.id
        reconcile(userId)
    }

    /** Sign-out helper. Drops the row on the server and clears our cache. */
    suspend fun unregister() {
        val cached = store.current()
        // A member-scoped registration can succeed even when the generic
        // registration/cache failed. Resolve the live FCM token as a privacy
        // fallback so logout still deactivates that account-bound row.
        val token = cached.token ?: fetchFcmToken()
        if (token == null) {
            store.clear()
            return
        }
        runCatching { api.unregisterMemberPushToken(MemberPushTokenDeleteRequest(token)) }
            .onFailure { Log.w(TAG, "unregisterMemberPushToken failed", it) }
        runCatching { api.unregisterDevice(DeviceUnregisterRequest(deviceToken = token)) }
            .onFailure { Log.w(TAG, "unregisterDevice failed", it) }
        store.clear()
    }

    /**
     * Tags the current FCM token for the Gulf Cup app-scoped outbox. The server
     * filters Majlis deliveries by this bundle marker, including on Android.
     */
    suspend fun syncGulfCupToken() {
        if (authRepo.user.value == null) return
        val token = fetchFcmToken() ?: return
        registerGulfCupToken(token)
    }

    private suspend fun registerGulfCupToken(token: String) {
        val request = MemberPushTokenRequest(
            token = token,
            provider = "fcm",
            platform = "android",
            deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
            osVersion = "Android ${Build.VERSION.RELEASE}",
            appVersion = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
            locale = Locale.getDefault().toLanguageTag(),
            timezone = TimeZone.getDefault().id,
            bundleId = GULF_CUP_BUNDLE_MARKER,
            installationId = store.installationId(),
        )
        runCatching { api.registerMemberPushToken(request) }
            .onSuccess { response ->
                if (response.success) Log.i(TAG, "Gulf Cup FCM token tagged for Majlis delivery")
                else Log.w(TAG, "Gulf Cup token registration rejected: ${response.message.orEmpty()}")
            }
            .onFailure { Log.w(TAG, "Gulf Cup token registration failed", it) }
    }

    private suspend fun reconcile(userId: String?) {
        val token = fetchFcmToken() ?: return
        val cached = store.current()
        val unchanged = cached.token == token && cached.userId == userId
        if (unchanged) {
            Log.d(TAG, "Device already registered for user=$userId, skipping")
            // The app-scoped write is idempotent and deliberately retried once
            // per authenticated app start. It repairs a previous member-token
            // failure that the generic registration cache cannot observe.
            if (userId != null) registerGulfCupToken(token)
            return
        }
        val registered = registerToken(token = token, userId = userId)
        // Generic registration can never grant the sensitive Majlis marker;
        // immediately prove/refresh it through the authenticated endpoint.
        if (registered && userId != null) registerGulfCupToken(token)
    }

    private suspend fun registerToken(token: String, userId: String?): Boolean {
        return runCatching { api.registerDevice(buildRequest(token = token)) }
            .fold(
                onSuccess = { response ->
                    if (!response.success) {
                        Log.w(TAG, "Device registration rejected: ${response.message.orEmpty()}")
                        return@fold false
                    }
                    Log.i(TAG, "Device registered (deviceId=${response.deviceId}, userId=$userId)")
                    store.set(token = token, userId = userId, deviceId = response.deviceId)
                    true
                },
                onFailure = {
                    Log.w(TAG, "registerDevice failed", it)
                    false
                },
            )
    }

    private suspend fun fetchFcmToken(): String? {
        return runCatching {
            FirebaseMessaging.getInstance().token.await()
        }
            .onFailure { Log.w(TAG, "FCM token unavailable (is google-services.json present?)", it) }
            .getOrNull()
            ?.takeIf { it.isNotBlank() }
    }

    private suspend fun buildRequest(token: String): DeviceRegisterRequest =
        DeviceRegisterRequest(
            deviceToken = token,
            platform = "android",
            deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
            osVersion = "Android ${Build.VERSION.RELEASE}",
            appVersion = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
            locale = Locale.getDefault().toLanguageTag(),
            timezone = TimeZone.getDefault().id,
            installationId = store.installationId(),
        )

    companion object {
        private const val TAG = "DeviceRegistrationMgr"
        const val GULF_CUP_BUNDLE_MARKER = "com.sabq.gulfcup"
    }
}
