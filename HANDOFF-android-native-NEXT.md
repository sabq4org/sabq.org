# Sabq Android Native — Comprehensive Handoff

> **Built for parallel agents.** This doc is the single source of truth
> for what's done, what's pending, and how to pick up an independent
> task without colliding with a teammate.
>
> Read **Section 0 (Context)** + **Section 4 (Conventions)** first.
> Then pick one task from Section 3, claim it (mention it in your
> first user message), and start.

---

## 0. Project Context

| Item | Value |
|---|---|
| **Native Android project root** | `/Users/alialhazmi/sabq/android-native/` |
| **iOS source of truth** | `/Users/alialhazmi/sabq/sabq app ios/sabq/` |
| **Branch (both repos share this checkout)** | `codex/fix-article-update-validation` |
| **Remote HEAD** | `133d95a` (last pushed commit — handoff doc) |
| **Working tree** | 12 modified + 5 new files, all from Android sessions on 2026-05-19/20. Not committed yet. |
| **applicationId** | `com.sabq.smart` (debug suffix `.dev`) |
| **Target SDK** | 35  ·  **Min SDK:** 26 (Android 8.0) |
| **AGP / Kotlin / Gradle / JDK** | 8.7.2 / 2.0.21 (K2) / 8.10.2 / 17 |
| **Stack** | Hilt 2.52 · Compose BOM 2024.12.01 · Retrofit 2.11 · Coil 2.7 · DataStore 1.1.1 · Media3 1.5 · Firebase BOM 33.7 |
| **Production backend** | `https://sabq.org/` (Cloudflare → Vercel rewrites → Railway). `api.sabq.org` is canonical; `api.sabq.news` was retired 2026-05-20. |
| **Emulator used for verification** | Pixel_7 AVD (API 34, 1080×2400, density 420) |
| **Latest APK on Desktop** | `~/Desktop/sabq-android-2026-05-20-readerControlsSheet.apk` |

### Build + run commands
```bash
SDK=~/Library/Android/sdk
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd /Users/alialhazmi/sabq/android-native

# Boot emulator (only if not running)
"$SDK/emulator/emulator" -avd Pixel_7 -no-snapshot-load -no-boot-anim &
until "$SDK/platform-tools/adb" shell getprop sys.boot_completed 2>/dev/null | grep -q "^1"; do sleep 2; done

# Build + install + launch
./gradlew :app:installDebug --no-configuration-cache
"$SDK/platform-tools/adb" shell am start -n com.sabq.smart.dev/com.sabq.smart.MainActivity

# Screenshot
"$SDK/platform-tools/adb" exec-out screencap -p > /tmp/shot.png
```

### Helpful UI introspection (taps need device-px coords, NOT screenshot-px)
```bash
SDK=~/Library/Android/sdk
"$SDK/platform-tools/adb" exec-out uiautomator dump /sdcard/win.xml
"$SDK/platform-tools/adb" pull /sdcard/win.xml /tmp/win.xml
# Then grep for content-desc / text to find bounds="[x1,y1][x2,y2]"
```

---

## 1. ✅ What's Done

### 1.1 Foundation (Pillars 1-2)
- Gradle scaffold, Hilt, Compose, Retrofit, Coil, Room, DataStore, Media3, Firebase
- Manifest + adaptive launcher icon + backup XML excluding auth_prefs
- `MainActivity` forces `LayoutDirection.Rtl` unconditionally
- Design system 1:1 from iOS `SabqComponents.swift`:
  - `ui/theme/SabqColors.kt` — full Light/Dark palette + 5-accent enum + 5 fixed category tints
  - `ui/theme/SabqDimens.kt` — radii (card 28 / tile 22 / chip 14 / button 20)
  - `ui/theme/SabqTypography.kt` — IBM Plex Sans Arabic via Compose Downloadable Fonts
  - `ui/theme/SabqTheme.kt` — CompositionLocal + thin MaterialTheme wrapper

### 1.2 Shared UI components (`ui/components/`)
| File | iOS source line | Status |
|---|---|---|
| SabqHaptics.kt | SabqComponents 200-300 | ✅ |
| SurfaceCard.kt | 829-866 | ✅ |
| Chips.kt (Category / Status / DetailLabelPill / BreakingPill) | 1046-1126 | ✅ |
| Badges.kt (SmallSquareBadge / SquareIconBadge) | 936-978 | ✅ |
| Buttons.kt (SmallActionButton / PrimaryCTAButton) | 982-1042 | ✅ |
| SabqTabBar.kt | 1654-1735 | ✅ |
| SabqSearchBar.kt | 1739-1802 | ✅ |
| FocalCachedAsyncImage.kt | 401-513 | ✅ |
| CompactArticleRow.kt | 1288-1479 | ✅ (classic variant) |
| FeaturedArticleCard.kt | 1130-1284 | ✅ |
| LoyaltyCardView.kt | Components/LoyaltyCardView.swift | ✅ Pillar 9 |
| LoyaltyStripView.kt | Components/LoyaltyStripView.swift | ✅ shipped 2026-05-19 |
| CommentRow.kt | Components/CommentRow.swift | ✅ Pillar 10 |
| CommentComposer.kt | Components/CommentComposer.swift | ✅ Pillar 10 |

### 1.3 Networking + data layer (`data/`, `data/api/`)
- `NetworkModule.kt` — Hilt module: OkHttp + Bearer auth interceptor + Retrofit + kotlinx JSON
- `SabqApi.kt` — Retrofit interface with **~25 endpoints**:
  - Articles list / detail / featured / breaking / trending / related / sections / opinion / search
  - Auth: login / register / logout / profile / forgot-password / reset-password
  - Member: change-password / delete-account / update-profile / avatar
  - Comments: list / post
  - Loyalty: `/me`
  - Insights: `/insights/today` (shipped 2026-05-19)
  - Live updates: `/api/live/updates`
  - Editorial notifications: list / read / read-all / delete / delete-all / preferences GET+PUT
  - Newsletter: subscribe / unsubscribe / status
  - Contact: send message
  - Article submission: `/articles/submit`
  - Stories / calendar / audio-newsletters (HomeExtras)
- `ApiModels.kt` — kotlinx-serializable DTOs with `@JsonNames` tolerance for snake/camel + nested/flat drift
- 11 dedicated DTO files: AuthDtos, AccountDtos, CommentDtos, HomeExtrasDtos, InsightsDtos, LiveDtos, LoyaltyDtos, NotificationDtos
- Domain models: Article (with `aiSummary` + `tags` + `articleUrl` + AI image flags as of today), User, Comment, Section, LoyaltySummary, TodayInsights, etc.
- Repositories: Article · Auth · Comments · EditorialNotifications · HomeExtras · Insights · Live · Loyalty · Account
- Persistent stores: BookmarksStore (DataStore) · SettingsStore (with new lineSpacing + serif keys) · AuthTokenStore

### 1.4 Screens ported
| iOS Screen (Screens/*.swift) | Android route + file | Status |
|---|---|---|
| HomeFeedView | `home` → HomeFeedScreen.kt + PersonalJourneyBlock.kt | ✅ 12 pillars + 4 home fixes + personal-journey block (1011-1187) |
| ArticleDetailView (1992 ll) | `article/{slug}` → ArticleDetailScreen.kt | ✅ iOS-strict order ported 2026-05-19; Aa sheet shipped 2026-05-20 |
| OpinionDetailView | (branch inside ArticleDetail via `Article.isOpinion`) | ✅ |
| OpinionsView | `opinions` → OpinionsListScreen.kt | ✅ Pillar 11 |
| BookmarksView | `bookmarks` → BookmarksScreen.kt | ✅ |
| ExploreView | `explore` → ExploreScreen.kt + SearchViewModel.kt | ✅ Pillar 7 |
| SearchView | inline in ExploreScreen | — |
| SectionsView | `explore` as 2-col grid in ExploreScreen | — |
| SettingsView | `profile` → SettingsScreen.kt | ✅ Pillar 9 redesign |
| LoyaltyAccountView | `loyalty` → LoyaltyAccountScreen.kt | ✅ Pillar 9 |
| MomentByMomentView | `live/updates` → MomentByMomentScreen.kt | ✅ Pillar 12 |
| EditorialNotificationsView + Detail + Preferences | `notifications` + `/preferences` + `/{id}` | ✅ |
| LegalPagesView (Privacy + Terms) | `legal/privacy` + `legal/terms` | ✅ |
| ArticleSubmissionView (Opinion + News) | `submit/opinion` + `submit/news` | ✅ |
| Settings sub-flows | `account/edit` · `change-password` · `forgot-password` · `delete` · `support/contact` · `support/newsletter` | ✅ |
| LoginScreen (sheet equivalent) | `auth/login` | ✅ basic (no Google/Apple, no 2FA, no multi-step signup) |

### 1.5 ArticleDetail today (full iOS-strict order)
1. Hero (300 dp) + AI image badge overlay
2. Labels row UNDER hero (category + breaking)
3. Title (`fontSize+8`, FontWeight.Black, respects serif toggle)
4. Meta row (author · readingTime · date) — opinion branch uses gendered byline
5. **Smart Summary Card** (sparkles + 3-line collapse + "عرض المزيد" + استماع pill **stub**)
6. Divider
7. Body (HtmlSimpleParser: paragraph / heading / image / quote)
8. **Action Bar** — مشاركة / حفظ / Aa / قراءة (focus mode shipped, Aa sheet shipped today)
9. Tags chips (no-op tap — keyword screen pending)
10. Related articles (5 max, from `/api/articles/<slug>/related`)
11. Comments section (composer + list + skeleton/error/empty)
- Overlays: reading-progress bar (top edge brand gradient) + top toolbar (back + bookmark + share)
- Bottom sheet: **ReaderControlsSheet** (Aa) — font 13-22 + lineSpacing 2-12 + serif toggle, DataStore-persistent

### 1.6 Today's commits-in-waiting (12 modified + 5 new files)
```
NEW:
  data/InsightsRepository.kt
  data/api/InsightsDtos.kt
  feature/home/PersonalJourneyBlock.kt
  feature/article/ReaderControlsSheet.kt
  ui/components/LoyaltyStripView.kt

MODIFIED:
  HANDOFF-android-native-NEXT.md
  data/Article.kt                              (+aiSummary, +tags, +articleUrl, +AI image flags)
  data/ArticleMapper.kt                        (propagate new fields)
  data/ArticleRepository.kt                    (+getRelated)
  data/SettingsStore.kt                        (+lineSpacing, +useReaderFont keys)
  data/api/ApiModels.kt                        (+tags, +articleUrl, +AI image fields)
  data/api/SabqApi.kt                          (+insights/today, +articles/{slug}/related)
  feature/article/ArticleDetailScreen.kt       (full iOS-order rewrite + Aa wire)
  feature/article/ArticleDetailViewModel.kt    (loads related side-fetch)
  feature/home/HomeFeedScreen.kt               (insert PersonalJourneyBlock + onLoyaltyClick)
  feature/home/HomeFeedViewModel.kt            (+journeyInsights, +loyaltySummary in state)
  feature/settings/SettingsViewModel.kt        (+setLineSpacing, +setUseReaderFont)
  nav/SabqApp.kt                               (+onLoyaltyClick + onRelatedClick wires)
```

---

## 2. 📊 Compared to iOS — full surface map

### 2.1 iOS Screens — coverage matrix
| iOS file (`Screens/*.swift`) | Android coverage | Gap |
|---|---|---|
| HomeFeedView (1338 ll) | ✅ HomeFeedScreen + PersonalJourneyBlock | Coral 44dp radiowaves header icon glyph still iOS-different (uses `Outlined.Podcasts` instead of `dot.radiowaves.left.and.right`-equivalent) |
| ArticleDetailView (1992 ll) | ✅ ArticleDetailScreen + ReaderControlsSheet | ❌ Listen pill audio (stub) · Like button · ImageLightbox · Sentiment pill · Passport inline badge · WeeklyPhotos gallery · Rich HTML (lists/tweet/video) |
| OpinionDetailView | ✅ via Article.isOpinion branch | — |
| OpinionsView | ✅ OpinionsListScreen | — |
| BookmarksView | ✅ BookmarksScreen | — |
| ExploreView | ✅ ExploreScreen | — |
| SearchView | ✅ inline in ExploreScreen | — |
| SectionsView | ✅ as 2-col grid in ExploreScreen | — |
| SettingsView | ✅ SettingsScreen | — |
| LoyaltyAccountView | ✅ LoyaltyAccountScreen | — |
| MomentByMomentView | ✅ MomentByMomentScreen | — |
| EditorialNotificationsView + Detail + Preferences | ✅ EditorialNotifications* trio | — |
| LegalPagesView | ✅ LegalPagesScreen | — |
| ArticleSubmissionView | ✅ ArticleSubmissionScreen | — |
| **AudioNewslettersView** | ❌ NOT PORTED | Backend exists; Home shows 1 card. Needs ExoPlayer playback + list screen. |
| **CalendarView** (full calendar) | ❌ NOT PORTED | Home shows top-3 upcoming. Needs month grid + day-detail. |
| **DailyBriefView** | ❌ NOT PORTED | Backend endpoint exists. Important morning-read surface. |
| **TrendingView** (dedicated) | ❌ NOT PORTED | Home shows top-3. Needs dedicated list. |
| **LiveCoverageView** (`/api/v1/live` themed tracker) | ❌ NOT PORTED | Different from MomentByMoment. |
| **OnboardingView** (interests picker, first run) | ❌ NOT PORTED | Critical for new-user UX. |
| **PassportSheetView** (content passport — موثَّق) | ❌ NOT PORTED | Trust feature. Needs PassportSplitBar component too. |
| **PressCardActivationView** (Google Wallet) | ❌ NOT PORTED | Needs server work — PressPassBuilder for Google Wallet. |
| **SignUpFlowView** (multi-step) | ⚠️ basic single-screen register in LoginScreen | Multi-step iOS flow not ported. |
| **OmqListView** (deep analyses) | ❌ NOT PORTED | Low priority. |
| **AuthorArticlesView** | ❌ NOT PORTED | Author byline tap target. |
| **KeywordArticlesView** | ❌ NOT PORTED | Tag chips currently no-op. |

### 2.2 iOS Stores (`Stores/*.swift`) — coverage
| iOS Store | Android equivalent |
|---|---|
| ArticlesStore | ✅ ArticleRepository |
| AuthStore | ✅ AuthRepository + AuthViewModel |
| BookmarksStore | ✅ BookmarksStore |
| CommentsStore | ✅ CommentsViewModel |
| **LikesStore** | ❌ NOT PORTED (no like button) |
| **FollowedKeywordsStore** | ❌ NOT PORTED |

### 2.3 iOS Services (`Services/*.swift`) — coverage
| iOS Service | Android equivalent |
|---|---|
| APIClient + APIModels | ✅ SabqApi + ApiModels |
| **ArticleHtmlParser** (600 ll rich TipTap) | ⚠️ HtmlSimpleParser (basic 100 ll — paragraph/heading/img/quote only) |
| **BehaviorTracker** (reading_history seed + scroll %) | ❌ NOT PORTED |
| FontRegistration | ✅ Compose Downloadable Fonts |
| **LoyaltyEventQueue** (batched tier-up events) | ❌ NOT PORTED |
| NewsService | ✅ folded into ArticleRepository |
| **PushNotifications** (APNs equivalent) | ⚠️ Firebase BOM scaffolded, no FCM service file yet |
| **SabqAnalytics** (screen tracking) | ❌ NOT PORTED |
| **SabqAudioSession** (AVAudioSession equivalent) | ⚠️ Media3 scaffolded, no playback yet |
| SabqShareHelper | ✅ basic ACTION_SEND Intent |
| URLConstants | ✅ NetworkModule BASE_URL |
| **TwitterEmbedView** (WKWebView for tweets) | ❌ NOT PORTED |

### 2.4 iOS Components missing
| iOS Component | Notes |
|---|---|
| AIImageBadge | ✅ done in ArticleDetail today |
| **ArticleContentView** (full rich block renderer) | ⚠️ basic BodyBlock (4 types) — iOS handles lists, blockquote-with-quote-glyph, image+caption, gallery, tweet, video |
| **ImageLightbox** (pinch zoom + dismiss) | ❌ NOT PORTED — needed for hero tap + body image tap |
| **LoyaltyCelebrationBanner** (tier-up nudge) | ❌ NOT PORTED |
| LoyaltyCardView | ✅ |
| LoyaltyStripView | ✅ |
| **PassportInlineBadge** ("موثَّق" pill on article hero) | ❌ NOT PORTED |
| **PassportSplitBar** (passport sheet bar) | ❌ NOT PORTED |
| **PressCardView** (Google Wallet card preview) | ❌ NOT PORTED |
| **TwitterEmbedView** | ❌ |
| **WeeklyPhotosLightbox** | ❌ |

---

## 3. 📋 Task Backlog — independent slices

> Each task is sized + scoped so a single agent can pick one and ship
> in one session without conflicting with another agent's work.
> Stage prefixes (A/B/C/D) match the 4-stage plan from 2026-05-20.

### Stage A — Article-detail polish (independent slices)

| # | Task | Files touched | Estimate | Blocked by |
|---|---|---|---|---|
| A1 | ~~ReaderControlsSheet (Aa)~~ | — | — | ✅ DONE 2026-05-20 |
| A2 | **Listen pill audio playback** — ExoPlayer + foreground `AudioPlaybackService` + MediaSession; stream `/api/articles/<slug>/summary-audio`; pill toggles `PlayArrow ↔ Pause` | new: `feature/article/AudioPlaybackService.kt`, `data/AudioPlayerController.kt`; touch ArticleDetailScreen.kt | 1.5h | nothing |
| A3 | **Like button** — heart icon in TopToolbar + count overlay + LikesStore + `/api/articles/<id>/react` GET+POST | new: `data/LikesStore.kt`, `data/api/ReactionsDtos.kt`; touch SabqApi.kt + ArticleDetailScreen.kt | 45min | nothing |
| A4 | **ImageLightbox** — pinch zoom + double-tap + tap-dismiss; wire hero tap + body image tap | new: `ui/components/ImageLightbox.kt`; touch ArticleDetailScreen.kt | 1h | nothing |
| A5 | **Sentiment pill** (positive/negative/neutral/mixed mapping) — appears in labels row when AI insights returns one | touch ArticleDetailScreen.kt + add `/api/articles/<slug>/ai-insights` endpoint + DTO | 30min | nothing |
| A6 | **Passport inline badge + Passport sheet** — green "موثَّق" pill in labels row; tap opens full PassportSheetView (1:1 from `Screens/PassportSheetView.swift` + `Components/PassportSplitBar.swift`) | new: `feature/passport/PassportSheet.kt`, `data/PassportRepository.kt`, DTO file; touch ArticleDetailScreen.kt | 2h | nothing |
| A7 | **KeywordArticlesScreen** — list of articles for a tag/keyword; wire tag chips in ArticleDetail (currently no-op) | new: `feature/keyword/KeywordArticlesScreen.kt`+ViewModel; touch nav route, ArticleDetailScreen onTagClick | 1h | nothing |
| A8 | **Rich HTML parser upgrade** — handle `<ul>/<ol>/<li>` lists, `<blockquote>` with quote glyph, `<img>` with caption, Twitter `<blockquote class="twitter-tweet">`, YouTube iframes | rewrite `util/HtmlSimpleParser.kt` (~200→500 lines); touch BodyBlock in ArticleDetailScreen.kt | 2h | nothing |
| A9 | **WeeklyPhotos gallery + Lightbox** — timeline rail + rank pill + caption + credit + full-screen lightbox with chevron nav (1:1 iOS lines 971-1179, 1816-1992) | new: `feature/article/WeeklyPhotos.kt`; touch ArticleDetailScreen.kt + Article.kt to carry photos | 1.5h | nothing |

### Stage B — New top-level Home destinations

| # | Task | Files | Estimate |
|---|---|---|---|
| B1 | **TrendingView** dedicated screen | new: `feature/trending/TrendingScreen.kt`+VM | 45min |
| B2 | **CalendarView** full calendar | new: `feature/calendar/CalendarScreen.kt`+VM (uses existing CalendarEvent DTO) | 1h |
| B3 | **DailyBriefView** | new: `feature/daily/DailyBriefScreen.kt`+VM+endpoint | 1.5h |
| B4 | **LiveCoverageView** themed tracker (`/api/v1/live`) | new: `feature/live/LiveCoverageScreen.kt`+VM | 1.5h |
| B5 | **AudioNewslettersView** + playback (depends on A2 ExoPlayer service) | new: `feature/audio/AudioNewslettersScreen.kt`+VM | 2h |

### Stage C — New-user UX

| # | Task | Estimate |
|---|---|---|
| C1 | **OnboardingView** — first-run interests picker + quick signup | 2h |
| C2 | **SignUpFlow** multi-step (replace single-screen register) | 1h |

### Stage D — System + native integration

| # | Task | Files | Estimate |
|---|---|---|---|
| D1 | **FCM device registration** — register Android token at `/api/v1/devices` + foreground notification service + tap-to-open routing | new: `data/FcmService.kt`, `data/DeviceRegistration.kt`; manifest update | 1.5h |
| D2 | **Editorial pushes routing** — server-side fan-out to Android tokens | SERVER work (`server/jobs/pushWorker.ts`) | depends on D1 |
| D3 | **Google Wallet press card** | NEW: `feature/press/PressCardScreen.kt` + SERVER `PressPassBuilder` | server-blocked |
| D4 | **BehaviorTracker port** — seeds reading_history + scroll % for home recommendations | new: `data/BehaviorTracker.kt`; wire startSession/endSession in ArticleDetail | 45min |
| D5 | **LoyaltyEventQueue port** + LoyaltyCelebrationBanner | new files | 1h |
| D6 | **SabqAnalytics port** — basic screen tracking | new: `data/SabqAnalytics.kt` | 30min |

---

## 4. Conventions & Rules (don't violate)

1. **Read iOS file IN FULL before porting.** No skimming. The user has
   pinned this rule as `[[feedback-ios-parity-strict]]`. "Simplified"
   first cuts get rejected and re-done.
2. **Match layout, colors, spacing, fonts, copy 1:1.** If a value is
   `14sp` on iOS, it's `14.sp` on Android. iOS `CGFloat 22` = Compose
   `22.dp`.
3. **Do NOT change `BASE_URL`** away from `https://sabq.org/`. CF →
   Vercel → Railway is the live path.
4. **Backend is shared with the iOS app + the web.** Don't add new
   endpoints lightly — check if iOS already calls one. iOS `APIClient.swift`
   lines 285-580 is the canonical surface.
5. **RTL is forced unconditionally** in `MainActivity`. Compose Row
   children lay out right-to-left visually. ActionBar order in code
   matches iOS HStack code-order (first child = visual right in RTL).
6. **Bookmarks key is `Article.bookmarkKey` (slug ?: id)** — not `id`.
   The home + bookmarks sync via this key.
7. **DataStore + Hilt are the persistence pattern.** No SharedPreferences.
   No Room (yet — only the design system left a scaffold for it).
8. **Auth-gated routes 401 silently on signed-out.** The UI hides the
   affected section rather than showing an error.
9. **No `setActive(true)` for MediaSession in `Application.onCreate`.**
   Only on first play. iOS hit this exact bug on CarPlay; Android
   would mirror it for Android Auto.
10. **Coordinates for `adb shell input tap` are DEVICE PIXELS** (1080×2400
    on Pixel_7), not the screenshot-rendered pixels. Use
    `uiautomator dump` to get exact bounds.

### File-tree convention
- `data/` — domain models + repositories + stores
- `data/api/` — Retrofit interface + DTOs + NetworkModule (Hilt)
- `data/auth/` — auth token store
- `feature/<area>/` — screens + ViewModels for that feature
- `nav/` — Compose navigation graph + tab bar route mapping
- `ui/components/` — reusable composables (no business logic)
- `ui/theme/` — colors / typography / dimens / shapes
- `util/` — pure functions, no DI

---

## 5. How to claim a task (parallel agent protocol)

1. Pick a row from Section 3 (or propose a new one).
2. In your first user message back to your human, **state which task # you've claimed**.
   Example: "Claiming A3 (Like button). Files I'll touch: …"
3. Check `git status` before editing — if files you need are
   already-modified, coordinate with the other agent before
   overwriting.
4. Read the iOS source IN FULL (Section 4 rule #1) before writing
   Kotlin.
5. Build green + emulator-verify before claiming the task done.
6. Update Section 1.6 of this doc with what you changed before
   handoff.

---

## 6. Known limitations & gotchas

- **Hero image often comes back null** from `/api/articles/<slug>`. The
  list endpoint at `/api/v1/articles` ships it correctly. Likely the
  detail endpoint uses a different field name we haven't mapped. Mapper
  reads `image_url / imageUrl / image / thumbnailUrl / thumbnail_url`
  — investigate live response if blocking.
- **`/api/articles/<slug>/related`** wired but often returns empty for
  test articles. Section auto-hides when empty.
- **`/api/v1/news/paginated` was retired** — Android already moved to
  `/api/v1/articles`. Don't re-introduce.
- **`/api/v1/articles/featured` returns 404** — use `?featured=true` on
  `/api/v1/articles`.
- **`/api/sections` 404s** — use `/api/v1/sections`.
- **Author field is polymorphic** — string on list, nested object on
  detail. `ArticleMapper.resolveAuthor()` already handles both.
- **`api.sabq.news` is retired** (2026-05-20). Use `api.sabq.org`. The
  `sabq.org` BASE_URL transparently proxies via Vercel rewrites.
- **Action-bar order in RTL:** code order is مشاركة → حفظ → Aa → قراءة.
  Visually renders right-to-left: مشاركة (right) ← حفظ ← Aa ← قراءة (left).
  Don't "fix" this — it's correct iOS parity.
- **Article-detail back-pop from ArticleDetail** uses the existing
  popBackStack. The TopToolbar's back chevron uses
  `Icons.AutoMirrored.Filled.ArrowForward` (auto-mirrors in RTL).
- **Compose Slider RTL behavior:** drag toward visual-left = INCREASE
  value (Material3 honors LayoutDirection). This is correct.

---

## 7. Resumption prompts (copy-paste)

For continuing this work yourself:
> "اقرأ HANDOFF-android-native-NEXT.md بالكامل ثم ابدأ بالمهمة A2
> (Listen pill audio playback) 1:1 من iOS."

For a parallel agent picking up an independent slice:
> "اقرأ HANDOFF-android-native-NEXT.md. ادّعِ المهمة [A3/A4/A5/...] —
> اقرأ الملفات المعنية من iOS كاملة قبل كتابة Kotlin. اتبع قاعدة 1:1
> الصارمة. حدّث القسم 1.6 بعد الانتهاء."

For committing the in-flight tree:
> "commit + push كل اللي في working tree الحالي تحت `android-native/`
> + HANDOFF-android-native-NEXT.md. رسائل commit واضحة لكل مرحلة (Fix
> #2 personalJourney / ArticleDetail iOS-order / ReaderControlsSheet)."
