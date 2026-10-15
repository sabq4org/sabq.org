package com.sabq.smart.feature.economy

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import retrofit2.Retrofit
import retrofit2.http.GET

/** نداءات «الاقتصاد الحي» — مسارات عامة فقط تحت /api/economy (لا مصادقة). */
interface EconomyApi {
    @GET("api/economy/snapshot") suspend fun snapshot(): EconomySnapshot
    /** 404 عندما لا يوجد تقرير أسبوعي بعد — يُترجم إلى null في المخزن. */
    @GET("api/economy/weekly-story") suspend fun weeklyStory(): EconomyWeeklyStory
    /** 404 عندما لا توجد نشرة شهرية بعد. */
    @GET("api/economy/monthly-story") suspend fun monthlyStory(): EconomyMonthlyStory
}

@Module
@InstallIn(SingletonComponent::class)
object EconomyNetworkModule {
    @Provides
    @Singleton
    fun provideEconomyApi(retrofit: Retrofit): EconomyApi = retrofit.create(EconomyApi::class.java)
}

/**
 * مخزن مشترك على مستوى التطبيق (نظير iOS `EconomyStore`): اللقطة تُجلب مرة
 * وتُعاد قراءتها من الذاكرة. إيقاعات الويب: الرئيسية 5 دقائق، الصفحة 60 ثانية،
 * التقرير الأسبوعي 5 دقائق، الشهري 10 دقائق. لا SSE — التحديث عند الظهور وبالسحب.
 */
@Singleton
class EconomyRepository @Inject constructor(private val api: EconomyApi) {
    data class State(
        val snapshot: EconomySnapshot? = null,
        val weekly: EconomyWeeklyStory? = null,
        val monthly: EconomyMonthlyStory? = null,
        val isLoadingSnapshot: Boolean = false,
        val snapshotFailed: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var snapshotAt = 0L
    private var weeklyAt = 0L
    private var monthlyAt = 0L

    suspend fun loadSnapshotIfNeeded(maxAgeMs: Long): EconomySnapshot? {
        val current = _state.value
        val now = System.currentTimeMillis()
        if (current.isLoadingSnapshot) return current.snapshot
        if (current.snapshot != null && now - snapshotAt < maxAgeMs) return current.snapshot
        _state.value = current.copy(isLoadingSnapshot = true)
        val result = runCatching { api.snapshot() }
        _state.value = result.fold(
            onSuccess = { snap -> snapshotAt = System.currentTimeMillis(); _state.value.copy(snapshot = snap, isLoadingSnapshot = false, snapshotFailed = false) },
            // فشل صامت: البلوك يختفي كما في الويب (`ErrorBoundary fallback={null}`).
            onFailure = { _state.value.copy(isLoadingSnapshot = false, snapshotFailed = _state.value.snapshot == null) },
        )
        return _state.value.snapshot
    }

    suspend fun loadStoriesIfNeeded() = coroutineScope {
        val w = async { loadWeekly() }
        val m = async { loadMonthly() }
        w.await(); m.await()
    }

    suspend fun refreshAll() {
        snapshotAt = 0; weeklyAt = 0; monthlyAt = 0
        loadSnapshotIfNeeded(0)
        loadStoriesIfNeeded()
    }

    private suspend fun loadWeekly() {
        if (_state.value.weekly != null && System.currentTimeMillis() - weeklyAt < 300_000) return
        runCatching { api.weeklyStory() }.getOrNull()?.let { story ->
            weeklyAt = System.currentTimeMillis()
            _state.value = _state.value.copy(weekly = story)
        }
    }

    private suspend fun loadMonthly() {
        if (_state.value.monthly != null && System.currentTimeMillis() - monthlyAt < 600_000) return
        runCatching { api.monthlyStory() }.getOrNull()?.let { story ->
            monthlyAt = System.currentTimeMillis()
            _state.value = _state.value.copy(monthly = story)
        }
    }
}
