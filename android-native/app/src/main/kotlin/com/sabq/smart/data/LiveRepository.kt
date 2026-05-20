package com.sabq.smart.data

import com.sabq.smart.data.api.SabqApi
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LiveRepository @Inject constructor(
    private val api: SabqApi,
) {
    /** Fetch a page of moment-by-moment updates. `cursor` is null for
     *  the first page, otherwise the previous response's nextCursor.
     *  `filter = "breaking"` restricts to breaking-flagged items.
     *  Returns the page + the cursor to use for the next call (or
     *  null when the feed is exhausted). */
    suspend fun getMomentByMomentPage(
        cursor: String? = null,
        filter: String? = null,
        limit: Int = 20,
    ): MomentByMomentPage {
        val response = api.getLiveUpdates(cursor = cursor, filter = filter, limit = limit)
        return MomentByMomentPage(
            items = response.items.map { it.toArticleShell() },
            nextCursor = response.nextCursor,
        )
    }

    /** Fetch the topical multi-country live coverage feed — distinct
     *  from [getMomentByMomentPage] above. Powers the dedicated
     *  LiveCoverageScreen with timeline + per-country filter + stats.
     *  iOS counterpart: `APIClient.fetchLive` (line 440). */
    suspend fun getLiveCoverage(
        country: String? = null,
        limit: Int = 50,
        offset: Int = 0,
        since: String? = null,
    ): LiveCoverage = api.getLiveCoverage(
        country = country,
        limit = limit,
        offset = offset,
        since = since,
    ).toDomain()
}

data class MomentByMomentPage(
    val items: List<Article>,
    val nextCursor: String?,
)
