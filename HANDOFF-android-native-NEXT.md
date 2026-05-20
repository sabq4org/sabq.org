# Sabq Android Native — Resume Doc

> Single source of truth for what's done + what's pending. Read top to
> bottom before picking the next task.

---

## 0. Project Context

| Item | Value |
|---|---|
| **Android project root** | `/Users/alialhazmi/sabq/android-native/` |
| **iOS source of truth** | `/Users/alialhazmi/sabq/sabq app ios/sabq/` |
| **Branch (working)** | `codex/fix-article-update-validation` (may be stale; main is the source of truth) |
| **main HEAD on remote** | `eb...` (see `git log origin/main -1`) |
| **Build / Hilt / Compose** | Gradle 8.10.2 · Kotlin 2.0.21 K2 · Compose BOM 2024.12.01 · Hilt 2.52 |
| **Production backend** | `https://sabq.org/` (Cloudflare → Vercel → Railway). `api.sabq.org` canonical; `api.sabq.news` retired 2026-05-20. |
| **Latest APK on Desktop** | `~/Desktop/sabq-android-2026-05-20-threeScreens.apk` |

### Resume next session
```bash
SDK=~/Library/Android/sdk
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd /Users/alialhazmi/sabq/android-native

# Boot emulator (only if not running)
"$SDK/emulator/emulator" -avd Pixel_7 -no-snapshot-load -no-boot-anim &
until "$SDK/platform-tools/adb" shell getprop sys.boot_completed 2>/dev/null | grep -q "^1"; do sleep 2; done

# Sync main + build + install + launch
cd /Users/alialhazmi/sabq
git checkout main && git pull origin main --ff-only
cd android-native
./gradlew :app:installDebug --no-configuration-cache
"$SDK/platform-tools/adb" shell am start -n com.sabq.smart.dev/com.sabq.smart.MainActivity
```

---

## 1. ✅ What shipped today (2026-05-20 — 6 PRs to main)

| PR | Title | Notes |
|---|---|---|
| **#6** | Crash fix: BASE_URL + dedup + timeouts | App was crashing on cold launch because BASE_URL had been accidentally set to `http://10.0.2.2:5001/` (emulator-only). Restored to `https://sabq.org/`. Added OkHttp 15s/30s/15s timeouts. Title+day dedup for backend cross-id duplicate articles. |
| **#7** | Server author byline + Smart Summary guard | Backend `/api/v1/authors/by-name` now orders user candidates by `latest_published DESC NULLS LAST` (was picking dormant duplicate for "صحيفة سبق"). Client guard: hide SmartSummary when `excerpt == title`. |
| **#8** | Content Passport (موثَّق pill + sheet) | 2,090 lines Kotlin. Inline emerald pill + 7-card bottom sheet (Trust Header / AI Footprint with SplitBars / People / Source / AI Images / SEO History / Timeline). Live-verified on emulator. |
| **#9** | Inline image natural aspect | Dropped hardcoded `aspectRatio(16f/10f)` on body images. Portrait photos no longer get cropped. Weekly Photos (1:1) + video embeds (16:9) intentionally unchanged. |
| **#10** | Listen pill ExoPlayer streaming | `AudioPlayerController` (Hilt singleton, Media3 1.5) wired into SmartSummaryCard's استماع pill. Streams `/api/articles/<slug>/summary-audio` MP3. Verified ~30s playback live. Unlocks Audio Newsletters + Android Auto later. |
| **#11** | Explore + Opinions + Bookmarks 1:1 | Shared `CompactScreenHeader` + 3 screens brought to iOS parity. Explore now has trending keywords + recent searches DataStore. Opinions gets the rank-badge carousel ترند المقالات + 88×88 row layout. Bookmarks gets the 3 stat tiles. |

Plus from 2026-05-19: personalJourneyBlock, ArticleDetail iOS-strict reorder, ReaderControlsSheet (Aa), AuthorArticles + KeywordArticles screens.

---

## 2. 🎯 Where each major surface stands (vs iOS)

### Home feed — ✅ shipping-grade
- Featured carousel, breaking pill, stories rail, opinions preview, trending preview, calendar card, audio newsletter card, personal-journey block (الموجز اليوم)
- iOS-strict ordering preserved
- Pending: 44 dp coral radiowaves header button (Pillar 13.3 from the original roadmap)

### Article detail — ✅ mostly shipped, ⚠️ 4 follow-ups
- ✅ Hero (300dp) + AI badge overlay
- ✅ Labels row (category + breaking + موثَّق Passport pill)
- ✅ Title + Meta (with opinion gendered byline)
- ✅ Smart Summary Card (sparkles + collapse + **استماع pill plays MP3**)
- ✅ Body (paragraph/heading/image at natural aspect/quote)
- ✅ Action Bar (مشاركة / حفظ / Aa / قراءة + focus mode)
- ✅ Tags chips → KeywordArticles
- ✅ Related articles
- ✅ Comments (composer + list + skeleton/error/empty)
- ✅ Top toolbar (back + like + bookmark + share)
- ✅ Reading progress bar
- ✅ Content Passport sheet
- ✅ Reader Controls bottom sheet (Aa)
- ❌ ImageLightbox (hero + body image tap → fullscreen pinch-zoom)
- ❌ Sentiment pill in labels row (positive/negative/neutral/mixed)
- ❌ Rich HTML — Twitter `<blockquote class="twitter-tweet">` + YouTube `<iframe>` embeds
- ❌ Weekly Photos gallery + Lightbox

### Explore — ✅ shipped today (PR #11)
### Opinions — ✅ shipped today (PR #11)
### Bookmarks — ✅ shipped today (PR #11)
### Auth (Login + Settings) — ✅ shipping-grade
### Loyalty (Account + Card) — ✅ shipping-grade
### Notifications (Editorial bell + detail + preferences) — ✅ shipping-grade
### MomentByMoment (لحظة بلحظة) — ✅ shipping-grade

---

## 3. 📋 Backlog — pick one for the next session

### 🔥 Highest-impact

| # | Task | Estimate | Why it's high impact |
|---|---|---|---|
| **A3** | **Like button wire** | 30min | `LikesStore.kt` already exists from earlier agent work. Just needs heart icon in TopToolbar + count overlay + reactions endpoint `POST /api/articles/<id>/react`. Completes the ArticleDetail top-bar parity. |
| **A4** | **ImageLightbox** | 1h | Pinch-zoom + double-tap + tap-to-dismiss. Wire hero tap + body inline-image tap. iOS source: `Components/ImageLightbox.swift`. Massive visual quality jump for every article. |
| **B5** | **AudioNewslettersView** | 2h | Reuses `AudioPlayerController` from PR #10. Backend already shipping `/api/audio-newsletters`. iOS source: `Screens/AudioNewslettersView.swift`. |
| **B1** | **TrendingView** dedicated screen | 45min | Home shows top-3 only. Dedicated screen would be reachable from the trending preview's "الكل" link (which doesn't exist yet). iOS source: `Screens/TrendingView.swift`. |

### 🌟 Medium-impact

| # | Task | Estimate |
|---|---|---|
| A5 | Sentiment pill in labels row | 30min |
| A8 | Rich HTML — Twitter + YouTube embeds in body | 1.5h |
| A9 | Weekly Photos gallery + Lightbox | 1.5h |
| B3 | DailyBriefView | 1.5h |
| B4 | LiveCoverageView (`/api/v1/live` themed tracker) | 1.5h |
| B2 | CalendarView full month grid | 1h |
| C1 | OnboardingView (first-run interests picker) | 2h |

### ⚙️ Infrastructure (longer)

| # | Task | Estimate |
|---|---|---|
| D1 | FCM device registration + push notification service | 1.5h |
| D2 | Editorial push routing (server-side) | server work |
| D3 | Google Wallet press card | server-blocked |
| D4 | `BehaviorTracker` wiring (`.kt` already in tree) | 30min |
| D5 | `LoyaltyEventQueue` wiring (`.kt` already in tree) | 30min |
| D6 | `SabqAnalytics` port | 30min |

---

## 4. 💡 Recommended next session

Start with **A3 (Like button)** — 30-minute win, completes the toolbar parity. Then **A4 (ImageLightbox)** — biggest visual leap per hour invested. After those two, the Article Detail surface is essentially shipping-grade.

Alternatively if you want a new destination: **B5 (Audio Newsletters)** — reuses the audio infra from PR #10 and is a feature users would visibly notice.

---

## 5. Critical rules (do NOT forget)

1. **Read iOS source FULL before porting** — `[[feedback-ios-parity-strict]]` memory.
2. **`BASE_URL` is `https://sabq.org/`** — never commit a localhost URL.
3. **Bookmarks key is `Article.bookmarkKey` (slug ?: id)**, not `id`.
4. **`MediaSession.setActive(true)` only on first play**, never in `Application.onCreate` (Android Auto breaks the same way CarPlay did pre-fix).
5. **`adb shell input tap` uses device pixels** (1080×2400), not screenshot pixels. Use `uiautomator dump` for exact bounds — or the helper grep `grep -oE 'text="X"[^/]*bounds="\[[0-9,]+\]\[[0-9,]+\]"' /tmp/win.xml`.
6. **Don't merge to main without a PR** — Railway watches main; bad merges deploy to production immediately.
7. **`api.sabq.news` is dead** since 2026-05-20. Don't probe it. `api.sabq.org` is canonical; `sabq.org` proxies via Vercel rewrites.
8. **Backend `/api/v1/authors/by-name` has cross-id duplicates** (legacy CMS). Dedup by `title|YYYY-MM-DD` on the client too — done in `AuthorPage.toDomain`.
9. **Compose nested-grid is forbidden** inside a `LazyColumn`. Use chunked `Row(s)` for 2-col grids when the outer container scrolls (see ExploreScreen + PassportSheet AIImagesCard for the pattern).
10. **iOS uses `.fill` + `minHeight` for inline body images** — Android equivalent is `SubcomposeAsyncImage` + `ContentScale.Fit` + no `aspectRatio`. Don't force-crop portrait shots.

---

## 6. Useful one-liners

```bash
# Live-probe a backend endpoint
curl -sS --max-time 10 "https://sabq.org/api/articles/<slug>/passport" | python3 -m json.tool | head -40

# Find clickable bounds for a tap
adb exec-out uiautomator dump /sdcard/win.xml >/dev/null
adb pull /sdcard/win.xml /tmp/win.xml
grep -oE 'text="X"[^/]*bounds="\[[0-9,]+\]\[[0-9,]+\]"' /tmp/win.xml

# Watch ExoPlayer activity
adb logcat -d | grep -iE "exoplayer|MediaFocusControl|playbackException"

# Latest crash trace
adb logcat -d | grep -B2 "FATAL EXCEPTION" | tail -20
```

---

## 7. Resumption prompts (copy-paste)

For continuing the work:
> "اقرأ HANDOFF-android-native-NEXT.md بالكامل ثم نفّذ المهمة A3 (Like
> button wire — LikesStore موجودة فقط ربط heart في TopToolbar) 1:1 من iOS."

To pick a different task:
> "اقرأ HANDOFF-android-native-NEXT.md. أبغى أشتغل على [A4/B5/...] —
> اقرأ الملفات المعنية من iOS كاملة قبل كتابة Kotlin. اتبع قاعدة 1:1
> الصارمة."

For a parallel agent slice:
> "اقرأ HANDOFF-android-native-NEXT.md. ادّعِ مهمة من Section 3 لا
> تتعارض مع شغل مفتوح. حدّث Section 1 بعد الانتهاء."

---

## 8. File tree (Android source) — quick reference

```
android-native/app/src/main/kotlin/com/sabq/smart/
├── MainActivity.kt
├── SabqApplication.kt
├── data/
│   ├── api/                         # 13 DTO files + SabqApi + NetworkModule
│   ├── audio/AudioPlayerController.kt   # NEW today (PR #10)
│   ├── Article.kt, ArticleMapper.kt, ArticleRepository.kt
│   ├── AuthorPage.kt, BookmarksStore.kt, Comment.kt, CommentsRepository.kt
│   ├── EditorialNotification* (2 files)
│   ├── HomeExtras.kt, InsightsRepository.kt
│   ├── LiveUpdate.kt, LiveRepository.kt
│   ├── Loyalty.kt, LoyaltyRepository.kt, LoyaltyEventQueue.kt
│   ├── Passport.kt, PassportRepository.kt
│   ├── RecentSearchesStore.kt        # NEW today (PR #11)
│   ├── Section.kt, SettingsStore.kt, User.kt
│   ├── BehaviorTracker.kt, LikesStore.kt, FollowedKeywordsStore.kt
│   └── AccountRepository.kt, AuthRepository.kt
├── feature/
│   ├── article/         # ArticleDetailScreen + ViewModel + Comments + ReaderControlsSheet
│   ├── author/          # AuthorArticlesScreen + ViewModel
│   ├── auth/            # LoginScreen + AuthViewModel
│   ├── bookmarks/       # BookmarksScreen + ViewModel
│   ├── explore/         # ExploreScreen + SearchViewModel + RecentSearchesViewModel
│   ├── home/            # HomeFeedScreen + ViewModel + PersonalJourneyBlock
│   ├── keyword/         # KeywordArticlesScreen + ViewModel
│   ├── live/            # MomentByMomentScreen + ViewModel
│   ├── loyalty/         # LoyaltyAccountScreen + ViewModel
│   ├── notifications/   # EditorialNotifications + Detail + Preferences (7 files)
│   ├── opinions/        # OpinionsListScreen + ViewModel
│   ├── passport/        # PassportSheet + ViewModel  (NEW today)
│   └── settings/        # SettingsScreen + 11 sub-screens
├── nav/                 # SabqApp + AppTab
├── ui/
│   ├── components/      # 15 reusable composables (incl. PassportInlineBadge, PassportSplitBar, CompactScreenHeader, LoyaltyStripView…)
│   ├── theme/           # SabqTheme + Colors/Dimens/Shapes/Typography
│   └── showcase/        # DesignShowcaseScreen
└── util/                # HtmlSimpleParser + RelativeDate
```
