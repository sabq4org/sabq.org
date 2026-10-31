# iOS reader/data pre-release review — 2026-10-31

Post-review authorized fix: calendar envelope finding has been addressed in `Services/APIDeepContent.swift` with a decoder supporting the raw array and legacy `{events:[]}`. Added `sabqTests/CalendarDecodingTests.swift` for populated/empty shapes plus null/malformed errors. `git diff --check` passed. Simulator/test execution handed to `ios_validation`; not yet claimed passed here. APIClient pagination and backend unchanged by this reviewer. Findings below describe the pre-fix audit snapshot.

Second authorized fix: pagination findings addressed in `Stores/ArticlesStore.swift`, `Services/NewsService.swift`, and `Screens/HomeFeedView.swift`. Seed cursor records endpoint/source, next page, and exhaustion. Visible quota is calculated after exclusions; load-more consumes buffers/remote duplicates until 25 additional visible rows or exhaustion, preserving retry cursor/target and discarding pre-refresh requests. Initial view fills a short quota without a tap. `HomeTimelinePagingTests.swift` adds eight async tests against the actual store with injected offline loaders (initial25, next50, duplicate pages, retry, failed seed continuation, fallback source, final/empty exhaustion, delayed load-more versus refresh). Sources handed to validation agent for combined execution; no test pass claimed yet.

Worktree: `/private/tmp/sabq-ios-featured-cover`; base supplied: `50f89948`; release supplied: 10.4.1 / 2026103106.

Read-only source review. No simulator, build, network requests or mutations performed. The only executable reproduction was a Python model of the pagination arithmetic. Runtime calendar error was reported by the coordinator; its cause is independently confirmed below from client/server source. Findings described as verified mean source-contract/control-flow verified, not device-tested. Paths below are relative to the worktree.

## Findings requiring attention

### P2 — Latest-25 pagination uses incompatible visible/raw counts and repeats the initial page (new change exposes no-op load-more)

- `sabq app ios/sabq/Stores/ArticlesStore.swift:225–255, 297–300`; initialization `103–108`.
- `sabq app ios/sabq/Services/NewsService.swift:34–43, 92–96`.
- Homepage now seeds 50 rows from `/news/paginated`, but `nextArticlesPage` resets to 1 and pagination later requests `/articles`. Visible timeline filters exclusions **before** applying `displayedCount`; loadMore still counts raw rows.
- Reproduction: newest 50 rows, four featured/breaking exclusions, no extra unique homepage sources. Initial visible count=25. First tap raises raw display count to50, yielding46 visible rows. Next tap requests page1/50 again and yields no new rows. Only another tap reaches page2. The arithmetic was reproduced locally: `25 → 46 → 46`, new remote rows=0. Endpoints differ in opinion/AI filtering, so blindly setting nextPage=2 is not safe with the current endpoint switch.
- Minimal robust fix: use one pagination source for this feed; return source/page/hasMore metadata with the homepage seed (or track whether initial pagination succeeded). Keep a visible target count, pass the same exclusion set into loadMore, and consume buffered/remote rows until reaching target+25 or genuine exhaustion. If initial pagination failed, start at1; if it succeeded, continue at2 with the **same endpoint**. Ignore duplicate IDs and preserve cursor/state on failure. Guard mutations after awaits with the refresh generation.
- Tests: 50 seed/4 exclusions gives25 initially and50 after one more when next-page rows exist; no repeated page1; successful initial-page failure fallback still starts remote page1; duplicate-only page advances internally without a dead tap; finite last page removes button; failed remote request retains cursor and retry; refresh racing load-more cannot overwrite cursor/list/loading state.

### P2 — Calendar always decodes the wrong envelope (existing, coordinator runtime symptom corroborated)

- `sabq app ios/sabq/Services/APIClient.swift:1727–1734` expects `APICalendarEventsResponse {events:[]}`.
- `server/routes/calendar.ts:63–68` returns `res.json(events)`; `server/storage.ts:14232` declares an array return.
- `CalendarView.swift:151–163` catches every successful-array decoding failure and shows a network error; HomeFeedView.swift:348/358 suppresses it into an empty calendar. Retry cannot repair this contract mismatch.
- Fix the upcoming endpoint decoder to accept the actual array (optionally an envelope for compatibility) in one fetch. Do not assume `/calendar` uses the same shape: its route returns the different paginated storage result.
- Tests: bare populated array, bare empty array, malformed payload; verify actual calendar screen shows returned dates. Also use the existing fractional-ISO parser: CalendarView.swift:11–24 currently tries two identical non-fractional ISO parsers and falls back to raw timestamp strings.

### P2 — Failed article detail has no terminal error/retry state (existing)

- `sabq app ios/sabq/Screens/ArticleDetailView.swift:556–573, 1242–1252`.
- A cold bookmark or deep link starts with an empty-body article shell. When news detail fails, opinion fallback also fails, and no cached detail exists, the view never records failure. Empty body always means five skeleton lines, indefinitely, although all requests finished. It offers no in-place retry. Same outcome for deleted/unpublished URL.
- Add explicit loading/failure states, show retry for transient errors and unavailable state for absent content; retain available cached content. Test network failure then retry success and404 on a cold deep link. This affects the core reading path and should be covered before submission.

### P2 — In-flight bookmark sync can repopulate a logged-out account (existing)

- `sabq app ios/sabq/Stores/BookmarksStore.swift:81–119, 210–216`; `ContentView.swift:104–109`.
- `syncFromServer` launches an untracked Task. Logout clears local state but neither cancels nor invalidates the request. If account A's response completes after logout, it inserts A's IDs and persists them again. A subsequent B login can union/push those IDs to B. Source-verified interleaving; no account experiment performed.
- Capture an account/session generation for sync; invalidate on clear/logout and check before every post-await mutation/push. Test delayed A response after clear/B login.

### P2 — Removing a bookmark offline is undone on next sync (existing)

- `sabq app ios/sabq/Stores/BookmarksStore.swift:37–66, 101–111`.
- Removal deletes local state; failed DELETE is swallowed without tombstone. On reconnect the server still has the ID, and union sync re-adds it. The comment promising server catch-up is incorrect for removals.
- Persist pending remove/add operations per account, reconcile removals before union, and test offline delete/reconnect. Rapid toggle ordering also deserves coverage.

### P2 — Refresh can be overwritten by an older load-more request (existing)

- `sabq app ios/sabq/Stores/ArticlesStore.swift:231–260` vs `loadArticles:61–108`; HomeFeedView.swift:283–285.
- Start a delayed loadMore request, then pull to refresh. Refresh resets cursor/list and increments generation; loadMore has no generation check after its await, so it appends the old page, increments the newly reset cursor, changes hasMore, and can clear isLoading while refresh still runs. That can skip a page or mix old and refreshed snapshots.
- Include generation guard in the pagination fix and test both completion orders.

## Other observations, not release blockers established by this review

- SearchView has request identity/cancellation guards for submission; results only request page1 although searchTotal can be larger. Existing feature limitation. Its cancellation on disappearance leaves isSearching=true if navigating away mid-request; revisit/retry should be exercised.
- CategoryCacheActor.get (`NewsService.swift:334–337`) deletes expired entries before `getStale` can use them on failure. The claimed stale fallback is ineffective. Existing offline resilience issue; not introduced here.
- The HTTPS deep-link branch currently handles articles/Roshn but not opinion HTTPS paths; custom and relative opinion links are handled. Without current AASA delivery evidence this is a coverage concern, not asserted as a universal-link release blocker.
- New cover preserves ArticleLink, full accessibility labels/actions and flexible Dynamic Type rows. Missing image is omitted. Muq header URL whitespace guard and image fallback improvement are present. JustifiedText changes paragraph alignment defaults without replacing text or navigation. Opinion row changes retain the existing links and have no fixed text height. Added APIs used by these diffs are available by iOS17; compiler/device certification remains the coordinator's responsibility.
- Audio log is **tolerated fallback**, not the calendar bug: `APIClient.swift:1762–1770` first attempts a bare array then decodes `{newsletters:[]}` successfully. `server/routes/audioNewsletterCompatibility.ts:5–20` deliberately returns that envelope with `retired:true`. Consider one flexible decode to avoid extra fetch/log noise, but no functionality failure is proven by the first decode error alone.

## Scope and confidence

Reviewed all listed uncommitted Swift diffs/new components/tests, store/service paths, reader load/body fallback, search, bookmarks, deep-link dispatch/parser, relevant current server contracts, and applicable Muq/calendar/push docs. No use of archived CODE_REVIEW.md. This is not an exhaustive whole-app security or App Store policy audit. No P0/P1 crash or iOS17 symbol incompatibility was proven in the new UI changes; calendar, pagination and failure/recovery items above remain concrete functional issues.
