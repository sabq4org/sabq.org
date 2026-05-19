# sabq — Android (Native Kotlin / Jetpack Compose)

Full iOS-parity rewrite of the Sabq Android app, replacing the
Capacitor wrapper at `/android/`. Target: Play Store launch matching
the SwiftUI iOS app's polish (visuals, fonts, sizing, RTL behaviour).

> **Status:** scaffold + design-system foundation only.
> Started 2026-05-19. See "Roadmap" below for what's done / pending.

## What this is (and isn't)

- **Is:** A standalone Android Studio project for the native rewrite.
  Coexists with the existing Capacitor `/android/` build during the
  transition. Eventually replaces it on Play Store.
- **Isn't:** A wrapper around the React/Vite SPA. Zero web views.
  Network goes directly to `https://api.sabq.org/api/v1/*` using a
  Bearer-token (Compose ↔ Retrofit), exactly like iOS.

## Project shape

```
android-native/
├── settings.gradle.kts             # version-catalog roots
├── build.gradle.kts                # root project (plugin aliases only)
├── gradle/libs.versions.toml       # all dependency versions
├── gradle.properties               # JVM flags, K2, KSP2 on
├── gradlew / gradlew.bat           # wrapper scripts (copied from Capacitor)
├── app/
│   ├── build.gradle.kts            # AGP module config
│   ├── proguard-rules.pro
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── kotlin/com/sabq/smart/
│       │   ├── SabqApplication.kt          # @HiltAndroidApp
│       │   ├── MainActivity.kt             # Compose host, forces RTL
│       │   ├── ui/theme/
│       │   │   ├── SabqColors.kt           # ports SabqTheme colors 1:1
│       │   │   ├── SabqDimens.kt           # radii + paddings
│       │   │   ├── SabqShapes.kt
│       │   │   ├── SabqTypography.kt       # IBM Plex Sans Arabic via Downloadable Fonts
│       │   │   └── SabqTheme.kt            # CompositionLocal + M3 wrapper
│       │   └── ui/components/
│       │       ├── SabqHaptics.kt
│       │       ├── SurfaceCard.kt
│       │       ├── Chips.kt                # CategoryChip, StatusChip, DetailLabelPill, BreakingPill
│       │       ├── Badges.kt               # SmallSquareBadge, SquareIconBadge
│       │       └── Buttons.kt              # SmallActionButton, PrimaryCTAButton
│       └── res/
│           ├── values/ (strings, colors, themes, font_certs)
│           ├── values-night/colors.xml
│           ├── drawable/   (launcher placeholders)
│           ├── mipmap-anydpi-v26/  (adaptive icons)
│           └── xml/  (backup + data-extraction rules)
```

## Design parity rules

The iOS app (SwiftUI, 9.0.7) is the source of truth. Every visual token
in this repo was extracted from `sabq app ios/sabq/Components/SabqComponents.swift`
and ported 1:1. **Do not invent values.** When the iOS file changes,
re-port — do not freestyle.

Specifically:
- Colors: `SabqColors.kt` mirrors `SabqTheme.background`/.surface/.ink/…
  with the exact same fractional UIColor components (lines 723-825 of
  the iOS file).
- Radii: 28 / 22 / 14 / 20 dp = card / tile / chip / button.
- Typography: IBM Plex Sans Arabic Regular/Medium/SemiBold/Bold,
  loaded via Compose Downloadable Fonts (Google Fonts provider).
- RTL: `LayoutDirection.Rtl` is forced in `MainActivity` unconditionally.

## Build & run

You need:
- Android Studio Ladybug (2024.2.1) or newer
- JDK 17 (project uses `JavaVersion.VERSION_17`)
- Android SDK 35 installed (`sdkmanager "platforms;android-35"`)

Then either open `android-native/` in Android Studio, or from the CLI:
```bash
cd android-native
./gradlew :app:assembleDebug
./gradlew :app:installDebug    # if a device/emulator is attached
```

First build downloads Gradle 8.10.2 and all dependencies (~5 minutes).
First app launch downloads the IBM Plex Sans Arabic font family from
Google's font provider (~150 KB); the system caches it across all apps
that depend on Plex, so subsequent launches are instant.

## applicationId strategy

The native app uses `applicationId = "com.sabq.smart"`, identical to
the current Capacitor build, so the eventual release replaces it on
Play Store (inheriting reviews, ratings, install base).

While both builds coexist on test devices, debug builds get
`applicationIdSuffix = ".dev"` (→ `com.sabq.smart.dev`). Production
release: drop the suffix.

## Roadmap

### Done (Pillar 1 + most of Pillar 2)
- ✅ Project skeleton (Gradle, Kotlin, AGP, version catalog, JDK 17)
- ✅ Hilt + Coroutines + Retrofit + OkHttp + kotlinx.serialization
- ✅ Coil 2.7 (image loading)
- ✅ Room + DataStore
- ✅ Firebase BOM + FCM (push)
- ✅ Media3 (ExoPlayer + MediaSession for audio newsletters)
- ✅ Compose BOM + Navigation + Material3 + Hilt-nav-compose
- ✅ Downloadable IBM Plex Sans Arabic
- ✅ Forced RTL
- ✅ Design tokens (SabqColors/Dimens/Shapes/Typography)
- ✅ SabqTheme CompositionLocal
- ✅ Haptics
- ✅ Components: SurfaceCard, CategoryChip, StatusChip, DetailLabelPill,
  BreakingPill, SmallSquareBadge, SquareIconBadge, SmallActionButton,
  PrimaryCTAButton

### Pending — design system rest
- 🟡 FocalCachedAsyncImage with focal-point cover math + RTL fix
  (iOS line 401-513). Critical: every article hero/thumbnail depends
  on this to crop correctly. Use Coil's `AsyncImagePainter` +
  `Modifier.drawWithContent` for the offset math.
- 🟡 SabqTabBar — floating capsule with 4 tabs
  (.home / .explore / .bookmarks / .profile). Selected tab animates
  via `Modifier.layoutId` / shared-element transitions
  (Compose's stand-in for SwiftUI's `matchedGeometryEffect`).
- 🟡 SabqSearchBar
- 🟡 FeaturedArticleCard (hero 200 dp, RTL safe with `fixedSize`-style
  width clamping)
- 🟡 CompactArticleRow (classic + spacious 16:10 variants, toggled by
  DataStore "homeCardStyle" pref)
- 🟡 CategoryTile (2-col grid item)
- 🟡 Skeleton + Shimmer + AnimatedAppear modifiers
- 🟡 EmptyStateView + ErrorStateView
- 🟡 ImageLightbox (pinch-zoom + single-tap dismiss)
- 🟡 TabBarVisibility singleton + scroll trackers (translate iOS's
  `onScrollGeometryChange` to Compose's `LazyListState.firstVisibleItemScrollOffset`)
- 🟡 LoyaltyCelebrationBanner + LoyaltyStripView

### Pending — data + screens (Pillars 3-10)
- 🔴 APIClient (Retrofit interface targeting `https://api.sabq.org/api/v1/*`)
- 🔴 APIModels (Article, Category, Author, Comment, etc.)
- 🔴 Stores (ArticlesStore, AuthStore, BookmarksStore, LikesStore,
  CommentsStore, FollowedKeywordsStore) as Hilt ViewModels
- 🔴 26 screens — HomeFeed first, then ArticleDetail, OpinionDetail,
  LoyaltyAccount, Settings, then the rest
- 🔴 Auth flow (Bearer token via `/api/v1/auth/*` — see
  `[[sabq-ios-mobile-auth]]` in repo memory)
- 🔴 FCM device registration under `/api/v1/devices`
- 🔴 Google Wallet press card (Android equivalent of Apple Wallet
  pkpass). Server work: `server/lib/passkit/GoogleWalletBuilder.ts`
  needs to be written (mirrors `PressPassBuilder.ts`).
- 🔴 Behavior analytics port
- 🔴 ExoPlayer + Android Auto media browsing

### Estimate
~2-3 months full-time for the screens + design-system completion;
+ ~1-2 weeks Server work for the Google Wallet press-card builder and
FCM editorial-push parity. See `[[sabq-android-native-decision]]` in
project memory for the breakdown.

## Pitfalls already known (don't repeat)

- Bearer-token routes only — auth-gated mobile endpoints live at
  `/api/v1/*`. Calling `/api/*` (web Passport-cookie routes) will 401.
  See `[[sabq-ios-mobile-auth]]`.
- `image_focal_point` is crucial — naïve centre-crop loses subjects.
  Port the focal-point math from `FocalCachedAsyncImage` in iOS.
- Don't auto-purge Cloudflare on deploy — see
  `[[no-cf-cache-purge-on-deploy]]`.
- Tab bar has **4** tabs, not 5. The 5th-tab Sections moved into the
  Explore tab somewhere between 9.0.1 and 9.0.7.
- Loyalty Arabic tier names + colours must match iOS exactly
  (مبتدئ → سفير سبق). Cadence (1 / 5 days, A/B variants) is
  server-driven.

## Cross-reference

iOS source of truth: `/Users/alialhazmi/sabq/sabq app ios/sabq/`
Feature parity spec: project memory `[[sabq-ios-feature-snapshot]]`
Native decision rationale: project memory `[[sabq-android-native-decision]]`
