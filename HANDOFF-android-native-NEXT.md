# Sabq Android Native — Resume Doc

> Single source of truth for what's done, what's pending, and how to
> pick up tomorrow. Read top to bottom.

---

## 0. Project Context

| Item | Value |
|---|---|
| **Android project root** | `/Users/alialhazmi/sabq/android-native/` |
| **iOS source of truth** | `/Users/alialhazmi/sabq/sabq app ios/sabq/` |
| **Branch (working)** | `codex/fix-article-update-validation` |
| **main HEAD on remote** | `9349a90` (see Section 1) |
| **Build / Hilt / Compose** | Gradle 8.10.2 · Kotlin 2.0.21 K2 · Compose BOM 2024.12.01 · Hilt 2.52 |
| **Production backend** | `https://sabq.org/` (Cloudflare → Vercel → Railway). `api.sabq.org` canonical; `api.sabq.news` retired 2026-05-20. |
| **Latest APK on Desktop** | `~/Desktop/sabq-android-2026-05-20-naturalImageAspect.apk` |

### Resume next session
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
```

---

## 1. ✅ What shipped today (4 PRs merged to main)

| # | Commit | Summary |
|---|---|---|
| **#6** | `c10d5a0` | **Crash fix:** BASE_URL was accidentally `http://10.0.2.2:5001/` (emulator-only). Restored to `https://sabq.org/`. Added OkHttp 15s/30s/15s timeouts. Dropped log level BODY → BASIC. Removed `usesCleartextTraffic` flag. Defensive title+day dedup for backend cross-id article duplicates. |
| **#7** | `c9f5956` | **Server + client:** `/api/v1/authors/by-name` now orders user candidates by `latest_published DESC NULLS LAST` so the active user wins (was picking a dormant duplicate with 690K stale articles for "صحيفة سبق"). Client guard: SmartSummary hides itself when `excerpt == title`. |
| **#8** | `ba91318` | **Content Passport (موثَّق):** 1:1 port of the iOS Content Passport surface — 2,090 lines Kotlin. Inline emerald badge + full bottom sheet with 7 cards (Trust Header / AI Footprint with SplitBars / People / Source / AI Images / SEO History / Timeline). Backend endpoint reused from iOS. |
| **#9** | `9349a90` | **Inline image aspect:** removed hardcoded `aspectRatio(16f / 10f)` on body images. Portrait photos no longer get tops/bottoms chopped. Uses `SubcomposeAsyncImage` + `ContentScale.Fit` + natural ratio. Weekly Photos (1:1) + video embeds (16:9) intentionally unchanged. |

Plus earlier today: **personalJourneyBlock**, full **iOS-strict ArticleDetail reorder**, **ReaderControlsSheet (Aa)**, **AuthorArticles + KeywordArticles screens**, and the Smart Summary guard — already merged via earlier PRs.

---

## 2. 🎯 Where Article Detail stands (vs iOS)

| Surface | Status |
|---|---|
| Hero (300dp + AI badge overlay) | ✅ |
| Labels row (category + breaking + موثَّق) | ✅ Passport done today |
| Title + Meta row | ✅ |
| **Smart Summary Card** (sparkles + 3-line collapse + استماع pill) | ✅ UI; **listen pill is still a stub** |
| Divider + Body (paragraph / heading / image / quote) | ✅ image fix today |
| Action Bar (مشاركة / حفظ / Aa / قراءة) | ✅ Aa sheet shipped; focus mode works |
| Tags chips → KeywordArticles | ✅ |
| Related articles | ✅ |
| Comments (composer + list + skeleton/error/empty) | ✅ |
| Top toolbar (back / bookmark / share / like) | ✅ like UI present |
| Reading progress bar | ✅ |
| Content Passport sheet | ✅ today |
| Reader Controls bottom sheet (Aa) | ✅ |

**Still pending in Article Detail:**
- ❌ Listen pill audio playback (ExoPlayer + `/summary-audio` MP3 streaming)
- ❌ ImageLightbox (tap hero or body image → fullscreen pinch-zoom)
- ❌ Sentiment pill (positive/negative/neutral/mixed)
- ❌ AI Image badge overlay on hero
- ❌ Rich HTML upgrade (Twitter / YouTube embeds inline)
- ❌ Weekly Photos timeline gallery + lightbox

---

## 3. 📋 Backlog — tomorrow's options

### 🔥 Highest-impact (start here)

| # | Task | Estimate | Why it's high impact |
|---|---|---|---|
| **A2** | **Listen pill audio playback** — ExoPlayer + foreground `AudioPlaybackService` + MediaSession; stream `/api/articles/<slug>/summary-audio` MP3 | 1.5h | Unlocks the same ExoPlayer infra for Audio Newsletters + Android Auto later (B5 + D paths) |
| **A4** | **ImageLightbox** — pinch-zoom + double-tap + tap-dismiss; wire hero tap + inline body image tap | 1h | Visual quality leap — every article gets it for free |
| **A3** | **Like button wire** — `LikesStore.kt` already exists from the other agent; need to wire heart in TopToolbar + count + reactions endpoint | 45min | Quick win, completes the toolbar parity |

### 🌟 Medium-impact

| # | Task | Estimate |
|---|---|---|
| A5 | Sentiment pill (positive/negative/neutral/mixed) | 30min |
| A8 (rest) | Rich HTML — Twitter `<blockquote>` + YouTube `<iframe>` parsing | 1.5h |
| A9 | Weekly Photos gallery + Lightbox | 1.5h |
| B1 | TrendingView dedicated screen | 45min |
| B3 | DailyBriefView | 1.5h |
| C1 | OnboardingView (first-run interests picker) | 2h |

### ⚙️ Infrastructure (longer)

| # | Task | Estimate |
|---|---|---|
| D1 | FCM device registration `/api/v1/devices` + push notification service | 1.5h |
| D2 | Editorial pushes routing (server-side fan-out) | server work |
| D3 | Google Wallet press card | server-blocked |
| B5 | AudioNewslettersView (depends on A2 ExoPlayer infra) | 2h |
| B4 | LiveCoverageView themed tracker | 1.5h |
| B2 | CalendarView full month grid | 1h |

---

## 4. 💡 My recommendation for next session

Start with **A2 (Listen pill)**. It:
- Unblocks B5 (Audio Newsletters) AND prepares Android Auto integration
- Touches isolated files (no risk of conflicts with parallel agents)
- Completes one of the most visible "broken/stub" affordances in ArticleDetail
- The same ExoPlayer + MediaSession setup reused 3-4 places later

After A2, do **A4 (ImageLightbox)** — short and improves the article reading experience dramatically.

---

## 5. Critical rules (do NOT forget)

1. **Read iOS source FULL before porting** — `[[feedback-ios-parity-strict]]` memory.
2. **`BASE_URL` is `https://sabq.org/`** — never commit a localhost URL.
3. **Bookmarks key is `Article.bookmarkKey` (slug ?: id)**, not `id`.
4. **`MediaSession.setActive(true)` only on first play**, never in `Application.onCreate` (Android Auto breaks the same way CarPlay did pre-fix).
5. **`adb shell input tap` uses device pixels** (1080×2400), not screenshot pixels. Use `uiautomator dump` for exact bounds.
6. **Don't merge to main without a PR** — Railway watches main; bad merges deploy to production immediately.

---

## 6. Resumption prompt (copy-paste)

> "اقرأ HANDOFF-android-native-NEXT.md ثم نفّذ A2 (Listen pill — ExoPlayer +
> /summary-audio streaming) 1:1 من iOS."

أو لو حاب تختار مهمة ثانية:

> "اقرأ HANDOFF-android-native-NEXT.md. ادّعِ المهمة [A3/A4/A5/...] —
> اقرأ الملفات المعنية من iOS كاملة قبل كتابة Kotlin."
