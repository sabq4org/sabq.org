package com.sabq.smart.feature.presscard

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import okhttp3.ResponseBody
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Streaming

// عقود «بطاقتي الصحفية» تحت `/api/v1/wallet/press/*`. نقطة الإصدار
// تعيد ملف .pkpass (صيغة Apple لا تنفع أندرويد) — تُستدعى لأثرها في
// الخادم (إصدار وحفظ الرقم التسلسلي) ويُهمَل جسمها ثم يُعاد جلب الحالة.

@Serializable
data class PressPassStatusDto(
    val success: Boolean = false,
    val authorized: Boolean = false,
    val hasPass: Boolean = false,
    val serialNumber: String? = null,
    val issuedAt: String? = null,
    val roleLabel: String? = null,
    val jobTitle: String? = null,
)

interface PressCardApi {
    @GET("api/v1/wallet/press/status")
    suspend fun getStatus(): PressPassStatusDto

    @Streaming
    @POST("api/v1/wallet/press/issue")
    suspend fun issuePass(): ResponseBody
}

@Module
@InstallIn(SingletonComponent::class)
object PressCardNetworkModule {
    /** Retrofit نفسه مُوفَّر في NetworkModule (نفس OkHttp + Json + المضيف). */
    @Provides
    @Singleton
    fun providePressCardApi(retrofit: Retrofit): PressCardApi =
        retrofit.create(PressCardApi::class.java)
}
