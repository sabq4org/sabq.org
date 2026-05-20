package com.sabq.smart.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.recentSearchesDataStore by preferencesDataStore(name = "recent_searches_prefs")
private val RECENTS_KEY = stringPreferencesKey("recent_searches_csv")

/**
 * Most-recent search queries — mirrors iOS `ExploreView.recentSearches`
 * which uses `UserDefaults.standard.stringArray(forKey: "sabq_recent_searches")`.
 * Persisted as a comma-separated string in DataStore Preferences.
 *
 * Capped at 10 entries (most recent first). Adding an existing entry
 * promotes it to the top instead of duplicating.
 */
@Singleton
class RecentSearchesStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    val items: Flow<List<String>> = context.recentSearchesDataStore.data.map { prefs ->
        prefs[RECENTS_KEY]
            ?.split(SEPARATOR)
            ?.map { it.trim() }
            ?.filter { it.isNotEmpty() }
            ?: emptyList()
    }

    suspend fun add(query: String) {
        val cleaned = query.trim()
        if (cleaned.isEmpty()) return
        context.recentSearchesDataStore.edit { prefs ->
            val current = prefs[RECENTS_KEY]
                ?.split(SEPARATOR)
                ?.map { it.trim() }
                ?.filter { it.isNotEmpty() }
                ?: emptyList()
            // Promote to top + dedupe + cap at 10.
            val next = (listOf(cleaned) + current.filterNot { it == cleaned }).take(MAX_ENTRIES)
            prefs[RECENTS_KEY] = next.joinToString(SEPARATOR)
        }
    }

    suspend fun clearAll() {
        context.recentSearchesDataStore.edit { it.remove(RECENTS_KEY) }
    }

    private companion object {
        // ASCII RS (record separator) — not allowed inside a search
        // query, so safe as a delimiter even for queries containing
        // commas/semicolons.
        const val SEPARATOR = ""
        const val MAX_ENTRIES = 10
    }
}
