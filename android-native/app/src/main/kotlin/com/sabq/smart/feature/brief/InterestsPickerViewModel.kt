package com.sabq.smart.feature.brief

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.data.AuthRepository
import com.sabq.smart.data.Section
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Backs the dedicated interests-picker route. Ports iOS
 * `InterestsPickerSheet` 1:1 — category list with multi-select chips,
 * sticky header (selection counter + bulk حدد الكل/امسح الكل), bottom
 * save bar. Refreshes the auth profile after a successful save so the
 * caller's [DailyBriefViewModel] state updates without manual reload.
 */
@HiltViewModel
class InterestsPickerViewModel @Inject constructor(
    private val articleRepo: ArticleRepository,
    private val authRepo: AuthRepository,
) : ViewModel() {

    private val _categories = MutableStateFlow<List<Section>>(emptyList())
    private val _selectedIds = MutableStateFlow<Set<String>>(emptySet())
    private val _isLoading = MutableStateFlow(true)
    private val _isSaving = MutableStateFlow(false)
    private val _loadError = MutableStateFlow<String?>(null)
    private val _saveOutcome = MutableStateFlow<SaveOutcome>(SaveOutcome.Idle)

    val state: StateFlow<UiState> = combine(
        combine(_categories, _selectedIds, ::Pair),
        combine(_isLoading, _isSaving, _loadError, ::Triple),
        _saveOutcome,
    ) { catsAndIds, flagsTriple, outcome ->
        val (cats, ids) = catsAndIds
        val (loading, saving, err) = flagsTriple
        UiState(
            categories = cats,
            selectedIds = ids,
            isLoading = loading,
            isSaving = saving,
            loadError = err,
            saveOutcome = outcome,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.Eagerly,
        initialValue = UiState(),
    )

    init {
        // Seed selection from the currently-signed-in user's interests.
        _selectedIds.value = authRepo.user.value?.interests?.map { it.id }?.toSet().orEmpty()
        reload()
    }

    fun reload() {
        viewModelScope.launch {
            _isLoading.value = true
            _loadError.value = null
            runCatching { articleRepo.getSections() }
                .onSuccess {
                    _categories.value = it
                    _isLoading.value = false
                }
                .onFailure { e ->
                    _isLoading.value = false
                    _loadError.value = e.localizedMessage ?: "تعذّر تحميل التصنيفات"
                }
        }
    }

    fun toggle(id: String) {
        _selectedIds.update { current ->
            if (current.contains(id)) current - id else current + id
        }
    }

    fun selectAll() {
        _selectedIds.value = _categories.value.map { it.id }.toSet()
    }

    fun clearAll() {
        _selectedIds.value = emptySet()
    }

    fun save() {
        if (_isSaving.value) return
        viewModelScope.launch {
            _isSaving.value = true
            runCatching {
                // Preserve insertion order — the backend weights interests
                // by index (mobileApiRoutes.ts:2106). Sort by category
                // displayOrder so saved priority matches the visible list.
                val orderedIds = _categories.value
                    .filter { _selectedIds.value.contains(it.id) }
                    .map { it.id }
                authRepo.updateInterests(orderedIds)
            }
                .onSuccess { _saveOutcome.value = SaveOutcome.Saved }
                .onFailure { e ->
                    _saveOutcome.value =
                        SaveOutcome.Failed(e.localizedMessage ?: "تعذّر حفظ الاهتمامات")
                }
            _isSaving.value = false
        }
    }

    fun consumeOutcome() {
        _saveOutcome.value = SaveOutcome.Idle
    }

    sealed interface SaveOutcome {
        data object Idle : SaveOutcome
        data object Saved : SaveOutcome
        data class Failed(val message: String) : SaveOutcome
    }

    data class UiState(
        val categories: List<Section> = emptyList(),
        val selectedIds: Set<String> = emptySet(),
        val isLoading: Boolean = true,
        val isSaving: Boolean = false,
        val loadError: String? = null,
        val saveOutcome: SaveOutcome = SaveOutcome.Idle,
    )
}
