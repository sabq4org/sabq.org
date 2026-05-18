# Loyalty — iOS Phase 3 Handoff

Phase 1 (backend) and Phase 2 (web) shipped on `main`. This document is the spec
for the Swift work that brings the loyalty system to the sabq iOS app.

## What's already done on the server (you can call this today)

All routes below sit under the existing `/api/v1/*` bearer-auth surface and
use `verifyMemberSession()` — the same auth the rest of the app already
uses. They live in `server/routes/mobileApiRoutes.ts`.

### `GET /api/v1/loyalty/me`

Headers: `Authorization: Bearer <appMemberSession.token>`

Response:
```jsonc
{
  "success": true,
  "points": {
    "userId": "...",
    "totalPoints": 4820,
    "currentRank": "العضو الذهبي",
    "rankLevel": 3,
    "lifetimePoints": 4820,
    "lastActivityAt": "2026-05-18T17:42:00Z"
  },
  "weekPoints": 240,
  "monthPoints": 1120,
  "streakDays": 14
}
```

Use this to render the "حسابي" tab: tier hero card, progress bar, streak chip,
week/month aggregates. The tier table (level → name → color → threshold) is
in `shared/loyalty.ts` — mirror it to a `LoyaltyTier.swift` enum.

### `POST /api/v1/loyalty/events`

Body:
```jsonc
{
  "events": [
    { "action": "READ",      "source": "article:abc", "articleId": "abc", "duration": 145 },
    { "action": "READ_DEEP", "source": "article:abc", "articleId": "abc", "duration": 145 },
    { "action": "LIKE",      "source": "article:abc", "articleId": "abc" },
    { "action": "SHARE",     "source": "article:abc", "articleId": "abc" }
  ]
}
```

Per-event response:
```jsonc
{
  "success": true,
  "results": [
    { "action": "READ", "outcome": "AWARDED", "points": 2 },
    { "action": "READ_DEEP", "outcome": "DAILY_CAP" },
    { "action": "LIKE", "outcome": "AWARDED", "points": 1 },
    { "action": "SHARE", "outcome": "DEDUP" }
  ]
}
```

`outcome` values to handle:
- `AWARDED` — points credited
- `DAILY_CAP` — silent skip (user hit per-day limit)
- `DEDUP` — silent skip (same source within dedup window)
- `INVALID_ACTION` — action name didn't match the table below; log only
- `NEGATIVE_POINTS` — never happens unless the iOS event has corrupt data

The server is idempotent at this layer (dedup + daily cap), so the iOS queue
can retry indefinitely on network failure. **Do not** filter events on-device
to "save" the server work — let the server decide.

## Valid action strings (must match exactly)

| iOS event | string | when to fire |
|---|---|---|
| article opened, ≥5s on screen | `READ` | when `ScenePhase == .active` AND scroll ≥ 40% OR 30s elapsed |
| deep read | `READ_DEEP` | when same article reaches ≥ 80% scroll AND ≥ 120s active |
| ❤️ tapped | `LIKE` | success of /reaction call |
| 🔗 share completed | `SHARE` | UIActivityViewController.completionWithItemsHandler returned success |
| comment posted | `COMMENT` | success of /comments POST |
| push tapped | `NOTIFICATION_OPEN` | userNotificationCenter:didReceive: |
| first foreground today | `DAILY_LOGIN` | app launched and `lastLoyaltyEventDay != today` |

Source format is `article:<id>` for article-bound events, `notification:<id>`
for push opens, or empty for `DAILY_LOGIN`.

## Recommended iOS architecture

```
┌──────────────────────────┐
│  ReadingSession (actor)  │  ← one per article view
│    start(articleId)       │
│    updateScroll(_:)       │
│    end()                  │
└─────────┬────────────────┘
          │ emits LoyaltyEvent
          ▼
┌──────────────────────────┐
│   LoyaltyEventQueue       │  ← single actor in App
│   persisted on disk       │
│   flushes every 30s OR    │
│   on willResignActive     │
└─────────┬────────────────┘
          │ POST /api/v1/loyalty/events  (Bearer)
          ▼
       backend
```

### `ReadingSession` rules
- start on `onAppear` of `ArticleDetailView`.
- track `Date()` for elapsed seconds, only counting time when
  `scenePhase == .active` (pause on `.background`).
- track `scrollPercent` from the inline `ScrollViewReader`.
- on `onDisappear` OR `scenePhase` transition away, emit:
  - `READ` if elapsed ≥ 30s and scroll ≥ 40% (else nothing — the open was an accident)
  - `READ_DEEP` if elapsed ≥ 120s AND scroll ≥ 80% (in addition to READ)

### `LoyaltyEventQueue` rules
- backing store: a single JSON file under the app's documents directory (no
  Core Data needed — peak ~few KB).
- flush triggers: 30-second timer, `applicationWillResignActive`, or queue
  size ≥ 50 events.
- on success: drop the flushed batch from disk.
- on failure: keep the batch, retry on next flush with exponential backoff
  (1s, 2s, 4s, max 30s).
- log results: events with `outcome != "AWARDED"` should be logged locally
  (Console only — these aren't errors).

## What changes in the UI

### Author byline + comment author
Where the author/commenter name renders, query `/api/v1/loyalty/me` for the
viewer's own tier, but for *other users'* tiers the server attaches
`loyaltyRankLevel` to the user object in comment/article responses (the
web already consumes this — Phase 2 commit). Mirror to Swift:

```swift
struct CommentUser: Decodable {
  let id: String
  let firstName: String?
  let lastName: String?
  let loyaltyRankLevel: Int?  // 1..5, nil treated as 1
}
```

Render a small pill in the same color as the tier (use the table in
`LoyaltyTier.swift`). Suppress for tier 1 to avoid clutter.

### New tab: "حسابي / نقاطي"

Three vertical stacks mirroring the web `/dashboard/loyalty` page:
1. Tier hero card (trophy icon in tier color, name, progress bar, points-to-next).
2. Tier ladder (all 5 tiers with a lock icon on the ones the viewer hasn't reached).
3. Recent history (12 latest events, server-supplied via existing `/api/v1/loyalty/history` — same payload as the web; add a paginated endpoint if needed).
4. Rewards catalog (uses the same `/api/v1/loyalty/rewards` shape — currently no partner stock; show "قريباً").

### "رحلتك المعرفية" strip equivalent

The web puts a slim horizontal strip on top of the smart-summary block. iOS
equivalent: a horizontal card on the Home tab with the tier dot, current
points this week, and streak count. Tap → "حسابي" tab.

## Known bug to fix

Memory note from 2026-05-15:
> View tracking analysis surfaced an iOS loyalty points bug (writers don't earn points on iOS).

Root cause: iOS sends view events to `/api/behavior-log` via the cookie
session, but writers' app sessions are bearer-only — they never had a cookie
session, so the points award path in `routes.ts:17515` was a silent no-op
for them. Phase 3 fixes this by moving iOS to `POST /api/v1/loyalty/events`
which authenticates via the bearer token. Once iOS migrates, writers earn
points like every other reader.

## Open questions for the iOS session

1. The `Welcome → Profile → Apple Wallet` flow already renders `rankLevel` —
   verify it now reads the post-Phase-1 rank correctly (no longer always 1).
2. Should `READ` and `READ_DEEP` be sent as two separate events (current
   server contract), or should iOS send one `article_read` and let the server
   classify? Server contract is the simpler answer; iOS just emits both.
3. Streak indicator color: orange when ≥3, gold flame when ≥30, purple when
   ≥100. (mirror web)

## Reference (server-side files for context)

- `shared/loyalty.ts` — tier table, action codes, daily caps, dedup windows
- `server/services/loyalty.ts` — `awardPoints()` helper
- `server/routes/mobileApiRoutes.ts` — `/api/v1/loyalty/me` + `/api/v1/loyalty/events`
- `scripts/migrate-loyalty-tiers.ts` — Phase 1 grandfather migration (dry-run safe)
