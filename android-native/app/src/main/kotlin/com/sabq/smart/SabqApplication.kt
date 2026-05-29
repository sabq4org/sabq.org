package com.sabq.smart

import android.app.Application
import android.util.Log
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import com.google.firebase.FirebaseApp
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.auth.AuthTokenStore
import com.sabq.smart.data.LoyaltyEventQueue
import com.sabq.smart.data.analytics.SabqAnalytics
import com.sabq.smart.data.push.DeviceRegistrationManager
import com.sabq.smart.data.push.SabqMessagingService
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import java.io.IOException

/**
 * Implements [ImageLoaderFactory] so Coil's global `ImageLoader.get()`
 * resolves to our Hilt-provided [OkHttpClient] — the one carrying our
 * User-Agent header and HTTP logging. Without this, Coil spins up its
 * own bare OkHttp client that some image CDNs (Cloudflare Images
 * variants in particular) sometimes treat as a bot.
 */
@HiltAndroidApp
class SabqApplication : Application(), ImageLoaderFactory {

    @Inject lateinit var okHttpClient: OkHttpClient
    @Inject lateinit var deviceRegistrationManager: DeviceRegistrationManager
    @Inject lateinit var loyaltyEventQueue: LoyaltyEventQueue
    @Inject lateinit var authRepository: AuthRepository
    @Inject lateinit var authTokenStore: AuthTokenStore

    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        installCrashGuard()

        // GA4 Measurement Protocol — Sabq Android App (MP) stream in the
        // Sabq GA3 - GA4 property (shared with web + iOS). Initialised
        // before any feature code so the first events from app boot get
        // captured. Auto-tracks user_id changes from AuthRepository.
        // Cheap (stores refs + launches a collector), so it stays on the
        // synchronous path to catch the earliest boot events.
        SabqAnalytics.start(this, okHttpClient, authRepository, applicationScope)

        // Loyalty event queue — restore pending events from disk + start
        // the 30s flush loop. Fire-and-forget caller sites
        // (BehaviorTracker, like/share/comment toggles) depend on this
        // being resident from app launch so events buffer correctly
        // before the user signs in. Mirrors iOS
        // `LoyaltyEventQueue.shared`. (Internally launches on
        // applicationScope, so this returns immediately.)
        loyaltyEventQueue.start(applicationScope)

        // Defer the heavier boot work off the main thread so it doesn't
        // extend cold-start time-to-first-frame:
        //   • token-cache warm  — DataStore read (see AuthTokenStore)
        //   • FirebaseApp init  — synchronous, tens of ms
        //   • FCM channel + device registration — depend on Firebase
        // All are thread-safe; the auth interceptor still has a one-time
        // blocking fallback if a request beats the token prime.
        applicationScope.launch {
            runCatching { authTokenStore.prime() }
            initialiseFirebase()
            SabqMessagingService.ensureChannel(this@SabqApplication)
            deviceRegistrationManager.start(applicationScope)
        }

        // Flush pending loyalty events when the user backgrounds the
        // app. iOS does the same in `sabqApp.swift` via the
        // `.onChange(of: scenePhase)` hook. Best-effort — failures
        // stay queued.
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) {
                applicationScope.launch {
                    runCatching { loyaltyEventQueue.flushNow() }
                }
            }
        })
    }

    /**
     * Firebase needs an explicit init only when `google-services.json`
     * + the `com.google.gms.google-services` Gradle plugin aren't both
     * present — when they are, the build-time generated `R.string.*`
     * defaults wire FirebaseApp automatically before any code runs.
     *
     * We attempt it defensively so the build still runs end-to-end in
     * environments missing the JSON (CI, fresh checkouts) without
     * crashing the entire app. The FCM features just degrade — the
     * token fetch in [DeviceRegistrationManager.fetchFcmToken] catches
     * the "Default FirebaseApp is not initialised" exception and logs.
     *
     * See `docs/FCM_SETUP.md` for the one-time setup steps.
     */
    private fun initialiseFirebase() {
        runCatching { FirebaseApp.initializeApp(this) }
            .onFailure { Log.w("SabqApplication", "FirebaseApp init skipped — google-services.json missing", it) }
    }

    /**
     * Last-line defence against transient network errors crashing the
     * whole process. Reported 2026-05-20: the emulator lost DNS and
     * the app died with `UnknownHostException` propagating out of an
     * unprotected coroutine somewhere in the stack. We can't reliably
     * audit every `launch { … }` site by hand, so we install a JVM
     * uncaught-handler that swallows IOException-family throwables
     * (DNS, timeouts, connection resets) and lets the existing
     * default handler deal with everything else (NullPointerException,
     * ClassCastException, etc — those are real bugs we want to crash
     * on, not network blips).
     */
    private fun installCrashGuard() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            if (isNetworkBlip(throwable)) {
                Log.w(
                    "SabqApplication",
                    "Swallowed network exception on thread=${thread.name}",
                    throwable,
                )
                return@setDefaultUncaughtExceptionHandler
            }
            previous?.uncaughtException(thread, throwable)
        }
    }

    private fun isNetworkBlip(t: Throwable): Boolean {
        var c: Throwable? = t
        while (c != null) {
            if (c is IOException) return true
            // CancellationException — coroutine cancellation, not a bug.
            if (c is kotlinx.coroutines.CancellationException) return true
            c = c.cause
        }
        return false
    }

    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this)
            .okHttpClient(okHttpClient)
            .crossfade(true)
            .memoryCache {
                MemoryCache.Builder(this)
                    .maxSizePercent(0.20)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("image_cache"))
                    .maxSizeBytes(100L * 1024 * 1024) // 100 MB
                    .build()
            }
            .build()
}
