package com.sabq.smart.feature.worldcup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * يُحمّل أقسام «القيمة السوقية» و«الفورمة الأخيرة» داخل بطاقة اللاعب — نقاط
 * منفصلة أفضل-جهد (TheSports/SportMonks) تُخفى بهدوء عند الغياب. مطابق لـiOS
 * WCPlayerMarketSection / WCPlayerFormSection اللتين تجلبان ذاتيًا حسب playerId.
 */
@HiltViewModel
class WorldCupPlayerExtrasViewModel @Inject constructor(
    private val repo: WorldCupRepository,
) : ViewModel() {

    data class UiState(
        val loadedFor: Int? = null,
        val market: WcPlayerMarket? = null,
        val form: WcPlayerForm? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    /** يُستدعى عند تغيّر اللاعب المعروض — يتجاهل التكرار لنفس المعرّف */
    fun load(playerId: Int) {
        if (playerId <= 0 || _state.value.loadedFor == playerId) return
        _state.update { UiState(loadedFor = playerId) }
        viewModelScope.launch {
            val market = runCatching { repo.playerMarket(playerId) }.getOrNull()
            if (_state.value.loadedFor == playerId) _state.update { it.copy(market = market) }
        }
        viewModelScope.launch {
            val form = runCatching { repo.playerForm(playerId) }.getOrNull()
            if (_state.value.loadedFor == playerId) _state.update { it.copy(form = form) }
        }
    }
}
