package com.sabq.smart.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.sabq.smart.data.api.SabqApi
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update

private val Context.likesDataStore by preferencesDataStore(name = "likes_prefs")
private val LIKES_KEY = stringSetPreferencesKey("liked_article_ids")

/**
 * Local-first cache of which articles the current user has liked.
 * Mirrors iOS [LikesStore] (Stores/LikesStore.swift) 1:1.
 */
@Singleton
class LikesStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: SabqApi,
) {
    /** Reactive flow of the currently-liked article IDs. */
    val likedIds: Flow<Set<String>> = context.likesDataStore.data
        .map { prefs -> prefs[LIKES_KEY] ?: emptySet() }

    /**
     * Last-known server count per article, keyed by id. The heart
     * reads liked-or-not from likedIds (instant), the number next to
     * it reads from this map (refreshed in the background).
     */
    private val _counts = MutableStateFlow<Map<String, Int>>(emptyMap())
    val counts: StateFlow<Map<String, Int>> = _counts.asStateFlow()

    suspend fun currentLikedIds(): Set<String> = likedIds.first()

    fun isLiked(articleId: String): Flow<Boolean> = likedIds.map { it.contains(articleId) }

    fun likesCount(articleId: String): Flow<Int?> = counts.map { it[articleId] }

    /**
     * Optimistic toggle: flip local immediately, then sync to server.
     * On server success we trust the response. On failure we revert.
     */
    suspend fun toggle(articleId: String): Pair<Boolean, Int>? {
        val wasLiked = currentLikedIds().contains(articleId)

        // Optimistically update local DataStore
        context.likesDataStore.edit { prefs ->
            val existing = prefs[LIKES_KEY] ?: emptySet()
            prefs[LIKES_KEY] = if (wasLiked) existing - articleId else existing + articleId
        }

        return try {
            val response = api.toggleArticleLike(articleId)
            val liked = response.liked
            val count = response.likesCount

            // Sync with backend truth
            context.likesDataStore.edit { prefs ->
                val existing = prefs[LIKES_KEY] ?: emptySet()
                prefs[LIKES_KEY] = if (liked) existing + articleId else existing - articleId
            }
            _counts.update { it + (articleId to count) }
            Pair(liked, count)
        } catch (e: Exception) {
            // Revert optimistic update
            context.likesDataStore.edit { prefs ->
                val existing = prefs[LIKES_KEY] ?: emptySet()
                prefs[LIKES_KEY] = if (wasLiked) existing + articleId else existing - articleId
            }
            null
        }
    }

    /**
     * On article view appear: fetch the server count + reconcile.
     * If local says liked but server says not, we POST again to heal
     * the missing row. If local says NOT liked but server says liked,
     * we just sync local to match.
     */
    suspend fun reconcile(articleId: String) {
        try {
            val response = api.fetchArticleLikeStatus(articleId)
            val liked = response.liked
            val count = response.likesCount

            _counts.update { it + (articleId to count) }

            val localSaysLiked = currentLikedIds().contains(articleId)
            if (liked && !localSaysLiked) {
                context.likesDataStore.edit { prefs ->
                    val existing = prefs[LIKES_KEY] ?: emptySet()
                    prefs[LIKES_KEY] = existing + articleId
                }
            } else if (!liked && localSaysLiked) {
                // Heal — push the like back to the server so the row exists
                runCatching { api.toggleArticleLike(articleId) }
            }
        } catch (e: Exception) {
            // Network blip — keep local state as-is
        }
    }

    suspend fun clear() {
        _counts.value = emptyMap()
        context.likesDataStore.edit { it.remove(LIKES_KEY) }
    }
}
