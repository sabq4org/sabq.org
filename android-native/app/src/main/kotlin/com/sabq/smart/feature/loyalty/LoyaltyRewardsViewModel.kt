package com.sabq.smart.feature.loyalty

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.LoyaltyRepository
import com.sabq.smart.data.LoyaltyReward
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * State + actions for the "متجر المكافآت" screen. Mirrors the iOS
 * `LoyaltyRewardsView` local state — load + redeem + transient
 * success / error banners.
 */
@HiltViewModel
class LoyaltyRewardsViewModel @Inject constructor(
    private val repo: LoyaltyRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(LoyaltyRewardsState())
    val state: StateFlow<LoyaltyRewardsState> = _state.asStateFlow()

    fun load() {
        if (_state.value.isLoading) return
        _state.update { it.copy(isLoading = true, loadError = null) }
        viewModelScope.launch {
            try {
                val page = repo.getRewards()
                _state.update {
                    it.copy(
                        isLoading = false,
                        balance = page.balance,
                        rewards = page.rewards,
                    )
                }
            } catch (t: Throwable) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        loadError = t.message?.ifBlank { null } ?: "تعذر تحميل المكافآت",
                    )
                }
            }
        }
    }

    fun redeem(reward: LoyaltyReward) {
        if (_state.value.redeemingId != null) return
        _state.update { it.copy(redeemingId = reward.id, redeemError = null, successMessage = null) }
        viewModelScope.launch {
            try {
                val result = repo.redeem(reward.id)
                if (result.success) {
                    val newBalance = result.remainingBalance ?: _state.value.balance
                    _state.update {
                        it.copy(
                            redeemingId = null,
                            balance = newBalance,
                            successMessage = result.message ?: "تم استبدال المكافأة بنجاح ✨",
                        )
                    }
                    // Refresh catalog so stock + per-user-cap states update.
                    load()
                } else {
                    _state.update {
                        it.copy(
                            redeemingId = null,
                            redeemError = result.message ?: "تعذر الاستبدال",
                        )
                    }
                }
            } catch (t: Throwable) {
                _state.update {
                    it.copy(
                        redeemingId = null,
                        redeemError = t.message?.ifBlank { null } ?: "تعذر الاستبدال. حاول لاحقاً.",
                    )
                }
            }
        }
    }

    fun dismissBanners() {
        _state.update { it.copy(successMessage = null, redeemError = null) }
    }
}

data class LoyaltyRewardsState(
    val isLoading: Boolean = false,
    val balance: Int = 0,
    val rewards: List<LoyaltyReward> = emptyList(),
    val loadError: String? = null,
    val redeemingId: String? = null,
    val redeemError: String? = null,
    val successMessage: String? = null,
)
