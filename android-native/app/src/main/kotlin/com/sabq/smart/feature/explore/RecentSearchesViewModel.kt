package com.sabq.smart.feature.explore

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.RecentSearchesStore
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Surfaces the persistent recent-searches list to the Explore screen
 * and exposes the two mutations the iOS counterpart uses: append-on-
 * submit (with promote-to-top + cap-at-10) and clear-all.
 *
 * Mirrors iOS `ExploreView.recentSearches` (Screens/ExploreView.swift)
 * which is backed by `UserDefaults.standard.stringArray(forKey:
 * "sabq_recent_searches")`. We use DataStore instead — same semantics.
 */
@HiltViewModel
class RecentSearchesViewModel @Inject constructor(
    private val store: RecentSearchesStore,
) : ViewModel() {

    val items: StateFlow<List<String>> = store.items.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = emptyList(),
    )

    fun add(query: String) {
        viewModelScope.launch { store.add(query) }
    }

    fun clear() {
        viewModelScope.launch { store.clearAll() }
    }
}
