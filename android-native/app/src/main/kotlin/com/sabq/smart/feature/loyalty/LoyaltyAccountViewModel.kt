package com.sabq.smart.feature.loyalty

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.LoyaltyRepository
import com.sabq.smart.data.LoyaltySummary
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException

sealed interface LoyaltyUiState {
    data object Loading : LoyaltyUiState
    data object Anonymous : LoyaltyUiState
    data class Loaded(val summary: LoyaltySummary) : LoyaltyUiState
    data class Error(val message: String) : LoyaltyUiState
}

@HiltViewModel
class LoyaltyAccountViewModel @Inject constructor(
    private val repo: LoyaltyRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<LoyaltyUiState>(LoyaltyUiState.Loading)
    val state: StateFlow<LoyaltyUiState> = _state.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.value = LoyaltyUiState.Loading
            runCatching { repo.getSummary() }
                .onSuccess { _state.value = LoyaltyUiState.Loaded(it) }
                .onFailure { e ->
                    _state.value = when {
                        e is HttpException && e.code() == 401 -> LoyaltyUiState.Anonymous
                        else -> LoyaltyUiState.Error(e.localizedMessage ?: "تعذّر تحميل النقاط")
                    }
                }
        }
    }
}
