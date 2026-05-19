package com.sabq.smart

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import okhttp3.OkHttpClient

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
