package com.sabq.smart.data.api

import com.sabq.smart.BuildConfig
import com.sabq.smart.data.auth.AuthTokenStore
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
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
 */
private const val BASE_URL = "http://10.0.2.2:5001/"

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
        val token = runBlocking { tokenStore.current() }
        val request = chain.request().newBuilder().apply {
            header("Accept", "application/json")
            header("User-Agent", "Sabq-Android/${BuildConfig.VERSION_NAME}")
            token?.let { header("Authorization", "Bearer $it") }
        }.build()
        chain.proceed(request)
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(authInterceptor: Interceptor): OkHttpClient {
        val builder = OkHttpClient.Builder().apply {
            addInterceptor(authInterceptor)
            if (BuildConfig.DEBUG) {
                addInterceptor(
                    HttpLoggingInterceptor().apply {
                        level = HttpLoggingInterceptor.Level.BODY
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
