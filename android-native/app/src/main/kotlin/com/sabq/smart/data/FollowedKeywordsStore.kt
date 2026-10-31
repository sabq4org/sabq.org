package com.sabq.smart.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.sabq.smart.data.api.KeywordFollowBody
import com.sabq.smart.data.api.KeywordSyncApi
import com.sabq.smart.data.api.KeywordSyncBody
import dagger.Lazy
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

private val Context.followedKeywordsDataStore by preferencesDataStore(name = "followed_keywords_prefs")
private val KEYWORDS_KEY = stringSetPreferencesKey("followed_keywords")

/**
 * «كلماتي». محفوظة على الجهاز، وتُزامَن مع حساب القارئ عند الدخول
 * (مرآة iOS `FollowedKeywordsStore.syncFromServer`): يُدمج المحلي في
 * الحساب ثم تُعتمد قائمة الخادم، فتظهر الكلمات نفسها على الويب وiOS.
 * فشل الشبكة يُبقي النسخة المحلية، والمزامنة القادمة تدمجها.
 */
@Singleton
class FollowedKeywordsStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: KeywordSyncApi,
    // Lazy: AuthRepository is heavy and not needed for local reads.
    private val auth: Lazy<AuthRepository>,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile private var started = false

    /** Flow of followed keywords */
    val keywords: Flow<Set<String>> = context.followedKeywordsDataStore.data
        .map { prefs -> prefs[KEYWORDS_KEY] ?: emptySet() }

    init {
        startSyncOnce()
    }

    private fun startSyncOnce() {
        if (started) return
        started = true
        scope.launch {
            auth.get().user.map { it?.id }.distinctUntilChanged().collect { userId ->
                if (userId != null) syncFromServer()
            }
        }
    }

    private fun signedIn(): Boolean = runCatching { auth.get().user.value != null }.getOrDefault(false)

    suspend fun syncFromServer() {
        val local = current().toList()
        val remote = runCatching { api.sync(KeywordSyncBody(local)).keywords }.getOrNull() ?: return
        context.followedKeywordsDataStore.edit { prefs ->
            prefs[KEYWORDS_KEY] = remote.map { it.name }.toSet()
        }
    }

    suspend fun current(): Set<String> = context.followedKeywordsDataStore.data
        .map { prefs -> prefs[KEYWORDS_KEY] ?: emptySet() }
        .first()

    suspend fun isFollowed(keyword: String): Boolean = current().contains(keyword)

    suspend fun toggle(keyword: String) {
        var nowFollowed = false
        context.followedKeywordsDataStore.edit { prefs ->
            val existing = prefs[KEYWORDS_KEY] ?: emptySet()
            nowFollowed = keyword !in existing
            prefs[KEYWORDS_KEY] = if (nowFollowed) existing + keyword else existing - keyword
        }
        if (signedIn()) {
            scope.launch {
                runCatching {
                    val body = KeywordFollowBody(keyword)
                    if (nowFollowed) api.follow(body) else api.unfollow(body)
                }
            }
        }
    }

    /** يمسح النسخة المحلية فقط (مثل iOS clear) — الحساب يبقى كما هو. */
    suspend fun clearAll() {
        context.followedKeywordsDataStore.edit { it.remove(KEYWORDS_KEY) }
    }
}
