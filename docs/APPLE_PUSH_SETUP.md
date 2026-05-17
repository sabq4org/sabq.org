# Apple Push Notifications (APNs) — Setup Guide

The iOS app uses native APNs (no Firebase SDK) to deliver editorial
notifications: article scheduled / published / rejected / needs revision.
The plumbing is fully implemented in code; what remains is a one-time
Apple Developer + Railway configuration.

## Database — one-time migration

This release adds two new tables (`editorial_notifications`,
`editorial_notification_prefs`). Run **either** of the following once
against the production database, then never again:

**Option A (preferred): drizzle push**
From the repo's Railway shell or locally with the production
`DATABASE_URL` set:
```bash
npm run db:push
```
Confirm "yes" when prompted to create the two new tables.

**Option B: raw SQL (drop-in if drizzle isn't available)**
```sql
CREATE TABLE IF NOT EXISTS editorial_notifications (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type varchar(30) NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  article_id varchar REFERENCES articles(id) ON DELETE SET NULL,
  article_title text,
  article_slug text,
  deep_link text,
  reviewer_note text,
  delivery_status varchar(20) NOT NULL DEFAULT 'pending',
  delivery_error text,
  read_at timestamp,
  created_at timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_editorial_notifs_user
  ON editorial_notifications (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_editorial_notifs_unread
  ON editorial_notifications (user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_editorial_notifs_article
  ON editorial_notifications (article_id);

CREATE TABLE IF NOT EXISTS editorial_notification_prefs (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  scheduled_enabled boolean NOT NULL DEFAULT true,
  published_enabled boolean NOT NULL DEFAULT true,
  rejected_enabled boolean NOT NULL DEFAULT true,
  revision_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamp NOT NULL DEFAULT NOW()
);
```

## What's already done (no action needed)

- ✅ `Push Notifications` entitlement added to the iOS target
  (`sabq/sabq.entitlements`, `aps-environment = production`).
- ✅ `SabqAppDelegate` (`Services/PushNotifications.swift`) handles
  registration, foreground delivery, taps, and deep-link parsing.
- ✅ `NotificationsStore` (singleton) holds the current APNs token and
  sends it to `POST /api/v1/members/push-token` on login.
- ✅ Backend `apnsService` (HTTP/2 + .p8 JWT) sends the actual pushes.
- ✅ `editorialNotifications` service translates article state changes
  (scheduled / published / rejected / needs_revision) into pushes +
  in-app history rows.
- ✅ Trigger points wired into:
  - `PATCH /api/admin/articles/:id` — fires on every state transition.
  - `POST /api/dashboard/opinion/:id/reject` — opinion-specific reject.
  - `POST /api/dashboard/opinion/:id/publish` — opinion-specific publish.
  - `POST /api/dashboard/opinion/:id/request-revision` — new endpoint
    for the "needs_changes" flow.
- ✅ iOS history + preferences screens in
  `Screens/EditorialNotificationsView.swift`, reachable from
  "حسابي → إشعاراتي التحريرية" (visible only to writers / reporters /
  admins).

## One-time setup — Apple Developer Portal

1. Sign in at <https://developer.apple.com/account>.
2. Navigate to **Certificates, Identifiers & Profiles → Keys**.
3. Click `+` to register a new key.
4. Name: `Sabq APNs Production`. Enable **Apple Push Notifications service (APNs)**.
5. Click **Continue**, then **Register**.
6. **Download the `.p8` file. You only get one chance.** Save it
   securely (1Password vault, etc.) — Apple does not let you re-download.
7. From the same page, copy the **Key ID** (10 alphanumeric characters).
8. From the top right of any Apple Developer page, copy the **Team ID**
   (also 10 characters — usually shown alongside your name).

You now have three values:
- `Key ID` → e.g. `ABCD1EFGHI`
- `Team ID` → e.g. `CBU7MJEC5R` (this team is already used by the build script)
- `.p8 key contents` → multi-line PEM file starting with
  `-----BEGIN PRIVATE KEY-----`

## One-time setup — Railway env vars

Add these four variables to the Railway service that runs the backend
(`api.sabq.org`):

| Variable | Value |
|---|---|
| `APNS_KEY_ID` | The 10-char Key ID from above |
| `APNS_TEAM_ID` | `CBU7MJEC5R` (or your team's ID) |
| `APNS_KEY_P8` | The full `.p8` file contents, including `BEGIN`/`END` lines |
| `APNS_BUNDLE_ID` | `com.sabq.sabqorg` (must match Xcode's `PRODUCT_BUNDLE_IDENTIFIER`) |
| `APNS_ENVIRONMENT` | `production` (TestFlight + App Store both use production) |

> **Important**: the backend `apnsService.ts` reads `APNS_KEY_P8` (not
> `APNS_AUTH_KEY`). If you paste with `\n` escapes the code will restore
> the real newlines before signing — but pasting the raw multi-line PEM
> directly works fine too.

Railway will redeploy automatically once the variables save.

### Verifying the env vars

Once Railway redeploys, the backend logs the configuration status at
startup. Look for:

```
[APNs] Using credentials: keyId=ABCD1EFGHI, teamId=CBU7MJEC5R, bundleId=com.sabq.sabqorg, keyLength=234
✅ APNs service initialized (production, bundle: com.sabq.sabqorg)
```

If you see `⚠️ APNs service not configured`, the env vars aren't being
read — double-check the key names and that the `.p8` body is intact.

## Verifying end-to-end on TestFlight

1. Install the latest TestFlight build (must include `2026051619` or
   later — earlier builds didn't have the push entitlement).
2. Sign in as a writer or reporter (any account with the
   `opinion_author` / `reporter` / `correspondent` / `journalist` /
   admin-like roles).
3. On first login the system permission prompt appears. Tap **Allow**.
4. Verify in the Railway logs that a `/members/push-token` request
   arrives:
   ```
   [Mobile API] /push-token registered (user=<id> provider=apns)
   ```
5. From the dashboard, schedule one of the writer's articles for any
   future time. The author's device should receive a banner within
   ~3 seconds and the in-app
   "حسابي → إشعاراتي التحريرية" screen should show a new row.

If the in-app row appears but the device banner doesn't:
- Open `editorial_notifications` in the DB — `delivery_error` will say
  exactly what APNs returned. Common causes:
  - `BadDeviceToken` — the token was registered against the wrong
    environment. Make sure `APNS_ENVIRONMENT=production` and the build
    is a TestFlight build (not a debug build run from Xcode).
  - `ExpiredProviderToken` — should never happen since the JWT is
    refreshed every 50 minutes; if it does, restart the backend.
  - `TopicDisallowed` — `APNS_BUNDLE_ID` doesn't match the Xcode bundle
    or your APNs key isn't enabled for that app.

## Deep-link scheme

The iOS app handles `sabq://` deep links pushed alongside the
notification:

| URL | Behaviour |
|---|---|
| `sabq://article/<englishSlug>` | Opens the published article inside the app |
| `sabq://draft/<articleId>` | Opens the in-app draft preview (for scheduled / needs_revision events) |
| `sabq://feedback/<articleId>` | Opens the rejection screen with the editor's note + resubmit button |

The backend's `editorialNotifications` service picks the right scheme
per event automatically.

## Per-event delivery toggles

Users control which event types reach their device from
"حسابي → إشعاراتي التحريرية → ⚙️ إعدادات الإشعارات". Toggles are
per-user (stored in `editorial_notification_prefs`) — turning off
"النشر" stops device notifications for publish events but the in-app
history still shows them.

Default for every new user: all four types enabled.

## Where the code lives

| Concern | File |
|---|---|
| APNs sender (HTTP/2 + JWT) | `server/services/apnsService.ts` |
| Editorial-event mapper + history writer | `server/services/editorialNotifications.ts` |
| State-change triggers | `server/routes.ts` (PATCH /api/admin/articles + opinion endpoints) |
| Mobile token + history endpoints | `server/routes/mobileApiRoutes.ts` (search for `push-token` and `notifications`) |
| iOS push registration + deep-link parsing | `sabq app ios/sabq/Services/PushNotifications.swift` |
| iOS history + preferences screens | `sabq app ios/sabq/Screens/EditorialNotificationsView.swift` |
| iOS API client surface | `sabq app ios/sabq/Services/APIClient.swift` (search for `MARK: - Push token`) |
| Entitlement | `sabq app ios/sabq/sabq.entitlements` |
