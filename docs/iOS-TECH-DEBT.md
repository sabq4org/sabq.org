# iOS Tech Debt Backlog

Living list of code-review findings that haven't been fixed yet. Generated 2026-05-17 from a full audit of `sabq app ios/sabq/` covering Performance, Memory, Security, Error Handling, Code Quality, and Architecture.

When you fix something, **delete the entry** (don't just check it off) — git history is the audit trail. When you add something, follow the format and link to file:line.

---

## 🔴 CRITICAL — block release if user-visible regression risk is high

### perf-1: `.task` in HomeFeedView refires every appearance

- **Where**: [sabq app ios/sabq/Screens/HomeFeedView.swift:122](../sabq%20app%20ios/sabq/Screens/HomeFeedView.swift#L122)
- **Problem**: `.task { ... }` runs 5 background fetches (insights, OMQ, calendar, newsletters, rich journey) on every appearance. Navigating Home → Article → back re-fires all 5 with no dedup.
- **Fix**: Use `.task(id: somePreloadKey)`, or guard each fetch with `if cached != nil && cached_at < 1.hour.ago return`. Best done by moving the fetches into a `HomeDataStore` with its own load-once semantics.
- **Effort**: 1-2 hours (new Store + migration).

### perf-2: JSONDecoder runs on caller's executor

- **Where**: [sabq app ios/sabq/Services/APIClient.swift:1139](../sabq%20app%20ios/sabq/Services/APIClient.swift#L1139) (`decode<T>` helper)
- **Problem**: `JSONDecoder().decode(...)` is called from inside the `APIClient` actor — but the actor's executor often hops back to MainActor when the caller awaits from a SwiftUI view. Large paginated payloads (50+ articles, ~5MB) decode on main thread = scroll hitch.
- **Fix**: Wrap the decode in `Task.detached(priority: .background) { try decoder.decode(...) }` inside `decode<T>`. Verify with Instruments before/after — sometimes the JIT specialization already runs it off-main.
- **Effort**: 30 min code change + 30 min profiling to confirm impact.

### perf-3: AVPlayer cleanup is reactive only

- **Where**: [sabq app ios/sabq/Screens/ArticleDetailView.swift:20](../sabq%20app%20ios/sabq/Screens/ArticleDetailView.swift#L20)
- **Problem**: `audioPlayer` is created when audio summary loads, but only torn down in `.onDisappear`. If audio fetch fails or article has no audio, the unused AVPlayer instance still sits in `@State` until the view is dismissed.
- **Fix**: In `loadExtras()`, immediately `audioPlayer = nil` if `audioSummary == nil` after the fetch resolves.
- **Effort**: 15 min.

### sec-1: Deep-link parser has no origin validation

- **Where**: [sabq app ios/sabq/Services/PushNotifications.swift:122](../sabq%20app%20ios/sabq/Services/PushNotifications.swift#L122) (`parseSabqDeepLink`)
- **Problem**: Validates scheme = `sabq` but trusts any path/id/slug. A locally-crafted `sabq://draft/<attacker-id>` link (from another app, Mail, etc.) is accepted as if it came from APNs.
- **Fix**: Two layers — (a) restrict accepted paths to a hardcoded whitelist (`article/`, `opinion/`, `omq/`, etc.); (b) sanitize slug values against `^[a-z0-9-]{1,200}$` regex; (c) for editorial-notification deep-links, require an `apns_signed` field in userInfo proving the payload was server-generated.
- **Effort**: 1 hour (whitelist + regex). APNs signing is a separate larger task.

### err-1: NewsService swallows errors → blank UI

- **Where**: [sabq app ios/sabq/Services/NewsService.swift:68-78, 82-90](../sabq%20app%20ios/sabq/Services/NewsService.swift#L68)
- **Problem**: `fetchHomepage()` and `fetchArticles()` return `([], false)` on any failure. User sees an empty feed with no explanation — can't tell if it's network, server downtime, or genuinely no content.
- **Fix**: Define a `Result<HomepageBundle, FeedError>` return type with cases for `.network`, `.server(Int)`, `.empty`. Surface to view layer; render `ErrorStateView` with a retry button when not `.empty`.
- **Effort**: 3-4 hours (touches NewsService + ArticlesStore + 3 screen views + needs ErrorStateView component).

---

## 🟡 WARNING — fix this sprint

### perf
- `trackView` Task started without cancellation — [ArticleDetailView.swift:358](../sabq%20app%20ios/sabq/Screens/ArticleDetailView.swift#L358). Store handle in `@State`, cancel in `.onDisappear`.
- Hero images load at full resolution — [ArticleDetailView.swift:412](../sabq%20app%20ios/sabq/Screens/ArticleDetailView.swift#L412). Add explicit `.resizable().scaledToFill()` + verify CachedAsyncImage downsamples to screen scale.
- CommentsStore has no pagination — [Stores/CommentsStore.swift](../sabq%20app%20ios/sabq/Stores/CommentsStore.swift). Implement cursor-based load-more, cap visible to ~100.
- Scroll callback fires per-frame — [ArticleDetailView.swift:174](../sabq%20app%20ios/sabq/Screens/ArticleDetailView.swift#L174). Throttle `BehaviorTracker.updateScroll` to every 16ms or every 1% change.
- BehaviorTracker doesn't cancel pending view-event task on new startSession — [BehaviorTracker.swift:55](../sabq%20app%20ios/sabq/Services/BehaviorTracker.swift#L55).
- ArticleHtmlParser regex unbounded — [Services/ArticleHtmlParser.swift](../sabq%20app%20ios/sabq/Services/ArticleHtmlParser.swift). Add max HTML size guard (5MB).

### sec
- BookmarksStore swallows API errors — [BookmarksStore.swift:39](../sabq%20app%20ios/sabq/Stores/BookmarksStore.swift#L39). Local state desyncs from server on 401/500. Revert toggle or queue retry.
- CommentsStore refresh has empty `catch { }` — [CommentsStore.swift:72](../sabq%20app%20ios/sabq/Stores/CommentsStore.swift#L72). Set `loadState` to `.failed`.
- `last_auth_date` in UserDefaults — [AuthStore.swift:28](../sabq%20app%20ios/sabq/Stores/AuthStore.swift#L28). Clock-tampering bypasses 30-day timeout. Move to Keychain.
- EditorialNotifications fire-and-forget logout cleanup — [EditorialNotificationsView.swift:225](../sabq%20app%20ios/sabq/Screens/EditorialNotificationsView.swift#L225). May use revoked token.

### err
- BehaviorTracker silently drops events on flaky network — [BehaviorTracker.swift:67-70](../sabq%20app%20ios/sabq/Services/BehaviorTracker.swift#L67). Queue failed events for retry (max N attempts).
- Logout failure not reported — [AuthStore.swift:249](../sabq%20app%20ios/sabq/Stores/AuthStore.swift#L249). Token may still be valid on server. Surface a warning toast.

### arch
- HomeFeedView calls `APIClient.shared` directly — [HomeFeedView.swift:125-132](../sabq%20app%20ios/sabq/Screens/HomeFeedView.swift#L125). Move to a `HomeDataStore`.
- ArticleDetailView has 30 `@State` properties — [ArticleDetailView.swift:32-61](../sabq%20app%20ios/sabq/Screens/ArticleDetailView.swift#L32). Extract `ArticleDetailViewModel`.
- HomeFeedView ~1400 lines + ArticleDetailView ~1900 lines — god-object views. Extract section sub-views.
- `APIArticle.init(from:)` ~150 lines reconciling 3 endpoint shapes — [APIModels.swift:46-200](../sabq%20app%20ios/sabq/Services/APIModels.swift#L46). Push reconciliation up to APIClient fetch methods.

### code quality
- Duplicate `deleteRaw` signatures (line 214 + line 258 — verify post-helper-extraction this is still real) — [APIClient.swift](../sabq%20app%20ios/sabq/Services/APIClient.swift).
- Gradient overlay pattern duplicated 3× in HomeFeed — [HomeFeedView.swift:182,219,258](../sabq%20app%20ios/sabq/Screens/HomeFeedView.swift#L182). Extract a `headerIconGradient()` helper.

---

## 🔵 SUGGESTION — when time allows

### perf
- Image cache has no LRU eviction — grows ~50MB after 30 articles read. Add age-based TTL.
- `greetingBlock` calendar math reruns per body render — [HomeFeedView.swift:671](../sabq%20app%20ios/sabq/Screens/HomeFeedView.swift#L671). Memoize in `.onAppear`.
- NotificationsSheet inlined upfront — extract to `.sheet` for lazy mount.
- `fetchTodayInsightsRich` not cached — TTL 1h in AuthStore.
- `.navigationDestination(for: Article.self)` ferries large objects. Switch to slug-only nav.

### sec
- No certificate pinning on sabq.org — implement `URLSessionDelegate` cert pin.
- Pasteboard URLs may carry tracking params — strip query before copying.

### code quality
- `URL(string: "...")!` force-unwraps remain (now reduced via URLConstants but some `URL(string:)!` still in views — sweep).
- Magic number `300` for hero height appears 4× in ArticleDetailView — extract `heroImageHeight`.
- `.onAppear` vs `.task` mix across screens — pick one convention.
- Skeleton components have hardcoded sizing — parameterize.
- Bookmark toggle has no debounce — rapid taps queue duplicate POSTs.

### arch
- View → Store → NewsService → APIClient is over-indirected — consider flattening.
- No unified `ErrorBannerView` modifier — error UI is ad-hoc per screen.
- NewsService contains business logic for featured/latest selection — extract `HomepageArticleSelector`.

---

## Already fixed (delete entries here once they ship to TestFlight)

Track recently-shipped items here for ~1 sprint, then remove. Helps future-you not re-flag something that was just fixed.

- **2026-05-17 build 2026051709**: LazyVStack in HomeFeedView; HTML parse cache; URLCache 30/100→10/50 MB; URLConstants enum; removed `sabq_is_authenticated` UserDefaults flag (Keychain-only); profile fetch resilient to transient errors; `ensureSuccess()` helper replacing 5 duplicated status checks (now surfaces 401/403/404/429 as typed APIErrors).
