package com.sabq.smart.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.AppSettings
import com.sabq.smart.data.SettingsStore
import com.sabq.smart.ui.theme.SabqAccent
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val store: SettingsStore,
) : ViewModel() {

    val settings: StateFlow<AppSettings> = store.settings.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = AppSettings(),
    )

    fun setFollowsSystem(value: Boolean) {
        viewModelScope.launch { store.setFollowsSystemDark(value) }
    }

    fun setDarkMode(value: Boolean) {
        viewModelScope.launch { store.setDarkMode(value) }
    }

    fun setAccent(accent: SabqAccent) {
        viewModelScope.launch { store.setAccent(accent) }
    }

    fun setFontSize(size: Float) {
        viewModelScope.launch { store.setArticleFontSize(size) }
    }

    fun setLineSpacing(value: Float) {
        viewModelScope.launch { store.setArticleLineSpacing(value) }
    }

    fun setUseReaderFont(value: Boolean) {
        viewModelScope.launch { store.setArticleUseReaderFont(value) }
    }

    /** Called by the 4-slide welcome flow when the user either taps the
     *  final CTA ("ابدأ الآن") or "تخطّي" on any earlier slide. Sets
     *  the persistent flag so the cover never shows again on this
     *  install. */
    fun completeOnboarding() {
        viewModelScope.launch { store.setOnboardingCompleted(true) }
    }
}
