# Sabq Android Native — Session Handoff (2026-05-19)

Single-day sprint: scaffolded a Kotlin/Compose port of the iOS app
from zero through 12 production-quality pillars. Read top-to-bottom
when resuming. State is precise as of 15:30; verify with the live
app + `git status` before assuming.

---

## TL;DR

Built `/Users/alialhazmi/sabq/android-native/` — a brand-new native
Android app that ships every iOS surface the user reads daily.
**Not a Capacitor wrapper.** Native Compose + live `api.sabq.org`
data + full RTL + IBM Plex Sans Arabic. Verified screen-by-screen
on the Pixel_7 emulator. iOS file paths cited in every port so
future sessions can re-verify visual parity.

The capacitor app at `/Users/alialhazmi/sabq/android/` is **untouched**.
The native build uses `applicationId = com.sabq.smart` with
`applicationIdSuffix = ".dev"` for debug so both can coexist on a
device during the transition.

---

## Pillars done (1 → 12)

| # | Pillar | What ships |
|---|---|---|
| 1 | Project scaffold | Gradle 8.10.2 + Kotlin 2.0.21 + Compose BOM 2024.12.01 + Hilt 2.52 + Retrofit 2.11 + OkHttp 4.12 + Coil 2.7 + Room 2.6 + DataStore 1.1 + FCM + Media3 |
| 2 | Design system | `SabqColors` / `Dimens` / `Shapes` / `Typography` (1:1 from iOS `SabqTheme`) + 14 components (SurfaceCard, Chips, Badges, Buttons, TabBar, FocalCachedAsyncImage, …) |
| 3 | API + Home Feed | `GET /api/v1/articles` → cards rendered with real CDN images, IBM Plex Sans Arabic, RTL |
| 4 | Navigation + ArticleDetail | NavHost + HTML body rendering + hero with focal-point crop |
| 5 | Featured carousel + filter + pagination | `?featured=true` carousel + dynamic chips from `/api/v1/sections` + auto load-more |
| 6 | Tabs + Bookmarks + Settings | 4-tab navigation, persistent BookmarksStore + SettingsStore (dark / accent / font size) |
| 7 | Search | Debounced (350 ms) + `flatMapLatest` cancellation + results pane on Explore |
| 8 | Auth | Email/password Login + Bearer token + `/api/v1/members/profile` + Profile card in Settings |
| 9 | Loyalty | Credit-card `LoyaltyCardView` (1.586 aspect + tier gradient + diagonal stripes + radial halo + tier-tinted shadow) + 5-tier ladder with continuous timeline + stats triplet. **Rewrote 1:1 after first cut was rejected.** |
| 10 | Comments | `CommentRow` with curved thread-line overlay (quadraticBezierTo + RTL-aware X mirror) + `CommentComposer` (multi-line + counter + reply chip + paper-plane button) + signed-in/out branches in ArticleDetail |
| 11 | Opinions | `OpinionsListScreen` (separate `/api/opinion` endpoint) + "مقال رأي" pill + gendered byline ("الكاتب" / "الكاتبة" / "بقلم") branched into ArticleDetail when `article.isOpinion` |
| 12 | Moment-by-moment "لحظة بلحظة" | `MomentByMomentScreen` (1:1 from iOS, 364 lines → ~400 Compose) + pulsing 36 dp coral antenna (1.4 s linear infinite, scale 1→1.6, alpha 0.8→0) + filter chips + cursor pagination + entry in Explore |

Cumulative file count (Kotlin + Compose XML): ~50 files,
~6,500 lines. Build time after the first cache-warm: 6-12 s.

---

## Live verification (Pixel_7 emulator)

Every pillar was screenshotted + tested against the production API at
`https://sabq.org`. Latest endpoint times:

- `GET /api/v1/articles?page=1&limit=20` → 200 in ~1500 ms
- `GET /api/v1/articles?...&featured=true` → 200 in ~2600 ms
- `GET /api/v1/sections` → 200 in ~2600 ms
- `GET /api/v1/search?q=Hilal` → 200 in ~5700 ms (slow but functional)
- `POST /api/v1/auth/login` → 200 in ~1500 ms (Android autofill picked
  up the user's saved credentials in-flight)
- `GET /api/v1/loyalty/me` → 200 in ~290 ms
- `GET /api/v1/articles/<slug>/comments` → 200 in ~250 ms
- `GET /api/opinion?page=1&limit=20` → 200 in ~400 ms
- `GET /api/live/updates?limit=20` → 200 in ~250 ms

---

## Critical design feedback (DO NOT FORGET)

The user explicitly rejected the first cut of Loyalty + Settings as
"غير مقبول — لازم التصميم والتوزيع والتخطيط والألوان تكون مطابقة
للـ iOS مية في المية" (2026-05-19 mid-session). Logged as a permanent
feedback memory: [[feedback-ios-parity-strict]].

**Rule going forward:** read the iOS source FILE BY FILE before
porting any screen. No "simplified" first cuts. No "inspired by". 1:1
on layout, distribution, colors, spacing, components, copy. The user
notices spacing, font sizing, role-chip placement, capsule curves,
gradient stops, badge tints.

---

## What's still pending (priority-ordered)

### Polish (small wins)
1. **44 dp coral radiowaves button in Home header** — iOS HomeFeedView.swift
   line 389-405 places the live entry as a circular icon between the
   dark-mode toggle and notifications bell. Currently only reachable
   from Explore. Promote to Home header.
2. **Logout button placement** — currently a coral capsule in the
   profile card. iOS hides logout behind a confirmation alert; port
   the alert pattern.
3. **Bookmark icon target size** — tap area in CompactArticleRow is
   only ~16 dp; bump to 32 dp with invisible padding to make
   thumb-friendly.
4. **OpinionDetail as separate screen** — currently the opinion
   variant renders inline in ArticleDetailScreen via branches. iOS
   has a separate 788-line `OpinionDetailView.swift`. If the user
   ever asks for richer opinion-only features (related opinions
   carousel, author bio block), refactor to a true second screen.

### New pillars to build
5. **🔴 LiveCoverage themed tracker** (`/api/v1/live`) — different
   from Pillar 12's moment-by-moment. The themed tracker has stats
   grid (total_events, intercepted, by_country) + country filter +
   event timeline. iOS file: `LiveCoverageView.swift` (440 lines).
6. **🔴 FCM push + editorial notifications** — server-side already
   ships `/api/v1/devices` (per memory [[editorial-push-notifications]]).
   Need: Firebase project setup, FCM service worker, device-token
   registration on login, channels for editorial events
   (scheduled / published / rejected / needs_revision / archived),
   notification deep-links into ArticleDetail.
7. **🔴 Audio newsletters** (ExoPlayer + MediaSession + Android Auto) —
   iOS file: `AudioNewslettersView.swift`. Backend: `/api/v1/audio` or
   similar. Critical: don't call `setActive(true)` at launch — only on
   first play, same rule as iOS CarPlay (memory [[sabq-ios-feature-snapshot]]).
8. **🔴 Google Wallet press card** — Android equivalent of Apple Wallet
   pkpass. Needs server work: parallel to `server/lib/passkit/PressPassBuilder.ts`
   → new `GoogleWalletBuilder.ts` that mints a Google Wallet pass
   class + object via Google's Wallet API. iOS file:
   `PressCardActivationView.swift`. Memory: [[sabq-ios-passport]].
9. **🔴 EditorialNotifications screen** — writers'/reporters' inbox.
   iOS file: `EditorialNotificationsView.swift`. Backend already
   tested (memory [[editorial-push-notifications]]).
10. **🔴 Calendar / DailyBrief / Trending screens** — iOS files
    `CalendarView.swift`, `DailyBriefView.swift`, `TrendingView.swift`.

---

## Files to read first (in order) when resuming

1. **`/Users/alialhazmi/sabq/android-native/README.md`** — project shape.
2. **`/Users/alialhazmi/.claude/projects/-Users-alialhazmi-sabq/memory/sabq-android-native-progress.md`** — full pillar-by-pillar status with iOS line references.
3. **`/Users/alialhazmi/.claude/projects/-Users-alialhazmi-sabq/memory/feedback-ios-parity-strict.md`** — the "no simplified versions" rule.
4. **`/Users/alialhazmi/.claude/projects/-Users-alialhazmi-sabq/memory/sabq-ios-feature-snapshot.md`** — iOS spec to port against.

---

## How to resume the emulator

```bash
SDK=~/Library/Android/sdk
"$SDK/emulator/emulator" -avd Pixel_7 -no-snapshot-load -no-boot-anim &
until "$SDK/platform-tools/adb" shell getprop sys.boot_completed 2>/dev/null | grep -q "^1"; do sleep 2; done
cd /Users/alialhazmi/sabq/android-native
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew :app:installDebug --no-configuration-cache
"$SDK/platform-tools/adb" shell am start -n com.sabq.smart.dev/com.sabq.smart.MainActivity
```

If the emulator network is dead, toggle WiFi:
```bash
"$SDK/platform-tools/adb" shell svc wifi enable
"$SDK/platform-tools/adb" shell svc data enable
```

---

## Git state

`android-native/` is untracked. Recommended commit before next session:

```bash
git add android-native/ HANDOFF-android-native-2026-05-19.md
git commit -m "feat(android): scaffold native Kotlin/Compose app — pillars 1-12"
```

**Do NOT push to main without the user's confirmation.** The Capacitor
app at `/android/` is still the published Play Store build.

---

## One-line resume

> "Read sabq-android-native-progress.md + feedback-ios-parity-strict.md,
> then pick a remaining pillar (#1-10 above). For any new screen,
> READ THE iOS FILE IN FULL before writing Kotlin."
