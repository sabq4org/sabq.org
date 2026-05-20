package com.sabq.smart.feature.calendar

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.CalendarEvent
import com.sabq.smart.data.HomeExtrasRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * State container for the dedicated "أحداث وأيام عالمية" screen.
 * Ports iOS `CalendarView`'s `@State` (events + isLoading + errorMessage)
 * plus the date-grouped list iOS computes inline. Pulls 30 days ahead
 * matching iOS `fetchUpcomingCalendarEvents(days: 30)`.
 */
@HiltViewModel
class CalendarViewModel @Inject constructor(
    private val repo: HomeExtrasRepository,
) : ViewModel() {

    data class UiState(
        val events: List<CalendarEvent> = emptyList(),
        val grouped: List<DateGroup> = emptyList(),
        val isLoading: Boolean = true,
        val loadError: String? = null,
    )

    data class DateGroup(
        val dateKey: String,
        val events: List<CalendarEvent>,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { reload() }

    fun reload() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, loadError = null) }
            runCatching { repo.getCalendarUpcoming(days = 30) }
                .onSuccess { events ->
                    _state.update {
                        it.copy(
                            events = events,
                            grouped = groupByDate(events),
                            isLoading = false,
                        )
                    }
                }
                .onFailure { _ ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            loadError = "تحقّق من الاتصال ثم أعد المحاولة.",
                        )
                    }
                }
        }
    }

    /** Group events by the first 10 chars of dateStart ("yyyy-MM-dd").
     *  Preserves backend ordering by using a LinkedHashMap. Events with
     *  blank/short dateStart bucket under "unknown" so the screen
     *  still renders them. */
    private fun groupByDate(events: List<CalendarEvent>): List<DateGroup> {
        val groups = linkedMapOf<String, MutableList<CalendarEvent>>()
        for (event in events) {
            val key = event.dateStart
                .takeIf { it.isNotBlank() && it.length >= 10 }
                ?.substring(0, 10)
                ?: "unknown"
            groups.getOrPut(key) { mutableListOf() }.add(event)
        }
        return groups.map { (date, events) -> DateGroup(date, events) }
    }
}
