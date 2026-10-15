package com.sabq.smart.feature.revisions

import com.sabq.smart.data.AuthRepository
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException

/**
 * قائمة مقالات الكاتب المعادة للتعديل + عدّاد شارة الإعدادات.
 * نقل حرفي لدلالات iOS `ArticleRevisionsStore`:
 *
 *   - `hasLoaded` يميّز «لم يُحمَّل بعد» عن «محمَّل وفارغ فعلاً» —
 *     بدونها كان إشعار needs_revision يبدو وكأنه أُعيد إرساله عند أول
 *     رسم (بلاغ iOS ‏2026-05-21).
 *   - 401/403 → تصفير صامت بلا خطأ (المستخدم خرج من مكان آخر).
 *   - `removeOptimistically` قبل إعادة الجلب لسلاسة القائمة.
 *
 * التحديث بعد resubmit ناجح يتم من شاشة المحرر؛ ربط الدخول/العودة
 * للواجهة يمر عبر [refresh] من طبقة التطبيق.
 */
@Singleton
class RevisionsStore @Inject constructor(
    private val api: RevisionsApi,
    authRepository: AuthRepository,
) {
    data class State(
        val items: List<ApiRevisionSummary> = emptyList(),
        val isLoading: Boolean = false,
        val lastError: String? = null,
        val hasLoaded: Boolean = false,
    ) {
        val count: Int get() = items.size
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private val refreshing = AtomicBoolean(false)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    init {
        // تصفير عند تسجيل الخروج (انتقال مستخدم→null فقط، لا الإقلاع
        // البارد قبل حل الملف الشخصي) — كي لا يرى الحساب التالي
        // مسودات سابقه لوهلة.
        scope.launch {
            var hadUser = false
            authRepository.user.collect { user ->
                if (user != null) {
                    hadUser = true
                } else if (hadUser) {
                    hadUser = false
                    clear()
                }
            }
        }
    }

    suspend fun refresh() {
        if (!refreshing.compareAndSet(false, true)) return
        _state.update { it.copy(isLoading = true, lastError = null) }
        try {
            val response = api.getMyRevisions()
            _state.update {
                it.copy(
                    items = response.articles,
                    isLoading = false,
                    hasLoaded = true,
                    lastError = null,
                )
            }
        } catch (e: HttpException) {
            if (e.code() == 401 || e.code() == 403) {
                _state.update { it.copy(items = emptyList(), isLoading = false, lastError = null) }
            } else {
                _state.update {
                    it.copy(isLoading = false, lastError = "تعذر جلب المقالات (${e.code()})")
                }
            }
        } catch (t: Throwable) {
            _state.update {
                it.copy(isLoading = false, lastError = t.localizedMessage ?: "تعذر جلب المقالات")
            }
        } finally {
            refreshing.set(false)
        }
    }

    fun removeOptimistically(id: String) {
        _state.update { s -> s.copy(items = s.items.filterNot { it.id == id }) }
    }

    fun clear() {
        _state.value = State()
    }
}

/** وصول للمخزن من طبقات Compose غير المحقونة (SabqApp/SettingsScreen)
 *  — نفس نمط ArticleDetailEntryPoint. */
@dagger.hilt.EntryPoint
@dagger.hilt.InstallIn(dagger.hilt.components.SingletonComponent::class)
interface RevisionsStoreEntryPoint {
    fun revisionsStore(): RevisionsStore
}
