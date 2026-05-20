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

private val Context.followedKeywordsDataStore by preferencesDataStore(name = "followed_keywords_prefs")
private val KEYWORDS_KEY = stringSetPreferencesKey("followed_keywords")

@Singleton
class FollowedKeywordsStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    /** Flow of followed keywords */
    val keywords: Flow<Set<String>> = context.followedKeywordsDataStore.data
        .map { prefs -> prefs[KEYWORDS_KEY] ?: emptySet() }

    suspend fun current(): Set<String> = keywords.first()

    suspend fun isFollowed(keyword: String): Boolean = current().contains(keyword)

    suspend fun toggle(keyword: String) {
        context.followedKeywordsDataStore.edit { prefs ->
            val existing = prefs[KEYWORDS_KEY] ?: emptySet()
            prefs[KEYWORDS_KEY] = if (keyword in existing) existing - keyword else existing + keyword
        }
    }
}
