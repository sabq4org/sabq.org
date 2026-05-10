# Neon Database Cost Forensic Report
## Invoice Period: Feb 1–28, 2026 | Total: $1,407.43

---

## SECTION 1: Verdict

**The #1 driver of the $1,407 invoice is public network transfer ($825/59%) caused by overfetching wide article rows.** The `articles` table has **104 columns** — including heavy JSONB fields (`infographicData`, `weeklyPhotosData`, `seo`, `seoMetadata`, `sourceMetadata`, `geoLocations`, `imageFocalPoint`), large text fields (`content`, `aiSummary`, `credibilityAnalysis`, `aiImagePrompt`), and text arrays (`albumImages`). Despite the existence of `selectHelpers.ts` with optimized `articleCardSelect` (17 fields), **zero storage functions import or use it** — 15 queries in `storage.ts` use `article: articles` (full 104-column select). The old `/api/homepage` endpoint fires 6 parallel queries via storage functions that each return ~30 fields + full `categories`/`users` joins, and `getArticles()` returns ALL 104 columns for up to 500 rows.

**The #2 driver is compute ($580/41%)** caused by: (a) article detail page fan-out (5–8 DB queries per page view), (b) unconditioned `recordArticleRead` INSERT on every authenticated article view, (c) `behavior_logs` INSERT on every user interaction, (d) `getArticles()` running a sub-query for iFox categories on every call, and (e) the old homepage endpoint running 7 DB queries (6 article queries + 1 polls query) per cache miss.

**Storage ($2.46) is irrelevant** — 2.3 GB root + 0.13 GB child branches = 0.17% of the bill.

---

## SECTION 2: Top Suspicious Endpoints

### 2.1 GET `/api/articles/:slug` (Article Detail)
- **Why suspicious**: Uses `a.*` (raw SQL, 104 columns) + 4 inline subqueries (reactions count, comments count, is_bookmarked, has_reacted) + 6-table JOIN (articles, categories, users×2, staff×2, publishers). Every authenticated view also triggers `recordArticleRead` INSERT.
- **Primary billing impact**: Network transfer (sends 104 columns including `content` to client) + Compute (complex query + write)
- **Code path**: `storage.getArticleBySlug()` at `server/storage.ts:3939`
- **Likely traffic level**: VERY HIGH — every article click
- **Severity**: CRITICAL
- **Confidence**: 95%

### 2.2 GET `/api/homepage` (Old Homepage)
- **Why suspicious**: Runs 7 DB queries via Promise.all: `getHeroArticles()`, `getAllPublishedArticles(20)`, `getBreakingNews(5)`, `getEditorPicks(6)`, `getDeepDiveArticles(6)`, `getTrendingTopics()` + 1 polls query. Each storage function selects ~30 article fields + full `categories` + full `users` objects + `storyLinks` + `stories` JOINs. Although cached via SWR (10 min), each cache miss = 7 queries.
- **Primary billing impact**: Compute (7 queries × multi-table JOINs) + Network (sends full category/user objects)
- **Code path**: `server/routes.ts:10488`
- **Likely traffic level**: MEDIUM (superseded by homepage-lite, but still registered and accessible)
- **Severity**: HIGH
- **Confidence**: 85%

### 2.3 GET `/api/news/paginated` (Load More Feed)
- **Why suspicious**: Called on every "Load More" scroll. The articles query itself is well-narrowed (11 fields), but is NOT cached (only the count is cached). Every scroll = 1 DB query.
- **Primary billing impact**: Compute (high frequency) + Network
- **Code path**: `server/routes.ts:12992`
- **Likely traffic level**: HIGH — triggered by infinite scroll
- **Severity**: MEDIUM-HIGH
- **Confidence**: 85%

### 2.4 POST `/api/behavior/log` (Behavior Tracking)
- **Why suspicious**: Called on EVERY user interaction: article_view, article_read, comment_create, bookmark_add, reaction_add, search, social_share. Each call = 1 INSERT to `behavior_logs` + conditional INSERT to `userEvents`. For authenticated users, this is ~3-5 writes per article view.
- **Primary billing impact**: Compute (write amplification)
- **Code path**: `server/routes.ts:18558`, `storage.logBehavior()` at `storage.ts:9192`
- **Likely traffic level**: VERY HIGH
- **Severity**: HIGH
- **Confidence**: 90%

### 2.5 GET `/api/articles/:slug/sidebar`
- **Why suspicious**: Runs 3 parallel queries (relatedArticles, articleTags, articleMediaAssets). `getRelatedArticles()` uses `article: articles` (full 104-column select).
- **Primary billing impact**: Network (full article rows for related) + Compute
- **Code path**: `storage.getRelatedArticles()` at `storage.ts:4431`
- **Likely traffic level**: HIGH — every article page
- **Severity**: MEDIUM-HIGH
- **Confidence**: 85%

### 2.6 GET `/api/categories/slug/:slug/articles`
- **Why suspicious**: Calls `storage.getArticles()` which selects `article: articles` (ALL 104 columns) with limit 500. The iFox exclusion sub-query adds another DB roundtrip.
- **Primary billing impact**: Network (104 columns × up to 500 rows) + Compute
- **Code path**: `storage.getArticles()` at `storage.ts:3911`
- **Likely traffic level**: MEDIUM-HIGH
- **Severity**: CRITICAL
- **Confidence**: 90%

---

## SECTION 3: Top Suspicious DB Functions

### 3.1 `getArticles()` — storage.ts:3837
- **Why suspicious**: Selects `article: articles` (full 104-column ORM select) for ALL use cases. Default limit is 500. Also runs a sub-query for iFox categories on EVERY call (`db.select().from(categories).where(isIfoxCategory)`), adding 1 extra roundtrip.
- **Primary billing impact**: Network + Compute
- **Code evidence**: Line 3912: `article: articles,` — full table select. Line 3892: iFox sub-query on every call.
- **Severity**: CRITICAL
- **Confidence**: 95%

### 3.2 `getArticleBySlug()` — storage.ts:3933
- **Why suspicious**: Uses `SELECT a.*` (raw SQL, all 104 columns) + 6-table JOIN + 4 correlated subqueries. Returns `content` field (potentially 10KB+ per article) even though it's needed for detail view.
- **Primary billing impact**: Network (massive payload) + Compute (complex query)
- **Code evidence**: Line 3941: `a.*`
- **Severity**: HIGH (content IS needed here, but the remaining ~60 unused columns are waste)
- **Confidence**: 90%

### 3.3 `getHeroArticles()` / `getAllPublishedArticles()` / `getEditorPicks()` / `getDeepDiveArticles()` / `getBreakingNews()` — storage.ts:7583-8200
- **Why suspicious**: Each selects ~30 article fields + `category: categories` (full category table) + `author: users` (full users table) + `reporter` alias + `storyLinks` + `stories` JOINs. Then each does heavy JS mapping to construct the return object, setting ~40 fields to defaults/null. Used by old `/api/homepage`.
- **Primary billing impact**: Network (full categories/users objects) + Compute (5 separate queries with 5 JOINs each)
- **Code evidence**: Lines 7623: `category: categories` (all category columns), 7624: `author: users` (all user columns including passwordHash, 2FA secrets)
- **Severity**: HIGH
- **Confidence**: 90%

### 3.4 `recordArticleRead()` — storage.ts:6010
- **Why suspicious**: Unconditional INSERT to `readingHistory` on EVERY authenticated article view. No dedup check. If user views same article 10 times, 10 rows inserted.
- **Primary billing impact**: Compute (write per view)
- **Code evidence**: Line 6011: bare `db.insert(readingHistory).values(...)` with no upsert/conflict handling
- **Severity**: HIGH
- **Confidence**: 95%

### 3.5 `incrementArticleViews()` — storage.ts:4295
- **Why suspicious**: The view buffer (routes.ts:396) batches views in memory and flushes every 60s. However, the increment uses a **random boost of 5-10** per view for "team morale" — this multiplies the actual write frequency's impact on the `views` column.
- **Primary billing impact**: Compute (UPDATE per flush, but mitigated by buffer)
- **Code evidence**: Line 4296-4298: `randomBoost = [5,6,7,8,9,10]`
- **Severity**: LOW (buffered correctly)
- **Confidence**: 80%

### 3.6 `calculateAllEngagementScores()` — storage.ts:20758
- **Why suspicious**: Runs 4 batched aggregate queries across `reactions`, `comments`, `bookmarks`, `readingHistory` tables + batch upsert to `articleEngagementScores`. Already optimized from N+1 to batched. Runs periodically.
- **Primary billing impact**: Compute
- **Severity**: MEDIUM (already optimized)
- **Confidence**: 75%

---

## SECTION 4: Top Suspicious Write Paths

### 4.1 `recordArticleRead` — INSERT to readingHistory
- **Write path**: `storage.ts:6011` → INSERT readingHistory
- **Why suspicious**: Called on every authenticated article view (`routes.ts:13392`). No deduplication — viewing same article creates duplicate rows.
- **What triggers it**: User clicks any article while logged in
- **Duplicates**: YES — multiple reads of same article = multiple rows
- **Severity**: HIGH
- **Confidence**: 95%

### 4.2 `logBehavior` — INSERT to behavior_logs
- **Write path**: `storage.ts:9192` → INSERT behaviorLogs
- **Why suspicious**: Called for every user interaction: `article_view`, `article_read`, `comment_create`, `bookmark_add`, `reaction_add`, `search`, `social_share`. Frontend hook `useBehaviorTracking` fires on multiple events per page. `article_read` fires TWICE — once on view, once after 30s.
- **What triggers it**: Every frontend interaction for logged-in users
- **Duplicates**: YES — `article_view` + `article_read` overlap with `recordArticleRead` above
- **Severity**: HIGH
- **Confidence**: 90%

### 4.3 View Buffer Flush — UPDATE articles.views
- **Write path**: `routes.ts:396-439` → batched UPDATE articles SET views
- **Why suspicious**: Flushed every 60 seconds. Low concern due to buffering.
- **What triggers it**: Timer-based (60s interval)
- **Duplicates**: No (properly batched)
- **Severity**: LOW
- **Confidence**: 90%

### 4.4 `updateReadingProgress` — SELECT + UPDATE readingHistory
- **Write path**: `storage.ts:6019` → SELECT readingHistory + UPDATE
- **Why suspicious**: Called when user scrolls. Does a SELECT first to check existing progress, then conditional UPDATE. Two DB roundtrips per scroll event.
- **What triggers it**: User scrolling article page
- **Duplicates**: Overlaps with `recordArticleRead`
- **Severity**: MEDIUM
- **Confidence**: 80%

---

## SECTION 5: Top Suspicious Wide-Row Selects

### 5.1 `getArticles()` — `article: articles` (104 columns)
- **Location**: `storage.ts:3912`
- **Query shape**: `SELECT articles.*, categories.*, users.*, reporter.*` (ORM full-table select)
- **Why row width is dangerous**: 104 article columns × 500 rows default = massive result set
- **Heavy fields included**: `content` (full article body, 5-50KB), `infographicData` (complex JSONB, 1-10KB), `weeklyPhotosData` (JSONB with image arrays), `seo` (JSONB), `seoMetadata` (JSONB with `rawResponse`), `sourceMetadata` (JSONB), `credibilityAnalysis` (text), `aiImagePrompt`, `aiThumbnailPrompt`, `albumImages` (text array), `geoLocations` (JSONB)
- **Network transfer estimate**: ~50KB per row × 500 rows = ~25MB per uncached call
- **Severity**: CRITICAL
- **Confidence**: 95%

### 5.2 `getArticleBySlug()` — `SELECT a.*` (104 columns)
- **Location**: `storage.ts:3941`
- **Query shape**: Raw SQL `SELECT a.*, c.*, u.*, r.*, s.*, rs.*, p.*, (subqueries...)` — 6 JOINs
- **Heavy fields included**: ALL 104 article columns + all user columns (including `passwordHash`, `twoFactorSecret`, `twoFactorBackupCodes`) + all category columns
- **Why dangerous**: Sends user password hashes over the wire. Content field needed but everything else is waste.
- **Severity**: CRITICAL (also a security concern with password hashes)
- **Confidence**: 95%

### 5.3 Old Homepage functions (5 functions) — `category: categories` + `author: users`
- **Location**: `storage.ts:7623,7898,8042,8177` (getHero, getAllPublished, getEditorPicks, getDeepDive)
- **Query shape**: Narrowed article fields (~30) BUT `category: categories` and `author: users` are FULL table selects
- **Heavy fields included**: Full `users` table including `passwordHash`, `twoFactorSecret`, `twoFactorBackupCodes`, `bio`, `fcmToken` | Full `categories` table including `features` (JSONB), `heroImageUrl`, `description`
- **Why dangerous**: Sends user passwords and secrets inside every homepage article card
- **Severity**: CRITICAL (security) / HIGH (network)
- **Confidence**: 95%

### 5.4 `getRelatedArticles()` — `article: articles` (104 columns)
- **Location**: `storage.ts:4431`
- **Query shape**: Full article + category + users + reporter
- **Why dangerous**: Fetches 5 full articles (with `content`) just to show related article cards
- **Severity**: HIGH
- **Confidence**: 90%

---

## SECTION 6: Top Suspicious Fan-Out Flows

### 6.1 Article Detail Page Load (Authenticated User)
- **User flow**: Click article → page loads
- **Requests involved**:
  1. `GET /api/articles/:slug` → 6-table JOIN + 4 subqueries + `recordArticleRead` INSERT
  2. `GET /api/articles/:slug/comments` → SELECT comments with user JOIN
  3. `GET /api/articles/:slug/sidebar` → 3 parallel queries (related articles, tags, media)
  4. `POST /api/behavior/log` (article_view) → INSERT behavior_logs
  5. `POST /api/behavior/log` (article_read at 30s) → INSERT behavior_logs
  6. `GET /api/auth/user` → session check
  7. `GET /api/shortlinks/article/:id` → short link lookup
  8. (Conditional) `GET /api/payments/check-purchase/:id` → if paid article
  9. (Lazy) `GET /api/articles/:slug/ai-recommendations` → recommendation engine queries
  10. (Lazy) `GET /api/articles/:slug/stats` → analytics aggregation
- **DB implications**: Minimum 8 DB queries + 3 INSERTs per article view for logged-in user
- **Why it multiplies cost**: Each article click = ~11 DB operations. With 2200 concurrent users, this creates massive DB pressure.
- **Severity**: CRITICAL
- **Confidence**: 95%

### 6.2 Homepage Load (Cold Cache)
- **User flow**: Visit homepage
- **Requests involved**: `GET /api/homepage-lite` (well-optimized: 5 narrow queries + trending) or `GET /api/homepage` (6 wide queries + polls query)
- **DB implications**: homepage-lite = 6 queries (narrow). Old homepage = 7 queries (wide).
- **Why it multiplies cost**: First visit after cache expiry (10 min) triggers all queries. With 3 pods, cache is per-pod.
- **Severity**: MEDIUM (mitigated by SWR cache)
- **Confidence**: 80%

### 6.3 Category Page Load
- **User flow**: Click category
- **Requests involved**: `GET /api/categories/slug/:slug` + `GET /api/categories/:slug/articles` (calls `getArticles()` with 104-column select)
- **DB implications**: 104 columns × N articles + iFox sub-query
- **Severity**: HIGH
- **Confidence**: 85%

---

## SECTION 7: Top Suspicious Compute Multipliers

### 7.1 Per-Article-View Write Triplication
- **Multiplier**: 3x writes per authenticated article view
- **Mechanism**: `recordArticleRead` (INSERT) + `logBehavior(article_view)` (INSERT) + `logBehavior(article_read)` (INSERT after 30s)
- **Why it raises CU-hours**: Every article click by a logged-in user generates 3 separate INSERT operations across 2 tables
- **Code evidence**: `routes.ts:13392` (recordArticleRead), `useBehaviorTracking.ts:31` (POST /api/behavior/log), `useArticleReadTracking.ts:38,71` (fires twice)
- **Severity**: HIGH
- **Confidence**: 95%

### 7.2 iFox Category Sub-Query on Every `getArticles()` Call
- **Multiplier**: +1 query per `getArticles()` invocation
- **Mechanism**: Lines 3892-3906 run `db.select().from(categories).where(isIfoxCategory)` on EVERY call to `getArticles()`, even when the result is always the same set of IDs
- **Why it raises CU-hours**: `getArticles()` is called from 6+ routes. This sub-query should be cached or inlined.
- **Code evidence**: `storage.ts:3892`
- **Severity**: MEDIUM
- **Confidence**: 90%

### 7.3 Dynamic Categories Job — Hourly Engagement Aggregation
- **Multiplier**: Hourly full-table scan
- **Mechanism**: Calculates `(views * 1.0) + (reactions * 10.0) + (comments * 15.0)` across articles table
- **Code evidence**: `server/jobs/dynamicCategoriesJob.ts`
- **Severity**: MEDIUM
- **Confidence**: 75%

### 7.4 Recommendation Engine — Collaborative Filtering
- **Multiplier**: Self-JOIN on readingHistory
- **Mechanism**: Joins `readingHistory` with itself to find similar users (lines 356-374 in `recommendation-engine.ts`), then generates candidates from their reading patterns
- **Why it raises CU-hours**: readingHistory grows unbounded; self-JOIN cost = O(n²)
- **Code evidence**: `server/recommendation-engine.ts:356-396`
- **Severity**: HIGH (if triggered on public traffic paths)
- **Confidence**: 80%

---

## SECTION 8: Top 10 Code Locations to Inspect First

| Rank | File Path | Function/Route | Reason |
|------|-----------|---------------|--------|
| **#1** | `server/storage.ts:3912` | `getArticles()` | Full 104-column select used on 6+ routes, default limit 500 |
| **#2** | `server/storage.ts:3941` | `getArticleBySlug()` | `SELECT a.*` sends 104 cols + user passwords over wire |
| **#3** | `server/storage.ts:4431` | `getRelatedArticles()` | Full 104-col select for related article cards (needs ~10 fields) |
| **#4** | `server/routes.ts:13392` | `GET /api/articles/:slug` | `recordArticleRead` INSERT on every auth view (no dedup) |
| **#5** | `server/routes.ts:18558` | `POST /api/behavior/log` | INSERT per interaction, duplicates view tracking |
| **#6** | `server/storage.ts:7623,7898` | Homepage storage funcs | `category: categories` + `author: users` = full table selects including passwords |
| **#7** | `server/storage.ts:3892` | iFox sub-query in getArticles | Extra DB roundtrip on every getArticles call |
| **#8** | `server/storage.ts:6010` | `recordArticleRead()` | No dedup — same article viewed 10 times = 10 rows |
| **#9** | `server/recommendation-engine.ts:356` | Collaborative filtering | Self-JOIN on readingHistory = O(n²) |
| **#10** | `server/storage.ts:8042,8177` | `getEditorPicks/getDeepDive` | Full users/categories in JOINs, send passwords in API responses |

---

## SECTION 9: What Is Driving the Invoice Mechanically

### Public Network Transfer ($825 / 8,255 GB)
**Primary cause**: Overfetching wide rows from the `articles` table (104 columns). Key amplifiers:
- `getArticles()` returns ALL 104 columns (including `content`, `infographicData`, `weeklyPhotosData`, `seoMetadata.rawResponse`) for up to 500 rows per call
- `getArticleBySlug()` uses `SELECT a.*` returning all columns including full article body
- `getRelatedArticles()` sends full article bodies for sidebar cards
- Homepage storage functions include `category: categories` (full object) and `author: users` (full object including password hashes, 2FA secrets, FCM tokens)
- **Math**: 8,255 GB / 28 days = ~295 GB/day. At ~50KB per article response × 104 columns, this implies ~6M article-related responses/day — plausible for a 2200-concurrent-user news site with fan-out

### Compute ($580 / 5,467 CU-hours)
**Primary causes**:
1. **Write amplification**: 3 INSERTs per article view (recordArticleRead + 2× behavior_log)
2. **Query complexity**: Article detail page triggers 6-table JOIN with 4 correlated subqueries
3. **Fan-out**: Article detail page = ~11 DB operations per view
4. **Sub-query overhead**: iFox category check on every `getArticles()` call
5. **Background jobs**: Hourly dynamic categories, engagement score recalculation, recommendation engine
6. **Missing caching**: `/api/news/paginated` articles query not cached (only count is cached)

### Why Storage Is Tiny ($2.46)
The database stores mostly text and JSONB — no BLOBs. Images are stored in Object Storage (GCS), not the database. Article `content` is text (not HTML with embedded base64). Total DB size ~2.3 GB is reasonable for a news platform.

---

## SECTION 10: Existing Optimization Helpers Being Bypassed

### 10.1 `selectHelpers.ts` — COMPLETELY UNUSED in storage.ts
- **File**: `server/selectHelpers.ts`
- **Contains**: `articleCardSelect` (17 fields), `articleDetailSelect` (20 fields), `articleAdminSelect` (20 fields), `categoryBasicSelect` (8 fields), `userPublicSelect` (5 fields), `articleWithDetailsSelect` (combined), `articleFullDetailsSelect` (combined)
- **Usage in storage.ts**: **ZERO** — not even imported
- **Usage in routes.ts**: Only used in `homepage-lite` endpoint (local `minimalArticleSelect`, not the helper)
- **Impact if adopted**: Would reduce article payload from 104 columns to 17 columns (~84% reduction) on all list endpoints

### 10.2 `minimalArticleSelect` in homepage-lite — Duplicated, Not Shared
- **File**: `server/routes.ts:10584`
- **Contains**: 22-field select used only in `/api/homepage-lite`
- **Problem**: Defined inline, not exported or reused. The old `/api/homepage` doesn't use it.

### 10.3 View Buffer — Exists but `recordArticleRead` Bypasses It
- **File**: `server/routes.ts:396`
- **Status**: View counter is properly buffered (60s flush). But `recordArticleRead()` does an immediate INSERT per view with no buffer or dedup.

### 10.4 `transformArticleImageUrls()` — CDN URL Helper Available
- **File**: `server/selectHelpers.ts:21`
- **Status**: Exists but usage is inconsistent. Not applied to all API responses.

---

## SECTION 11: Fastest Likely Fixes (Ranked)

| Rank | Fix | Likely Savings | Risk | Effort |
|------|-----|---------------|------|--------|
| **#1** | Replace `article: articles` with `articleCardSelect` in `getArticles()`, `getRelatedArticles()`, and 13 other full-select queries | **$300-400/mo network** | LOW | 2-3 hours |
| **#2** | Replace `SELECT a.*` in `getArticleBySlug()` with explicit column list excluding unused fields | **$50-100/mo network** | LOW | 1 hour |
| **#3** | Deduplicate `recordArticleRead` — use UPSERT (ON CONFLICT DO UPDATE) instead of blind INSERT | **$50-80/mo compute** | LOW | 30 min |
| **#4** | Replace `category: categories` / `author: users` with `categoryBasicSelect` / `userPublicSelect` in all homepage storage functions | **$100-150/mo network** + **security fix** | LOW | 2 hours |
| **#5** | Batch/debounce `behavior_log` writes — buffer in memory and flush every 30s (like view buffer) | **$40-60/mo compute** | MEDIUM | 1-2 hours |
| **#6** | Cache iFox category IDs (static data, changes rarely) instead of querying on every `getArticles()` call | **$20-30/mo compute** | LOW | 15 min |
| **#7** | Cache `/api/news/paginated` article results (not just count) with SWR (2 min TTL) | **$30-50/mo compute** | LOW | 30 min |
| **#8** | Consolidate article detail page fan-out: merge sidebar data into main article response | **$20-40/mo compute** | MEDIUM | 2-3 hours |
| **#9** | Remove `user.passwordHash`, `twoFactorSecret`, `twoFactorBackupCodes` from API responses (security fix + network reduction) | **$10-20/mo network** + **critical security** | LOW | 1 hour |
| **#10** | Add TTL/rotation to `readingHistory` and `behavior_logs` tables (currently grow unbounded) | **$20-40/mo compute long-term** | LOW | 1 hour |

**Estimated total savings from fixes #1-#6**: **$520-820/month** (37-58% reduction)

---

## SECTION 12: Unknowns Requiring Neon Console Verification

1. **pg_stat_statements**: Must verify which queries consume the most CU-hours and generate the most network bytes. The above analysis is based on code inspection — actual query frequency data from Neon would confirm rankings.

2. **Network transfer breakdown**: Neon Console → Consumption tab → "Data Transfer" to see which queries generate the most egress. This would definitively confirm whether `getArticles()` (104-col) or `getArticleBySlug()` (a.*) is the bigger offender.

3. **Connection count over time**: Verify that the pool max=15 × 3 pods = 45 connections is not hitting Neon's connection limit, causing connection wait times that inflate CU-hours.

4. **Active compute endpoints**: Confirm how many Neon compute endpoints are active and their auto-suspend settings. If auto-suspend is disabled or set to a long timeout, idle compute accrues CU-hours.

5. **Read replicas**: Check if read replicas exist — they would double compute costs if queries are not routed efficiently.

6. **Branching**: 0.13 GB child branches exist — verify these aren't running active queries (preview deployments, CI/CD) that contribute to compute.

7. **External integrations**: Verify no external services (MailerSend webhooks, WhatsApp aggregator, iFox RSS, foreign news RSS) are making direct DB connections outside the app pool.

8. **Autoscale compute sizing**: Check Neon Console for compute size (CU) and whether autoscaling is configured. A higher minimum compute size = more CU-hours even at idle.

9. **WAL (Write-Ahead Log) pressure**: The write amplification (3 INSERTs per article view) increases WAL size, which may contribute to compute costs via WAL processing.

10. **Query plan caching**: Verify whether Neon is caching query plans for the frequent queries. Without plan caching, each query incurs planning overhead.

---

*Report generated: March 28, 2026*
*Codebase: server/storage.ts (21,638 lines), server/routes.ts (28,018 lines), shared/schema.ts (12,338 lines)*
*Articles table: 104 columns | selectHelpers.ts usage in storage.ts: 0*
