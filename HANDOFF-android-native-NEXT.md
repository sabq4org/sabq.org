# Sabq Android Native — Next Session Pickup

> One-page resume doc. Replaces all earlier session-end notes.
> Read this top-to-bottom, then dive into the pending task.

---

## Current state (2026-05-19 evening)

- **Branch:** `codex/fix-article-update-validation`
- **HEAD:** `008db2a feat(android): wire Story bubble nav + Opinions "الكل" link + drop Home chips`
- **Pushed:** ✅ origin
- **Build:** ✅ passing (`./gradlew :app:assembleDebug` ~8 s)
- **Installed:** ✅ on Pixel_7 emulator
- **Live API:** ✅ all 12 pillars hit production endpoints successfully

12 pillars shipped today: scaffold → design system → home feed →
article detail → featured carousel + filter + pagination → tabs +
bookmarks + settings → search → auth → loyalty → comments →
opinions → moment-by-moment. Full pillar-by-pillar log in
`memory/sabq-android-native-progress.md`.

---

## Just-shipped Home-feed fixes (commit 008db2a)

| User feedback | Status |
|---|---|
| #4 إزالة التصنيفات من الصفحة الرئيسية | ✅ removed |
| #3 رابط "الكل" في "آراء وأقلام" | ✅ added (routes to OpinionsListScreen) |
| #1 المكون فوق الخبر البارز لا يفتح | ✅ Story bubble taps the wrapped root article via existing ArticleDetail route |

---

## ⏳ THE ONE PENDING TASK — start here next session

**Fix #2: "رحلتك المعرفية اليوم" غير موجود تحت الخبر البارز**

Port iOS `personalJourneyBlock` 1:1 from
`/Users/alialhazmi/sabq/sabq app ios/sabq/Screens/HomeFeedView.swift`
lines **1011-1187**. Place RIGHT AFTER the FeaturedCarousel in
`HomeFeedScreen.kt`. Auth-gated (signed-in users only).

### Composition (4 sub-blocks in order)

1. **journeyHeader** (lines 1032-1066):
   - 40 dp circle, gradient `purple(0.55, 0.36, 0.92) → primaryEnd`,
     `topLeading → bottomTrailing`
   - Centered `sparkles` icon, 16 sp bold, white
   - Title 15 sp heavy rounded: `"<greeting> يا <firstName>"`
     - greeting = device-local hour → "صباح الخير" / "نهارك سعيد" /
       "مساء الخير" / "ليلة سعيدة" (5/12/17/21 cutoffs)
     - Pluck name from backend's "صباح الخير يا علي" if present, else
       AuthStore.currentUser.firstName
   - Subtitle 11 sp medium: `"رحلتك المعرفية في سبق اليوم باختصار"`

2. **LoyaltyStripView** (line 1014) — compact loyalty card.
   Need to port from `Components/LoyaltyStripView.swift` (likely a
   one-row tier-coloured pill showing current tier + lifetime points
   with a small forward chevron). Tap → push LoyaltyAccountScreen.

3. **journeyMetrics** (lines 1107-1131):
   - 4 cells in a horizontal row inside a `paleFill 50% opacity`
     rounded-12 rect, 10 vertical / 4 horizontal padding
   - `metricCell`: value 17 sp heavy rounded + optional unit 11 sp
     semibold tertiary + label 10 sp medium tertiary
   - Cells:
     1. `richInsights.metrics.readingTime` + "د" / label "وقت القراءة"
     2. `richInsights.metrics.completionRate%` / "الإكمال"
     3. `richInsights.metrics.likes` / "إعجابات"
     4. `loyaltySummary.points.lifetimePoints` / "نقاط الولاء"
   - 0.5 dp vertical dividers between cells (height 28)
   - **No per-cell icons or colours** — user explicitly asked to
     stop "كثرة الأيقونات والألوان"

4. **journeyInterests** (lines 1166-1187):
   - Row: "اهتماماتك اليوم:" 11 sp semibold tertiary + horizontal
     scroll of interest chips
   - Each chip: 11 sp semibold, secondaryInk text, paleFill capsule,
     0.5 dp outline 50% opacity

### Container

Whole block sits in:
- 16 dp padding
- `RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)` fill
  `.ultraThinMaterial` → use `SabqTheme.colors.surface.copy(alpha = 0.85f)`
- 0.5 dp outline stroke at 50% opacity

### Backend

- `GET /api/v1/insights/today` → simple insights map (greeting +
  basic stats)
- `GET /api/v1/insights/today/rich` → `APITodayInsights {
  greeting, metrics: { readingTime, completionRate, likes,
  commentsCount }, topInterests: [String] }`

Both are auth-required. Signed-out users see nothing — the entire
block is conditional on `currentUser != null`.

### Files to create / touch

- `data/api/InsightsDtos.kt` — new (`ApiTodayInsights`, etc.)
- `data/api/SabqApi.kt` — add two GET endpoints
- `data/InsightsRepository.kt` — new (`getRichInsights()`)
- `ui/components/LoyaltyStripView.kt` — new (1:1 port from iOS)
- `feature/home/PersonalJourneyBlock.kt` — new
- `feature/home/HomeFeedViewModel.kt` — load + cache rich insights
- `feature/home/HomeFeedScreen.kt` — insert `PersonalJourneyBlock`
  item between FeaturedCarousel and the calendar/audio rows

### Estimate

~250-350 lines of Kotlin/Compose. Half a focused session.

---

## Critical rule (do NOT forget)

User feedback memory: [[feedback-ios-parity-strict]]

> Read the iOS source FILE BY FILE before porting. No "simplified"
> versions. 1:1 on layout, colors, spacing, components, copy.

---

## How to resume

```bash
# Boot the emulator
SDK=~/Library/Android/sdk
"$SDK/emulator/emulator" -avd Pixel_7 -no-snapshot-load -no-boot-anim &
until "$SDK/platform-tools/adb" shell getprop sys.boot_completed 2>/dev/null | grep -q "^1"; do sleep 2; done

# Build + install
cd /Users/alialhazmi/sabq/android-native
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew :app:installDebug --no-configuration-cache
"$SDK/platform-tools/adb" shell am start -n com.sabq.smart.dev/com.sabq.smart.MainActivity
```

In the new session, say:

> "اقرأ HANDOFF-android-native-NEXT.md ثم نفّذ Fix #2 (personalJourneyBlock)
> 1:1 من iOS بعد قراءة HomeFeedView.swift كاملاً."

---

## After Fix #2 — the longer roadmap

Once "رحلتك المعرفية اليوم" lands, the next-pillar queue per the
master progress memory:

1. 44 dp coral radiowaves button in Home header (iOS pattern)
2. LiveCoverage themed tracker (`/api/v1/live`)
3. FCM push + editorial notifications
4. Audio newsletters (ExoPlayer + Android Auto)
5. Google Wallet press card (server work needed)
6. EditorialNotifications screen
7. Calendar / DailyBrief / Trending screens
