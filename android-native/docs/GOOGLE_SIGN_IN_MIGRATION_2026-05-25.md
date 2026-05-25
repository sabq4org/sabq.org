# Google Sign-In — Migration to Sabq Production Project (2026-05-25)

## Summary

Migrated Android Google Sign-In from the legacy `sabq-1053` Firebase project
(`673268181122`) to the dedicated `Sabq Production` Google Cloud project
(`664097075837`). iOS already lived in `664097075837` and was unaffected.

After the migration the debug build successfully signs in on the emulator
against the Railway-hosted production backend at `https://sabq.org/`.

## Why

The published 10.0.0–10.0.2 builds embedded a Web client ID from `sabq-1053`
(`673268181122-msfmsjj3l458dpgukll8npsbonsgolkr...`). That project also had
several stale Android clients for `com.sabqorg.sabq` and `com.sabqorg.sabq.dev`
left over from the Capacitor era, plus an active Firebase Android app that
held the upload-key SHA-1 (`33:63:49:10:B6:8B:24:3C:00:27:00:F8:BB:B3:98:4A:F9:2E:E6:F8`).

Result: the package-name + SHA-1 tuple was claimed across multiple OAuth
clients in `sabq-1053`, and the Credential Manager flow returned `[28444]
Developer console is not set up correctly` because the Web client we passed
as `serverClientId` didn't sit in the same project as the (effectively
ambiguous) Android client Google had matched the caller to.

iOS was unaffected because the iOS flow uses the native iOS client ID as the
token audience, not a Web client. The whole Web-client-as-serverClientId song
and dance is Android-specific.

## Final layout (one project per platform now consolidated)

```
Google Cloud project: Sabq Production (664097075837)
├── Sabq iOS               (iOS)              664097075837-8cle...   ← unchanged
├── Sabq Android Debug     (Android)          664097075837-h2ia...   ← com.sabqorg.sabq.dev + debug SHA-1
├── Sabq Android Release   (Android)          NOT CREATED YET        ← see "Outstanding" below
├── Sabq Web               (Web application)  664097075837-63pb...   ← sabq.org Passport.js, has client secret
└── Sabq Mobile Backend    (Web application)  664097075837-tk2a6h... ← Android serverClientId, NO secret, NO redirects
```

Why two Web clients?

`Sabq Web` carries a client secret + redirect URIs because it's wired into
Passport.js on the sabq.org Google sign-in callback. Credential Manager on
Android was rejecting it as `serverClientId` (observed empirically — the
exact same setup produced `Invalid audience` on the server until we swapped
it for a secret-less Web client). The new `Sabq Mobile Backend` client is
created exclusively to be the audience of Android-issued ID tokens and has
no credentials of its own; the backend just calls `verifyIdToken` and reads
the `aud` claim.

## Code changes

### `android-native/app/build.gradle.kts`

`GOOGLE_WEB_CLIENT_ID` BuildConfig field changed from the `sabq-1053` Web
client to the new `Sabq Mobile Backend` Web client.

versionCode bumped 126 → 127, versionName bumped 10.0.2 → 10.0.3.

### `.env.railway.example`

Added templates for `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`,
`APPLE_IOS_BUNDLE_ID` and inline comments explaining why each exists. The
runtime code in `server/routes/v1/oauthMobile.ts` always accepted these
variables as additional `verifyIdToken` audiences — the template was just
out of date.

## Backend (Railway) env vars added

```
GOOGLE_ANDROID_CLIENT_ID = 664097075837-tk2a6h79sovkgu75teukvcb3bv7gfjpr.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID     = 664097075837-8cle4eq9agqnt3em9p9k0ae56dtb99h2.apps.googleusercontent.com  (verify it exists)
```

`GOOGLE_CLIENT_ID` (the Sabq Web one with the client secret) was left
untouched — it's still needed for the Passport.js web flow on sabq.org.

The aud-allowlist in `server/routes/v1/oauthMobile.ts:37-43` is
`[GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID]` — any
of the three matching is sufficient.

## OAuth Consent Screen (Sabq Production)

- **Publishing status**: In production (was Testing, published mid-session
  when we suspected Testing mode was causing `Invalid audience`; turned out
  to be unrelated but the production status is still the right state).
- **User type**: External.
- **Scopes**: `openid`, `email`, `profile` only — non-sensitive, no Google
  verification required.

## Firebase cleanup (sabq-1053 project)

Deleted the upload-key SHA-1 (`33:63:49:10:B6:8B:24:3C:...`) from the
`com.sabqorg.sabq` Firebase Android app in `sabq-1053`. Two SHA-1 entries
were flagged red ("Another project contains an OAuth 2.0 client that uses
this same SHA-1 fingerprint and package name combination") — the first was
the upload key, the second (`c5:ba:60:78:56:bf:af:57:c6:9b:41:76:db:8c:f5:49:db:ef:88:3a`)
appears to be an unrelated cross-project collision and was also flagged.

Firebase Android app itself (`com.sabqorg.sabq` inside `sabq-1053`) was
**not** removed since `sabq-1053` still hosts other Firebase services. We
just stripped the SHA-1 entries to release the (package, SHA-1) tuple for
re-use in Sabq Production.

OAuth Clients in sabq-1053's Credentials page that were deleted earlier in
the session (Capacitor-era leftovers):
- Android client for com.sabqorg.sabq (2021, auto-created)
- Android client for com.sabqorg.sabq (2019, auto-created)
- a handful of obsolete iOS/Android clients for `com.sabq.sabqenglish`,
  `com.sabq.sabqorg`, `sabq3.0 debug`, etc.

## Outstanding work

### 1. `Sabq Android Release` OAuth client (blocking Play Store re-release)

Creation in Sabq Production still fails with `package name and fingerprint
are already in use`. The upload-key SHA-1 (`33:63:49:10:B6:8B:24:3C:...`)
appears to still be held by *another* Firebase / Google Cloud project that
hasn't been identified yet — checking the full Firebase project dropdown is
the next step. Once that lingering record is removed, re-attempt:

```
Application type:  Android
Name:              Sabq Android Release
Package name:      com.sabqorg.sabq
SHA-1:             33:63:49:10:B6:8B:24:3C:00:27:00:F8:BB:B3:98:4A:F9:2E:E6:F8
```

Alternatively — and probably cleaner long-term — skip the upload-key
Android client entirely and only register the **Play App Signing** SHA-1
once the first AAB is uploaded. The upload key never reaches end-user
devices; only the Play App Signing key does. Play App Signing SHA-1 lives
in `Play Console → App signing → App signing key certificate → SHA-1`.

### 2. Google Sign-In testing for release builds

Release sign-in is **not yet verified on a Play-distributed install**. The
APK built off this commit (signed with the upload key) will still fail
`[28444]` until either the upload-key Android client is created (item 1
above) or the build is published via Play and tested with Play App Signing.

Debug (`com.sabqorg.sabq.dev` + `~/.android/debug.keystore`) is fully
verified on the Pixel 7 AVD — abu.mohd.001@gmail.com signed in end-to-end
through the Railway backend.

### 3. Old `Sabq Web` retiring

`Sabq Web` (`664097075837-63pb...`) is still used by sabq.org's Passport.js
flow because it carries the matching client secret. Long-term the web
should probably move to GIS for consistency, but that's a separate piece of
work and there's no urgency.

## How to verify on emulator

```bash
# Install the debug build (uses ~/.android/debug.keystore — SHA-1 already registered)
cd android-native
./gradlew :app:installDebug

# Watch the relevant logcat namespaces
adb logcat -v time \
  Auth:V \
  Auth.Api.Credentials:V \
  CredManProvService:V \
  CredManSysService:V \
  "*:S"
```

A healthy attempt now produces a chain of `AssistedSignIn_flowRunner Flow
step completed` lines followed by the Credential Manager returning the
chosen account. A failure now goes one of two places:

| Symptom                                                  | Likely cause                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `[28444] Developer console is not set up correctly`      | Android OAuth client missing or SHA-1 doesn't match the running build's signing certificate |
| `Invalid audience value: server:client_id:…`             | The serverClientId you passed isn't in the same Google Cloud project as the matched Android client |
| App gets a token but server returns `فشل التحقق من Google` | `GOOGLE_ANDROID_CLIENT_ID` env var on Railway doesn't match the Web client embedded in the APK |
