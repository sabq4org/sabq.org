package com.sabq.smart.feature.settings

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil.Coil
import coil.annotation.ExperimentalCoilApi
import com.sabq.smart.data.AppSettings
import com.sabq.smart.data.BookmarksStore
import com.sabq.smart.data.FollowedKeywordsStore
import com.sabq.smart.data.RecentSearchesStore
import com.sabq.smart.data.SettingsStore
import com.sabq.smart.ui.theme.SabqAccent
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val store: SettingsStore,
    private val bookmarks: BookmarksStore,
    private val followedKeywords: FollowedKeywordsStore,
    private val recentSearches: RecentSearchesStore,
    @ApplicationContext private val appContext: Context,
) : ViewModel() {

    /** State for the "مسح البيانات المحلية" flow — mirrors iOS's two
     *  `@State` flags (`showClearDataConfirm` + `didClearData`), plus an
     *  explicit Error case so failures are never silent. */
    enum class ClearLocalDataState { Idle, Cleared, Error }

    val settings: StateFlow<AppSettings> = store.settings.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = AppSettings(),
    )

    private val _clearLocalDataState = MutableStateFlow(ClearLocalDataState.Idle)
    val clearLocalDataState: StateFlow<ClearLocalDataState> = _clearLocalDataState.asStateFlow()

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

    fun setBrowsingMode(mode: com.sabq.smart.data.SabqBrowsingMode) {
        viewModelScope.launch { store.setBrowsingMode(mode) }
    }

    /** Called by the 4-slide welcome flow when the user either taps the
     *  final CTA ("ابدأ الآن") or "تخطّي" on any earlier slide. Sets
     *  the persistent flag so the cover never shows again on this
     *  install. */
    fun completeOnboarding() {
        viewModelScope.launch { store.setOnboardingCompleted(true) }
    }

    /**
     * Wipes the same things iOS [`clearLocalData()`](SettingsView.swift:127)
     * wipes — bookmarks, followed keywords, recent searches, and the
     * image cache (Coil here, ImageCache + URLCache on iOS). Auth, reader
     * preferences, dark mode, and accent are NOT touched. The user stays
     * logged in.
     */
    @OptIn(ExperimentalCoilApi::class)
    fun clearLocalData() {
        viewModelScope.launch {
            try {
                bookmarks.clearAll()
                followedKeywords.clearAll()
                recentSearches.clearAll()
                val loader = Coil.imageLoader(appContext)
                loader.memoryCache?.clear()
                loader.diskCache?.clear()
                _clearLocalDataState.value = ClearLocalDataState.Cleared
            } catch (t: Throwable) {
                Log.e("SettingsViewModel", "clearLocalData failed: ${t.message}", t)
                _clearLocalDataState.value = ClearLocalDataState.Error
            }
        }
    }

    fun acknowledgeClearLocalData() {
        _clearLocalDataState.value = ClearLocalDataState.Idle
    }
}
