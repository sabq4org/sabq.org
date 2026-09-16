package com.sabq.smart.feature.plus

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.User
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import retrofit2.HttpException

data class PlusUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    /** الخادم رد 404 — المعاينة غير متاحة لهذا الحساب (ليست حالة خطأ). */
    val notAvailable: Boolean = false,
    val loadError: String? = null,
    val summary: PlusSummaryDto? = null,
    val catalog: PlusCatalogDto? = null,
    val redemptions: List<PlusRedemptionDto> = emptyList(),
    val redeemingId: String? = null,
    val removingId: String? = null,
    /** قسيمة صادرة للتو — تفتح شاشة التهنئة. */
    val celebrationVoucher: PlusVoucherDto? = null,
    val actionError: String? = null,
)

@HiltViewModel
class SabqPlusViewModel @Inject constructor(
    private val api: SabqPlusApi,
    private val json: Json,
    authRepository: AuthRepository,
) : ViewModel() {

    val user: StateFlow<User?> = authRepository.user

    private val _state = MutableStateFlow(PlusUiState())
    val state: StateFlow<PlusUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(
                loading = _state.value.summary == null,
                refreshing = _state.value.summary != null,
                loadError = null,
            )
            reload()
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _state.value = _state.value.copy(refreshing = true)
            reload()
        }
    }

    private suspend fun reload() {
        try {
            coroutineScope {
                val summary = async { api.getSummary() }
                val catalog = async { api.getCatalog() }
                val redemptions = async { api.getRedemptions() }
                _state.value = _state.value.copy(
                    loading = false,
                    refreshing = false,
                    notAvailable = false,
                    loadError = null,
                    summary = summary.await(),
                    catalog = catalog.await(),
                    redemptions = redemptions.await().redemptions,
                )
            }
        } catch (e: HttpException) {
            _state.value = if (e.code() == 404) {
                _state.value.copy(loading = false, refreshing = false, notAvailable = true)
            } else {
                _state.value.copy(
                    loading = false,
                    refreshing = false,
                    loadError = serverMessage(e) ?: "تعذّر تحميل سبق بلس",
                )
            }
        } catch (e: Exception) {
            _state.value = _state.value.copy(
                loading = false,
                refreshing = false,
                loadError = e.localizedMessage ?: "تعذّر تحميل سبق بلس",
            )
        }
    }

    fun redeem(reward: PlusRewardDto) {
        if (_state.value.redeemingId != null) return
        viewModelScope.launch {
            _state.value = _state.value.copy(redeemingId = reward.id, actionError = null)
            try {
                val response = api.redeem(reward.id, PlusRedeemRequest(termsAccepted = true))
                reload()
                _state.value = _state.value.copy(
                    redeemingId = null,
                    celebrationVoucher = response.voucher,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    redeemingId = null,
                    actionError = (e as? HttpException)?.let(::serverMessage)
                        ?: "تعذر الاستبدال. حاول مرة أخرى.",
                )
            }
        }
    }

    fun removeRedemption(item: PlusRedemptionDto) {
        if (_state.value.removingId != null) return
        viewModelScope.launch {
            _state.value = _state.value.copy(removingId = item.id, actionError = null)
            try {
                api.deleteRedemption(item.id)
                reload()
                _state.value = _state.value.copy(removingId = null)
            } catch (e: Exception) {
                _state.value = _state.value.copy(
                    removingId = null,
                    actionError = (e as? HttpException)?.let(::serverMessage)
                        ?: "تعذر إزالة القسيمة.",
                )
            }
        }
    }

    fun dismissCelebration() {
        _state.value = _state.value.copy(celebrationVoucher = null)
    }

    fun dismissActionError() {
        _state.value = _state.value.copy(actionError = null)
    }

    private fun serverMessage(e: HttpException): String? {
        val raw = e.response()?.errorBody()?.string() ?: return null
        return runCatching {
            json.decodeFromString(PlusRedeemResponse.serializer(), raw).message
        }.getOrNull()?.takeIf { it.isNotBlank() }
    }
}
