package com.sabq.smart.feature.audio

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.AudioNewsletter
import com.sabq.smart.data.HomeExtrasRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import java.io.IOException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * State machine for the dedicated "النشرات الصوتية" screen.
 * iOS counterpart: `AudioNewslettersView.load` at
 * Screens/AudioNewslettersView.swift:230.
 */
sealed interface AudioNewslettersUiState {
    data object Loading : AudioNewslettersUiState
    data object Empty : AudioNewslettersUiState
    data class Loaded(val items: List<AudioNewsletter>) : AudioNewslettersUiState
    data class Error(val message: String) : AudioNewslettersUiState
}

@HiltViewModel
class AudioNewslettersViewModel @Inject constructor(
    private val repo: HomeExtrasRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<AudioNewslettersUiState>(AudioNewslettersUiState.Loading)
    val state: StateFlow<AudioNewslettersUiState> = _state.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.value = AudioNewslettersUiState.Loading
            runCatching { repo.getAllAudioNewsletters() }
                .onSuccess { items ->
                    _state.value = if (items.isEmpty()) {
                        AudioNewslettersUiState.Empty
                    } else {
                        AudioNewslettersUiState.Loaded(items)
                    }
                }
                .onFailure { e ->
                    _state.value = AudioNewslettersUiState.Error(
                        message = friendlyMessage(e),
                    )
                }
        }
    }

    /**
     * Same friendliness contract as [com.sabq.smart.feature.home.HomeFeedViewModel.friendlyNetworkMessage].
     * Surfaces "تحقّق من الاتصال…" for network failures rather than
     * leaking developer-facing strings to the empty-state card.
     */
    private fun friendlyMessage(t: Throwable): String {
        var c: Throwable? = t
        while (c != null) {
            when (c) {
                is java.net.UnknownHostException,
                is java.net.ConnectException ->
                    return "تعذّر الاتصال بالإنترنت. تحقّق من الشبكة وحاول مجدداً."
                is java.net.SocketTimeoutException ->
                    return "تعذّر الاتصال بسبب بطء الشبكة. حاول مجدداً."
                is IOException ->
                    return "تحقّق من الاتصال ثم أعد المحاولة."
            }
            c = c.cause
        }
        return t.localizedMessage?.takeIf { it.isNotBlank() }
            ?: "تعذّر التحميل"
    }
}
