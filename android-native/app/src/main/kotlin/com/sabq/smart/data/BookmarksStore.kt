package com.sabq.smart.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.bookmarksDataStore by preferencesDataStore(name = "bookmarks_prefs")
private val IDS_KEY = stringSetPreferencesKey("article_ids")
private val META_PREFIX = "meta:"

/**
 * Persistent bookmark store. Mirrors iOS [BookmarksStore] (Stores/
 * BookmarksStore.swift) but Android-flavoured — DataStore Preferences
 * back the persistence, no Combine/@Observable.
 *
 * v1 stores only article IDs. The full [Article] entries for the
 * Bookmarks screen are reconstructed by re-fetching from the API on
 * demand. iOS caches the full Article model in UserDefaults to render
 * offline; we'll add that when we wire the Bookmarks screen end-to-end.
 *
 * Auth-gated sync (Bearer-token) lands with the auth flow. Until then
 * this is purely local-first.
 */
@Singleton
class BookmarksStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    /** Reactive flow of the currently-bookmarked article IDs. */
    val ids: Flow<Set<String>> = context.bookmarksDataStore.data
        .map { prefs -> prefs[IDS_KEY] ?: emptySet() }

    suspend fun current(): Set<String> = ids.first()

    suspend fun isBookmarked(id: String): Boolean = current().contains(id)

    suspend fun toggle(id: String) {
        var resultIsBookmarked = false
        context.bookmarksDataStore.edit { prefs ->
            val existing = prefs[IDS_KEY] ?: emptySet()
            val next = if (id in existing) existing - id else existing + id
            resultIsBookmarked = id in next
            prefs[IDS_KEY] = next
        }
        com.sabq.smart.data.analytics.SabqAnalytics.bookmarkToggle(id, resultIsBookmarked)
    }

    suspend fun setBookmarked(id: String, bookmarked: Boolean) {
        context.bookmarksDataStore.edit { prefs ->
            val existing = prefs[IDS_KEY] ?: emptySet()
            prefs[IDS_KEY] = if (bookmarked) existing + id else existing - id
        }
        com.sabq.smart.data.analytics.SabqAnalytics.bookmarkToggle(id, bookmarked)
    }

    suspend fun clearAll() {
        context.bookmarksDataStore.edit { it.remove(IDS_KEY) }
    }

    @Suppress("unused")
    private val _markerPrefix: String = META_PREFIX
}
