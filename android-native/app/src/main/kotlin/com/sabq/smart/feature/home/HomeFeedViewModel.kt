package com.sabq.smart.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.Article
import com.sabq.smart.data.ArticleRepository
import com.sabq.smart.data.AudioNewsletter
import com.sabq.smart.data.BookmarksStore
import com.sabq.smart.data.CalendarEvent
import com.sabq.smart.data.HajjBlock
import com.sabq.smart.data.HomeExtrasRepository
import com.sabq.smart.data.InsightsRepository
import com.sabq.smart.data.LoyaltyRepository
import com.sabq.smart.data.LoyaltySummary
import com.sabq.smart.data.Section
import com.sabq.smart.data.Story
import com.sabq.smart.data.TodayInsights
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface HomeFeedUiState {
    data object Loading : HomeFeedUiState
    data class Error(val message: String) : HomeFeedUiState
    data class Loaded(
        val sections: List<Section>,
        val featured: List<Article>,
        val articles: List<Article>,
        val selectedSlug: String?,    // null = "الكل"
        val currentPage: Int,
        val hasMore: Boolean,
        val isRefreshing: Boolean = false,
        val isLoadingMore: Boolean = false,
        val bookmarkedIds: Set<String> = emptySet(),
        /** Top breaking-news headline — shown as a single coral pill
         *  between the greeting and the featured carousel. */
        val breaking: Article? = null,
        /** Top opinion articles (max 5). Rendered as a horizontal
         *  rail under the opinionsPreview section. */
        val opinions: List<Article> = emptyList(),
        /** Top trending articles (max 3). Rendered as a ranked list
         *  inside a SurfaceCard. */
        val trending: List<Article> = emptyList(),
        /** Featured story rails (circular bubbles). */
        val stories: List<Story> = emptyList(),
        /** Today's upcoming calendar events (max 3 shown). */
        val calendar: List<CalendarEvent> = emptyList(),
        /** Latest audio newsletter — surfaced as a play card. */
        val audioNewsletter: AudioNewsletter? = null,
        /** Personal-journey insights for the signed-in member. Null
         *  before the fetch completes OR for signed-out viewers. */
        val journeyInsights: TodayInsights? = null,
        /** Loyalty summary — used to render the LoyaltyStripView and
         *  the "نقاط الولاء" metric cell. Null before fetch / signed
         *  out. */
        val loyaltySummary: LoyaltySummary? = null,
        /** Seasonal Hajj block. Null when the backend hides it (out
         *  of season / no articles) — Home then renders nothing in
         *  this slot. */
        val hajjBlock: HajjBlock? = null,
    ) : HomeFeedUiState
}

@HiltViewModel
class HomeFeedViewModel @Inject constructor(
    private val repo: ArticleRepository,
    private val extrasRepo: HomeExtrasRepository,
    private val bookmarks: BookmarksStore,
    private val insightsRepo: InsightsRepository,
    private val loyaltyRepo: LoyaltyRepository,
) : ViewModel() {

    private val _state = MutableStateFlow<HomeFeedUiState>(HomeFeedUiState.Loading)
    val state: StateFlow<HomeFeedUiState> = _state.asStateFlow()

    init {
        initialLoad()
        // Mirror persisted bookmark IDs into the Loaded state so the
        // home feed's bookmark icons stay in sync with the Bookmarks
        // tab + survive process death.
        viewModelScope.launch {
            bookmarks.ids.collectLatest { ids ->
                _state.update { c ->
                    if (c is HomeFeedUiState.Loaded) c.copy(bookmarkedIds = ids) else c
                }
            }
        }
    }

    fun refresh() {
        val current = _state.value
        val slug = if (current is HomeFeedUiState.Loaded) current.selectedSlug else null
        loadFeed(slug = slug, page = 1, append = false)
    }

    fun selectSection(slug: String?) {
        val current = _state.value
        if (current is HomeFeedUiState.Loaded && current.selectedSlug == slug) return
        loadFeed(slug = slug, page = 1, append = false)
    }

    fun loadMore() {
        val current = _state.value
        if (current !is HomeFeedUiState.Loaded) return
        if (!current.hasMore || current.isLoadingMore) return
        loadFeed(slug = current.selectedSlug, page = current.currentPage + 1, append = true)
    }

    fun toggleBookmark(id: String) {
        viewModelScope.launch { bookmarks.toggle(id) }
        // Optimistic local flip — the persistent flow will re-emit the
        // canonical set in the next tick and re-update state.
        _state.update { c ->
            if (c is HomeFeedUiState.Loaded) {
                val ids = if (id in c.bookmarkedIds) c.bookmarkedIds - id else c.bookmarkedIds + id
                c.copy(bookmarkedIds = ids)
            } else c
        }
    }

    private fun initialLoad() {
        viewModelScope.launch {
            _state.value = HomeFeedUiState.Loading
            runCatching {
                val featuredJob = async { repo.getArticles(page = 1, limit = 5, featuredOnly = true) }
                val articlesJob = async { repo.getArticles(page = 1, limit = 20) }
                val sectionsJob = async { repo.getSections() }
                Triple(featuredJob.await(), articlesJob.await(), sectionsJob.await())
            }
                .onSuccess { (featured, articles, sections) ->
                    _state.value = HomeFeedUiState.Loaded(
                        sections = sections.take(10),
                        featured = featured.items,
                        articles = articles.items.filterNot { f ->
                            featured.items.any { it.id == f.id }
                        },
                        selectedSlug = null,
                        currentPage = articles.page,
                        hasMore = articles.hasMore,
                    )
                    // Side-fetches: best-effort, populate post-render.
                    loadExtras()
                }
                .onFailure { e ->
                    _state.value = HomeFeedUiState.Error(
                        message = friendlyNetworkMessage(e),
                    )
                }
        }
    }

    /**
     * Map a thrown failure to an Arabic, reader-facing message.
     * The default `e.localizedMessage` surfaces developer-facing
     * strings ("Parent job is Cancelling", "Unable to resolve host
     * sabq.org") that confused users on the home-feed error card
     * (reported 2026-05-20 from an emulator DNS outage). We
     * collapse the common network/cancellation cases here and keep
     * the original message for genuinely unknown failures so we
     * don't hide real bugs.
     */
    private fun friendlyNetworkMessage(t: Throwable): String {
        var c: Throwable? = t
        while (c != null) {
            when (c) {
                is java.net.UnknownHostException,
                is java.net.ConnectException ->
                    return "تعذّر الاتصال بالإنترنت. تحقّق من الشبكة وحاول مجدداً."
                is java.net.SocketTimeoutException ->
                    return "تعذّر الاتصال بسبب بطء الشبكة. حاول مجدداً."
                is java.io.IOException ->
                    return "تعذّر تحميل الأخبار. تحقّق من الشبكة وحاول مجدداً."
                is kotlinx.coroutines.CancellationException ->
                    return "تعذّر تحميل الأخبار. حاول مجدداً."
            }
            c = c.cause
        }
        return t.localizedMessage?.takeIf { it.isNotBlank() }
            ?: "تعذّر تحميل الأخبار"
    }

    /** Fetch the secondary Home blocks (breaking pill, opinions rail,
     *  trending top-3, plus the auth-gated personal-journey insights +
     *  loyalty summary). Each call is best-effort — failures keep the
     *  section empty rather than crash the screen. */
    private fun loadExtras() {
        viewModelScope.launch {
            val breakingJob = async { runCatching { repo.getBreaking() }.getOrDefault(emptyList()) }
            val opinionsJob = async { runCatching { repo.getOpinions(page = 1, limit = 5) }.getOrNull()?.items ?: emptyList() }
            val trendingJob = async { runCatching { repo.getTrending() }.getOrDefault(emptyList()) }
            val storiesJob = async { runCatching { extrasRepo.getStories() }.getOrDefault(emptyList()) }
            val calendarJob = async { runCatching { extrasRepo.getCalendarUpcoming() }.getOrDefault(emptyList()) }
            val audioJob = async { runCatching { extrasRepo.getLatestAudioNewsletter() }.getOrNull() }
            val hajjJob = async { runCatching { extrasRepo.getHajjBlock() }.getOrNull() }
            // Auth-required side-fetches. Anonymous users will 401 here;
            // we swallow that and the personal-journey block stays
            // hidden because [journeyInsights] remains null.
            val insightsJob = async { runCatching { insightsRepo.getToday() }.getOrNull() }
            val loyaltyJob = async { runCatching { loyaltyRepo.getSummary() }.getOrNull() }
            // Sync bookmarks with the server (two-way merge). Best-effort
            // — failure keeps local state. Fires on every home load so a
            // reinstall or cross-platform session picks up server state.
            async { runCatching { bookmarks.syncFromServer() } }

            val breaking = breakingJob.await().firstOrNull()
            val opinions = opinionsJob.await()
            val trending = trendingJob.await().take(3)
            val stories = storiesJob.await()
            val calendar = calendarJob.await().take(3)
            val audioNewsletter = audioJob.await()
            val hajjBlock = hajjJob.await()
            val insights = insightsJob.await()
            val loyalty = loyaltyJob.await()

            _state.update { c ->
                if (c is HomeFeedUiState.Loaded) {
                    c.copy(
                        breaking = breaking,
                        opinions = opinions,
                        trending = trending,
                        stories = stories,
                        calendar = calendar,
                        audioNewsletter = audioNewsletter,
                        hajjBlock = hajjBlock,
                        journeyInsights = insights,
                        loyaltySummary = loyalty,
                    )
                } else c
            }
        }
    }

    private fun loadFeed(slug: String?, page: Int, append: Boolean) {
        viewModelScope.launch {
            // Flip the right indicator (refresh vs. load-more) without
            // dropping currently-loaded content.
            _state.update { c ->
                if (c is HomeFeedUiState.Loaded) {
                    if (append) c.copy(isLoadingMore = true)
                    else c.copy(isRefreshing = true)
                } else c
            }

            runCatching { repo.getArticles(page = page, section = slug) }
                .onSuccess { page2 ->
                    _state.update { c ->
                        if (c !is HomeFeedUiState.Loaded) return@update c
                        val newArticles = if (append) {
                            val existingIds = c.articles.map { it.id }.toHashSet()
                            c.articles + page2.items.filter { it.id !in existingIds }
                        } else page2.items
                        c.copy(
                            articles = newArticles,
                            selectedSlug = slug,
                            currentPage = page2.page,
                            hasMore = page2.hasMore,
                            isRefreshing = false,
                            isLoadingMore = false,
                        )
                    }
                }
                .onFailure {
                    _state.update { c ->
                        if (c is HomeFeedUiState.Loaded)
                            c.copy(isRefreshing = false, isLoadingMore = false)
                        else c
                    }
                }
        }
    }
}
