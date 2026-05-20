package com.sabq.smart.feature.passport

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Passport
import com.sabq.smart.data.PassportRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface PassportUiState {
    data object Loading : PassportUiState
    data class Error(val message: String) : PassportUiState
    data class Loaded(val passport: Passport) : PassportUiState
}

/**
 * Loads the Content Passport for a single article slug. Mirrors iOS's
 * `PassportSheetView` `@State`-driven loader — single-shot fetch, with
 * an explicit retry on error.
 *
 * NOT @HiltViewModel since the sheet is presented from inside the
 * ArticleDetail screen and we want a fresh VM keyed on the slug. We
 * resolve it via [hiltViewModel] in the sheet composable, passing the
 * slug through a SavedStateHandle isn't worth the complexity for a
 * single in-screen sheet — just inject the repository and call load().
 */
@HiltViewModel
class PassportViewModel @Inject constructor(
    private val repo: PassportRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<PassportUiState>(PassportUiState.Loading)
    val state: StateFlow<PassportUiState> = _state.asStateFlow()

    private var lastSlug: String? = null

    fun load(slug: String) {
        if (slug.isBlank()) {
            _state.value = PassportUiState.Error("لم يتم تحديد المقال")
            return
        }
        // Don't re-fetch if the sheet is reopened for the same article.
        if (lastSlug == slug && _state.value is PassportUiState.Loaded) return
        lastSlug = slug
        viewModelScope.launch {
            _state.value = PassportUiState.Loading
            runCatching { repo.getPassport(slug) }
                .onSuccess { _state.value = PassportUiState.Loaded(it) }
                .onFailure { _state.value = PassportUiState.Error("تحقّق من الاتصال ثم أعد المحاولة.") }
        }
    }

    fun retry() {
        lastSlug?.let { load(it) }
    }
}
