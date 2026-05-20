package com.sabq.smart.feature.livecoverage

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.LiveCoverage
import com.sabq.smart.data.LiveEvent
import com.sabq.smart.data.LiveRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * State container for the dedicated LiveCoverage screen. Ports iOS
 * `LiveCoverageView`'s `@State` triple of (liveData, selectedCountry,
 * isLoading) plus the date-grouped event list iOS computes inline.
 *
 * Country filtering: iOS re-fetches with `?country=` when the chip
 * changes (to let the server narrow the payload). We do the same —
 * keeps the implementation symmetric and avoids divergent client
 * filter logic that would shadow the backend's semantics.
 */
@HiltViewModel
class LiveCoverageViewModel @Inject constructor(
    private val repo: LiveRepository,
) : ViewModel() {

    data class UiState(
        val data: LiveCoverage? = null,
        val groupedEvents: List<DateGroup> = emptyList(),
        val selectedCountry: String? = null,
        val isLoading: Boolean = true,
        val loadError: String? = null,
    )

    data class DateGroup(
        val date: String,
        val events: List<LiveEvent>,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { reload() }

    fun selectCountry(key: String?) {
        if (_state.value.selectedCountry == key) return
        _state.update { it.copy(selectedCountry = key) }
        reload()
    }

    fun reload() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, loadError = null) }
            runCatching { repo.getLiveCoverage(country = _state.value.selectedCountry) }
                .onSuccess { coverage ->
                    val filtered = if (_state.value.selectedCountry != null) {
                        coverage.events.filter { it.country == _state.value.selectedCountry }
                    } else {
                        coverage.events
                    }
                    _state.update {
                        it.copy(
                            data = coverage,
                            groupedEvents = groupByDate(filtered),
                            isLoading = false,
                        )
                    }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            loadError = e.localizedMessage ?: "تعذّر تحميل البث الحي",
                        )
                    }
                }
        }
    }

    private fun groupByDate(events: List<LiveEvent>): List<DateGroup> {
        val groups = linkedMapOf<String, MutableList<LiveEvent>>()
        for (event in events) {
            val key = event.publishedAt
                .takeIf { it.isNotBlank() && it.length >= 10 }
                ?.substring(0, 10) // "yyyy-MM-dd"
                ?: "unknown"
            groups.getOrPut(key) { mutableListOf() }.add(event)
        }
        return groups.map { (date, events) -> DateGroup(date, events) }
    }
}
