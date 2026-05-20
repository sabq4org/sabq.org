# FCM Setup — one-time, per Firebase project

The code in `data/push/` (DeviceRegistrationManager, SabqMessagingService,
PendingPushDeepLink, PushNavViewModel) is the editorial-push wiring on the
Android side. It compiles and ships with the APK as-is, but **no push
will be received and the token registration will silently fail** until
Firebase is configured for the app. Three steps:

## 1. Create / link the Firebase project

1. Go to the [Firebase Console](https://console.firebase.google.com/) and
   open the existing `sabq-org` project (or create one).
2. Add an **Android app** to the project:
   - Package name: `com.sabq.smart`
   - Optional debug variant: `com.sabq.smart.dev`
3. Download `google-services.json` from the Firebase Console.

## 2. Drop the JSON + apply the Gradle plugin

```bash
# From the repo root:
cp ~/Downloads/google-services.json android-native/app/google-services.json
```

Add the plugin to the Gradle catalog (`android-native/gradle/libs.versions.toml`):

```toml
[versions]
# …existing entries…
google-services = "4.4.2"

[plugins]
# …existing entries…
google-services = { id = "com.google.gms.google-services", version.ref = "google-services" }
```

Apply it in `android-native/app/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
    alias(libs.plugins.google.services)   // ← add this
}
```

And the classpath in the root `android-native/build.gradle.kts` (only
needed if your build doesn't already pull plugins via the catalog —
most setups don't need this line).

## 3. Wire FCM credentials into the backend

The editorial-push backend (`server/jobs/pushWorker.ts`) sends to FCM
HTTP v1. It needs **server credentials** (separate from
`google-services.json`):

1. In the Firebase Console go to **Project settings → Service accounts**.
2. Click **Generate new private key**. Download the JSON.
3. Set the path in Railway env: `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-service-account.json`.
4. Restart the Railway service so the worker picks up the credentials.

## 4. Test the round-trip

After the JSON + plugin are in place:

```bash
cd android-native
./gradlew :app:installDebug
adb shell am start -n com.sabq.smart.dev/com.sabq.smart.MainActivity
# Sign in. The first sign-in triggers DeviceRegistrationManager which
# fetches the FCM token and POSTs to /api/v1/devices/register.
adb logcat | grep -E "DeviceRegistrationMgr|SabqMessagingService"
```

Expected log lines:

```
I/DeviceRegistrationMgr: Device registered (deviceId=…, userId=…)
```

Then trigger an editorial event (e.g. schedule the user's article in the
dashboard). The push should arrive within a few seconds on the
`sabq_editorial` channel, tap deep-links to the article via
`SabqRoutes.ArticleDetail` / `SabqRoutes.NotificationDetail`.

## Until step 2 is done

- The app compiles + runs normally.
- `DeviceRegistrationManager.fetchFcmToken()` swallows the "Default
  FirebaseApp is not initialised" exception and logs a warning. No
  registration POST is sent, no push is received.
- The notifications screen (`/notifications`) keeps working — it pulls
  via the editorial-notifications REST endpoint, not FCM.
