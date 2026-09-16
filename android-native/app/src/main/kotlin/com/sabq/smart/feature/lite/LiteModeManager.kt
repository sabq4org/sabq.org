package com.sabq.smart.feature.lite

import com.sabq.smart.data.SabqBrowsingMode
import com.sabq.smart.data.SettingsStore
import com.sabq.smart.data.analytics.SabqAnalytics
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import okhttp3.CacheControl
import okhttp3.OkHttpClient
import okhttp3.Request

/** سبب تفعيل وضع Lite الحالي. */
enum class LiteTrigger { None, Manual, Auto }

/** تقدير جودة الشبكة من مجسّ الـ HEAD الدوري. */
enum class NetworkQuality { Unknown, Good, Poor }

/** حالة الشريط العائم — تفعيل تلقائي أو عرض العودة للوضع الكامل. */
enum class LiteBannerState { None, AutoActivated, RecoveryOffered }

/**
 * مدير وضع Lite — نقل مباشر لـ iOS `LiteModeManager`.
 *
 * يقرأ [SabqBrowsingMode] من [SettingsStore]:
 *  - Full → غير نشط دائماً.
 *  - Lite → نشط يدوياً.
 *  - Auto → نشط فقط عندما يقرر المجسّ أن الشبكة بطيئة.
 *
 * مجسّ Auto: كل 30 ثانية HEAD على favicon سبق بلا كاش، بمهلة 10 ثوانٍ.
 * أبطأ من 3 ثوانٍ (أو فشل) = بطيء؛ أسرع من ثانية = جيد؛ بينهما يُبقي
 * التقدير السابق. فحصان جيدان متتاليان أثناء التفعيل التلقائي يعرضان
 * شريط «الاتصال تحسّن».
 *
 * البدء كسول: المُنشئ يطلق حلقة المراقبة على نطاق داخلي خاص (نفس نمط
 * NetworkModule / LoyaltyEventQueue الافتراضي) فلا حاجة لأي استدعاء من
 * SabqApplication — أول حقن للـ Singleton يشغّله. [start] متاح واحتياطي
 * idempotent لو أراد المنسّق تشغيله مبكراً بجانب loyaltyEventQueue.start().
 */
@Singleton
class LiteModeManager @Inject constructor(
    settingsStore: SettingsStore,
    okHttpClient: OkHttpClient,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // عميل خاص بالمجسّ: مهلة كلية 10 ثوانٍ مهما كانت مهلات عميل التطبيق.
    private val probeClient: OkHttpClient = okHttpClient.newBuilder()
        .callTimeout(PROBE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .build()

    private val mode: StateFlow<SabqBrowsingMode> = settingsStore.settings
        .map { it.browsingMode }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, SabqBrowsingMode.Full)

    /** هل قرر المجسّ تفعيل Lite تلقائياً (له معنى فقط في وضع Auto). */
    private val autoActive = MutableStateFlow(false)

    private val _networkQuality = MutableStateFlow(NetworkQuality.Unknown)
    val networkQuality: StateFlow<NetworkQuality> = _networkQuality.asStateFlow()

    private val _banner = MutableStateFlow(LiteBannerState.None)
    val banner: StateFlow<LiteBannerState> = _banner.asStateFlow()

    val isLiteActive: StateFlow<Boolean> =
        combine(mode, autoActive) { m, auto ->
            when (m) {
                SabqBrowsingMode.Full -> false
                SabqBrowsingMode.Lite -> true
                SabqBrowsingMode.Auto -> auto
            }
        }.stateIn(scope, SharingStarted.Eagerly, false)

    val trigger: StateFlow<LiteTrigger> =
        combine(mode, autoActive) { m, auto ->
            when {
                m == SabqBrowsingMode.Lite -> LiteTrigger.Manual
                m == SabqBrowsingMode.Auto && auto -> LiteTrigger.Auto
                else -> LiteTrigger.None
            }
        }.stateIn(scope, SharingStarted.Eagerly, LiteTrigger.None)

    private var consecutiveGood = 0

    init {
        scope.launch {
            mode.collectLatest { m ->
                if (m != SabqBrowsingMode.Auto) {
                    // الخروج من Auto يصفّر كل حالة المجسّ.
                    autoActive.value = false
                    consecutiveGood = 0
                    _banner.value = LiteBannerState.None
                    _networkQuality.value = NetworkQuality.Unknown
                    return@collectLatest
                }
                // حلقة المجسّ — collectLatest يلغيها فور مغادرة Auto.
                while (true) {
                    probeOnce()
                    delay(PROBE_INTERVAL_MS)
                }
            }
        }
    }

    /** احتياطي idempotent — الحلقة تبدأ من المُنشئ أصلاً. */
    fun start() = Unit

    /** المستخدم قبل العودة للوضع الكامل بعد تحسّن الاتصال. */
    fun acceptRecovery() {
        autoActive.value = false
        consecutiveGood = 0
        _banner.value = LiteBannerState.None
        SabqAnalytics.log("lite_mode_deactivated", mapOf("trigger" to "auto"))
    }

    /** «ابقَ في Lite» — إخفاء العرض وإعادة عدّ الفحوص الجيدة. */
    fun dismissRecovery() {
        consecutiveGood = 0
        if (_banner.value == LiteBannerState.RecoveryOffered) {
            _banner.value = LiteBannerState.None
        }
    }

    /** إخفاء شريط «تم التحويل لسبق Lite» بعد مهلته. */
    fun clearActivationBanner() {
        if (_banner.value == LiteBannerState.AutoActivated) {
            _banner.value = LiteBannerState.None
        }
    }

    private suspend fun probeOnce() {
        val elapsedMs = try {
            val request = Request.Builder()
                .url(PROBE_URL)
                .head()
                .cacheControl(CacheControl.Builder().noCache().noStore().build())
                .build()
            val startedAt = System.nanoTime()
            probeClient.newCall(request).execute().use { /* الجسد فارغ — HEAD */ }
            (System.nanoTime() - startedAt) / 1_000_000
        } catch (t: Throwable) {
            if (t is kotlinx.coroutines.CancellationException) throw t
            Long.MAX_VALUE // فشل/مهلة = شبكة بطيئة
        }

        val previous = _networkQuality.value
        val quality = when {
            elapsedMs > SLOW_THRESHOLD_MS -> NetworkQuality.Poor
            elapsedMs < FAST_THRESHOLD_MS -> NetworkQuality.Good
            // بين العتبتين: نبقي التقدير السابق (المجهول يُحسب جيداً).
            else -> if (previous == NetworkQuality.Unknown) NetworkQuality.Good else previous
        }
        _networkQuality.value = quality

        when (quality) {
            NetworkQuality.Poor -> {
                consecutiveGood = 0
                if (!autoActive.value) {
                    autoActive.value = true
                    _banner.value = LiteBannerState.AutoActivated
                    SabqAnalytics.log("lite_mode_activated", mapOf("trigger" to "auto"))
                }
            }
            NetworkQuality.Good -> {
                if (autoActive.value) {
                    consecutiveGood += 1
                    if (consecutiveGood >= RECOVERY_GOOD_CHECKS) {
                        _banner.value = LiteBannerState.RecoveryOffered
                    }
                }
            }
            NetworkQuality.Unknown -> Unit
        }
    }

    private companion object {
        const val PROBE_URL = "https://sabq.org/favicon.ico"
        const val PROBE_INTERVAL_MS = 30_000L
        const val PROBE_TIMEOUT_SECONDS = 10L
        const val SLOW_THRESHOLD_MS = 3_000L
        const val FAST_THRESHOLD_MS = 1_000L
        const val RECOVERY_GOOD_CHECKS = 2
    }
}
