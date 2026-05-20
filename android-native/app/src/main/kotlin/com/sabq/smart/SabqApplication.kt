package com.sabq.smart

import android.app.Application
import android.util.Log
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
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

    override fun onCreate() {
        super.onCreate()
        installCrashGuard()
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
