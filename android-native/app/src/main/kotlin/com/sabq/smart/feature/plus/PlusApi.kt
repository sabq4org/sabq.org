package com.sabq.smart.feature.plus

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

// عقود «سبق بلس» — معاينة داخلية تحت `/api/v1/plus/*`. التوكن يُرفق
// تلقائياً عبر AuthInterceptor في NetworkModule. الخادم يرد 404 لغير
// مسؤول المنصة — تُعامَل كحالة «غير متاح» لا كخطأ.

@Serializable
data class PlusTierDto(
    val level: Int = 0,
    val nameAr: String = "",
    val color: String? = null,
)

@Serializable
data class PlusNextTierDto(
    val nameAr: String = "",
    val minLifetimePoints: Int = 0,
)

@Serializable
data class PlusSummaryDto(
    val totalPoints: Int = 0,
    val lifetimePoints: Int = 0,
    val sarValue: Double = 0.0,
    val pointsPerSar: Int = 500,
    val monthPoints: Int = 0,
    val tier: PlusTierDto = PlusTierDto(),
    val nextTier: PlusNextTierDto? = null,
    val pointsToNext: Int = 0,
    val predictionMultiplier: Double = 1.0,
)

@Serializable
data class PlusRewardDto(
    val id: String = "",
    val partnerName: String = "",
    val offer: String = "",
    val pointsCost: Int = 0,
    val sarValue: Double = 0.0,
    val category: String = "",
    val brandColor: String? = null,
    val valueLabel: String = "",
    val remainingStock: Int? = null,
)

@Serializable
data class PlusCatalogDto(
    val balance: Int = 0,
    val pointsPerSar: Int = 500,
    val rewards: List<PlusRewardDto> = emptyList(),
)

@Serializable
data class PlusRedeemRequest(
    val termsAccepted: Boolean = true,
)

@Serializable
data class PlusVoucherDto(
    val code: String = "",
    val expiresAt: String? = null,
    val partnerName: String = "",
    val offer: String = "",
    val valueLabel: String = "",
    val brandColor: String? = null,
    val category: String? = null,
    val pointsSpent: Int = 0,
    val redemptionId: String = "",
)

@Serializable
data class PlusRedeemResponse(
    val success: Boolean = false,
    val message: String? = null,
    val remainingBalance: Int? = null,
    val voucher: PlusVoucherDto? = null,
)

@Serializable
data class PlusRedemptionDto(
    val id: String = "",
    val partnerName: String? = null,
    val offer: String? = null,
    val pointsSpent: Int = 0,
    val status: String? = null,
    val redeemedAt: String? = null,
    val code: String? = null,
    val voucherExpiresAt: String? = null,
    val brandColor: String? = null,
    val valueLabel: String? = null,
    val category: String? = null,
)

@Serializable
data class PlusRedemptionsResponse(
    val success: Boolean = false,
    val redemptions: List<PlusRedemptionDto> = emptyList(),
)

interface SabqPlusApi {
    @GET("api/v1/plus/summary")
    suspend fun getSummary(): PlusSummaryDto

    @GET("api/v1/plus/catalog")
    suspend fun getCatalog(): PlusCatalogDto

    @POST("api/v1/plus/redeem/{id}")
    suspend fun redeem(
        @Path("id") id: String,
        @Body body: PlusRedeemRequest,
    ): PlusRedeemResponse

    @GET("api/v1/plus/redemptions")
    suspend fun getRedemptions(): PlusRedemptionsResponse

    // الاسترداد — الجسم غير مهم، يكفي نجاح الحالة.
    @DELETE("api/v1/plus/redemptions/{id}")
    suspend fun deleteRedemption(@Path("id") id: String): Response<Unit>
}

@Module
@InstallIn(SingletonComponent::class)
object PlusNetworkModule {
    /** Retrofit نفسه مُوفَّر في NetworkModule (نفس OkHttp + Json + المضيف). */
    @Provides
    @Singleton
    fun provideSabqPlusApi(retrofit: Retrofit): SabqPlusApi =
        retrofit.create(SabqPlusApi::class.java)
}
