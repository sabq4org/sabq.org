package com.sabq.smart.data.api

import android.content.Context
import com.sabq.smart.BuildConfig
import com.sabq.smart.data.auth.AuthTokenStore
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.io.File
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.Cache
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit

/**
 * Sabq's web origin — both the Bearer mobile routes (under `api/v1`)
 * and the public Passport routes (under `api`) live under this host.
 * Mirrors iOS `URLConstants.webOrigin`.
 *
 * After the May 2026 split-topology migration, `api.sabq.org` became
 * the canonical API host but `sabq.org` proxies the `api` namespace to
 * it transparently — keeping the iOS URL contract stable. We follow
 * the same convention here.
 *
 * ⚠️ Do NOT swap to a local-dev URL (e.g. `http://10.0.2.2:5001/`) and
 * commit it — that breaks every install on a real device. Use a
 * BuildConfig field + flavour if you need a dev override.
 */
private const val BASE_URL = "https://sabq.org/"

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        useAlternativeNames = true
        coerceInputValues = true
        explicitNulls = false
    }

    @Provides
    @Singleton
    fun provideAuthInterceptor(tokenStore: AuthTokenStore): Interceptor = Interceptor { chain ->
        // Hot path: read the in-memory token mirror (a plain field). Only
        // the very first request before the cache is primed pays a
        // one-time blocking DataStore read; everything after is lock-free.
        val token = if (tokenStore.isPrimed()) {
            tokenStore.cachedToken()
        } else {
            runBlocking { tokenStore.current() }
        }
        val request = chain.request().newBuilder().apply {
            header("Accept", "application/json")
            header("User-Agent", "Sabq-Android/${BuildConfig.VERSION_NAME}")
            token?.let { header("Authorization", "Bearer $it") }
        }.build()
        chain.proceed(request)
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(
        @ApplicationContext context: Context,
        authInterceptor: Interceptor,
    ): OkHttpClient {
        val builder = OkHttpClient.Builder().apply {
            // HTTP disk cache. Honours the server's Cache-Control headers:
            // public GETs (article lists, sections) get served from disk on
            // repeat opens / offline; personalised or `no-store` responses
            // are never cached, so no auth-scoped data leaks. 20 MB is
            // plenty for JSON payloads (images cache separately via Coil).
            cache(Cache(File(context.cacheDir, "http_cache"), 20L * 1024 * 1024))

            // Railway can take 10-20s on a cold start of a Fluid Compute
            // instance. Default 10s timeouts were tripping on real
            // devices and propagating as uncaught SocketTimeoutException
            // → app crash. 30s read is generous but matches what iOS
            // uses (URLSession.timeoutIntervalForRequest = 30).
            connectTimeout(15, TimeUnit.SECONDS)
            readTimeout(30, TimeUnit.SECONDS)
            writeTimeout(15, TimeUnit.SECONDS)
            addInterceptor(authInterceptor)
            if (BuildConfig.DEBUG) {
                addInterceptor(
                    HttpLoggingInterceptor().apply {
                        // BASIC = method + URL + status. BODY prints
                        // every byte of every payload (article HTML can
                        // be 50-300 KB) which pressures the LogBuffer
                        // and slows the UI under poor network.
                        level = HttpLoggingInterceptor.Level.BASIC
                    },
                )
            }
        }
        return builder.build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient, json: Json): Retrofit {
        val contentType = "application/json".toMediaType()
        return Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()
    }

    @Provides
    @Singleton
    fun provideSabqApi(retrofit: Retrofit): SabqApi = retrofit.create(SabqApi::class.java)
}
